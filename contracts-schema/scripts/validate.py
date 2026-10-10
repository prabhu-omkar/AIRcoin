#!/usr/bin/env python3
"""Validate AIRcoin contract data against the v1 JSON Schemas.

Usage:
  python contracts-schema/scripts/validate.py                  # schemas, examples, species catalogue
  python contracts-schema/scripts/validate.py c1-vision-event msg.json [...]   # your own payloads

Example files are matched to a schema by the part of the file name before
the first dot (c2-epoch.json, c4-chain-event.mint.json, ...). Files in
examples/valid must pass; files in examples/invalid must fail.

Needs: pip install "jsonschema>=4.18"
"""

import json
import sys
from pathlib import Path

from jsonschema import Draft202012Validator
from referencing import Registry, Resource

ROOT = Path(__file__).resolve().parent.parent
SCHEMAS = ROOT / "schemas"
BASE = "https://aircoin.example/schemas/v1/"

# name used in example files / CLI -> (schema file, optional $defs entry)
TARGETS = {
    "c1-vision-event": ("c1-vision-event.schema.json", None),
    "c2-telemetry": ("c2-telemetry.schema.json", None),
    "c2-epoch": ("c2-epoch.schema.json", None),
    "c3-attestation": ("c3-attestation.schema.json", None),
    "c3-attestation-response": ("c3-attestation-response.schema.json", None),
    "c4-miner": ("c4-chain-api.schema.json", "miner"),
    "c4-balance": ("c4-chain-api.schema.json", "balance"),
    "c4-mint-list": ("c4-chain-api.schema.json", "mint_list"),
    "c4-error": ("c4-chain-api.schema.json", "error"),
    "c4-chain-event": ("c4-chain-event.schema.json", None),
    "registry": ("registry.schema.json", None),
    "species-catalogue": ("species-catalogue.schema.json", None),
}


def load_registry():
    resources = []
    for path in sorted(SCHEMAS.glob("*.schema.json")):
        schema = json.loads(path.read_text())
        Draft202012Validator.check_schema(schema)
        assert schema["$id"] == BASE + path.name, f"{path.name}: $id must be {BASE + path.name}"
        resources.append((schema["$id"], Resource.from_contents(schema)))
    return Registry().with_resources(resources)


def validator_for(registry, target):
    file, definition = TARGETS[target]
    ref = BASE + file + (f"#/$defs/{definition}" if definition else "")
    return Draft202012Validator({"$ref": ref}, registry=registry)


def semantic_errors(target, doc):
    """Rules JSON Schema cannot express."""
    errors = []
    if target == "registry":
        seen_ids, owner = set(), {}
        for m in doc.get("miners", []):
            if m["miner_id"] in seen_ids:
                errors.append(f"duplicate miner_id {m['miner_id']}")
            seen_ids.add(m["miner_id"])
            for tag in m["sticker_ids"]:
                if tag in owner:
                    errors.append(f"sticker {tag} registered to both {owner[tag]} and {m['miner_id']}")
                owner[tag] = m["miner_id"]
    if target == "species-catalogue":
        ids = [s["id"] for s in doc["species"]]
        numbers = sorted(s["number"] for s in doc["species"])
        if len(set(ids)) != len(ids):
            errors.append("duplicate species id")
        if numbers != list(range(1, 21)):
            errors.append("species numbers must be exactly 1..20")
    if target in ("c3-attestation", "c2-epoch"):
        start, end = (doc.get("start"), doc.get("end")) if target == "c3-attestation" else (doc.get("start_ms"), doc.get("end_ms"))
        if start is not None and end is not None and end <= start:
            errors.append("epoch end must be after start")
    return errors


def check(registry, target, path):
    doc = json.loads(Path(path).read_text())
    errors = [
        f"{'/'.join(map(str, e.absolute_path)) or '<root>'}: {e.message}"
        for e in validator_for(registry, target).iter_errors(doc)
    ]
    if not errors:
        errors = semantic_errors(target, doc)
    return errors


def target_of(path):
    name = path.name.split(".")[0]
    if name not in TARGETS:
        sys.exit(f"{path}: no schema for prefix '{name}'")
    return name


def main(argv):
    registry = load_registry()
    if argv:
        target, files = argv[0], argv[1:]
        if target not in TARGETS:
            sys.exit(f"unknown target '{target}', expected one of: {', '.join(TARGETS)}")
        failed = 0
        for f in files:
            errors = check(registry, target, f)
            print(("FAIL " if errors else "ok   ") + f)
            for e in errors:
                print("     " + e)
            failed += bool(errors)
        return 1 if failed else 0

    failed = 0
    cases = [(p, True) for p in sorted((ROOT / "examples/valid").glob("*.json"))]
    cases += [(p, False) for p in sorted((ROOT / "examples/invalid").glob("*.json"))]
    cases += [(ROOT / "data/species-catalogue.json", True)]
    for path, should_pass in cases:
        target = "species-catalogue" if path.name == "species-catalogue.json" else target_of(path)
        errors = check(registry, target, path)
        ok = (not errors) == should_pass
        label = "valid  " if should_pass else "invalid"
        print(f"{'ok  ' if ok else 'FAIL'} {label} {path.relative_to(ROOT)}")
        if not ok:
            failed += 1
            for e in errors or ["expected validation errors, got none"]:
                print("       " + e)
    print(f"\n{len(cases) - failed}/{len(cases)} checks passed")
    return 1 if failed else 0


if __name__ == "__main__":
    sys.exit(main(sys.argv[1:]))
