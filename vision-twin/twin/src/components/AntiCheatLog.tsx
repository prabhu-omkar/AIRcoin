import { useTwin } from "../store";

const SEVERITY = { critical: "Critical", warn: "Warning", info: "Info" } as const;

export function AntiCheatLog() {
  const log = useTwin((s) => s.log);
  return (
    <section className="panel" style={{ flex: 1 }}>
      <h2>Anti-cheat log<span className="right meta">{log.length ? `${log.length} event${log.length > 1 ? "s" : ""}` : ""}</span></h2>
      <div className="body">
        {log.length ? (
          <ol className="log">
            {log.map((l) => (
              <li key={l.id} className={l.severity}>
                <time>{new Date(l.ts).toLocaleTimeString([], { hour12: false })}</time>
                <span className="sev" title={SEVERITY[l.severity]} />
                <span className="msg">{l.source === "validator" ? "Validator: " : ""}{l.text}</span>
              </li>
            ))}
          </ol>
        ) : (
          <div className="empty-state">
            <b>Nothing flagged</b>
            <span>Removed pots, swapped or plastic plants and unknown stickers show up here.</span>
          </div>
        )}
      </div>
    </section>
  );
}
