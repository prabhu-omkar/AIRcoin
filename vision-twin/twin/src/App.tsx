import { useEffect } from "react";
import { AntiCheatLog } from "./components/AntiCheatLog";
import { AqiChart } from "./components/AqiChart";
import { CameraPanel } from "./components/CameraPanel";
import { Gauges } from "./components/Gauges";
import { Header } from "./components/Header";
import { MapPanel } from "./components/MapPanel";
import { MinerModel } from "./components/MinerModel";
import { PlantGrid } from "./components/PlantGrid";
import { Wallet } from "./components/Wallet";
import { startSource } from "./sources";

export function App() {
  useEffect(() => startSource(), []);
  return (
    <div className="app">
      <Header />
      <main className="grid">
        <div className="panel fill area-model">
          <h2>Miner</h2>
          <div className="body"><MinerModel /></div>
        </div>
        <PlantGrid />
        <CameraPanel />
        <Gauges />
        <div className="area-side">
          <Wallet />
          <AqiChart />
          <AntiCheatLog />
          <MapPanel />
        </div>
      </main>
    </div>
  );
}
