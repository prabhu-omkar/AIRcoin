"""Detect plant stickers on still frames or live video.

    python -m aircoin_vision.detect rig.jpg                 # still: report + annotated copy
    python -m aircoin_vision.detect frames/ --annotate out/ # every image in a folder
    python -m aircoin_vision.detect picam --seconds 60      # live Pi camera, detection rate
    python -m aircoin_vision.detect usb:0 --serve 8080      # live + annotated MJPEG at http://<host>:8080/

Phase 1 target: 20 of 20 stickers detected at rig distance in normal room light
(and >= 95 % of frames for the demo metric).
"""

import argparse
import json
import sys
import threading
import time
from http.server import BaseHTTPRequestHandler, ThreadingHTTPServer
from pathlib import Path

import cv2

from .capture import ImageSource, open_source
from .config import load_rig
from .markers import MarkerDetector, annotate, summarize


class MjpegServer:
    """Serve the latest annotated frame as MJPEG (open in a browser or the twin's camera panel)."""

    def __init__(self, port, max_width=1280):
        self.max_width = max_width
        self._jpeg = None
        self._cond = threading.Condition()
        server = self

        class Handler(BaseHTTPRequestHandler):
            def log_message(self, *args):
                pass

            def do_GET(self):
                if self.path.startswith("/snapshot"):
                    with server._cond:
                        jpeg = server._jpeg
                    if jpeg is None:
                        self.send_error(503, "no frame yet")
                        return
                    self.send_response(200)
                    self.send_header("Content-Type", "image/jpeg")
                    self.send_header("Access-Control-Allow-Origin", "*")
                    self.end_headers()
                    self.wfile.write(jpeg)
                    return
                self.send_response(200)
                self.send_header("Content-Type", "multipart/x-mixed-replace; boundary=frame")
                self.send_header("Access-Control-Allow-Origin", "*")
                self.send_header("Cache-Control", "no-cache")
                self.end_headers()
                try:
                    while True:
                        with server._cond:
                            server._cond.wait(timeout=5)
                            jpeg = server._jpeg
                        if jpeg is None:
                            continue
                        self.wfile.write(b"--frame\r\nContent-Type: image/jpeg\r\n")
                        self.wfile.write(f"Content-Length: {len(jpeg)}\r\n\r\n".encode() + jpeg + b"\r\n")
                except (BrokenPipeError, ConnectionResetError):
                    pass

        self.httpd = ThreadingHTTPServer(("0.0.0.0", port), Handler)
        self.httpd.daemon_threads = True
        threading.Thread(target=self.httpd.serve_forever, daemon=True).start()

    def publish(self, frame):
        h, w = frame.shape[:2]
        if w > self.max_width:
            frame = cv2.resize(frame, (self.max_width, int(h * self.max_width / w)), interpolation=cv2.INTER_AREA)
        ok, buf = cv2.imencode(".jpg", frame, [cv2.IMWRITE_JPEG_QUALITY, 80])
        if ok:
            with self._cond:
                self._jpeg = buf.tobytes()
                self._cond.notify_all()


def main(argv=None):
    ap = argparse.ArgumentParser(description=__doc__, formatter_class=argparse.RawDescriptionHelpFormatter)
    ap.add_argument("source", help="image, folder, video file, usb:N or picam")
    ap.add_argument("--rig", help="rig.json path")
    ap.add_argument("--annotate", help="write annotated frames here (file for one still, folder otherwise)")
    ap.add_argument("--serve", type=int, metavar="PORT", help="serve annotated MJPEG on this port")
    ap.add_argument("--seconds", type=float, help="stop live capture after N seconds")
    ap.add_argument("--json", action="store_true", help="print one JSON line per frame")
    ap.add_argument("--loop", action="store_true", help="loop a video file / images (e.g. to serve a still as a feed)")
    ap.add_argument("--fps", type=float, help="limit processing rate (useful with --loop)")
    args = ap.parse_args(argv)

    rig = load_rig(args.rig)
    detector = MarkerDetector(rig.aruco_dictionary)
    cam = rig.camera
    source = open_source(args.source, cam.get("width"), cam.get("height"), loop=args.loop)
    still = isinstance(source, ImageSource) and not args.loop
    server = MjpegServer(args.serve) if args.serve else None
    if server:
        print(f"MJPEG stream on http://0.0.0.0:{args.serve}/  (snapshot: /snapshot)", file=sys.stderr)

    n_frames = n_full = 0
    t0 = time.time()
    last_report = t0
    try:
        for ts, frame in source:
            t = time.time()
            dets = detector.detect(frame)
            dt_ms = (time.time() - t) * 1000
            summary = summarize(dets, rig)
            n_frames += 1
            full = not summary["missing"]
            n_full += full

            if args.annotate or server:
                ann = annotate(frame, dets, rig)
                if args.annotate:
                    out = Path(args.annotate)
                    if still and out.suffix:
                        cv2.imwrite(str(out), ann)
                    else:
                        out.mkdir(parents=True, exist_ok=True)
                        cv2.imwrite(str(out / f"frame-{n_frames:05d}.jpg"), ann)
                if server:
                    server.publish(ann)

            if args.json:
                print(json.dumps({"ts": ts, "detect_ms": round(dt_ms, 1), **summary}), flush=True)
            elif still:
                n = len(summary["detected"])
                small = min((d.side_px for d in dets), default=0)
                print(f"frame {n_frames}: {n}/{len(rig.sticker_ids)} stickers in {dt_ms:.0f} ms"
                      + (f"; smallest marker {small:.0f} px" + (" (TOO SMALL, aim for >= 24 px)" if small < 24 else "")
                         if dets else "")
                      + (f"; missing {summary['missing']}" if summary["missing"] else "")
                      + (f"; UNKNOWN {summary['unknown']}" if summary["unknown"] else ""))
            elif t - last_report >= 2:
                last_report = t
                fps = n_frames / (t - t0)
                print(f"{n_frames} frames, {fps:.1f} fps, all 20 in {100 * n_full / n_frames:.0f}% of frames; "
                      f"now {len(summary['detected'])}/{len(rig.sticker_ids)}"
                      + (f" missing {summary['missing']}" if summary["missing"] else "")
                      + (f" UNKNOWN {summary['unknown']}" if summary["unknown"] else ""), flush=True)

            if args.seconds and t - t0 >= args.seconds:
                break
            if args.fps:
                time.sleep(max(0.0, 1 / args.fps - (time.time() - t)))
    except KeyboardInterrupt:
        pass
    finally:
        source.close()

    if n_frames and not args.json:
        print(f"\n{n_frames} frame(s): all {len(rig.sticker_ids)} stickers detected in {n_full} "
              f"({100 * n_full / n_frames:.1f}%)")
    return 0 if n_frames and n_full == n_frames else 1


if __name__ == "__main__":
    sys.exit(main())
