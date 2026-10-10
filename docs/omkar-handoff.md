# Omkar handoff: connect the Blender twin

This branch removes the twin as a blocker. Shreyas's miner and Umashankar's validator/chain run
end to end with mock plants, while Omkar can integrate C1 and C2 independently.

## Start the backend

```bat
scripts\demo.cmd start
```

Health is at `http://localhost:8090/health`; scenario controls are at
`http://localhost:8090/`. MQTT is `localhost:1883`.

## Twin integration points

- Publish C1 vision events to `miner/miner-001/vision` when the miner uses
  `VISION_SOURCE=mqtt`.
- Subscribe to `miner/miner-001/telemetry` for 1 Hz sensors, plants, AQI and active flags.
- Subscribe to retained `miner/miner-001/epoch` for mint amount, validator state and transaction
  hash. Persisted epochs are replayed automatically after MQTT reconnects.
- Use the frozen C1/C2 schemas and valid examples in `contracts-schema/`; do not invent new fields.
- Validate a recording with `python -m minerd c1check recording.jsonl` from `miner-core`.

If Blender output is unavailable, replay the checked-in recording:

```bat
cd miner-core
python -m mock.recorded_fallback replay --speed 20
```

The detailed field-level contract remains in `miner-core/docs/handoff-vision-twin.md`.

## Items intentionally left for the later UI pass

- Production-build and launch integration for Umashankar's React wallet/market/admin platform.
- Raspberry Pi-only two-hour thermal soak and real GPS/camera acceptance.
- Omkar's Blender model, camera pipeline and physical hardware validation.
