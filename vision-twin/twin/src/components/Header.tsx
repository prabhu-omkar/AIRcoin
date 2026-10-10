import { useEffect, useState } from "react";
import { config } from "../config";
import { fromBaseUnits } from "../contracts";
import { useTwin, type LinkState } from "../store";

/** Indian NAQI bands. */
function aqiBand(aqi: number): [string, string] {
  if (aqi <= 50) return ["Good", "ok"];
  if (aqi <= 100) return ["Satisfactory", "ok"];
  if (aqi <= 200) return ["Moderate", "warn"];
  if (aqi <= 300) return ["Poor", "warn"];
  if (aqi <= 400) return ["Very poor", "bad"];
  return ["Severe", "bad"];
}

function Link({ name, state }: { name: string; state: LinkState }) {
  return <span className={`link ${state}`} title={`${name}: ${state}`}><i />{name}</span>;
}

/** App header. `app` picks the subtitle; the twin renders it as an overlay on the 3D scene. */
export function Header({ app }: { app: "twin" | "dashboard" }) {
  const links = useTwin((s) => s.links);
  const source = useTwin((s) => s.source);
  const lastAt = useTwin((s) => s.lastTelemetryAt);
  const t = useTwin((s) => s.telemetry);
  const balance = useTwin((s) => s.balance);
  const [now, setNow] = useState(Date.now());
  useEffect(() => {
    const id = setInterval(() => setNow(Date.now()), 500);
    return () => clearInterval(id);
  }, []);
  const stale = lastAt !== undefined && now - lastAt > 5000;
  const healthy = t?.plants.filter((p) => p.status === "present").length;
  const flagged = t?.plants.filter((p) => p.status !== "present").length ?? 0;
  const left = t ? Math.max(0, Math.ceil((t.current_epoch.end_ms - now) / 1000)) : undefined;
  const [band, tone] = aqiBand(t?.aqi ?? 0);

  return (
    <header className={`bar ${app}`}>
      <div className="brand">
        <svg width="22" height="22" viewBox="0 0 24 24" aria-hidden>
          <path d="M12 2.5C6.5 6 4.6 11.2 6.8 16.4 8 19.2 9.8 20.6 12 21.5c2.2-.9 4-2.3 5.2-5.1C19.4 11.2 17.5 6 12 2.5Z" fill="none" stroke="currentColor" strokeWidth="1.6" />
          <path d="M12 7v14.5" stroke="currentColor" strokeWidth="1.6" />
        </svg>
        <span className="brand-name">AIRcoin</span>
        <span className="brand-sep" />
        <span className="brand-app">{app === "twin" ? "Digital twin" : "Miner dashboard"}</span>
        <span className="brand-sub">{config.minerId}</span>
      </div>

      <dl className="metrics">
        <div>
          <dt>Air quality</dt>
          <dd><b className={tone}>{t?.aqi !== undefined ? Math.round(t.aqi) : "—"}</b><span>{t ? band : ""}</span></dd>
        </div>
        <div>
          <dt>Plants verified</dt>
          <dd><b className={flagged ? "bad" : ""}>{healthy ?? "—"}</b><span>of {t?.plants.length ?? 20}{flagged ? ` · ${flagged} flagged` : ""}</span></dd>
        </div>
        <div>
          <dt>Epoch closes in</dt>
          <dd><b>{left !== undefined ? `0:${String(left).padStart(2, "0")}` : "—"}</b><span>+{(t?.current_epoch.running_air ?? 0).toFixed(4)} AIR</span></dd>
        </div>
        <div>
          <dt>{app === "twin" ? "Minted to owner" : "Your balance"}</dt>
          <dd><b>{balance ? fromBaseUnits(balance.air).toFixed(4) : "—"}</b><span>AIR</span></dd>
        </div>
      </dl>

      <div className="spacer" />
      {source === "mock" && <span className="flag">Mock data</span>}
      <div className="links">
        <Link name="C2" state={stale ? "offline" : links.c2} />
        <Link name="C4" state={links.c4} />
      </div>
    </header>
  );
}
