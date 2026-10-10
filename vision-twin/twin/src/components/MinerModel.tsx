// Digital twin: the miner on its tripod watching the 20-plant rack, all driven live by C2/C4.
// Scene pieces live in ./twin3d; this file wires the canvas, camera, post-processing and overlays.
import { CameraControls, PerformanceMonitor } from "@react-three/drei";
import { Canvas, useFrame, useThree } from "@react-three/fiber";
import { Bloom, EffectComposer, N8AO, Outline, Selection, ToneMapping, Vignette } from "@react-three/postprocessing";
import { ToneMappingMode } from "postprocessing";
import { Fragment, useEffect, useMemo, useRef, useState } from "react";
import * as THREE from "three";
import { rigLayout } from "../config";
import { tamperPlant } from "../sources";
import { speciesInfo, speciesName } from "../species";
import { useTwin } from "../store";
import { CleanAir, Haze, MintCoins, VisionCone } from "./twin3d/Effects";
import { Miner, PARTS } from "./twin3d/Miner";
import { Rig, slotPosition } from "./twin3d/Rig";
import { Atmosphere, Floor, LENS_WORLD, Lights, MINER_POS, MINER_ROT, Studio, Tripod } from "./twin3d/Stage";

export { PARTS };

type View = "rig" | "device";
type Shot = View | "exploded";

const SHOTS: Record<Shot, { pos: THREE.Vector3; target: THREE.Vector3 }> = {
  rig: { pos: new THREE.Vector3(9.5, 8.8, 25), target: new THREE.Vector3(0, 6.1, 2) },
  device: { pos: MINER_POS.clone().add(new THREE.Vector3(-2.5, 1.35, -2.7)), target: MINER_POS.clone().add(new THREE.Vector3(0, 0.3, 0)) },
  exploded: { pos: MINER_POS.clone().add(new THREE.Vector3(-3.4, 2.4, -4.0)), target: MINER_POS.clone().add(new THREE.Vector3(0, 0.75, 0)) },
};

/** Camera presets + gentle idle motion. User input pauses the idle motion for a few seconds. */
function CameraRig({ shot, focus, spin }: { shot: Shot; focus?: number; spin: boolean }) {
  const ref = useRef<CameraControls>(null);
  const lastInput = useRef(-10);
  const base = useRef(0);
  const clock = useThree((s) => s.clock);
  useEffect(() => {
    const c = ref.current;
    if (!c) return;
    if (focus !== undefined) {
      const rp = rigLayout.plants.find((p) => p.tag_id === focus);
      if (rp) {
        const p = slotPosition(rp.slot);
        // three-quarter view from in front, far enough to keep the neighbours for context
        c.setLookAt(p.x + 2.2, p.y + 1.6, p.z + 7.2, p.x, p.y + 0.55, p.z, true);
        return;
      }
    }
    const v = SHOTS[shot];
    base.current = Math.atan2(v.pos.x - v.target.x, v.pos.z - v.target.z);
    c.setLookAt(v.pos.x, v.pos.y, v.pos.z, v.target.x, v.target.y, v.target.z, true);
  }, [shot, focus]);
  useEffect(() => {
    const c = ref.current;
    if (!c) return;
    const mark = () => (lastInput.current = clock.elapsedTime);
    c.addEventListener("controlstart", mark);
    c.addEventListener("control", mark);
    return () => {
      c.removeEventListener("controlstart", mark);
      c.removeEventListener("control", mark);
    };
  }, [clock]);
  useFrame(({ clock }, dt) => {
    const c = ref.current;
    if (!c || !spin || focus !== undefined || c.active) return;
    if (clock.elapsedTime - lastInput.current < 6) return;
    if (shot !== "rig") c.azimuthAngle += dt * 0.15;
    else c.azimuthAngle += (base.current + Math.sin(clock.elapsedTime * 0.1) * 0.35 - c.azimuthAngle) * Math.min(1, dt * 0.5);
  });
  return <CameraControls ref={ref} makeDefault minDistance={1.2} maxDistance={40} maxPolarAngle={Math.PI / 2 - 0.04} smoothTime={0.6} draggingSmoothTime={0.12} />;
}

