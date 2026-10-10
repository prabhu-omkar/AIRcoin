"""Everything miner-core emits must pass contracts-schema/scripts/validate.py."""

import json

from minerd.canonical import keccak_jcs
from minerd.contracts import errors
from minerd.mockrun import build_engine
from tests.conftest import EPOCH


def test_c3_attestation_valid(attestation):
    assert errors("c3-attestation", attestation) == []


def test_c2_epoch_valid_for_every_status(smog, attestation):
    _, result = smog
    base = {"evidence_hash": attestation["evidence_hash"], "amount": attestation["amount"]}
    for att in ({"status": "pending", **base}, {"status": "queued", **base}, {"status": "submitted", **base},
                {"status": "accepted", **base, "tx_hash": "0x" + "ab" * 32},
                {"status": "rejected", **base, "reason_code": "amount_over_cap", "reason": "too much"}):
        assert errors("c2-epoch", result.c2_epoch(att)) == [], att["status"]


def test_c2_telemetry_valid(cfg):
    engine, vision = build_engine(cfg, "rush_hour", seed=2)
    t0 = EPOCH * 60_000
    for i in range(15):
        engine.ingest_vision(vision.message(t0 + i * 1000), t0 + i * 1000)
        telemetry, _ = engine.tick(t0 + i * 1000)
        telemetry["uplink"] = {"online": True, "queued_attestations": 0}
        assert errors("c2-telemetry", telemetry) == [], i


def test_mock_vision_is_valid_c1(cfg):
    _, vision = build_engine(cfg, "clean_morning", seed=3)
    t0 = EPOCH * 60_000
    vision.faults.dropped = {4: t0}
    vision.faults.fake = {9}
    vision.faults.unknown_tags = {77}
    for t in (t0, t0 + 15_000, t0 + 70_000):
        assert errors("c1-vision-event", vision.message(t)) == []


def test_calibration_hash_is_catalogue_on_disk(cfg, attestation):
    doc = json.loads(cfg.catalogue_path.read_text(encoding="utf-8"))
    assert attestation["calibration_hash"] == keccak_jcs(doc)
