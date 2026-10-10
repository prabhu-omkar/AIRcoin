"""Canonical JSON (RFC 8785 / JCS) and keccak256 helpers shared by the catalogue and signer."""

from __future__ import annotations

import hashlib
from typing import Any

import rfc8785
from eth_utils import keccak


def jcs(obj: Any) -> bytes:
    return rfc8785.dumps(obj)


def hex32(b: bytes) -> str:
    return "0x" + b.hex()


def keccak_hex(data: bytes) -> str:
    return hex32(keccak(data))


def keccak_jcs(obj: Any) -> str:
    return keccak_hex(jcs(obj))


def sha256_hex(data: bytes) -> str:
    return hex32(hashlib.sha256(data).digest())
