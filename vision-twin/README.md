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

**Stack:** Raspberry Pi 4/5, Pi Camera Module 3 NoIR Wide + blue gel filter, Python, OpenCV (`cv2.aruco`), MobileNetV3 (no training), React + Vite, react-three-fiber, Leaflet, MQTT over WebSockets.

## Layout

```
vision-twin/
├── config/rig.json          miner ID, ArUco dictionary, sticker size, tag -> slot -> species, crop geometry
├── pipeline/                Python package aircoin_vision (Pi or laptop)
│   └── aircoin_vision/
│       ├── stickers.py      printable sticker sheets (PNG + PDF)
│       ├── detect.py        tag detection on stills / live video, annotated MJPEG feed
│       ├── enrol.py         photo + feature vector per tag, --check to compare later
│       ├── mock_c1.py       C1 mock emitter (remove / fake / swap / unknown / frozen camera, replay)
│       ├── hwcheck.py       Pi + camera + GPS sanity check
│       ├── status.py        present / missing / removed / suspect state machine
│       ├── c1.py            C1 message builder + MQTT publisher
│       └── synth.py         synthetic rig image for tests and dry runs
├── twin/                    React + Vite + react-three-fiber digital twin
└── data/                    generated locally (stickers, enrolment, hwcheck frames), git-ignored
```

## Pipeline quick start

```bash
cd vision-twin/pipeline
python -m venv .venv && . .venv/bin/activate
pip install -r requirements-dev.txt          # on the Pi also: sudo apt install python3-picamera2
python -m pytest -q                          # 14 tests, no hardware needed
```

All commands take `--help`. Run them from `vision-twin/pipeline`.

| Step | Command |
|------|---------|
| Check the Pi, camera and GPS | `python -m aircoin_vision.hwcheck` (`--camera usb:0` on a laptop, needs `pip install pyserial` for GPS) |
| Print the stickers | `python -m aircoin_vision.stickers --extra 20` → `data/stickers/stickers.pdf`. Print at 100 % and check the 50 mm bar. |
| Detect on a still | `python -m aircoin_vision.detect photo.jpg --annotate out.jpg` |
| Detect live, view from a laptop | `python -m aircoin_vision.detect picam --serve 8080` → open `http://<pi>:8080/` |
| Enrol the plants | `python -m aircoin_vision.enrol picam` (re-enrol one plant: `--tags 7`; compare later: `--check`) |
| C1 mock for miner-core | `python -m aircoin_vision.mock_c1 --interactive` (or `--at 20:remove:7 --at 40:fake:12`, `--mqtt -` for stdout) |
| Try it without hardware | `python -m aircoin_vision.synth rig.jpg --missing 7 --unknown 55`, then `detect rig.jpg` |

**Sticker size vs. distance.** Detection is reliable when each marker is at least ~24 px wide in the frame (`detect` prints the smallest marker size). With the Camera Module 3 Wide at 2304×1296, a 40 mm sticker is about 25 px at 1.5 m (borderline) and about 31 px at 1.2 m. So mount the camera at 1.0–1.2 m, or print 50 mm stickers and set `marker_size_mm: 50` in `config/rig.json`. The marker size is also the scale for leaf area, so it must match the print.

**Dictionary.** `DICT_4X4_100`: IDs 0–19 are this miner's stickers; IDs 20–99 are free for spares and the second, virtual miner in the sticker-reuse demo.

**Enrolment.** Uses a pretrained MobileNetV3-Small when `torch` + `torchvision` are installed (downloads the weights once). Otherwise it falls back to colour/gradient histograms, which need no extra install but separate plants less well. Install torch on the Pi before Day 2 so the vectors used for plant match are the MobileNet ones.

## Web apps

Two apps in `twin/`, sharing one data layer:

| App | For | Port | Shows |
|-----|-----|------|-------|
| Digital twin (`apps/twin`) | judges | 5173 | full-screen 3D rig and miner, plant status, part readings, miner camera |
| Miner dashboard (`apps/dashboard`) | the miner's owner | 5174 | live camera (detections / raw / NDVI), plant grid and detail, sensors, wallet, anti-cheat log, location |

```bash
cd vision-twin/twin && npm install
npm run dev          # both apps on mock data (shared through scripts/mock-hub.ts on :5175)
npm run dev:live     # both apps on live C2 (relayed by the hub) + C4 (indexer :3002) + camera (:8080)
npm test && npm run build
```

URL parameters override `.env.local`: `source` (`mock`/`live`), `miner`, `mqtt`, `c4`, `feed`, `hub`.

## Whole project on one machine

```powershell
powershell -File vision-twin\scripts\full-stack.ps1                  # synthetic NoIR camera
powershell -File vision-twin\scripts\full-stack.ps1 -Camera picam    # Pi camera (usb:0 -Liveness rgb on a laptop)
powershell -File vision-twin\scripts\full-stack.ps1 -Stop
```

Starts miner-core and chain-market (`scripts\demo.cmd`, miner reading our C1), the C4 indexer, the vision
runner and both apps on live data. Logs are in `vision-twin/.run/`.

## Contracts

The pipeline produces **C1** (`miner/{miner_id}/vision`); the twin consumes **C2** and **C4**. Both test suites validate against `contracts-schema/` (read-only from here). Check a captured message with:

```bash
python contracts-schema/scripts/validate.py c1-vision-event my-c1-message.json
```

## Phase checklist

**Phase 1 · Foundations**
- [ ] Rig assembled; Pi, camera and GPS confirmed (`hwcheck`)
- [ ] Stickers printed; 20 of 20 detected at the rig distance in normal room light (`detect`; works on synthetic frames, needs the real rig)
- [ ] Plants enrolled (`enrol`)
- [x] 3D miner model renders in the browser and rotates smoothly (v1 primitives; Blender glTF to follow)
- [x] Twin shows mock sensor and mint data updating every second
- [x] C1 mock emitter shipped (`mock_c1`)

**Phase 2 · Integration**
- [x] Swapped plant flagged in at least 4 of 5 tries (synthetic rig, `tests/test_vision.py`; recheck on the real rig)
- [x] Removed plant shown as missing on the twin within 10 s
- [x] Vision runs at 1 Hz or faster (laptop: ~160 ms per cycle at 2304×1296; Pi to confirm)
- [x] Twin and dashboard balance move when chain-market mints for this miner

**Phase 3 · Demo hardening**
- [x] Fake plant flagged by NDVI (synthetic NoIR rig; recheck on the real rig)
- [ ] Twin runs 15 minutes with no reload
- [x] Fallbacks: `run usb:0 --liveness rgb`; `run <video or folder> --loop`

**Owns in the demo:** steps 1–5 (rig, twin, detection, removal, fake plant).
