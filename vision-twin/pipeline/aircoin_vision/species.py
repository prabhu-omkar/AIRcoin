"""Read-only access to the shared species catalogue (contracts-schema/data)."""

import json
from functools import lru_cache

from .config import REPO_ROOT

CATALOGUE = REPO_ROOT / "contracts-schema" / "data" / "species-catalogue.json"


@lru_cache(maxsize=1)
def catalogue():
    return {s["id"]: s for s in json.loads(CATALOGUE.read_text())["species"]}


def display_name(species_id):
    entry = catalogue().get(species_id)
    return entry["common_name"] if entry else species_id
