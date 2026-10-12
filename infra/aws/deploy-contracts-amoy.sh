#!/usr/bin/env bash
# ==============================================================================
# Deploy AIRcoin Smart Contracts to Polygon Amoy Testnet
# Prerequisites:
#   - DEPLOYER_PRIVATE_KEY exported (with Amoy testnet POL for gas)
#   - Optional: POLYGONSCAN_API_KEY for contract verification
# ==============================================================================

set -euo pipefail

SCRIPT_DIR="$(cd "$(dirname "${BASH_SOURCE[0]}")" && pwd)"
REPO_ROOT="$(cd "${SCRIPT_DIR}/../.." && pwd)"
CONTRACTS_DIR="${REPO_ROOT}/chain-market/contracts"

if [ -z "${DEPLOYER_PRIVATE_KEY:-}" ]; then
  echo "Error: DEPLOYER_PRIVATE_KEY environment variable is required." >&2
  echo "Export it with: export DEPLOYER_PRIVATE_KEY=\"0x...\"" >&2
  exit 1
fi

echo "============================================================"
echo "  Deploying AIRcoin Contracts to Polygon Amoy Testnet"
echo "  Chain ID: 80002"
echo "  RPC URL : ${AMOY_RPC_URL:-https://rpc-amoy.polygon.technology}"
echo "============================================================"

cd "${CONTRACTS_DIR}"

echo "[1/3] Compiling contracts..."
npx hardhat compile

echo "[2/3] Deploying contracts to polygonAmoy..."
npx hardhat run scripts/deploy.ts --network polygonAmoy

echo "[3/3] Seeding initial registry and obligation..."
npx hardhat run scripts/seed.ts --network polygonAmoy

echo "[OK] Deployment complete! Generated addresses saved in ${CONTRACTS_DIR}/deployments.json"
