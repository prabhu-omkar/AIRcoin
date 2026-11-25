#!/usr/bin/env bash
# Start an N-miner AIRcoin network on this machine.
#   scripts/localnet.sh [N]       (default 4)  — logs in localnet/nodeI.log
#   scripts/localnet.sh stop
set -euo pipefail
cd "$(dirname "$0")/.."
OUT=${OUT:-./localnet}
if [[ "${1:-}" == "stop" ]]; then pkill -f "aircoind start --home $OUT" || true; echo stopped; exit 0; fi
N=${1:-4}
go build -o bin/aircoind ./cmd/aircoind
pkill -f "aircoind start --home $OUT" 2>/dev/null || true; sleep 1
rm -rf "$OUT"
./bin/aircoind testnet --validators "$N" --out "$OUT" --seed demo/demo-accounts.json
for ((i = 0; i < N; i++)); do
  nohup ./bin/aircoind start --home "$OUT/node$i" > "$OUT/node$i.log" 2>&1 &
done
sleep 5
for ((i = 0; i < N; i++)); do curl -s "http://127.0.0.1:$((8700 + i))/v1/status" | python3 -c 'import sys,json; d=json.load(sys.stdin); print("  %s: height %s, %s peers" % (d["moniker"], d["height"], d["peers"]))'; done
echo "gateways: http://127.0.0.1:8700 … :$((8700 + N - 1))   keys: $OUT/accounts.json"
echo "start the simulated miners: scripts/simulate.sh"
