"""Mock C1 emitter: publishes 20 plants on miner/{id}/vision at 1 Hz, as vision-twin would.

    python -m mock.c1_vision [--drop 3 --fake 12 --swap 5:neem --unknown 42 --frozen]

Lets miner-core run without the camera; vision-twin ships the real one.
"""

from __future__ import annotations

import argparse
import logging
import time

from minerd.config import Config
from minerd.mqtt import Bus, topic
from simulator.plants import MockVision


def main() -> None:
    p = argparse.ArgumentParser(description=__doc__, formatter_class=argparse.RawDescriptionHelpFormatter)
    p.add_argument("--drop", type=int, action="append", default=[], help="remove this tag 10 s after start")
    p.add_argument("--fake", type=int, action="append", default=[], help="tag is a plastic plant")
    p.add_argument("--swap", action="append", default=[], help="TAG:species, sticker moved to another plant")
    p.add_argument("--unknown", type=int, action="append", default=[], help="unregistered sticker in view")
    p.add_argument("--frozen", action="store_true", help="repeat the same frame hash")
    p.add_argument("--count", type=int, default=0, help="stop after N messages (0 = forever)")
    args = p.parse_args()
    logging.basicConfig(level=logging.INFO, format="%(levelname)s %(name)s: %(message)s")

    cfg = Config.from_env()
    reg = cfg.registration()
    vision = MockVision(reg.miner_id, reg.sticker_ids)
    start = int(time.time() * 1000)
    vision.faults.dropped = {t: start + 10_000 for t in args.drop}
    vision.faults.fake = set(args.fake)
    vision.faults.swapped = {int(s.split(":")[0]): s.split(":")[1] for s in args.swap}
    vision.faults.unknown_tags = set(args.unknown)
    vision.faults.frozen = args.frozen

    bus = Bus(cfg.mqtt_host, cfg.mqtt_port, "mock-c1").start()
    t = topic(reg.miner_id, "vision")
    print(f"publishing C1 to {t} on {cfg.mqtt_host}:{cfg.mqtt_port} (Ctrl+C to stop)")
    n = 0
    try:
        while not args.count or n < args.count:
            bus.publish(t, vision.message(int(time.time() * 1000)))
            n += 1
            time.sleep(1 - time.time() % 1)
    except KeyboardInterrupt:
        pass
    finally:
        bus.stop()


if __name__ == "__main__":
    main()
