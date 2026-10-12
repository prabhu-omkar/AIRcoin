#!/usr/bin/env bash
# ==============================================================================
# Deploy AIRcoin Frontends to AWS S3 & CloudFront
# Usage:
#   AWS_REGION=ap-south-1 \
#   MARKET_BUCKET=aircoin-market-web \
#   TWIN_BUCKET=aircoin-twin-web \
#   MARKET_CF_DIST=E1234567890 \
#   TWIN_CF_DIST=E0987654321 \
#   ./infra/aws/deploy-s3-frontends.sh
# ==============================================================================

set -euo pipefail

SCRIPT_DIR="$(cd "$(dirname "${BASH_SOURCE[0]}")" && pwd)"
REPO_ROOT="$(cd "${SCRIPT_DIR}/../.." && pwd)"

MARKET_DIR="${REPO_ROOT}/chain-market/web"
TWIN_DIR="${REPO_ROOT}/vision-twin/twin"

AWS_REGION="${AWS_REGION:-ap-south-1}"
MARKET_BUCKET="${MARKET_BUCKET:-aircoin-market-portal}"
TWIN_BUCKET="${TWIN_BUCKET:-aircoin-twin-portal}"

echo "============================================================"
echo "  Deploying AIRcoin Frontends to AWS S3 & CloudFront"
echo "  Region: ${AWS_REGION}"
echo "============================================================"

# ── 1. Build Chain-Market Web Portal ──
echo "[1/4] Building Chain-Market Web Portal..."
(
  cd "${MARKET_DIR}"
  npm ci
  npm run build
)

echo "[2/4] Uploading Chain-Market Web to s3://${MARKET_BUCKET}..."
# Sync hashed assets with immutable long cache
aws s3 sync "${MARKET_DIR}/dist/assets" "s3://${MARKET_BUCKET}/assets" \
  --region "${AWS_REGION}" \
  --cache-control "public,max-age=31536000,immutable" \
  --delete

# Sync root HTML/JSON with no-cache so index updates are immediate
aws s3 sync "${MARKET_DIR}/dist" "s3://${MARKET_BUCKET}" \
  --region "${AWS_REGION}" \
  --exclude "assets/*" \
  --cache-control "no-cache,max-age=0" \
  --delete

if [ -n "${MARKET_CF_DIST:-}" ]; then
  echo "Invalidating CloudFront cache for Distribution ${MARKET_CF_DIST}..."
  aws cloudfront create-invalidation --distribution-id "${MARKET_CF_DIST}" --paths "/*"
fi

# ── 2. Build Vision-Twin Web App ──
echo "[3/4] Building Vision-Twin 3D Living Miner App..."
(
  cd "${TWIN_DIR}"
  npm ci
  npm run build
)

echo "[4/4] Uploading Vision-Twin to s3://${TWIN_BUCKET}..."
aws s3 sync "${TWIN_DIR}/dist/assets" "s3://${TWIN_BUCKET}/assets" \
  --region "${AWS_REGION}" \
  --cache-control "public,max-age=31536000,immutable" \
  --delete

aws s3 sync "${TWIN_DIR}/dist" "s3://${TWIN_BUCKET}" \
  --region "${AWS_REGION}" \
  --exclude "assets/*" \
  --cache-control "no-cache,max-age=0" \
  --delete

if [ -n "${TWIN_CF_DIST:-}" ]; then
  echo "Invalidating CloudFront cache for Distribution ${TWIN_CF_DIST}..."
  aws cloudfront create-invalidation --distribution-id "${TWIN_CF_DIST}" --paths "/*"
fi

echo "[OK] Frontend deployment to S3 and CloudFront complete!"
