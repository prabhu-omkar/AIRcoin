import { useTwin } from "../store";

const W = 300;
const H = 110;
const PAD = { l: 28, r: 6, t: 8, b: 16 };

/** AQI and PM2.5 over the last few minutes of C2 telemetry. */
export function AqiChart() {
  const history = useTwin((s) => s.history);
  const now = history.at(-1)?.ts ?? 0;
  const span = 180_000;
  const maxY = Math.max(100, ...history.map((h) => Math.max(h.aqi, h.pm25))) * 1.1;
  const x = (ts: number) => PAD.l + ((ts - (now - span)) / span) * (W - PAD.l - PAD.r);
  const y = (v: number) => H - PAD.b - (v / maxY) * (H - PAD.t - PAD.b);
  const line = (key: "aqi" | "pm25") =>
    history.filter((h) => h.ts >= now - span).map((h, i) => `${i ? "L" : "M"}${x(h.ts).toFixed(1)},${y(h[key]).toFixed(1)}`).join("");
  const ticks = [0, maxY / 2, maxY].map((v) => Math.round(v));

  return (
    <section className="panel" style={{ flex: "0 0 auto" }}>
      <h2>
        Air quality
        <span className="right legend">
          <span className="key aqi">AQI</span>
          <span className="key pm">PM2.5</span>
          <span className="meta">3 min</span>
        </span>
      </h2>
      <div className="body" style={{ padding: "6px 8px" }}>
        <svg viewBox={`0 0 ${W} ${H}`} width="100%" role="img" aria-label="AQI and PM2.5 history">
          {ticks.map((v) => (
            <g key={v}>
              <line x1={PAD.l} x2={W - PAD.r} y1={y(v)} y2={y(v)} stroke="var(--line)" />
              <text x={PAD.l - 4} y={y(v) + 3} fontSize="8" fill="var(--faint)" textAnchor="end" fontFamily="var(--mono)">{v}</text>
            </g>
          ))}
          <text x={PAD.l} y={H - 3} fontSize="8" fill="var(--faint)" fontFamily="var(--mono)">−3:00</text>
          <text x={W - PAD.r} y={H - 3} fontSize="8" fill="var(--faint)" textAnchor="end" fontFamily="var(--mono)">now</text>
          <path d={line("pm25")} fill="none" stroke="var(--muted)" strokeWidth="1.2" strokeDasharray="3 2" />
          <path d={line("aqi")} fill="none" stroke="var(--text)" strokeWidth="1.5" />
        </svg>
      </div>
    </section>
  );
}
