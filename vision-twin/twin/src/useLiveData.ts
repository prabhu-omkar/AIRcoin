import { useEffect, useRef, useState } from "react";
import type { MqttClient } from "mqtt";
import { demoEpoch, demoTelemetry } from "./demo";
import type { Balance, Epoch, Telemetry } from "./types";

const MINER = import.meta.env.VITE_MINER_ID || "miner-001";
const MQTT_URL = import.meta.env.VITE_MQTT_WS || "ws://localhost:9001";
const C4_URL = import.meta.env.VITE_C4_URL || "http://localhost:3004";

export function useLiveData() {
  const [telemetry, setTelemetry] = useState<Telemetry>(demoTelemetry);
  const [epoch, setEpoch] = useState<Epoch>(demoEpoch);
  const [balance, setBalance] = useState<Balance>({ air: "1240000000000000000", tinr: "500000000000000000000" });
  const [connected, setConnected] = useState(false);
  const [history, setHistory] = useState<number[]>([126,132,145,151,168,179,194]);
  const lastTs = useRef(0);

  useEffect(() => {
    let client: MqttClient | undefined;
    let cancelled = false;
    import("mqtt").then(({ default: mqtt }) => {
      if (cancelled) return;
      client = mqtt.connect(MQTT_URL, { reconnectPeriod: 2000, connectTimeout: 3000 });
      client.on("connect", () => { setConnected(true); client?.subscribe([`miner/${MINER}/telemetry`, `miner/${MINER}/epoch`]); });
      client.on("offline", () => setConnected(false));
      client.on("error", () => setConnected(false));
      client.on("message", (topic, bytes) => {
        try {
          const value = JSON.parse(bytes.toString());
          if (topic.endsWith("/telemetry")) {
            setTelemetry(value);
            if (value.ts !== lastTs.current && typeof value.aqi === "number") {
              lastTs.current = value.ts; setHistory(h => [...h.slice(-29), value.aqi]);
            }
          } else setEpoch(value);
        } catch { /* malformed data is ignored; the last good frame remains visible */ }
      });
    });
    return () => { cancelled = true; client?.end(true); };
  }, []);

  useEffect(() => {
    const refresh = () => fetch(`${C4_URL}/v1/miners/${MINER}/balance`).then(r => { if (!r.ok) throw new Error(); return r.json(); }).then(setBalance).catch(() => undefined);
    refresh(); const timer = window.setInterval(refresh, 5000); return () => clearInterval(timer);
  }, []);
  return { telemetry, epoch, balance, connected, history };
}
