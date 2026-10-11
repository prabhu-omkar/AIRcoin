import { useEffect, useRef, useState } from "react";
import { fromBaseUnits } from "../contracts";
import { useTwin } from "../store";

function useAnimatedNumber(target: number, ms = 900) {
  const [value, setValue] = useState(target);
  const from = useRef(target);
  useEffect(() => {
    const start = performance.now();
    const v0 = from.current;
    let raf = 0;
    const step = (t: number) => {
      const k = Math.min(1, (t - start) / ms);
      const v = v0 + (target - v0) * (1 - (1 - k) ** 3);
      setValue(v);
      from.current = v;
      if (k < 1) raf = requestAnimationFrame(step);
    };
    raf = requestAnimationFrame(step);
    return () => cancelAnimationFrame(raf);
  }, [target, ms]);
  return value;
}

/** Mint ticker and owner wallet balance (C4), plus the epoch in flight (C2). */
export function Wallet() {
  const balance = useTwin((s) => s.balance);
  const mints = useTwin((s) => s.mints);
  const epoch = useTwin((s) => s.telemetry?.current_epoch);
  const ts = useTwin((s) => s.telemetry?.ts);
  const latest = useTwin((s) => s.epochs[0]);
  const air = useAnimatedNumber(balance ? fromBaseUnits(balance.air) : 0);
  const running = useAnimatedNumber(epoch?.running_air ?? 0, 800);
  const progress = epoch && ts ? Math.min(1, Math.max(0, (ts - epoch.start_ms) / (epoch.end_ms - epoch.start_ms))) : 0;
  const newest = mints[0]?.tx_hash;
  const [fresh, setFresh] = useState<string | undefined>();
  const first = useRef(true);
  useEffect(() => {
    if (first.current) { first.current = !newest; return; }
    setFresh(newest);
  }, [newest]);

  return (
    <section className="panel wallet" style={{ flex: "0 0 auto" }}>
      <h2>Wallet</h2>
      <div className="body">
        <div className="balance">{air.toFixed(4)}<small>AIR</small></div>
        <div className="epoch-line">
          <span>This minute</span>
          <b>+{running.toFixed(5)}</b>
        </div>
        <div className="progress" title="progress through this minute"><div style={{ width: `${progress * 100}%` }} /></div>
        <div className="epoch-line sub">
          <span>Last minute</span>
          <span>{latest ? <>{latest.total_air.toFixed(5)} AIR · <em className={latest.attestation.status}>{latest.attestation.status}</em></> : "—"}</span>
        </div>
        <table className="mints">
          <thead><tr><th>Time</th><th>Earned</th></tr></thead>
          <tbody>
            {mints.slice(0, 5).map((m) => (
              <tr key={m.tx_hash} className={m.tx_hash === fresh ? "fresh" : ""}>
                <td>{new Date(m.ts).toLocaleTimeString([], { hour12: false })}</td>
                <td>+{fromBaseUnits(m.amount).toFixed(5)}</td>
              </tr>
            ))}
            {!mints.length && <tr><td colSpan={2} className="empty">No mints yet</td></tr>}
          </tbody>
        </table>
      </div>
    </section>
  );
}
