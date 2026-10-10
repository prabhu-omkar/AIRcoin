"""Build an engine from config and run whole epochs on a synthetic clock with mock vision."""

from __future__ import annotations

from .catalogue import Catalogue
from .config import EPOCH_MS, Config
from .engine import Engine
from .epoch import EpochResult
from .gps import FallbackGps
from simulator.plants import MockVision
from simulator.scenarios import SensorSimulator


def build_engine(cfg: Config, scenario: str, seed: int | None = None) -> tuple[Engine, MockVision]:
    reg = cfg.registration()
    cat = Catalogue.load(cfg.catalogue_path, cfg.overlay_path)
    engine = Engine(reg, cat, SensorSimulator(scenario, seed=seed), FallbackGps(reg.lat, reg.lon))
    vision = MockVision(reg.miner_id, reg.sticker_ids, seed=seed)
    return engine, vision


def run_epoch(engine: Engine, vision: MockVision | None, epoch: int, tick_ms: int = 1000) -> EpochResult:
    """Feed one full epoch (vision + 1 Hz ticks), then close it."""
    start = epoch * EPOCH_MS
    for t in range(start, start + EPOCH_MS, tick_ms):
        if vision is not None:
            engine.ingest_vision(vision.message(t), t)
        engine.tick(t)
    return engine.close_current()
