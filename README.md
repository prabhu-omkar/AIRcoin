# AIRcoin

> **Proof of Useful Work for clean air.** A low-cost camera miner watches 20 pollution-absorbing plants, proves the work they did, and earns AIR on AIRcoin's own blockchain, where every miner is also a node. Citizens sell AIR on a marketplace; polluting companies buy it and burn it against their obligations.

| | |
|---|---|
| **Event** | Environmental Hacks (Bharat Builds Tour, WeMakeDevs × AWS) · Track 01: Air |
| **Team** | 8-Bit: Omkar, Shreyas, Umashankar |
| **Unit** | 1 AIR = 1 mg PM2.5-equivalent removed · 60-second epochs |
| **Blockchain** | `aircoind`: AIRcoin's own chain. CometBFT consensus among approved miners, ~1 s blocks, instant finality, no gas |

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
5. **Decentralized Validation & Minting**: Every miner runs a node of AIRcoin's own blockchain. Each node re-checks the device signature, stickers, geofence and caps of every proof before AIR is minted, so no single server decides what is real.
6. **Institutional Compliance Loop**: Obligated industrial polluters buy AIR credits on the marketplace and permanently burn them on-chain to retire statutory emissions obligations.

- **Unit of Remediation**: 1.0 AIR = 1.0 mg PM2.5-equivalent removed from the atmosphere.
- **Epoch Duration**: 60 seconds (real-time demo cadence).

---

## 2. How it works

```
  20 plants + NoIR camera + sensors (Raspberry Pi)          other miners
 ┌────────────────────────────────────────────────┐       ┌──────────────┐
 │ vision-twin/pipeline ──C1──► miner-core        │       │   aircoind   │
 │   tags, species, NDVI    (MQTT)  estimate, sign │       │  (validator) │
 │                                   │ C3 proof    │  p2p  │              │
 │                                   ▼             │◄─────►│      …       │
 │ aircoind: AIRcoin chain node + gateway :8700   │       └──────────────┘
 └─────────────────────────┬──────────────────────┘
                           │ C4 REST + WebSocket (any node)
           ┌───────────────┴───────────────┐
   marketplace (chain-market/web)   digital twin (vision-twin/twin)
   citizens · companies · regulator  3D rig, live dashboard, mints
```

1. **See.** The vision pipeline finds each sticker-tagged plant, checks its species and NDVI liveness, and publishes C1 events.
2. **Estimate and sign.** miner-core turns sensor readings and leaf area into milligrams removed per pollutant, converts them to AIR, and signs a C3 proof with the device key every epoch.
3. **Verify and mint.** The proof goes to the miner's own node. Every node re-runs the checks and mints AIR to the owner's wallet, or records the rejection.
4. **Trade and retire.** Citizens list AIR for test rupees (tINR); companies buy and burn it against the obligation the regulator set. The regulator approves new miners on-chain.

### Why our own chain

Plant work is cheap to fake compared with the value of controlling a ledger, so it can't be what picks the block producers. The research is consistent on this point, and Helium uses the same split. AIRcoin therefore separates the two jobs:

- **Consensus:** CometBFT BFT among regulator-approved miners. It tolerates up to ⅓ of nodes offline or malicious.
- **Minting:** Proof of Useful Work. AIR is created only from verified plant proofs, re-checked by every node.

Voting power grows a little with consistent minting (capped). The block proposer earns 2% of the AIR minted in its block. Details, design notes and the test record are in [`aircoin-chain/README.md`](aircoin-chain/README.md).

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
- **Single-Mint Guarantee**: the chain mints each (miner, epoch) only once, and only for epochs that closed in the last 10 minutes.
- **Honest Totals**: the minted amount may not exceed the sum of the per-plant claims.

---

---

## 4. Multi-Layer Anti-Cheat & Physical Attestation

Physical Proof of Useful Work requires multi-tier defense against spoofing, hardware tampering, and fake plants:

