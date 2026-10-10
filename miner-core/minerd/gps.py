"""GPS sources with a registered-location fallback for indoor demos."""

from __future__ import annotations

import math
import json
import logging
import socket

log = logging.getLogger(__name__)

EARTH_M = 6_371_000


def haversine_m(lat1: float, lon1: float, lat2: float, lon2: float) -> float:
    p1, p2 = math.radians(lat1), math.radians(lat2)
    dp, dl = p2 - p1, math.radians(lon2 - lon1)
    a = math.sin(dp / 2) ** 2 + math.cos(p1) * math.cos(p2) * math.sin(dl / 2) ** 2
    return 2 * EARTH_M * math.asin(math.sqrt(a))


class FallbackGps:
    def __init__(self, lat: float, lon: float):
        self.lat, self.lon = lat, lon
        self.offset_m = (0.0, 0.0)  # (north, east) shift to simulate moving the miner

    def read(self, ts_ms: int) -> dict:
        north, east = self.offset_m
        lat = self.lat + north / 111_320
        lon = self.lon + east / (111_320 * math.cos(math.radians(self.lat)))
        return {"lat": round(lat, 7), "lon": round(lon, 7), "fix": "fallback", "ts": ts_ms}


class GpsdGps:
    """Read one TPV fix from gpsd; fall back when gpsd or satellites are unavailable."""

    def __init__(self, fallback: FallbackGps, host: str = "127.0.0.1", port: int = 2947):
        self.fallback, self.host, self.port = fallback, host, port

    def read(self, ts_ms: int) -> dict:
        try:
            with socket.create_connection((self.host, self.port), timeout=0.25) as sock:
                sock.sendall(b'?WATCH={"enable":true,"json":true};\n')
                stream = sock.makefile("r", encoding="utf-8")
                for _ in range(8):
                    doc = json.loads(stream.readline())
                    if doc.get("class") == "TPV" and doc.get("mode", 0) >= 2:
                        fix = {"lat": doc["lat"], "lon": doc["lon"], "fix": "3d" if doc["mode"] >= 3 else "2d",
                               "ts": ts_ms}
                        if "altMSL" in doc:
                            fix["alt_m"] = doc["altMSL"]
                        return fix
        except (OSError, ValueError, KeyError, json.JSONDecodeError):
            pass
        return self.fallback.read(ts_ms)


class SerialGps:
    def __init__(self, fallback: FallbackGps, device: str):
        self.fallback, self.device = fallback, device

    def read(self, ts_ms: int) -> dict:
        try:
            import pynmea2
            import serial
            with serial.Serial(self.device, 9600, timeout=0.3) as port:
                for _ in range(5):
                    msg = pynmea2.parse(port.readline().decode("ascii", errors="ignore"))
                    if getattr(msg, "latitude", 0) and getattr(msg, "longitude", 0):
                        return {"lat": msg.latitude, "lon": msg.longitude, "fix": "2d", "ts": ts_ms}
        except (ImportError, OSError, ValueError):
            pass
        return self.fallback.read(ts_ms)


def make_gps(source: str, lat: float, lon: float):
    fallback = FallbackGps(lat, lon)
    if source == "gpsd":
        return GpsdGps(fallback)
    if source.startswith("serial:"):
        return SerialGps(fallback, source.split(":", 1)[1])
    return fallback
