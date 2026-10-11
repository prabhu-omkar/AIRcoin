"""Rig configuration (vision-twin/config/rig.json)."""

import json
from dataclasses import dataclass, field
from pathlib import Path

VISION_TWIN = Path(__file__).resolve().parents[2]
REPO_ROOT = VISION_TWIN.parent
DEFAULT_RIG = VISION_TWIN / "config" / "rig.json"
DATA_DIR = VISION_TWIN / "data"


@dataclass(frozen=True)
class Plant:
    tag_id: int
    slot: int
    species: str


@dataclass(frozen=True)
class Crop:
    width_markers: float = 5.0
    height_markers: float = 4.5
    gap_markers: float = 0.2


@dataclass(frozen=True)
class Rig:
    miner_id: str
    aruco_dictionary: str
    marker_size_mm: float
    rows: int
    cols: int
    crop: Crop
    camera: dict
    mqtt_url: str
    plants: tuple = field(default_factory=tuple)

    @property
    def sticker_ids(self):
        return [p.tag_id for p in self.plants]

    def plant(self, tag_id):
        return next((p for p in self.plants if p.tag_id == tag_id), None)


def load_rig(path=None):
    raw = json.loads(Path(path or DEFAULT_RIG).read_text())
    plants = tuple(sorted((Plant(**p) for p in raw["plants"]), key=lambda p: p.slot))
    ids = [p.tag_id for p in plants]
    if len(set(ids)) != len(ids):
        raise ValueError("rig.json: duplicate tag_id")
    if len(plants) > raw["grid"]["rows"] * raw["grid"]["cols"]:
        raise ValueError("rig.json: more plants than grid slots")
    crop = {k: v for k, v in raw.get("crop", {}).items() if not k.startswith("_")}
    return Rig(
        miner_id=raw["miner_id"],
        aruco_dictionary=raw["aruco_dictionary"],
        marker_size_mm=float(raw["marker_size_mm"]),
        rows=raw["grid"]["rows"],
        cols=raw["grid"]["cols"],
        crop=Crop(**crop),
        camera=raw.get("camera", {}),
        mqtt_url=raw.get("mqtt_url", "mqtt://localhost:1883"),
        plants=plants,
    )