1. **Optical ArUco Tag Tracking**: Each plant pot carries a registered waterproof ArUco fiducial marker. The vision pipeline continuously decodes marker IDs and verifies that each tag belongs to the miner's authorized registry set.
2. **Species Re-Identification**: A MobileNetV3 visual embedding model extracts high-dimensional feature vectors of each plant. Swapping an enrolled plant with a different species immediately flags the slot as `suspect`.
3. **NDVI Spectral Liveness Filter**: Using a NoIR camera module with a dual-band blue filter, the pipeline computes the Normalized Difference Vegetation Index:
   $$\text{NDVI} = \frac{\text{NIR} - \text{Red}}{\text{NIR} + \text{Red}}$$
   Live photosynthetic plant tissue reflects strongly in near-infrared while absorbing visible red. Plastic artificial plants, paper photographs, and dead foliage fail this threshold and receive a health score of zero.
4. **Physical Airflow Differential**: Dual optical particulate sensors measure both incoming ambient air and post-canopy filtered exhaust to confirm measurable physical particulate drop across the rack.
5. **secp256k1 Device Key Signing**: Each physical miner possesses an onboard secp256k1 private key generated inside hardware security. All telemetry epochs are signed before dispatch. Every chain node recovers the signer and checks it against the device registered on-chain.
6. **On-Chain Rejection Log**: a refused proof that the device itself signed (wrong GPS, foreign sticker, over cap, too early or too late) is written into a block as a failed transaction, so every node and every app sees the same anti-cheat record.

---

## 5. Interfaces (C1–C4)

All messages crossing a folder boundary follow the frozen schemas in [`contracts-schema/`](contracts-schema/).

| | From → To | Transport |
|---|---|---|
| **C1** vision event | vision → miner-core | MQTT `miner/{id}/vision`, ~1/s |
| **C2** telemetry, epoch | miner-core → twin | MQTT `miner/{id}/telemetry`, `miner/{id}/epoch` |
| **C3** signed attestation | miner-core → chain | `POST /v1/attestations` on any node |
| **C4** miner, balance, mints, events | chain → apps | `GET /v1/miners/{id}[/balance\|/mints]`, WebSocket `/v1/events` |

The chain gateway also serves marketplace and admin data (`/v1/listings`, `/v1/trades`, `/v1/burns`, `/v1/obligations`, `/v1/applications`, `/v1/rejections`, `/v1/validators`, `/v1/totals`). It accepts signed transactions at `/v1/tx`; any Ethereum key signs them with `personal_sign`.

---

## 6. Run it

**Needs:** Python 3.11+, Node 18+, Go 1.21+. Docker is optional; it provides Mosquitto with the WebSocket port the twin uses.

```bash
pip install -r miner-core/requirements.txt -r vision-twin/pipeline/requirements.txt
python scripts/demo.py start            # Windows: scripts\demo.cmd start
python scripts/demo.py start --camera synthetic   # also run the camera pipeline on synthetic NoIR frames
```

This starts MQTT, a 4-miner chain, the real miner daemon for `miner-001`, simulated miners for the other three, the marketplace and the twin.

| What | Where |
|---|---|
| Marketplace | http://localhost:3000: **Connect MetaMask**, or a demo account (password `aircoin`): `alice@aircoin.in`, `rohan@aircoin.in`, `meera@aircoin.in`, `compliance@apexsteel.in`, `regulator@cpcb.gov.in` |
| Digital twin | http://localhost:5174 |
| Miner health and scenarios | http://localhost:8090 |
| Chain gateways | http://localhost:8700 … 8703 (one per miner node) |
| Camera streams (with `--camera`) | http://localhost:8080 |

```bash
python scripts/demo.py status          # every node's height, hash and minting totals
python scripts/demo.py kill-node 2     # the other miners keep the chain going
python scripts/demo.py restart node2   # the node catches back up
python scripts/demo.py stop            # chain data stays in .demo/chain; start --fresh resets it
```

Demo keys for every account are in [`aircoin-chain/demo/demo-accounts.json`](aircoin-chain/demo/demo-accounts.json). They are public test keys; don't use them for anything real.

### Walkthrough

