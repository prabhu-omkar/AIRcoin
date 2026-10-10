import { useState } from "react";
import { fromBaseUnits } from "../contracts";
import { useTwin } from "../store";

const W = 520;
const H = 150;
const PAD = { l: 34, r: 8, t: 10, b: 18 };

/** AIR minted per epoch (C4) with the current earning rate (C2). */
export function Earnings() {
  const mints = useTwin((s) => s.mints);
  const t = useTwin((s) => s.telemetry);
  const [hover, setHover] = useState<number | undefined>();
  const bars = [...mints].slice(0, 24).reverse().map((m) => ({ epoch: m.epoch, air: fromBaseUnits(m.amount), ts: m.ts }));
  const total = bars.reduce((a, b) => a + b.air, 0);
  const avg = bars.length ? total / bars.length : 0;
  const rate = t?.plants.reduce((a, p) => a + p.rate_air_per_h, 0) ?? 0;
  const earning = t?.plants.filter((p) => p.rate_air_per_h > 0).length ?? 0;
  const max = Math.max(0.001, ...bars.map((b) => b.air)) * 1.15;
  const slot = (W - PAD.l - PAD.r) / Math.max(bars.length, 12);
  const y = (v: number) => H - PAD.b - (v / max) * (H - PAD.t - PAD.b);
  const hv = hover !== undefined ? bars[hover] : undefined;

  return (
    <section className="panel area-earnings">
      <h2>Earnings<span className="right meta">last {bars.length} epochs</span></h2>
      <div className="body earnings">
        <dl className="stats">
          <div><dt>Minted, shown epochs</dt><dd>{total.toFixed(4)}<span>AIR</span></dd></div>
          <div><dt>Average per epoch</dt><dd>{avg.toFixed(5)}<span>AIR</span></dd></div>
          <div><dt>Earning rate now</dt><dd>{rate.toFixed(3)}<span>AIR/h</span></dd></div>
          <div><dt>Plants earning</dt><dd>{earning}<span>of {t?.plants.length ?? 20}</span></dd></div>
        </dl>
        <svg viewBox={`0 0 ${W} ${H}`} className="bars" role="img" aria-label="AIR minted per epoch" onMouseLeave={() => setHover(undefined)}>
          {[0, max / 2].map((v) => (
            <g key={v}>
              <line x1={PAD.l} x2={W - PAD.r} y1={y(v)} y2={y(v)} stroke="var(--line)" />
              <text x={PAD.l - 6} y={y(v) + 3} fontSize="9" fill="var(--faint)" textAnchor="end" fontFamily="var(--mono)">{v.toFixed(3)}</text>
            </g>
          ))}
          {bars.map((b, i) => (
            <g key={b.epoch} onMouseEnter={() => setHover(i)}>
              <rect x={PAD.l + i * slot} y={PAD.t} width={slot} height={H - PAD.t - PAD.b} fill="transparent" />
              <rect
                x={PAD.l + i * slot + slot * 0.18} y={y(b.air)} width={slot * 0.64} height={Math.max(1, H - PAD.b - y(b.air))} rx="1.5"
                fill={hover === i ? "var(--text)" : i === bars.length - 1 ? "var(--accent)" : "color-mix(in srgb, var(--accent) 55%, var(--surface-3))"}
              />
            </g>
          ))}
          <text x={PAD.l} y={H - 4} fontSize="9" fill="var(--faint)" fontFamily="var(--mono)">{bars[0] ? `#${bars[0].epoch}` : ""}</text>
          <text x={W - PAD.r} y={H - 4} fontSize="9" fill="var(--faint)" textAnchor="end" fontFamily="var(--mono)">latest</text>
        </svg>
        <div className="bar-hint">{hv ? <>Epoch <b>{hv.epoch}</b> · {new Date(hv.ts).toLocaleTimeString([], { hour12: false })} · <b>+{hv.air.toFixed(5)} AIR</b></> : "Hover a bar for the epoch"}</div>
      </div>
    </section>
  );
}
