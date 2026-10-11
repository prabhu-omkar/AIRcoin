import { lazy, Suspense, useState } from "react";
import { rigLayout } from "../config";
import { speciesName } from "../species";
import { useTwin } from "../store";

const TwinCam = lazy(() => import("./twin3d/TwinCam").then((m) => ({ default: m.TwinCam })));

/** Miner camera, rendered from the digital twin through the miner's lens; zooms onto the selected plant. */
export function CameraPanel() {
  const [mode, setMode] = useState<"live" | "ndvi">("live");
  const selected = useTwin((s) => s.selectedPlant);
  const selectPlant = useTwin((s) => s.selectPlant);
  const rp = rigLayout.plants.find((p) => p.tag_id === selected);
  return (
    <section className="panel fill area-camera">
      <h2>
        {rp ? <>Camera · {speciesName(rp.species)}<button className="quiet" onClick={() => selectPlant(undefined)}>Show all plants</button></> : "Camera"}
        <span className="right seg small">
          <button className={mode === "live" ? "active" : ""} onClick={() => setMode("live")}>Live</button>
          <button className={mode === "ndvi" ? "active" : ""} onClick={() => setMode("ndvi")}>Plant health</button>
        </span>
      </h2>
      <div className="body">
        <Suspense fallback={<div className="feed-placeholder">Loading view…</div>}>
          <TwinCam mode={mode} focus={selected} />
        </Suspense>
      </div>
    </section>
  );
}
