import pytest

from minerd.config import Config
from minerd.mockrun import build_engine, run_epoch
from minerd.signer import Signer

EPOCH = 29_860_000  # fixed epoch so runs are reproducible


@pytest.fixture(scope="session")
def cfg() -> Config:
    return Config.from_env()


@pytest.fixture(scope="session")
def device_address(cfg) -> str:
    return cfg.registration().device_address


def run(cfg, scenario="festival_smog", seed=1, drop=(), fake=()):
    engine, vision = build_engine(cfg, scenario, seed=seed)
    start = EPOCH * 60_000
    vision.faults.dropped = {t: start + 20_000 for t in drop}
    vision.faults.fake = set(fake)
    return engine, run_epoch(engine, vision, EPOCH)


@pytest.fixture(scope="session")
def smog(cfg):
    return run(cfg)


@pytest.fixture(scope="session")
def attestation(cfg, smog) -> dict:
    engine, result = smog
    return Signer(cfg.device_key()).sign(result.c3_unsigned(engine.cat.calibration_hash))
