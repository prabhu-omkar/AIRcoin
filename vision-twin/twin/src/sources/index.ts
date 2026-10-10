// Data sources. Live = MQTT (C2) + chain-market API (C4). Mock = the built-in generator, either shared
// through the mock hub (scripts/mock-hub.ts, so twin and dashboard agree) or running locally in this tab.
import { config } from "../config";
import { useTwin } from "../store";
import { startLive } from "./live";
import { MockMiner, type MockOutput } from "./mock";

/** Messages on the hub's event stream: the same outputs the local mock produces. */
export type HubMessage = MockOutput;

export function apply(out: HubMessage) {
  const s = useTwin.getState();
  switch (out.kind) {
    case "telemetry": return s.onTelemetry(out.payload);
    case "epoch": return s.onEpoch(out.payload);
    case "balance": return s.onBalance(out.payload);
    case "mints": return s.onMints(out.payload);
    case "chain": return s.onChainEvent(out.payload);
  }
}

function startLocalMock(): () => void {
  const miner = new MockMiner(config.minerId, Date.now());
  useTwin.getState().setLink("c2", "online");
  useTwin.getState().setLink("c4", "online");
  miner.snapshot().forEach(apply);
  miner.tick(Date.now()).forEach(apply);
  const timer = setInterval(() => miner.tick(Date.now()).forEach(apply), 1000);
  return () => clearInterval(timer);
}

function startHub(base: string): () => void {
  const es = new EventSource(`${base}/events`);
  es.onopen = () => {
    useTwin.getState().setLink("c2", "online");
    useTwin.getState().setLink("c4", "online");
  };
  es.onerror = () => {
    useTwin.getState().setLink("c2", "connecting");
    useTwin.getState().setLink("c4", "connecting");
  };
  es.onmessage = (m) => {
    try {
      apply(JSON.parse(m.data) as HubMessage);
    } catch (err) {
      console.warn("bad hub message", err);
    }
  };
  return () => es.close();
}

export function startSource(): () => void {
  useTwin.setState({ source: config.source });
  if (config.source === "live") return startLive(config.minerId, config.mqttUrl, config.c4Url);

  let stop: (() => void) | undefined;
  let cancelled = false;
  const base = config.hubUrl.replace(/\/$/, "");
  const useHub = config.hubUrl !== "off"
    ? fetch(`${base}/health`, { signal: AbortSignal.timeout(800) }).then((r) => r.ok, () => false)
    : Promise.resolve(false);
  useHub.then((hub) => {
    if (cancelled) return;
    stop = hub ? startHub(base) : startLocalMock();
  });
  return () => {
    cancelled = true;
    stop?.();
  };
}

