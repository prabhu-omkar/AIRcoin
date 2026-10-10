// Live data: C2 over MQTT-over-WebSockets, C4 over REST + WebSocket.
import mqtt from "mqtt";
import type { Balance, ChainEvent, EpochSummary, MintList, Telemetry } from "../contracts";
import { useTwin } from "../store";

export function startLive(minerId: string, mqttUrl: string, c4Url: string): () => void {
  const store = useTwin.getState();
  const stops: (() => void)[] = [];

  // C2
  const client = mqtt.connect(mqttUrl, { reconnectPeriod: 2000, connectTimeout: 5000 });
  const tTopic = `miner/${minerId}/telemetry`;
  const eTopic = `miner/${minerId}/epoch`;
  client.on("connect", () => {
    store.setLink("c2", "online");
    client.subscribe([tTopic, eTopic], { qos: 1 });
  });
  client.on("reconnect", () => store.setLink("c2", "connecting"));
  client.on("offline", () => store.setLink("c2", "offline"));
  client.on("error", () => store.setLink("c2", "error"));
  client.on("message", (topic, payload) => {
    try {
      const msg = JSON.parse(payload.toString());
      if (topic === tTopic) useTwin.getState().onTelemetry(msg as Telemetry);
      else if (topic === eTopic) useTwin.getState().onEpoch(msg as EpochSummary);
    } catch (err) {
      console.warn("bad C2 message", topic, err);
    }
  });
  stops.push(() => client.end(true));

  // C4 REST
  const base = c4Url.replace(/\/$/, "");
  const refresh = async () => {
    try {
      const [bal, mints] = await Promise.all([
        fetch(`${base}/v1/miners/${minerId}/balance`).then((r) => (r.ok ? r.json() : Promise.reject(r.status))),
        fetch(`${base}/v1/miners/${minerId}/mints?limit=50`).then((r) => (r.ok ? r.json() : Promise.reject(r.status))),
      ]);
      useTwin.getState().onBalance(bal as Balance);
      useTwin.getState().onMints((mints as MintList).items);
      store.setLink("c4", "online");
    } catch {
      store.setLink("c4", "error");
    }
  };
  refresh();
  const poll = setInterval(refresh, 15_000);
  stops.push(() => clearInterval(poll));

  // C4 WebSocket events
  let ws: WebSocket | undefined;
  let closed = false;
  const openWs = () => {
    ws = new WebSocket(`${base.replace(/^http/, "ws")}/v1/events?miner_id=${encodeURIComponent(minerId)}`);
    ws.onmessage = (m) => {
      try {
        const e = JSON.parse(m.data as string) as ChainEvent;
        useTwin.getState().onChainEvent(e);
        if (e.type === "mint" || e.type === "transfer" || e.type === "trade") refresh();
      } catch (err) {
        console.warn("bad C4 event", err);
      }
    };
    ws.onclose = () => {
      if (!closed) setTimeout(openWs, 3000);
    };
  };
  openWs();
  stops.push(() => {
    closed = true;
    ws?.close();
  });

  return () => stops.forEach((s) => s());
}
