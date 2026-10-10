import express from "express";
import cors from "cors";
import path from "path";
import fs from "fs";
import { Validator, Attestation } from "./validator";

const PORT = parseInt(process.env.PORT || "3001", 10);
const RPC_URL = process.env.RPC_URL || "http://127.0.0.1:8545";

// Load deployments and registry
const contractsDir = path.join(__dirname, "..", "..", "contracts");
const deploymentsPath = path.join(contractsDir, "deployments.json");
const seedDataPath = path.join(contractsDir, "seed-data.json");
const registryPath = path.join(
  __dirname,
  "..",
  "..",
  "..",
  "contracts-schema",
  "examples",
  "valid",
  "registry.json"
);

if (!fs.existsSync(deploymentsPath)) {
  console.error("deployments.json not found. Run `npm run deploy:local` in contracts/ first.");
  process.exit(1);
}

const deployments = JSON.parse(fs.readFileSync(deploymentsPath, "utf-8"));
const registryData = fs.existsSync(registryPath)
  ? JSON.parse(fs.readFileSync(registryPath, "utf-8"))
  : { miners: [] };

// If seed-data.json exists, merge the device addresses from it (since they are
// generated at deploy time and differ from the static registry example)
let seedData: any = null;
if (fs.existsSync(seedDataPath)) {
  seedData = JSON.parse(fs.readFileSync(seedDataPath, "utf-8"));
  // Override registry data with seed data device addresses
  if (seedData.miners) {
    registryData.miners = registryData.miners.map((m: any) => {
      const seed = seedData.miners[m.miner_id];
      if (seed) {
        return {
          ...m,
          device_address: seed.deviceAddress,
          owner_wallet: seed.ownerWallet,
        };
      }
      return m;
    });
  }
}

// Admin signer private key (Hardhat account #0)
const ADMIN_KEY =
  process.env.ADMIN_KEY ||
  "0xac0974bec39a17e36ba4a6b4d238ff944bacb478cbed5efcae784d7bf4f2ff80";

const validator = new Validator(RPC_URL, ADMIN_KEY, deployments, registryData);

// ── Express app ──

const app = express();
app.use(cors());
app.use(express.json({ limit: "1mb" }));

/**
 * POST /v1/attestations
 * Receives a C3 attestation from miner-core, validates it, and mints AIR.
 */
app.post("/v1/attestations", async (req, res) => {
  try {
    const attestation: Attestation = req.body;
    const response = await validator.validate(attestation);

    if (response.status === "rejected") {
      const httpCode = response.reason_code === "epoch_already_minted" ? 409 : 422;
      return res.status(httpCode).json(response);
    }

    return res.status(200).json(response);
  } catch (err: any) {
    console.error("[Validator] Unhandled error:", err);
    return res.status(500).json({
      v: 1,
      miner_id: req.body?.miner_id || "unknown",
      epoch: req.body?.epoch || 0,
      status: "rejected",
      reason_code: "chain_error",
      reason: `Internal error: ${err.message}`,
    });
  }
});

/**
 * GET /v1/rejections — Admin portal: list rejected attestations
 */
app.get("/v1/rejections", (_req, res) => {
  const rejections = validator.getRejections();
  res.json({ v: 1, items: rejections });
});

/**
 * GET /v1/accepted — Admin portal: list accepted attestations
 */
app.get("/v1/accepted", (_req, res) => {
  const accepted = validator.getAccepted();
  res.json({ v: 1, items: accepted });
});

/**
 * GET /health
 */
app.get("/health", (_req, res) => {
  res.json({ status: "ok", service: "validator" });
});

app.listen(PORT, () => {
  console.log(`[Validator] Listening on http://localhost:${PORT}`);
  console.log(`[Validator] RPC: ${RPC_URL}`);
  console.log(`[Validator] POST /v1/attestations`);
});
