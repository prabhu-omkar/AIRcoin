import express from "express";
import cors from "cors";
import http from "http";
import { WebSocketServer, WebSocket } from "ws";
import path from "path";
import fs from "fs";

const PORT = parseInt(process.env.PORT || "3004", 10);

const app = express();
app.use(cors());
app.use(express.json());

// Load mock examples from contracts-schema
const examplesDir = path.join(__dirname, "..", "..", "..", "contracts-schema", "examples", "valid");

function loadExample(filename: string) {
  const filePath = path.join(examplesDir, filename);
  if (fs.existsSync(filePath)) {
    return JSON.parse(fs.readFileSync(filePath, "utf-8"));
  }
  return null;
}

const minerExample = loadExample("c4-miner.json");
const balanceExample = loadExample("c4-balance.json");
const mintListExample = loadExample("c4-mint-list.json");
const mintEventExample = loadExample("c4-chain-event.mint.json");
const transferEventExample = loadExample("c4-chain-event.transfer.json");
const tradeEventExample = loadExample("c4-chain-event.trade.json");
const burnEventExample = loadExample("c4-chain-event.burn.json");

// REST Endpoints
app.get("/v1/miners/:miner_id", (req, res) => {
  const resp = minerExample || {
    v: 1,
    miner_id: req.params.miner_id,
    device_address: "0x391887cbcf922e19d672df700739c4a3c74e35ee",
    owner_wallet: "0x70997970c51812dc3a010c7d01b50e0d17dc79c8",
    status: "active",
    registered_at: 1791799200000,
    totals: { minted: "27684000000000000", epochs_minted: 1, epochs_rejected: 0 },
  };
  res.json({ ...resp, miner_id: req.params.miner_id });
});

app.get("/v1/miners/:miner_id/balance", (req, res) => {
  const resp = balanceExample || {
    v: 1,
    miner_id: req.params.miner_id,
    address: "0x70997970c51812dc3a010c7d01b50e0d17dc79c8",
    air: "27684000000000000",
    tinr: "1000000000000000000000",
    block_number: 18235,
  };
  res.json({ ...resp, miner_id: req.params.miner_id });
});

app.get("/v1/miners/:miner_id/mints", (req, res) => {
  res.json(mintListExample || { v: 1, miner_id: req.params.miner_id, items: [] });
});

app.get("/health", (_req, res) => {
  res.json({ status: "ok", service: "mock-c4-emitter" });
});

// WebSocket Server
const server = http.createServer(app);
const wss = new WebSocketServer({ server, path: "/v1/events" });

const clients = new Set<WebSocket>();

wss.on("connection", (ws) => {
  clients.add(ws);
  console.log(`[Mock Emitter] Client connected. Total: ${clients.size}`);

  // Send an initial event on connection
  if (mintEventExample) {
    ws.send(JSON.stringify(mintEventExample));
  }

  ws.on("close", () => {
    clients.delete(ws);
    console.log(`[Mock Emitter] Client disconnected. Total: ${clients.size}`);
  });
});

// Periodic event emitter loop (every 10 seconds)
const eventSequence = [mintEventExample, transferEventExample, tradeEventExample, burnEventExample].filter(Boolean);
let sequenceIdx = 0;
let epochCounter = 29863321;

setInterval(() => {
  if (clients.size === 0 || eventSequence.length === 0) return;

  const baseEvent = eventSequence[sequenceIdx % eventSequence.length];
  sequenceIdx++;

  // Update dynamic values (timestamp, epoch, tx_hash)
  const dynamicEvent = {
    ...baseEvent,
    ts: Date.now(),
    tx_hash: "0x" + Array.from({ length: 64 }, () => Math.floor(Math.random() * 16).toString(16)).join(""),
    block_number: 18235 + sequenceIdx,
  };

  if (dynamicEvent.type === "mint" && dynamicEvent.data) {
    dynamicEvent.data.epoch = epochCounter++;
  }

  const payload = JSON.stringify(dynamicEvent);
  for (const client of clients) {
    if (client.readyState === WebSocket.OPEN) {
      client.send(payload);
    }
  }
  console.log(`[Mock Emitter] Broadcast mock ${dynamicEvent.type} event to ${clients.size} clients`);
}, 10000);

server.listen(PORT, () => {
  console.log(`[Mock Emitter] Running on http://localhost:${PORT}`);
  console.log(`[Mock Emitter] WebSocket: ws://localhost:${PORT}/v1/events`);
});
