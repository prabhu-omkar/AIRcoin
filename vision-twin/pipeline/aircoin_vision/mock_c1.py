"""C1 mock emitter: publishes schema-valid vision events without a camera.

    python -m aircoin_vision.mock_c1                                 # 20 healthy plants -> MQTT
    python -m aircoin_vision.mock_c1 --mqtt -                        # print JSON lines instead
    python -m aircoin_vision.mock_c1 --at 20:remove:7 --at 40:fake:12 --at 90:restore:7
    python -m aircoin_vision.mock_c1 --interactive                   # type commands while it runs
    python -m aircoin_vision.mock_c1 --replay scene.jsonl --loop     # replay a recorded scene
    python -m aircoin_vision.mock_c1 --record scene.jsonl            # save what is emitted

Commands (for --at T:CMD:ARG or typed with --interactive):
    remove TAG    plant taken out: unseen -> missing after 10 s -> removed after 60 s
    restore TAG   put the real plant back
    fake TAG      plastic plant on a valid sticker: low alive_score / NDVI -> suspect
    swap TAG      a different real plant: low plant-match score -> suspect
    unknown TAG   a sticker that is not registered to this miner appears (hide TAG removes it)
    freeze        camera frozen: identical frame_hash every message (unfreeze to resume)
    reset         everything back to normal

Record a real scene once the pipeline publishes C1 (Phase 2) with:
    mosquitto_sub -t 'miner/miner-001/vision' > scene.jsonl
"""

import argparse
import hashlib
import json
import sys
import threading
import time
from pathlib import Path

import numpy as np

from .c1 import Publisher, build_message, plant_entry
from .config import DATA_DIR, load_rig
from .status import StatusMachine

FRAME_W, FRAME_H = 1280, 720


class Scene:
    def __init__(self, rig, seed=1):
        self.rig = rig
        self.rng = np.random.default_rng(seed)
        self.base_area = {p.tag_id: float(self.rng.uniform(250, 650)) for p in rig.plants}
        self.removed, self.fake, self.swapped, self.unknown = set(), set(), set(), set()
        self.frozen_hash = None
        self.frame_no = 0
        self.lock = threading.Lock()
        self.status = StatusMachine(rig.sticker_ids, start_ms=int(time.time() * 1000))
        self._load_enrolment()

    def _load_enrolment(self):
        manifest = DATA_DIR / "enrolment" / self.rig.miner_id / "enrolment.json"
        if manifest.exists():
            for tag, e in json.loads(manifest.read_text()).get("tags", {}).items():
                if e.get("leaf_area_cm2"):
                    self.base_area[int(tag)] = float(e["leaf_area_cm2"])

    def command(self, line):
        parts = line.strip().split()
        if not parts:
            return
        cmd, arg = parts[0].lower(), (int(parts[1]) if len(parts) > 1 else None)
        with self.lock:
            if cmd in ("remove", "restore", "fake", "swap") and arg not in self.rig.sticker_ids:
                print(f"tag {arg} is not one of this miner's stickers", file=sys.stderr)
                return
            if cmd == "remove":
                self.removed.add(arg)
            elif cmd == "restore":
                self.removed.discard(arg); self.fake.discard(arg); self.swapped.discard(arg)
            elif cmd == "fake":
                self.removed.discard(arg); self.swapped.discard(arg); self.fake.add(arg)
            elif cmd == "swap":
                self.removed.discard(arg); self.fake.discard(arg); self.swapped.add(arg)
            elif cmd == "unknown":
                self.unknown.add(arg)
            elif cmd == "hide":
                self.unknown.discard(arg)
            elif cmd == "freeze":
                self.frozen_hash = self._hash()
            elif cmd == "unfreeze":
                self.frozen_hash = None
            elif cmd == "reset":
                self.removed.clear(); self.fake.clear(); self.swapped.clear(); self.unknown.clear()
                self.frozen_hash = None
            else:
                print(f"unknown command {cmd!r}", file=sys.stderr)
                return
        print(f"[mock_c1] {line.strip()}", file=sys.stderr)

    def _hash(self):
        return "0x" + hashlib.sha256(f"{self.rig.miner_id}-frame-{self.frame_no}".encode()).hexdigest()

    def _bbox(self, slot):
        r, c = divmod(slot, self.rig.cols)
        cw, ch = FRAME_W / self.rig.cols, FRAME_H / self.rig.rows
        jitter = self.rng.integers(-2, 3, 2)
        return [int(c * cw + cw * 0.18 + jitter[0]), int(r * ch + ch * 0.05 + jitter[1]), int(cw * 0.64), int(ch * 0.72)]

    def message(self, ts_ms):
        with self.lock:
            self.frame_no += 1
            fhash = self.frozen_hash or self._hash()
            seen = [t for t in self.rig.sticker_ids if t not in self.removed]
            suspect = self.fake | self.swapped
            statuses = self.status.update(ts_ms, seen, suspect)
            n = self.rng.normal
            plants = []
            for p in self.rig.plants:
                t = p.tag_id
                if t in self.removed:
                    plants.append(plant_entry(t, p.species, statuses[t], 0, 0, 0, None, self.status.last_seen(t)))
                    continue
                area = self.base_area[t] * (1 + n(0, 0.01))
                if t in self.fake:
                    conf, alive, ndvi = 0.55 + n(0, 0.04), 0.08 + abs(n(0, 0.03)), 0.02 + n(0, 0.01)
                elif t in self.swapped:
                    conf, alive, ndvi = 0.32 + n(0, 0.05), 0.84 + n(0, 0.03), 0.43 + n(0, 0.02)
                else:
                    conf, alive, ndvi = 0.91 + n(0, 0.02), 0.87 + n(0, 0.02), 0.45 + n(0, 0.02)
                plants.append(plant_entry(t, p.species, statuses[t], conf, area, alive, self._bbox(p.slot),
                                          ts_ms, ndvi))
            return build_message(self.rig.miner_id, ts_ms, fhash, plants, (FRAME_W, FRAME_H),
                                 self.unknown, source="mock")


