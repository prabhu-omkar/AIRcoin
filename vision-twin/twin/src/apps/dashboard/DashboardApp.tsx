// Miner owner's dashboard: the real camera, plant health, sensors, earnings and wallet. No 3D.
import { useEffect } from "react";
import { AntiCheatLog } from "../../components/AntiCheatLog";
import { AqiChart } from "../../components/AqiChart";
import { CameraPanel } from "../../components/CameraPanel";
import { Earnings } from "../../components/Earnings";
import { Gauges } from "../../components/Gauges";
import { Header } from "../../components/Header";
import { MapPanel } from "../../components/MapPanel";
import { PlantDetail } from "../../components/PlantDetail";
import { PlantGrid } from "../../components/PlantGrid";
import { Wallet } from "../../components/Wallet";
import { startSource } from "../../sources";

export function DashboardApp() {
  useEffect(() => startSource(), []);
  return (
    <div className="app">
      <Header app="dashboard" />
      <main className="grid dash">
        <CameraPanel />
        <PlantGrid />
        <Earnings />
        <PlantDetail />
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
