"""Create and replay a deterministic C2 recording when Omkar's twin is unavailable.

Generate the bundled recording:
    python -m mock.recorded_fallback record
Replay it to MQTT:
    python -m mock.recorded_fallback replay --speed 20
"""

from __future__ import annotations

import argparse
import hashlib
import json
import time
from pathlib import Path

from minerd import contracts
from minerd.config import Config, EPOCH_MS
from minerd.mockrun import build_engine
from minerd.mqtt import Bus, topic
from simulator.scenarios import SCENARIOS

DEFAULT_RECORDING = Path(__file__).resolve().parent.parent / "fallback" / "omkar-c2-recording.jsonl"


def make_recording(path: Path = DEFAULT_RECORDING) -> list[dict]:
    cfg = Config.from_env()
    base_epoch = 30_000_000
    events: list[dict] = []
    for scenario_index, scenario in enumerate(SCENARIOS):
        engine, vision = build_engine(cfg, scenario, seed=100 + scenario_index)
        start = (base_epoch + scenario_index) * EPOCH_MS
        last_telemetry = None
        for second in range(60):
            now = start + second * 1000
            engine.ingest_vision(vision.message(now), now)
            telemetry, _ = engine.tick(now)
            telemetry["uplink"] = {"online": True, "queued_attestations": 0}
            last_telemetry = telemetry
            if second % 6 == 0:
                events.append({"delay_ms": 250, "kind": "telemetry", "payload": telemetry})
        result = engine.close_current()
        unsigned = result.c3_unsigned(engine.cat.calibration_hash)
        evidence = "0x" + hashlib.sha256(
            json.dumps(unsigned, sort_keys=True, separators=(",", ":")).encode()
        ).hexdigest()
        tx_hash = "0x" + hashlib.sha256(f"fallback-{scenario}".encode()).hexdigest()
        status = {"status": "accepted", "evidence_hash": evidence,
                  "amount": result.amount, "tx_hash": tx_hash}
        epoch_doc = result.c2_epoch(status)
        assert not contracts.errors("c2-telemetry", last_telemetry)
        assert not contracts.errors("c2-epoch", epoch_doc)
        events.append({"delay_ms": 500, "kind": "epoch", "payload": epoch_doc})
    path.parent.mkdir(parents=True, exist_ok=True)
    path.write_text("".join(json.dumps(e, separators=(",", ":")) + "\n" for e in events), encoding="utf-8")
    return events


def load_recording(path: Path = DEFAULT_RECORDING) -> list[dict]:
    return [json.loads(line) for line in path.read_text(encoding="utf-8").splitlines() if line.strip()]


def replay(path: Path, speed: float) -> None:
    if speed <= 0:
        raise ValueError("speed must be greater than zero")
    cfg = Config.from_env()
    events = load_recording(path)
    bus = Bus(cfg.mqtt_host, cfg.mqtt_port, "recorded-fallback").start()
    try:
        deadline = time.monotonic() + 5
        while not bus.connected and time.monotonic() < deadline:
            time.sleep(0.05)
        if not bus.connected:
            raise SystemExit(f"MQTT is unavailable at {cfg.mqtt_host}:{cfg.mqtt_port}")
        for event in events:
            time.sleep(event["delay_ms"] / 1000 / speed)
            bus.publish(topic(event["payload"]["miner_id"], event["kind"]), event["payload"],
                        qos=1 if event["kind"] == "epoch" else 0,
                        retain=event["kind"] == "epoch")
    finally:
        bus.stop()


def main() -> None:
    parser = argparse.ArgumentParser(description=__doc__)
    sub = parser.add_subparsers(dest="command", required=True)
    record = sub.add_parser("record")
    record.add_argument("--file", type=Path, default=DEFAULT_RECORDING)
    play = sub.add_parser("replay")
    play.add_argument("--file", type=Path, default=DEFAULT_RECORDING)
    play.add_argument("--speed", type=float, default=20)
    args = parser.parse_args()
    if args.command == "record":
        events = make_recording(args.file)
        print(f"recorded {len(events)} C2 events to {args.file}")
    else:
        replay(args.file, args.speed)
        print(f"replayed {args.file}")


if __name__ == "__main__":
    main()
