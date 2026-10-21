// Shared display helpers for the twin and the owner dashboard: AQI bands, the NDVI ramp, number formats.
import type { PlantStatus, Telemetry } from "./contracts";

export interface AqiBand {
  name: string;
  /** CSS class suffix, also the token name: var(--aqi-<key>) */
  key: "good" | "satisfactory" | "moderate" | "poor" | "verypoor" | "severe";
  from: number;
  to: number;
}

/** India's National AQI (CPCB) bands. */
export const AQI_BANDS: AqiBand[] = [
  { name: "Good", key: "good", from: 0, to: 50 },
  { name: "Satisfactory", key: "satisfactory", from: 51, to: 100 },
  { name: "Moderate", key: "moderate", from: 101, to: 200 },
  { name: "Poor", key: "poor", from: 201, to: 300 },
  { name: "Very poor", key: "verypoor", from: 301, to: 400 },
  { name: "Severe", key: "severe", from: 401, to: 500 },
];

export function aqiBand(aqi: number | undefined): AqiBand {
  const v = Math.round(aqi ?? 0);
  return AQI_BANDS.find((b) => v <= b.to) ?? AQI_BANDS[AQI_BANDS.length - 1];
}

/**
 * Plant liveness on a perceptual viridis-like ramp, the same idea as the NoIR NDVI view:
 * indigo = no living tissue, teal = weak, chartreuse = vigorous.
 */
const RAMP: [number, [number, number, number]][] = [
  [0, [59, 74, 140]],
  [0.35, [42, 120, 142]],
  [0.6, [34, 168, 132]],
  [0.8, [122, 209, 81]],
  [1, [205, 225, 54]],
];

export function ndviColor(alive: number): string {
  const t = Math.max(0, Math.min(1, alive));
  for (let i = 1; i < RAMP.length; i++) {
    const [t1, c1] = RAMP[i];
    const [t0, c0] = RAMP[i - 1];
    if (t <= t1) {
      const k = (t - t0) / (t1 - t0);
      const c = c0.map((v, j) => Math.round(v + (c1[j] - v) * k));
      return `rgb(${c[0]}, ${c[1]}, ${c[2]})`;
    }
  }
  return "rgb(205, 225, 54)";
}

export const STATUS_LABEL: Record<PlantStatus, string> = {
  present: "Healthy",
  missing: "Missing",
  removed: "Removed",
  suspect: "Suspect",
};

export const STATUS_NOTE: Record<PlantStatus, string> = {
  present: "Seen by the camera and matching its enrolment. Earning.",
  missing: "Not seen for over 10 s. Earns nothing until it is back.",
  removed: "Not seen for over a minute. Put the pot back to resume earning.",
  suspect: "Doesn't match its enrolment, or shows no living tissue. Earns nothing.",
};

/** Fraction of the current 60 s epoch that has passed. */
export function epochProgress(t?: Telemetry): number {
  const e = t?.current_epoch;
  if (!e || !t) return 0;
  return Math.max(0, Math.min(1, (t.ts - e.start_ms) / (e.end_ms - e.start_ms)));
}

export function earningRate(t?: Telemetry): number {
  return t?.plants.reduce((sum, p) => sum + p.rate_air_per_h, 0) ?? 0;
}

export function fmt(v: number | undefined, digits = 0): string {
  if (v === undefined || Number.isNaN(v)) return "–";
  return v.toLocaleString("en-IN", { minimumFractionDigits: digits, maximumFractionDigits: digits });
}

export function shortHash(h?: string, n = 6): string {
  if (!h) return "–";
  return `${h.slice(0, n + 2)}…${h.slice(-4)}`;
}
