# aircoin-chain — AIRcoin's own blockchain

`aircoind` is a single Go program that every AIRcoin miner runs. The miners *are* the
network: each node keeps a full copy of the ledger, votes on blocks, proposes blocks in
turn, and serves the same C3/C4 API the twin, wallet and marketplace already use. No
Polygon, no Hardhat, no gas.

```
 Raspberry Pi miner (one per site)                         any other miner
┌────────────────────────────────────────────┐          ┌──────────────────┐
│ miner-core (Python)  ── C3 POST ──┐        │          │     aircoind     │
│                                   ▼        │  p2p     │                  │
│ aircoind ─ gateway :8080 (C3/C4 + WS)      │◄────────►│        …         │
│          ─ AIRcoin state machine (Go)      │ 26656    └──────────────────┘
│          ─ CometBFT consensus + p2p        │
└────────────────────────────────────────────┘
```

## Why it is built this way

**Plant work cannot be the consensus.** Picking block producers by "who proved the most
plant work" is unsafe: plant proofs are cheap to fake compared with the value of
controlling the ledger, and they can't be checked by math alone the way a hash puzzle
can. The research is consistent on this point. *Proof of Demand Is Not Proof of Work*
(IACR ePrint, 2026) and the 2025 SoK on useful-work consensus (ePrint 2025/1814) both
conclude that useful-work receipts should **pay** for work, not **elect** leaders.
Helium, which also began on Raspberry-Pi-class hotspots, does exactly this: coverage
proofs earn rewards, and a separate BFT validator set orders blocks.

So AIRcoin splits the two jobs:

