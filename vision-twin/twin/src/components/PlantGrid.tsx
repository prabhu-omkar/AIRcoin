import { Fragment, type CSSProperties } from "react";
import { rigLayout } from "../config";
import { speciesInfo, speciesName } from "../species";
import { useTwin } from "../store";
import { ndviColor, STATUS_LABEL, STATUS_NOTE } from "../ui";

/**
 * The specimen sheet: the 20 pots laid out as the rig is, each tile tinted by its liveness on the NDVI ramp,
 * the way the NoIR camera sees living tissue. Missing pots are empty paper, suspect ones are outlined in rust.
 */
export function SpecimenSheet({ compact = false }: { compact?: boolean }) {
  const telemetry = useTwin((s) => s.telemetry);
  const selected = useTwin((s) => s.selectedPlant);
  const selectPlant = useTwin((s) => s.selectPlant);
  const byTag = new Map(telemetry?.plants.map((p) => [p.tag_id, p]));

  return (
    <div
      className={`specimens ${compact ? "compact" : ""}`}
      style={{ gridTemplateColumns: `repeat(${rigLayout.cols}, minmax(0, 1fr))` }}
      role="list"
      aria-label="Plants on the rig"
    >
      {rigLayout.plants.map((rp) => {
        const p = byTag.get(rp.tag_id);
        const status = p?.status ?? "missing";
        const lost = status === "missing" || status === "removed";
        const alive = p && !lost ? p.alive_score : 0;
        const name = speciesName(rp.species);
        return (
          <button
            key={rp.tag_id}
            role="listitem"
            className={`specimen ${status} ${selected === rp.tag_id ? "selected" : ""}`}
            style={lost ? undefined : ({ "--tile": ndviColor(alive) } as CSSProperties)}
            onClick={() => selectPlant(selected === rp.tag_id ? undefined : rp.tag_id)}
            aria-pressed={selected === rp.tag_id}
            title={`${name}: ${STATUS_LABEL[status]}`}
          >
            <span className="specimen-tag">{rp.tag_id}</span>
            {!compact && <span className="specimen-name">{name}</span>}
            <span className="specimen-meta">
              {lost ? STATUS_LABEL[status] : status === "suspect" ? "Suspect" : `${Math.round(p?.leaf_area_cm2 ?? 0)} cm²`}
            </span>
          </button>
        );
      })}
    </div>
  );
}

export function SpecimenLegend() {
  const telemetry = useTwin((s) => s.telemetry);
  const counts = { present: 0, missing: 0, removed: 0, suspect: 0 };
  telemetry?.plants.forEach((p) => counts[p.status]++);
  return (
    <div className="specimen-legend">
      <span className="ramp-key"><i />Liveness</span>
      <span className="count ok"><b className="num">{counts.present}</b> earning</span>
      {counts.missing + counts.removed > 0 && <span className="count warn"><b className="num">{counts.missing + counts.removed}</b> missing</span>}
      {counts.suspect > 0 && <span className="count bad"><b className="num">{counts.suspect}</b> suspect</span>}
    </div>
  );
}

/** Details for the selected plant, or a prompt to pick one. */
export function PlantDetail() {
  const selected = useTwin((s) => s.selectedPlant);
  const selectPlant = useTwin((s) => s.selectPlant);
  const p = useTwin((s) => (selected === undefined ? undefined : s.telemetry?.plants.find((x) => x.tag_id === selected)));
  const epochAir = useTwin((s) => (selected === undefined ? undefined : s.epochs[0]?.plants.find((x) => x.tag_id === selected)?.air));
  const rp = rigLayout.plants.find((x) => x.tag_id === selected);
  if (!rp) {
    return (
      <div className="detail empty">
        <b>Pick a plant</b>
        <span>Select a tile to see its leaf area, liveness and earnings. The camera zooms in on it.</span>
      </div>
    );
  }
  const info = speciesInfo(rp.species);
  const status = p?.status ?? "missing";
  const lost = status === "missing" || status === "removed";
  const alive = p && !lost ? p.alive_score : 0;
  const rows: [string, string][] = [
    ["Leaf area", p && !lost ? `${Math.round(p.leaf_area_cm2)} cm²` : "–"],
    ["Matches enrolment", p?.species_conf !== undefined && !lost ? `${Math.round(p.species_conf * 100)}%` : "–"],
    ["Earning now", p ? `${p.rate_air_per_h.toFixed(3)} AIR/h` : "–"],
    ["Last minute", epochAir !== undefined ? `${epochAir.toFixed(5)} AIR` : "–"],
    ["Placement", info ? info.placement[0].toUpperCase() + info.placement.slice(1) : "–"],
  ];
  return (
    <div className="detail">
      <div className="detail-head">
        <div>
          <p className="inspector-kicker">Tag {rp.tag_id}, slot {rp.slot + 1}</p>
          <h3>{speciesName(rp.species)}</h3>
        </div>
        <button className="icon-btn" onClick={() => selectPlant(undefined)} aria-label="Clear selection">×</button>
      </div>
      {info && <p className="inspector-sub"><i>{info.scientific_name}</i>. Removes {info.main_targets.toLowerCase()}.</p>}
      <div className={`status-line ${status}`}>
        <i className={`status-dot ${status}`} />
        <b>{STATUS_LABEL[status]}</b>
        <span>{STATUS_NOTE[status]}</span>
      </div>
      <div className="liveness">
        <div className="liveness-head"><span>Liveness (NDVI)</span><b className="num">{lost ? "–" : alive.toFixed(2)}</b></div>
        <div className="liveness-bar"><i style={{ left: `${alive * 100}%` }} /></div>
      </div>
      <div className="kv">{rows.map(([k, v]) => <Fragment key={k}><span>{k}</span><b>{v}</b></Fragment>)}</div>
    </div>
  );
}
