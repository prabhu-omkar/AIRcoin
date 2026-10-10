"""Phase 2 vision runner: camera -> C1 vision events at >= 1 Hz, plus live streams for the owner dashboard.

    python -m aircoin_vision.run picam --serve 8080                    # Pi: NoIR + blue gel, NDVI liveness
    python -m aircoin_vision.run usb:0 --liveness rgb --serve 8080     # laptop + USB camera fallback
    python -m aircoin_vision.run rig.jpg --loop --mqtt -               # a still or a recording; print C1 lines

Each inference cycle: detect stickers -> per plant: match to enrolment (swap), leaf area, NDVI / liveness (fake)
-> status machine (present / missing 10 s / removed 60 s / suspect 3 s) -> C1 on MQTT miner/{id}/vision.
Enrol first (`python -m aircoin_vision.enrol ...`) or plant match is skipped.
"""

import argparse
import sys
import time

import cv2
import numpy as np

from .c1 import Publisher, build_message, frame_hash, plant_entry
from .capture import ImageSource, OpenCVSource, PiCamera, open_source
from .config import load_rig
from .markers import MarkerDetector
from .status import StatusMachine
from .stream import StreamServer
from .vision import PlantAnalyzer, ndvi_colour

# BGR versions of the UI palette
COLOURS = {"present": (126, 209, 166), "suspect": (79, 106, 223), "missing": (65, 164, 217), "removed": (116, 127, 122)}


def source_label(source):
    if isinstance(source, PiCamera):
        return "pi_camera"
    if isinstance(source, OpenCVSource) and isinstance(source.spec, int):
        return "laptop_camera"
    return "recorded"


class VisionRunner:
    """One inference step per call; keeps per-plant state between calls."""

    def __init__(self, rig, analyzer, start_ms, source="pi_camera"):
        self.rig = rig
        self.analyzer = analyzer
        self.source = source
        self.detector = MarkerDetector(rig.aruco_dictionary)
        self.status = StatusMachine(rig.sticker_ids, start_ms)
        self.bbox = {}  # tag -> last bbox seen
        self.last = None  # (detections, readings, statuses) for drawing

    def step(self, ts_ms, frame):
        detections = self.detector.detect(frame)
        registered = set(self.rig.sticker_ids)
        readings = self.analyzer.analyse(frame, detections)
        for tag, r in readings.items():
            self.bbox[tag] = r.bbox
        statuses = self.status.update(ts_ms, readings.keys(), {t for t, r in readings.items() if r.suspect})
        a = self.analyzer
        plants = []
        for p in self.rig.plants:
            tag, st, r = p.tag_id, statuses[p.tag_id], readings.get(p.tag_id)
            lost = st in ("missing", "removed")
            plants.append(plant_entry(
                tag, p.species, st,
                species_conf=r.species_conf if r else a.last(tag, "species_conf", 0.0),
                leaf_area_cm2=0.0 if lost else (r.leaf_area_cm2 if r else a.last(tag, "leaf_area_cm2", 0.0)),
                alive_score=r.alive_score if r else a.last(tag, "alive_score", 0.0),
                bbox=None if lost else (r.bbox if r else self.bbox.get(tag)),
                last_seen_ts=self.status.last_seen(tag),
                ndvi=(r.ndvi if r else a.last(tag, "ndvi", None)) if a.liveness == "ndvi" else None,
            ))
        unknown = [d.tag_id for d in detections if d.tag_id not in registered]
        msg = build_message(self.rig.miner_id, ts_ms, frame_hash(frame), plants,
                            frame_size=(frame.shape[1], frame.shape[0]), unknown_tag_ids=unknown, source=self.source)
        self.last = (detections, readings, statuses, unknown)
        return msg

    def draw(self, frame, hz=None):
        """Annotated copy of `frame` with the last inference's results."""
        out = frame.copy()
        if self.last is None:
            return out
        detections, readings, statuses, unknown = self.last
        scale = max(0.6, out.shape[1] / 1500)
        th = max(1, int(round(2 * scale)))
        font = cv2.FONT_HERSHEY_SIMPLEX
        for d in detections:
            pts = d.corners.astype(np.int32).reshape(-1, 1, 2)
            cv2.polylines(out, [pts], True, (126, 209, 166) if d.tag_id not in unknown else (0, 140, 255), th)
            c = d.corners[0].astype(int)
            cv2.circle(out, (int(c[0]), int(c[1])), th + 1, (79, 106, 223), -1)
        for p in self.rig.plants:
            st = statuses[p.tag_id]
            box = self.bbox.get(p.tag_id)
            if box is None:
                continue
            x, y, w, h = box
            col = COLOURS[st]
            if st in ("missing", "removed"):
                for k in range(x, x + w, 14):  # dashed: the sticker is not in view
                    cv2.line(out, (k, y), (min(k + 7, x + w), y), col, th)
                    cv2.line(out, (k, y + h), (min(k + 7, x + w), y + h), col, th)
                label = f"#{p.tag_id} {st.upper()}"
            else:
                cv2.rectangle(out, (x, y), (x + w, y + h), col, th)
                r = readings.get(p.tag_id)
                label = f"#{p.tag_id} {p.species}"
                if r:
                    label += f" {r.species_conf:.2f}" + (f" ndvi {r.ndvi:.2f}" if r.ndvi is not None else "")
                if st == "suspect":
                    label = f"#{p.tag_id} SUSPECT {r.reason if r else ''}".strip()
            (tw, tht), _ = cv2.getTextSize(label, font, 0.45 * scale, th)
            cv2.rectangle(out, (x, y - tht - 8), (x + tw + 8, y), col, -1)
            cv2.putText(out, label, (x + 4, y - 5), font, 0.45 * scale, (20, 24, 18), th, cv2.LINE_AA)
        seen = sum(1 for s in statuses.values() if s in ("present", "suspect"))
        head = f"{self.rig.miner_id}  tags {seen}/{len(statuses)}" + (f"  {hz:.1f} Hz" if hz else "") + (f"  UNKNOWN {unknown}" if unknown else "")
        cv2.rectangle(out, (0, 0), (out.shape[1], int(30 * scale)), (16, 19, 15), -1)
        cv2.putText(out, head, (10, int(21 * scale)), font, 0.6 * scale, (223, 232, 235), th, cv2.LINE_AA)
        return out