| Job | How | Why |
|---|---|---|
| **Ordering blocks** (consensus) | CometBFT (Tendermint BFT). Approved miners are the validators. | ~1–2 s finality, no forks, keeps running with up to ⅓ of miners offline or lying. Proven in Cosmos, Celestia and many other chains. |
| **Minting AIR** (Proof of Useful Work) | An `attest` transaction carries the signed C3 proof. **Every** node re-checks it and mints only if all the rules pass. | Rewards come only from verified plant work. One dishonest node can't mint, because the other nodes compute a different state and reject its block. |
| **Who gets a vote** | Only miners the regulator approved on-chain (`approve_miner` with the node's validator key). Voting power = 10 + up to 10 extra for consistent minting (1 per 60 minted epochs in the last 24 h). | Sybil resistance comes from real, approved hardware, not from stake or electricity. Uptime is rewarded, but no miner can dominate. |
| **Block reward** | The miner that proposes a block earns 2 % on top of the AIR minted in it. Empty blocks pay nothing. | Running a node earns something, and inflation still tracks real plant work. |

## What the state machine does

All the rules live in `internal/chain` and run identically on every node.

* **Attestations (PoUW).** These are the same checks as `chain-market/validator`, in the
  same order and with the frozen C3 rejection codes: `malformed`,
  `evidence_hash_mismatch` (JCS + keccak), `unknown_miner`, `bad_signature` (EIP-191,
  device key), `miner_inactive`, `epoch_not_closed`, `calibration_mismatch`,
  `epoch_already_minted`, `sticker_claimed_by_other_miner`, `sticker_not_registered`,
  `gps_outside_geofence`, `amount_over_cap` (per-miner cap 0.2 AIR/epoch, per-plant cap
  0.01, and the amount may not exceed the plants' sum). Epochs older than 10 epochs can't
  be claimed.
* **Tokens.** AIR (minted only by attestations) and tINR (test rupee for the market,
  issued by the regulator's faucet). Both use 18-decimal base-unit strings.
* **Marketplace.** `list` escrows AIR, `buy` swaps tINR for AIR atomically, `cancel`
  refunds the escrow.
* **Compliance.** The regulator sets obligations (`set_obligation`), companies `burn` AIR
  against a period, and supply tracks minted and burned AIR.
* **Miner onboarding.** A citizen sends `apply_miner`. The regulator sends `approve_miner`
  with the device address, owner wallet, 20 stickers, location and the node's validator
  key. From the next block, that node is a validator. `set_miner_status` suspends a miner
  (its vote drops to 0), and `set_validator` rotates a node key.
* **Accounts.** Accounts are Ethereum-style secp256k1 addresses, so MetaMask works. A
  transaction is `{type, body, sig}`, where `sig` = `personal_sign(JCS({chain_id, type,
  body}))`. A nonce stops replays, and the chain id stops cross-network replays.

C3 signing is byte-for-byte compatible with miner-core's Python `Signer`.
`internal/chain/testdata/c3-signed-by-python.json` was signed by it, and a test checks
that the Go code verifies it.

## Run it

Needs Go 1.21+ (it downloads the Go 1.26 toolchain it needs automatically).

```bash
cd aircoin-chain
make test               # unit tests (rules, determinism, Python-signed proof)
make localnet           # 4 miner nodes on this machine → gateways :8080–:8083
make simulate           # each node gets a simulated miner signing a proof every epoch
make stop
```

Keys for the demo accounts (regulator, a polluting company, a citizen, and every miner's
owner and device key) are in `localnet/accounts.json`.

Example transactions (`from` and `nonce` are filled in for you):

```bash
K=$(jq -r .miners[0].owner.private_key localnet/accounts.json)
./bin/aircoind tx --key $K --type list --body '{"amount_air":"50000000000000000","price_tinr":"2000000000000000000"}'
CO=$(jq -r .company.private_key localnet/accounts.json)
./bin/aircoind tx --key $CO --type buy  --body '{"listing_id":1}'
./bin/aircoind tx --key $CO --type burn --body '{"amount":"50000000000000000","period":"2026"}'
```

### Add a new miner to a running network

```bash
./bin/aircoind init --home ./miner5 --moniker miner-005 --genesis localnet/genesis.json \
    --peers <node_id>@<host>:26656 --p2p-port 27056 --rpc-port 27057 --api-port 8084
./bin/aircoind start --home ./miner5          # syncs the chain as a non-voting node
# owner:     tx --type apply_miner   --body '{"name":…,"location":{…},"plants_planned":20}'
# regulator: tx --type approve_miner --body '{"application_id":1,"miner_id":"miner-005",
#            "device_address":…,"owner_wallet":…,"sticker_ids":[…],"location":{…},
#            "validator_pubkey":"<from init>"}'
```

After approval, the new node joins the validator set and starts proposing blocks.

### On real Raspberry Pis

```bash
make pi                                    # bin/aircoind-linux-arm64 (static, ~24 MB)
./bin/aircoind testnet --validators 4 --out net --hosts 192.168.1.21,192.168.1.22,192.168.1.23,192.168.1.24
# copy net/nodeI to Pi I, then on each Pi:
./aircoind-linux-arm64 start --home nodeI
```

## Gateway API (each node, default :8080)

| Method | Path | |
|---|---|---|
| POST | `/v1/attestations` | C3. Body is the signed attestation, response is `c3-attestation-response` (200 accepted/pending, 409 already minted, 422 rejected). |
| GET | `/v1/miners/{id}` · `/balance` · `/mints?before_epoch=&limit=` | C4 `miner`, `balance`, `mint_list` (schema-valid) |
| WS | `/v1/events?miner_id=…` or `?address=…` | C4 `mint` / `transfer` / `trade` / `burn` events |
| GET | `/v1/events/recent` · `/v1/miners` · `/v1/accounts/{addr}` · `/v1/validators` · `/v1/applications` · `/v1/obligations` · `/v1/listings` · `/v1/totals` · `/v1/status` · `/v1/params` | extras for the dashboard and admin pages |
| POST | `/v1/tx` | submit a signed `{type, body, sig}` |
| POST | `/v1/tx/prepare` | returns the exact text to `personal_sign` (lets a browser wallet sign) |

## What was tested

* 4 nodes reach consensus, ~1 block/s, with identical app hashes on every node.
* Every node mints from proofs signed by miner-core's **Python** signer. Replays, stolen
  stickers, GPS 2 km away, wrong key, inflated amounts, tampered payloads and future
  epochs are each rejected with the right C3 code.
* List → buy → burn against an obligation, with events seen on every node and over the
  WebSocket.
* After `kill -9` of one node, the other three keep producing blocks. The node restarts,
  catches up and matches the others' hash.
* A 5th miner joins a live network, is approved on-chain, becomes a validator and
  proposes blocks.
* Gateway responses pass `contracts-schema/scripts/validate.py` (C3 response, C4 miner,
  balance, mint_list, error, chain-event).

## Limits

* **Upgrades are hard forks.** Changing the state format means every node must run the
  new binary from the same height. (Test: one node on a new build was stopped by
  consensus, as it should be.)
* State is one JSON document hashed with sha256 on every block. That's fine for
  thousands of miners, but a much larger network would move to an IAVL/Merkle store
  with light-client proofs.
* The regulator key is a single admin. A real deployment would use a multisig.
* Plant proofs are still only as honest as the device. The chain enforces the rules on
  signed claims; the tamper resistance comes from the camera/liveness/GPS checks in
  miner-core and the twin.
