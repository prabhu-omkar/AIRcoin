import json
import sys
from pathlib import Path

import pytest

PIPELINE = Path(__file__).resolve().parents[1]
REPO = PIPELINE.parents[1]
sys.path.insert(0, str(PIPELINE))

from aircoin_vision.config import load_rig  # noqa: E402


@pytest.fixture(scope="session")
def rig():
    return load_rig()


@pytest.fixture(scope="session")
def c1_validator():
    """Validator for C1 built from the shared contracts-schema (read-only)."""
    from jsonschema import Draft202012Validator
    from referencing import Registry, Resource

    schemas = REPO / "contracts-schema" / "schemas"
    resources = []
    for p in schemas.glob("*.schema.json"):
        s = json.loads(p.read_text())
        resources.append((s["$id"], Resource.from_contents(s)))
    registry = Registry().with_resources(resources)
    c1 = json.loads((schemas / "c1-vision-event.schema.json").read_text())
    return Draft202012Validator(c1, registry=registry)
