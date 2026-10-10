import { lazy, Suspense, useState } from "react";
import { config } from "../config";
import { useTwin } from "../store";

// The simulated lens view pulls in three.js; load it only when it is actually shown (mock mode, no feed).
const TwinCam = lazy(() => import("./twin3d/TwinCam").then((m) => ({ default: m.TwinCam })));

type Stream = "annotated" | "raw" | "ndvi";
const PATHS: Record<Stream, string> = { annotated: "", raw: "raw", ndvi: "ndvi" };

/** Owner's camera: the miner's real MJPEG streams from `aircoin_vision.run --serve`. */
export function CameraPanel() {
  const [stream, setStream] = useState<Stream>("annotated");
  const [failed, setFailed] = useState(false);
  const isMock = useTwin((s) => s.source === "mock");
  const base = config.feedUrl ? config.feedUrl.replace(/\/?$/, "/") : "";
  const simulated = !base && isMock;
  const pick = (s: Stream) => {
    setStream(s);
    setFailed(false);
  };

  return (
    <section className="panel fill area-camera">
      <h2>
        Camera
        <span className="right head-tools">
          {simulated && <span className="meta">simulated · mock data</span>}
          {base && !failed && <span className="live-dot">Live</span>}
          <span className="seg small">
            <button className={stream === "annotated" ? "active" : ""} onClick={() => pick("annotated")}>Detections</button>
            <button className={stream === "raw" ? "active" : ""} disabled={simulated} onClick={() => pick("raw")}>Raw</button>
            <button className={stream === "ndvi" ? "active" : ""} onClick={() => pick("ndvi")}>NDVI</button>
          </span>
        </span>
      </h2>
      <div className="body">
        {base && !failed ? (
          <img key={stream} className="feed" src={base + PATHS[stream]} alt={`Miner camera, ${stream} view`} onError={() => setFailed(true)} />
        ) : simulated ? (
          <Suspense fallback={<div className="feed-placeholder">Loading view…</div>}>
            <TwinCam mode={stream === "ndvi" ? "ndvi" : "rgb"} />
          </Suspense>
        ) : (
          <div className="feed-placeholder">
            <b>{failed ? "Camera unreachable" : "Camera not connected"}</b>
            <span>{failed ? `No stream at ${base + PATHS[stream]}.` : "Start the vision pipeline on the miner and open this page with its address."}</span>
            <code>python -m aircoin_vision.run picam --serve 8080</code>
            <code>?feed=http://&lt;miner&gt;:8080/</code>
            {failed && <button onClick={() => setFailed(false)}>Try again</button>}
          </div>
        )}
      </div>
    </section>
  );
}
