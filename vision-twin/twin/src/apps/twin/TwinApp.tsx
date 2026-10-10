// Judges' demo: the full-screen 3D digital twin of one miner and its 20-plant rig.
import { useEffect, useRef, useState } from "react";
import { Header } from "../../components/Header";
import { MinerModel } from "../../components/MinerModel";
import { TwinCam } from "../../components/twin3d/TwinCam";
import { config } from "../../config";
import { startSource } from "../../sources";
import { useTwin, type LogEntry } from "../../store";

/** The miner camera as picture-in-picture: the real feed when configured, else the twin seen through the lens. */
function CameraPip() {
  return (
    <section className="pip" aria-label="Miner camera">
      <header><span className="pip-title">Miner camera</span><span className="meta">{config.feedUrl ? "live" : "twin view"}</span></header>
      <div className="pip-body">{config.feedUrl ? <img className="feed" src={config.feedUrl} alt="Live camera feed" /> : <TwinCam />}</div>
    </section>
  );
}

/** New anti-cheat flags as short-lived notices, so judges see the miner react. */
function FlagNotices() {
  const log = useTwin((s) => s.log);
  const [shown, setShown] = useState<(LogEntry & { at: number })[]>([]);
  const seen = useRef<Set<string> | null>(null);
  useEffect(() => {
    if (!seen.current) {
      seen.current = new Set(log.map((l) => l.id)); // don't replay history on load
      return;
    }
    const fresh = log.filter((l) => !seen.current!.has(l.id));
    fresh.forEach((l) => seen.current!.add(l.id));
    if (fresh.length) setShown((s) => [...fresh.map((l) => ({ ...l, at: Date.now() })), ...s].slice(0, 4));
  }, [log]);
  useEffect(() => {
    if (!shown.length) return;
    const id = setInterval(() => setShown((s) => s.filter((x) => Date.now() - x.at < 9000)), 1000);
    return () => clearInterval(id);
  }, [shown.length]);
  return (
    <ol className="toasts" aria-live="polite">
      {shown.map((t) => <li key={t.id} className={t.severity}>{t.text}</li>)}
    </ol>
  );
}

export function TwinApp() {
  useEffect(() => startSource(), []);
  return (
    <div className="twin-app">
      <MinerModel />
      <Header app="twin" />
      <FlagNotices />
      <CameraPip />
    </div>
  );
}
