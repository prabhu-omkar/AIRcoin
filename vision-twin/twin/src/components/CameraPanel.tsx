import { useState } from "react";
import { config } from "../config";

/** Live annotated feed (MJPEG from `aircoin_vision.detect --serve`). The NDVI view arrives in Phase 2. */
export function CameraPanel() {
  const [failed, setFailed] = useState(false);
  const url = config.feedUrl;
  return (
    <div className="panel fill area-camera">
      <h2>Camera<span className="right hint">{url && !failed ? "annotated feed" : "no feed"}</span></h2>
      <div className="body">
        {url && !failed ? (
          <img className="feed" src={url} alt="Annotated camera feed" onError={() => setFailed(true)} />
        ) : (
          <div className="feed-placeholder">
            <div>{failed ? `Cannot reach ${url}` : "No camera feed configured."}</div>
            <div>On the Pi: <code>python -m aircoin_vision.detect picam --serve 8080</code></div>
            <div>then open the twin with <code>?feed=http://&lt;pi&gt;:8080/</code></div>
            {failed && <button onClick={() => setFailed(false)}>Retry</button>}
          </div>
        )}
      </div>
    </div>
  );
}