function Scene({ view, exploded, vision, spin, part, plant, hq, onPart, onPlant }: {
  view: View; exploded: boolean; vision: boolean; spin: boolean; part?: string; plant?: number; hq: boolean;
  onPart: (id: string) => void; onPlant: (tag: number) => void;
}) {
  const coinOrigin = useMemo(() => MINER_POS.clone().add(new THREE.Vector3(0, 0.25, 0)), []);
  const focused = plant !== undefined;
  return (
    <>
      <Atmosphere drive />
      <Studio />
      <Lights />
      <Floor reflect={hq} />
      <Rig vision={vision && !focused && view === "rig"} selected={plant} onSelect={onPlant} />
      <group position={MINER_POS} rotation={[0, MINER_ROT, 0]}>
        <Miner exploded={exploded} selected={part} onSelect={onPart} />
      </group>
      <Tripod />
      <VisionCone lens={LENS_WORLD} visible={vision && view === "rig" && !focused} />
      <Haze />
      <CleanAir />
      <MintCoins origin={coinOrigin} />
      <CameraRig shot={view === "device" && exploded ? "exploded" : view} focus={plant} spin={spin} />
    </>
  );
}

const STATUS_LABEL = { present: "healthy", missing: "missing", removed: "removed", suspect: "suspect" } as const;

function PlantCard({ tag, onClose }: { tag: number; onClose: () => void }) {
  const rp = rigLayout.plants.find((p) => p.tag_id === tag);
  const p = useTwin((s) => s.telemetry?.plants.find((x) => x.tag_id === tag));
  const phys = useTwin((s) => s.physical[tag]);
  const isMock = useTwin((s) => s.source === "mock");
  if (!rp) return null;
  const info = speciesInfo(rp.species);
  const status = p?.status ?? "missing";
  const lost = status === "missing" || status === "removed";
  const rows: [string, string][] = [
    ["Detected", STATUS_LABEL[status]],
    ["Leaf area", p && !lost ? `${Math.round(p.leaf_area_cm2)} cm²` : "—"],
    ["Alive (NDVI)", p && !lost ? p.alive_score.toFixed(2) : "—"],
    ["Species match", p?.species_conf !== undefined && !lost ? `${Math.round(p.species_conf * 100)} %` : "—"],
    ["Removal rate", p ? `${p.rate_air_per_h.toFixed(3)} AIR/h` : "—"],
  ];
  return (
    <div className="overlay part-card plant-card">
      <button className="close" onClick={onClose} aria-label="Close">×</button>
      <div className="eyebrow">Tag #{tag} · slot {rp.slot + 1}</div>
      <h3><span className={`status-dot ${status}`} />{speciesName(rp.species)}</h3>
      {info && <p><i>{info.scientific_name}</i> · {info.main_targets}</p>}
      <div className="health"><div style={{ width: `${Math.round((lost ? 0 : p?.alive_score ?? 0) * 100)}%` }} className={status} /></div>
      <div className="kv">{rows.map(([k, v]) => <Fragment key={k}><span>{k}</span><b>{v}</b></Fragment>)}</div>
      {isMock && (
        <>
          <div className="eyebrow" style={{ marginTop: 12 }}>Demo · tamper with this pot</div>
          <div className="tamper">
            <button className={phys?.kind === "removed" ? "on" : ""} onClick={() => tamperPlant(tag, "removed")}>Remove pot</button>
            <button className={phys?.kind === "fake" ? "on" : ""} onClick={() => tamperPlant(tag, "fake")}>Plastic plant</button>
            <button className={phys?.kind === "swap" ? "on" : ""} onClick={() => tamperPlant(tag, "swap")}>Swap plant</button>
            <button className="restore" disabled={!phys} onClick={() => tamperPlant(tag, undefined)}>Restore</button>
          </div>
        </>
      )}
    </div>
  );
}

