// Digital twin: the miner on its tripod watching the 20-plant rack, driven live by C2.
import { CameraControls } from "@react-three/drei";
import { Canvas, useFrame } from "@react-three/fiber";
import { Fragment, useEffect, useRef, useState } from "react";
import * as THREE from "three";
import { rigLayout } from "../config";
import { speciesInfo, speciesName } from "../species";
import { STATUS_LABEL, STATUS_NOTE } from "../ui";
import { useTwin } from "../store";
import { Miner, PARTS } from "./twin3d/Miner";
import { Rig, slotPosition } from "./twin3d/Rig";
import { Atmosphere, Floor, Lights, MINER_POS, MINER_ROT, Studio, Tripod } from "./twin3d/Stage";
import { AirParticles, MintStream, ScanSweep, SkyDome, Skyline, Terrace } from "./twin3d/World";

type View = "rig" | "device";

const SHOTS: Record<View, { pos: THREE.Vector3; target: THREE.Vector3 }> = {
  rig: { pos: new THREE.Vector3(10.8, 8.5, 27), target: new THREE.Vector3(0, 5.3, 1.6) },
  device: { pos: MINER_POS.clone().add(new THREE.Vector3(-3.4, 1.9, -3.9)), target: MINER_POS.clone().add(new THREE.Vector3(0, 0, 0)) },
};

const INTRO = { pos: new THREE.Vector3(-26, 22, 46), target: new THREE.Vector3(0, 6, -2) };

/**
 * Camera director: a one-time fly-in when the twin loads, smooth moves between views, and a slow
 * drift around the rig when nobody has touched the controls for a while.
 */
function CameraRig({ view, focus, enabled = true }: { view: View; focus?: number; enabled?: boolean }) {
  const ref = useRef<CameraControls>(null);
  const lastTouch = useRef(0);
  const idle = useRef<{ base: number; since: number } | null>(null);
  const introDone = useRef(false);

  useEffect(() => {
    const c = ref.current;
    if (!c) return;
    const touch = () => { lastTouch.current = performance.now(); idle.current = null; };
    c.addEventListener("controlstart", touch);
    return () => c.removeEventListener("controlstart", touch);
  }, []);

  useEffect(() => {
    const c = ref.current;
    if (!c) return;
    idle.current = null;
    lastTouch.current = performance.now();
    const rp = focus !== undefined ? rigLayout.plants.find((p) => p.tag_id === focus) : undefined;
    if (rp) {
      const p = slotPosition(rp.slot);
      c.smoothTime = 0.6;
      c.setLookAt(p.x + 2.2, p.y + 1.6, p.z + 7.2, p.x, p.y + 0.55, p.z, true);
      return;
    }
    const v = SHOTS[view];
    if (!introDone.current) {
      introDone.current = true;
      c.setLookAt(INTRO.pos.x, INTRO.pos.y, INTRO.pos.z, INTRO.target.x, INTRO.target.y, INTRO.target.z, false);
      c.smoothTime = 1.6;
      const id = setTimeout(() => {
        c.setLookAt(v.pos.x, v.pos.y, v.pos.z, v.target.x, v.target.y, v.target.z, true);
        setTimeout(() => (c.smoothTime = 0.6), 2600);
      }, 250);
      return () => clearTimeout(id);
    }
    c.smoothTime = 0.6;
    c.setLookAt(v.pos.x, v.pos.y, v.pos.z, v.target.x, v.target.y, v.target.z, true);
  }, [view, focus]);

  useFrame(({ clock }) => {
    const c = ref.current;
    if (!c || !enabled || focus !== undefined || view !== "rig") return;
    if (performance.now() - lastTouch.current < 9000) return;
    if (!idle.current) idle.current = { base: c.azimuthAngle, since: clock.elapsedTime };
    const t = clock.elapsedTime - idle.current.since;
    const ease = Math.min(1, t / 6);
    c.rotateAzimuthTo(idle.current.base + Math.sin(t * 0.11) * 0.2 * ease, false);
  });

  return <CameraControls ref={ref} makeDefault enabled={enabled} minDistance={1.2} maxDistance={60} maxPolarAngle={Math.PI / 2 - 0.04} smoothTime={0.6} />;
}

