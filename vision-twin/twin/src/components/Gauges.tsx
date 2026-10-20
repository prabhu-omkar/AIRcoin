import type { SensorReadings } from "../contracts";
import { useTwin } from "../store";
import { aqiBand, AQI_BANDS } from "../ui";

interface ReadoutDef {
  key: keyof SensorReadings;
  label: string;
  unit: string;
  /** WHO / CPCB-style guide value; above it the reading is shown as elevated. */
  guide: number;
  max: number;
  digits?: number;
}

const READOUTS: ReadoutDef[] = [
  { key: "pm25_ugm3", label: "PM2.5", unit: "µg/m³", guide: 60, max: 300 },
  { key: "pm10_ugm3", label: "PM10", unit: "µg/m³", guide: 100, max: 450 },
  { key: "no2_ppb", label: "NO₂", unit: "ppb", guide: 42, max: 200 },
  { key: "voc_index", label: "VOC", unit: "index", guide: 150, max: 500 },
  { key: "co2_ppm", label: "CO₂", unit: "ppm", guide: 800, max: 2000 },
  { key: "temp_c", label: "Temp", unit: "°C", guide: 35, max: 50, digits: 1 },
  { key: "humidity_pct", label: "Humidity", unit: "%", guide: 101, max: 100 },
];

const pct = (v: number, max: number) => `${Math.max(0, Math.min(100, (v / max) * 100))}%`;

/** The AQI on India's six CPCB bands, with a marker at the live value. */
export function AqiMeter() {
  const aqi = useTwin((s) => s.telemetry?.aqi);
  const band = aqiBand(aqi);
  return (
    <div className="aqi-meter">
      <div className="aqi-meter-head">
        <b className="num big">{aqi !== undefined ? Math.round(aqi) : "–"}</b>
        <div>
          <span className={`band-chip ${band.key}`}>{band.name}</span>
          <small>India National AQI</small>
        </div>
      </div>
      <div className="aqi-track" aria-hidden>
        {AQI_BANDS.map((b) => <i key={b.key} className={b.key} />)}
        {aqi !== undefined && <b style={{ left: pct(aqi, 500) }} />}
      </div>
      <div className="aqi-ticks" aria-hidden><span>0</span><span>100</span><span>200</span><span>300</span><span>400</span><span>500</span></div>
    </div>
  );
}

/** Air sensors (C2). Simulated in the hackathon build. */
export function Gauges() {
  const t = useTwin((s) => s.telemetry);
  return (
    <div className="readouts">
      {READOUTS.map((d) => {
        const v = t?.sensors[d.key];
        const high = v !== undefined && v > d.guide;
        return (
          <div key={d.key} className={`readout ${high ? "high" : ""}`}>
            <span className="ro-label">{d.label}</span>
            <span className="ro-value">
              <b className="num">{v === undefined ? "–" : v.toFixed(d.digits ?? 0)}</b>
              <small>{d.unit}</small>
            </span>
            <span className="ro-track" aria-hidden>
              <i style={{ width: pct(v ?? 0, d.max) }} />
              {d.guide < d.max && <em style={{ left: pct(d.guide, d.max) }} />}
            </span>
          </div>
        );
      })}
    </div>
  );
}
