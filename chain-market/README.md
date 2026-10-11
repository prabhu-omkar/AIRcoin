# chain-market · Workstream C · Token, wallet and marketplace

**Owner:** Umashankar
**Mission:** make AIRcoin a real token on a blockchain: minted only from verified proofs, held in a wallet, traded on a market, and burned by polluters for compliance.

| Produces | Consumes |
|----------|----------|
| **C4** REST `GET /v1/miners/{id}`, `/v1/miners/{id}/balance`, `/v1/miners/{id}/mints` and WebSocket `/v1/events` (`mint`, `transfer`, `trade`, `burn`) | **C3** `POST /v1/attestations` from miner-core; **C2** telemetry for the admin portal's live view |

Also owns the on-chain side of the miner/sticker registry (`contracts-schema/schemas/registry.schema.json`). Schemas and signing rules: [`../contracts-schema`](../contracts-schema/README.md). Do not change them on your own.

## Smart contracts

| Contract | Key functions | Rules |
|----------|---------------|-------|
| `AIRToken` | ERC-20, `mint`, `burn` | Only the mint controller can mint; no admin mint |
| `MinerRegistry` | `registerMiner(minerId, deviceAddr, owner, stickerSetHash, geohash)`, `revoke` | Only the government admin registers, on approving an application; each sticker belongs to one miner |
| `MintController` | `mintForEpoch(minerId, epoch, amount, evidenceHash, sig)` | Verifies the device signature on-chain (`ecrecover`); one mint per miner per epoch; per-epoch cap |
| `Marketplace` | `list(amount, price)`, `buy(id)`, `cancel(id)` | Escrow of AIR; paid in `tINR`, a mock rupee stablecoin with a faucet |
| `ComplianceRegistry` | `setObligation(company, period, amount)`, `burnForCompliance(period, amount)` | Regulator sets obligations; burns are recorded against them and can't be undone |

`minerId` on-chain is `keccak256(utf8(miner_id))`; the signed digest is defined in `contracts-schema/README.md#signing-c3`.

## Off-chain services and apps

1. **Validator / mint oracle:** receives C3 and checks signature vs. registered device, miner active, every sticker belongs to this miner and wasn't claimed by another miner in the same window, GPS inside the geofence, amount within the plausibility cap, epoch not already minted. Pass → `mintForEpoch`; fail → store the rejection reason (codes in `common.schema.json#/$defs/rejection_reason_code`).
2. **Indexer + C4 API:** listens to contract events; serves balances, mint history, trades and burns over REST and WebSocket.
3. **One web platform, three logins:** citizen/miner owner, company, government admin. Built-in demo wallets so judges need no MetaMask; MetaMask also works.
4. **Miner applications:** apply-to-buy form; status submitted → approved → shipped → active.
5. **Wallet:** AIR and tINR balances, per-miner mint history, send/receive with QR codes.
6. **Marketplace:** fixed-price listings, buy flow, price and volume chart, recent trades.
7. **Company portal:** obligation progress bar, "buy and burn" in one flow, burn certificate with the tx hash.
8. **Government admin portal:** approve/reject applications (calls `registerMiner`), map of all miners with live sensors (C2), mints/trades/burns, totals minted vs burned, set obligations, review rejected attestations, suspend a miner. Reuses Omkar's twin panels for single-miner detail.

**Stack:** Solidity + OpenZeppelin, Hardhat or Foundry, Polygon Amoy testnet (local Hardhat chain as fallback), Node.js + TypeScript validator, ethers.js, React + Vite, SQLite or Postgres for indexing.

## Suggested layout

```
chain-market/
├── contracts/      Solidity + tests + deploy scripts
├── validator/      TypeScript: POST /v1/attestations
├── indexer/        TypeScript: event indexer + C4 REST/WebSocket
├── web/            React + Vite: owner, company and admin apps
├── mock/           C4 mock emitter for vision-twin
└── scripts/        one-command local-chain redeploy + demo account seeding
```

## Running locally

```bash
docker compose up -d mqtt          # from the repo root, for C2 in the admin portal
```

Use `contracts-schema/examples/valid/c3-attestation.json` and `registry.json` as validator fixtures, and the `examples/invalid/` files as rejection cases. Validate responses:

```bash
python contracts-schema/scripts/validate.py c3-attestation-response my-response.json
python contracts-schema/scripts/validate.py c4-chain-event my-event.json
```

## Phase checklist

The local demo command starts the complete Workstream C runtime: contracts, validator, C4 indexer
and the wallet/market/company/admin web platform. The admin's register, suspend/reactivate and
obligation controls execute real contract transactions; marketplace purchases and compliance burns
also execute on-chain. `npm test` in `indexer/` verifies durable C4 storage and aggregation.

**Phase 1 · Foundations**
- [x] All six contracts written with unit tests; deployed on a local chain (23 passing tests)
- [x] Valid mock attestation mints; tampered, replayed or over-cap ones are rejected
- [x] Contract test coverage on mint, burn and escrow paths
- [x] Wallet shows a balance change after a local mint; C4 mock emitter shipped

**Phase 2 · Integration**
- [x] Contracts deployed and verified on local chain / Polygon Amoy; demo miner registered with its 20 stickers
- [x] First AIRcoin minted from camera proof / C3 attestation
- [x] Mint visible in wallet and twin within 60 s of epoch close
- [x] A listing created by the owner is bought by a second wallet

**Phase 3 · Demo hardening**
- [x] Company buys and burns AIR; obligation bar fills; certificate shows the tx hash
- [x] A new application approved live by the admin shows up as a registered miner on-chain
- [x] Admin sees live sensor values for the demo miner, updating every second
- [x] Reused sticker rejected with a clear reason on the admin portal
- [x] Local-chain fallback brought up in under 5 minutes

**Scope guard:** if behind at Gate 2, drop the explorer view and MetaMask; keep built-in demo wallets.

**Owns in the demo:** steps 6–9 (sticker reuse, sell on the market, company burn, government admin).
