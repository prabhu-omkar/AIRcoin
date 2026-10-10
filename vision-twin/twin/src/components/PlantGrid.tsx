import { rigLayout } from "../config";
import { speciesName } from "../species";
import { useTwin } from "../store";

const STATUS_LABEL = { present: "healthy", missing: "missing", removed: "removed", suspect: "suspect" } as const;

/** Virtual 20-slot grid mirroring the physical rig. Selecting a slot focuses it in the twin and the camera. */
export function PlantGrid() {
  const telemetry = useTwin((s) => s.telemetry);
  const selected = useTwin((s) => s.selectedPlant);
  const selectPlant = useTwin((s) => s.selectPlant);
  const byTag = new Map(telemetry?.plants.map((p) => [p.tag_id, p]));
  const slots = Array.from({ length: rigLayout.rows * rigLayout.cols }, (_, i) => rigLayout.plants.find((p) => p.slot === i));
  const counts = { present: 0, missing: 0, removed: 0, suspect: 0 };
  telemetry?.plants.forEach((p) => counts[p.status]++);

  return (
    <section className="panel area-plants">
      <h2>
        Plants
        <span className="right legend">
          <span className="key ok">{counts.present} healthy</span>
          <span className="key warn">{counts.missing + counts.removed} missing</span>
          <span className="key bad">{counts.suspect} suspect</span>
        </span>
      </h2>
      <div className="body">
        <div className="plant-grid" style={{ gridTemplateColumns: `repeat(${rigLayout.cols}, minmax(0, 1fr))`, gridTemplateRows: `repeat(${rigLayout.rows}, minmax(0, 1fr))` }}>
          {slots.map((rp, i) => {
            if (!rp) return <div key={`empty-${i}`} className="slot missing"><div className="slot-top"><span>slot {i}</span></div><div className="name">empty</div></div>;
            const p = byTag.get(rp.tag_id);
            const status = p?.status ?? "missing";
            const lost = status === "missing" || status === "removed";
            return (
              <button
                key={rp.tag_id}
                className={`slot ${status} ${selected === rp.tag_id ? "selected" : ""}`}
                title={`${speciesName(rp.species)} · tag ${rp.tag_id} · ${STATUS_LABEL[status]}`}
                onClick={() => selectPlant(selected === rp.tag_id ? undefined : rp.tag_id)}
              >
                <div className="slot-top">
                  <span>#{rp.tag_id}</span>
                  <span className="meta">{lost || status === "suspect" ? STATUS_LABEL[status] : `${Math.round(p?.leaf_area_cm2 ?? 0)}cm²`}</span>
                  <i className={`status-dot ${status}`} />
                </div>
                <div className="name">{speciesName(rp.species)}</div>
                <div className="bar"><i style={{ width: `${lost ? 0 : Math.round((p?.alive_score ?? 0) * 100)}%` }} /></div>
              </button>
            );
          })}
        </div>
      </div>
    </section>
  );
}
