# miner-core · Workstream B · Miner core and PoUW engine

**Owner:** Shreyas
**Mission:** turn what the miner sees and senses into a trustworthy, signed claim of pollution removed. This is the "useful work" in Proof of Useful Work.

| Produces | Consumes |
|----------|----------|
| **C2** telemetry → MQTT `miner/{miner_id}/telemetry` (1/s) and epoch summaries → `miner/{miner_id}/epoch` (retained) | **C1** `miner/{miner_id}/vision` from vision-twin |
| **C3** signed attestations → `POST /v1/attestations` on chain-market's validator | |

Also owns the numbers in `contracts-schema/data/species-catalogue.json` (multipliers, base rates, reference concentrations, caps). Schemas and signing rules: [`../contracts-schema`](../contracts-schema/README.md). Do not change them on your own.

## Scope

1. **Sensor layer:** one driver interface per sensor (PM, gas/VOC, CO₂, NO₂, temp/humidity). All air sensors simulated; real PMS5003 / MQ-135 / SCD40 / BME280 drivers can drop in later.
2. **Sensor simulator:** daily curves + noise, correlated values (PM10 tracks PM2.5, humidity affects PM). Scenarios: clean morning (AQI ~50), rush hour (~180), festival smog (~400), rain washout. Switchable live.
3. **GPS service:** real module via gpsd / pynmea2; falls back to a fixed demo location (`fix: "fallback"`).
4. **Vision subscriber:** consumes C1 and keeps the latest state of each of the 20 plants.
5. **Species catalogue and calibration table:** versioned; its keccak256 goes into every attestation as `calibration_hash`.
6. **Estimation engine:** `R_i,p = k_s(i),p × A_i × H_i × f(C_p / C_p,ref) × Δt`, then `AIR = Σ_p w_p Σ_i R_i,p`. Caps per plant and per epoch. Missing plants count zero; suspect plants count zero and raise a flag.
7. **Epoch manager:** 60 s epochs in real time for the demo (`epoch = floor(start_ms / 60000)`).
8. **Attestation signer:** builds the C3 payload, computes `evidence_hash`, signs with the device key (secp256k1). Key generated on first boot and registered with chain-market's registry.
9. **Uplink:** posts C3 with retry and an offline queue so no epoch is lost if Wi-Fi drops.
10. **Telemetry:** publishes C2 every second and every epoch.
11. **Device-side anti-cheat flags:** unknown sticker, species mismatch, low liveness, GPS > 50 m from the registered spot, frozen camera (identical frame hashes), too many plants appearing at once, clock drift.
12. **Scenario controller:** small web panel to change the AQI scenario, simulate moving the miner, reset.
13. **Calibration protocol (document):** how the real enclosure test would work, for the pitch.

**Stack:** Python 3.11 asyncio daemon on Raspberry Pi OS, Mosquitto (root `docker-compose.yml`), gpsd / pynmea2, `eth-account` or `coincurve`, SQLite for the local log, systemd, FastAPI for the scenario controller.

## Suggested layout

```
miner-core/
├── minerd/         daemon: sensors, gps, vision subscriber, estimator, epochs, signer, uplink, telemetry
├── simulator/      sensor scenarios
├── controller/     FastAPI scenario controller panel
├── mock/           C2 and C3 mock emitters for the other workstreams
├── deploy/         systemd unit, Pi setup notes
└── docs/           calibration protocol one-pager
```

## Running locally

```bash
docker compose up -d mqtt          # from the repo root
```

Use `contracts-schema/examples/valid/c1-vision-event.json` (or vision-twin's C1 mock) as input until the camera is live. Validate output:

```bash
python contracts-schema/scripts/validate.py c2-telemetry my-telemetry.json
python contracts-schema/scripts/validate.py c3-attestation my-attestation.json
```

## Phase checklist

**Phase 1 · Foundations**
- [ ] One command produces a valid signed attestation from mock inputs
- [ ] Changing the scenario changes the estimate in the expected direction
- [ ] Tampering with any field makes the signature check fail
- [ ] Mock C2 and C3 emitters shipped; draft species list and coefficient table v0 with sources

**Phase 2 · Integration**
- [ ] Live epochs every 60 s with no manual step for 30 minutes
- [ ] Unplugging Wi-Fi for 2 minutes loses no epochs (queued and sent later)
- [ ] Removing a plant lowers the next epoch's estimate by that plant's share
- [ ] Calibration table v1 frozen and documented (`status: "frozen"` in the catalogue)

**Phase 3 · Demo hardening**
- [ ] Each anti-cheat flag reproduced on demand and visible in C2
- [ ] Two-hour soak test on the Pi finishes with no crash and no missed epoch
- [ ] Calibration protocol written up as a one-pager for judges

**Owns in the demo:** step 3 (AQI spike raises the mint rate) and the "how we calculate" explanation.
