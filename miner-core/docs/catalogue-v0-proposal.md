# Proposal: coefficient table v0 for the species catalogue

> **Accepted at the Phase 2 team gate.** These values are now frozen in catalogue v1.0.0;
> the temporary miner-core overlay has been removed.

**From:** Shreyas (Workstream B) · **For:** team sync, agreement from Omkar, Shreyas and Umashankar
**Affects:** `contracts-schema/data/species-catalogue.json` (frozen, so this needs all three to agree)

## Problem

The catalogue is draft `0.1.0`. Its species list and multiplier levels are filled in, but every number the estimator needs to produce an amount is `null`:

- `base_rates_mg_per_m2_h` (all 7 pollutants)
- `pollutants.*.ref_concentration` (all 7)
- `concentration_factor_cap`
- `caps.per_plant_air_per_epoch` and `caps.per_miner_air_per_epoch`

That is 17 values. Until they are set, the miner cannot compute an amount from the catalogue alone.

**Workaround in miner-core:** `miner-core/config/coefficients-v0.json` fills these 17 nulls and nothing else. If the catalogue gains a value, the catalogue wins. The miner logs a warning while the overlay is in use.

`calibration_hash` is still keccak256(JCS(catalogue as on disk)). So when the catalogue changes, the hash changes and the overlay is deleted. Nothing else needs to move.

## Proposed values

The estimator for plant *i* and pollutant *p* over one sample of length Δt:

```
R = k[s][p] × leaf_area_m2 × health × min(C / C_ref, factor_cap) × Δt_h       (mg)
k[s][p] = base_rate[p] × multiplier_levels[level]     (high 1.5 · medium 1.0 · low 0.5)
AIR = Σ_p weight[p] × R
```

### Base rates (mg removed per m² leaf per hour at C = C_ref, for a "medium" species)

For PM and the gases, the base rate is a dry-deposition flux, `F = v_d × C_ref`, where `v_d` is the deposition velocity to leaf surfaces. Urban-forest models (Nowak et al., i-Tree Eco) use the same approach. Published `v_d` values span an order of magnitude with wind, leaf texture and particle size. We picked mid-range values, not best-case ones.

| Pollutant | Base rate | Implied v_d | Basis |
|-----------|-----------|-------------|-------|
| pm25 | 0.25 | ≈ 0.2 cm/s at 35 µg/m³ | Fine-particle leaf deposition. Reviews (e.g. Litschke & Kuttler 2008) report about 0.03–1 cm/s, so we took the low-middle. |
| pm10 | 1.0 | ≈ 0.55 cm/s at 50 µg/m³ | Coarse particles deposit faster. This is close to the PM10 velocity used in i-Tree (Nowak 2006). |
| no2 | 0.17 | ≈ 0.1 cm/s at 25 ppb (≈ 47 µg/m³) | Stomatal uptake, which is low indoors and at low light. |
| so2 | 0.47 | ≈ 0.5 cm/s at 10 ppb (≈ 26 µg/m³) | SO₂ is very soluble, so it deposits faster than NO₂. |
| co | 0.04 | ≈ 0.001 cm/s at 1 ppm (≈ 1.15 mg/m³) | Plants take up almost no CO. This keeps it negligible, as in i-Tree. |
| voc | 0.5 | — (VOC index, not a mass) | Order of magnitude from NASA's chamber study (Wolverton et al. 1989). Per-plant removal of formaldehyde/benzene was on the order of mg/h, for roughly 0.5–1 m² of leaf. Only weakly grounded, because the 1989 sealed-chamber results do not carry over to open rooms (Cummings & Waring 2019). Its health weight is 0.03, so it barely moves AIR. |
| co2 | 300 | — | Net photosynthesis of about 2 µmol CO₂/m²/s, typical of foliage plants in indoor light. Its weight is 0.0015, so 300 mg of CO₂ counts for about 0.45 mg of PM2.5-equivalent. |

### Reference concentrations (C_ref)

The reference concentration is the level where the concentration factor is 1. We chose round values close to familiar guideline levels, so "1× = an ordinary bad-ish day":

| Pollutant | C_ref | Unit | Anchor |
|-----------|-------|------|--------|
| pm25 | 35 | µg/m³ | US EPA 24-h PM2.5 standard (35) |
| pm10 | 50 | µg/m³ | WHO 2005 24-h PM10 guideline (50) |
| no2 | 25 | ppb | About 47 µg/m³, near the WHO 2005 annual guideline (40 µg/m³) |
| so2 | 10 | ppb | About 26 µg/m³, below the WHO 2021 24-h guideline (40 µg/m³) |
| voc | 100 | VOC index | Sensirion VOC-index baseline (100 = average for that sensor) |
| co2 | 420 | ppm | Current outdoor background |
| co | 1 | ppm | About 1.15 mg/m³, well below the WHO 24-h guideline (4 mg/m³) |

### Caps

| Key | Value | Why |
|-----|-------|-----|
| `concentration_factor_cap` | 5 | Uptake saturates, and a faulty or spoofed sensor should not be able to multiply payouts without limit. Festival smog (PM2.5 245, ratio 7) is clipped to 5. |
| `per_plant_air_per_epoch` | 0.01 | Any one plant is limited to 0.01 AIR per epoch, so the most 20 plants can earn is 0.2. |
| `per_miner_air_per_epoch` | 0.2 | Well under the validator's hard cap (1 AIR per epoch), so honest miners are never rejected for `amount_over_cap`. When the sum goes over, each plant is scaled down in proportion. |

### What this gives (20 mock plants, one 60 s epoch, `pytest tests/test_estimate.py`)

| Scenario | AQI (CPCB) | AIR / epoch |
|----------|-----------|-------------|
| rain_washout | ~19 | ~0.007 |
| clean_morning | ~48 | ~0.012 |
| rush_hour | ~189 | ~0.031 |
| festival_smog | ~400 | ~0.052 |

The demo story holds: an AQI spike raises the mint rate about 4×, and every value stays below both caps.

## Other items for the same sync

1. **`sticker_set_hash` packing is ambiguous.**
   - chain-market's `seed.ts` uses `keccak256(solidityPacked(uint16 × 20))`, which is 2 bytes per id. For tags 0–19 that gives `0x0d5181b9…`.
   - `contracts-schema/examples/valid/registry.json` has `0x75280c76…`. That matches neither 2-byte packing nor 32-byte `abi.encodePacked(uint16[])` (`0x2759…`).
   - We should pick one, write it into the schema description, and fix the example. miner-core uses the 2-byte form for now, so it agrees with the deployed registry.
2. **The validator does not recompute `evidence_hash` or `calibration_hash`.** It only checks the signature over the digest. That works for the demo. To make `calibration_mismatch` real, it would need to hash its own copy of the catalogue. This is Umashankar's call.
3. **Freezing.** Once these values (or edited ones) are agreed:
   - bump `catalogue_version` to `1.0.0` and set `status: "frozen"` at the Phase 2 gate;
   - delete `miner-core/config/coefficients-v0.json`;
   - re-run `python contracts-schema/scripts/validate.py`.

## Caveats

These are literature-seeded estimates for a hackathon demo, not measured values. The real numbers would come from the enclosure calibration protocol in `docs/calibration-protocol.md` (Phase 3). Each pollutant's measured decay rate with a plant, minus the decay rate in the empty chamber, gives `k` for that species directly.
