"""Live integration tests: miner-core -> aircoind (AIRcoin's own chain).

Prerequisite: a running chain seeded with the demo accounts, e.g.

    python scripts/demo.py start          # or: cd aircoin-chain && scripts/localnet.sh

Each run registers its own throwaway miner with the demo regulator key, so the tests
don't collide with miners that are already minting.

Run from miner-core with: python -m pytest integration_tests -q
(CHAIN_URL picks another node, default http://127.0.0.1:8700.)
"""

from __future__ import annotations

import json
import os
import secrets
import time
from pathlib import Path

import httpx
import pytest
from eth_account import Account
from eth_account.messages import encode_defunct

from minerd.config import Config
from minerd.mockrun import build_engine, run_epoch
from minerd.signer import Signer

CHAIN = os.environ.get("CHAIN_URL", "http://127.0.0.1:8700").rstrip("/")
ROOT = Path(__file__).resolve().parents[2]
SEED = json.loads((ROOT / "aircoin-chain" / "demo" / "demo-accounts.json").read_text(encoding="utf-8"))


def hex0x(b) -> str:
    h = b.hex() if isinstance(b, (bytes, bytearray)) else str(b)
    return h if h.startswith("0x") else "0x" + h


def send_tx(key: str, tx_type: str, fields: dict) -> dict:
    """Sign and submit a chain transaction the same way the web app does."""
    acct = Account.from_key(key)
    sender = acct.address.lower()
    nonce = httpx.get(f"{CHAIN}/v1/accounts/{sender}", timeout=5).json()["nonce"]
    body = {**fields, "from": sender, "nonce": nonce}
    message = httpx.post(f"{CHAIN}/v1/tx/prepare", json={"type": tx_type, "body": body}, timeout=5).json()["message"]
    sig = hex0x(acct.sign_message(encode_defunct(text=message)).signature)
    r = httpx.post(f"{CHAIN}/v1/tx", json={"type": tx_type, "body": body, "sig": sig}, timeout=30)
    assert r.status_code == 200, r.text
    return r.json()


@pytest.fixture(scope="session")
def miner():
    """A freshly approved miner at miner-001's registered spot, with its own stickers."""
    try:
        status = httpx.get(f"{CHAIN}/v1/status", timeout=2).json()
    except Exception as exc:
        pytest.fail(f"no aircoind gateway at {CHAIN}; run `python scripts/demo.py start` first ({exc})")
    assert status["height"] > 0
    cfg = Config.from_env()
    cfg.miner_id = "miner-001"
    reg = cfg.registration()
    device, owner = Account.create(), Account.create()
    miner_id = f"it-{secrets.token_hex(4)}"
    used = [t for m in httpx.get(f"{CHAIN}/v1/miners", timeout=5).json()["items"] for t in m["sticker_ids"]]
    first = max(used + [999]) + 1
    tags = list(range(first, first + 20))
    send_tx(SEED["admin"]["private_key"], "approve_miner", {
        "miner_id": miner_id, "label": "integration test rig", "device_address": device.address.lower(),
        "owner_wallet": owner.address.lower(), "sticker_ids": tags,
        "location": {"lat": reg.lat, "lon": reg.lon, "geofence_m": reg.geofence_m},
    })
    return {"cfg": cfg, "id": miner_id, "signer": Signer(hex0x(device.key)), "owner": owner.address.lower(), "tags": tags}


def attestation(m: dict, epoch: int, **gps) -> dict:
    """miner-core's real engine output for an epoch, re-tagged for the test miner, unsigned."""
    engine, vision = build_engine(m["cfg"], "rush_hour", seed=epoch % 1000)
    unsigned = run_epoch(engine, vision, epoch).c3_unsigned(engine.cat.calibration_hash)
    unsigned["miner_id"] = m["id"]
    for plant, tag in zip(unsigned["plants"], m["tags"]):
        plant["tag_id"] = tag
    unsigned["gps"].update(gps)
    return unsigned


def closed_epoch(back: int) -> int:
    return int(time.time() * 1000) // 60_000 - back


def air_of(address: str) -> int:
    return int(httpx.get(f"{CHAIN}/v1/accounts/{address}", timeout=5).json()["air"])


def test_valid_attestation_mints_to_owner(miner):
    att = miner["signer"].sign(attestation(miner, closed_epoch(1)))
    before = air_of(miner["owner"])
    r = httpx.post(f"{CHAIN}/v1/attestations", json=att, timeout=30)
    assert r.status_code == 200, r.text
    assert r.json()["status"] == "accepted" and r.json()["amount"] == att["amount"]
    assert air_of(miner["owner"]) - before == int(att["amount"])

    again = httpx.post(f"{CHAIN}/v1/attestations", json=att, timeout=30)
    assert again.status_code == 409 and again.json()["reason_code"] == "epoch_already_minted"


def test_tampered_attestation_is_rejected(miner):
    att = miner["signer"].sign(attestation(miner, closed_epoch(2)))
    att["plants"][0]["air"] = 0.009
    r = httpx.post(f"{CHAIN}/v1/attestations", json=att, timeout=30)
    assert r.status_code == 422 and r.json()["reason_code"] == "evidence_hash_mismatch"


def test_wrong_location_is_rejected_and_recorded(miner):
    reg = miner["cfg"].registration()
    att = miner["signer"].sign(attestation(miner, closed_epoch(3), lat=reg.lat + 0.05))
    r = httpx.post(f"{CHAIN}/v1/attestations", json=att, timeout=30)
    assert r.status_code == 422 and r.json()["reason_code"] == "gps_outside_geofence"
    log = httpx.get(f"{CHAIN}/v1/rejections?miner_id={miner['id']}", timeout=5).json()["items"]
    assert [x["reason_code"] for x in log] == ["gps_outside_geofence"]
