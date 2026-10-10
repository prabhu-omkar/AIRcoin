"""HTTP server for the owner dashboard: live MJPEG streams, per-plant crops and the latest C1 message.

    GET /              annotated stream (detections, plant boxes, status)
    GET /raw           camera stream as captured
    GET /ndvi          NDVI false-colour stream (NoIR camera)
    GET /snapshot      latest annotated frame as one JPEG (also /raw/snapshot, /ndvi/snapshot)
    GET /crop/<tag>.jpg   latest crop of one plant
    GET /c1.json       the last C1 vision event published
    GET /health
"""

import json
import re
import threading
from http.server import BaseHTTPRequestHandler, ThreadingHTTPServer

import cv2

CHANNELS = ("annotated", "raw", "ndvi")
_CROP = re.compile(r"^/crop/(\d+)\.jpg")


def encode(frame, max_width=None, quality=80):
    h, w = frame.shape[:2]
    if max_width and w > max_width:
        frame = cv2.resize(frame, (max_width, int(h * max_width / w)), interpolation=cv2.INTER_AREA)
    ok, buf = cv2.imencode(".jpg", frame, [cv2.IMWRITE_JPEG_QUALITY, quality])
    return buf.tobytes() if ok else None


class StreamServer:
    def __init__(self, port, max_width=1280):
        self.max_width = max_width
        self._frames = {c: None for c in CHANNELS}
        self._crops = {}
        self._c1 = None
        self._cond = threading.Condition()
        server = self

        class Handler(BaseHTTPRequestHandler):
            def log_message(self, *args):
                pass

            def _headers(self, status, ctype, extra=()):
                self.send_response(status)
                self.send_header("Content-Type", ctype)
                self.send_header("Access-Control-Allow-Origin", "*")
                self.send_header("Cache-Control", "no-cache, no-store")
                for k, v in extra:
                    self.send_header(k, v)
                self.end_headers()

            def _bytes(self, data, ctype):
                if data is None:
                    self.send_error(503, "not available yet")
                    return
                self._headers(200, ctype, [("Content-Length", str(len(data)))])
                self.wfile.write(data)

            def do_GET(self):
                path = self.path.split("?", 1)[0].rstrip("/") or "/"
                if path == "/health":
                    return self._bytes(b'{"ok":true}', "application/json")
                if path == "/c1.json":
                    with server._cond:
                        c1 = server._c1
                    return self._bytes(json.dumps(c1).encode() if c1 else None, "application/json")
                m = _CROP.match(path)
                if m:
                    with server._cond:
                        crop = server._crops.get(int(m.group(1)))
                    return self._bytes(crop, "image/jpeg")
                parts = [p for p in path.split("/") if p]
                channel = parts[0] if parts and parts[0] in CHANNELS else "annotated"
                if parts and parts[0] not in CHANNELS and parts[0] != "snapshot":
                    return self.send_error(404)
                if parts and parts[-1] == "snapshot":
                    with server._cond:
                        jpeg = server._frames[channel]
                    return self._bytes(jpeg, "image/jpeg")
                self._headers(200, "multipart/x-mixed-replace; boundary=frame")
                try:
                    while True:
                        with server._cond:
                            server._cond.wait(timeout=5)
                            jpeg = server._frames[channel]
                        if jpeg is None:
                            continue
                        self.wfile.write(b"--frame\r\nContent-Type: image/jpeg\r\n")
                        self.wfile.write(f"Content-Length: {len(jpeg)}\r\n\r\n".encode() + jpeg + b"\r\n")
                except (BrokenPipeError, ConnectionResetError, ConnectionAbortedError):
                    pass

        self.httpd = ThreadingHTTPServer(("0.0.0.0", port), Handler)
        self.httpd.daemon_threads = True
        threading.Thread(target=self.httpd.serve_forever, daemon=True).start()

    def publish(self, channel, frame):
        jpeg = encode(frame, self.max_width)
        if jpeg:
            with self._cond:
                self._frames[channel] = jpeg
                self._cond.notify_all()

    def set_crops(self, crops):
        encoded = {tag: encode(c, 480, 85) for tag, c in crops.items()}
        with self._cond:
            self._crops.update({t: j for t, j in encoded.items() if j})

    def set_c1(self, msg):
        with self._cond:
            self._c1 = msg

    def close(self):
        self.httpd.shutdown()
