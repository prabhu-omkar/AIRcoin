// Miner owner's dashboard: camera, plants, sensors, wallet. Sign-in required.
import { useEffect, useState } from "react";
import { currentOwner, signOut, type Owner } from "../../auth";
import { AntiCheatLog } from "../../components/AntiCheatLog";
import { AqiChart } from "../../components/AqiChart";
import { CameraPanel } from "../../components/CameraPanel";
import { Gauges } from "../../components/Gauges";
import { Header } from "../../components/Header";
import { Login } from "../../components/Login";
import { MapPanel } from "../../components/MapPanel";
import { PlantGrid } from "../../components/PlantGrid";
import { Wallet } from "../../components/Wallet";
import { config } from "../../config";
import { startSource } from "../../sources";

function Dashboard({ owner, onSignOut }: { owner: Owner; onSignOut: () => void }) {
  useEffect(() => startSource(), []);
  return (
    <div className="app">
      <Header app="dashboard" account={owner.name} onSignOut={onSignOut} />
      <main className="grid dash">
        <CameraPanel />
        <PlantGrid />
        <Gauges />
        <aside className="area-side">
          <Wallet />
          <AqiChart />
          <AntiCheatLog />
          <MapPanel />
        </aside>
      </main>
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

export function DashboardApp() {
  const [owner, setOwner] = useState<Owner | null>(currentOwner());
  const out = () => {
    signOut();
    setOwner(null);
  };
  if (!owner) return <Login onSignedIn={setOwner} />;
  if (owner.minerId !== config.minerId) return <NoMiner owner={owner} onSignOut={out} />;
  return <Dashboard owner={owner} onSignOut={out} />;
}
