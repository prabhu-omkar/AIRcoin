import type { SensorReadings } from "../contracts";
import { useTwin } from "../store";

interface ReadoutDef {
  key: keyof SensorReadings | "aqi";
  label: string;
  unit: string;
  max: number;
  warn: number;
  bad: number;
  digits?: number;
}

const READOUTS: ReadoutDef[] = [
  { key: "aqi", label: "AQI", unit: "NAQI", max: 500, warn: 101, bad: 201 },
  { key: "pm25_ugm3", label: "PM2.5", unit: "µg/m³", max: 300, warn: 60, bad: 120 },
  { key: "pm10_ugm3", label: "PM10", unit: "µg/m³", max: 400, warn: 100, bad: 250 },
  { key: "no2_ppb", label: "NO₂", unit: "ppb", max: 200, warn: 53, bad: 100 },
  { key: "voc_index", label: "VOC", unit: "index", max: 500, warn: 150, bad: 250 },
  { key: "co2_ppm", label: "CO₂", unit: "ppm", max: 2000, warn: 800, bad: 1200 },
  { key: "temp_c", label: "Temperature", unit: "°C", max: 50, warn: 35, bad: 40, digits: 1 },
  { key: "humidity_pct", label: "Humidity", unit: "%", max: 100, warn: 101, bad: 101 },
];

const pct = (v: number, max: number) => `${Math.max(0, Math.min(100, (v / max) * 100))}%`;

/** One instrument readout: value, unit and a banded scale with a needle. */
function Readout({ def, value }: { def: ReadoutDef; value?: number }) {
  const tone = value === undefined ? "" : value >= def.bad ? "bad" : value >= def.warn ? "warn" : "";
  return (
    <div className="readout">
      <div className="ro-label">{def.label}</div>
      <div className={`ro-value ${tone}`}>
        {value === undefined ? "—" : value.toFixed(def.digits ?? 0)}
        <span>{def.unit}</span>
      </div>
      <div className="ro-scale" aria-hidden>
        <i className="z-ok" style={{ width: pct(def.warn, def.max) }} />
        {def.warn < def.max && <i className="z-warn" style={{ left: pct(def.warn, def.max), width: pct(Math.min(def.bad, def.max) - def.warn, def.max) }} />}
        {def.bad < def.max && <i className="z-bad" style={{ left: pct(def.bad, def.max), right: 0 }} />}
        {value !== undefined && <b style={{ left: pct(value, def.max) }} />}
      </div>
    </div>
  );
}

/** Air sensors (C2). Simulated in the hackathon build; the header says so. */
export function Gauges() {
  const t = useTwin((s) => s.telemetry);
  return (
    <section className="panel area-gauges">
      <h2>
        Air sensors
      </h2>
      <div className="body readouts">
        {READOUTS.map((d) => (
          <Readout key={d.key} def={d} value={d.key === "aqi" ? t?.aqi : t?.sensors[d.key]} />
        ))}
      </div>
    </section>
  );
}
