import { config } from "../config";
import { fromBaseUnits } from "../contracts";
import { useTwin } from "../store";

/** Indian NAQI bands. */
function aqiBand(aqi: number): [string, string] {
  if (aqi <= 50) return ["Good", "ok"];
  if (aqi <= 100) return ["Satisfactory", "ok"];
  if (aqi <= 200) return ["Moderate", "warn"];
  if (aqi <= 300) return ["Poor", "warn"];
  if (aqi <= 400) return ["Very poor", "bad"];
  return ["Severe", "bad"];
}

/** App header. The twin renders it as an overlay; the dashboard adds the signed-in account. */
export function Header({ app, account, onSignOut }: { app: "twin" | "dashboard"; account?: string; onSignOut?: () => void }) {
  const source = useTwin((s) => s.source);
  const t = useTwin((s) => s.telemetry);
  const balance = useTwin((s) => s.balance);
  const healthy = t?.plants.filter((p) => p.status === "present").length;
  const flagged = t?.plants.filter((p) => p.status !== "present").length ?? 0;
  const [band, tone] = aqiBand(t?.aqi ?? 0);

  return (
    <header className={`bar ${app}`}>
      <div className="brand">
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
          <dd><b className={flagged ? "bad" : ""}>{healthy ?? "—"}</b><span>of {t?.plants.length ?? 20}{flagged ? `, ${flagged} flagged` : ""}</span></dd>
        </div>
        <div>
          <dt>{app === "twin" ? "Earned by owner" : "Balance"}</dt>
          <dd><b>{balance ? fromBaseUnits(balance.air).toFixed(4) : "—"}</b><span>AIR</span></dd>
        </div>
      </dl>

      <div className="spacer" />
      {source === "mock" && <span className="flag">Mock data</span>}
      {account && (
        <div className="account">
          <span>{account}</span>
          <button className="quiet" onClick={onSignOut}>Sign out</button>
        </div>
      )}
    </header>
  );
}
