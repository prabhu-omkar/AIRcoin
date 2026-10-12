#!/usr/bin/env bash
set -e

DIR="$(cd "$(dirname "${BASH_SOURCE[0]}")/.." && pwd)"
echo "=== AIRcoin chain-market Setup & Local Deployment ==="

cd "$DIR/contracts"
echo "1. Compiling contracts..."
npx hardhat compile

echo "2. Deploying contracts to local network..."
npx hardhat run scripts/deploy.ts --network localhost || {
  echo "Local node not running, running ephemeral deployment test..."
  npx hardhat run scripts/deploy.ts
}

echo "3. Seeding demo accounts and miners..."
npx hardhat run scripts/seed.ts --network localhost || {
  npx hardhat run scripts/seed.ts
}

echo "[OK] Setup and deployment complete!"
