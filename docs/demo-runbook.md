# AIRcoin local demo runbook

This demo does not require Omkar's Blender twin. The miner uses its built-in 20-plant simulator,
and a deterministic recorded C2 stream is available as a second fallback.

## Start and stop

Prerequisites: Node.js/npm, Python 3.11+, installed Node dependencies in both
`chain-market/contracts` and `chain-market/validator`, and the Python requirements from
`miner-core/requirements.txt`. Mosquitto runs through Docker when available; otherwise the launcher
uses the included MQTT 3.1.1 demo broker on port 1883 (without the optional WebSocket port).

From the repository root:

```bat
scripts\demo.cmd start
scripts\demo.cmd status
scripts\demo.cmd stop
```

The startup order is MQTT, Hardhat blockchain, contract deployment and seed, validator, then
miner/controller. Process IDs and logs are stored under `.demo/`; the miner's C3 delivery queue
remains in `miner-core/var/minerd.sqlite` across restarts.

## URLs and ports

| Service | Port | Health or access |
|---|---:|---|
| MQTT | 1883 | TCP connection shown by the combined health page |
| MQTT WebSocket | 9001 | `ws://localhost:9001` |
| Hardhat blockchain | 8545 | JSON-RPC `eth_chainId` shown by the combined health page |
| Validator | 3001 | `http://localhost:3001/health` |
| Miner/controller | 8090 | `http://localhost:8090/` |
| Combined health | 8090 | `http://localhost:8090/health` and `/api/health` |

Green means a live request or connection succeeded. Red means recovery is needed. Epochs are
first committed to SQLite, then sent to the validator. After MQTT reconnects, up to 120 persisted
C2 epochs are republished; the most recent is retained for late subscribers.

## Recovery commands

```bat
scripts\demo.cmd restart-mqtt
scripts\demo.cmd restart-validator
scripts\demo.cmd restart-miner
scripts\demo.cmd restart-chain
```

`restart-chain` also redeploys and seeds the contracts before restarting the validator. The demo
script only stops PIDs it started; it refuses to terminate an unrelated process occupying a port.
Use `scripts\demo.cmd status` and the health page first if a service does not recover.

## Recorded twin fallback

The checked-in recording covers all four air-quality scenarios. Recreate or replay it with:

```powershell
cd miner-core
python -m mock.recorded_fallback record
python -m mock.recorded_fallback replay --speed 20
```

Replay publishes schema-valid C2 telemetry and retained epoch summaries to the normal MQTT topics.
It is intended for dashboard/twin demonstrations; minting still comes only from signed C3 data sent
by the real miner daemon to the validator.

## Deliberate recovery test

Run the full drill (about three minutes):

```bat
scripts\failure-test.cmd
```

It keeps the validator down for 120 seconds, verifies red then green health, stops and restores
MQTT and verifies a retained C2 epoch, restarts the miner while preserving SQLite state, and finally
restarts the blockchain with contract redeployment and validator recovery.
