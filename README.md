# AIRcoin

> **Proof of Useful Work (PoUW) for Clean Air**  
> A plant-monitoring IoT miner, an ERC-20 token minted from verified atmospheric cleaning, and an institutional marketplace where citizens sell tokens and polluters buy & burn them for compliance.

---

## 1. Workstreams & Repository Layout

This is a monorepo partitioned into three isolated workstreams communicating via frozen schemas C1–C4.

| Directory | Workstream | Owner | Role & Deliverables | Interfaces |
|---|---|---|---|---|
| [`vision-twin/`](vision-twin/README.md) | **Workstream A** | **Omkar** | Camera rig, ArUco tag tracker, MobileNetV3 species classifier, NDVI liveness, and interactive 3D living miner digital twin (Three.js rig, exploded hardware view with PM2.5 monitoring device "click to explode" interaction, 20-plant rack, camera lens/NDVI PiP, and Owner Dashboard) | Produces **C1**; Consumes **C2**, **C4** |
| [`miner-core/`](miner-core/README.md) | **Workstream B** | **Shreyas** | Edge miner daemon, sensor simulator, PoUW estimation engine, secp256k1 attestation signer, SQLite offline queue, scenario controller | Produces **C2**, **C3**; Consumes **C1** |
| [`chain-market/`](chain-market/README.md) | **Workstream C** | **Umashankar** | Smart contracts (Polygon Amoy / local Hardhat), validator oracle, event indexer, and multi-portal web platform (Citizen, Marketplace, Company Burn, Gov Admin) | Produces **C4**; Consumes **C2**, **C3** |
| [`contracts-schema/`](contracts-schema/README.md) | **Shared** | **Jointly** | Frozen schemas C1–C4, miner registry, and species catalogue with environmental weighting factors | **Frozen v1** |
| [`infra/`](infra/AWS-DEPLOYMENT-GUIDE.md) | **Shared** | **All three** | Production deployment runbooks: [AWS Backend Deployment Guide](infra/AWS-DEPLOYMENT-GUIDE.md), [Vercel Frontend Deployment Guide](infra/VERCEL-DEPLOYMENT-GUIDE.md), CloudFormation, Terraform, Docker, NGINX | — |

- **Unit of Minting:** 1 AIR = 1 mg PM2.5-equivalent removed from the atmosphere.
- **Epoch Duration:** 60 seconds (real-time demo rate).

---

## 2. Interactive Local Demo

The entire AIRcoin stack can be launched locally in one command without external cloud dependencies. Mosquitto runs in Docker when available, and automatically falls back to an internal lightweight Python MQTT broker.

### Quickstart

#### On macOS & Linux:
```bash
./scripts/demo.sh start
```

#### On Windows:
```bat
scripts\demo.cmd start
```

To view live status or stop services:
```bash
./scripts/demo.sh status
./scripts/demo.sh stop
```

### URLs and Ports

| Service | Port | Access URL | Description |
|---|---:|---|---|
| **3D Miner Digital Twin** | 5174 | `http://localhost:5174` | 3D living miner hardware, 20-plant rack, exploded device view with "click to explode", live sensor telemetry, camera lens PiP, and owner dashboard |
| **Chain-Market Platform** | 5173 | `http://localhost:5173` | Citizen Wallet, Marketplace, Corporate Burn Portal, Gov Admin |
| **Miner Scenario Controller**| 8090 | `http://localhost:8090` | Interactive AQI scenario switcher, plant faults, GPS controls |
| **Red/Green Health Page** | 8090 | `http://localhost:8090/health` | Real-time connectivity & queue health dashboard |
| **Validator Oracle** | 3001 | `http://localhost:3001/health` | Cryptographic signature & proof verification service |
| **Local Blockchain** | 8545 | `http://localhost:8545` | Hardhat Ethereum node (Chain ID 31337) |
| **MQTT Broker** | 1883 | `mqtt://localhost:1883` | IoT sensor and vision bus (WS on `:9001`) |

### Guided Demo Walkthrough

1. **Service Health Check (`http://localhost:8090/health`)**:
   Verify all four service tiles are green (Miner, MQTT, Validator, Blockchain).
2. **Scenario Controller (`http://localhost:8090/`)**:
   Switch the AQI scenario between `Clean Morning` (AQI ~45), `Rush Hour` (AQI ~180), and `Festival Smog` (AQI ~400). Observe running AIR token accumulation accelerate as plant uptake responds to higher pollution density.
3. **Chain-Market Web Portal (`http://localhost:5173/`)**:
   - **Citizen / Miner Owner**: View minted AIRcoin rewards and list tokens on the marketplace.
   - **Polluting Company**: View mandatory compliance obligations, buy AIR with test INR (`tINR`), and execute on-chain compliance burns.
   - **Government Admin**: Approve new miner registrations, review rejected proof logs, and inspect network-wide stats.
