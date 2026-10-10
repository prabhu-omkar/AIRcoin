import { useTwin } from "../store";

export function AntiCheatLog() {
  const log = useTwin((s) => s.log);
  return (
    <div className="panel" style={{ flex: 1 }}>
      <h2>Anti-cheat log<span className="right hint">{log.length ? `${log.length} event${log.length > 1 ? "s" : ""}` : ""}</span></h2>
      <div className="body">
        {log.length ? (
          <ul className="log">
            {log.map((l) => (
              <li key={l.id}>
                <time>{new Date(l.ts).toLocaleTimeString([], { hour12: false })}</time>
                <span className={l.severity}>{l.source === "validator" ? "Validator: " : ""}{l.text}</span>
              </li>
            ))}
          </ul>
        ) : (
          <div className="empty">No anti-cheat events. All plants verified.</div>
        )}
      </div>
    </div>
  );
}
