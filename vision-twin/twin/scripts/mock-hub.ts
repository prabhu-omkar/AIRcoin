// Shared mock data for the twin and the dashboard (mock mode only).
// One MockMiner, fanned out over server-sent events, so both apps show the same plants, sensors and mints,
// No dependencies beyond Node.
//
//   npx vite-node scripts/mock-hub.ts          (npm run dev starts it with both apps)
//
//   GET  /events    SSE stream of mock C2/C4 outputs
//   GET  /health
import http from "node:http";
import type { EpochSummary, Telemetry } from "../src/contracts";
import type { HubMessage } from "../src/sources";
import { MockMiner, type MockOutput } from "../src/sources/mock";

const PORT = Number(process.env.HUB_PORT ?? 5175);
// HUB_MODE=bridge: no mock; relay real C2 (miner-core over plain MQTT) to the browsers instead.
const BRIDGE = process.env.HUB_MODE === "bridge";
const MQTT_URL = process.env.MQTT_URL ?? "mqtt://localhost:1883";
const MINER_ID = process.env.MINER_ID ?? "miner-001";

const miner = new MockMiner(MINER_ID, Date.now()); // unused in bridge mode
const clients = new Set<http.ServerResponse>();
let lastTelemetry: Telemetry | undefined;
const epochs: EpochSummary[] = [];
let latestC4: MockOutput[] = miner.snapshot();

function broadcast(msg: HubMessage) {
  const line = `data: ${JSON.stringify(msg)}\n\n`;
  for (const c of clients) c.write(line);
}

function remember(out: MockOutput) {
  if (out.kind === "telemetry") lastTelemetry = out.payload;
  else if (out.kind === "epoch") {
    const i = epochs.findIndex((e) => e.epoch === out.payload.epoch);
    if (i >= 0) epochs[i] = out.payload;
    else epochs.unshift(out.payload);
    epochs.splice(30);
  } else if (out.kind === "balance" || out.kind === "mints") {
    latestC4 = [...latestC4.filter((o) => o.kind !== out.kind), out];
  }
}

const tick = () => {
  for (const out of miner.tick(Date.now())) {
    remember(out);
    broadcast(out);
  }
};
if (BRIDGE) {
  const { default: mqtt } = await import("mqtt");
  const client = mqtt.connect(MQTT_URL, { reconnectPeriod: 2000 });
  const tTopic = `miner/${MINER_ID}/telemetry`;
  const eTopic = `miner/${MINER_ID}/epoch`;
  client.on("connect", () => {
    console.log(`[hub] bridging ${tTopic}, ${eTopic} from ${MQTT_URL}`);
    client.subscribe([tTopic, eTopic], { qos: 1 });
  });
  client.on("message", (topic, payload) => {
    try {
      const out: MockOutput = topic === tTopic ? { kind: "telemetry", payload: JSON.parse(payload.toString()) } : { kind: "epoch", payload: JSON.parse(payload.toString()) };
      remember(out);
      broadcast(out);
    } catch (err) {
      console.warn("[hub] bad C2 message", err);
    }
  });
  latestC4 = []; // C4 comes from the chain-market indexer directly in live mode
} else {
  tick();
  setInterval(tick, 1000);
}

const cors = { "access-control-allow-origin": "*", "access-control-allow-headers": "content-type", "access-control-allow-methods": "GET, POST, OPTIONS" };

http
  .createServer((req, res) => {
    if (req.method === "OPTIONS") return res.writeHead(204, cors).end();
    if (req.url === "/health") return res.writeHead(200, { ...cors, "content-type": "application/json" }).end(JSON.stringify({ ok: true, miner_id: MINER_ID }));
    if (req.url === "/events") {
      res.writeHead(200, { ...cors, "content-type": "text/event-stream", "cache-control": "no-cache", connection: "keep-alive" });
      const send = (m: HubMessage) => res.write(`data: ${JSON.stringify(m)}\n\n`);
      latestC4.forEach(send);
      [...epochs].reverse().forEach((e) => send({ kind: "epoch", payload: e }));
      if (lastTelemetry) send({ kind: "telemetry", payload: lastTelemetry });
      clients.add(res);
      const ping = setInterval(() => res.write(": ping\n\n"), 15_000);
      req.on("close", () => {
        clearInterval(ping);
        clients.delete(res);
      });
      return;
    }
    res.writeHead(404, cors).end();
  })
  .listen(PORT, () => console.log(`[hub] ${BRIDGE ? "C2 bridge" : "mock"} for ${MINER_ID} on http://localhost:${PORT} (events: /events)`));
