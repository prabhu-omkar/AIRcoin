import type { SensorReadings } from "../contracts";
import { useTwin } from "../store";

interface GaugeDef {
  key: keyof SensorReadings;
  label: string;
  unit: string;
  max: number;
  warn: number;
  bad: number;
  digits?: number;
}

const GAUGES: GaugeDef[] = [
  { key: "pm25_ugm3", label: "PM2.5", unit: "µg/m³", max: 400, warn: 60, bad: 120 },
  { key: "pm10_ugm3", label: "PM10", unit: "µg/m³", max: 500, warn: 100, bad: 250 },
  { key: "co2_ppm", label: "CO₂", unit: "ppm", max: 2000, warn: 800, bad: 1200 },
  { key: "voc_index", label: "VOC index", unit: "0–500", max: 500, warn: 150, bad: 250 },
  { key: "no2_ppb", label: "NO₂", unit: "ppb", max: 200, warn: 53, bad: 100 },
  { key: "temp_c", label: "Temp", unit: "°C", max: 50, warn: 35, bad: 40, digits: 1 },
  { key: "humidity_pct", label: "Humidity", unit: "%", max: 100, warn: 101, bad: 101 },
];

function Arc({ value, def }: { value: number | undefined; def: GaugeDef }) {
  const frac = value === undefined ? 0 : Math.max(0, Math.min(1, value / def.max));
  const colour = value === undefined ? "var(--idle)" : value >= def.bad ? "var(--bad)" : value >= def.warn ? "var(--warn)" : "var(--ok)";
  const r = 40;
  const len = Math.PI * r;
  return (
    <svg viewBox="0 0 100 58" width="100%" height="58" aria-hidden>
      <path d="M10 50 A40 40 0 0 1 90 50" fill="none" stroke="var(--line)" strokeWidth="8" strokeLinecap="round" />
      <path
        d="M10 50 A40 40 0 0 1 90 50" fill="none" stroke={colour} strokeWidth="8" strokeLinecap="round"
        strokeDasharray={`${len * frac} ${len}`} style={{ transition: "stroke-dasharray 0.8s, stroke 0.8s" }}
      />
    </svg>
  );
}

export function Gauges() {
  const t = useTwin((s) => s.telemetry);
  return (
    <div className="panel area-gauges">
      <h2>
        Air sensors
        <span className="right pill">{t?.sensors_simulated ? "simulated" : t ? "live" : "—"}{t?.scenario ? ` · ${t.scenario.replace(/_/g, " ")}` : ""}</span>
      </h2>
      <div className="body">
        <div className="gauges">
          {GAUGES.map((g) => {
            const v = t?.sensors[g.key];
            return (
              <div className="gauge" key={g.key}>
                <Arc value={v} def={g} />
                <div className="value">{v === undefined ? "—" : v.toFixed(g.digits ?? 0)}</div>
                <div className="label">{g.label} <span className="unit">{g.unit}</span></div>
              </div>
            );
          })}
          <div className="gauge">
            <Arc value={t?.aqi} def={{ key: "pm25_ugm3", label: "AQI", unit: "", max: 500, warn: 101, bad: 201 }} />
            <div className="value">{t?.aqi ?? "—"}</div>
            <div className="label">AQI <span className="unit">NAQI</span></div>
          </div>
        </div>
      </div>
    </div>
  );
}
