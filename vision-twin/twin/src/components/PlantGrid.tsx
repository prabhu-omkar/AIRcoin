import { Fragment } from "react";
import { rigLayout } from "../config";
import { speciesInfo, speciesName } from "../species";
import { useTwin } from "../store";

const STATUS_LABEL = { present: "Healthy", missing: "Missing", removed: "Removed", suspect: "Suspect" } as const;
const STATUS_NOTE = {
  present: "Seen by the camera and matching its enrolment. Earning.",
  missing: "Not seen for over 10 s. Earns nothing until it is back.",
  removed: "Not seen for over a minute. Put the pot back to resume earning.",
  suspect: "No longer matches its enrolment, or shows no living tissue. Earns nothing.",
} as const;

function PlantInfo({ tag }: { tag: number }) {
  const selectPlant = useTwin((s) => s.selectPlant);
  const p = useTwin((s) => s.telemetry?.plants.find((x) => x.tag_id === tag));
  const epochAir = useTwin((s) => s.epochs[0]?.plants.find((x) => x.tag_id === tag)?.air);
  const rp = rigLayout.plants.find((x) => x.tag_id === tag)!;
  const info = speciesInfo(rp.species);
  const status = p?.status ?? "missing";
  const lost = status === "missing" || status === "removed";
  const rows: [string, string][] = [
    ["Leaf area", p && !lost ? `${Math.round(p.leaf_area_cm2)} cm²` : "—"],
    ["Alive score", p && !lost ? p.alive_score.toFixed(2) : "—"],
    ["Matches enrolment", p?.species_conf !== undefined && !lost ? `${Math.round(p.species_conf * 100)}%` : "—"],
    ["Earning now", p ? `${p.rate_air_per_h.toFixed(3)} AIR/h` : "—"],
    ["Last minute", epochAir !== undefined ? `${epochAir.toFixed(5)} AIR` : "—"],
  ];
  return (
    <div className="detail-info">
      <button className="quiet back" onClick={() => selectPlant(undefined)}>← All plants</button>
      <h3>{speciesName(rp.species)}</h3>
      {info && <p className="sci"><i>{info.scientific_name}</i>, removes {info.main_targets.toLowerCase()}</p>}
      <div className={`status-line ${status}`}><i className={`status-dot ${status}`} />{STATUS_LABEL[status]}<span>{STATUS_NOTE[status]}</span></div>
      <div className="kv">{rows.map(([k, v]) => <Fragment key={k}><span>{k}</span><b>{v}</b></Fragment>)}</div>
      <p className="hint">Tag #{tag}, slot {rp.slot + 1}. The camera view follows this plant.</p>
    </div>
  );
}

/** The 20 pots; picking one swaps the grid for that plant's details and zooms the camera onto it. */
export function PlantGrid() {
  const telemetry = useTwin((s) => s.telemetry);
  const selected = useTwin((s) => s.selectedPlant);
  const selectPlant = useTwin((s) => s.selectPlant);
  const byTag = new Map(telemetry?.plants.map((p) => [p.tag_id, p]));
  const counts = { present: 0, missing: 0, removed: 0, suspect: 0 };
  telemetry?.plants.forEach((p) => counts[p.status]++);

  return (
    <section className="panel area-plants">
      <h2>
        Plants
        <span className="right legend">
          <span className="key ok">{counts.present} healthy</span>
          {counts.missing + counts.removed > 0 && <span className="key warn">{counts.missing + counts.removed} missing</span>}
          {counts.suspect > 0 && <span className="key bad">{counts.suspect} suspect</span>}
        </span>
      </h2>
      <div className="body">
        {selected !== undefined ? <PlantInfo tag={selected} /> : (
          <div className="plant-grid" style={{ gridTemplateColumns: `repeat(${rigLayout.cols}, minmax(0, 1fr))`, gridTemplateRows: `repeat(${rigLayout.rows}, minmax(0, 1fr))` }}>
            {rigLayout.plants.map((rp) => {
              const p = byTag.get(rp.tag_id);
              const status = p?.status ?? "missing";
              const lost = status === "missing" || status === "removed";
              return (
                <button key={rp.tag_id} className={`slot ${status}`} onClick={() => selectPlant(rp.tag_id)} title={`${speciesName(rp.species)}, ${STATUS_LABEL[status]}`}>
                  <div className="slot-top"><span>#{rp.tag_id}</span><span className="meta">{lost || status === "suspect" ? STATUS_LABEL[status] : `${Math.round(p?.leaf_area_cm2 ?? 0)} cm²`}</span></div>
                  <div className="name">{speciesName(rp.species)}</div>
                  <div className="bar"><i style={{ width: `${lost ? 0 : Math.round((p?.alive_score ?? 0) * 100)}%` }} /></div>
                </button>
              );
            })}
          </div>
        )}
      </div>
    </section>
  );
}
