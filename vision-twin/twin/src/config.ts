// Runtime configuration: URL query parameters override Vite env vars (.env.local).
//   ?source=mock|live  &miner=miner-001  &mqtt=ws://pi.local:9001  &c4=http://localhost:8787  &feed=http://pi.local:8080/
import rig from "../../config/rig.json";

const q = new URLSearchParams(typeof window !== "undefined" ? window.location.search : "");
const env = (import.meta.env ?? {}) as Record<string, string | undefined>;

function pick(param: string, envKey: string, fallback: string): string {
  return q.get(param) ?? (env[envKey] as string | undefined) ?? fallback;
}

export const config = {
  source: pick("source", "VITE_SOURCE", "mock") as "mock" | "live",
  minerId: pick("miner", "VITE_MINER_ID", rig.miner_id),
  mqttUrl: pick("mqtt", "VITE_MQTT_URL", (env["VITE_MQTT_WS"] as string | undefined) ?? "ws://localhost:9001"),
  c4Url: pick("c4", "VITE_C4_URL", (env["VITE_API_URL"] as string | undefined) ?? "http://localhost:3002"),
  feedUrl: pick("feed", "VITE_FEED_URL", ""),
  /** Shared mock hub (scripts/mock-hub.ts) so the twin and the dashboard show the same mock data. "off" = local mock. */
  hubUrl: pick("hub", "VITE_HUB_URL", "http://localhost:5175"),
};

export interface RigPlant {
  tag_id: number;
  slot: number;
  species: string;
}

export const rigLayout = {
  rows: rig.grid.rows,
  cols: rig.grid.cols,
  plants: [...rig.plants].sort((a, b) => a.slot - b.slot) as RigPlant[],
};
