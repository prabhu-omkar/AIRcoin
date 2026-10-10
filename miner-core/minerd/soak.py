"""Accelerated deterministic soak validation for the miner pipeline."""

from __future__ import annotations

import time

import psutil

from . import contracts
from .config import Config, EPOCH_MS
from .diagnostics import resources
from .mockrun import build_engine
from .signer import Signer


def run(hours: float = 2.0) -> dict:
    cfg = Config.from_env()
    engine, vision = build_engine(cfg, "clean_morning", seed=2026)
    signer = Signer(cfg.device_key())
    duration_s = max(60, int(hours * 3600))
    start = 30_000_000 * EPOCH_MS
    expected = duration_s // 60
    epochs = []
    rss_start = psutil.Process().memory_info().rss
    wall_start = time.monotonic()

    for second in range(duration_s + 1):
        now = start + second * 1000
        engine.ingest_vision(vision.message(now), now)
        telemetry, closed = engine.tick(now)
        telemetry["uplink"] = {"online": True, "queued_attestations": 0}
        if contracts.errors("c2-telemetry", telemetry):
            raise RuntimeError(f"invalid telemetry at simulated second {second}")
        if closed is not None:
            att = signer.sign(closed.c3_unsigned(engine.cat.calibration_hash))
            if contracts.errors("c3-attestation", att):
                raise RuntimeError(f"invalid attestation for epoch {closed.epoch}")
            epochs.append(closed.epoch)

    if len(epochs) != expected or epochs != list(range(epochs[0], epochs[0] + expected)):
        raise RuntimeError(f"missed epoch: expected {expected}, got {len(epochs)}")
    rss_end = psutil.Process().memory_info().rss
    return {
        "ok": True,
        "simulated_hours": hours,
        "epochs": len(epochs),
        "missed_epochs": 0,
        "runtime_s": round(time.monotonic() - wall_start, 3),
        "rss_growth_mb": round((rss_end - rss_start) / 1024 / 1024, 2),
        "resources": resources(),
    }
