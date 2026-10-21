// Miner owner's dashboard: camera, plants, air, earnings and proofs. Sign-in required.
import { useEffect, useState, type ReactNode } from "react";
import { currentOwner, signOut, type Owner } from "../../auth";
import { AntiCheatLog } from "../../components/AntiCheatLog";
import { AqiChart } from "../../components/AqiChart";
import { CameraPanel } from "../../components/CameraPanel";
import { AqiMeter, Gauges } from "../../components/Gauges";
import { DashboardNav, getMarketUrl, type DashboardView } from "../../components/Header";
import { Login } from "../../components/Login";
import { MapPanel } from "../../components/MapPanel";
import { PlantDetail, SpecimenLegend, SpecimenSheet } from "../../components/PlantGrid";
import { Wallet } from "../../components/Wallet";
import { config } from "../../config";
import { startSource } from "../../sources";
import { useTwin } from "../../store";
import { aqiBand, earningRate, fmt } from "../../ui";
import "../../styles.css";

function Panel({ title, tools, className = "", children }: { title: string; tools?: ReactNode; className?: string; children: ReactNode }) {
  return (
    <section className={`panel ${className}`}>
      <header className="panel-head">
        <h2>{title}</h2>
        {tools && <div className="panel-tools">{tools}</div>}
      </header>
      <div className="panel-body">{children}</div>
    </section>
  );
}

const PAGES: Record<DashboardView, { title: string; lead: string }> = {
  overview: { title: "Overview", lead: "What your miner sees, the air it's working in, and what it has earned." },
  plants: { title: "Plants", lead: "Every pot on the rig, tinted by how alive the camera finds it." },
  earnings_security: { title: "Earnings & proofs", lead: "Signed proofs, minted AIR and everything anti-cheat refused to pay for." },
};

function PageHead({ view }: { view: DashboardView }) {
  const t = useTwin((s) => s.telemetry);
  const band = aqiBand(t?.aqi);
  return (
    <div className="page-head">
      <div>
        <h1>{PAGES[view].title}</h1>
        <p>{PAGES[view].lead}</p>
      </div>
      <dl className="page-stats">
        <div>
          <dt>Earning now</dt>
          <dd><b className="num">{fmt(earningRate(t), 2)}</b> AIR/h</dd>
        </div>
        <div>
          <dt>Air outside</dt>
          <dd><b className="num">{t?.aqi !== undefined ? Math.round(t.aqi) : "–"}</b> <span className={`band-chip ${band.key}`}>{band.name}</span></dd>
        </div>
      </dl>
    </div>
  );
}

function Overview() {
  return (
    <main className="page grid-overview">
      <CameraPanel />
      <Panel title="Specimen sheet" tools={<SpecimenLegend />} className="area-specimens">
        <SpecimenSheet />
      </Panel>
      <Panel title="Air quality" className="area-air">
        <AqiMeter />
        <AqiChart />
      </Panel>
      <Panel title="Earnings" className="area-wallet">
        <Wallet rows={4} />
      </Panel>
      <Panel title="Sensors" className="area-sensors">
        <Gauges />
      </Panel>
    </main>
  );
}

function Plants() {
  return (
    <main className="page grid-plants">
      <Panel title="All plants" tools={<SpecimenLegend />} className="area-specimens">
        <SpecimenSheet />
      </Panel>
      <div className="stack">
        <CameraPanel />
        <Panel title="Selected plant">
          <PlantDetail />
        </Panel>
      </div>
    </main>
  );
}

function Earnings() {
  return (
    <main className="page grid-earnings">
      <Panel title="Minted AIR" className="area-wallet">
        <Wallet rows={10} />
      </Panel>
      <div className="stack">
        <Panel title="Anti-cheat log">
          <AntiCheatLog />
        </Panel>
        <Panel title="Location" className="map-panel">
          <MapPanel />
        </Panel>
      </div>
    </main>
  );
}

function Dashboard({ owner, onSignOut, onOpenTwin }: { owner: Owner; onSignOut: () => void; onOpenTwin?: () => void }) {
  const [view, setView] = useState<DashboardView>("overview");
  useEffect(() => startSource(), []);
  return (
    <div className="dash">
      <DashboardNav account={owner.name} onSignOut={onSignOut} view={view} onNavigate={setView} onOpenTwin={onOpenTwin} />
      <div className="dash-main">
        <PageHead view={view} />
        {view === "overview" && <Overview />}
        {view === "plants" && <Plants />}
        {view === "earnings_security" && <Earnings />}
      </div>
    </div>
  );
}

function NoMiner({ owner, onSignOut }: { owner: Owner; onSignOut: () => void }) {
  return (
    <div className="no-miner">
      <div className="no-miner-card">
        <h1>{owner.minerId ? `${owner.minerId} hasn't connected yet` : "No miner on this account yet"}</h1>
        <p>
          {owner.minerId
            ? `${owner.name}, your miner hasn't sent any data to this console. Its camera, plants and earnings appear here as soon as it comes online.`
            : `${owner.name}, request a miner on the marketplace. Once it's installed, its camera, plants and earnings show up here.`}
        </p>
        <div className="row">
          {!owner.minerId && <a className="btn ink" href={getMarketUrl()}>Request a miner</a>}
          <button className="btn ghost" onClick={onSignOut}>Sign out</button>
        </div>
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
