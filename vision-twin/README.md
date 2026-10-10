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

## Suggested layout

```
vision-twin/
├── pipeline/   Python: capture, aruco, plant match, leaf area, NDVI, status machine, C1 publisher
├── enrol/      enrolment script: photo + feature vector per tag
├── mock/       C1 mock emitter (replays a recorded scene; can simulate removed/fake plant)
├── twin/       React + Vite web app
└── models/     Blender source and exported glTF
```

## Running locally

```bash
docker compose up -d mqtt          # from the repo root: mqtt://localhost:1883, ws://localhost:9001
```

Until miner-core and chain-market are live, drive the twin from the example payloads in `contracts-schema/examples/valid/` (`c2-telemetry.json`, `c2-epoch.json`, `c4-*.json`) or the other workstreams' mock emitters. Validate what you publish:

```bash
python contracts-schema/scripts/validate.py c1-vision-event my-c1-message.json
```

## Phase checklist

**Phase 1 · Foundations**
- [ ] 20 of 20 stickers detected at the rig distance in normal room light
- [ ] 3D miner model renders in the browser and rotates smoothly
- [ ] Twin shows mock sensor and mint data updating every second
- [ ] C1 mock emitter shipped

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
