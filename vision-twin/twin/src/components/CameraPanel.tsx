import { lazy, Suspense, useState } from "react";
import { rigLayout } from "../config";
import { speciesName } from "../species";
import { useTwin } from "../store";

const TwinCam = lazy(() => import("./twin3d/TwinCam").then((m) => ({ default: m.TwinCam })));

/** Miner camera, rendered from the digital twin through the miner's lens; zooms onto the selected plant. */
export function CameraPanel() {
  const selected = useTwin((s) => s.selectedPlant);
  const selectPlant = useTwin((s) => s.selectPlant);
  const [mode, setMode] = useState<"live" | "ndvi">("live");
  const rp = rigLayout.plants.find((p) => p.tag_id === selected);
  return (
    <section className="panel camera">
      <header className="panel-head">
        <h2>{rp ? `Camera on ${speciesName(rp.species)}` : "Miner camera"}</h2>
        <div className="panel-tools">
          {rp && <button className="btn quiet" onClick={() => selectPlant(undefined)}>Show all plants</button>}
          <span className="seg small">
            <button className={mode === "live" ? "active" : ""} onClick={() => setMode("live")}>Lens</button>
            <button className={mode === "ndvi" ? "active" : ""} onClick={() => setMode("ndvi")}>NDVI</button>
          </span>
        </div>
      </header>
      <div className="camera-body">
        <Suspense fallback={<div className="feed-placeholder">Starting the camera view</div>}>
          <TwinCam mode={mode} focus={selected} />
        </Suspense>
      </div>
    </section>
  );
}
