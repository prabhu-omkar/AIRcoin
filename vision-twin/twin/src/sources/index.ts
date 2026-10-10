import { config } from "../config";
import { useTwin } from "../store";
import { startLive } from "./live";
import { MockMiner, type MockOutput } from "./mock";

/** The running mock, exposed for the mock control panel. */
export let mockMiner: MockMiner | undefined;

function apply(out: MockOutput) {
  const s = useTwin.getState();
  switch (out.kind) {
    case "telemetry": return s.onTelemetry(out.payload);
    case "epoch": return s.onEpoch(out.payload);
    case "balance": return s.onBalance(out.payload);
    case "mints": return s.onMints(out.payload);
    case "chain": return s.onChainEvent(out.payload);
  }
}

export function startSource(): () => void {
  useTwin.setState({ source: config.source });
  if (config.source === "live") return startLive(config.minerId, config.mqttUrl, config.c4Url);

  const miner = new MockMiner(config.minerId, Date.now());
  mockMiner = miner;
  useTwin.getState().setLink("c2", "online");
  useTwin.getState().setLink("c4", "online");
  miner.snapshot().forEach(apply);
  miner.tick(Date.now()).forEach(apply);
  const timer = setInterval(() => miner.tick(Date.now()).forEach(apply), 1000);
  return () => {
    clearInterval(timer);
    mockMiner = undefined;
  };
}
