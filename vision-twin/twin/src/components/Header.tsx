import { Activity, ArrowUpRight, Box, LayoutDashboard, LogOut, ShieldCheck, Sprout } from "lucide-react";
import { config } from "../config";
import { fromBaseUnits } from "../contracts";
import { useTwin } from "../store";
import { aqiBand, earningRate, fmt } from "../ui";
import { EpochRing } from "./EpochRing";
import { Mark } from "./Mark";

export type DashboardView = "overview" | "plants" | "earnings_security";

export const getMarketUrl = (): string => {
  if (import.meta.env.VITE_MARKET_URL) return import.meta.env.VITE_MARKET_URL;
  if (typeof window !== "undefined") {
    const host = window.location.hostname;
    if (host !== "localhost" && host !== "127.0.0.1" && !host.endsWith(".local")) return "https://aircoin-market.vercel.app/";
  }
  return "http://localhost:5173/";
};

function SourcePill() {
  const source = useTwin((s) => s.source);
  const c2 = useTwin((s) => s.links.c2);
  if (source === "mock") return <span className="source-pill demo" title="Simulated miner running in this browser">Demo data</span>;
  return <span className={`source-pill ${c2}`} title={`Telemetry link: ${c2}`}><i />{c2 === "online" ? "Live" : c2}</span>;
}

/** The judges' twin: one instrument bar across the top of the 3D scene. */
export function Header({ onOpenDashboard }: { onOpenDashboard?: () => void }) {
  const t = useTwin((s) => s.telemetry);
  const balance = useTwin((s) => s.balance);
  const healthy = t?.plants.filter((p) => p.status === "present").length;
  const flagged = t ? t.plants.length - (healthy ?? 0) : 0;
  const band = aqiBand(t?.aqi);
  const running = t?.current_epoch.running_air ?? 0;

  return (
    <header className="tw-bar">
      <div className="tw-brand">
        <Mark size={30} />
        <div>
          <b>AIRcoin</b>
          <span>Twin of {t?.miner_id ?? config.minerId}</span>
        </div>
      </div>

      <dl className="tw-readings">
        <div className="reading">
          <dt>Air quality</dt>
          <dd>
            <b className="num">{t?.aqi !== undefined ? Math.round(t.aqi) : "–"}</b>
            {t && <span className={`band-chip ${band.key}`}>{band.name}</span>}
          </dd>
        </div>
        <div className="reading">
          <dt>Plants verified</dt>
          <dd>
            <b className={`num ${flagged ? "is-bad" : ""}`}>{healthy ?? "–"}</b>
            <span>of {t?.plants.length ?? 20}</span>
          </dd>
        </div>
        <div className="reading wide-only">
          <dt>Earning now</dt>
          <dd>
            <b className="num">{fmt(earningRate(t), 2)}</b>
            <span>AIR/h</span>
          </dd>
        </div>
        <div className="reading epoch">
          <EpochRing />
          <div>
            <dt>This minute</dt>
            <dd>
              <b className="num is-good">+{running.toFixed(4)}</b>
              <span>AIR</span>
            </dd>
          </div>
        </div>
        <div className="reading wide-only">
          <dt>Owner balance</dt>
          <dd>
            <b className="num">{balance ? fromBaseUnits(balance.air).toFixed(4) : "–"}</b>
            <span>AIR</span>
          </dd>
        </div>
      </dl>

      <div className="tw-actions">
        <SourcePill />
        {onOpenDashboard && (
          <button className="btn ghost" onClick={onOpenDashboard}>
            <LayoutDashboard size={15} />
            <span>Dashboard</span>
          </button>
        )}
        <a className="btn ink" href={getMarketUrl()} target="_blank" rel="noreferrer">
          <span>Marketplace</span>
          <ArrowUpRight size={15} />
        </a>
      </div>
    </header>
  );
}

const NAV: { id: DashboardView; label: string; icon: typeof Activity }[] = [
  { id: "overview", label: "Overview", icon: Activity },
  { id: "plants", label: "Plants", icon: Sprout },
  { id: "earnings_security", label: "Earnings & proofs", icon: ShieldCheck },
];

/** Owner dashboard navigation rail. */
export function DashboardNav({
  account,
  onSignOut,
  view,
  onNavigate,
  onOpenTwin,
}: {
  account: string;
  onSignOut: () => void;
  view: DashboardView;
  onNavigate: (view: DashboardView) => void;
  onOpenTwin?: () => void;
}) {
  const t = useTwin((s) => s.telemetry);
  const initials = account.split(" ").map((x) => x[0]).slice(0, 2).join("");
  const healthy = t?.plants.filter((p) => p.status === "present").length ?? 0;
  return (
    <aside className="rail">
      <div className="rail-brand">
        <Mark size={30} />
        <div>
          <b>AIRcoin</b>
          <span>Owner console</span>
        </div>
      </div>

      <div className="rail-miner">
        <span className="rail-miner-dot" data-state={t ? (healthy === t.plants.length ? "ok" : "warn") : "idle"} />
        <div>
          <b>{t?.miner_id ?? config.minerId}</b>
          <span>{t ? `${healthy} of ${t.plants.length} plants earning` : "Waiting for the miner"}</span>
        </div>
      </div>

      <nav className="rail-nav" aria-label="Dashboard">
        {NAV.map(({ id, label, icon: Icon }) => (
          <button key={id} className={view === id ? "active" : ""} aria-current={view === id ? "page" : undefined} onClick={() => onNavigate(id)}>
            <Icon size={17} />
            <span>{label}</span>
          </button>
        ))}
      </nav>

      <div className="rail-links">
        {onOpenTwin && (
          <button onClick={onOpenTwin}>
            <Box size={16} />
            <span>3D twin</span>
          </button>
        )}
        <a href={getMarketUrl()} target="_blank" rel="noreferrer">
          <ArrowUpRight size={16} />
          <span>Marketplace</span>
        </a>
      </div>

      <div className="rail-account">
        <span className="avatar">{initials}</span>
        <div>
          <b>{account}</b>
          <SourcePill />
        </div>
        <button className="icon-btn" onClick={onSignOut} aria-label="Sign out" title="Sign out">
          <LogOut size={16} />
        </button>
      </div>
    </aside>
  );
}