4. **3D Miner Digital Twin (`http://localhost:5174/`)**:
   - **Interactive 3D Miner**: Orbit, pan, and zoom around the living miner rig with its 20-slot botanical rack. Drag pots to test anti-cheat detection in real time.
   - **Click to Explode Interaction**: Hovering over the PM2.5 monitoring device displays the "click to explode" message in the HUD hint bar. Clicking the device triggers an animated exploded view showing internal modules (Raspberry Pi, PMS5003 laser sensor, MQ-135 gas sensor, optical camera, and power bus).
   - **Camera Lens PiP**: Toggle between real-time optical Lens view and false-color NDVI vegetation health heat-map. High-contrast typography ensures readability across all display conditions.
   - **Owner Dashboard**: Open the dashboard via the top navigation rail to inspect fleet health, telemetry time-series charts, and recent on-chain mints.

### Service Recovery Commands
```bash
./scripts/demo.sh restart-mqtt
./scripts/demo.sh restart-validator
./scripts/demo.sh restart-miner
./scripts/demo.sh restart-chain
```

---

## 3. AWS Production Backend Deployment

AIRcoin backend services (Validator Oracle, Event Indexer, Miner Daemon, and Mosquitto MQTT broker) run on AWS connected to smart contracts on Polygon Amoy. Full details are in [`infra/AWS-DEPLOYMENT-GUIDE.md`](infra/AWS-DEPLOYMENT-GUIDE.md).

### Architecture Overview

- **Smart Contracts**: Deployed on **Polygon Amoy Testnet** (Chain ID 80002) with on-chain verification on Polygonscan.
- **Compute Layer**: Either **Docker Compose on Amazon EC2** (Fast/Cost-effective) or **AWS ECS Fargate + Application Load Balancer** (Auto-scaling High Availability).
- **Ingress & SSL**: Automated Let's Encrypt SSL on NGINX or AWS Certificate Manager (ACM) on the ALB.
- **CORS Support**: All backend endpoints (`/v1/`, `/api/`, `/mqtt`) include CORS headers enabled for cross-origin requests from Vercel frontends.

---

### Option A: Fast Single-Instance AWS EC2 Deployment

Ideal for hackathon demos, staging environments, and single-node hosting.

1. **Launch an EC2 Instance**:
   - AMI: Amazon Linux 2023 or Ubuntu 22.04 LTS (x86_64 or arm64)
   - Instance Type: `t3.medium` (2 vCPU, 4 GiB RAM)
   - Inbound Ports: `80` (HTTP), `443` (HTTPS), `22` (SSH), `1883` (MQTT TCP), `9001` (MQTT WS)

2. **Automated Provisioning via User Data**:
   Attach [`infra/aws/ec2-setup.sh`](infra/aws/ec2-setup.sh) as the EC2 **User Data** script upon launch, or run manually via SSH:
   ```bash
   sudo git clone https://github.com/prabhu-omkar/AIRcoin.git /opt/aircoin
   cd /opt/aircoin
   sudo bash infra/aws/ec2-setup.sh
   ```

3. **Configure Environment Variables (`/opt/aircoin/.env`)**:
   ```ini
   RPC_URL=https://rpc-amoy.polygon.technology
   CHAIN_ID=80002
   ADMIN_KEY=0xYourValidatorPrivateKey
   DEPLOYER_PRIVATE_KEY=0xYourDeployerPrivateKey
   PORT_VALIDATOR=3001
   PORT_INDEXER=3002
   PORT_MINER=8090
   PORT_CHAIN_WEB=5173
   PORT_TWIN_WEB=5174
   ```

4. **Start & Verify Services**:
   ```bash
   sudo docker compose -f docker-compose.prod.yml up -d
   curl http://localhost/healthz
   curl http://localhost/health
   ```

---

### Option B: Enterprise High-Availability (ECS Fargate)

