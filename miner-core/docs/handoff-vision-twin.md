# Brief for Omkar: what vision-twin has to build so miner-core can use it

**From:** Shreyas (miner-core) · **To:** Omkar (vision-twin) · **Status:** miner-core Phase 1 done, built against a mock of your C1

vision-twin isn't built yet, so miner-core runs on a stand-in for your camera (`miner-core/simulator/plants.py`). This brief covers:

- every assumption that stand-in makes about your data (section 2);
- what your twin will receive from miner-core and chain-market (section 3);
- how to check your output against the real miner code (section 4);
- the Phase 1 order of work (section 5);
- a prompt you can paste into your own Claude Code session (section 6).

The authority is the frozen schema `contracts-schema/schemas/c1-vision-event.schema.json`. This brief explains how miner-core *interprets* it. If you can't meet one of these assumptions, tell Shreyas. Don't change the schema.

---

## 1. Ground rules (from CLAUDE.md)

- Work only in `vision-twin/`. Do not edit `miner-core/`, `chain-market/` or `contracts-schema/`.
- `contracts-schema/` is frozen. Your code conforms to the schemas. Check what you publish with `python contracts-schema/scripts/validate.py c1-vision-event file.json`.
- Phase 1 runs against mocks: your C1 against miner-core, and your twin against the C2/C4 mocks. Live integration starts at Gate 2.

## 2. C1: what miner-core needs from you

**Transport:** MQTT `miner/miner-001/vision`, QoS 0, about once per second (one message per analysed frame). Broker: `mqtt://localhost:1883` (root `docker-compose.yml`).

**Miner:** `miner-001`, registered stickers **0–19** (ArUco). The demo layout of tags to species follows `contracts-schema/examples/valid/c1-vision-event.json`: tag 0 snake_plant, 1 peace_lily, … 19 yellow_oleander. Species ids come from `contracts-schema/data/species-catalogue.json`.

### Field by field: what B does with each value

| Field | What to send | What miner-core does with it |
|-------|--------------|------------------------------|
| `ts` | Capture time of the frame, in Unix **ms**. The Pi clock must be NTP-synced. | If it is more than 5 s from the miner's clock, B raises `clock_drift`. |
| `frame_hash` | `0x` + sha256 of the **raw frame bytes**, new for every frame. | 5 identical hashes in a row raise `frozen_camera` (critical), and B stops refreshing plant liveness. Every hash goes into the signed attestation. |
| `plants[]` | **All 20 registered tags in every message**, including unseen ones (status `missing`/`removed`, `bbox: null`, `leaf_area_cm2: 0`). | B times out tags on its own if you omit them: missing after 10 s and removed after 60 s. Sending them explicitly is still better. |
| `species` | The species **enrolled** for this tag. This stays constant; it is never the classifier's per-frame guess. Send `"unknown"` if the tag is not enrolled. | B "locks" the species once `species_conf` ≥ 0.6. If the value changes later, B raises `species_mismatch` and the plant earns 0. `unknown` earns 0. |
| `species_conf` | Similarity 0–1 between the live crop and the plant's enrolment feature vector (MobileNetV3, cosine). | **Below 0.5, the plant is suspect and earns 0.** Calibrate so a real plant sits around ≥ 0.8 and a swapped plant drops below 0.5. |
| `alive_score` | Liveness 0–1 (NDVI primary; match/texture fallback). | **Below 0.3, the plant is suspect** and B raises `low_liveness` (critical). Target: real plants ≥ 0.6, plastic < 0.3. |
| `leaf_area_cm2` | Visible green area of **this plant only**, in cm². Use the known marker size as the px→cm scale, and **smooth it** (for example, the median of the last 5 frames). | **The payout is linear in this value.** A spike means extra money, so don't let a hand, a shadow or a neighbouring plant inflate it. Typical potted plant: 100–2000 cm². B also caps each plant at 0.01 AIR per epoch. |
| `status` | Your debounced state: `present` / `missing` / `removed` / `suspect`. | B **trusts** `missing`, `removed` and `suspect` immediately (the plant earns 0). It never upgrades your status, but it can downgrade `present` to suspect with its own checks above. |
| `last_seen_ts` | Last time the tag was actually detected. | Used for B's own timeouts. |
| `bbox` | `[x, y, w, h]` as integer pixels, or `null` when not seen. | Not used by B. The twin uses it for overlays. |
| `ndvi` | Optional mean NDVI of the crop (−1 to 1). | Not used by B. Good for the twin's NDVI view. |
| `unknown_tag_ids` | Marker IDs in the frame that are **not** in 0–19. Do not put them in `plants`. | B raises `unknown_sticker` (warn) per id. |
| `frame_size` | `{w, h}` of the analysed frame. | Not used by B. |
| `source` | `pi_camera`, `laptop_camera`, `recorded` or `mock`. | Not used by B; shown in logs. |

