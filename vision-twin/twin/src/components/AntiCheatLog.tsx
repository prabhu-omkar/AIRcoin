import { useTwin } from "../store";

const SEVERITY = { critical: "Critical", warn: "Warning", info: "Info" } as const;

/** Everything the miner or the validator refused to pay for, newest first. */
export function AntiCheatLog({ limit }: { limit?: number }) {
  const log = useTwin((s) => s.log);
  const items = limit ? log.slice(0, limit) : log;
  if (!items.length) {
    return (
      <div className="empty-state">
        <b>Nothing flagged</b>
        <span>Removed pots, swapped or plastic plants and unknown stickers appear here the moment the camera sees them.</span>
      </div>
    );
  }
  return (
    <ol className="log">
      {items.map((l) => (
        <li key={l.id} className={l.severity}>
          <i className="sev" title={SEVERITY[l.severity]} />
          <span className="msg">
            {l.source === "validator" && <b>Validator </b>}
            {l.text}
          </span>
          <time>{new Date(l.ts).toLocaleTimeString([], { hour12: false })}</time>
        </li>
      ))}
    </ol>
  );
}
