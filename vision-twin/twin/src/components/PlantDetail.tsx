import { Fragment, useEffect, useState } from "react";
import { config, rigLayout } from "../config";
import { speciesInfo, speciesName } from "../species";
import { useTwin } from "../store";

const STATUS_LABEL = { present: "Healthy", missing: "Missing", removed: "Removed", suspect: "Suspect" } as const;
const STATUS_NOTE = {
  present: "Seen by the camera and matching its enrolment. Earning.",
  missing: "Sticker not seen for over 10 s. Earns nothing until it is back.",
  removed: "Sticker not seen for over a minute. Put the pot back to resume earning.",
  suspect: "The plant no longer matches its enrolment or shows no NDVI signal. Earns nothing.",
} as const;

/** Latest crop of one plant from the miner's camera server, refreshed every few seconds. */
function CropPhoto({ tag }: { tag: number }) {
  const base = config.feedUrl ? config.feedUrl.replace(/\/?$/, "/") : "";
  const [t, setT] = useState(Date.now());
  const [ok, setOk] = useState(true);
  useEffect(() => {
    setOk(true);
    const id = setInterval(() => setT(Date.now()), 4000);
    return () => clearInterval(id);
  }, [tag]);
  if (!base || !ok) return <div className="crop empty">No camera crop</div>;
  return <img className="crop" src={`${base}crop/${tag}.jpg?t=${t}`} alt={`Camera crop of plant ${tag}`} onError={() => setOk(false)} />;
}

export function PlantDetail() {
  const tag = useTwin((s) => s.selectedPlant);
  const p = useTwin((s) => (tag === undefined ? undefined : s.telemetry?.plants.find((x) => x.tag_id === tag)));
  const epochAir = useTwin((s) => (tag === undefined ? undefined : s.epochs[0]?.plants.find((x) => x.tag_id === tag)?.air));
  const rp = rigLayout.plants.find((x) => x.tag_id === tag);

  if (tag === undefined || !rp) {
    return (
      <section className="panel area-detail">
        <h2>Plant</h2>
        <div className="body">
          <div className="empty-state">
            <b>Select a plant</b>
            <span>Pick a pot in the grid to see its camera crop, health and what it earns.</span>
          </div>
        </div>
      </section>
    );
  }
  const info = speciesInfo(rp.species);
  const status = p?.status ?? "missing";
  const lost = status === "missing" || status === "removed";
  const rows: [string, string][] = [
    ["Leaf area", p && !lost ? `${Math.round(p.leaf_area_cm2)} cm²` : "—"],
    ["Alive score (NDVI)", p && !lost ? p.alive_score.toFixed(2) : "—"],
    ["Matches enrolment", p?.species_conf !== undefined && !lost ? `${Math.round(p.species_conf * 100)} %` : "—"],
    ["Earning now", p ? `${p.rate_air_per_h.toFixed(3)} AIR/h` : "—"],
    ["Last epoch", epochAir !== undefined ? `${epochAir.toFixed(5)} AIR` : "—"],
  ];
  return (
    <section className="panel area-detail">
      <h2>Plant<span className="right meta">tag #{tag} · slot {rp.slot + 1}</span></h2>
      <div className="body detail">
        <CropPhoto tag={tag} />
        <div className="detail-info">
          <h3>{speciesName(rp.species)}</h3>
          {info && <p className="sci"><i>{info.scientific_name}</i> · removes {info.main_targets.toLowerCase()}</p>}
          <div className={`status-line ${status}`}><i className={`status-dot ${status}`} />{STATUS_LABEL[status]}<span>{STATUS_NOTE[status]}</span></div>
          <div className="kv">{rows.map(([k, v]) => <Fragment key={k}><span>{k}</span><b>{v}</b></Fragment>)}</div>
        </div>
      </div>
    </section>
  );
}
