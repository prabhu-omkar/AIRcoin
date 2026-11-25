#!/usr/bin/env bash
# Run one simulated miner per node, each signing a C3 attestation every epoch.
set -euo pipefail
cd "$(dirname "$0")/.."
OUT=${OUT:-./localnet}
N=$(python3 -c "import json;print(len(json.load(open('$OUT/accounts.json'))['miners']))")
for ((i = 0; i < N; i++)); do
  read -r ID KEY API < <(python3 -c "import json;m=json.load(open('$OUT/accounts.json'))['miners'][$i];print(m['miner_id'],m['device']['private_key'],m['node']['api'])")
  ./bin/aircoind simulate-miner --node "$API" --miner-id "$ID" --key "$KEY" --now 2>&1 | sed "s/^/[$ID] /" &
done
wait
