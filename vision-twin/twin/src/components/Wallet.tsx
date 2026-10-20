import { useEffect, useRef, useState } from "react";
import { fromBaseUnits } from "../contracts";
import { useTwin } from "../store";
import { shortHash } from "../ui";
import { EpochRing } from "./EpochRing";

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

const ATT_LABEL: Record<string, string> = {
  pending: "Pending",
  queued: "Queued",
  submitted: "Submitted",
  accepted: "Minted",
  rejected: "Rejected",
};

/** Owner balance (C4), the epoch in flight (C2) and the last proofs. */
export function Wallet({ rows = 5 }: { rows?: number }) {
  const balance = useTwin((s) => s.balance);
  const mints = useTwin((s) => s.mints);
  const epoch = useTwin((s) => s.telemetry?.current_epoch);
  const latest = useTwin((s) => s.epochs[0]);
  const air = useAnimatedNumber(balance ? fromBaseUnits(balance.air) : 0);
  const running = useAnimatedNumber(epoch?.running_air ?? 0, 800);
  const newest = mints[0]?.tx_hash;
  const [fresh, setFresh] = useState<string | undefined>();
  const first = useRef(true);
  useEffect(() => {
    if (first.current) { first.current = !newest; return; }
    setFresh(newest);
  }, [newest]);

  return (
    <div className="wallet">
      <div className="balance">
        <span className="label">Owner balance</span>
        <b className="num huge">{air.toFixed(4)}</b>
        <span className="unit">AIR</span>
      </div>
      <div className="epoch-now">
        <EpochRing size={40} stroke={3.5} />
        <div>
          <span className="label">This minute, still observing</span>
          <b className="num is-good">+{running.toFixed(5)} AIR</b>
        </div>
      </div>
      <div className="epoch-last">
        <span>Last minute</span>
        {latest ? (
          <span>
            <b className="num">{latest.total_air.toFixed(5)} AIR</b>
            <em className={`att ${latest.attestation.status}`}>{ATT_LABEL[latest.attestation.status] ?? latest.attestation.status}</em>
          </span>
        ) : <span>–</span>}
      </div>
      <table className="mints">
        <thead>
          <tr><th>Time</th><th>Epoch</th><th>Transaction</th><th>Earned</th></tr>
        </thead>
        <tbody>
          {mints.slice(0, rows).map((m) => (
            <tr key={m.tx_hash} className={m.tx_hash === fresh ? "fresh" : ""}>
              <td>{new Date(m.ts).toLocaleTimeString([], { hour12: false })}</td>
              <td className="num">{m.epoch}</td>
              <td><code>{shortHash(m.tx_hash)}</code></td>
              <td className="num">+{fromBaseUnits(m.amount).toFixed(5)}</td>
            </tr>
          ))}
          {!mints.length && <tr><td colSpan={4} className="empty">The first mint lands about a minute after the miner starts.</td></tr>}
        </tbody>
      </table>
    </div>
  );
}
