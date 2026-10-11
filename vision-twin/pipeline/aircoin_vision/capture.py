"""Frame sources: Pi camera, USB/laptop camera, video file, or still images.

    open_source("picam", width, height)   Raspberry Pi camera via Picamera2
    open_source("usb:0")                  cv2.VideoCapture device 0
    open_source("clip.mp4")               video file
    open_source("frames/")                every image in a folder, sorted
    open_source("rig.jpg")                one still image

Each source is an iterator of (ts_ms, BGR frame).
"""

import glob
import time
from pathlib import Path

import cv2

IMAGE_EXT = {".jpg", ".jpeg", ".png", ".bmp", ".tif", ".tiff"}


def now_ms():
    return int(time.time() * 1000)


class PiCamera:
    def __init__(self, width=2304, height=1296):
        from picamera2 import Picamera2  # apt install python3-picamera2

        self.cam = Picamera2()
        config = self.cam.create_video_configuration(main={"size": (width, height), "format": "RGB888"})
        self.cam.configure(config)
        self.cam.start()
        time.sleep(1.0)  # let auto-exposure settle

    def __iter__(self):
        while True:
            # Picamera2's "RGB888" is BGR byte order, which is what OpenCV wants.
            yield now_ms(), self.cam.capture_array("main")

    def close(self):
        self.cam.stop()


class OpenCVSource:
    def __init__(self, spec, width=None, height=None, loop=False):
        self.spec = spec
        self.loop = loop
        self.cap = cv2.VideoCapture(spec)
        if not self.cap.isOpened():
            raise RuntimeError(f"cannot open video source {spec!r}")
        if isinstance(spec, int) and width and height:
            self.cap.set(cv2.CAP_PROP_FRAME_WIDTH, width)
            self.cap.set(cv2.CAP_PROP_FRAME_HEIGHT, height)

    def __iter__(self):
        while True:
            ok, frame = self.cap.read()
            if not ok:
                if self.loop and not isinstance(self.spec, int):
                    self.cap.set(cv2.CAP_PROP_POS_FRAMES, 0)
                    continue
                return
            yield now_ms(), frame

    def close(self):
        self.cap.release()


class ImageSource:
    def __init__(self, paths, loop=False):
        self.paths = paths
        self.loop = loop

    def __iter__(self):
        while True:
            for p in self.paths:
                frame = cv2.imread(str(p))
                if frame is None:
                    raise RuntimeError(f"cannot read image {p}")
                yield now_ms(), frame
            if not self.loop:
                return

    def close(self):
        pass


def open_source(spec, width=None, height=None, loop=False):
    if spec == "picam":
        return PiCamera(width or 2304, height or 1296)
    if spec.startswith("usb:"):
        return OpenCVSource(int(spec[4:]), width, height)
    path = Path(spec)
    if path.is_dir():
        paths = sorted(p for p in path.iterdir() if p.suffix.lower() in IMAGE_EXT)
        if not paths:
            raise RuntimeError(f"no images in {spec}")
        return ImageSource(paths, loop)
    if path.suffix.lower() in IMAGE_EXT:
        return ImageSource([path], loop)
    if any(ch in spec for ch in "*?["):
        return ImageSource(sorted(Path(p) for p in glob.glob(spec)), loop)
    return OpenCVSource(spec, loop=loop)
