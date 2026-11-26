# vision-twin · Workstream A · Vision and digital twin

**Owner:** Omkar
**Mission:** make the miner see. Detect every tagged plant, prove it is the right species and alive, and show all of it live in a digital twin judges can explore.

| Produces | Consumes |
|----------|----------|
| **C1** vision events → MQTT `miner/{miner_id}/vision` (~1/s) | **C2** `miner/{miner_id}/telemetry` and `miner/{miner_id}/epoch` from miner-core; **C4** REST + WebSocket from any aircoin-chain node |

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

**Stack:** Raspberry Pi 4/5, Pi Camera Module 3 NoIR Wide + blue gel filter, Python, OpenCV (`cv2.aruco`), React + Vite, Three.js, React Three Fiber, WebSockets, and MQTT.

## Layout

```
vision-twin/
├── config/rig.json          the rig: miner id, 4 × 5 grid, tag → species per slot
├── pipeline/aircoin_vision/ Python: capture, ArUco stickers, plant match, leaf area, NDVI,
│                            status machine, C1 publisher, live streams, mock C1, sticker sheets
└── twin/                    React + Three.js: the 3D twin and the miner's live dashboard
```

## 3D Living Miner Digital Twin

The main visual interface is Omkar's interactive 3D living miner digital twin:

- **3D Living Miner Rig:** 20-pot physical hydroponic rack with botanical species models, active lighting, and animated air flow indicators.
- **Exploded Device Hardware View:** IP65 environmental enclosure separated along its assembly axes with clickable hardware modules:
  - Raspberry Pi 4/5 compute unit
  - PMS5003 laser particulate matter (PM2.5 / PM10) sensor
  - MQ-135 / SCD40 gas and VOC monitoring modules
  - Pi Camera Module 3 NoIR with ArUco optical rig
  - GPS antenna and power delivery circuitry
- **Click to Explode Interaction:** Hovering over the PM2.5 monitoring device displays a "click to explode" hint in the HUD hint bar; clicking smoothly animates the enclosure into the exploded diagnostic view.
- **Camera PiP Feed:** Picture-in-picture real-time camera stream with high-contrast toggle between optical Lens view and NDVI false-color vegetation index heat-map.
- **Anti-Cheat Drag-and-Drop:** Drag pots to swap or remove plants in real time to trigger anti-cheat mismatch detection and observe the attestation penalty.
- **Live dashboard:** the same header switches between the 3D twin and three dashboard views: *Overview* (camera, AQI history, air sensors), *Plants* (camera plus the 20 plants, click one for its readings) and *Earnings & security* (wallet and mints from the chain, anti-cheat log, GPS geofence). It shows public data only, so there is no sign-in. Open it for a miner with `?miner=miner-001` and a view with `#overview`, `#plants` or `#earnings`.

To use an external exported model, optimize it as a single shared-material GLB, place it at `twin/public/models/aircoin-miner.glb`, copy `twin/.env.example` to `twin/.env`, and set `VITE_MINER_MODEL_URL=/models/aircoin-miner.glb`. Without that file, the procedural 3D miner model renders seamlessly.

## Running locally

The whole product (MQTT, a 4-node chain, the miner, the marketplace and this twin) starts with one command
from the repo root:

```bash
python scripts/demo.py start --camera synthetic     # twin at http://localhost:5174
```

To work on the twin alone, run it against example data or a live stack:

```bash
cd vision-twin/twin && npm install
npm run dev                                         # http://localhost:5174 (mock data unless VITE_SOURCE=live)
```

The twin reads MQTT over WebSockets (`ws://localhost:9001`) and the chain gateway (`http://localhost:8700`).
Override them in `twin/.env.local` (see `twin/.env.example`) or with URL parameters
(`?source=live&mqtt=ws://pi.local:9001&c4=http://pi.local:8700&feed=http://pi.local:8080/`).

The vision pipeline runs from `pipeline/` (`pip install -r requirements.txt`; on the Pi also `sudo apt install python3-picamera2`):

```bash
cd vision-twin/pipeline
python -m aircoin_vision.hwcheck                          # Pi camera and GPS check (--camera usb:0 on a laptop)
python -m aircoin_vision.stickers                         # printable sticker sheets for config/rig.json (45 mm)
python -m aircoin_vision.enrol picam                      # photo + feature vector per tagged plant
python -m aircoin_vision.run picam --serve 8080           # C1 to MQTT at 1 Hz, live streams on :8080
python -m aircoin_vision.mock_c1                          # C1 without a camera (fault switches: --help)
python -m aircoin_vision.synth ../data/frames --noir --frames 24   # synthetic rig photos to try it without hardware
```

`run` and `enrol` also take `usb:0`, a video file or a folder of frames as the source (add `--loop` to repeat).

## Verification

```bash
cd vision-twin/pipeline && python -m pytest tests -q
python -m aircoin_vision.mock_c1 --mqtt - --duration 1 | head -n 1 > ../sample.json
python ../../contracts-schema/scripts/validate.py c1-vision-event ../sample.json
cd ../twin && npm run build
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
