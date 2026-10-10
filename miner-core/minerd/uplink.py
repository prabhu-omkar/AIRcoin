"""Durable C3 delivery queue.

Every closed epoch is committed to SQLite before a network request is attempted.  A
background worker retries network/5xx failures and treats validator 4xx responses as
final, so a Wi-Fi outage cannot lose an attestation or stall the 1 Hz miner loop.
"""

from __future__ import annotations

import json
import logging
import sqlite3
import threading
import time
from pathlib import Path
from typing import Callable

import httpx

from . import contracts

log = logging.getLogger(__name__)

StatusHandler = Callable[[dict, dict], None]


class UplinkQueue:
    def __init__(self, db_path: Path, validator_url: str, on_status: StatusHandler | None = None,
                 timeout_s: float = 5.0):
        self.db_path = Path(db_path)
        self.validator_url = validator_url.rstrip("/")
        self.on_status = on_status
        self.timeout_s = timeout_s
        self._stop = threading.Event()
        self._wake = threading.Event()
        self._thread: threading.Thread | None = None
        self._online = False
        self._lock = threading.Lock()
        self._init_db()

    def _connect(self) -> sqlite3.Connection:
        db = sqlite3.connect(self.db_path, timeout=10)
        db.row_factory = sqlite3.Row
        return db

    def _init_db(self) -> None:
        self.db_path.parent.mkdir(parents=True, exist_ok=True)
        with self._connect() as db:
            db.execute("""
                CREATE TABLE IF NOT EXISTS uplink_queue (
                    epoch INTEGER PRIMARY KEY,
                    attestation_json TEXT NOT NULL,
                    epoch_json TEXT NOT NULL,
                    status TEXT NOT NULL DEFAULT 'queued',
                    attempts INTEGER NOT NULL DEFAULT 0,
                    next_attempt_ms INTEGER NOT NULL DEFAULT 0,
                    response_json TEXT,
                    created_ms INTEGER NOT NULL,
                    updated_ms INTEGER NOT NULL
                )
            """)
            # Older validators returned transient chain/RPC failures as HTTP 422.
            # Recover those records automatically now that chain_error uses 5xx.
            db.execute(
                """UPDATE uplink_queue SET status='queued', next_attempt_ms=0
                   WHERE status='rejected' AND response_json LIKE '%\"reason_code\":\"chain_error\"%'"""
            )

    @property
    def online(self) -> bool:
        with self._lock:
            return self._online

    def _set_online(self, value: bool) -> None:
        with self._lock:
            self._online = value

    def enqueue(self, attestation: dict, epoch_doc: dict) -> bool:
        """Persist one epoch. Returns False when that epoch was already queued."""
        now = int(time.time() * 1000)
        with self._connect() as db:
            cur = db.execute(
                """INSERT OR IGNORE INTO uplink_queue
                   (epoch, attestation_json, epoch_json, created_ms, updated_ms)
                   VALUES (?, ?, ?, ?, ?)""",
                (attestation["epoch"], json.dumps(attestation, separators=(",", ":")),
                 json.dumps(epoch_doc, separators=(",", ":")), now, now),
            )
        self._wake.set()
        return cur.rowcount == 1

    def queued_count(self) -> int:
        with self._connect() as db:
            row = db.execute(
                "SELECT count(*) AS n FROM uplink_queue WHERE status IN ('queued','submitted','pending')"
            ).fetchone()
        return int(row["n"])

    def status(self) -> dict:
        return {"online": self.online, "queued_attestations": self.queued_count()}

    def epoch_messages(self, limit: int = 120) -> list[dict]:
        """Rebuild recent C2 epoch messages for replay after an MQTT reconnect."""
        with self._connect() as db:
            rows = db.execute(
                """SELECT epoch_json, attestation_json, status, response_json
                   FROM uplink_queue ORDER BY epoch DESC LIMIT ?""",
                (limit,),
            ).fetchall()
        messages = []
        for row in reversed(rows):
            doc = json.loads(row["epoch_json"])
            att = json.loads(row["attestation_json"])
            status = {
                "status": row["status"],
                "evidence_hash": att["evidence_hash"],
                "amount": att["amount"],
            }
            if row["response_json"]:
                response = json.loads(row["response_json"])
                for key in ("tx_hash", "reason_code", "reason"):
                    if key in response:
                        status[key] = response[key]
            doc["attestation"] = status
            messages.append(doc)
        return messages

    def start(self) -> "UplinkQueue":
        if self._thread and self._thread.is_alive():
            return self
        self._stop.clear()
        self._thread = threading.Thread(target=self._run, name="c3-uplink", daemon=True)
        self._thread.start()
        return self

    def stop(self) -> None:
        self._stop.set()
        self._wake.set()
        if self._thread:
            self._thread.join(timeout=self.timeout_s + 1)

    def _next(self) -> sqlite3.Row | None:
        now = int(time.time() * 1000)
        with self._connect() as db:
            return db.execute(
                """SELECT * FROM uplink_queue
                   WHERE status IN ('queued','submitted','pending') AND next_attempt_ms <= ?
                   ORDER BY epoch LIMIT 1""",
                (now,),
            ).fetchone()

    def _save(self, epoch: int, status: str, response: dict | None, attempts: int,
              retry: bool = False) -> None:
        now = int(time.time() * 1000)
        delay_ms = min(60_000, 1000 * (2 ** min(attempts, 6))) if retry else 0
        with self._connect() as db:
            db.execute(
                """UPDATE uplink_queue SET status=?, attempts=?, next_attempt_ms=?,
                   response_json=?, updated_ms=? WHERE epoch=?""",
                (status, attempts, now + delay_ms,
                 json.dumps(response, separators=(",", ":")) if response else None, now, epoch),
            )

    def _notify(self, row: sqlite3.Row, status: dict) -> None:
        if not self.on_status:
            return
        try:
            self.on_status(json.loads(row["epoch_json"]), status)
        except Exception:
            log.exception("failed to publish C2 status for epoch %s", row["epoch"])

    def flush_once(self) -> bool:
        row = self._next()
        if row is None:
            return False
        att = json.loads(row["attestation_json"])
        attempts = int(row["attempts"]) + 1
        submitted = {"status": "submitted", "evidence_hash": att["evidence_hash"], "amount": att["amount"]}
        self._save(row["epoch"], "submitted", None, attempts)
        self._notify(row, submitted)
        try:
            response = httpx.post(
                f"{self.validator_url}/v1/attestations", json=att, timeout=self.timeout_s
            )
        except (httpx.NetworkError, httpx.TimeoutException) as exc:
            self._set_online(False)
            self._save(row["epoch"], "queued", None, attempts, retry=True)
            log.warning("validator unavailable; epoch %s queued: %s", row["epoch"], exc)
            return True

        self._set_online(True)
        try:
            body = response.json()
        except ValueError:
            body = None
        if response.status_code >= 500 or body is None:
            self._save(row["epoch"], "queued", None, attempts, retry=True)
            log.warning("validator returned HTTP %s; epoch %s queued", response.status_code, row["epoch"])
            return True

        validation_errors = contracts.errors("c3-attestation-response", body)
        if validation_errors:
            self._save(row["epoch"], "queued", None, attempts, retry=True)
            log.error("invalid validator response for epoch %s: %s", row["epoch"], validation_errors)
            return True

        base = {"status": body["status"], "evidence_hash": att["evidence_hash"], "amount": att["amount"]}
        for key in ("tx_hash", "reason_code", "reason"):
            if key in body:
                base[key] = body[key]
        final = body["status"] in ("accepted", "rejected")
        self._save(row["epoch"], body["status"], body, attempts, retry=not final)
        self._notify(row, base)
        return True

    def _run(self) -> None:
        while not self._stop.is_set():
            if not self.flush_once():
                self._wake.wait(1.0)
                self._wake.clear()
