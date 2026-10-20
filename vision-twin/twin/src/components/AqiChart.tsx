import { useTwin } from "../store";

const W = 640;
const H = 200;
const PAD = { l: 34, r: 8, t: 10, b: 22 };
const SPAN = 180_000;
// CPCB band edges drawn as faint background stripes
const BANDS: [number, number, string][] = [
  [0, 50, "good"], [50, 100, "satisfactory"], [100, 200, "moderate"], [200, 300, "poor"], [300, 400, "verypoor"], [400, 500, "severe"],
];

/** AQI and PM2.5 over the last three minutes of telemetry, over the AQI bands they fall in. */
export function AqiChart() {
  const history = useTwin((s) => s.history);
  const now = history[history.length - 1]?.ts ?? 0;
  const pts = history.filter((h) => h.ts >= now - SPAN);
  const maxY = Math.min(500, Math.max(150, ...pts.map((h) => Math.max(h.aqi, h.pm25))) * 1.15);
  const x = (ts: number) => PAD.l + ((ts - (now - SPAN)) / SPAN) * (W - PAD.l - PAD.r);
  const y = (v: number) => H - PAD.b - (Math.min(v, maxY) / maxY) * (H - PAD.t - PAD.b);
  const line = (key: "aqi" | "pm25") => pts.map((h, i) => `${i ? "L" : "M"}${x(h.ts).toFixed(1)},${y(h[key]).toFixed(1)}`).join("");
  const area = pts.length ? `${line("aqi")}L${x(pts[pts.length - 1].ts).toFixed(1)},${y(0)}L${x(pts[0].ts).toFixed(1)},${y(0)}Z` : "";
  const ticks = [0, 100, 200, 300, 400, 500].filter((v) => v <= maxY);

  return (
    <figure className="chart">
      <svg viewBox={`0 0 ${W} ${H}`} width="100%" role="img" aria-label="AQI and PM2.5 over the last three minutes">
        <defs>
          <linearGradient id="aqi-fill" x1="0" x2="0" y1="0" y2="1">
            <stop offset="0" stopColor="var(--ink)" stopOpacity="0.16" />
            <stop offset="1" stopColor="var(--ink)" stopOpacity="0" />
          </linearGradient>
        </defs>
        {BANDS.filter(([lo]) => lo < maxY).map(([lo, hi, key]) => (
          <rect key={key} x={PAD.l} width={W - PAD.l - PAD.r} y={y(hi)} height={y(lo) - y(Math.min(hi, maxY))} fill={`var(--aqi-${key})`} opacity="0.09" />
        ))}
        {ticks.map((v) => (
          <g key={v}>
            <line x1={PAD.l} x2={W - PAD.r} y1={y(v)} y2={y(v)} stroke="var(--line)" />
            <text x={PAD.l - 6} y={y(v) + 4} className="axis" textAnchor="end">{v}</text>
          </g>
        ))}
        <text x={PAD.l} y={H - 5} className="axis">3 min ago</text>
        <text x={W - PAD.r} y={H - 5} className="axis" textAnchor="end">now</text>
        {area && <path d={area} fill="url(#aqi-fill)" />}
        <path d={line("pm25")} fill="none" stroke="var(--ink-3)" strokeWidth="1.5" strokeDasharray="4 3" />
        <path d={line("aqi")} fill="none" stroke="var(--ink)" strokeWidth="2" strokeLinejoin="round" />
        {pts.length > 0 && <circle cx={x(pts[pts.length - 1].ts)} cy={y(pts[pts.length - 1].aqi)} r="3.5" fill="var(--ink)" />}
      </svg>
      <figcaption className="legend">
        <span className="key solid">AQI</span>
        <span className="key dashed">PM2.5 µg/m³</span>
      </figcaption>
    </figure>
  );
}
