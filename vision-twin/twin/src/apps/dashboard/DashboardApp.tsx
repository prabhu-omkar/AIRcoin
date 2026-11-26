// The miner's live dashboard: camera, sensors, plants, earnings and anti-cheat. All of it is
// public data (telemetry over MQTT, balances and mints from the chain), so there is no sign-in.
import { AntiCheatLog } from "../../components/AntiCheatLog";
import { AqiChart } from "../../components/AqiChart";
import { CameraPanel } from "../../components/CameraPanel";
import { Gauges } from "../../components/Gauges";
import { MapPanel } from "../../components/MapPanel";
import { PlantGrid } from "../../components/PlantGrid";
import { Wallet } from "../../components/Wallet";
import type { View } from "../../components/Header";

export default function Dashboard({ view }: { view: Exclude<View, "twin"> }) {
  return (
    <main className={`page page-${view}`}>
      {view === "overview" && (
        <>
          <CameraPanel />
          <div className="stack">
            <AqiChart />
            <Gauges />
          </div>
        </>
      )}
      {view === "plants" && (
        <>
          <CameraPanel />
          <PlantGrid />
        </>
      )}
      {view === "earnings" && (
        <>
          <div className="stack">
            <Wallet />
            <AntiCheatLog />
          </div>
          <MapPanel />
        </>
      )}
    </main>
  );
}
