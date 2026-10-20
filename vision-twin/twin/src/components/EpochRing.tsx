import { useTwin } from "../store";
import { epochProgress } from "../ui";

/** The 60 s proof cycle as a ring: fills while the miner observes, closes when the epoch is signed. */
export function EpochRing({ size = 34, stroke = 3 }: { size?: number; stroke?: number }) {
  const t = useTwin((s) => s.telemetry);
  const p = epochProgress(t);
  const r = (size - stroke) / 2;
  const c = 2 * Math.PI * r;
  const left = t ? Math.max(0, Math.ceil((t.current_epoch.end_ms - t.ts) / 1000)) : 60;
  return (
    <span className="epoch-ring" style={{ width: size, height: size }} title={`Epoch closes in ${left} s`}>
      <svg width={size} height={size} viewBox={`0 0 ${size} ${size}`} aria-hidden>
        <circle cx={size / 2} cy={size / 2} r={r} fill="none" stroke="var(--line)" strokeWidth={stroke} />
        <circle
          cx={size / 2}
          cy={size / 2}
          r={r}
          fill="none"
          stroke="var(--moss)"
          strokeWidth={stroke}
          strokeLinecap="round"
          strokeDasharray={c}
          strokeDashoffset={c * (1 - p)}
          transform={`rotate(-90 ${size / 2} ${size / 2})`}
          style={{ transition: p < 0.03 ? "none" : "stroke-dashoffset 1s linear" }}
        />
      </svg>
      <b>{left}</b>
    </span>
  );
}
