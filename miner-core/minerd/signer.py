"""C3 signing (contracts-schema/README.md#signing-c3).

evidence_hash = keccak256(JCS(attestation without amount, evidence_hash, signature))
digest        = keccak256(abi.encodePacked(bytes32 keccak256(utf8(miner_id)), uint64 epoch,
                                           uint256 amount, bytes32 evidence_hash))
signature     = EIP-191 personal_sign(digest) with the device key
"""

from __future__ import annotations

from eth_account import Account
from eth_account.messages import encode_defunct
from eth_utils import keccak

from .canonical import hex32, keccak_jcs

UNSIGNED_FIELDS = ("amount", "evidence_hash", "signature")


def evidence_hash(attestation: dict) -> str:
    return keccak_jcs({k: v for k, v in attestation.items() if k not in UNSIGNED_FIELDS})


def miner_key(miner_id: str) -> bytes:
    return keccak(miner_id.encode("utf-8"))


def mint_digest(miner_id: str, epoch: int, amount: int, ev_hash: str) -> bytes:
    packed = (
        miner_key(miner_id)
        + epoch.to_bytes(8, "big")
        + amount.to_bytes(32, "big")
        + bytes.fromhex(ev_hash.removeprefix("0x"))
    )
    return keccak(packed)


def sticker_set_hash(sticker_ids: list[int]) -> str:
    # 2 bytes per id, as chain-market's seed.ts registers it (solidityPacked(uint16, uint16, ...)).
    # Strict abi.encodePacked(uint16[]) would pad to 32 bytes; raised with the team.
    return hex32(keccak(b"".join(i.to_bytes(2, "big") for i in sorted(sticker_ids))))


class Signer:
    def __init__(self, private_key: str):
        self._account = Account.from_key(private_key)

    @property
    def address(self) -> str:
        return self._account.address

    def sign(self, attestation: dict) -> dict:
        """Return a copy of the attestation with evidence_hash and signature filled in."""
        att = {k: v for k, v in attestation.items() if k not in ("evidence_hash", "signature")}
        ev = evidence_hash(att)
        digest = mint_digest(att["miner_id"], att["epoch"], int(att["amount"]), ev)
        sig = self._account.sign_message(encode_defunct(primitive=digest)).signature
        att["evidence_hash"] = ev
        att["signature"] = "0x" + bytes(sig).hex()
        return att


def recover(attestation: dict) -> str:
    """Address that signed the attestation's digest (as the validator computes it)."""
    digest = mint_digest(attestation["miner_id"], attestation["epoch"], int(attestation["amount"]),
                         attestation["evidence_hash"])
    return Account.recover_message(encode_defunct(primitive=digest), signature=attestation["signature"])


def verify(attestation: dict, device_address: str) -> list[str]:
    """Full check: evidence_hash recomputes and the signature recovers to device_address."""
    problems = []
    if evidence_hash(attestation) != attestation.get("evidence_hash"):
        problems.append("evidence_hash_mismatch")
    try:
        if recover(attestation).lower() != device_address.lower():
            problems.append("bad_signature")
    except Exception:  # malformed signature bytes
        problems.append("bad_signature")
    return problems
