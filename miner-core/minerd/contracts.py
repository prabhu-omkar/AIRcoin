"""Validate payloads with contracts-schema/scripts/validate.py (the shared source of truth)."""

from __future__ import annotations

import importlib.util
from functools import lru_cache

from .config import CONTRACTS


@lru_cache(maxsize=1)
def _validate_module():
    spec = importlib.util.spec_from_file_location("aircoin_validate", CONTRACTS / "scripts" / "validate.py")
    mod = importlib.util.module_from_spec(spec)
    spec.loader.exec_module(mod)
    return mod, mod.load_registry()


def errors(target: str, doc: dict) -> list[str]:
    """Schema + semantic errors for doc against a validate.py target (e.g. "c3-attestation")."""
    mod, registry = _validate_module()
    errs = [
        f"{'/'.join(map(str, e.absolute_path)) or '<root>'}: {e.message}"
        for e in mod.validator_for(registry, target).iter_errors(doc)
    ]
    return errs or mod.semantic_errors(target, doc)
