import { lazy, Suspense } from "react";
import { rigLayout } from "../config";
import { speciesName } from "../species";
import { useTwin } from "../store";

const TwinCam = lazy(() => import("./twin3d/TwinCam").then((m) => ({ default: m.TwinCam })));

/** Miner camera, rendered from the digital twin through the miner's lens; zooms onto the selected plant. */
export function CameraPanel() {
  const selected = useTwin((s) => s.selectedPlant);
  const selectPlant = useTwin((s) => s.selectPlant);
  const rp = rigLayout.plants.find((p) => p.tag_id === selected);
  return (
    <section className="panel fill area-camera">
      <h2>
        {rp ? <>Camera · {speciesName(rp.species)}<button className="quiet" onClick={() => selectPlant(undefined)}>Show all plants</button></> : "Camera"}
        <span className="camera-live-badge">
          <span className="live-dot" /> Live feed
        </span>
      </h2>
      <div className="body">
        <Suspense fallback={<div className="feed-placeholder">Loading view…</div>}>
          <TwinCam mode="live" focus={selected} />
        </Suspense>
      </div>
    </section>
  );
}