def replay(path, miner_id, loop):
    lines = [json.loads(line) for line in Path(path).read_text().splitlines() if line.strip()]
    if not lines:
        raise SystemExit(f"{path} is empty")
    while True:
        prev = None
        for msg in lines:
            if prev is not None:
                time.sleep(max(0.0, min(5.0, (msg["ts"] - prev) / 1000)))
            prev = msg["ts"]
            yield {**msg, "ts": int(time.time() * 1000), "miner_id": miner_id or msg["miner_id"], "source": "recorded"}
        if not loop:
            return


def main(argv=None):
    ap = argparse.ArgumentParser(description=__doc__, formatter_class=argparse.RawDescriptionHelpFormatter)
    ap.add_argument("--rig", help="rig.json path")
    ap.add_argument("--mqtt", help="broker URL (default: rig.json mqtt_url); '-' prints to stdout")
    ap.add_argument("--hz", type=float, default=1.0)
    ap.add_argument("--at", action="append", default=[], metavar="T:CMD[:TAG]", help="scheduled command, T in seconds")
    ap.add_argument("--interactive", action="store_true", help="read commands from stdin")
    ap.add_argument("--duration", type=float, help="stop after N seconds")
    ap.add_argument("--replay", help="JSONL file of C1 messages to replay instead of the synthetic scene")
    ap.add_argument("--loop", action="store_true", help="loop the replay")
    ap.add_argument("--record", help="append every emitted message to this JSONL file")
    ap.add_argument("--seed", type=int, default=1)
    args = ap.parse_args(argv)

    rig = load_rig(args.rig)
    url = args.mqtt or rig.mqtt_url
    pub = Publisher(url)
    if url != "-":
        print(f"[mock_c1] publishing miner/{rig.miner_id}/vision to {url} at {args.hz:g} Hz", file=sys.stderr)
    record = open(args.record, "a") if args.record else None
    t0 = time.time()

    def emit(msg):
        pub.publish(msg)
        if record:
            record.write(json.dumps(msg, separators=(",", ":")) + "\n")
            record.flush()

    try:
        if args.replay:
            for msg in replay(args.replay, rig.miner_id, args.loop):
                emit(msg)
                if args.duration and time.time() - t0 >= args.duration:
                    break
            return 0

        scene = Scene(rig, args.seed)
        schedule = []
        for spec in args.at:
            t, _, cmd = spec.partition(":")
            schedule.append((float(t), cmd.replace(":", " ")))
        schedule.sort()
        if args.interactive:
            def read_stdin():
                for line in sys.stdin:
                    scene.command(line)
            threading.Thread(target=read_stdin, daemon=True).start()
            print("[mock_c1] commands: remove|restore|fake|swap|unknown|hide TAG, freeze, unfreeze, reset",
                  file=sys.stderr)

        period = 1.0 / args.hz
        next_tick = time.time()
        while True:
            elapsed = time.time() - t0
            while schedule and schedule[0][0] <= elapsed:
                scene.command(schedule.pop(0)[1])
            emit(scene.message(int(time.time() * 1000)))
            if args.duration and elapsed >= args.duration:
                break
            next_tick += period
            time.sleep(max(0.0, next_tick - time.time()))
    except KeyboardInterrupt:
        pass
    finally:
        pub.close()
        if record:
            record.close()
    return 0


if __name__ == "__main__":
    sys.exit(main())
