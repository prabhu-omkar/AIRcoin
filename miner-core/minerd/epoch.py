"""Epoch accumulator: integrates 1 Hz samples into one epoch's C2 summary and C3 payload."""

from __future__ import annotations

from dataclasses import dataclass, field
from decimal import Decimal

from .catalogue import Catalogue
from .config import EPOCH_MS
from .estimator import air_of

AIR_DECIMALS = 18
_MG_PLACES = 9
_SENSOR_KEYS = ("pm25_ugm3", "pm10_ugm3", "co2_ppm", "voc_index", "no2_ppb", "so2_ppb", "co_ppm",
                "temp_c", "humidity_pct", "pressure_hpa")


def epoch_of(ts_ms: int) -> int:
    return ts_ms // EPOCH_MS


def epoch_window(epoch: int) -> tuple[int, int]:
    start = epoch * EPOCH_MS
    return start, start + EPOCH_MS


@dataclass
class _PlantAcc:
    species: str
    status: str = "present"
    removed: dict[str, float] = field(default_factory=dict)
    leaf_sum: float = 0.0
    health_sum: float = 0.0
    present_samples: int = 0
    last_leaf: float = 0.0


@dataclass
class EpochResult:
    miner_id: str
    epoch: int
    start_ms: int
    end_ms: int
    scenario: str | None
    gps: dict
    sensor_summary: dict
    plants: list[dict]
    by_pollutant_mg: dict[str, float]
    total_air: Decimal
    frame_hashes: list[str]
    flags: list[dict]

    @property
    def amount(self) -> str:
        return str(int(self.total_air * 10**AIR_DECIMALS))

    def c3_unsigned(self, calibration_hash: str) -> dict:
        """C3 attestation body without evidence_hash and signature (see signer.Signer.sign)."""
        att = {
            "v": 1,
            "miner_id": self.miner_id,
            "epoch": self.epoch,
            "start": self.start_ms,
            "end": self.end_ms,
            "gps": self.gps,
            "sensor_summary": self.sensor_summary,
            "plants": self.plants,
            "frame_hashes": self.frame_hashes,
            "flags": self.flags,
            "amount": self.amount,
            "calibration_hash": calibration_hash,
        }
        return att

    def c2_epoch(self, attestation: dict) -> dict:
        msg = {
            "v": 1,
            "miner_id": self.miner_id,
            "epoch": self.epoch,
            "start_ms": self.start_ms,
            "end_ms": self.end_ms,
            "sensor_summary": self.sensor_summary,
            "plants": self.plants,
            "by_pollutant_mg": self.by_pollutant_mg,
            "total_air": float(self.total_air),
            "attestation": attestation,
            "flags": self.flags,
        }
        if self.scenario:
            msg["scenario"] = self.scenario
        return msg


