import { Activity, Box, Boxes, ExternalLink, Leaf, LogOut, Radio, ShieldCheck } from "lucide-react";
import type { ReactNode } from "react";
import { config } from "../config";
import { fromBaseUnits } from "../contracts";
import { useTwin } from "../store";

export type DashboardView = "overview" | "plants" | "earnings_security";

function aqiBand(aqi: number): [string, string] {
  if (aqi <= 50) return ["Good", "ok"];
  if (aqi <= 100) return ["Satisfactory", "ok"];
  if (aqi <= 200) return ["Moderate", "warn"];
  if (aqi <= 300) return ["Poor", "warn"];
  return aqi <= 400 ? ["Very poor", "bad"] : ["Severe", "bad"];
}

export function Header({
  app,
  account,
  onSignOut,
  view = "overview",
  onNavigate,
  extraActions,
  onOpenTwin,
}: {
  app: "twin" | "dashboard";
  account?: string;
  onSignOut?: () => void;
  view?: DashboardView;
  onNavigate?: (view: DashboardView) => void;
  extraActions?: ReactNode;
  onOpenTwin?: () => void;
}) {
  const source = useTwin((s) => s.source);
  const t = useTwin((s) => s.telemetry);
  const balance = useTwin((s) => s.balance);
  const links = useTwin((s) => s.links);
  const healthy = t?.plants.filter((p) => p.status === "present").length;
  const flagged = t?.plants.filter((p) => p.status !== "present").length ?? 0;
  const [band, tone] = aqiBand(t?.aqi ?? 0);
  const air = balance ? fromBaseUnits(balance.air).toFixed(4) : "-";

  if (app === "dashboard") return (
    <aside className="dashboard-nav">
      <div className="nav-brand"><span><Leaf size={19} /></span><div><b>AIRcoin</b><small>Miner OS</small></div></div>
      <div className="miner-switch"><span><Radio size={16} /></span><div><small>Active miner</small><b>{config.minerId}</b></div><i className={links.c2 === "online" ? "online" : ""} /></div>
      <nav>
        <button className={view === "overview" ? "active" : ""} onClick={() => onNavigate?.("overview")}><Activity size={17} /><span>Overview</span></button>
        <button className={view === "plants" ? "active" : ""} onClick={() => onNavigate?.("plants")}><Boxes size={17} /><span>Plant fleet</span></button>
        <button className={view === "earnings_security" ? "active" : ""} onClick={() => onNavigate?.("earnings_security")}><ShieldCheck size={17} /><span>Earnings & security</span></button>
        {onOpenTwin && (
          <button type="button" onClick={onOpenTwin} title="Open 3D Digital Twin">
            <Box size={17} />
            <span>3D Digital Twin</span>
          </button>
        )}
        <a href={import.meta.env.VITE_MARKET_URL || "http://localhost:5173/"} target="_blank" rel="noreferrer">
          <ExternalLink size={17} />
          <span>Open marketplace</span>
        </a>
      </nav>
      <div className="nav-account"><span>{account?.split(" ").map((x) => x[0]).slice(0,2).join("")}</span><div><b>{account}</b></div><button onClick={onSignOut} aria-label="Sign out"><LogOut size={16} /></button></div>
    </aside>
  );

  return (
    <header className="bar twin">
      <div className="brand"><span className="brand-icon"><Leaf size={17} /></span><span className="brand-name">AIRcoin</span><span className="brand-sep" /><span className="brand-app">Digital twin</span><span className="brand-sub">{config.minerId}</span></div>
      <dl className="metrics">
        <div><dt>Air quality</dt><dd><b className={tone}>{t?.aqi !== undefined ? Math.round(t.aqi) : "-"}</b><span>{t ? band : ""}</span></dd></div>
        <div><dt>Plants verified</dt><dd><b className={flagged ? "bad" : ""}>{healthy ?? "-"}</b><span>of {t?.plants.length ?? 20}</span></dd></div>
        <div><dt>Owner balance</dt><dd><b>{air}</b><span>AIR</span></dd></div>
      </dl>
      <div className="spacer" />
      {extraActions}
      <a
        href={import.meta.env.VITE_MARKET_URL || "http://localhost:5173/"}
        target="_blank"
        rel="noreferrer"
        style={{
          display: "inline-flex",
          alignItems: "center",
          gap: 6,
          background: "var(--surface)",
          color: "var(--text)",
          border: "1px solid var(--line-2)",
          borderRadius: "var(--r-md)",
          padding: "6px 12px",
          fontWeight: 500,
          fontSize: 12,
          textDecoration: "none",
          marginRight: 10,
        }}
      >
        <ExternalLink size={13} />
        <span>Marketplace</span>
      </a>
      {source === "mock" && <span className="flag">Demo stream</span>}
    </header>
  );
}