export function MinerModel() {
  const telemetry = useTwin((s) => s.telemetry);
  const plant = useTwin((s) => s.selectedPlant);
  const selectPlant = useTwin((s) => s.selectPlant);
  const [view, setView] = useState<View>("rig");
  const [exploded, setExploded] = useState(false);
  const [vision, setVision] = useState(true);
  const [spin, setSpin] = useState(true);
  const [hq, setHq] = useState(true);
  const [part, setPart] = useState<string | undefined>();
  const def = PARTS.find((p) => p.id === part);
  const downAt = useRef<[number, number]>([0, 0]);

  useEffect(() => {
    const onKey = (e: KeyboardEvent) => {
      if (e.key !== "Escape") return;
      if (plant !== undefined || part) { selectPlant(undefined); setPart(undefined); }
    };
    window.addEventListener("keydown", onKey);
    return () => window.removeEventListener("keydown", onKey);
  }, [plant, part, selectPlant]);

  // a plant picked elsewhere (grid, camera) brings the twin back to the rig
  useEffect(() => {
    if (plant === undefined) return;
    setPart(undefined);
    setExploded(false);
    setView("rig");
  }, [plant]);

  const selectPart = (id: string) => {
    selectPlant(undefined);
    setPart(id);
    if (view !== "device") setView("device");
  };
  const onPlant = (tag: number) => {
    setPart(undefined);
    selectPlant(plant === tag ? undefined : tag);
  };
  const go = (v: View) => {
    selectPlant(undefined);
    setPart(undefined);
    if (v === "rig") setExploded(false);
    setView(v);
  };

  return (
    <div className="twin-stage">
      <Canvas
        shadows="soft"
        flat
        dpr={hq ? [1, 1.75] : 1}
        gl={{ antialias: false, powerPreference: "high-performance", stencil: false }}
        camera={{ position: SHOTS.rig.pos.toArray(), fov: 38, near: 0.1, far: 140 }}
        onPointerDown={(e) => (downAt.current = [e.clientX, e.clientY])}
        onPointerMissed={(e) => {
          // only a real click on empty space clears the selection, never the end of a drag
          if (Math.hypot(e.clientX - downAt.current[0], e.clientY - downAt.current[1]) > 6) return;
          setPart(undefined);
          selectPlant(undefined);
        }}
      >
        <PerformanceMonitor onDecline={() => setHq(false)} />
        <Selection>
          <Scene view={view} exploded={exploded} vision={vision} spin={spin} part={part} plant={plant} hq={hq} onPart={selectPart} onPlant={onPlant} />
          <EffectComposer multisampling={hq ? 4 : 0} enableNormalPass={false}>
            {/* depthAwareUpsampling produces NaN pixels at close range, which bloom then smears over the whole frame */}
            <N8AO halfRes depthAwareUpsampling={false} aoRadius={0.7} intensity={hq ? 2.2 : 0} distanceFalloff={0.8} quality="performance" />
            <Outline blur visibleEdgeColor={0xebe8df} hiddenEdgeColor={0x4a5046} edgeStrength={5} width={1200} />
            <Bloom mipmapBlur luminanceThreshold={1.15} luminanceSmoothing={0.2} intensity={0.85} radius={0.72} />
            <Vignette offset={0.25} darkness={0.65} />
            <ToneMapping mode={ToneMappingMode.AGX} />
          </EffectComposer>
        </Selection>
      </Canvas>

      <div className="overlay twin-toolbar">
        <div className="seg">
          <button className={view === "rig" ? "active" : ""} onClick={() => go("rig")}>Rig</button>
          <button className={view === "device" ? "active" : ""} onClick={() => go("device")}>Device</button>
        </div>
        <button className={`toggle ${exploded ? "on" : ""}`} onClick={() => { setExploded((e) => !e); if (view !== "device") setView("device"); selectPlant(undefined); }}>Explode</button>
        <button className={`toggle ${vision ? "on" : ""}`} onClick={() => setVision((v) => !v)}>Vision</button>
        <button className={`toggle ${spin ? "on" : ""}`} onClick={() => setSpin((s) => !s)}>Orbit</button>
      </div>
      <div className="overlay twin-hud">
        <span className="hint">{plant !== undefined ? "Esc or click empty space to go back" : view === "rig" ? "Click a plant · drag to orbit · scroll to zoom" : "Click a part for live readings"}</span>
      </div>

      {def && (
        <div className="overlay part-card">
          <button className="close" onClick={() => setPart(undefined)} aria-label="Close">×</button>
          <div className="eyebrow">{def.hardware}</div>
          <h3>{def.name}</h3>
          <p>{def.role}</p>
          <div className="kv">
            {def.readings(telemetry).map(([k, v]) => (
              <Fragment key={k}><span>{k}</span><b>{v}</b></Fragment>
            ))}
          </div>
        </div>
      )}
      {plant !== undefined && <PlantCard tag={plant} onClose={() => selectPlant(undefined)} />}
    </div>
  );
}
