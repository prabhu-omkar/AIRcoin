# AIRcoin

> **Proof of Useful Work (PoUW) for Clean Air**  
> An edge IoT botanical miner, an ERC-20 token minted from mathematically verified atmospheric de-pollution, and an institutional compliance marketplace where citizens monetize verified air cleaning and industrial polluters purchase and burn tokens to retire statutory environmental liabilities.

---

## Hackathon Submission Overview

| Parameter | Details |
|---|---|
| **Event** | **Environmental Hacks** (Event 02 · Bharat Builds Tour by **WeMakeDevs & AWS**) |
| **Track** | **Track 01: Air** (*Help people breathe easier. Track what is in the air, warn the people most exposed to it, and change what happens on the bad days.*) |
| **Core Problem** | Toxic urban air pollution (Delhi AQI 400+ smog events, stubble burning, industrial particulate emissions, indoor exposure). |
| **Proposed Solution** | Active, verified botanical atmospheric bio-scrubbing incentivized via a decentralized Proof of Useful Work protocol and compliance marketplace. |
| **AWS Cloud Infrastructure** | **AWS EC2 (`54.224.180.188`)**: Dockerized backend orchestrator running NGINX Reverse Proxy, Mosquitto MQTT Broker, Node.js Attestation Oracle, C4 Event Indexer, and Edge Miner Daemon. |
| **Blockchain Network** | **Polygon Amoy Testnet (Chain ID `80002`)**: 6 smart contracts deployed and verified on-chain. |
| **Live Deployments** | Market Portal: [aircoin-market.vercel.app](https://aircoin-market.vercel.app) \| 3D Digital Twin: [aircoin-twin.vercel.app](https://aircoin-twin.vercel.app) \| AWS API: `http://54.224.180.188` |

---

## 1. Problem Statement & Track Alignment (Track 01: Air)

In cities across India, toxic air pollution is an escalating public health catastrophe. During winter temperature inversions, Delhi-NCR and northern plains regularly experience sustained AQI levels exceeding 400, characterized by hazardous concentrations of PM2.5, PM10, nitrogen dioxide (NO2), and sulfur dioxide (SO2).

### The Limits of Existing Solutions

1. **Passive Monitoring Without Remediation**: Conventional air quality apps display alarming AQI numbers, but do nothing to actively remove pollutants from the air people breathe in schools, homes, and offices.
2. **Opaque Carbon Offsets**: Traditional carbon offset markets are centralized, prone to double-counting, and plagued by "phantom credits" where buyers have zero real-time mathematical proof that any pollution was actually removed.
3. **Wasteful Cryptographic Proof of Work**: Traditional blockchain consensus mechanisms consume megawatts of electricity to compute meaningless hashing puzzles, compounding energy consumption without producing tangible environmental utility.

### The AIRcoin Solution

AIRcoin shifts the paradigm from **passive monitoring** to **active, cryptographically verified atmospheric de-pollution**:

1. **Biological Capture**: Specialized 20-pot botanical arrays deploy species with proven phytoremediation and high particulate deposition velocities (Snake Plant, Peace Lily, Areca Palm, Tulsi, Neem).
2. **Edge Sensor Verification**: Laser scatter particulate counters (PMS5003) and gas chambers (MQ-135) capture real-time ambient and post-filtration concentrations.
3. **Mathematical Bio-Absorption Modeling**: An onboard daemon runs empirical leaf-area absorption equations to compute exact milligrams of pollutants scrubbed.
4. **Hardware Cryptographic Attestation**: The edge miner signs telemetry epochs with a device-specific secp256k1 private key.
5. **Decentralized Validation & Minting**: An oracle verifies hardware signatures, ArUco biometric plant markers, and NDVI plant liveness before authorizing the on-chain minting of AIR tokens on the Polygon blockchain.
6. **Institutional Compliance Loop**: Obligated industrial polluters buy AIR credits on the marketplace and permanently burn them on-chain to retire statutory emissions obligations.

- **Unit of Remediation**: 1.0 AIR = 1.0 mg PM2.5-equivalent removed from the atmosphere.
- **Epoch Duration**: 60 seconds (real-time demo cadence).

---

## 2. AWS Architecture & Cloud Infrastructure

The AIRcoin production backend is architected for high-throughput IoT ingestion, cryptographic signature verification, and decentralized query serving, powered by **Amazon Web Services (AWS)**:

### 2.1 Backend Microservices on AWS EC2 (`54.224.180.188`)

The backend runs as a multi-container Docker orchestration deployed on an AWS EC2 instance:

```
[IoT Edge Miners / Simulators]
            │
            ▼  (TCP :1883 / WSS :9001)
┌─────────────────────────────────────────────────────────────┐
│  AWS EC2 Backend Instance (54.224.180.188)                  │
│                                                             │
│   ┌─────────────────────────────────────────────────────┐   │
│   │ NGINX Reverse Proxy & API Gateway (:80 / :443)      │   │
│   │ - Path-based proxying, rate limiting, and CORS      │   │
│   └──────────┬──────────────────────┬───────────────────┘   │
│              │                      │                       │
│              ▼                      ▼                       │
│   ┌────────────────────┐   ┌────────────────────────────┐   │
│   │ Mosquitto MQTT     │   │ Attestation Oracle (:3001) │   │
│   │ IoT Message Broker │   │ - secp256k1 Verification   │   │
│   │ (:1883 & :9001)    │   │ - Polygon Amoy Submitter   │   │
│   └──────────┬─────────┘   └──────────────┬─────────────┘   │
│              │                            │                 │
│              ▼                            ▼                 │
│   ┌────────────────────┐   ┌────────────────────────────┐   │
│   │ Miner Core Engine  │   │ C4 Event Indexer (:3002)   │   │
│   │ - Bio-Uptake Math  │   │ - Real-time SQLite Sync    │   │
│   │ - Scenario Daemon  │   │ - REST & WebSocket Feed    │   │
│   └────────────────────┘   └────────────────────────────┘   │
└─────────────────────────────────────────────────────────────┘
            │                               │
            ▼                               ▼
 [Polygon Amoy Blockchain]      [Vercel Edge Frontends]
 (Smart Contract Layer)         (Marketplace & 3D Twin)
```

- **NGINX Reverse Proxy & API Gateway**: Serves as the central security and routing boundary. Routes `/v1/*` to the Indexer, `/attestations` to the Validator Oracle, `/mqtt` to the Mosquitto WebSocket bridge, and handles global CORS for Vercel edge clients.
- **Mosquitto MQTT Message Broker**: Provides ultra-low-latency publish/subscribe channels for high-frequency sensor telemetry (`miner/{id}/telemetry`) and epoch claims (`miner/{id}/epoch`).
- **Attestation Oracle Service (Node.js)**: Listens for signed edge attestation claims, checks registration status and geofencing against `MinerRegistry.sol`, recovers the ECDSA signer address via `ecrecover`, and submits verified transactions to `MintController.sol`.
- **C4 Event Indexer (Node.js / SQLite)**: Continuously syncs on-chain events (`Minted`, `Listed`, `Purchased`, `Burned`) and serves RESTful C4 queries and live WebSocket feeds to client applications.
- **Miner Core Daemon & Scenario Controller (Python / FastAPI)**: Houses the bio-absorption engine, multi-scenario pollution generator, and anti-cheat validation harness.

### 2.2 Enterprise AWS Cloud Readiness

The platform includes production specifications for enterprise cloud deployment documented in [`infra/AWS-DEPLOYMENT-GUIDE.md`](file:///Users/umashankar/Downloads/AIRcoin/infra/AWS-DEPLOYMENT-GUIDE.md):
- **AWS ECS Fargate**: Blueprint for running the Validator, Indexer, and Gateway as autoscaling serverless container tasks.
- **AWS IoT Core**: Migration path for device provisioning, X.509 device certificates, and managed MQTT topics.
- **Amazon CloudWatch**: Centralized log streaming and automated alerts for oracle rejected attestations.

---

## 3. Mathematical Formulation & Bio-Absorption Model

AIRcoin establishes a deterministic, mathematically verifiable relationship between physical plant biology, sensor measurements, and token minting.

### 3.1 The Bio-Uptake Engine

For each plant slot $i$ and pollutant $p$, the instantaneous pollutant removal rate $R_{i,p}$ ($mg/h$) is computed by the edge daemon:

$$R_{i,p} = k_{s(i), p} \times A_i \times H_i \times f\left(\frac{C_p}{C_{p,\text{ref}}}\right) \times \Delta t$$

Where:
- $k_{s(i), p}$: Species-specific baseline absorption rate ($mg/m^2\cdot h$) for species $s(i)$ and pollutant $p$.
- $A_i$: Effective green leaf surface area ($m^2$) derived from optical computer vision segmentation.
- $H_i$: Biometric plant health factor ($0.0 \le H_i \le 1.0$) determined by NDVI spectral reflectance.
- $C_p$: Measured ambient concentration of pollutant $p$.
- $C_{p,\text{ref}}$: Reference concentration baseline from standard ambient air quality guidelines.
- $f(x)$: Non-linear concentration response curve, capped at $5.0\times$ baseline to prevent artificial sensor saturation attacks.
- $\Delta t$: Epoch duration time interval ($h$).

### 3.2 Damage-Cost Equivalence (PM2.5-Equivalent)

To aggregate disparate pollutants into a single unified token metric, AIRcoin weights each pollutant by its societal health damage cost based on the **CE Delft Environmental Prices Handbook (EU28 central values)**:

$$\text{Weight}(p) = \frac{\text{Damage Cost}(p)}{\text{Damage Cost}(\text{PM2.5})}$$

$$\text{Total AIR Minted} = \sum_{p} \left( \text{Weight}(p) \times \sum_{i=1}^{N} R_{i,p} \right)$$

| Pollutant | Chemical / Symbol | Damage Cost (EUR/kg) | Relative Weight ($w_p$) | Baseline Ref. Conc. |
|---|---|---:|---:|---|
| **PM2.5** | Fine Particulate Matter | EUR 38.70 | **1.000** (Reference) | 35 ug/m3 |
| **PM10** | Coarse Particulate Matter | EUR 26.60 | **0.690** | 50 ug/m3 |
| **NO2** | Nitrogen Dioxide | EUR 14.80 | **0.380** | 25 ppb |
| **SO2** | Sulfur Dioxide | EUR 11.50 | **0.300** | 10 ppb |
| **VOCs** | Volatile Organic Compounds | EUR 1.15 | **0.030** | 100 VOC Index |
| **CO2** | Carbon Dioxide | EUR 0.057 | **0.0015** | 420 ppm |
| **CO** | Carbon Monoxide | EUR 0.0526 | **0.0014** | 1.0 ppm |

### 3.3 Cryptographic Safety Caps

To protect against runaway minting, oracle compromise, or sensor malfunction:
- **Per-Plant Cap**: Maximum $0.01\text{ AIR}$ per plant per epoch ($60\text{ s}$).
- **Per-Miner Cap**: Maximum $0.20\text{ AIR}$ per miner per epoch ($20\text{ plants} \times 0.01$).
- **Single-Mint Guarantee**: `MintController.sol` enforces that each epoch index can only be minted once per registered hardware device.

---

## 4. Multi-Layer Anti-Cheat & Physical Attestation

Physical Proof of Useful Work requires multi-tier defense against spoofing, hardware tampering, and fake plants:

1. **Optical ArUco Tag Tracking**: Each plant pot carries a registered waterproof ArUco fiducial marker. The vision pipeline continuously decodes marker IDs and verifies that each tag belongs to the miner's authorized registry set.
2. **Species Re-Identification**: A MobileNetV3 visual embedding model extracts high-dimensional feature vectors of each plant. Swapping an enrolled plant with a different species immediately flags the slot as `suspect`.
3. **NDVI Spectral Liveness Filter**: Using a NoIR camera module with a dual-band blue filter, the pipeline computes the Normalized Difference Vegetation Index:
   $$\text{NDVI} = \frac{\text{NIR} - \text{Red}}{\text{NIR} + \text{Red}}$$
   Live photosynthetic plant tissue reflects strongly in near-infrared while absorbing visible red. Plastic artificial plants, paper photographs, and dead foliage fail this threshold and receive a health score of zero.
4. **Physical Airflow Differential**: Dual optical particulate sensors measure both incoming ambient air and post-canopy filtered exhaust to confirm measurable physical particulate drop across the rack.
5. **secp256k1 Device Key Signing**: Each physical miner possesses an onboard secp256k1 private key generated inside hardware security. All telemetry epochs are signed before dispatch. The validator recovers the signer address on-chain via `ecrecover`.

---

## 5. End-to-End System Architecture

```mermaid
graph TD
    subgraph EdgeDevice ["Edge Botanical Miner (Raspberry Pi Suite)"]
        Cam["NoIR Camera (ArUco Tracking & NDVI Liveness)"]
        Sensors["Sensors (PMS5003 Laser, MQ-135 Gas Chamber)"]
        Daemon["Edge Daemon (minerd)"]
        Signer["secp256k1 Hardware Signer"]
    end

    subgraph AWSCloud ["AWS Cloud Infrastructure (EC2 : 54.224.180.188)"]
        Gateway["NGINX Gateway & Reverse Proxy"]
        MQTT["Mosquitto MQTT Broker (:1883 / :9001)"]
        Validator["Attestation Oracle Service (:3001)"]
        Indexer["C4 Event Indexer & REST API (:3002)"]
    end

    subgraph Blockchain ["Polygon Amoy Blockchain (Chain ID 80002)"]
        MR["MinerRegistry.sol"]
        MC["MintController.sol"]
        AIR["AIRToken.sol (ERC-20)"]
        MP["Marketplace.sol"]
        CR["ComplianceRegistry.sol"]
    end

    subgraph ClientApps ["Client Applications (Vercel Edge CDN)"]
        Twin["3D Digital Twin Viewer (Three.js + React)"]
        Market["Chain-Market Web Platform (React + Vite)"]
    end

    Cam -->|Publish C1| MQTT
    Sensors -->|Raw ADC Readings| Daemon
    MQTT -->|Subscribe C1| Daemon
    Daemon --> Signer
    Signer -->|Publish C2| MQTT
    Daemon -->|Submit C3| Gateway

    Gateway -->|Forward Attestation| Validator
    Validator -->|Verify Signature & Geofence| MR
    Validator -->|mintForEpoch| MC
    MC -->|Mint Tokens| AIR

    Indexer -->|Sync Mint Events| AIR
    Indexer -->|Sync Orders & Trades| MP
    Indexer -->|Sync Retirements & Burns| CR

    MQTT -->|Real-Time WSS Telemetry| Twin
    Gateway -->|C4 REST & WebSocket| Twin
    Gateway -->|C4 REST & WebSocket| Market
    Market -->|Order Execution & Burn| MP
```

---

## 6. Smart Contracts & Polygon Amoy State

All six protocol smart contracts are deployed and verified on the **Polygon Amoy Testnet** (Chain ID `80002`):

| Contract | Polygon Amoy Address | Role & Architecture | Explorer Link |
|---|---|---|---|
| **AIRToken** | `0x7388415fBf7C817CC15b09f03BAaFc05044FB911` | Canonical ERC-20 utility token representing verified atmospheric de-pollution (18 decimals). Mintable exclusively by `MintController.sol`. | [View on Polygonscan](https://amoy.polygonscan.com/address/0x7388415fBf7C817CC15b09f03BAaFc05044FB911) |
| **TestINR** | `0x30Bc6d7f428416bAeC6E00B110cF866AD04Fc2Ab` | ERC-20 mock fiat stablecoin (`tINR`) enabling institutional polluters to purchase AIR tokens on the marketplace. | [View on Polygonscan](https://amoy.polygonscan.com/address/0x30Bc6d7f428416bAeC6E00B110cF866AD04Fc2Ab) |
| **MinerRegistry** | `0x5190eBE58f9061A739c2E53F021cA935B7aac1ec` | Authoritative registry tracking physical miner IDs, device public keys, owner wallets, sticker set hashes, and geofences. | [View on Polygonscan](https://amoy.polygonscan.com/address/0x5190eBE58f9061A739c2E53F021cA935B7aac1ec) |
| **MintController** | `0xaE768B5A97b782C6cb171acd9f24d4d45b5a6557` | Enforces hardware signature verification (`ecrecover`), single-mint-per-epoch rules, calibration hash checks, and rate caps. | [View on Polygonscan](https://amoy.polygonscan.com/address/0xaE768B5A97b782C6cb171acd9f24d4d45b5a6557) |
| **Marketplace** | `0x43FC1D02B74772f47f7645be819eD7b96A889d79` | Non-custodial order book enabling citizens to list earned AIR tokens and enterprises to execute atomic settlement in `tINR`. | [View on Polygonscan](https://amoy.polygonscan.com/address/0x43FC1D02B74772f47f7645be819eD7b96A889d79) |
| **ComplianceRegistry** | `0x04b55e1dD7aF920d016e9aDb5c01Ee457E9E3831` | Regulatory registry where government authorities mandate corporate offset quotas and enterprises permanently burn tokens to retire liabilities. | [View on Polygonscan](https://amoy.polygonscan.com/address/0x04b55e1dD7aF920d016e9aDb5c01Ee457E9E3831) |

Live contract deployment metadata is stored in [`chain-market/contracts/deployments.json`](file:///Users/umashankar/Downloads/AIRcoin/chain-market/contracts/deployments.json).

---

## 7. Protocol Interface Schemas (C1–C4)

All inter-service messaging conforms to immutable, versioned contracts defined in [`contracts-schema/`](file:///Users/umashankar/Downloads/AIRcoin/contracts-schema):

- **C1: Vision Event (`c1-vision-event.json`)**: Emitted by the optical camera rig at 1 Hz. Identifies detected ArUco tag IDs, matched plant species, computed leaf surface area ($cm^2$), and NDVI liveness scores across all 20 rack slots.
- **C2: Telemetry Epoch (`c2-epoch.json`)**: Broadcast by the miner daemon every 60 seconds over MQTT. Contains ambient concentration averages (PM2.5, PM10, CO2, VOC, NO2, SO2, CO), intake telemetry, individual plant absorption yields, cumulative AIR totals, and attestation readiness.
- **C3: Signed Attestation (`c3-attestation.json`)**: Dispatched by the miner daemon to the Validator Oracle. Encapsulates epoch indexes, claimed token quantities, evidence hashes, and the secp256k1 ECDSA hardware signature.
- **C4: Indexer & Query API (`c4-*.json`)**: Public REST and WebSocket interfaces served by the event indexer for frontend visualization, historic epoch queries, compliance verification, and order book matching.

---

## 8. Phytoremediation Botanical Catalogue

AIRcoin integrates botanical species tested in the **NASA Clean Air Study (Wolverton et al., 1989)** and urban phytoremediation field literature:

| Species Common Name | Scientific Name | Placement | Primary Target Pollutants | Uptake Profile | Scientific Citation |
|---|---|---|---|---|---|
| **Snake Plant** | *Dracaena trifasciata* | Indoor | Benzene, Formaldehyde, TCE, Xylene, Night CO2 | High VOC, Night CO2 | NASA Clean Air Study |
| **Peace Lily** | *Spathiphyllum wallisii* | Indoor | Benzene, Formaldehyde, Ammonia, Trichloroethylene | High VOC, High Transpiration | NASA Clean Air Study |
| **Areca Palm** | *Dypsis lutescens* | Indoor | PM2.5, Formaldehyde, Xylene, Toluene | High Transpiration, Medium PM | Wolverton Environmental |
| **Tulsi (Holy Basil)** | *Ocimum tenuiflorum* | Outdoor / Balcony | Sulfur Dioxide (SO2), Nitrogen Oxides (NOx), PM10 | High SO2, Medium NOx | Urban Phytoremediation Studies |
| **Neem** | *Azadirachta indica* | Outdoor / Balcony | Heavy Particulates (PM2.5/PM10), SO2, Exhaust Aerosols | High PM Deposition Velocity | Central Pollution Control Board |

Full species definitions, base rates, and calibration curves are codified in [`contracts-schema/data/species-catalogue.json`](file:///Users/umashankar/Downloads/AIRcoin/contracts-schema/data/species-catalogue.json).

---

## 9. Alignment with Hackathon Judging Criteria

The project is structured to directly address each of the five official judging criteria for **Environmental Hacks (Event 02 · Bharat Builds Tour)**:

### 1. Idea and Impact
- **Real Environmental Problem**: Tackles the severe air quality crisis in Indian cities where PM2.5 and PM10 levels frequently exceed 10x WHO safety thresholds.
- **Measurable Human Impact**: Moves beyond passive sensor observation to physically scrubbing toxic particulate matter from residential and commercial micro-environments.
- **Avoided Health Costs**: Quantifies ecological work using recognized public health damage costs from the CE Delft Environmental Prices Handbook.

### 2. Built on AWS
- **Live AWS Cloud Deployment**: Production backend fully containerized and hosted on an AWS EC2 instance (`54.224.180.188`).
- **Full-Stack Orchestration**: Leverages NGINX, Mosquitto MQTT broker, Node.js attestation oracle, SQLite event indexer, and FastAPI edge daemon.
- **Enterprise Cloud Blueprint**: Comprehensive architecture specifications for AWS ECS Fargate, AWS IoT Core, and CloudWatch in [`infra/AWS-DEPLOYMENT-GUIDE.md`](file:///Users/umashankar/Downloads/AIRcoin/infra/AWS-DEPLOYMENT-GUIDE.md).

### 3. Design and Usability
- **3D Living Miner Digital Twin**: Interactive Three.js model with exploded hardware inspection, slot-by-slot botanical health monitoring, and NDVI false-color camera PiP.
- **Intuitive Web Platform**: Role-tailored user journeys for Citizens (Alice), Corporate Buyers (Apex Steel Works), and Government Regulators with clear visual feedback.
- **Zero Confusion Onboarding**: Integrated `tINR` test fiat faucet allows immediate one-click testing of marketplace trades and compliance burns without external crypto onboarding friction.

### 4. The Execution
- **100% Working End-to-End Pipeline**: From sensor telemetry and computer vision inference through secp256k1 signing, oracle attestation, on-chain Polygon Amoy minting, and marketplace order execution.
- **Robust Test Coverage**: 44+ passing pytest unit tests for the bio-uptake engine and anti-cheat, 23 passing Hardhat smart contract tests, and full JSON schema validation.

### 5. Live Demonstration & Verifiability
- **Publicly Accessible Endpoints**:
  - Carbon Credit Marketplace: [https://aircoin-market.vercel.app](https://aircoin-market.vercel.app)
  - 3D Living Miner Digital Twin: [https://aircoin-twin.vercel.app](https://aircoin-twin.vercel.app)
  - AWS Backend Health API: `http://54.224.180.188/healthz`
  - Indexer C4 API: `http://54.224.180.188/v1/miners/miner-001`
  - Polygon Amoy Verified Contracts on Polygonscan.

---

## 10. Monorepo Workstreams & Repository Layout

This repository is organized into distinct workstreams communicating exclusively through versioned contracts:

```
AIRcoin/
├── contracts-schema/         # Shared frozen JSON schemas (C1-C4), species catalogue, and validation scripts
│   ├── data/                 # species-catalogue.json, reference concentrations, damage cost tables
│   ├── schemas/              # JSON Schema validation definitions for C1, C2, C3, and C4 interfaces
│   └── scripts/              # Automated protocol schema validation tools
│
├── vision-twin/              # Workstream A: Vision pipeline and 3D digital twin
│   ├── pipeline/             # Python ArUco detection, MobileNetV3 classifier, NDVI spectral analysis
│   └── twin/                 # Interactive Three.js 3D living miner viewer, exploded hardware model, HUD
│
├── miner-core/               # Workstream B: Edge miner daemon and PoUW engine
│   ├── minerd/               # Edge daemon, sensor drivers, SQLite offline queue, secp256k1 signer
│   ├── simulation/           # Multi-scenario atmospheric simulator (Clean Morning, Rush Hour, Smog)
│   └── tests/                # Automated pytest suites for bio-uptake mathematics and anti-cheat
│
├── chain-market/             # Workstream C: Blockchain contracts, oracle, and web platform
│   ├── contracts/            # Hardhat Solidity smart contracts (AIRToken, Marketplace, Compliance)
│   ├── validator/            # Node.js attestation oracle, signature verification, on-chain submitter
│   ├── indexer/              # Real-time event indexer, SQLite datastore, C4 REST and WebSocket server
│   └── web/                  # Web platform (Citizen Wallet, Marketplace, Corporate Burn, Regulator)
│
├── infra/                    # Architecture runbooks, Docker Compose configs, and NGINX gateway definitions
└── scripts/                  # Unified local orchestration and test execution scripts
```

---

## 11. Interactive Local Demo & Quickstart

The entire AIRcoin stack can be launched locally with a single script for local evaluation:

### Quickstart

#### On macOS & Linux:
```bash
./scripts/demo.sh start
```

#### On Windows:
```bat
scripts\demo.cmd start
```

### Management Commands
```bash
./scripts/demo.sh status   # Check health of running background microservices
./scripts/demo.sh stop     # Gracefully terminate all local services
```

### Local Services & Ports

| Service | Port | Local URL | Role |
|---|---:|---|---|
| **3D Digital Twin** | 5174 | `http://localhost:5174` | Three.js living miner model, 20-slot botanical rack, exploded hardware inspector, and plant health monitor |
| **Chain-Market Platform** | 5173 | `http://localhost:5173` | Citizen Wallet, Credit Marketplace, Corporate Burn Portal, and Government Oversight console |
| **Scenario Controller** | 8090 | `http://localhost:8090` | Interactive pollution scenario simulator (Clean Morning, Rush Hour, Festival Smog) |
| **Service Health Check** | 8090 | `http://localhost:8090/health` | Real-time connectivity monitor for Miner, MQTT, Validator, and Blockchain |
| **Validator Oracle** | 3001 | `http://localhost:3001` | Attestation signature verification service and mint submission pipeline |
| **Event Indexer** | 3002 | `http://localhost:3002` | Real-time C4 query API and WebSocket event feed |
| **Local EVM Node** | 8545 | `http://localhost:8545` | Hardhat Ethereum development network |
| **Mosquitto MQTT** | 1883 | `mqtt://localhost:1883` | IoT message broker (WebSocket bridge on `:9001`) |

---

## 12. Guided Feature Walkthrough

### 1. Verify Connectivity
Navigate to `http://localhost:8090/health` (or `http://54.224.180.188/healthz` on AWS). Confirm that all diagnostic indicators display healthy states.

### 2. Simulate Atmospheric Scenarios
Open the Scenario Controller at `http://localhost:8090/`:
- **Clean Morning (AQI ~45)**: Baseline ambient conditions; moderate baseline token accumulation.
- **Rush Hour (AQI ~180)**: Elevated nitrogen dioxide and particulate concentrations; increased bio-absorption rate.
- **Festival Smog (AQI ~400)**: Severe atmospheric pollution; bio-uptake engine reaches peak operational capacity.

### 3. Explore the 3D Living Miner Digital Twin
Open [https://aircoin-twin.vercel.app](https://aircoin-twin.vercel.app) (or `http://localhost:5174` locally):
- **Orbit Controls**: Left-click to rotate, right-click to pan, scroll to zoom around the 20-slot living botanical array.
- **Hardware Exploded View**: Hover over the central sensor housing to trigger the HUD hint, then click to animate the exploded inspection view of the internal PMS5003 laser sensor, MQ-135 chamber, Raspberry Pi controller, and power bus.
- **Optical & NDVI Vision**: Toggle between real-time RGB optical monitoring and false-color NDVI plant vigor maps in the camera PiP display.
- **Anti-Cheat Verification**: Drag botanical pots to simulate tampering and observe immediate anti-cheat invalidation in the telemetry HUD.

### 4. Trade and Retire Credits on the Marketplace
Open [https://aircoin-market.vercel.app](https://aircoin-market.vercel.app) (or `http://localhost:5173` locally):
- **Citizen Account (Alice)**: Review verified AIR token balances minted from miner `miner-001`. Create a sell listing on the decentralized exchange.
- **Corporate Account (Apex Steel Works)**: View statutory carbon offset quotas for the 2026 fiscal year. Purchase available AIR credits using `tINR` liquidity.
- **Retirement / Burn Portal**: Execute an on-chain compliance burn. The smart contract burns tokens irreversibly and registers the reduction in `ComplianceRegistry.sol`.
- **Regulator Console**: Access government auditing views to inspect rejected attestation logs, miner geofence boundaries, and network-wide de-pollution statistics.

---

## 13. Test Suites & Verification

Verify system guarantees and mathematical invariant correctness locally:

```bash
# 1. Interface Schemas & Species Catalogue Validation
python3 contracts-schema/scripts/validate.py

# 2. Smart Contract Unit Tests (Hardhat)
cd chain-market/contracts && npx hardhat test

# 3. Indexer Store & Deduplication Tests
cd chain-market/indexer && npm test

# 4. Miner Estimation Engine, Cryptography & Anti-Cheat Unit Tests (Pytest)
cd miner-core && pytest -q tests/

# 5. Client Application Production Bundle Verification
cd vision-twin/twin && npm run build
cd ../../chain-market/web && npm run build
```

---

## 14. Technical Specifications & References

- **Botanical Calibration Protocol**: [`miner-core/docs/calibration-protocol.md`](file:///Users/umashankar/Downloads/AIRcoin/miner-core/docs/calibration-protocol.md) — Mathematical formulations for particulate deposition velocity, aerodynamic resistance, and leaf area indexing.
- **Workstream Handoff Specifications**: [`miner-core/docs/handoff-vision-twin.md`](file:///Users/umashankar/Downloads/AIRcoin/miner-core/docs/handoff-vision-twin.md) — Contract-driven interfaces between edge computer vision and the living digital twin.
- **Frozen Protocol Schemas**: [`contracts-schema/README.md`](file:///Users/umashankar/Downloads/AIRcoin/contracts-schema/README.md) — Specification for C1, C2, C3, and C4 data schemas.
- **Smart Contract Architecture**: [`chain-market/README.md`](file:///Users/umashankar/Downloads/AIRcoin/chain-market/README.md) — On-chain security rules, role permissions, and tokenomics.
- **AWS Infrastructure Specification**: [`infra/AWS-DEPLOYMENT-GUIDE.md`](file:///Users/umashankar/Downloads/AIRcoin/infra/AWS-DEPLOYMENT-GUIDE.md) — Production architecture specification for AWS EC2, ECS Fargate, NGINX Gateway, and Mosquitto MQTT.
