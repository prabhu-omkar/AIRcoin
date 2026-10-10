import { useState } from "react";
import { rigLayout } from "../config";
import { speciesName } from "../species";
import { useTwin } from "../store";
import { mockMiner } from "../sources";
import type { PlantOverride } from "../sources/mock";

const STATUS_LABEL = { present: "healthy", missing: "missing", removed: "removed", suspect: "suspect" } as const;

/** Virtual 20-slot grid mirroring the physical rig: green healthy, grey missing, red suspect. */
export function PlantGrid() {
  const telemetry = useTwin((s) => s.telemetry);
  const isMock = useTwin((s) => s.source === "mock");
  const [selected, setSelected] = useState<number | undefined>();
  const byTag = new Map(telemetry?.plants.map((p) => [p.tag_id, p]));
  const slots = Array.from({ length: rigLayout.rows * rigLayout.cols }, (_, i) => rigLayout.plants.find((p) => p.slot === i));
  const counts = { present: 0, missing: 0, removed: 0, suspect: 0 };
  telemetry?.plants.forEach((p) => counts[p.status]++);

  const act = (o: PlantOverride | undefined) => {
    if (selected === undefined || !mockMiner) return;
    mockMiner.setPlant(selected, o, Date.now());
    setSelected(undefined);
  };

  return (
    <div className="panel area-plants">
      <h2>
        Plants
        <span className="right legend">
          <span style={{ "--c": "var(--ok)" } as React.CSSProperties}>{counts.present}</span>
          <span style={{ "--c": "var(--idle)" } as React.CSSProperties}>{counts.missing + counts.removed}</span>
          <span style={{ "--c": "var(--bad)" } as React.CSSProperties}>{counts.suspect}</span>
        </span>
      </h2>
      <div className="body" style={{ display: "flex", flexDirection: "column", gap: 8 }}>
        <div className="plant-grid" style={{ gridTemplateColumns: `repeat(${rigLayout.cols}, 1fr)`, gridTemplateRows: `repeat(${rigLayout.rows}, 1fr)`, flex: 1 }}>
          {slots.map((rp, i) => {
            if (!rp) return <div key={`empty-${i}`} className="slot missing"><div className="tag">slot {i}</div><div className="name">empty</div></div>;
            const p = byTag.get(rp.tag_id);
            const status = p?.status ?? "missing";
            return (
              <div
                key={rp.tag_id}
                className={`slot ${status} ${isMock ? "clickable" : ""} ${selected === rp.tag_id ? "selected" : ""}`}
                title={`${speciesName(rp.species)} · tag ${rp.tag_id} · ${STATUS_LABEL[status]}`}
                onClick={() => isMock && setSelected(selected === rp.tag_id ? undefined : rp.tag_id)}
              >
                <div className="tag"><span>#{rp.tag_id}</span><span>{STATUS_LABEL[status]}</span></div>
                <div className="name">{speciesName(rp.species)}</div>
                <div className="meta" title="visible leaf area · alive score (NDVI)">
                  {p && status !== "missing" && status !== "removed" ? (
                    <><span>{Math.round(p.leaf_area_cm2)} cm²</span><span>♥ {p.alive_score.toFixed(2)}</span></>
                  ) : <span>—</span>}
                </div>
              </div>
            );
          })}
        </div>
        {isMock && selected !== undefined && (
          <div className="mock-menu">
            <span className="hint">Mock tag {selected}:</span>
            <button onClick={() => act("removed")}>Remove</button>
            <button onClick={() => act("fake")}>Fake plant</button>
            <button onClick={() => act("swap")}>Swap plant</button>
            <button onClick={() => act(undefined)}>Restore</button>
          </div>
        )}
      </div>
    </div>
  );
}