def no_ndvi_frame(frame):
    out = (frame * 0.25).astype(np.uint8)
    cv2.putText(out, "NDVI needs the NoIR camera (run with --liveness ndvi)", (30, out.shape[0] // 2),
                cv2.FONT_HERSHEY_SIMPLEX, max(0.7, out.shape[1] / 1600), (223, 232, 235), 2, cv2.LINE_AA)
    return out


def main(argv=None):
    ap = argparse.ArgumentParser(description=__doc__, formatter_class=argparse.RawDescriptionHelpFormatter)
    ap.add_argument("source", help="picam, usb:N, a video file, a folder of images or one image")
    ap.add_argument("--rig", help="rig.json path")
    ap.add_argument("--mqtt", help="broker URL (default: rig.json mqtt_url); '-' prints C1 to stdout; 'off' disables")
    ap.add_argument("--hz", type=float, default=1.0, help="inference / C1 rate (default 1)")
    ap.add_argument("--serve", type=int, metavar="PORT", help="serve streams, crops and C1 for the dashboard")
    ap.add_argument("--stream-fps", type=float, default=12, help="stream frame rate cap")
    ap.add_argument("--liveness", choices=["ndvi", "rgb"], help="ndvi = NoIR + blue gel (default from rig.json)")
    ap.add_argument("--enrolment", help="enrolment folder (default data/enrolment/<miner_id>)")
    ap.add_argument("--match-range", type=float, nargs=2, metavar=("LO", "HI"), help="raw similarity -> species_conf mapping")
    ap.add_argument("--loop", action="store_true", help="loop a still / recording")
    ap.add_argument("--seconds", type=float, help="stop after N seconds")
    args = ap.parse_args(argv)

    rig = load_rig(args.rig)
    liveness = args.liveness or rig.camera.get("liveness", "ndvi")
    analyzer = PlantAnalyzer(rig, args.enrolment, liveness=liveness, match_range=args.match_range)
    if not analyzer.enrolled:
        print("[run] no enrolment found: plant match (swap detection) is off. Run aircoin_vision.enrol first.", file=sys.stderr)
    cam = rig.camera
    source = open_source(args.source, cam.get("width"), cam.get("height"), loop=args.loop)
    single = isinstance(source, ImageSource) and not args.loop
    paced = isinstance(source, ImageSource) or (isinstance(source, OpenCVSource) and not isinstance(source.spec, int))
    runner = VisionRunner(rig, analyzer, int(time.time() * 1000), source=source_label(source))
    mqtt = args.mqtt or rig.mqtt_url
    pub = None if mqtt == "off" else Publisher(mqtt)
    server = StreamServer(args.serve) if args.serve else None
    print(f"[run] {rig.miner_id}: {args.hz:g} Hz, liveness {liveness}, match {analyzer.embed.name} "
          f"({len(analyzer.enrolled)} enrolled), C1 -> {mqtt}" + (f", streams on http://0.0.0.0:{args.serve}/" if server else ""),
          file=sys.stderr)

    period = 1.0 / args.hz
    t0 = time.time()
    last_inf = last_stream = last_report = 0.0
    n_inf, inf_ms = 0, []
    try:
        for ts, frame in source:
            now = time.time()
            if single:
                ts = int(now * 1000)
            if now - last_inf >= period or single:
                last_inf = now
                t = time.perf_counter()
                msg = runner.step(ts, frame)
                inf_ms.append((time.perf_counter() - t) * 1000)
                n_inf += 1
                if pub:
                    pub.publish(msg)
                if server:
                    server.set_c1(msg)
                    server.set_crops(analyzer.crops)
            if server and now - last_stream >= 1.0 / args.stream_fps:
                last_stream = now
                hz = n_inf / (now - t0) if now > t0 else None
                server.publish("raw", frame)
                server.publish("annotated", runner.draw(frame, hz))
                server.publish("ndvi", runner.draw(ndvi_colour(frame), hz) if liveness == "ndvi" else no_ndvi_frame(frame))
            if now - last_report >= 5 and n_inf:
                last_report = now
                _, readings, statuses, unknown = runner.last
                counts = {s: list(statuses.values()).count(s) for s in ("present", "suspect", "missing", "removed")}
                print(f"[run] {n_inf / (now - t0):.2f} Hz, inference {np.median(inf_ms[-20:]):.0f} ms; "
                      + ", ".join(f"{k} {v}" for k, v in counts.items() if v)
                      + (f"; unknown {unknown}" if unknown else ""), file=sys.stderr, flush=True)
            if single or (args.seconds and now - t0 >= args.seconds):
                break
            if paced:  # don't spin on a still or a file faster than a camera would deliver
                time.sleep(max(0.0, 1.0 / max(args.stream_fps, args.hz) - (time.time() - now)))
    except KeyboardInterrupt:
        pass
    finally:
        source.close()
        if pub:
            pub.close()
    return 0


if __name__ == "__main__":
    sys.exit(main())
