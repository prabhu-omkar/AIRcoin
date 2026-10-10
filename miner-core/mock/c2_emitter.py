"""Mock C2 emitter for vision-twin and chain-market: real-shaped telemetry and epoch messages.

    python -m mock.c2_emitter [--scenario rush_hour] [--cycle 3] [--reject-every 5] [--drop 7 --fake 12]

Runs the real miner pipeline in real time on simulated sensors and mock plants, and publishes
  miner/{id}/telemetry  every second (QoS 0)
  miner/{id}/epoch      when an epoch closes (QoS 1, retained), re-published as the attestation
                        moves pending -> submitted -> accepted (or rejected)
The validator is NOT called: the attestation is signed, but the tx_hash is made up.
"""

from __future__ import annotations

import argparse
import logging
import os
import threading
import time

from minerd.config import Config
from minerd.mockrun import build_engine
from minerd.mqtt import Bus, topic
from minerd.signer import Signer
from simulator.scenarios import SCENARIOS

log = logging.getLogger("mock.c2")


def main() -> None:
    p = argparse.ArgumentParser(description=__doc__, formatter_class=argparse.RawDescriptionHelpFormatter)
    p.add_argument("--scenario", default="clean_morning", choices=sorted(SCENARIOS))
    p.add_argument("--cycle", type=int, default=0, help="switch to the next scenario every N epochs")
    p.add_argument("--reject-every", type=int, default=0, help="mark every Nth epoch rejected")
    p.add_argument("--drop", type=int, action="append", default=[], help="remove this tag after 30 s")
    p.add_argument("--fake", type=int, action="append", default=[], help="tag is a plastic plant")
    p.add_argument("--duration", type=int, default=0, help="stop after N seconds (0 = forever)")
    args = p.parse_args()
    logging.basicConfig(level=logging.INFO, format="%(levelname)s %(name)s: %(message)s")

    cfg = Config.from_env()
    engine, vision = build_engine(cfg, args.scenario)
    signer = Signer(cfg.device_key())
    start = int(time.time() * 1000)
    vision.faults.dropped = {t: start + 30_000 for t in args.drop}
    vision.faults.fake = set(args.fake)

    bus = Bus(cfg.mqtt_host, cfg.mqtt_port, "mock-c2").start()
    t_tel, t_epoch = topic(engine.miner_id, "telemetry"), topic(engine.miner_id, "epoch")
    print(f"publishing C2 to {t_tel} and {t_epoch} on {cfg.mqtt_host}:{cfg.mqtt_port} (Ctrl+C to stop)")
    scenarios = list(SCENARIOS)
    closed_count = 0

    def lifecycle(result, att, reject: bool) -> None:
        base = {"evidence_hash": att["evidence_hash"], "amount": att["amount"]}
        for status in ("pending", "submitted"):
            bus.publish(t_epoch, result.c2_epoch({"status": status, **base}), qos=1, retain=True)
            time.sleep(1.5)
        if reject:
            final = {"status": "rejected", **base, "reason_code": "gps_outside_geofence",
                     "reason": "mock rejection (c2_emitter --reject-every)"}
        else:
            final = {"status": "accepted", **base, "tx_hash": "0x" + os.urandom(32).hex()}
        bus.publish(t_epoch, result.c2_epoch(final), qos=1, retain=True)
        log.info("epoch %s %s: %s AIR", result.epoch, final["status"], result.total_air)

    try:
        while not args.duration or time.time() * 1000 - start < args.duration * 1000:
            now = int(time.time() * 1000)
            engine.ingest_vision(vision.message(now), now)
            telemetry, closed = engine.tick(now)
            telemetry["uplink"] = {"online": True, "queued_attestations": 0}
            bus.publish(t_tel, telemetry)
            if closed is not None:
                closed_count += 1
                att = signer.sign(closed.c3_unsigned(engine.cat.calibration_hash))
                reject = bool(args.reject_every) and closed_count % args.reject_every == 0
                threading.Thread(target=lifecycle, args=(closed, att, reject), daemon=True).start()
                if args.cycle and closed_count % args.cycle == 0:
                    nxt = scenarios[(scenarios.index(engine.sensors.scenario) + 1) % len(scenarios)]
                    engine.sensors.set_scenario(nxt)
                    log.info("scenario -> %s", nxt)
            time.sleep(1 - time.time() % 1)
    except KeyboardInterrupt:
        pass
    finally:
        time.sleep(0.5)
        bus.stop()


if __name__ == "__main__":
    main()
