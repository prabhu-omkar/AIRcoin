// Data sources. Live = MQTT (C2) + chain-market API (C4). Mock = the built-in generator, either shared
// through the mock hub (scripts/mock-hub.ts, so twin and dashboard agree) or running locally in this tab.
import { config } from "../config";
import { useTwin, type Tamper } from "../store";
import { startLive } from "./live";
import { MockMiner, type MockOutput, type Scenario } from "./mock";

/** Messages on the hub's event stream: mock outputs plus physical tamper state. */
export type HubMessage =
  | MockOutput
  | { kind: "physical"; payload: { tag: number; kind?: Tamper; at: number } }
  | { kind: "hello"; payload: { scenario: Scenario } };

export type HubCommand =
  | { type: "tamper"; tag: number; kind?: Tamper }
  | { type: "scenario"; scenario: Scenario }
  | { type: "reject" };

export function apply(out: HubMessage) {
  const s = useTwin.getState();
  switch (out.kind) {
    case "telemetry": return s.onTelemetry(out.payload);
    case "epoch": return s.onEpoch(out.payload);
    case "balance": return s.onBalance(out.payload);
    case "mints": return s.onMints(out.payload);
    case "chain": return s.onChainEvent(out.payload);
    case "physical": return s.setPhysical(out.payload.tag, out.payload.kind, out.payload.at);
    case "hello": return;
  }
}

/** Where mock commands go: the hub, or the local MockMiner. */
let send: ((c: HubCommand) => void) | undefined;

function startLocalMock(): () => void {
  const miner = new MockMiner(config.minerId, Date.now());
  useTwin.getState().setLink("c2", "online");
  useTwin.getState().setLink("c4", "online");
  miner.snapshot().forEach(apply);
  miner.tick(Date.now()).forEach(apply);
  const timer = setInterval(() => miner.tick(Date.now()).forEach(apply), 1000);
  send = (c) => {
    if (c.type === "tamper") {
      miner.setPlant(c.tag, c.kind, Date.now());
      useTwin.getState().setPhysical(c.tag, c.kind);
    } else if (c.type === "scenario") miner.setScenario(c.scenario);
    else miner.rejectNextEpoch();
  };
  return () => {
    clearInterval(timer);
    send = undefined;
  };
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
  send = (c) => {
    fetch(`${base}/command`, { method: "POST", headers: { "content-type": "application/json" }, body: JSON.stringify(c) }).catch(() => undefined);
  };
  return () => {
    es.close();
    send = undefined;
  };
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
    useTwin.setState({ mockShared: hub });
    stop = hub ? startHub(base) : startLocalMock();
  });
  return () => {
    cancelled = true;
    stop?.();
  };
}

/** Mock demo controls (no-ops in live mode). */
export const mockControls = {
  tamper: (tag: number, kind: Tamper | undefined) => send?.({ type: "tamper", tag, kind }),
  setScenario: (scenario: Scenario) => send?.({ type: "scenario", scenario }),
  rejectNext: () => send?.({ type: "reject" }),
};

/** Mock demo: physically tamper with a pot. The twin animates it now; the mock miner flags it on its own schedule. */
export function tamperPlant(tag: number, kind: Tamper | undefined) {
  mockControls.tamper(tag, kind);
}
