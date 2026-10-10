import { lazy, Suspense, useState } from "react";

const TwinCam = lazy(() => import("./twin3d/TwinCam").then((m) => ({ default: m.TwinCam })));

/** Miner camera, rendered from the digital twin through the miner's lens: the live view and plant health (NDVI). */
export function CameraPanel() {
  const [mode, setMode] = useState<"live" | "ndvi">("live");
  return (
    <section className="panel fill area-camera">
      <h2>
        Camera
        <span className="right seg small">
          <button className={mode === "live" ? "active" : ""} onClick={() => setMode("live")}>Live</button>
          <button className={mode === "ndvi" ? "active" : ""} onClick={() => setMode("ndvi")}>Plant health</button>
        </span>
      </h2>
      <div className="body">
        <Suspense fallback={<div className="feed-placeholder">Loading view…</div>}>
          <TwinCam mode={mode} />
        </Suspense>
      </div>
    </section>
  );
}