### Rule of thumb

A plant earns AIR in an epoch only if it is `present` at the moment the epoch closes. That means: seen within the last 10 s, `species_conf` ≥ 0.5, `alive_score` ≥ 0.3, the species unchanged, and you didn't mark it suspect. So **false "suspect" costs the owner money, and false "present" lets cheaters in.** Debounce in both directions.

### The anti-cheat demo cases you must produce (PRD demo steps 3–5)

| Physical action | Expected C1 | What B does |
|-----------------|-------------|-------------|
| Pull a pot out | Tag absent → `missing` within 10 s → `removed` after 60 s | Earns 0, `plant_missing` / `plant_removed` |
| Plastic plant on a sticker | `alive_score` < 0.3, `status: "suspect"` | Earns 0, `low_liveness` |
| Move a sticker to a different plant | `species_conf` < 0.5, `status: "suspect"` | Earns 0 |
| Show the spare sticker (for example id 42) | `unknown_tag_ids: [42]` | `unknown_sticker` |
| Cover or freeze the camera | Same `frame_hash` repeated | `frozen_camera` |

## 3. What your twin receives

### C2 from miner-core (MQTT; the browser connects over WebSockets at `ws://localhost:9001`)

`miner/miner-001/telemetry`: 1/s, QoS 0. This is real output from miner-core:

```json
{
  "v": 1, "miner_id": "miner-001", "ts": 1791600002000,
  "scenario": "rush_hour", "sensors_simulated": true, "aqi": 194.0,
  "sensors": { "pm25_ugm3": 88.2, "pm10_ugm3": 151.0, "co2_ppm": 525.2, "voc_index": 178,
               "no2_ppb": 55.4, "so2_ppb": 9.3, "co_ppm": 1.84,
               "temp_c": 30.0, "humidity_pct": 47.5, "pressure_hpa": 912.2 },
  "gps": { "lat": 12.9716, "lon": 77.5946, "fix": "fallback", "ts": 1791600002000 },
  "plants": [ { "tag_id": 0, "species": "snake_plant", "status": "present", "leaf_area_cm2": 308.4,
                "alive_score": 0.865, "species_conf": 0.939, "rate_air_per_h": 0.063443 } ],
  "current_epoch": { "epoch": 29860000, "start_ms": 1791600000000, "end_ms": 1791600060000, "running_air": 0.001559 },
  "flags": [],
  "uplink": { "online": true, "queued_attestations": 0 }
}
```

`miner/miner-001/epoch`: once per 60 s epoch. It is QoS 1 and **retained**, so on connect you get the latest one straight away. It is republished as `attestation.status` moves through `pending → submitted → accepted` (with `tx_hash`), or ends `rejected` (with `reason_code`). Full sample: `contracts-schema/examples/valid/c2-epoch.json`. The fields you'll use:

- `plants[]`: `tag_id`, `species`, `status`, `leaf_area_cm2`, `health`, `removed_mg {pollutant: mg}`, `air`
- `by_pollutant_mg` and `total_air` (a float, for display)
- `attestation.amount` (an 18-decimal string; use BigInt or `formatUnits`, never a JS number)
- `flags[]`: `{code, severity: "warn" | "critical", ts, tag_id?, message}`. This is the anti-cheat log.

Flag codes: `unknown_sticker`, `species_mismatch`, `low_liveness`, `plant_missing`, `plant_removed`, `gps_out_of_geofence`, `frozen_camera`, `too_many_new_plants`, `clock_drift`.

**Plant grid colours (from the vision-twin README):** green = present, grey = missing/removed, red = suspect.

### C4 from chain-market (Umashankar)