1. **Deploy Contracts to Polygon Amoy**:
   Obtain testnet POL from the [Polygon Faucet](https://faucet.polygon.technology/), then deploy:
   ```bash
   export DEPLOYER_PRIVATE_KEY="0xYourDeployerPrivateKey"
   export AMOY_RPC_URL="https://rpc-amoy.polygon.technology"
   bash infra/aws/deploy-contracts-amoy.sh
   ```

2. **Build and Push Container Images to Amazon ECR**:
   ```bash
   ACCOUNT_ID=$(aws sts get-caller-identity --query Account --output text)
   REGION=ap-south-1
   ECR="${ACCOUNT_ID}.dkr.ecr.${REGION}.amazonaws.com"

   aws ecr get-login-password --region ${REGION} | docker login --username AWS --password-stdin ${ECR}

   # Validator Oracle
   aws ecr create-repository --repository-name aircoin/validator --region ${REGION} || true
   docker build -t ${ECR}/aircoin/validator:latest -f chain-market/validator/Dockerfile chain-market/validator
   docker push ${ECR}/aircoin/validator:latest

   # Event Indexer
   aws ecr create-repository --repository-name aircoin/indexer --region ${REGION} || true
   docker build -t ${ECR}/aircoin/indexer:latest -f chain-market/indexer/Dockerfile chain-market/indexer
   docker push ${ECR}/aircoin/indexer:latest

   # Miner Controller & Daemon
   aws ecr create-repository --repository-name aircoin/miner --region ${REGION} || true
   docker build -t ${ECR}/aircoin/miner:latest -f miner-core/Dockerfile miner-core
   docker push ${ECR}/aircoin/miner:latest
   ```

3. **Deploy Backend with CloudFormation or Terraform**:
   
   *Using CloudFormation:*
   ```bash
   aws cloudformation create-stack \
     --stack-name aircoin-prod-ecs \
     --template-body file://infra/aws/cloudformation/aircoin-ecs-fargate.yml \
     --capabilities CAPABILITY_NAMED_IAM \
     --parameters \
       ParameterKey=EnvironmentName,ParameterValue=aircoin-prod \
       ParameterKey=RpcUrl,ParameterValue=https://rpc-amoy.polygon.technology \
       ParameterKey=AdminPrivateKey,ParameterValue="0xYourValidatorPrivateKey" \
       ParameterKey=ValidatorImage,ParameterValue="${ECR}/aircoin/validator:latest" \
       ParameterKey=MinerImage,ParameterValue="${ECR}/aircoin/miner:latest"
   ```

   *Using Terraform:*
   ```bash
   cd infra/aws/terraform
   terraform init
   terraform apply \
     -var="aws_region=${REGION}" \
     -var="environment=aircoin-prod" \
     -var="validator_image=${ECR}/aircoin/validator:latest" \
     -var="miner_image=${ECR}/aircoin/miner:latest" \
     -var="admin_private_key=0xYourValidatorPrivateKey"
   ```

---

## 4. Frontend Deployment on Vercel

Both frontends can be deployed to Vercel with zero server overhead and global edge distribution while connecting to your AWS backend. Complete instructions are in [`infra/VERCEL-DEPLOYMENT-GUIDE.md`](infra/VERCEL-DEPLOYMENT-GUIDE.md).

### Quick Deploy via Script

```bash
# Preview deployment:
./scripts/deploy-vercel.sh

# Production deployment:
./scripts/deploy-vercel.sh --prod
```

### Manual Vercel Dashboard Setup

1. **Chain-Market Web Portal (`chain-market/web`)**:
   - **Root Directory**: `chain-market/web`
   - **Framework Preset**: `Vite`
   - **Build Command**: `npm run build`
   - **Output Directory**: `dist`
   - **Environment Variables**:
     - `VITE_API_URL`: `https://api.yourdomain.com` (your AWS backend endpoint)
     - `VITE_TWIN_URL`: `https://aircoin-twin.vercel.app` (URL to the 3D twin portal)

2. **3D Living Miner Digital Twin (`vision-twin/twin`)**:
   - **Root Directory**: `vision-twin/twin`
   - **Framework Preset**: `Vite`
   - **Build Command**: `npm run build`
   - **Output Directory**: `dist`
   - **Environment Variables**:
     - `VITE_MINER_ID`: `miner-001`
     - `VITE_MQTT_WS`: `wss://api.yourdomain.com/mqtt`
     - `VITE_C4_URL`: `https://api.yourdomain.com`
     - `VITE_API_URL`: `https://api.yourdomain.com`
     - `VITE_MARKET_URL`: `https://aircoin-market.vercel.app`
     - `VITE_MINER_MODEL_URL`: `/models/aircoin-miner.glb`

---

## 5. Test Suites & Validation

Verify all workstream guarantees locally before deploying:

```bash
# 1. Interface Schemas & Species Catalogue (contracts-schema)
python contracts-schema/scripts/validate.py

# 2. Smart Contracts (23 passing unit tests on mint, burn, marketplace, compliance)
cd chain-market/contracts && npx hardhat test

# 3. C4 Indexer & Durable Store Tests
cd chain-market/indexer && npm test

# 4. Miner PoUW Estimation, Signatures & Anti-Cheat Tests (44 passing tests)
cd miner-core && pytest -q

# 5. Frontend Production Bundle Validations
cd vision-twin/twin && npm run build
cd ../../chain-market/web && npm run build
```
