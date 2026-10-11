from __future__ import annotations

import hashlib
from collections import defaultdict, deque
from dataclasses import dataclass
from typing import Any

import cv2
import numpy as np

from .config import EnrolledPlant, load_enrolment
from .state import TagState


@dataclass
class Detection:
    tag_id: int
    bbox: list[int]
    crop: np.ndarray
    marker_area_px: float


class VisionEngine:
    """Detect ArUco tags and turn one BGR frame into a frozen-schema C1 event."""

    def __init__(self, miner_id: str = "miner-001", marker_size_cm: float = 4.5):
        self.miner_id = miner_id
        self.marker_size_cm = marker_size_cm
        self.enrolment: dict[int, EnrolledPlant] = load_enrolment()
        self.states = {tag: TagState() for tag in self.enrolment}
        self.area_history: dict[int, deque[float]] = defaultdict(lambda: deque(maxlen=5))
        dictionary = cv2.aruco.getPredefinedDictionary(cv2.aruco.DICT_4X4_50)
        self.detector = cv2.aruco.ArucoDetector(dictionary, cv2.aruco.DetectorParameters())

    def detect(self, frame: np.ndarray) -> tuple[dict[int, Detection], list[int]]:
        corners, ids, _ = self.detector.detectMarkers(frame)
        found: dict[int, Detection] = {}
        unknown: list[int] = []
        if ids is None:
            return found, unknown
        height, width = frame.shape[:2]
        for points, raw_id in zip(corners, ids.flatten()):
            tag_id = int(raw_id)
            if tag_id not in self.enrolment:
                unknown.append(tag_id)
                continue
            pts = points.reshape(4, 2)
            x0, y0 = np.floor(pts.min(axis=0)).astype(int)
            x1, y1 = np.ceil(pts.max(axis=0)).astype(int)
            marker_h = max(1, y1 - y0)
            # The marker sits near the pot: include foliage above and around it.
            pad_x, above = marker_h * 2, marker_h * 5
            cx0, cx1 = max(0, x0 - pad_x), min(width, x1 + pad_x)
            cy0, cy1 = max(0, y0 - above), min(height, y1 + marker_h)
            marker_area = float(abs(cv2.contourArea(pts.astype(np.float32))))
            found[tag_id] = Detection(
                tag_id, [cx0, cy0, cx1 - cx0, cy1 - cy0], frame[cy0:cy1, cx0:cx1], marker_area
            )
        return found, sorted(set(unknown))

    @staticmethod
    def _green_mask(crop: np.ndarray) -> np.ndarray:
        hsv = cv2.cvtColor(crop, cv2.COLOR_BGR2HSV)
        return cv2.inRange(hsv, np.array([25, 35, 25]), np.array([95, 255, 255]))

    def _measure(self, tag_id: int, detection: Detection) -> tuple[float, float, float, float]:
        crop = detection.crop
        if crop.size == 0:
            return 0.0, 0.0, 0.0, 0.0
        mask = self._green_mask(crop)
        green_px = int(cv2.countNonZero(mask))
        px_per_cm2 = max(detection.marker_area_px / (self.marker_size_cm**2), 0.01)
        area = min(green_px / px_per_cm2, 2500.0)
        self.area_history[tag_id].append(area)
        smooth_area = float(np.median(self.area_history[tag_id]))

        green_ratio = green_px / max(mask.size, 1)
        grey = cv2.cvtColor(crop, cv2.COLOR_BGR2GRAY)
        texture = min(float(grey.std()) / 55.0, 1.0)
        alive = float(np.clip(0.15 + green_ratio * 2.4 + texture * 0.35, 0, 1))
        # With a NoIR blue filter, red and blue approximate NIR and visible channels.
        b, _, r = cv2.split(crop.astype(np.float32))
        ndvi = float(np.mean((r - b) / (r + b + 1.0)))

        ref = self.enrolment[tag_id].reference_histogram
        if ref:
            hist = cv2.calcHist([crop], [0, 1], mask, [8, 8], [0, 256, 0, 256]).flatten()
            hist /= max(float(hist.sum()), 1.0)
            species_conf = float(np.clip(cv2.compareHist(np.asarray(ref, np.float32), hist, cv2.HISTCMP_CORREL), 0, 1))
        else:
            species_conf = float(np.clip(0.65 + green_ratio, 0, 0.95))
        return smooth_area, species_conf, alive, float(np.clip(ndvi, -1, 1))

    def process(self, frame: np.ndarray, ts_ms: int, source: str = "laptop_camera") -> dict[str, Any]:
        detections, unknown = self.detect(frame)
        plants: list[dict[str, Any]] = []
        for tag_id, enrolled in sorted(self.enrolment.items()):
            detection = detections.get(tag_id)
            if detection:
                area, conf, alive, ndvi = self._measure(tag_id, detection)
                status = self.states[tag_id].update(ts_ms, True, conf, alive)
                bbox: list[int] | None = detection.bbox
            else:
                area = 0.0
                conf = 0.0
                alive = 0.0
                ndvi = 0.0
                status = self.states[tag_id].update(ts_ms, False, conf, alive)
                bbox = None
            plants.append({
                "tag_id": tag_id, "species": enrolled.species,
                "species_conf": round(conf, 3), "leaf_area_cm2": round(area, 1),
                "alive_score": round(alive, 3), "ndvi": round(ndvi, 3),
                "bbox": bbox, "status": status,
                "last_seen_ts": self.states[tag_id].last_seen_ts or ts_ms,
            })
        height, width = frame.shape[:2]
        return {
            "v": 1, "miner_id": self.miner_id, "ts": ts_ms,
            "frame_hash": "0x" + hashlib.sha256(frame.tobytes()).hexdigest(),
            "frame_size": {"w": width, "h": height}, "plants": plants,
            "unknown_tag_ids": unknown, "source": source,
        }

