"""The miner pipeline, clock-driven: sensors + GPS + tracked plants -> telemetry and closed epochs.

The engine never reads the wall clock itself; callers pass now_ms. The mock CLI drives it with
a synthetic clock (an epoch in milliseconds), the emitters and the Phase 2 daemon at 1 Hz.
"""

from __future__ import annotations

from .catalogue import Catalogue
from .config import Registration
from .epoch import EpochAccumulator, EpochResult, epoch_of
from .estimator import removal_rates_mg_per_h
from .gps import FallbackGps, haversine_m
from .tracker import Tracker
from .sensors import SensorSource, validate_reading
from simulator.scenarios import SensorSimulator, aqi as compute_aqi

MAX_TICK_S = 5.0


class Engine:
    def __init__(self, reg: Registration, cat: Catalogue, sensors: SensorSource, gps: FallbackGps,
                 sensors_simulated: bool = True):
        self.reg, self.cat, self.sensors, self.gps = reg, cat, sensors, gps
        self.sensors_simulated = sensors_simulated
        self.tracker = Tracker(sticker_ids=reg.sticker_ids)
        self.acc: EpochAccumulator | None = None
        self._last_tick: int | None = None
        self._pending_frames: list[str] = []

    @property
    def miner_id(self) -> str:
        return self.reg.miner_id

    def ingest_vision(self, msg: dict, now_ms: int) -> None:
        if msg.get("miner_id") != self.miner_id:
            return
        self.tracker.ingest(msg, now_ms)
        self._pending_frames.append(msg["frame_hash"])

    def close_current(self) -> EpochResult | None:
        if self.acc is None:
            return None
        result = self.acc.close(self.tracker.active_flags())
        self.acc = None
        return result

    def tick(self, now_ms: int) -> tuple[dict, EpochResult | None]:
        """Advance to now_ms: close the epoch if its window has passed, then take one sample."""
        closed = None
        if self.acc is not None and now_ms >= self.acc.end_ms:
            closed = self.close_current()
        if self.acc is None:
            self.acc = EpochAccumulator(self.miner_id, epoch_of(now_ms), self.cat)
        acc = self.acc

        dt_s = 1.0 if self._last_tick is None else min(MAX_TICK_S, max(0.0, (now_ms - self._last_tick) / 1000))
        self._last_tick = now_ms
        for h in self._pending_frames:
            acc.add_frame(h)
        self._pending_frames.clear()

        sensors = self.sensors.read(now_ms)
        validate_reading(sensors)
        air_quality = compute_aqi(sensors)
        gps = self.gps.read(now_ms)
        dist = haversine_m(self.reg.lat, self.reg.lon, gps["lat"], gps["lon"])
        if dist > self.reg.geofence_m:
            self.tracker.raise_flag("gps_out_of_geofence", now_ms,
                                    f"GPS {dist:.0f} m from registered spot (max {self.reg.geofence_m:.0f} m)")
        else:
            self.tracker.clear_flag("gps_out_of_geofence")

        plants = self.tracker.snapshot(now_ms)
        rates = {}
        rows = []
        for st in plants:
            r = (removal_rates_mg_per_h(self.cat, st.species, st.leaf_area_cm2, st.alive_score, sensors)
                 if st.status == "present" else {})
            if r:
                rates[st.tag_id] = r
            row = {
                "tag_id": st.tag_id,
                "species": st.species,
                "status": st.status,
                "leaf_area_cm2": st.leaf_area_cm2 if st.status in ("present", "suspect") else 0.0,
                "alive_score": st.alive_score if st.status in ("present", "suspect") else 0.0,
                "species_conf": st.species_conf,
                "rate_air_per_h": round(sum(self.cat.weights[p] * v for p, v in r.items()), 6),
            }
            rows.append(row)

        acc.add_sample(sensors, air_quality, gps, plants, rates, dt_s, self.sensors.scenario)
        acc.add_flags(self.tracker.drain_raised())

        telemetry = {
            "v": 1,
            "miner_id": self.miner_id,
            "ts": now_ms,
            "scenario": self.sensors.scenario,
            "sensors_simulated": self.sensors_simulated,
            "aqi": air_quality,
            "sensors": sensors,
            "gps": gps,
            "plants": rows[:20],
            "current_epoch": {
                "epoch": acc.epoch,
                "start_ms": acc.start_ms,
                "end_ms": acc.end_ms,
                "running_air": round(min(acc.running_air, self.cat.per_miner_cap), 6),
            },
            "flags": self.tracker.active_flags(),
        }
        return telemetry, closed
