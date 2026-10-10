"""Species catalogue + calibration table.

The frozen catalogue in contracts-schema/ is the source of truth and is hashed,
unmodified, into every attestation as calibration_hash. Overlay support remains only for
backward compatibility with old development catalogues.
"""

from __future__ import annotations

import json
import logging
from dataclasses import dataclass
from pathlib import Path

from .canonical import keccak_jcs

log = logging.getLogger(__name__)

POLLUTANTS = ("pm25", "pm10", "no2", "so2", "voc", "co2", "co")

# sensor_readings key holding the concentration of each pollutant, in the catalogue's unit
SENSOR_KEY = {
    "pm25": "pm25_ugm3",
    "pm10": "pm10_ugm3",
    "no2": "no2_ppb",
    "so2": "so2_ppb",
    "voc": "voc_index",
    "co2": "co2_ppm",
    "co": "co_ppm",
}


@dataclass
class Catalogue:
    version: str
    status: str
    calibration_hash: str
    weights: dict[str, float]
    ref_concentration: dict[str, float]
    factor_cap: float
    per_plant_cap: float
    per_miner_cap: float
    k: dict[str, dict[str, float]]  # species -> pollutant -> mg / m2 leaf / h at C_ref
    names: dict[str, str]
    overlaid: list[str]

    @classmethod
    def load(cls, path: Path, overlay_path: Path | None = None) -> "Catalogue":
        doc = json.loads(path.read_text(encoding="utf-8"))
        calibration_hash = keccak_jcs(doc)
        overlay = {}
        if overlay_path and overlay_path.exists():
            overlay = json.loads(overlay_path.read_text(encoding="utf-8"))
        overlaid: list[str] = []

        def pick(value, fallback, name):
            if value is not None:
                return value
            if fallback is None:
                raise ValueError(f"catalogue value {name} is null and no overlay provides it")
            overlaid.append(name)
            return fallback

        base = {
            p: pick(doc["base_rates_mg_per_m2_h"].get(p), overlay.get("base_rates_mg_per_m2_h", {}).get(p),
                    f"base_rates_mg_per_m2_h.{p}")
            for p in POLLUTANTS
        }
        ref = {
            p: pick(doc["pollutants"][p]["ref_concentration"], overlay.get("ref_concentration", {}).get(p),
                    f"pollutants.{p}.ref_concentration")
            for p in POLLUTANTS
        }
        factor_cap = pick(doc.get("concentration_factor_cap"), overlay.get("concentration_factor_cap"),
                          "concentration_factor_cap")
        caps, ocaps = doc.get("caps", {}), overlay.get("caps", {})
        per_plant = pick(caps.get("per_plant_air_per_epoch"), ocaps.get("per_plant_air_per_epoch"),
                         "caps.per_plant_air_per_epoch")
        per_miner = pick(caps.get("per_miner_air_per_epoch"), ocaps.get("per_miner_air_per_epoch"),
                         "caps.per_miner_air_per_epoch")

        levels = doc["multiplier_levels"]
        k: dict[str, dict[str, float]] = {}
        for s in doc["species"]:
            overrides = s.get("coefficient_overrides", {})
            k[s["id"]] = {
                p: overrides[p] if p in overrides else base[p] * levels[s["multipliers"][p]]
                for p in POLLUTANTS
            }

        if overlaid:
            log.warning("catalogue %s is %s: %d null coefficients filled from %s", doc["catalogue_version"],
                        doc["status"], len(overlaid), overlay_path.name)
        return cls(
            version=doc["catalogue_version"],
            status=doc["status"],
            calibration_hash=calibration_hash,
            weights={p: doc["pollutants"][p]["weight"] for p in POLLUTANTS},
            ref_concentration=ref,
            factor_cap=factor_cap,
            per_plant_cap=per_plant,
            per_miner_cap=per_miner,
            k=k,
            names={s["id"]: s["common_name"] for s in doc["species"]},
            overlaid=overlaid,
        )
