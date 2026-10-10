"""Live integration tests: Shreyas miner-core -> Umashankar validator -> AIRToken.

Prerequisites:
  * Hardhat JSON-RPC on http://127.0.0.1:8545 with contracts deployed/seeded
  * Validator on http://127.0.0.1:3001

Run from miner-core with: python -m pytest integration_tests -q
"""

from __future__ import annotations

import json
import secrets
import time
from pathlib import Path

import httpx
import pytest
from eth_utils import keccak

from minerd import contracts
from minerd.config import Config
from minerd.mockrun import build_engine, run_epoch
from minerd.signer import Signer
from minerd.uplink import UplinkQueue

VALIDATOR = "http://127.0.0.1:3001"
RPC = "http://127.0.0.1:8545"
ROOT = Path(__file__).resolve().parents[2]


def rpc(method: str, params: list) -> object:
    response = httpx.post(RPC, json={"jsonrpc": "2.0", "id": 1, "method": method, "params": params}, timeout=10)
    response.raise_for_status()
    body = response.json()
    if body.get("error"):
        pytest.fail(f"JSON-RPC {method} failed: {body['error']}")
    return body["result"]


@pytest.fixture(scope="session")
def live_stack():
    try:
        health = httpx.get(f"{VALIDATOR}/health", timeout=2).json()
        chain_id = rpc("eth_chainId", [])
    except Exception as exc:
        pytest.fail(
            "live integration stack is unavailable; start Hardhat, deploy/seed, and start the validator "
            f"before running this suite ({exc})"
        )
    assert health == {"status": "ok", "service": "validator"}
    assert int(chain_id, 16) == 31337
    return Config.from_env()


@pytest.fixture(scope="session")
def deployment():
    return json.loads((ROOT / "chain-market" / "contracts" / "deployments.json").read_text(encoding="utf-8"))


@pytest.fixture(scope="session")
def seed_data():
    return json.loads((ROOT / "chain-market" / "contracts" / "seed-data.json").read_text(encoding="utf-8"))


def unique_closed_epoch() -> int:
    """Return a random historical epoch so repeated test runs do not collide."""
    current = int(time.time() * 1000) // 60_000
    return current - 10_000 - secrets.randbelow(10_000_000)


def signed_epoch(cfg: Config, scenario: str = "rush_hour", removed: tuple[int, ...] = (),
                 epoch: int | None = None, seed: int | None = None) -> tuple[dict, object]:
    epoch = epoch if epoch is not None else unique_closed_epoch()
    engine, vision = build_engine(cfg, scenario, seed=seed if seed is not None else epoch)
    start = epoch * 60_000
    # Observe the plant first, then remove it during the epoch just as the demo does.
    vision.faults.dropped = {tag: start + 10_000 for tag in removed}
    result = run_epoch(engine, vision, epoch)
    attestation = Signer(cfg.device_key()).sign(result.c3_unsigned(engine.cat.calibration_hash))
    assert contracts.errors("c3-attestation", attestation) == []
    return attestation, result


def submit(attestation: dict) -> httpx.Response:
    return httpx.post(f"{VALIDATOR}/v1/attestations", json=attestation, timeout=30)


def token_balance(token: str, owner: str) -> int:
    selector = keccak(text="balanceOf(address)")[:4].hex()
    encoded_owner = owner.removeprefix("0x").lower().rjust(64, "0")
    value = rpc("eth_call", [{"to": token, "data": f"0x{selector}{encoded_owner}"}, "latest"])
    return int(value, 16)


def test_valid_miner_attestation_mints_exact_wallet_amount(live_stack, deployment, seed_data):
    owner = seed_data["miners"]["miner-001"]["ownerWallet"]
    token = deployment["AIRToken"]
    before = token_balance(token, owner)
    attestation, _ = signed_epoch(live_stack, "festival_smog")

    response = submit(attestation)
    assert response.status_code == 200, response.text
    body = response.json()
    assert contracts.errors("c3-attestation-response", body) == []
    assert body["status"] == "accepted"
    assert body["amount"] == attestation["amount"]

    receipt = rpc("eth_getTransactionReceipt", [body["tx_hash"]])
    assert receipt and int(receipt["status"], 16) == 1
    assert token_balance(token, owner) - before == int(attestation["amount"])


def test_tampered_miner_evidence_is_rejected(live_stack):
    attestation, _ = signed_epoch(live_stack)
    attestation["plants"][0]["health"] = 0.001
    response = submit(attestation)
    assert response.status_code == 422
    body = response.json()
    assert body["status"] == "rejected"
    assert body["reason_code"] == "evidence_hash_mismatch"


def test_unapproved_calibration_is_rejected(live_stack):
    epoch = unique_closed_epoch()
    engine, vision = build_engine(live_stack, "clean_morning", seed=epoch)
    result = run_epoch(engine, vision, epoch)
    unsigned = result.c3_unsigned("0x" + "11" * 32)
    attestation = Signer(live_stack.device_key()).sign(unsigned)

    response = submit(attestation)
    assert response.status_code == 422
    body = response.json()
    assert body["status"] == "rejected"
    assert body["reason_code"] == "calibration_mismatch"


def test_removed_plant_reduces_accepted_mint(live_stack):
    epoch = unique_closed_epoch()
    full, _ = signed_epoch(live_stack, "rush_hour", epoch=epoch, seed=7)
    removed, result = signed_epoch(live_stack, "rush_hour", removed=(3,), epoch=epoch - 1, seed=7)
    assert int(removed["amount"]) < int(full["amount"])
    plant = next(p for p in result.plants if p["tag_id"] == 3)
    assert plant["status"] in ("missing", "removed")
    assert plant["air"] == 0

    full_response = submit(full)
    removed_response = submit(removed)
    assert full_response.status_code == 200, full_response.text
    assert removed_response.status_code == 200, removed_response.text
    assert full_response.json()["status"] == "accepted"
    assert removed_response.json()["status"] == "accepted"


def test_durable_uplink_queue_delivers_to_validator_and_chain(live_stack, tmp_path):
    attestation, result = signed_epoch(live_stack, "clean_morning")
    queued = {"status": "queued", "evidence_hash": attestation["evidence_hash"],
              "amount": attestation["amount"]}
    epoch_doc = result.c2_epoch(queued)
    statuses = []
    uplink = UplinkQueue(tmp_path / "integration.sqlite", VALIDATOR,
                         lambda _doc, status: statuses.append(status))

    assert uplink.enqueue(attestation, epoch_doc)
    assert uplink.queued_count() == 1
    assert uplink.flush_once()
    assert uplink.queued_count() == 0
    assert uplink.online is True
    assert statuses[-1]["status"] == "accepted"
    receipt = rpc("eth_getTransactionReceipt", [statuses[-1]["tx_hash"]])
    assert receipt and int(receipt["status"], 16) == 1
