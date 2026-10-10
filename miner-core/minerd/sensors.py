"""Drop-in sensor interfaces used by the estimator and future Raspberry Pi drivers."""

from __future__ import annotations

from typing import Protocol, runtime_checkable


@runtime_checkable
class SensorSource(Protocol):
    """A source returns one normalized reading using the C2 sensor field names."""

    scenario: str

    def read(self, ts_ms: int) -> dict[str, float]: ...


REQUIRED_SENSOR_FIELDS = frozenset({
    "pm25_ugm3", "pm10_ugm3", "co2_ppm", "voc_index", "no2_ppb",
    "so2_ppb", "co_ppm", "temp_c", "humidity_pct", "pressure_hpa",
})


def validate_reading(reading: dict[str, float]) -> None:
    missing = REQUIRED_SENSOR_FIELDS - reading.keys()
    if missing:
        raise ValueError("sensor source missing fields: " + ", ".join(sorted(missing)))
    if any(not isinstance(reading[key], (int, float)) for key in REQUIRED_SENSOR_FIELDS):
        raise ValueError("all sensor readings must be numeric")
