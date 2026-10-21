// Shared scene setup used by both the twin canvas and the miner camera canvas, so they show the same world.
import { Environment, Lightformer, RoundedBox } from "@react-three/drei";
import { useFrame, useThree } from "@react-three/fiber";
import { useEffect, useMemo, useRef } from "react";
import * as THREE from "three";
import { useTwin } from "../../store";
import { airState, sharedTime, SKY } from "./materials";
import { LENS_LOCAL, MINER_BOTTOM } from "./Miner";
import { RACK_H } from "./Rig";

/** Miner on its tripod, ~1.05 m from the rack, lens at the rack's mid height. */
export const MINER_POS = new THREE.Vector3(0, RACK_H / 2 - LENS_LOCAL.y, 10.6);
export const MINER_ROT = Math.PI; // local +z (camera) faces the rack at -z
export const LENS_WORLD = LENS_LOCAL.clone().applyAxisAngle(new THREE.Vector3(0, 1, 0), MINER_ROT).add(MINER_POS);
/** Pi Camera Module 3 Wide: 102° horizontal, 67° vertical. */
export const CAMERA_VFOV = 67;
export const CAMERA_ASPECT = 2304 / 1296;

/**
 * Background and depth fog, tied to the live AQI: clean air keeps the rooftop crisp and blue, smog
 * thickens the haze and turns it the brown-gold of a Delhi winter afternoon. Also publishes the eased
 * pollution level (airState.k) for the sky, sun and particles. The main canvas advances the shader clock.
 */
export function Atmosphere({ drive = false }: { drive?: boolean }) {
  const { scene } = useThree();
  const state = useMemo(() => ({ bg: SKY.horizonClean.clone(), fog: new THREE.FogExp2(SKY.horizonClean.clone(), 0.008) }), []);
  useEffect(() => {
    scene.fog = state.fog;
    scene.background = state.bg;
    return () => {
      scene.fog = null;
      scene.background = null;
    };
  }, [scene, state]);
  useFrame((_, dt) => {
    if (drive) sharedTime.value += Math.min(dt, 0.1);
    const aqi = useTwin.getState().telemetry?.aqi ?? 0;
    const target = Math.max(0, Math.min(1, (aqi - 40) / 360));
    if (drive) airState.k += (target - airState.k) * Math.min(1, dt * 0.6);
    const k = airState.k;
    state.fog.color.copy(SKY.horizonClean).lerp(SKY.horizonSmog, k);
    state.bg.copy(state.fog.color);
    state.fog.density = 0.006 + k * 0.016;
  });
  return null;
}

export function Tripod() {
  const mat = useMemo(() => new THREE.MeshStandardMaterial({ color: "#16191b", metalness: 0.75, roughness: 0.35 }), []);
  const head = MINER_POS.y - MINER_BOTTOM - 0.2;
  const hub = 2.6;
  const legs = useMemo(() => [0, 1, 2].map((i) => {
    const a = (i / 3) * Math.PI * 2 + 0.3;
    const foot = new THREE.Vector3(MINER_POS.x + Math.cos(a) * 1.8, 0, MINER_POS.z + Math.sin(a) * 1.8);
    const top = new THREE.Vector3(MINER_POS.x + Math.cos(a) * 0.12, hub, MINER_POS.z + Math.sin(a) * 0.12);
    const q = new THREE.Quaternion().setFromUnitVectors(new THREE.Vector3(0, 1, 0), top.clone().sub(foot).normalize());
    return { mid: top.clone().lerp(foot, 0.5), len: top.distanceTo(foot), q, foot };
  }), []);
  return (
    <group>
      <mesh position={[MINER_POS.x, (head + hub) / 2, MINER_POS.z]} material={mat} castShadow>
        <cylinderGeometry args={[0.06, 0.07, head - hub, 16]} />
      </mesh>
      <mesh position={[MINER_POS.x, head + 0.02, MINER_POS.z]} material={mat} castShadow>
        <sphereGeometry args={[0.14, 24, 16]} />
      </mesh>
      <RoundedBox args={[0.5, 0.08, 0.5]} radius={0.02} position={[MINER_POS.x, head + 0.16, MINER_POS.z]} material={mat} castShadow />
      <mesh position={[MINER_POS.x, hub, MINER_POS.z]} material={mat} castShadow>
        <cylinderGeometry args={[0.16, 0.16, 0.18, 16]} />
      </mesh>
      {legs.map((l, i) => (
        <group key={i}>
          <mesh position={l.mid} quaternion={l.q} material={mat} castShadow>
            <cylinderGeometry args={[0.045, 0.06, l.len, 12]} />
          </mesh>
          <mesh position={[l.foot.x, 0.03, l.foot.z]} castShadow>
            <sphereGeometry args={[0.08, 12, 8]} />
            <meshStandardMaterial color="#0d0d0d" roughness={0.9} />
          </mesh>
        </group>
      ))}
    </group>
  );
}

