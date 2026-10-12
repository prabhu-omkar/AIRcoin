#!/usr/bin/env bash
# ==============================================================================
# Deploy AIRcoin Frontends to Vercel
# Usage:
#   ./scripts/deploy-vercel.sh [--prod]
# ==============================================================================

set -euo pipefail

SCRIPT_DIR="$(cd "$(dirname "${BASH_SOURCE[0]}")" && pwd)"
REPO_ROOT="$(cd "${SCRIPT_DIR}/.." && pwd)"

MARKET_DIR="${REPO_ROOT}/chain-market/web"
TWIN_DIR="${REPO_ROOT}/vision-twin/twin"

PROD_FLAG=""
if [[ "${1:-}" == "--prod" ]]; then
  PROD_FLAG="--prod"
fi

echo "============================================================"
echo "  Deploying AIRcoin Frontends to Vercel"
echo "  Mode: ${PROD_FLAG:-Preview}"
echo "============================================================"

# Check for Vercel CLI
VERCEL_CMD=""
if command -v vercel &> /dev/null; then
  VERCEL_CMD="vercel"
else
  VERCEL_CMD="npx vercel"
fi

# 1. Build and Deploy Chain-Market Web Portal
echo ""
echo "[1/2] Deploying Chain-Market Web Portal..."
cd "${MARKET_DIR}"
npm run build
${VERCEL_CMD} ${PROD_FLAG} --yes

# 2. Build and Deploy 3D Living Miner Digital Twin
echo ""
echo "[2/2] Deploying 3D Living Miner Digital Twin..."
cd "${TWIN_DIR}"
npm run build
${VERCEL_CMD} ${PROD_FLAG} --yes

echo ""
echo "[OK] Both frontends deployed to Vercel successfully!"
