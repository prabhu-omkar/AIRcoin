"""Lightweight runtime metrics for soak tests and the service health endpoint."""

from __future__ import annotations

import os

import psutil


def resources() -> dict:
    process = psutil.Process(os.getpid())
    memory = process.memory_info()
    result = {
        "rss_mb": round(memory.rss / 1024 / 1024, 2),
        "cpu_pct": process.cpu_percent(interval=None),
        "threads": process.num_threads(),
    }
    temperatures = getattr(psutil, "sensors_temperatures", lambda: {})()
    values = [entry.current for entries in temperatures.values() for entry in entries if entry.current]
    if values:
        result["cpu_temp_c"] = round(max(values), 1)
    return result
