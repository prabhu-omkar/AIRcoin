# vision-twin · Workstream A · Vision and digital twin

**Owner:** Omkar
**Mission:** make the miner see. Detect every tagged plant, prove it is the right species and alive, and show all of it live in a digital twin judges can explore.

| Produces | Consumes |
|----------|----------|
| **C1** vision events → MQTT `miner/{miner_id}/vision` (~1/s) | **C2** `miner/{miner_id}/telemetry` and `miner/{miner_id}/epoch` from miner-core; **C4** REST + WebSocket from chain-market |

Schemas and example payloads: [`../contracts-schema`](../contracts-schema/README.md). Do not change them on your own.

## Scope

- **Physical rig:** 20 pot slots in a 4 × 5 grid, camera on a fixed mount 1–1.5 m away. One plastic plant and one spare sticker kept for the anti-cheat demo.
- **Stickers:** ArUco markers (4×4 or 5×5 dictionary), IDs 0–19 for this miner, 4–5 cm on waterproof labels. The known marker size is the scale reference.
- **Tag detection:** decode all markers each frame and match IDs against the miner's registered sticker set (`registry.json`); unknown IDs go into `unknown_tag_ids`.
- **Plant match:** at enrolment, store a pretrained MobileNetV3 feature vector per tag; each cycle compare the live crop to it → `species_conf`. A low match means a swapped plant.
- **Plant size:** green-pixel segmentation (HSV or excess-green) → `leaf_area_cm2`, smoothed.
- **Liveness:** NDVI from the NoIR camera + blue gel filter → `alive_score` (fallback: match score + texture/colour variance).
- **Status machine:** `present → missing` after 10 s unseen `→ removed` after 60 s; `suspect` on species mismatch or low `alive_score`. Debounced.
- **Live feed:** annotated stream (~15 fps, 720p, MJPEG or WebRTC), raw view and NDVI heat-map view. Inference at 1–2 Hz.
- **Digital twin web app:** 3D miner model (Blender → glTF) with exploded view and live readings per part, a 20-slot plant grid (green healthy / grey missing / red suspect), camera panel, sensor gauges and AQI chart (C2), mint ticker and wallet balance (C4), anti-cheat log, GPS pin on a map.

**Stack:** Raspberry Pi 4/5, Pi Camera Module 3 NoIR Wide + blue gel filter, Python, OpenCV (`cv2.aruco`), React + Vite, Phaser 4, Web Workers and MQTT over WebSockets. Three.js is lazy-loaded only for Omkar's optional miner-model inspection modal.

## Suggested layout

```
vision-twin/
├── pipeline/   Python: capture, aruco, plant match, leaf area, NDVI, status machine, C1 publisher
├── enrol/      enrolment script: photo + feature vector per tag
├── mock/       C1 mock emitter (replays a recorded scene; can simulate removed/fake plant)
├── twin/       React + Vite web app
└── models/     Blender source and exported glTF
```

## Delhi city digital twin

The main twin is a detailed 2D Phaser isometric Delhi simulation inspired by the team's before/after concept art:

- pan and zoom around a city containing dense apartments, mixed-use markets, a school, offices, regulator, Delhi Metro and industrial sites;
- select a building to focus its camera and inspect its plant miner;
- install plants on eligible rooftops and see the instanced vegetation grow;
- switch between polluted Delhi and AIRcoin Delhi while AQI, emissions, removal and rewards react;
- open the building-level miner inspection view for live C2/C4 proof data.

The scene is built to remain smooth on ordinary laptops. Seventeen buildings, vehicles and props
share a 603 KiB WebP atlas; ground geometry is static; traffic, metro and pollution objects are
pooled; camera culling and depth sorting are handled by Phaser; simulation runs in a Web Worker;
MQTT and the miner-model viewer are lazy chunks. Twenty-nine Arcade Physics vehicles follow four
lanes, obey a signal phase and maintain a car-following gap. Factory stack plumes and vehicle
exhaust respond to simulated wind. An FPS sampler automatically reduces decorative trees, street
props and pollution particles on weaker devices and restores detail after sustained recovery.

The AQI panel is explicitly simulated, not regulatory monitoring. Its worker uses a simplified
urban box model with traffic and industrial sources, ventilation, deposition and a small local
plant-removal term. Rooftop miners earn AIR from measured PM2.5-equivalent removal; a few rooftops
are not presented as directly changing Delhi's citywide AQI.

