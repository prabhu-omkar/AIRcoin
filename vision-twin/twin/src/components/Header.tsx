import { ExternalLink, Leaf } from "lucide-react";
import { config } from "../config";
import { fromBaseUnits } from "../contracts";
import { useTwin } from "../store";

export type View = "twin" | "overview" | "plants" | "earnings";

const VIEWS: [View, string][] = [
  ["twin", "3D twin"],
  ["overview", "Overview"],
  ["plants", "Plants"],
  ["earnings", "Earnings & security"],
];

function aqiBand(aqi: number): [string, string] {
  if (aqi <= 50) return ["Good", "ok"];
  if (aqi <= 100) return ["Satisfactory", "ok"];
  if (aqi <= 200) return ["Moderate", "warn"];
  if (aqi <= 300) return ["Poor", "warn"];
  return aqi <= 400 ? ["Very poor", "bad"] : ["Severe", "bad"];
}

export const marketUrl = (): string => import.meta.env.VITE_MARKET_URL || "http://localhost:3000/";

export function Header({ view, onView }: { view: View; onView: (v: View) => void }) {
  const source = useTwin((s) => s.source);
  const links = useTwin((s) => s.links);
  const t = useTwin((s) => s.telemetry);
  const balance = useTwin((s) => s.balance);
  const verified = t?.plants.filter((p) => p.status === "present").length;
  const flagged = t?.plants.filter((p) => p.status !== "present").length ?? 0;
  const earning = t?.plants.reduce((sum, p) => sum + p.rate_air_per_h, 0);
  const [band, tone] = aqiBand(t?.aqi ?? 0);
  const online = links.c2 === "online";

  return (
    <header className="bar">
      <div className="brand">
        <span className="brand-icon">
          <Leaf size={16} />
        </span>
        <span className="brand-name">AIRcoin</span>
        <span className="brand-miner" title={online ? "Receiving live telemetry" : "Waiting for the miner"}>
          <i className={`status-dot ${online ? "present" : "missing"}`} />
          {config.minerId}
        </span>
      </div>

      <nav className="seg views" aria-label="Views">
        {VIEWS.map(([v, label]) => (
          <button key={v} className={view === v ? "active" : ""} aria-current={view === v} onClick={() => onView(v)}>
            {label}
          </button>
        ))}
      </nav>

      <dl className="metrics">
        <div>
          <dt>Air quality</dt>
          <dd>
            <b className={tone}>{t?.aqi !== undefined ? Math.round(t.aqi) : "—"}</b>
            <span>{t ? band : ""}</span>
          </dd>
        </div>
        <div>
          <dt>Plants verified</dt>
          <dd>
            <b className={flagged ? "bad" : ""}>{verified ?? "—"}</b>
            <span>of {t?.plants.length ?? 20}</span>
          </dd>
        </div>
        <div>
          <dt>Earning</dt>
          <dd>
            <b>{earning !== undefined ? earning.toFixed(3) : "—"}</b>
            <span>AIR/h</span>
          </dd>
        </div>
        <div>
          <dt>Owner balance</dt>
          <dd>
            <b>{balance ? fromBaseUnits(balance.air).toFixed(4) : "—"}</b>
            <span>AIR</span>
          </dd>
        </div>
      </dl>

      <div className="bar-actions">
        {source === "mock" && <span className="flag">Demo data</span>}
        <a className="btn" href={marketUrl()} target="_blank" rel="noreferrer">
          <ExternalLink size={14} /> Marketplace
        </a>
      </div>
    </header>
  );
}
