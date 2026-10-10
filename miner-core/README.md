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
pip install -r miner-core/requirements.txt
cd miner-core
cp .env.example .env               # optional; defaults work for miner-001
python -m pytest                   # signing, tamper, schema, estimator, tracker tests
```

**Phase 2 laptop mode** (dummy vision and registered-location GPS):

```bash
# Start the root MQTT service first when Docker is available.
docker compose up -d mqtt

# miner-core/.env: VISION_SOURCE=mock and GPS_SOURCE=none
python -m minerd daemon
```

The daemon emits C2 once per second, closes a signed epoch every 60 seconds and stores C3
in `var/minerd.sqlite` before delivery. Network and validator failures are retried with
backoff; accepted/rejected status is re-published on the retained C2 epoch topic.

The Phase 3 controller starts with the daemon at `http://localhost:8090`. Its panel can
switch AQI scenarios, remove/restore or fake a plant, freeze the camera, inject an unknown
sticker, move the simulated GPS outside its geofence, and reset the demo. Machine-readable
state is available at `GET /api/status`; OpenAPI documentation is at `/docs`.

**Live Shreyas → Umashankar integration tests** (requires the local chain and validator):

```bash
python -m pytest integration_tests -q
```

These tests submit real signed C3 payloads, verify the transaction receipt and exact
AIRToken balance increase, reject tampered evidence and an unapproved calibration hash,
and confirm that removing a plant lowers an accepted mint.

For the local mint path, start Hardhat with `npm run node`, deploy and seed from
`chain-market/contracts`, then run `node dist/server.js` from `chain-market/validator`.
The daemon posts to `http://localhost:3001` by default.

**One command, one signed attestation** (synthetic 60 s epoch, mock plants, simulated sensors):

```bash
python -m minerd attest --mock --scenario festival_smog --out out/att.json --epoch-out out/epoch.json
python -m minerd verify out/att.json                                   # evidence_hash + signer check
python ../contracts-schema/scripts/validate.py c3-attestation out/att.json
python -m minerd attest --mock --drop 3 --fake 12 --out out/faults.json  # tag 3 missing, 12 plastic: both earn 0
python -m minerd hashes                                                # calibration_hash, device address
python -m minerd c1check recording.jsonl   # or --mqtt: run vision-twin's C1 through the tracker, show what gets paid
```

What vision-twin must send and what its twin receives: [`docs/handoff-vision-twin.md`](docs/handoff-vision-twin.md).

Scenarios: `rain_washout` < `clean_morning` < `rush_hour` < `festival_smog` (AQI ~19 / 48 / 189 / 400).

**Mock emitters for the other workstreams** (MQTT ones need `docker compose up -d mqtt` from the repo root):

| Command | For | What it does |
|---------|-----|--------------|
| `python -m mock.c1_vision [--drop 3 --fake 12 --swap 5:neem --unknown 42 --frozen]` | miner-core itself | Stand-in for vision-twin: 20 plants on `miner/{id}/vision` at 1 Hz |
| `python -m mock.c2_emitter [--scenario rush_hour --cycle 3 --reject-every 5]` | vision-twin, chain-market | Real pipeline on mock inputs: telemetry 1/s, retained epoch messages going pending → submitted → accepted. **Never calls the validator**; tx_hash is fake |
| `python -m mock.c3_emitter [--post http://localhost:3001] [--tamper amount\|epoch\|plant\|gps\|signature]` | chain-market | Prints or POSTs a signed attestation for the last closed epoch |

The approved literature-seeded calibration catalogue is frozen as v1.0.0. Its decision
record and caveats are in [`docs/catalogue-v0-proposal.md`](docs/catalogue-v0-proposal.md).

## Phase checklist

**Phase 1 · Foundations**
- [x] One command produces a valid signed attestation from mock inputs
- [x] Changing the scenario changes the estimate in the expected direction
- [x] Tampering with any field makes the signature check fail
- [x] Mock C2 and C3 emitters shipped; draft species list and coefficient table v0 with sources (v0 awaiting team agreement)

**Phase 2 · Integration**
- [x] Live epochs every 60 s with no manual step (daemon plus accelerated soak verification)
- [x] Unplugging Wi-Fi / validator for 2 minutes loses no epochs (queued and recovered)
- [x] Removing a plant lowers the next epoch's estimate by that plant's share
- [x] Calibration table v1 frozen and documented (`status: "frozen"` in the catalogue)

**Phase 3 · Demo hardening**
- [x] Each software anti-cheat flag reproduced in tests and visible in C2
- [x] Two-hour accelerated soak validates 120 consecutive epochs with no missed epoch
- [x] Calibration protocol written up as a one-pager for judges

The accelerated soak is `python -m minerd soak --hours 2`. A final two-hour run on the actual
Raspberry Pi remains a hardware acceptance step; `/api/status` exposes RSS, CPU, threads and CPU
temperature when the operating system provides it.

**Owns in the demo:** step 3 (AQI spike raises the mint rate) and the "how we calculate" explanation.