class EpochAccumulator:
    def __init__(self, miner_id: str, epoch: int, cat: Catalogue):
        self.miner_id, self.epoch, self.cat = miner_id, epoch, cat
        self.start_ms, self.end_ms = epoch_window(epoch)
        self.samples = 0
        self._stats: dict[str, list[float]] = {}  # key -> [sum, min, max, n]
        self._aqi_sum = 0.0
        self._plants: dict[int, _PlantAcc] = {}
        self._frames: list[str] = []
        self._flags: dict[tuple, dict] = {}
        self.gps: dict | None = None
        self.scenario: str | None = None
        self.running_air = 0.0

    def add_frame(self, frame_hash: str) -> None:
        if not self._frames or self._frames[-1] != frame_hash:
            self._frames.append(frame_hash)

    def add_flags(self, flags: list[dict]) -> None:
        for f in flags:
            self._flags.setdefault((f["code"], f.get("tag_id"), f["ts"]), f)

    def add_sample(self, sensors: dict, aqi: float, gps: dict, plants: list, rates: dict[int, dict[str, float]],
                   dt_s: float, scenario: str | None = None) -> None:
        """One tick. plants: tracker states; rates: tag -> mg/h for plants that earn this tick."""
        self.samples += 1
        self.gps, self.scenario = gps, scenario
        self._aqi_sum += aqi
        for k in _SENSOR_KEYS:
            if k in sensors:
                v = sensors[k]
                s = self._stats.setdefault(k, [0.0, v, v, 0])
                s[0] += v
                s[1], s[2] = min(s[1], v), max(s[2], v)
                s[3] += 1

        dt_h = dt_s / 3600
        for st in plants:
            acc = self._plants.setdefault(st.tag_id, _PlantAcc(species=st.species))
            acc.species, acc.status = st.species, st.status
            if st.status != "missing" and st.status != "removed":
                acc.last_leaf = st.leaf_area_cm2
            r = rates.get(st.tag_id)
            if not r:
                continue
            acc.present_samples += 1
            acc.leaf_sum += st.leaf_area_cm2
            acc.health_sum += st.alive_score
            for p, mg_h in r.items():
                acc.removed[p] = acc.removed.get(p, 0.0) + mg_h * dt_h
                self.running_air += self.cat.weights[p] * mg_h * dt_h

    def _sensor_summary(self) -> dict:
        summary: dict = {"samples": self.samples}
        if self.samples:
            summary["aqi"] = round(self._aqi_sum / self.samples, 1)
        for k in _SENSOR_KEYS:
            if k in self._stats:
                total, lo, hi, n = self._stats[k]
                summary[k] = {"mean": round(total / n, 2), "min": lo, "max": hi}
        return summary

    def close(self, still_active: list[dict] = ()) -> EpochResult:
        """Apply the final-status rule and caps, round, and freeze the epoch.

        A plant is paid only if it is present when the epoch closes; anything missing, removed
        or suspect at close reports removed_mg {} and air 0 for the whole epoch.
        """
        self.add_flags(list(still_active))
        cat = self.cat
        rows = []
        for tag, a in sorted(self._plants.items()):
            paid = a.status == "present" and a.present_samples > 0
            removed = dict(a.removed) if paid else {}
            air = air_of(cat, removed)
            if air > cat.per_plant_cap:
                scale = cat.per_plant_cap / air
                removed = {p: mg * scale for p, mg in removed.items()}
                air = cat.per_plant_cap
            rows.append((tag, a, paid, removed, air))

        total = sum(r[4] for r in rows)
        miner_scale = cat.per_miner_cap / total if total > cat.per_miner_cap else 1.0

        plants, by_pollutant, total_air = [], {}, Decimal(0)
        for tag, a, paid, removed, air in rows:
            removed = {p: round(mg * miner_scale, _MG_PLACES) for p, mg in removed.items()}
            removed = {p: mg for p, mg in removed.items() if mg > 0}
            air = round(air * miner_scale, _MG_PLACES)
            for p, mg in removed.items():
                by_pollutant[p] = by_pollutant.get(p, 0.0) + mg
            total_air += Decimal(repr(air))
            if paid:
                leaf, health = a.leaf_sum / a.present_samples, a.health_sum / a.present_samples
            else:
                leaf, health = (a.last_leaf if a.status == "suspect" else 0.0), 0.0
            plants.append({
                "tag_id": tag,
                "species": a.species,
                "status": a.status,
                "leaf_area_cm2": round(leaf, 1),
                "health": round(min(1.0, max(0.0, health)), 3),
                "removed_mg": removed,
                "air": air,
            })

        return EpochResult(
            miner_id=self.miner_id,
            epoch=self.epoch,
            start_ms=self.start_ms,
            end_ms=self.end_ms,
            scenario=self.scenario,
            gps=self.gps or {},
            sensor_summary=self._sensor_summary(),
            plants=plants,
            by_pollutant_mg={p: round(v, _MG_PLACES) for p, v in by_pollutant.items()},
            total_air=total_air,
            frame_hashes=list(self._frames),
            flags=sorted(self._flags.values(), key=lambda f: (f["ts"], f["code"], f.get("tag_id", -1))),
        )