- Real indexer: REST `http://localhost:3002/v1/miners/miner-001`, `/balance` and `/mints`. WebSocket `ws://localhost:3002/v1/events?miner_id=miner-001` sends `mint`, `transfer`, `trade` and `burn`.
- Mock: `cd chain-market && npm run dev:mock` serves the same routes on **port 3004**. Shapes: `contracts-schema/examples/valid/c4-*.json`.

### Mocks to drive the twin in Phase 1

```bash
docker compose up -d mqtt                                        # repo root
cd miner-core && python -m mock.c2_emitter --scenario rush_hour --cycle 3 --drop 7 --fake 12
cd chain-market && npm run dev:mock                              # C4 on :3004
```

`--cycle 3` changes the AQI scenario every 3 epochs, so the gauges and the chart move. `--drop 7` makes tag 7 go missing and then removed. `--fake 12` makes tag 12 show as suspect.

### Shared look

Reuse chain-market's theme so the twin, wallet and marketplace look like one product:

- dark background (`--background: 0 0% 0%`);
- the HSL tokens from `chain-market/web/src/index.css` (copy them into your own CSS; don't import across folders);
- Tailwind with the same `tailwind.config.js` colour names;
- fonts: **Inter** (UI) and **JetBrains Mono** (numbers and hashes), from Google Fonts.

## 4. Check your C1 against the real miner code

miner-core ships `c1check`. It runs your messages through the same tracker and estimator that will pay the plants, and prints what B makes of each tag:

```bash
cd miner-core && pip install -r requirements.txt
python -m minerd c1check path/to/recording.jsonl     # one JSON object, a JSON array, or JSON Lines
python -m minerd c1check --mqtt --seconds 30         # listen live on miner/miner-001/vision
```

The output is one row per tag (status, conf, alive, leaf area, AIR/h, paid yes/NO), followed by the flags raised and schema errors. Record about 90 s from your pipeline as JSON Lines (one C1 message per line) and run it.

**Your C1 is ready when:**

- 0 messages are rejected;
- all 20 plants are paid in a normal scene;
- each fault case in the table in section 2 shows `NO` for the right tag, with the right flag.

## 5. Phase 1 order of work (vision-twin README checklist)

1. **`vision-twin/mock/`: C1 mock emitter.**
   - Publishes valid C1 for 20 plants at 1 Hz, and replays a recorded scene.
   - Has `--drop` and `--fake` options for the removed and fake plant cases.
   - Must pass `validate.py` and `c1check`.
   - (miner-core's `python -m mock.c1_vision` is a reference implementation of the same idea.)
2. **`pipeline/`: ArUco detection.**
   - Detect 20 of 20 at rig distance (1–1.5 m) in room light.
   - Match against ids 0–19; anything else goes in `unknown_tag_ids`.
3. **`pipeline/`: C1 publisher.**
   - Output follows section 2, with `frame_hash` = sha256 of the raw bytes.
   - The status machine runs present → missing (10 s) → removed (60 s), plus suspect.
   - Leaf area and liveness can start as simple versions (HSV green mask; texture/colour variance). Enrolment and NDVI become accurate in Phase 2.
4. **`twin/`: React + Vite.**
   - 3D miner model (react-three-fiber, glTF) that rotates smoothly.
   - 20-slot plant grid, sensor gauges and AQI chart from C2.
   - Mint ticker and balance from the C4 mock; anti-cheat log from the flags.
   - GPS pin (Leaflet).
   - Everything updates every second from the mocks.

## 6. Prompt for Omkar's Claude Code

Paste this into Claude Code from the repo root:

> I'm Omkar and I own `vision-twin/` (Workstream A). Read `CLAUDE.md`, `vision-twin/README.md`, `contracts-schema/README.md` and `miner-core/docs/handoff-vision-twin.md`, which explains exactly how miner-core consumes my C1 output and what C2/C4 my twin receives. Build **Phase 1 only**: the C1 mock emitter, the ArUco detection and C1 publisher pipeline, and the twin web app driven by miner-core's `mock.c2_emitter` and chain-market's C4 mock. Only edit `vision-twin/`; `contracts-schema/` is frozen. Validate every C1 payload with `contracts-schema/scripts/validate.py` and with `python -m minerd c1check` from `miner-core/`. Plan first, then build.
