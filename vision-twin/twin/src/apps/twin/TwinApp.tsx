// Judges' demo: the full-screen 3D digital twin of one miner and its 20-plant rig.
import { useEffect, useRef, useState } from "react";
import { LayoutDashboard } from "lucide-react";
import { Header } from "../../components/Header";
import { MinerModel } from "../../components/MinerModel";
import { TwinCam } from "../../components/twin3d/TwinCam";
import { config } from "../../config";
import { fromBaseUnits } from "../../contracts";
import { startSource } from "../../sources";
import { useTwin } from "../../store";
import "../../styles.css";

type CamMode = "twin" | "ndvi" | "live";

/** The miner camera as picture-in-picture: the twin seen through the lens, NDVI, or the real feed. */
function CameraPip() {
  const [mode, setMode] = useState<CamMode>("twin");
  const [open, setOpen] = useState(true);
  return (
    <section className={`pip ${open ? "" : "closed"}`} aria-label="Miner camera">
      <header>
        <span className="pip-title">Miner camera</span>
        {open && (
          <span className="seg small">
            <button className={mode === "twin" ? "active" : ""} onClick={() => setMode("twin")}>Lens</button>
            <button className={mode === "ndvi" ? "active" : ""} onClick={() => setMode("ndvi")}>NDVI</button>
            {config.feedUrl && <button className={mode === "live" ? "active" : ""} onClick={() => setMode("live")}>Live</button>}
          </span>
        )}
        <button className="quiet" onClick={() => setOpen((o) => !o)} aria-label={open ? "Hide camera" : "Show camera"}>
          {open ? "Hide" : "Show"}
        </button>
      </header>
      {open && (
        <div className="pip-body">
          {mode === "live" ? <img className="feed" src={config.feedUrl} alt="Live annotated camera feed" /> : <TwinCam mode={mode === "ndvi" ? "ndvi" : "live"} />}
        </div>
      )}
    </section>
  );
}

interface Toast {
  id: string;
  tone: "bad" | "warn" | "mint";
  text: string;
  at: number;
}

/** Anti-cheat flags and mints as short-lived toasts, so judges see the miner react. */
function EventToasts() {
  const log = useTwin((s) => s.log);
  const mints = useTwin((s) => s.mints);
  const [toasts, setToasts] = useState<Toast[]>([]);
  const seen = useRef<Set<string> | null>(null);
  const seenMint = useRef<string | undefined>(undefined);

  useEffect(() => {
    if (!seen.current) {
      seen.current = new Set(log.map((l) => l.id)); // don't replay history on load
      return;
    }
    const fresh = log.filter((l) => !seen.current!.has(l.id));
    fresh.forEach((l) => seen.current!.add(l.id));
    if (fresh.length)
      setToasts((t) => [...fresh.map((l): Toast => ({ id: l.id, tone: l.severity === "critical" ? "bad" : "warn", text: l.text, at: Date.now() })), ...t].slice(0, 4));
  }, [log]);

  useEffect(() => {
    const m = mints[0];
    if (!m) return;
    if (seenMint.current === undefined) {
      seenMint.current = m.tx_hash;
      return;
    }
    if (m.tx_hash === seenMint.current) return;
    seenMint.current = m.tx_hash;
    setToasts((t) => [{ id: m.tx_hash, tone: "mint" as const, text: `Epoch ${m.epoch} minted · +${fromBaseUnits(m.amount).toFixed(5)} AIR`, at: Date.now() }, ...t].slice(0, 4));
  }, [mints]);

  useEffect(() => {
    if (!toasts.length) return;
    const id = setInterval(() => setToasts((t) => t.filter((x) => Date.now() - x.at < 9000)), 1000);
    return () => clearInterval(id);
  }, [toasts.length]);

  return (
    <ol className="toasts" aria-live="polite">
      {toasts.map((t) => (
        <li key={t.id} className={t.tone}>
          <span className="toast-kind">{t.tone === "mint" ? "Mint" : t.tone === "bad" ? "Flagged" : "Warning"}</span>
          {t.text}
        </li>
      ))}
    </ol>
  );
}

export function TwinApp({
  onOpenDashboard,
}: {
  onOpenDashboard?: () => void;
}) {
  useEffect(() => startSource(), []);

  return (
    <div className="twin-app" style={{ width: "100%", height: "100%", position: "relative" }}>
      <MinerModel />
      <Header
        app="twin"
        extraActions={
          onOpenDashboard ? (
            <div style={{ display: "flex", alignItems: "center", marginRight: 12 }}>
              <button
                onClick={onOpenDashboard}
                style={{
                  display: "inline-flex",
                  alignItems: "center",
                  gap: 6,
                  background: "var(--surface)",
                  color: "var(--text)",
                  border: "1px solid var(--line-2)",
                  borderRadius: "var(--r-md)",
                  padding: "6px 12px",
                  fontWeight: 500,
                  fontSize: 12,
                  cursor: "pointer",
                }}
              >
                <LayoutDashboard size={14} />
                <span>Owner Dashboard</span>
              </button>
            </div>
          ) : undefined
        }
      />
      <EventToasts />
      <CameraPip />
    </div>
  );
}

export default TwinApp;
