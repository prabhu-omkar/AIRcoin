"""ArUco sticker detection and plant-crop geometry.

Works with OpenCV >= 4.7 (ArucoDetector) and falls back to the legacy
cv2.aruco.detectMarkers API (e.g. Raspberry Pi OS's python3-opencv 4.6).
"""

from dataclasses import dataclass

import cv2
import numpy as np


@dataclass
class Detection:
    tag_id: int
    corners: np.ndarray  # (4, 2) float32: top-left, top-right, bottom-right, bottom-left

    @property
    def center(self):
        return self.corners.mean(axis=0)

    @property
    def side_px(self):
        """Mean edge length in pixels."""
        c = self.corners
        return float(np.mean([np.linalg.norm(c[i] - c[(i + 1) % 4]) for i in range(4)]))

    def mm_per_px(self, marker_size_mm):
        return marker_size_mm / self.side_px


def get_dictionary(name):
    if not hasattr(cv2.aruco, name):
        raise ValueError(f"unknown ArUco dictionary {name}")
    return cv2.aruco.getPredefinedDictionary(getattr(cv2.aruco, name))


class MarkerDetector:
    def __init__(self, dictionary_name):
        self.dictionary = get_dictionary(dictionary_name)
        if hasattr(cv2.aruco, "DetectorParameters"):
            params = cv2.aruco.DetectorParameters()
        else:  # OpenCV < 4.7
            params = cv2.aruco.DetectorParameters_create()
        # Tuned for small markers (20-30 px) on a wide frame; see tests/test_markers.py.
        params.minMarkerPerimeterRate = 0.01  # accept markers down to ~1 % of the frame size
        params.adaptiveThreshWinSizeMin = 3  # finer threshold windows help tiny markers
        params.adaptiveThreshWinSizeStep = 4
        params.adaptiveThreshWinSizeMax = 33
        params.perspectiveRemovePixelPerCell = 8  # sample bits on a finer grid
        params.perspectiveRemoveIgnoredMarginPerCell = 0.2
        params.cornerRefinementMethod = cv2.aruco.CORNER_REFINE_SUBPIX
        self.params = params
        self._detector = (
            cv2.aruco.ArucoDetector(self.dictionary, params) if hasattr(cv2.aruco, "ArucoDetector") else None
        )

    def detect(self, frame):
        gray = frame if frame.ndim == 2 else cv2.cvtColor(frame, cv2.COLOR_BGR2GRAY)
        if self._detector is not None:
            corners, ids, _ = self._detector.detectMarkers(gray)
        else:
            corners, ids, _ = cv2.aruco.detectMarkers(gray, self.dictionary, parameters=self.params)
        if ids is None:
            return []
        found = {}
        for c, i in zip(corners, ids.flatten()):
            d = Detection(int(i), c.reshape(4, 2).astype(np.float32))
            # Keep the largest if an ID shows up twice (reflection, duplicate print).
            if d.tag_id not in found or d.side_px > found[d.tag_id].side_px:
                found[d.tag_id] = d
        return sorted(found.values(), key=lambda d: d.tag_id)


def plant_box(detection, crop, frame_shape):
    """Axis-aligned [x, y, w, h] of the plant above a sticker, clipped to the frame.

    Assumes stickers are mounted upright on a stake at the base of the plant.
    """
    s = detection.side_px
    cx = float(detection.center[0])
    top = float(detection.corners[:, 1].min())
    h_img, w_img = frame_shape[:2]
    x0 = max(0, int(round(cx - crop.width_markers * s / 2)))
    x1 = min(w_img, int(round(cx + crop.width_markers * s / 2)))
    y1 = max(0, int(round(top - crop.gap_markers * s)))
    y0 = max(0, int(round(y1 - crop.height_markers * s)))
    return [x0, y0, max(0, x1 - x0), max(0, y1 - y0)]


STATUS_COLOURS = {  # BGR
    "registered": (80, 200, 80),
    "unknown": (0, 140, 255),
    "missing": (160, 160, 160),
}


def annotate(frame, detections, rig, crop_boxes=True):
    """Draw marker outlines, IDs, species and plant crops. Returns a copy."""
    out = frame.copy() if frame.ndim == 3 else cv2.cvtColor(frame, cv2.COLOR_GRAY2BGR)
    registered = set(rig.sticker_ids)
    scale = max(0.5, out.shape[1] / 1600)
    for d in detections:
        colour = STATUS_COLOURS["registered" if d.tag_id in registered else "unknown"]
        pts = d.corners.astype(np.int32).reshape(-1, 1, 2)
        cv2.polylines(out, [pts], True, colour, max(2, int(2 * scale)))
        plant = rig.plant(d.tag_id)
        label = f"{d.tag_id}" + (f" {plant.species}" if plant else " UNKNOWN")
        org = tuple(int(v) for v in d.corners[3] + np.array([0, 18 * scale]))
        cv2.putText(out, label, org, cv2.FONT_HERSHEY_SIMPLEX, 0.5 * scale, (0, 0, 0), int(4 * scale), cv2.LINE_AA)
        cv2.putText(out, label, org, cv2.FONT_HERSHEY_SIMPLEX, 0.5 * scale, colour, max(1, int(1.5 * scale)), cv2.LINE_AA)
        if crop_boxes and plant:
            x, y, w, h = plant_box(d, rig.crop, out.shape)
            cv2.rectangle(out, (x, y), (x + w, y + h), colour, 1)
    return out


def summarize(detections, rig):
    seen = {d.tag_id for d in detections}
    registered = set(rig.sticker_ids)
    return {
        "detected": sorted(seen & registered),
        "missing": sorted(registered - seen),
        "unknown": sorted(seen - registered),
    }
