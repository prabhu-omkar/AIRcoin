"""Latest state of each registered plant, built from C1 vision events, plus device-side flags.

Status machine (PRD 7.1 #7): present -> missing after 10 s unseen -> removed after 60 s;
suspect when the species match or alive_score is low. The miner applies the timeouts itself
so a stalled vision feed cannot keep plants earning.
"""

from __future__ import annotations

from dataclasses import dataclass, field

MISSING_AFTER_MS = 10_000
REMOVED_AFTER_MS = 60_000
MIN_ALIVE = 0.3
MIN_SPECIES_CONF = 0.5
LOCK_SPECIES_CONF = 0.6
FROZEN_FRAMES = 5
CLOCK_DRIFT_MS = 5_000
NEW_PLANT_BURST = 5          # more new tags than this ...
NEW_PLANT_WINDOW_MS = 60_000  # ... within this window, once the miner has settled

SEVERITY = {
    "unknown_sticker": "warn",
    "species_mismatch": "warn",
    "low_liveness": "critical",
    "plant_missing": "warn",
    "plant_removed": "warn",
    "gps_out_of_geofence": "critical",
    "frozen_camera": "critical",
    "too_many_new_plants": "warn",
    "clock_drift": "warn",
}


def flag(code: str, ts: int, message: str, tag_id: int | None = None) -> dict:
    f = {"code": code, "severity": SEVERITY[code], "ts": ts}
    if tag_id is not None:
        f["tag_id"] = tag_id
    f["message"] = message[:280]
    return f


@dataclass
class PlantState:
    tag_id: int
    species: str
    species_conf: float = 0.0
    leaf_area_cm2: float = 0.0
    alive_score: float = 0.0
    vision_status: str = "present"
    last_seen_ts: int = 0
    first_seen_ts: int = 0
    locked_species: str | None = None
    status: str = "present"


@dataclass
class Tracker:
    sticker_ids: list[int]
    plants: dict[int, PlantState] = field(default_factory=dict)
    active: dict[tuple, dict] = field(default_factory=dict)  # (code, tag) -> flag, currently true
    raised: list[dict] = field(default_factory=list)         # every flag raised since last drain
    started_ts: int | None = None
    _last_frame: str | None = None
    _same_frames: int = 0
    _new_tag_ts: list[int] = field(default_factory=list)

    # -- flags ---------------------------------------------------------------------------
    def raise_flag(self, code: str, ts: int, message: str, tag_id: int | None = None) -> None:
        key = (code, tag_id)
        if key not in self.active:
            f = flag(code, ts, message, tag_id)
            self.active[key] = f
            self.raised.append(f)

    def clear_flag(self, code: str, tag_id: int | None = None) -> None:
        self.active.pop((code, tag_id), None)

    def drain_raised(self) -> list[dict]:
        out, self.raised = self.raised, []
        return out

    def active_flags(self) -> list[dict]:
        return sorted(self.active.values(), key=lambda f: (f["ts"], f["code"]))

    # -- C1 ingest -----------------------------------------------------------------------
    def ingest(self, msg: dict, now_ms: int) -> None:
        ts = msg["ts"]
        if self.started_ts is None:
            self.started_ts = now_ms

        if abs(ts - now_ms) > CLOCK_DRIFT_MS:
            self.raise_flag("clock_drift", now_ms, f"vision ts {ts - now_ms:+d} ms from miner clock")
        else:
            self.clear_flag("clock_drift")

        if msg["frame_hash"] == self._last_frame:
            self._same_frames += 1
        else:
            self._last_frame, self._same_frames = msg["frame_hash"], 1
        if self._same_frames >= FROZEN_FRAMES:
            self.raise_flag("frozen_camera", now_ms, f"{self._same_frames} identical frames in a row")
        else:
            self.clear_flag("frozen_camera")
        frozen = self._same_frames >= FROZEN_FRAMES

        registered = set(self.sticker_ids)
        unknown = set(msg.get("unknown_tag_ids", []))
        for p in msg["plants"]:
            tag = p["tag_id"]
            if tag not in registered:
                unknown.add(tag)
                continue
            if p["status"] in ("missing", "removed"):  # vision lost it; keep last good readings
                st = self.plants.get(tag)
                if st:
                    st.vision_status = p["status"]
                continue
            st = self.plants.get(tag)
            if st is None:
                st = self.plants[tag] = PlantState(tag_id=tag, species=p["species"], first_seen_ts=now_ms)
                self._new_tag_ts.append(now_ms)
            st.species, st.species_conf = p["species"], p["species_conf"]
            st.leaf_area_cm2, st.alive_score = p["leaf_area_cm2"], p["alive_score"]
            st.vision_status = p["status"]
            if not frozen:  # a frozen feed must not refresh liveness
                st.last_seen_ts = p.get("last_seen_ts") or ts
            if st.locked_species is None and st.species != "unknown" and st.species_conf >= LOCK_SPECIES_CONF:
                st.locked_species = st.species

        for tag in sorted(unknown):
            self.raise_flag("unknown_sticker", now_ms, f"Tag {tag} is not registered to this miner", tag)

        self._new_tag_ts = [t for t in self._new_tag_ts if now_ms - t <= NEW_PLANT_WINDOW_MS]
        settled = now_ms - self.started_ts > NEW_PLANT_WINDOW_MS
        if settled and len(self._new_tag_ts) > NEW_PLANT_BURST:
            self.raise_flag("too_many_new_plants", now_ms, f"{len(self._new_tag_ts)} new tags in 60 s")
        elif not self._new_tag_ts:
            self.clear_flag("too_many_new_plants")

    # -- snapshot ------------------------------------------------------------------------
    def snapshot(self, now_ms: int) -> list[PlantState]:
        """Recompute every plant's status at now_ms and return them ordered by tag."""
        for tag, st in sorted(self.plants.items()):
            unseen = now_ms - st.last_seen_ts
            if unseen >= REMOVED_AFTER_MS or st.vision_status == "removed":
                status = "removed"
            elif unseen >= MISSING_AFTER_MS or st.vision_status == "missing":
                status = "missing"
            else:
                status = "present"

            mismatch = st.locked_species is not None and st.species != st.locked_species
            low_alive = st.alive_score < MIN_ALIVE
            if status == "present" and (mismatch or low_alive or st.vision_status == "suspect"
                                        or st.species == "unknown" or st.species_conf < MIN_SPECIES_CONF):
                status = "suspect"

            if status == "present" or status == "suspect":
                self.clear_flag("plant_missing", tag)
                self.clear_flag("plant_removed", tag)
            if status == "missing":
                self.raise_flag("plant_missing", now_ms, f"Tag {tag} unseen for {unseen // 1000} s", tag)
            if status == "removed":
                self.clear_flag("plant_missing", tag)
                self.raise_flag("plant_removed", now_ms, f"Tag {tag} unseen for {unseen // 1000} s", tag)
            if status == "suspect" and mismatch:
                self.raise_flag("species_mismatch", now_ms,
                          f"Tag {tag} now looks like {st.species}, registered as {st.locked_species}", tag)
            elif not mismatch:
                self.clear_flag("species_mismatch", tag)
            if status == "suspect" and low_alive:
                self.raise_flag("low_liveness", now_ms, f"alive_score {st.alive_score:.2f} (possible fake plant)", tag)
            elif not low_alive:
                self.clear_flag("low_liveness", tag)
            st.status = status
        return [self.plants[t] for t in sorted(self.plants)]
