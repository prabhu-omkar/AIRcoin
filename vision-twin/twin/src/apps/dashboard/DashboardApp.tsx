// Miner owner's dashboard: camera, plants, sensors, wallet. Sign-in required.
import { useEffect, useState } from "react";
import { currentOwner, signOut, type Owner } from "../../auth";
import { AntiCheatLog } from "../../components/AntiCheatLog";
import { AqiChart } from "../../components/AqiChart";
import { CameraPanel } from "../../components/CameraPanel";
import { Gauges } from "../../components/Gauges";
import { Header, type DashboardView } from "../../components/Header";
import { Login } from "../../components/Login";
import { MapPanel } from "../../components/MapPanel";
import { PlantGrid } from "../../components/PlantGrid";
import { Wallet } from "../../components/Wallet";
import { config } from "../../config";
import { startSource } from "../../sources";
import { useTwin } from "../../store";

function DashboardTop() {
  const t = useTwin((s) => s.telemetry);
  const earning = t?.plants.reduce((sum, p) => sum + p.rate_air_per_h, 0) ?? 0;
  const aqi = Math.round(t?.aqi ?? 0);
  const aqiCategory = aqi <= 50 ? "Good" : aqi <= 100 ? "Moderate" : aqi <= 200 ? "Poor" : "Severe";
  const aqiClass = aqi <= 50 ? "tag-good" : aqi <= 100 ? "tag-moderate" : "tag-bad";

  return (
    <div className="dashboard-topbar compact">
      <div className="topbar-left">
        <h1>Overview</h1>
        <span className="miner-status-chip">
          <i className="status-dot-pulse" />
          {t?.miner_id ?? config.minerId} · Active
        </span>
      </div>
      <div className="topbar-metrics-strip">
        <div className="topbar-metric-card">
          <span className="tb-label">Air Quality</span>
          <div className="tb-val-row">
            <strong className="tb-val">{aqi}</strong>
            <span className={`tb-tag ${aqiClass}`}>{aqiCategory}</span>
          </div>
        </div>
        <div className="topbar-metric-card highlight">
          <span className="tb-label">Earning Rate</span>
          <div className="tb-val-row">
            <strong className="tb-val">{earning.toFixed(3)}</strong>
            <span className="tb-unit">AIR/h</span>
          </div>
        </div>
      </div>
    </div>
  );
}

const PAGE_COPY: Record<Exclude<DashboardView, "overview">, string> = {
  plants: "Plant fleet",
  earnings_security: "Earnings & security",
};

function PageIntro({ view }: { view: Exclude<DashboardView, "overview"> }) {
  return <div className="section-intro"><div><h1>{PAGE_COPY[view]}</h1></div></div>;
}

function Dashboard({ owner, onSignOut, onOpenTwin }: { owner: Owner; onSignOut: () => void; onOpenTwin?: () => void }) {
  const [view, setView] = useState<DashboardView>("overview");
  useEffect(() => startSource(), []);
  return (
    <div className="app dashboard-shell">
      <Header app="dashboard" account={owner.name} onSignOut={onSignOut} view={view} onNavigate={setView} onOpenTwin={onOpenTwin} />
      <div className="dashboard-workspace">
        {view === "overview" && <><DashboardTop /><main className="dashboard-page overview-page"><CameraPanel /><AqiChart /><Gauges /></main></>}
        {view === "plants" && <><PageIntro view="plants" /><main className="dashboard-page plants-page"><CameraPanel /><PlantGrid /></main></>}
        {view === "earnings_security" && <><PageIntro view="earnings_security" /><main className="dashboard-page earnings-security-page"><Wallet /><AntiCheatLog /><MapPanel /></main></>}
      </div>
    </div>
  );
}

function NoMiner({ owner, onSignOut }: { owner: Owner; onSignOut: () => void }) {
  return (
    <div className="login">
      <div className="login-card">
        <h1>{owner.minerId ? `${owner.minerId} isn't online` : "No miner on this account"}</h1>
        <p className="sub">{owner.minerId
          ? `${owner.name}, your miner hasn't sent any data to this dashboard yet. It appears here as soon as it connects.`
          : `${owner.name}, you don't own a miner yet. Request one in the marketplace; its camera, plants and earnings show up here once it is installed.`}</p>
        {!owner.minerId && <a className="primary button-link" href="http://localhost:3000/">Request a miner</a>}
        <button className="quiet" onClick={onSignOut}>Sign out</button>
      </div>
    </div>
  );
}

export function DashboardApp({ onOpenTwin }: { onOpenTwin?: () => void }) {
  const [owner, setOwner] = useState<Owner | null>(currentOwner());
  const out = () => {
    signOut();
    setOwner(null);
  };
  if (!owner) return <Login onSignedIn={setOwner} />;
  if (owner.minerId !== config.minerId) return <NoMiner owner={owner} onSignOut={out} />;
  return <Dashboard owner={owner} onSignOut={out} onOpenTwin={onOpenTwin} />;
}
