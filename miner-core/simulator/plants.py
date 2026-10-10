"""Mock C1 vision source: 20 tagged plants as vision-twin would report them.

Used by mock/c1_vision.py (publishes to MQTT) and by the in-process mock pipeline, so B can
run end to end without the camera. Fault knobs reproduce the cases the miner must handle.
"""

from __future__ import annotations

import random
from dataclasses import dataclass, field

from minerd.canonical import sha256_hex

# Same tag -> species layout as the registry and contracts-schema examples (tag i = species i+1)
SPECIES = ["snake_plant", "peace_lily", "bamboo_palm", "red_edged_dracaena", "janet_craig_dracaena",
           "english_ivy", "chinese_evergreen", "florists_chrysanthemum", "weeping_fig", "money_plant",
           "spider_plant", "aloe_vera", "areca_palm", "boston_fern", "tulsi", "hibiscus", "neem",
           "shisham", "bougainvillea", "yellow_oleander"]


@dataclass
class Faults:
    dropped: dict[int, int] = field(default_factory=dict)  # tag -> ts_ms it was taken away
    fake: set[int] = field(default_factory=set)            # plastic plant: low alive_score
    swapped: dict[int, str] = field(default_factory=dict)  # tag now on a different species
    unknown_tags: set[int] = field(default_factory=set)    # stickers not registered to this miner
    frozen: bool = False                                   # camera feed stuck on one frame


class MockVision:
    def __init__(self, miner_id: str, tag_ids: list[int], seed: int | None = None):
        self.miner_id = miner_id
        self.tag_ids = list(tag_ids)[:20]
        self.faults = Faults()
        self._rng = random.Random(seed)
        self._frozen_hash: str | None = None

    def _species(self, tag: int) -> str:
        return self.faults.swapped.get(tag) or SPECIES[self.tag_ids.index(tag) % len(SPECIES)]

    def message(self, ts_ms: int) -> dict:
        plants = []
        for i, tag in enumerate(self.tag_ids):
            dropped_at = self.faults.dropped.get(tag)
            if dropped_at is not None and ts_ms >= dropped_at:
                unseen = ts_ms - dropped_at
                status = "removed" if unseen >= 60_000 else "missing" if unseen >= 10_000 else None
                if status is None:  # vision hasn't given up on it yet: just absent from this frame
                    continue
                plants.append({"tag_id": tag, "species": self._species(tag), "species_conf": 0.0,
                               "leaf_area_cm2": 0.0, "alive_score": 0.0, "bbox": None, "status": status,
                               "last_seen_ts": dropped_at})
                continue
            fake = tag in self.faults.fake
            alive = 0.12 if fake else min(1.0, max(0.0, 0.86 + self._rng.gauss(0, 0.02)))
            plants.append({
                "tag_id": tag,
                "species": self._species(tag),
                "species_conf": round(min(1.0, 0.91 + self._rng.gauss(0, 0.02)), 3),
                "leaf_area_cm2": round(310.0 + 7 * i + self._rng.gauss(0, 1.5), 1),
                "alive_score": round(alive, 3),
                "ndvi": round(0.05 if fake else 0.41 + self._rng.gauss(0, 0.01), 3),
                "bbox": [40 + 250 * (i % 5), 30 + 170 * (i // 5), 180, 150],
                "status": "suspect" if fake else "present",
                "last_seen_ts": ts_ms,
            })

        if self.faults.frozen:
            self._frozen_hash = self._frozen_hash or sha256_hex(f"{self.miner_id}:{ts_ms}".encode())
            frame_hash = self._frozen_hash
        else:
            self._frozen_hash = None
            frame_hash = sha256_hex(f"{self.miner_id}:{ts_ms}:{self._rng.random()}".encode())

        return {
            "v": 1,
            "miner_id": self.miner_id,
            "ts": ts_ms,
            "frame_hash": frame_hash,
            "frame_size": {"w": 1280, "h": 720},
            "plants": plants,
            "unknown_tag_ids": sorted(self.faults.unknown_tags),
            "source": "mock",
        }
