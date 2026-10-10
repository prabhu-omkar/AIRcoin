# contracts-schema

The frozen interfaces between the three workstreams (PRD section 4). Everything that crosses a folder boundary has a JSON Schema here, plus the shared data files (miner/sticker registry and species catalogue).

> **Owned by all three of us.** Do not change anything in this folder without agreement from Omkar, Shreyas and Umashankar (raise it at the daily sync). Contracts are frozen as **v1 at Gate 1**. See [Change process](#change-process).

## Layout

```
contracts-schema/
├── schemas/                              JSON Schema, draft 2020-12
│   ├── common.schema.json                shared types (ids, units, GPS, flags, hashes)
│   ├── c1-vision-event.schema.json       C1  A -> B   MQTT miner/{id}/vision
│   ├── c2-telemetry.schema.json          C2  B -> A,C MQTT miner/{id}/telemetry
│   ├── c2-epoch.schema.json              C2  B -> A,C MQTT miner/{id}/epoch
│   ├── c3-attestation.schema.json        C3  B -> C   POST /v1/attestations (request)
│   ├── c3-attestation-response.schema.json  C3 response
│   ├── c4-chain-api.schema.json          C4  C -> A   REST responses ($defs per route)
│   ├── c4-chain-event.schema.json        C4  C -> A   WebSocket events
│   ├── registry.schema.json              miner and sticker registry
│   └── species-catalogue.schema.json     species catalogue + calibration table
├── data/
│   └── species-catalogue.json            the 20 species (draft v0.1.0)
├── examples/
│   ├── valid/                            one payload per message type; use them as mock data
│   └── invalid/                          payloads that must be rejected
└── scripts/validate.py                   checks schemas, examples and data
```

## The interfaces

| ID | From → To | Transport | Schema | Rate |
|----|-----------|-----------|--------|------|
| C1 | vision-twin → miner-core | MQTT `miner/{miner_id}/vision`, QoS 0 | `c1-vision-event` | ~1/s |
| C2 | miner-core → vision-twin, chain-market | MQTT `miner/{miner_id}/telemetry`, QoS 0 | `c2-telemetry` | 1/s |
| C2 | miner-core → vision-twin, chain-market | MQTT `miner/{miner_id}/epoch`, QoS 1, retained | `c2-epoch` | per epoch + on status change |
| C3 | miner-core → chain-market | HTTPS `POST /v1/attestations` | `c3-attestation` → `c3-attestation-response` | per epoch |
| C4 | chain-market → vision-twin, apps | REST `GET /v1/miners/{id}`, `/v1/miners/{id}/balance`, `/v1/miners/{id}/mints` | `c4-chain-api` (`miner`, `balance`, `mint_list`, `error`) | on demand |
| C4 | chain-market → vision-twin, apps | WebSocket `/v1/events?miner_id=…` | `c4-chain-event` (`mint`, `transfer`, `trade`, `burn`) | live |

Shared data:

- **Registry** (`registry.schema.json`): `miner_id`, device public key and address, owner wallet, the 20 `sticker_ids`, `sticker_set_hash`, registered location + geofence. Mirrors the on-chain `MinerRegistry`.
- **Species catalogue** (`data/species-catalogue.json`): ids, names, placement, main targets, evidence, reference images, AIR weights per pollutant (PRD 2.6), multipliers per species and pollutant, base rates and caps. Shreyas owns the numbers; Omkar fills `reference_images`.

The MQTT broker is in the root `docker-compose.yml` (`mqtt://localhost:1883`, WebSockets on `ws://localhost:9001`).

## Conventions

- **Version.** Every message carries `"v": 1`.
- **Time.** All timestamps are Unix **milliseconds**, UTC (`ts`, `start`, `end`, `*_ms`).
- **Epochs.** `epoch = floor(start_ms / 60000)` for the demo (60 s, real time). `start = epoch * 60000`, `end = start + 60000`. Production would use 1 h.
- **Pollutant keys.** `pm25, pm10, no2, so2, voc, co2, co` everywhere (per-pollutant maps, weights, multipliers).
- **Units** are in field names: `pm25_ugm3`, `co2_ppm`, `no2_ppb`, `voc_index` (0–500), `leaf_area_cm2`, `removed_mg`, `geofence_m`.
- **Token amounts** are base-unit integer **strings** (18 decimals): 1 AIR = `"1000000000000000000"`. Decimal `air` / `total_air` numbers are display-only.
- **AIR unit.** 1 AIR = 1 mg PM2.5-equivalent; `AIR = Σ_p w_p · Σ_i R_i,p` with weights from the catalogue.
- **IDs.** `miner_id` matches `^[a-z0-9][a-z0-9-]{2,63}$` (e.g. `miner-001`); on-chain key is `keccak256(utf8(miner_id))`. `tag_id` is the ArUco marker ID (0–999), globally unique across miners. `species` is one of the 20 ids in `common.schema.json` or `"unknown"`.
- **Plant status.** `present → missing` (unseen 10 s) `→ removed` (unseen 60 s); `suspect` when the plant match or `alive_score` is low. Missing, removed and suspect plants earn 0.
- **Hashes and keys.** `0x`-prefixed lowercase hex. `frame_hash` is sha256 of the raw frame; everything else is keccak256. Signatures are 65-byte secp256k1 (`r‖s‖v`).
- Unknown fields are rejected (`additionalProperties: false`), so typos are caught early.

## Signing (C3)

1. **Canonical JSON** = [RFC 8785 (JCS)](https://www.rfc-editor.org/rfc/rfc8785) — Python `rfc8785`, JS `canonicalize`. This avoids Python/JS float formatting differences.
2. **`calibration_hash`** = `keccak256(JCS(data/species-catalogue.json))`.
3. **`evidence_hash`** = `keccak256(JCS(attestation without amount, evidence_hash and signature))`. Every other field (miner, epoch, times, GPS, sensors, plants, frame hashes, flags, calibration hash) is covered.
4. **digest** = `keccak256(abi.encodePacked(bytes32 keccak256(utf8(miner_id)), uint64 epoch, uint256 amount, bytes32 evidence_hash))`.
5. **`signature`** = EIP-191 `personal_sign(digest)` with the device key (`eth_account` `encode_defunct(primitive=digest)`; ethers `signMessage(getBytes(digest))`).

The validator recomputes `evidence_hash`, then checks that `ecrecover(toEthSignedMessageHash(digest), signature)` equals the registry's `device_address`. `MintController.mintForEpoch(minerId, epoch, amount, evidenceHash, sig)` repeats the signature check on-chain. Changing any field breaks either the evidence hash or the signature.

`sticker_set_hash` = `keccak256(abi.encodePacked(uint16[] sticker_ids sorted ascending))`.

## Validator rejection codes (C3)

`malformed`, `bad_signature`, `unknown_miner`, `miner_inactive`, `sticker_not_registered`, `sticker_claimed_by_other_miner`, `gps_outside_geofence`, `amount_over_cap`, `epoch_already_minted`, `epoch_not_closed`, `evidence_hash_mismatch`, `calibration_mismatch`, `chain_error`. HTTP 200 for `accepted`/`pending`, 409 for `epoch_already_minted`, 422 for other rejections. The miner treats any 4xx as final and retries 5xx and network errors from its offline queue.

## Validating

```bash
pip install "jsonschema>=4.18"
python contracts-schema/scripts/validate.py                       # everything
python contracts-schema/scripts/validate.py c1-vision-event my.json   # your own payloads
```

Targets: `c1-vision-event`, `c2-telemetry`, `c2-epoch`, `c3-attestation`, `c3-attestation-response`, `c4-miner`, `c4-balance`, `c4-mint-list`, `c4-error`, `c4-chain-event`, `registry`, `species-catalogue`.

The schemas are plain JSON Schema 2020-12, so any validator works: `jsonschema` (Python), `ajv` (Node, use `ajv/dist/2020`), or pydantic/zod models generated from them. Hashes and signatures in `examples/` are shape-correct placeholders, not real signatures.

## Species catalogue status

`data/species-catalogue.json` is **draft v0.1.0**:

- Species, scientific names, placement, main targets and evidence come straight from PRD 2.3. Pollutant weights and damage costs come from PRD 2.6.
- `multipliers` are a mechanical first pass: a pollutant named in the species' main targets is `high`, everything else `low`. **Shreyas to review on Day 1.**
- `base_rates_mg_per_m2_h`, `ref_concentration`, `concentration_factor_cap` and `caps` are `null` until Shreyas seeds them from the literature. The schema rejects `null`s once `status` is `frozen` (calibration table v1, Gate 2).
- Entries with `evidence.status: "to_confirm"` still need a paper (PRD 10.4).

## Change process

1. Raise the change at the daily sync (or in the team chat) with the reason and who it affects.
2. All three owners agree.
3. One PR updates the schema, the examples and `scripts/validate.py` together; validation must pass. All three review it.
4. Before Gate 1: edit v1 in place. After Gate 1: only backward-compatible additions (new optional fields) inside v1; because unknown fields are rejected, consumers pull the updated schema before the producer starts sending the new field. A breaking change means `v: 2` and new schema files, and producers keep emitting v1 until every consumer has moved.