/** Rooftop terrace: square tiles with grout, the way Delhi terraces are laid. */
export function Floor() {
  const map = useMemo(() => terraceTexture(), []);
  return (
    <mesh rotation={[-Math.PI / 2, 0, 0]} position={[0, 0, 5]} receiveShadow>
      <planeGeometry args={[220, 220]} />
      <meshStandardMaterial map={map} color="#d9d0c1" roughness={0.88} />
    </mesh>
  );
}

function terraceTexture() {
  const c = document.createElement("canvas");
  c.width = c.height = 256;
  const g = c.getContext("2d")!;
  g.fillStyle = "#ece6da";
  g.fillRect(0, 0, 256, 256);
  for (let i = 0; i < 1400; i++) {
    g.fillStyle = `rgba(${120 + Math.random() * 60},${110 + Math.random() * 50},${90 + Math.random() * 40},${Math.random() * 0.08})`;
    g.fillRect(Math.random() * 256, Math.random() * 256, 2 + Math.random() * 3, 2 + Math.random() * 3);
  }
  g.strokeStyle = "rgba(120,104,84,0.55)";
  g.lineWidth = 3;
  g.strokeRect(0, 0, 256, 256);
  const t = new THREE.CanvasTexture(c);
  t.wrapS = t.wrapT = THREE.RepeatWrapping;
  t.repeat.set(36, 36);
  t.anisotropy = 8;
  t.colorSpace = THREE.SRGBColorSpace;
  return t;
}

/** Low golden-hour sun from the back left (rim light through the leaves) plus sky fill; dims and reddens in smog. */
export function Lights({ shadowSize = 2048 }: { shadowSize?: number }) {
  const sun = useRef<THREE.DirectionalLight>(null);
  const hemi = useRef<THREE.HemisphereLight>(null);
  useFrame(() => {
    const k = airState.k;
    if (sun.current) {
      sun.current.color.copy(SKY.sunClean).lerp(SKY.sunSmog, k);
      sun.current.intensity = 2.6 - k * 1.2;
    }
    if (hemi.current) {
      hemi.current.color.copy(SKY.zenithClean).lerp(SKY.zenithSmog, k).lerp(new THREE.Color("#ffffff"), 0.55);
    }
  });
  return (
    <>
      <hemisphereLight ref={hemi} args={["#ffffff", "#c9bba4", 0.85]} />
      <directionalLight
        ref={sun}
        position={[-14, 15, -10]}
        intensity={2.6}
        castShadow
        shadow-mapSize={[shadowSize, shadowSize]}
        shadow-bias={-0.0003}
        shadow-normalBias={0.03}
        shadow-camera-left={-16}
        shadow-camera-right={16}
        shadow-camera-top={18}
        shadow-camera-bottom={-6}
        shadow-camera-near={1}
        shadow-camera-far={60}
      />
      <directionalLight position={[9, 12, 18]} intensity={1.15} color="#fff8ef" />
      <spotLight position={[0, 13, 14]} angle={0.5} penumbra={0.8} intensity={40} distance={32} color="#fff4e2" />
      <pointLight position={[MINER_POS.x - 1.5, MINER_POS.y + 1.5, MINER_POS.z + 1.5]} intensity={4} distance={6} color="#cfe" />
    </>
  );
}

export function Studio() {
  return (
    <Environment resolution={256} frames={1}>
      <Lightformer form="rect" intensity={2.5} position={[0, 8, 4]} rotation-x={Math.PI / 2} scale={[14, 6, 1]} />
      <Lightformer form="rect" intensity={1.6} position={[-9, 3, 4]} rotation-y={Math.PI / 2} scale={[12, 2, 1]} color="#bff5e0" />
      <Lightformer form="rect" intensity={1.2} position={[9, 3, 6]} rotation-y={-Math.PI / 2} scale={[12, 2, 1]} />
      <Lightformer form="ring" intensity={2} position={[4, 4, 14]} scale={3} color="#e8fff6" />
          </Environment>
  );
}
