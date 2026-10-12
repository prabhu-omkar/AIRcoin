#!/usr/bin/env bash
# ==============================================================================
# AWS EC2 Automated Bootstrap Script for AIRcoin
# Supported OS: Amazon Linux 2023 / Ubuntu 22.04+
# Usage: Pass as EC2 User Data or run directly as root/sudo
# ==============================================================================

set -euo pipefail

echo "=== [1/6] Installing System Dependencies & Docker ==="
# Add swap if RAM is <= 2GB to prevent OOM during Docker builds
if [ ! -f /swapfile ] && [ $(free -m | awk '/^Mem:/{print $2}') -le 2048 ]; then
  echo "Adding 2GB swap space for low-memory instance..."
  fallocate -l 2G /swapfile || dd if=/dev/zero of=/swapfile bs=1M count=2048
  chmod 600 /swapfile
  mkswap /swapfile
  swapon /swapfile
  echo '/swapfile none swap sw 0 0' >> /etc/fstab || true
fi
if [ -f /etc/amazon-linux-release ]; then
  # Amazon Linux 2023
  dnf update -y
  dnf install -y docker git curl jq libxcrypt-compat
  systemctl enable --now docker
  usermod -aG docker ec2-user || true
  # Install Docker Compose Plugin
  mkdir -p /usr/local/lib/docker/cli-plugins
  curl -SL "https://github.com/docker/compose/releases/latest/download/docker-compose-linux-$(uname -m)" -o /usr/local/lib/docker/cli-plugins/docker-compose
  chmod +x /usr/local/lib/docker/cli-plugins/docker-compose
  ln -sf /usr/local/lib/docker/cli-plugins/docker-compose /usr/bin/docker-compose || true
elif [ -f /etc/lsb-release ] || [ -f /etc/debian_version ]; then
  # Ubuntu / Debian
  apt-get update -y
  apt-get install -y ca-certificates curl gnupg lsb-release git jq
  mkdir -p /etc/apt/keyrings
  curl -fsSL https://download.docker.com/linux/ubuntu/gpg | gpg --dearmor -o /etc/apt/keyrings/docker.gpg || true
  echo "deb [arch=$(dpkg --print-architecture) signed-by=/etc/apt/keyrings/docker.gpg] https://download.docker.com/linux/ubuntu $(lsb_release -cs) stable" | tee /etc/apt/sources.list.d/docker.list > /dev/null
  apt-get update -y
  apt-get install -y docker-ce docker-ce-cli containerd.io docker-compose-plugin
  systemctl enable --now docker
  usermod -aG docker ubuntu || true
fi

echo "=== [2/6] Setting Up Project Directory ==="
INSTALL_DIR="/opt/aircoin"
mkdir -p "${INSTALL_DIR}"
cd "${INSTALL_DIR}"

if [ ! -d "${INSTALL_DIR}/.git" ]; then
  echo "Cloning repository (specify repo URL if not pre-baked)..."
  # Replace with actual git repo URL or copy local code
  # git clone https://github.com/prabhu-omkar/AIRcoin.git .
fi

echo "=== [3/6] Generating Production Environment Configuration ==="
if [ ! -f "${INSTALL_DIR}/.env" ]; then
  cat <<'EOF' > "${INSTALL_DIR}/.env"
# ── Network & Blockchain (Polygon Amoy Testnet) ──
RPC_URL=https://80002.rpc.thirdweb.com
CHAIN_ID=80002

# ── Keys (Replace with your KMS / Secrets Manager populated keys) ──
ADMIN_KEY=0xac0974bec39a17e36ba4a6b4d238ff944bacb478cbed5efcae784d7bf4f2ff80
DEPLOYER_PRIVATE_KEY=0xac0974bec39a17e36ba4a6b4d238ff944bacb478cbed5efcae784d7bf4f2ff80

# ── Ports ──
PORT_VALIDATOR=3001
PORT_INDEXER=3002
PORT_MINER=8090
PORT_CHAIN_WEB=5173
PORT_TWIN_WEB=5174
EOF
  chmod 600 "${INSTALL_DIR}/.env"
fi

echo "=== [4/6] Creating Systemd Service for Auto-Restart ==="
cat <<EOF > /etc/systemd/system/aircoin.service
[Unit]
Description=AIRcoin Full Stack Container Suite
Requires=docker.service
After=docker.service

[Service]
Type=oneshot
RemainAfterExit=yes
WorkingDirectory=${INSTALL_DIR}
ExecStart=/usr/bin/docker compose -f docker-compose.prod.yml up -d --build
ExecStop=/usr/bin/docker compose -f docker-compose.prod.yml down
TimeoutStartSec=0

[Install]
WantedBy=multi-user.target
EOF

systemctl daemon-reload
systemctl enable aircoin.service

echo "=== [5/6] Building and Starting Containers ==="
if [ -f "${INSTALL_DIR}/docker-compose.prod.yml" ]; then
  docker compose -f "${INSTALL_DIR}/docker-compose.prod.yml" up -d --build
fi

echo "=== [6/6] Bootstrap Complete! ==="
echo "AIRcoin services are running under Docker and managed by systemd (aircoin.service)."
echo "Health status can be verified with: curl http://localhost/health"
