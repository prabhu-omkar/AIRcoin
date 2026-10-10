# AIRcoin

A plant-monitoring miner, a token minted from verified plant work, and a marketplace where citizens sell the token and polluters buy and burn it.

| Folder | What | Owner |
|--------|------|-------|
| [`vision-twin/`](vision-twin/README.md) | Camera rig, computer vision, digital twin web app | Omkar |
| [`miner-core/`](miner-core/README.md) | Miner daemon, sensor simulator, estimator, signed attestations | Shreyas |
| [`chain-market/`](chain-market/README.md) | Smart contracts, validator, wallet, marketplace, admin portal | Umashankar |
| [`contracts-schema/`](contracts-schema/README.md) | Frozen interfaces C1–C4, registry, species catalogue | All three, by agreement only |

```bash
docker compose up -d mqtt                          # Mosquitto on :1883 (MQTT) and :9001 (WebSockets)
pip install -r contracts-schema/requirements.txt
python contracts-schema/scripts/validate.py
```

Project context and team rules: [`CLAUDE.md`](CLAUDE.md). Full spec: the PRD PDF in this folder.

## Local integrated demo

On Windows, one command starts MQTT, the local chain, deployment/seed, validator, and the
miner with its built-in plant fallback:

```bat
scripts\demo.cmd start
```

Open `http://localhost:8090/health` for the red/green service page. Operational details and
recovery commands are in [`docs/demo-runbook.md`](docs/demo-runbook.md).
