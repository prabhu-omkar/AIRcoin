// Runtime configuration: URL query parameters override Vite env vars (.env.local).
//   ?source=mock|live  &miner=miner-001  &mqtt=ws://pi.local:9001  &c4=http://localhost:8787  &feed=http://pi.local:8080/
import rig from "../../config/rig.json";

const q = new URLSearchParams(typeof window !== "undefined" ? window.location.search : "");
const env = import.meta.env;

function pick(param: string, envKey: string, fallback: string): string {
  return q.get(param) ?? (env[envKey] as string | undefined) ?? fallback;
}

export const config = {
  source: pick("source", "VITE_SOURCE", "mock") as "mock" | "live",
  minerId: pick("miner", "VITE_MINER_ID", rig.miner_id),
  mqttUrl: pick("mqtt", "VITE_MQTT_URL", "ws://localhost:9001"),
  c4Url: pick("c4", "VITE_C4_URL", "http://localhost:8787"),
  feedUrl: pick("feed", "VITE_FEED_URL", ""),
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
