"""Simulated air sensors.

Each scenario is a set of target means. Readings drift towards the active scenario's targets
(so a live switch ramps over ~10 s instead of jumping), with a slow wobble and noise. PM10
tracks PM2.5, and high humidity inflates optical PM readings (hygroscopic growth).
AQI follows India's CPCB National AQI (max sub-index of PM2.5, PM10, NO2, SO2, CO).
"""

from __future__ import annotations

import math
import random

SCENARIOS: dict[str, dict[str, float]] = {
    # AQI ~45: fresh air after a calm night
    "clean_morning": {"pm25_ugm3": 28, "pm10_ugm3": 45, "no2_ppb": 12, "so2_ppb": 3, "co_ppm": 0.4,
                      "co2_ppm": 420, "voc_index": 80, "temp_c": 22, "humidity_pct": 62, "pressure_hpa": 913},
    # AQI ~180: traffic peak
    "rush_hour": {"pm25_ugm3": 85, "pm10_ugm3": 150, "no2_ppb": 55, "so2_ppb": 9, "co_ppm": 1.8,
                  "co2_ppm": 520, "voc_index": 180, "temp_c": 30, "humidity_pct": 48, "pressure_hpa": 912},
    # AQI ~400: Diwali-night smog
    "festival_smog": {"pm25_ugm3": 245, "pm10_ugm3": 340, "no2_ppb": 70, "so2_ppb": 22, "co_ppm": 2.6,
                      "co2_ppm": 600, "voc_index": 300, "temp_c": 26, "humidity_pct": 58, "pressure_hpa": 914},
    # AQI ~15: rain has scrubbed the air, little left for plants to remove
    "rain_washout": {"pm25_ugm3": 8, "pm10_ugm3": 15, "no2_ppb": 8, "so2_ppb": 2, "co_ppm": 0.3,
                     "co2_ppm": 410, "voc_index": 60, "temp_c": 21, "humidity_pct": 94, "pressure_hpa": 909},
}

DEFAULT_SCENARIO = "clean_morning"

_KEYS = ("pm25_ugm3", "pm10_ugm3", "co2_ppm", "voc_index", "no2_ppb", "so2_ppb", "co_ppm",
         "temp_c", "humidity_pct", "pressure_hpa")
_NOISE = {"temp_c": 0.003, "pressure_hpa": 0.0005, "humidity_pct": 0.01, "co2_ppm": 0.01}
_RAMP_TAU_S = 4.0

# CPCB NAQI breakpoints: (concentration low, high) per AQI band 0-50, 51-100, ... 401-500
_BANDS = [0, 50, 100, 200, 300, 400, 500]
_BREAKPOINTS = {
    "pm25": [0, 30, 60, 90, 120, 250, 380],          # ug/m3
    "pm10": [0, 50, 100, 250, 350, 430, 510],        # ug/m3
    "no2": [0, 40, 80, 180, 280, 400, 520],          # ug/m3
    "so2": [0, 40, 80, 380, 800, 1600, 2400],        # ug/m3
    "co": [0, 1, 2, 10, 17, 34, 50],                 # mg/m3
}
# ppb -> ug/m3 and ppm -> mg/m3 at 25 C
_TO_MASS = {"no2": 1.88, "so2": 2.62, "co": 1.145}


def _sub_index(pollutant: str, conc: float) -> float:
    bp = _BREAKPOINTS[pollutant]
    for i in range(1, len(bp)):
        if conc <= bp[i]:
            return _BANDS[i - 1] + (_BANDS[i] - _BANDS[i - 1]) * (conc - bp[i - 1]) / (bp[i] - bp[i - 1])
    return 500.0


def aqi(r: dict) -> float:
    subs = [_sub_index("pm25", r["pm25_ugm3"]), _sub_index("pm10", r["pm10_ugm3"]),
            _sub_index("no2", r["no2_ppb"] * _TO_MASS["no2"])]
    if "so2_ppb" in r:
        subs.append(_sub_index("so2", r["so2_ppb"] * _TO_MASS["so2"]))
    if "co_ppm" in r:
        subs.append(_sub_index("co", r["co_ppm"] * _TO_MASS["co"]))
    return round(min(500.0, max(subs)), 1)


class SensorSimulator:
    def __init__(self, scenario: str = DEFAULT_SCENARIO, seed: int | None = None):
        self._rng = random.Random(seed)
        self.scenario = self._check(scenario)
        self._state = dict(SCENARIOS[self.scenario])  # start settled, no ramp
        self._last_ms: int | None = None

    @staticmethod
    def _check(name: str) -> str:
        if name not in SCENARIOS:
            raise ValueError(f"unknown scenario {name!r}, expected one of {', '.join(SCENARIOS)}")
        return name

    def set_scenario(self, name: str) -> None:
        self.scenario = self._check(name)

    def read(self, ts_ms: int) -> dict:
        dt = 1.0 if self._last_ms is None else max(0.0, (ts_ms - self._last_ms) / 1000)
        self._last_ms = ts_ms
        target = SCENARIOS[self.scenario]
        alpha = 1 - math.exp(-dt / _RAMP_TAU_S) if dt else 0.0
        for k in _KEYS:
            self._state[k] += (target[k] - self._state[k]) * alpha

        wobble = 1 + 0.04 * math.sin(2 * math.pi * ts_ms / 600_000)  # 10-minute swell
        out = {}
        for k in _KEYS:
            v = self._state[k]
            if k not in ("temp_c", "pressure_hpa", "humidity_pct"):
                v *= wobble
            out[k] = v * (1 + self._rng.gauss(0, _NOISE.get(k, 0.03)))

        # PM10 always carries the PM2.5 fraction; humid air swells optical PM readings
        out["pm10_ugm3"] = max(out["pm10_ugm3"], out["pm25_ugm3"] * 1.1)
        swell = 1 + 0.25 * max(0.0, (out["humidity_pct"] - 75) / 25)
        out["pm25_ugm3"] *= swell
        out["pm10_ugm3"] *= swell

        out["humidity_pct"] = min(100.0, max(0.0, out["humidity_pct"]))
        out["voc_index"] = min(500.0, max(0.0, out["voc_index"]))
        readings = {k: round(max(0.0, v), 1 if k != "co_ppm" else 2) for k, v in out.items()}
        readings["voc_index"] = round(readings["voc_index"])
        return readings
