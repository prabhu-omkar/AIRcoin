from __future__ import annotations

import argparse
import copy
import hashlib
import json
import os
import time
from pathlib import Path

import paho.mqtt.client as mqtt

ROOT = Path(__file__).resolve().parents[2]
TEMPLATE = ROOT / "contracts-schema" / "examples" / "valid" / "c1-vision-event.json"


def make_message(seq: int, dropped: set[int], fake: set[int], swapped: set[int], unknown: list[int], frozen: bool = False) -> dict:
    data = json.loads(TEMPLATE.read_text(encoding="utf-8"))
    now = int(time.time() * 1000)
    data.update(ts=now, source="mock", unknown_tag_ids=unknown)
    entropy = b"frozen" if frozen else f"mock-frame:{now}:{seq}".encode()
    data["frame_hash"] = "0x" + hashlib.sha256(entropy).hexdigest()
    for plant in data["plants"]:
        tag = plant["tag_id"]
        plant["last_seen_ts"] = now
        plant["status"] = "present"
        plant["species_conf"] = 0.92
        plant["alive_score"] = 0.86
        plant["ndvi"] = 0.41
        plant["leaf_area_cm2"] = round(300 + tag * 7 + (seq % 5) * 0.4, 1)
        row, col = divmod(tag, 5)
        plant["bbox"] = [40 + col * 250, 30 + row * 170, 180, 150]
        if tag in dropped:
            plant.update(status="missing", leaf_area_cm2=0.0, bbox=None, species_conf=0.0, alive_score=0.0, ndvi=0.0, last_seen_ts=now - 15_000)
        elif tag in fake:
            plant.update(status="suspect", alive_score=0.12, ndvi=0.01)
        elif tag in swapped:
            plant.update(status="suspect", species_conf=0.22)
    return data


def main() -> None:
    parser = argparse.ArgumentParser(description="AIRcoin C1 mock emitter")
    parser.add_argument("--drop", type=int, action="append", default=[])
    parser.add_argument("--fake", type=int, action="append", default=[])
    parser.add_argument("--swap", type=int, action="append", default=[])
    parser.add_argument("--unknown", type=int, action="append", default=[])
    parser.add_argument("--frozen", action="store_true")
    parser.add_argument("--count", type=int, default=0)
    parser.add_argument("--record", type=Path, help="also write JSON Lines recording")
    parser.add_argument("--dry-run", action="store_true", help="print without connecting to MQTT")
    parser.add_argument("--mqtt-host", default=os.getenv("MQTT_HOST", "localhost"))
    parser.add_argument("--mqtt-port", type=int, default=int(os.getenv("MQTT_PORT", "1883")))
    parser.add_argument("--miner-id", default=os.getenv("MINER_ID", "miner-001"))
    args = parser.parse_args()
    client = None
    if not args.dry_run:
        client = mqtt.Client(mqtt.CallbackAPIVersion.VERSION2, client_id="vision-twin-mock")
        client.connect(args.mqtt_host, args.mqtt_port)
        client.loop_start()
    topic = f"miner/{args.miner_id}/vision"
    output = args.record.open("w", encoding="utf-8") if args.record else None
    seq = 0
    try:
        while not args.count or seq < args.count:
            message = make_message(seq, set(args.drop), set(args.fake), set(args.swap), args.unknown, args.frozen)
            message["miner_id"] = args.miner_id
            payload = json.dumps(message, separators=(",", ":"))
            if client:
                client.publish(topic, payload, qos=0)
            if output:
                output.write(payload + "\n")
                output.flush()
            print(payload)
            seq += 1
            if not args.count or seq < args.count:
                time.sleep(max(0.0, 1 - time.time() % 1))
    except KeyboardInterrupt:
        pass
    finally:
        if output:
            output.close()
        if client:
            client.loop_stop()
            client.disconnect()


if __name__ == "__main__":
    main()

