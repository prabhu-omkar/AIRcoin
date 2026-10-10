// App state, fed by a data source (mock or live). Components only read from here.
import { create } from "zustand";
import type { AnticheatFlag, Balance, ChainEvent, EpochSummary, Mint, Telemetry } from "./contracts";

export type LinkState = "connecting" | "online" | "offline" | "error";

export interface LogEntry {
  id: string;
  ts: number;
  severity: "info" | "warn" | "critical";
  text: string;
  source: "miner" | "validator" | "chain";
}

export interface HistoryPoint {
  ts: number;
  aqi: number;
  pm25: number;
  pm10: number;
}

interface TwinState {
  source: "mock" | "live";
  links: { c2: LinkState; c4: LinkState };
  telemetry?: Telemetry;
  lastTelemetryAt?: number;
  history: HistoryPoint[];
  epochs: EpochSummary[]; // newest first
  balance?: Balance;
  mints: Mint[]; // newest first
  log: LogEntry[]; // newest first
  setLink: (key: "c2" | "c4", state: LinkState) => void;
  onTelemetry: (t: Telemetry) => void;
  onEpoch: (e: EpochSummary) => void;
  onBalance: (b: Balance) => void;
  onMints: (m: Mint[]) => void;
  onChainEvent: (e: ChainEvent) => void;
}

const HISTORY_POINTS = 180;
const LOG_ENTRIES = 60;

function flagText(f: AnticheatFlag): string {
  if (f.message) return f.message;
  const tag = f.tag_id !== undefined ? `tag ${f.tag_id}: ` : "";
  return tag + f.code.replace(/_/g, " ");
}

function flagKey(f: AnticheatFlag) {
  return `${f.code}:${f.tag_id ?? ""}:${f.ts}`;
}

export const useTwin = create<TwinState>((set, get) => ({
  source: "mock",
  links: { c2: "connecting", c4: "connecting" },
  history: [],
  epochs: [],
  mints: [],
  log: [],

  setLink: (key, state) => set((s) => ({ links: { ...s.links, [key]: state } })),

  onTelemetry: (t) => {
    const s = get();
    const known = new Set(s.log.map((l) => l.id));
    const fresh: LogEntry[] = t.flags
      .filter((f) => !known.has(flagKey(f)))
      .map((f) => ({ id: flagKey(f), ts: f.ts, severity: f.severity, text: flagText(f), source: "miner" }));
    const point = { ts: t.ts, aqi: t.aqi ?? 0, pm25: t.sensors.pm25_ugm3, pm10: t.sensors.pm10_ugm3 };
    set({
      telemetry: t,
      lastTelemetryAt: Date.now(),
      history: [...s.history, point].slice(-HISTORY_POINTS),
      log: fresh.length ? [...fresh.reverse(), ...s.log].slice(0, LOG_ENTRIES) : s.log,
    });
  },

  onEpoch: (e) => {
    const s = get();
    const epochs = [e, ...s.epochs.filter((x) => x.epoch !== e.epoch)].sort((a, b) => b.epoch - a.epoch).slice(0, 30);
    const entries: LogEntry[] = [];
    if (e.attestation.status === "rejected") {
      entries.push({
        id: `reject:${e.epoch}`,
        ts: e.end_ms,
        severity: "critical",
        text: `epoch ${e.epoch} rejected: ${e.attestation.reason ?? e.attestation.reason_code ?? "unknown reason"}`,
        source: "validator",
      });
    }
    const known = new Set(s.log.map((l) => l.id));
    set({ epochs, log: [...entries.filter((x) => !known.has(x.id)), ...s.log].slice(0, LOG_ENTRIES) });
  },

  onBalance: (b) => set({ balance: b }),

  onMints: (m) => set({ mints: [...m].sort((a, b) => b.epoch - a.epoch).slice(0, 50) }),

  onChainEvent: (e) => {
    if (e.type !== "mint") return;
    const d = e.data as unknown as Mint;
    const s = get();
    if (d.miner_id !== s.telemetry?.miner_id && s.telemetry) return;
    const mint: Mint = { ...d, tx_hash: e.tx_hash, block_number: e.block_number, ts: e.ts };
    set({ mints: [mint, ...s.mints.filter((m) => m.epoch !== mint.epoch)].slice(0, 50) });
  },
}));