1. **Miner:** http://localhost:8090. Switch scenarios (clean morning, rush hour, festival smog) and watch the AIR per epoch change.
2. **Twin:** http://localhost:5174. The 3D rig, then *Overview*, *Plants* and *Earnings & security* for the same miner, all live. Drag a pot off the rack and watch it get flagged.
3. **Citizen (Alice):** her miner's mints are in the ledger. List some AIR for tINR, or top up from the faucet.
4. **Company (Apex Steel):** buy Alice's listing, then burn it under *Retire & Burn*. The 2026 obligation bar moves on every node.
5. **Request and approve:** connect MetaMask as a new citizen and request a miner, then sign in as `regulator@cpcb.gov.in` and approve it. The new miner is on the chain with its own device key.
6. **Fault tolerance:** `kill-node 2`. Blocks keep coming; restart the node and it syncs.

### On Raspberry Pis and AWS

`cd aircoin-chain && make pi` builds a static `aircoind` for arm64. `aircoind testnet --hosts …` writes one node folder per machine, whether Pis or EC2 instances. [`aircoin-chain/README.md`](aircoin-chain/README.md) covers adding a new miner to a running network (apply → regulator approves → it becomes a validator). The two frontends are static builds (`npm run build`) for S3/CloudFront or Vercel; point `VITE_CHAIN_URL` and `VITE_C4_URL` at any public node.

---

## 7. Phytoremediation Botanical Catalogue

AIRcoin integrates botanical species tested in the **NASA Clean Air Study (Wolverton et al., 1989)** and urban phytoremediation field literature:

| Species Common Name | Scientific Name | Placement | Primary Target Pollutants | Uptake Profile | Scientific Citation |
|---|---|---|---|---|---|
| **Snake Plant** | *Dracaena trifasciata* | Indoor | Benzene, Formaldehyde, TCE, Xylene, Night CO2 | High VOC, Night CO2 | NASA Clean Air Study |
| **Peace Lily** | *Spathiphyllum wallisii* | Indoor | Benzene, Formaldehyde, Ammonia, Trichloroethylene | High VOC, High Transpiration | NASA Clean Air Study |
| **Areca Palm** | *Dypsis lutescens* | Indoor | PM2.5, Formaldehyde, Xylene, Toluene | High Transpiration, Medium PM | Wolverton Environmental |
| **Tulsi (Holy Basil)** | *Ocimum tenuiflorum* | Outdoor / Balcony | Sulfur Dioxide (SO2), Nitrogen Oxides (NOx), PM10 | High SO2, Medium NOx | Urban Phytoremediation Studies |
| **Neem** | *Azadirachta indica* | Outdoor / Balcony | Heavy Particulates (PM2.5/PM10), SO2, Exhaust Aerosols | High PM Deposition Velocity | Central Pollution Control Board |

Full species definitions, base rates, and calibration curves are codified in [`contracts-schema/data/species-catalogue.json`](contracts-schema/data/species-catalogue.json).

---

---

## 8. Tests

```bash
python contracts-schema/scripts/validate.py                      # schemas, examples, species catalogue
cd aircoin-chain && go test ./...                                # chain rules, determinism, Python-signed proofs
cd miner-core && python -m pytest tests -q                       # engine, signing, anti-cheat, uplink
cd miner-core && python -m pytest integration_tests -q           # against a running chain (demo.py start)
cd vision-twin/pipeline && python -m pytest tests -q             # vision pipeline
cd chain-market/web && npm run build; cd vision-twin/twin && npm run build
```

---

## 9. Repository layout

| Folder | What | Owner |
|---|---|---|
| [`aircoin-chain/`](aircoin-chain/) | `aircoind`: the AIRcoin blockchain node, PoUW minting rules, gateway API, testnet tools | Omkar |
| [`vision-twin/`](vision-twin/) | camera pipeline (`pipeline/`) and digital twin (`twin/`) | Omkar |
| [`miner-core/`](miner-core/) | miner daemon: sensors, estimation engine, signer, uplink, scenario controller | Shreyas |
| [`chain-market/web/`](chain-market/) | marketplace for citizens, companies and the regulator | Umashankar |
| [`contracts-schema/`](contracts-schema/) | frozen interfaces C1–C4, registry, species catalogue | all three |
| `scripts/demo.py` | one-command local demo | all three |

The full spec is [`PRD.md`](PRD.md). It predates the move from Polygon to our own chain; the chain's README describes the current design.