Art rules live in `twin/STYLE.md`. Source art lives outside `public/`; `npm run assets` crops,
downscales, packs and validates the runtime atlas. AWS S3/CloudFront notes are in
`twin/AWS-DEPLOY.md`.

To use Omkar's exported model, optimize it as a single shared-material GLB, place it at
`twin/public/models/aircoin-miner.glb`, copy `twin/.env.example` to `twin/.env`, and leave
`VITE_MINER_MODEL_URL=/models/aircoin-miner.glb`. Without that environment setting, the checked-in
procedural miner remains the fallback.

## Running locally

```bash
docker compose up -d mqtt          # from the repo root: mqtt://localhost:1883, ws://localhost:9001
```

Install Omkar's workstream once:

```bash
cd vision-twin
python -m pip install -r requirements.txt
cd twin && npm install
```

Run the complete mock-driven Phase 1 demo in separate terminals:

```bash
# Terminal 1, repo root
docker compose up -d mqtt

# Terminal 2, C2 telemetry + epoch data
cd miner-core
python -m mock.c2_emitter --scenario rush_hour --cycle 3 --drop 7 --fake 12

# Terminal 3, C4 balance + mint API
cd chain-market
npm run dev:mock

# Terminal 4, digital twin at http://localhost:5174
cd vision-twin/twin
npm run dev
```

The dashboard connects to MQTT over WebSockets on port 9001 and the C4 mock on port 3004. If
either is unavailable it stays usable with clearly labelled demo data. Override the endpoints by
copying `twin/.env.example` to `twin/.env`.

Publish Omkar's own C1 mock (all fault switches may be combined):

```bash
cd vision-twin
python -m mock.emitter --drop 7 --fake 12 --swap 5 --unknown 42
```

Run the real camera pipeline (camera index `0`, one analysed frame per second):

```bash
cd vision-twin
python -m pipeline.run --camera 0 --source laptop_camera --preview
```

Generate print-ready tag images (IDs 0-19 plus unknown spare ID 42):

```bash
python -m pipeline.generate_markers --output markers
```

Print the marker itself at 45 mm square with no scaling/cropping and keep the white border.

For a Raspberry Pi use `--source pi_camera`. A recorded video path can be passed to `--camera`
with `--source recorded`. Enrol a reference plant with
`python -m enrol.enrol TAG_ID SPECIES path/to/crop.jpg`; the resulting colour feature vector is
used for per-frame plant matching.

## Verification

```bash
cd vision-twin
python -m pytest -q
python -m mock.emitter --dry-run --count 1 --record sample.jsonl
python ../contracts-schema/scripts/validate.py c1-vision-event sample.jsonl
cd ../miner-core && python -m minerd c1check ../vision-twin/sample.jsonl
cd ../vision-twin/twin && npm run build
```

Until miner-core and chain-market are live, drive the twin from the example payloads in `contracts-schema/examples/valid/` (`c2-telemetry.json`, `c2-epoch.json`, `c4-*.json`) or the other workstreams' mock emitters. Validate what you publish:

```bash
python contracts-schema/scripts/validate.py c1-vision-event my-c1-message.json
```

## Phase checklist

**Phase 1 · Foundations**
- [ ] 20 of 20 stickers detected at the rig distance in normal room light
- [x] 3D miner model renders in the browser and rotates smoothly
- [x] Twin shows mock sensor and mint data updating every second
- [x] C1 mock emitter shipped

The remaining Phase 1 checkbox requires Omkar's physical 4 × 5 rig, printed markers and camera;
the implemented detector is ready for that acceptance test but software alone cannot certify it.

**Phase 2 · Integration**
- [ ] Swapped plant flagged in at least 4 of 5 tries
- [ ] Removed plant shown as missing on the twin within 10 s
- [ ] Vision runs at 1 Hz or faster on the Pi (or on a laptop as declared fallback)
- [ ] Twin's coin ticker moves when C mints for this miner

**Phase 3 · Demo hardening**
- [ ] Fake plant flagged in at least 4 of 5 tries
- [ ] Twin runs 15 minutes with no reload
- [ ] Fallbacks: laptop + USB camera vision; recorded feed if the camera fails

**Owns in the demo:** steps 1–5 (rig, twin, detection, removal, fake plant).
