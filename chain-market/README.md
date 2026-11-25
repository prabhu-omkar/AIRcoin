# chain-market · Marketplace web app

**Owner:** Umashankar

One web app for everyone on the AIRcoin network, running against AIRcoin's own chain
([`../aircoin-chain`](../aircoin-chain/README.md)). It has no backend of its own: it reads from
any node's gateway and sends signed transactions to it.

| Login (password `aircoin`) | Can |
|---|---|
| `alice@aircoin.in`, `rohan@aircoin.in` (miner owners) | see their miner's verified mints, sell AIR, top up tINR, burn |
| `meera@aircoin.in` (citizen) | request a miner, buy and retire AIR |
| `compliance@apexsteel.in` (company) | buy AIR with tINR, burn it against the 2026 obligation |
| `regulator@cpcb.gov.in` (regulator) | approve or reject miner requests, suspend miners, read the on-chain anti-cheat log and obligations |

Wallet keys for these logins are the public demo keys in
[`aircoin-chain/demo/demo-accounts.json`](../aircoin-chain/demo/demo-accounts.json); the chain's
genesis funds the same addresses.

## How it talks to the chain

- **Reads:** `src/services/api.ts` fetches from `VITE_CHAIN_URL` (default `http://localhost:8700`):
  accounts, miners, mints, listings, trades, burns, obligations, applications and rejections.
- **Writes:** `src/services/chain.ts` builds `{type, body}`, asks the node for the exact text to
  sign (`POST /v1/tx/prepare`), signs it with ethers `signMessage` (EIP-191, the same as
  MetaMask's `personal_sign`), and submits `{type, body, sig}` to `POST /v1/tx`. The result comes
  back once the transaction is in a block (~1 s).

| Action | Transaction |
|---|---|
| Sell AIR / cancel | `list` (escrows AIR) / `cancel` |
| Buy | `buy` (tINR → seller, AIR → buyer, atomically) |
| Retire | `burn` (with `period` it counts toward the company's obligation) |
| Faucet | `faucet` (up to 1,000 tINR to yourself) |
| Request a miner | `apply_miner` |
| Regulator | `approve_miner` (provisions a device key and the next 20 stickers), `reject_application`, `set_miner_status` |

## Run

```bash
npm install
VITE_CHAIN_URL=http://localhost:8700 npm run dev     # http://localhost:3000
npm run build                                        # static site in dist/ (S3, Vercel, nginx)
```

Or start everything with `python scripts/demo.py start` from the repo root.
