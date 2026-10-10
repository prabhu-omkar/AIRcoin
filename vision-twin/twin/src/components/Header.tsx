import { useEffect, useState } from "react";
import { config } from "../config";
import { mockMiner } from "../sources";
import { SCENARIO_NAMES, type Scenario } from "../sources/mock";
import { useTwin, type LinkState } from "../store";

function Link({ name, state }: { name: string; state: LinkState }) {
  return <span className="pill"><span className={`dot ${state}`} />{name}</span>;
}

export function Header() {
  const links = useTwin((s) => s.links);
  const source = useTwin((s) => s.source);
  const lastAt = useTwin((s) => s.lastTelemetryAt);
  const scenario = useTwin((s) => s.telemetry?.scenario);
  const [, setNow] = useState(0);
  useEffect(() => {
    const t = setInterval(() => setNow(Date.now()), 1000);
    return () => clearInterval(t);
  }, []);
  const stale = lastAt !== undefined && Date.now() - lastAt > 5000;

  return (
    <header className="bar">
      <div className="brand">
        <svg width="26" height="26" viewBox="0 0 32 32" aria-hidden><circle cx="16" cy="16" r="15" fill="#13261d" /><path d="M16 6c-6 4-8 10-5 16 1 2 3 3 5 4 2-1 4-2 5-4 3-6 1-12-5-16z" fill="#3ddc84" /></svg>
        AIRcoin <small>Digital twin · {config.minerId}</small>
      </div>
      <div className="spacer" />
      {source === "mock" && mockMiner && (
        <span className="pill">
          MOCK
          <select
            value={scenario}
            onChange={(e) => mockMiner?.setScenario(e.target.value as Scenario)}
            aria-label="Mock scenario"
          >
            {SCENARIO_NAMES.map((s) => <option key={s} value={s}>{s.replace(/_/g, " ")}</option>)}
          </select>
          <button onClick={() => mockMiner?.rejectNextEpoch()} title="Next attestation is rejected (sticker reuse)">Reject next</button>
        </span>
      )}
      <Link name="C2 telemetry" state={stale ? "offline" : links.c2} />
      <Link name="C4 chain" state={links.c4} />
    </header>
  );
}
