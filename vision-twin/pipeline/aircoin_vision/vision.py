"""Per-plant analysis for each inference cycle (PRD 7.1 #3-#6).

For every registered sticker in view:
  species_conf   similarity of the live crop to the plant's enrolment vector, mapped to 0..1
                 (low = the plant in this pot is not the one that was enrolled -> swap)
  leaf_area_cm2  plant pixels in the crop, scaled by the marker's known size, smoothed
  ndvi           NoIR + blue gel only: (NIR - blue) / (NIR + blue) over plant pixels, where the red channel
                 carries NIR. Living leaves ~0.3-0.6, plastic ~0.
  alive_score    0..1 liveness: from NDVI on the NoIR camera; on a normal camera (laptop fallback) from
                 greenness and leaf texture (weaker; can't see plastic reliably)
  suspect        species_conf < SWAP_THRESHOLD or alive_score < ALIVE_THRESHOLD (debounced by StatusMachine)
"""

import json
from dataclasses import dataclass
from pathlib import Path

import cv2
import numpy as np

from .config import DATA_DIR
from .embed import make_embedder, similarity
from .markers import plant_box

SWAP_THRESHOLD = 0.5
ALIVE_THRESHOLD = 0.35

# raw cosine similarity -> species_conf (0.5 = the swap threshold). leafhist is calibrated on synthetic rigs
# (tests/test_vision.py: same plant >= 0.93, a different species mostly < 0.90 when averaged over 4 frames).
# mobilenet is a first guess: check it on the real rig with `enrol --check` and pass --match-range to `run`.
SIMILARITY_RANGE = {"leafhist": (0.84, 0.96), "colorhist": (0.88, 0.99), "mobilenet": (0.45, 0.88)}


@dataclass
class Reading:
    tag_id: int
    bbox: list
    species_conf: float
    leaf_area_cm2: float
    alive_score: float
    ndvi: float | None
    suspect: bool
    reason: str | None = None


def ndvi_map(frame):
    """Per-pixel NDVI for a NoIR + blue-gel frame (BGR): red ~ NIR, blue ~ visible blue."""
    f = frame.astype(np.float32)
    nir, blue = f[..., 2], f[..., 0]
    return (nir - blue) / (nir + blue + 1e-6)


def ndvi_colour(frame, mask_floor=0.05):
    """False-colour NDVI picture for the camera stream (blue = none, red = dense living leaves)."""
    nd = ndvi_map(frame)
    scaled = np.clip((nd + 0.1) / 0.8 * 255, 0, 255).astype(np.uint8)
    out = cv2.applyColorMap(scaled, cv2.COLORMAP_TURBO)
    dim = (nd < mask_floor)[..., None]
    return np.where(dim, (out * 0.35).astype(np.uint8), out)


def plant_mask(crop, liveness):
    """Plant pixels (living or plastic) in a crop."""
    if liveness == "ndvi":
        # leaves, living (reddish under NoIR) or plastic (greenish), stand out from the neutral wall by chroma
        c = crop.astype(np.int16)
        chroma = c.max(axis=2) - c.min(axis=2)
        mask = chroma > 30
    else:
        b, g, r = (crop[..., i].astype(np.int16) for i in range(3))
        mask = (2 * g - r - b) > 20
    mask = cv2.morphologyEx(mask.astype(np.uint8), cv2.MORPH_OPEN, np.ones((3, 3), np.uint8))
    return mask.astype(bool)


class PlantAnalyzer:
    def __init__(self, rig, enrolment_dir=None, liveness="ndvi", embedder=None, smoothing=0.4, match_range=None):
        self.rig = rig
        self.liveness = liveness
        self.alpha = smoothing
        self.dir = Path(enrolment_dir) if enrolment_dir else DATA_DIR / "enrolment" / rig.miner_id
        self.vectors = {}
        manifest_path = self.dir / "enrolment.json"
        manifest = json.loads(manifest_path.read_text()) if manifest_path.exists() else None
        backend = manifest["backend"] if manifest else "leafhist"
        self.embed = embedder or make_embedder(backend)
        if manifest:
            if manifest["backend"] != self.embed.name:
                raise ValueError(f"enrolment uses {manifest['backend']} but the embedder is {self.embed.name}")
            for tag, entry in manifest["tags"].items():
                self.vectors[int(tag)] = np.load(self.dir / entry["vector"])
        self.sim_range = tuple(match_range) if match_range else SIMILARITY_RANGE.get(self.embed.name, (0.5, 0.95))
        self.raw_similarity = {}  # tag -> last raw similarity, for calibration printouts
        self.state = {}  # tag -> smoothed values
        self.crops = {}  # tag -> latest crop (BGR), for the dashboard

    @property
    def enrolled(self):
        return sorted(self.vectors)

    def _smooth(self, tag, key, value):
        st = self.state.setdefault(tag, {})
        prev = st.get(key)
        st[key] = value if prev is None else prev + self.alpha * (value - prev)
        return st[key]

    def last(self, tag, key, default):
        return self.state.get(tag, {}).get(key, default)

    def analyse(self, frame, detections):
        """Return {tag_id: Reading} for every registered sticker detected in `frame`."""
        registered = set(self.rig.sticker_ids)
        out = {}
        for d in detections:
            if d.tag_id not in registered:
                continue
            x, y, w, h = plant_box(d, self.rig.crop, frame.shape)
            if w < 8 or h < 8:
                continue
            crop = frame[y:y + h, x:x + w]
            self.crops[d.tag_id] = crop
            mm_per_px = d.mm_per_px(self.rig.marker_size_mm)
            mask = plant_mask(crop, self.liveness)
            area = float(mask.sum()) * mm_per_px ** 2 / 100.0

            # plant match
            vec = self.vectors.get(d.tag_id)
            if vec is not None:
                lo, hi = self.sim_range
                raw = similarity(self.embed(crop), vec)
                self.raw_similarity[d.tag_id] = raw
                conf = float(np.clip((raw - lo) / (hi - lo), 0, 1))
            else:
                conf = 1.0  # not enrolled: can't judge a swap

            # liveness
            nd = None
            if self.liveness == "ndvi":
                if mask.sum() >= 30:
                    nd = float(np.median(ndvi_map(crop)[mask]))
                    alive = float(np.clip((nd - 0.08) / 0.27, 0, 1))
                else:
                    nd, alive = 0.0, 0.0
            else:
                frac = mask.mean()
                gray = cv2.cvtColor(crop, cv2.COLOR_BGR2GRAY)
                texture = cv2.Laplacian(gray, cv2.CV_32F)[mask].std() if mask.sum() >= 30 else 0.0
                alive = float(np.clip(0.6 * min(1.0, frac / 0.15) + 0.4 * min(1.0, texture / 12.0), 0, 1))

            conf_s = self._smooth(d.tag_id, "species_conf", conf)
            alive_s = self._smooth(d.tag_id, "alive_score", alive)
            area_s = self._smooth(d.tag_id, "leaf_area_cm2", area)
            nd_s = self._smooth(d.tag_id, "ndvi", nd) if nd is not None else None
            reason = None
            if alive_s < ALIVE_THRESHOLD:  # no living tissue: a fake, whatever it looks like
                reason = "low_liveness"
            elif conf_s < SWAP_THRESHOLD:
                reason = "species_mismatch"
            out[d.tag_id] = Reading(d.tag_id, [x, y, w, h], conf_s, area_s, alive_s, nd_s, reason is not None, reason)
        return out
