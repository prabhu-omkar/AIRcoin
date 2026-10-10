// Digital twin: the miner on its tripod watching the 20-plant rack, driven live by C2.
import { CameraControls } from "@react-three/drei";
import { Canvas } from "@react-three/fiber";
import { Fragment, useEffect, useRef, useState } from "react";
import * as THREE from "three";
import { rigLayout } from "../config";
import { speciesInfo, speciesName } from "../species";
import { useTwin } from "../store";
import { Miner, PARTS } from "./twin3d/Miner";
import { Rig, slotPosition } from "./twin3d/Rig";
import { Atmosphere, Floor, Lights, MINER_POS, MINER_ROT, Studio, Tripod } from "./twin3d/Stage";

type View = "rig" | "device";

const SHOTS: Record<View, { pos: THREE.Vector3; target: THREE.Vector3 }> = {
  rig: { pos: new THREE.Vector3(9.5, 8.8, 25), target: new THREE.Vector3(0, 6.1, 2) },
  device: { pos: MINER_POS.clone().add(new THREE.Vector3(-2.5, 1.35, -2.7)), target: MINER_POS.clone().add(new THREE.Vector3(0, 0.3, 0)) },
};

function CameraRig({ view, focus }: { view: View; focus?: number }) {
  const ref = useRef<CameraControls>(null);
  useEffect(() => {
    const c = ref.current;
    if (!c) return;
    const rp = focus !== undefined ? rigLayout.plants.find((p) => p.tag_id === focus) : undefined;
    if (rp) {
      const p = slotPosition(rp.slot);
      c.setLookAt(p.x + 2.2, p.y + 1.6, p.z + 7.2, p.x, p.y + 0.55, p.z, true);
      return;
    }
    const v = SHOTS[view];
    c.setLookAt(v.pos.x, v.pos.y, v.pos.z, v.target.x, v.target.y, v.target.z, true);
  }, [view, focus]);
  return <CameraControls ref={ref} makeDefault minDistance={1.2} maxDistance={40} maxPolarAngle={Math.PI / 2 - 0.04} smoothTime={0.6} />;
}

const STATUS_LABEL = { present: "Healthy", missing: "Missing", removed: "Removed", suspect: "Suspect" } as const;

function PlantCard({ tag, onClose }: { tag: number; onClose: () => void }) {
  const rp = rigLayout.plants.find((p) => p.tag_id === tag);
  const p = useTwin((s) => s.telemetry?.plants.find((x) => x.tag_id === tag));
  if (!rp) return null;
  const info = speciesInfo(rp.species);
  const status = p?.status ?? "missing";
  const lost = status === "missing" || status === "removed";
  const rows: [string, string][] = [
    ["Status", STATUS_LABEL[status]],
    ["Leaf area", p && !lost ? `${Math.round(p.leaf_area_cm2)} cm²` : "—"],
    ["Alive score", p && !lost ? p.alive_score.toFixed(2) : "—"],
    ["Plant match", p?.species_conf !== undefined && !lost ? `${Math.round(p.species_conf * 100)} %` : "—"],
    ["Earning", p ? `${p.rate_air_per_h.toFixed(3)} AIR/h` : "—"],
  ];
  return (
    <div className="overlay part-card">
      <button className="close" onClick={onClose} aria-label="Close">×</button>
      <div className="eyebrow">Tag #{tag} · slot {rp.slot + 1}</div>
      <h3><span className={`status-dot ${status}`} />{speciesName(rp.species)}</h3>
      {info && <p><i>{info.scientific_name}</i></p>}
      <div className="kv">{rows.map(([k, v]) => <Fragment key={k}><span>{k}</span><b>{v}</b></Fragment>)}</div>
    </div>
  );
}

export function MinerModel() {
  const telemetry = useTwin((s) => s.telemetry);
  const plant = useTwin((s) => s.selectedPlant);
  const selectPlant = useTwin((s) => s.selectPlant);
  const [view, setView] = useState<View>("rig");
  const [vision, setVision] = useState(true);
  const [part, setPart] = useState<string | undefined>();
  const downAt = useRef<[number, number]>([0, 0]);
  const def = PARTS.find((p) => p.id === part);

  useEffect(() => {
    const onKey = (e: KeyboardEvent) => {
      if (e.key === "Escape") {
        selectPlant(undefined);
        setPart(undefined);
      }
    };
    window.addEventListener("keydown", onKey);
    return () => window.removeEventListener("keydown", onKey);
  }, [selectPlant]);

  useEffect(() => {
    if (plant === undefined) return;
    setPart(undefined);
    setView("rig");
  }, [plant]);

  const go = (v: View) => {
    selectPlant(undefined);
    setPart(undefined);
    setView(v);
  };

  return (
    <div className="twin-stage">
      <Canvas
        shadows
        dpr={[1, 1.75]}
        camera={{ position: SHOTS.rig.pos.toArray(), fov: 38, near: 0.1, far: 140 }}
        onPointerDown={(e) => (downAt.current = [e.clientX, e.clientY])}
        onPointerMissed={(e) => {
          if (Math.hypot(e.clientX - downAt.current[0], e.clientY - downAt.current[1]) > 6) return;
          setPart(undefined);
          selectPlant(undefined);
        }}
      >
        <Atmosphere drive />
        <Studio />
        <Lights />
        <Floor />
        <Rig vision={vision && view === "rig" && plant === undefined} selected={plant} onSelect={(t) => { setPart(undefined); selectPlant(plant === t ? undefined : t); }} />
        <group position={MINER_POS} rotation={[0, MINER_ROT, 0]}>
          <Miner selected={part} onSelect={(id) => { selectPlant(undefined); setPart(id); setView("device"); }} />
        </group>
        <Tripod />
        <CameraRig view={view} focus={plant} />
      </Canvas>

      <div className="overlay twin-toolbar">
        <div className="seg">
          <button className={view === "rig" ? "active" : ""} onClick={() => go("rig")}>Rig</button>
          <button className={view === "device" ? "active" : ""} onClick={() => go("device")}>Device</button>
        </div>
        <button className={vision ? "active" : ""} onClick={() => setVision((v) => !v)}>Detections</button>
      </div>
      <div className="overlay twin-hud">
        <span className="hint">{plant !== undefined ? "Esc to go back" : view === "rig" ? "Click a plant · drag to orbit" : "Click a part for its readings"}</span>
      </div>

      {def && (
        <div className="overlay part-card">
          <button className="close" onClick={() => setPart(undefined)} aria-label="Close">×</button>
          <div className="eyebrow">{def.hardware}</div>
          <h3>{def.name}</h3>
          <p>{def.role}</p>
          <div className="kv">{def.readings(telemetry).map(([k, v]) => <Fragment key={k}><span>{k}</span><b>{v}</b></Fragment>)}</div>
        </div>
      )}
      {plant !== undefined && <PlantCard tag={plant} onClose={() => selectPlant(undefined)} />}
    </div>
  );
}
