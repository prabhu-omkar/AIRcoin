from decimal import Decimal

import pytest

from minerd.mockrun import build_engine, run_epoch
from tests.conftest import EPOCH, run


def by_tag(result):
    return {p["tag_id"]: p for p in result.plants}


def test_scenarios_order_by_pollution(cfg):
    air = {s: run(cfg, s)[1].total_air for s in ("rain_washout", "clean_morning", "rush_hour", "festival_smog")}
    assert air["rain_washout"] < air["clean_morning"] < air["rush_hour"] < air["festival_smog"]
    assert air["rain_washout"] > 0


def test_all_present_plants_paid(smog):
    _, result = smog
    assert len(result.plants) == 20
    assert all(p["status"] == "present" and p["air"] > 0 for p in result.plants)


def test_amount_is_total_in_base_units(smog):
    _, result = smog
    assert Decimal(result.amount) == int(result.total_air * 10**18)
    assert result.total_air == sum(Decimal(str(p["air"])) for p in result.plants)


def test_dropped_and_fake_plants_earn_nothing(cfg, smog):
    _, result = run(cfg, drop=[3], fake=[12])
    plants = by_tag(result)
    assert plants[3]["status"] == "missing"
    assert plants[12]["status"] == "suspect"
    for tag in (3, 12):
        assert plants[tag]["air"] == 0 and plants[tag]["removed_mg"] == {}
    assert result.total_air < smog[1].total_air
    codes = {(f["code"], f.get("tag_id")) for f in result.flags}
    assert ("plant_missing", 3) in codes and ("low_liveness", 12) in codes


def test_removed_plant_earns_nothing(cfg):
    engine, vision = build_engine(cfg, "rush_hour", seed=1)
    vision.faults.dropped = {5: EPOCH * 60_000 + 20_000}
    run_epoch(engine, vision, EPOCH)  # missing at the end of this epoch, removed by the end of the next
    result = run_epoch(engine, vision, EPOCH + 1)
    p = by_tag(result)[5]
    assert p["status"] == "removed" and p["air"] == 0 and p["leaf_area_cm2"] == 0


@pytest.mark.parametrize("scenario", ["festival_smog", "rush_hour"])
def test_caps_hold(cfg, scenario):
    engine, result = run(cfg, scenario)
    cat = engine.cat
    assert all(p["air"] <= cat.per_plant_cap for p in result.plants)
    assert result.total_air <= Decimal(str(cat.per_miner_cap))


def test_caps_bind_when_rates_are_huge(cfg):
    engine, vision = build_engine(cfg, "festival_smog", seed=1)
    cat = engine.cat
    for species in cat.k:
        cat.k[species] = {p: v * 1e6 for p, v in cat.k[species].items()}
    result = run_epoch(engine, vision, EPOCH)
    assert all(p["air"] <= cat.per_plant_cap + 1e-9 for p in result.plants)
    assert result.total_air <= Decimal(str(cat.per_miner_cap))
    assert result.total_air > Decimal(str(cat.per_miner_cap)) * Decimal("0.99")


def test_same_inputs_same_attestation(cfg):
    a, b = run(cfg, seed=7)[1], run(cfg, seed=7)[1]
    assert a.plants == b.plants and a.total_air == b.total_air
