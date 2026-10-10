import copy

import pytest

from minerd.signer import evidence_hash, recover, sticker_set_hash, verify
from mock.c3_emitter import TAMPER


def test_signed_attestation_verifies(attestation, device_address):
    assert verify(attestation, device_address) == []


def test_signer_is_registered_device(attestation, device_address):
    assert recover(attestation).lower() == device_address.lower()


def test_evidence_hash_excludes_unsigned_fields(attestation):
    a = copy.deepcopy(attestation)
    a["amount"], a["signature"] = "1", "0x" + "00" * 65
    assert evidence_hash(a) == attestation["evidence_hash"]


@pytest.mark.parametrize("field", sorted(TAMPER))
def test_tampering_breaks_verification(attestation, device_address, field):
    a = copy.deepcopy(attestation)
    TAMPER[field](a)
    assert a != attestation
    assert verify(a, device_address), f"tampered {field} still verifies"


@pytest.mark.parametrize("mutate", [
    lambda a: a["sensor_summary"]["pm25_ugm3"].update(mean=1.0),
    lambda a: a["frame_hashes"].pop(),
    lambda a: a["flags"].append({"code": "plant_missing", "severity": "warning", "ts": a["start"],
                                 "message": "x", "tag_id": 1}),
    lambda a: a.update(calibration_hash="0x" + "11" * 32),
    lambda a: a["plants"][1].update(species="tulsi" if a["plants"][1]["species"] != "tulsi" else "neem"),
])
def test_tampering_evidence_breaks_verification(attestation, device_address, mutate):
    a = copy.deepcopy(attestation)
    mutate(a)
    assert "evidence_hash_mismatch" in verify(a, device_address)


def test_signature_from_other_key_rejected(attestation, device_address):
    from eth_account import Account
    from minerd.signer import Signer
    other = Signer(Account.create().key.hex()).sign({k: v for k, v in attestation.items()
                                                     if k not in ("evidence_hash", "signature")})
    assert verify(other, device_address) == ["bad_signature"]


def test_sticker_set_hash_matches_chain_seed():
    # chain-market/contracts/scripts/seed.ts: keccak256(solidityPacked(uint16[] ...)) of tags 0..19
    assert sticker_set_hash(list(range(20))).startswith("0x0d5181b9")
