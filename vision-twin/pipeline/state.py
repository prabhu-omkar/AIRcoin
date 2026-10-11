from __future__ import annotations

from dataclasses import dataclass


@dataclass
class TagState:
    last_seen_ts: int = 0
    status: str = "missing"
    good_frames: int = 0
    bad_frames: int = 0

    def update(self, now_ms: int, seen: bool, species_conf: float, alive_score: float) -> str:
        if seen:
            first_detection = self.last_seen_ts == 0
            self.last_seen_ts = now_ms
            bad = species_conf < 0.5 or alive_score < 0.3
            self.bad_frames = self.bad_frames + 1 if bad else 0
            self.good_frames = self.good_frames + 1 if not bad else 0
            # Require two consecutive frames in either direction to avoid one-frame flicker.
            if bad and (self.bad_frames >= 2 or self.status == "suspect"):
                self.status = "suspect"
            elif not bad and (first_detection or self.good_frames >= 2 or self.status == "present"):
                self.status = "present"
            return self.status

        age = now_ms - self.last_seen_ts if self.last_seen_ts else 60_001
        self.good_frames = self.bad_frames = 0
        if age >= 60_000:
            self.status = "removed"
        elif age >= 10_000:
            self.status = "missing"
        return self.status
