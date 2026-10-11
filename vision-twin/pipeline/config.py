from __future__ import annotations

import json
from dataclasses import dataclass
from pathlib import Path

ROOT = Path(__file__).resolve().parents[2]
DEFAULT_ENROLMENT = Path(__file__).resolve().parents[1] / "enrol" / "enrolment.json"
SPECIES = [
    "snake_plant", "peace_lily", "bamboo_palm", "red_edged_dracaena",
    "janet_craig_dracaena", "english_ivy", "chinese_evergreen",
    "florists_chrysanthemum", "weeping_fig", "money_plant", "spider_plant",
    "aloe_vera", "areca_palm", "boston_fern", "tulsi", "hibiscus", "neem",
    "shisham", "bougainvillea", "yellow_oleander",
]


@dataclass(frozen=True)
class EnrolledPlant:
    tag_id: int
    species: str
    reference_histogram: list[float] | None = None


def load_enrolment(path: Path = DEFAULT_ENROLMENT) -> dict[int, EnrolledPlant]:
    if path.exists():
        data = json.loads(path.read_text(encoding="utf-8"))
        return {
            int(row["tag_id"]): EnrolledPlant(
                int(row["tag_id"]), row["species"], row.get("reference_histogram")
            )
            for row in data["plants"]
        }
    return {i: EnrolledPlant(i, species) for i, species in enumerate(SPECIES)}

