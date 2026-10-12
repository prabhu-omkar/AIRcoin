import express from "express";
import cors from "cors";
import { WebSocketServer, WebSocket } from "ws";
import http from "http";
import path from "path";
import fs from "fs";
import { Indexer } from "./indexer";
import { ethers } from "ethers";
import url from "url";

const PORT = parseInt(process.env.PORT || "3002", 10);
const RPC_URL = process.env.RPC_URL || "http://127.0.0.1:8545";

// Load deployments
const contractsDir = path.join(__dirname, "..", "..", "contracts");
const deploymentsPath = process.env.DEPLOYMENTS_PATH || path.join(contractsDir, "deployments.json");
const registryPath =
  process.env.REGISTRY_PATH ||
  path.join(
    __dirname, "..", "..", "..",
    "contracts-schema", "examples", "valid", "registry.json"
  );

if (!fs.existsSync(deploymentsPath)) {
  console.error("deployments.json not found. Run deploy in contracts/ first.");
  process.exit(1);
}

const deployments = JSON.parse(fs.readFileSync(deploymentsPath, "utf-8"));
const registryData = fs.existsSync(registryPath)
  ? JSON.parse(fs.readFileSync(registryPath, "utf-8"))
  : { miners: [] };

const indexer = new Indexer(RPC_URL, deployments, registryData);

// ── Express app ──

const app = express();
app.use(cors());
app.use(express.json());

// C4 REST API

/** GET /v1/miners/:miner_id */
app.get("/v1/miners/:miner_id", async (req, res) => {
  const data = await indexer.getMiner(req.params.miner_id);
  if (!data) {
    return res.status(404).json({ error: { code: "miner_not_found", message: `Miner ${req.params.miner_id} not found` } });
  }
  res.json(data);
});

/** GET /v1/miners/:miner_id/balance */
app.get("/v1/miners/:miner_id/balance", async (req, res) => {
  const data = await indexer.getBalance(req.params.miner_id);
  if (!data) {
    return res.status(404).json({ error: { code: "miner_not_found", message: `Miner ${req.params.miner_id} not found` } });
  }
  res.json(data);
});

/** GET /v1/miners/:miner_id/mints */
app.get("/v1/miners/:miner_id/mints", (req, res) => {
  const limit = parseInt(req.query.limit as string || "50", 10);
  const beforeEpoch = req.query.before_epoch
    ? parseInt(req.query.before_epoch as string, 10)
    : undefined;
  res.json(indexer.getMints(req.params.miner_id, limit, beforeEpoch));
});

/** GET /v1/balance/:address */
app.get("/v1/balance/:address", async (req, res) => {
  const data = await indexer.getAddressBalance(req.params.address);
  res.json(data);
});

/** GET /v1/listings — Active marketplace listings */
app.get("/v1/listings", async (_req, res) => {
  const listings = await indexer.getActiveListings();
  res.json({ v: 1, items: listings });
});

/** GET /v1/trades — Recent trades */
app.get("/v1/trades", (_req, res) => {
  const trades = indexer.getRecentTrades();
  res.json({ v: 1, items: trades });
});

/** GET /v1/burns — Recent burns */
app.get("/v1/burns", (_req, res) => {
  const burns = indexer.getRecentBurns();
  res.json({ v: 1, items: burns });
});

/** GET /v1/events — Recent events */
app.get("/v1/events", (_req, res) => {
  const events = indexer.getRecentEvents();
  res.json({ v: 1, items: events });
});

/** GET /v1/totals — Admin dashboard totals */
app.get("/v1/totals", (_req, res) => {
  res.json({ v: 1, ...indexer.getTotals() });
});

/** GET /v1/deployments — Contract addresses */
app.get("/v1/deployments", (_req, res) => {
  res.json(deployments);
});

/** GET /health */
app.get("/health", (_req, res) => {
  res.json({ status: "ok", service: "indexer" });
});

// ── HTTP + WebSocket server ──

const server = http.createServer(app);
const wss = new WebSocketServer({ server, path: "/v1/events" });

wss.on("connection", (ws: WebSocket, req) => {
  // Parse filter from query string
  const parsed = url.parse(req.url || "", true);
  const filter: { miner_id?: string; address?: string } = {};
  if (parsed.query.miner_id) filter.miner_id = parsed.query.miner_id as string;
  if (parsed.query.address) filter.address = parsed.query.address as string;

  const client = {
    send: (data: string) => {
      if (ws.readyState === WebSocket.OPEN) {
        ws.send(data);
      }
    },
    filter,
  };

  indexer.addClient(client);
  console.log(`[Indexer] WebSocket client connected (filter: ${JSON.stringify(filter)})`);

  ws.on("close", () => {
    indexer.removeClient(client);
    console.log("[Indexer] WebSocket client disconnected");
  });

  ws.on("error", () => {
    indexer.removeClient(client);
  });
});

// Start
server.listen(PORT, async () => {
  console.log(`[Indexer] REST API on http://localhost:${PORT}`);
  console.log(`[Indexer] WebSocket on ws://localhost:${PORT}/v1/events`);
  await indexer.startListening();
});
