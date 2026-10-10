import { lazy, Suspense, useState } from "react";
import { config } from "../config";

// The simulated lens view pulls in three.js; load it only when it is actually shown (mock mode, no feed).
const TwinCam = lazy(() => import("./twin3d/TwinCam").then((m) => ({ default: m.TwinCam })));

type Mode = "twin" | "annotated" | "raw" | "ndvi";
const PATHS: Record<Exclude<Mode, "twin">, string> = { annotated: "", raw: "raw", ndvi: "ndvi" };

/** Miner camera: the twin seen through the miner's lens (same as the digital twin), or the pipeline's real streams. */
export function CameraPanel() {
  const [mode, setMode] = useState<Mode>("twin");
  const [failed, setFailed] = useState(false);
  const base = config.feedUrl ? config.feedUrl.replace(/\/?$/, "/") : "";
  const pick = (m: Mode) => {
    setMode(m);
    setFailed(false);
  };

  return (
    <section className="panel fill area-camera">
      <h2>
        Camera
        <span className="right seg small">
          <button className={mode === "twin" ? "active" : ""} onClick={() => pick("twin")}>Twin view</button>
          <button className={mode === "annotated" ? "active" : ""} disabled={!base} onClick={() => pick("annotated")}>Feed</button>
          <button className={mode === "raw" ? "active" : ""} disabled={!base} onClick={() => pick("raw")}>Raw</button>
          <button className={mode === "ndvi" ? "active" : ""} disabled={!base} onClick={() => pick("ndvi")}>NDVI</button>
        </span>
      </h2>
      <div className="body">
        {mode === "twin" ? (
          <Suspense fallback={<div className="feed-placeholder">Loading view…</div>}>
            <TwinCam />
          </Suspense>
        ) : !failed ? (
          <img key={mode} className="feed" src={base + PATHS[mode]} alt={`Miner camera, ${mode} view`} onError={() => setFailed(true)} />
        ) : (
          <div className="feed-placeholder">
            <b>Camera unreachable</b>
            <span>No stream at {base + PATHS[mode]}.</span>
            <button onClick={() => setFailed(false)}>Try again</button>
          </div>
        )}
      </div>
    </section>
  );
}