function PlantCard({ tag, onClose }: { tag: number; onClose: () => void }) {
  const rp = rigLayout.plants.find((p) => p.tag_id === tag);
  const p = useTwin((s) => s.telemetry?.plants.find((x) => x.tag_id === tag));
  if (!rp) return null;
  const info = speciesInfo(rp.species);
  const status = p?.status ?? "missing";
  const lost = status === "missing" || status === "removed";
  const alive = p && !lost ? p.alive_score : 0;
  const rows: [string, string][] = [
    ["Leaf area", p && !lost ? `${Math.round(p.leaf_area_cm2)} cm²` : "–"],
    ["Matches enrolment", p?.species_conf !== undefined && !lost ? `${Math.round(p.species_conf * 100)}%` : "–"],
    ["Earning", p ? `${p.rate_air_per_h.toFixed(3)} AIR/h` : "–"],
  ];
  return (
    <aside className="overlay inspector" aria-label={`Plant ${tag}`}>
      <button className="icon-btn close" onClick={onClose} aria-label="Close">×</button>
      <p className="inspector-kicker">Tag {tag}, slot {rp.slot + 1}</p>
      <h3>{speciesName(rp.species)}</h3>
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
    </aside>
  );
}

export function MinerModel() {
  const telemetry = useTwin((s) => s.telemetry);
  const plant = useTwin((s) => s.selectedPlant);
  const selectPlant = useTwin((s) => s.selectPlant);
  const [view, setView] = useState<View>("rig");
  const [part, setPart] = useState<string | undefined>();
  const [dragging, setDragging] = useState(false);
  const [deviceHover, setDeviceHover] = useState(false);
  const downAt = useRef<[number, number]>([0, 0]);
  const def = PARTS.find((p) => p.id === part);

  useEffect(() => {
    const onKey = (e: KeyboardEvent) => {
      if (e.key === "Escape") {
        selectPlant(undefined);
        setPart(undefined);
        setDeviceHover(false);
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
    setDeviceHover(false);
    setView(v);
  };

  return (
    <div className="twin-stage">
      <Canvas
        shadows="soft"
        dpr={[1, 1.75]}
        camera={{ position: INTRO.pos.toArray(), fov: 38, near: 0.1, far: 300 }}
        gl={{ toneMapping: THREE.ACESFilmicToneMapping, toneMappingExposure: 1.05 }}
        onPointerDown={(e) => (downAt.current = [e.clientX, e.clientY])}
        onPointerMissed={(e) => {
          if (Math.hypot(e.clientX - downAt.current[0], e.clientY - downAt.current[1]) > 6) return;
          setPart(undefined);
          selectPlant(undefined);
        }}
      >
        <Atmosphere drive />
        <SkyDome />
        <Studio />
        <Lights />
        <Floor />
        <Skyline />
        <Terrace />
        <AirParticles />
        <ScanSweep visible={view === "rig" && plant === undefined && !dragging} />
        <MintStream />
        <Rig interactive={view === "rig"} onDragChange={setDragging} vision={view === "rig" && plant === undefined} selected={plant} onSelect={(t) => { setPart(undefined); selectPlant(plant === t ? undefined : t); }} />
        <group position={MINER_POS} rotation={[0, MINER_ROT, 0]}>
          <Miner
            exploded={view === "device"}
            selected={part}
            onSelect={(id) => { selectPlant(undefined); setPart(id); setView("device"); }}
            onExplode={() => go("device")}
            onDeviceHoverChange={setDeviceHover}
          />
        </group>
        <Tripod />
        <CameraRig view={view} focus={plant} enabled={!dragging} />
      </Canvas>

      <div className="overlay view-dock">
        <div className="seg" role="tablist" aria-label="Twin view">
          <button role="tab" aria-selected={view === "rig"} className={view === "rig" ? "active" : ""} onClick={() => go("rig")}>Plant rig</button>
          <button role="tab" aria-selected={view === "device"} className={view === "device" ? "active" : ""} onClick={() => go("device")}>Inside the miner</button>
        </div>
        <span className="hint">
          {deviceHover && view === "rig"
            ? "Click the miner to open it up"
            : dragging
            ? "Release to drop the pot"
            : plant !== undefined
            ? "Esc to go back"
            : view === "rig"
            ? "Drag a pot off the rack, or drop the fake plant into a slot"
            : "Click a part to see its live reading"}
        </span>
      </div>

      {def && (
        <aside className="overlay inspector" aria-label={def.name}>
          <button className="icon-btn close" onClick={() => setPart(undefined)} aria-label="Close">×</button>
          <p className="inspector-kicker">{def.hardware}</p>
          <h3>{def.name}</h3>
          <p className="inspector-sub">{def.role}</p>
          <div className="kv">{def.readings(telemetry).map(([k, v]) => <Fragment key={k}><span>{k}</span><b>{v}</b></Fragment>)}</div>
        </aside>
      )}
      {plant !== undefined && <PlantCard tag={plant} onClose={() => selectPlant(undefined)} />}
    </div>
  );
}
