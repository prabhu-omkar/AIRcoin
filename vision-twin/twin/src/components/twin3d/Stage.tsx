// Shared scene setup used by both the twin canvas and the miner camera canvas, so they show the same world.
import { Environment, Lightformer, MeshReflectorMaterial, RoundedBox } from "@react-three/drei";
import { useFrame, useThree } from "@react-three/fiber";
import { useEffect, useMemo } from "react";
import * as THREE from "three";
import { useTwin } from "../../store";
import { sharedTime } from "./materials";
import { LENS_LOCAL } from "./Miner";
import { RACK_H } from "./Rig";

/** Miner on its tripod, ~1.05 m from the rack, lens at the rack's mid height. */
export const MINER_POS = new THREE.Vector3(0, RACK_H / 2 - LENS_LOCAL.y, 10.6);
export const MINER_ROT = Math.PI; // local +z (camera) faces the rack at -z
export const LENS_WORLD = LENS_LOCAL.clone().applyAxisAngle(new THREE.Vector3(0, 1, 0), MINER_ROT).add(MINER_POS);
/** Pi Camera Module 3 Wide: 102° horizontal, 67° vertical. */
export const CAMERA_VFOV = 67;
export const CAMERA_ASPECT = 2304 / 1296;

const FOG_CLEAN = new THREE.Color("#0a1210");
const FOG_SMOG = new THREE.Color("#2a2117");

/** AQI-driven fog/background. The main canvas also advances the shared shader clock (`drive`). */
export function Atmosphere({ drive = false, background }: { drive?: boolean; background?: string }) {
  const aqi = useTwin((s) => s.telemetry?.aqi ?? 120);
  const { scene } = useThree();
  const fog = useMemo(() => new THREE.FogExp2(FOG_CLEAN.clone(), 0.02), []);
  const bg = useMemo(() => FOG_CLEAN.clone(), []);
  const tmp = useMemo(() => new THREE.Color(), []);
  useEffect(() => {
    scene.fog = fog;
    scene.background = bg;
    return () => {
      scene.fog = null;
      scene.background = null;
    };
  }, [scene, fog, bg]);
  useFrame((_, dt) => {
    if (drive) sharedTime.value += Math.min(dt, 0.1);
    const lv = THREE.MathUtils.clamp(aqi / 420, 0, 1);
    if (background) tmp.set(background);
    else tmp.copy(FOG_CLEAN).lerp(FOG_SMOG, lv);
    const k = background ? 1 : Math.min(1, dt * 0.8);
    fog.color.lerp(tmp, k);
    bg.lerp(tmp, k);
    fog.density += (0.012 + lv * 0.028 - fog.density) * Math.min(1, dt * 0.8);
  });
  return null;
}

export function Tripod() {
  const mat = useMemo(() => new THREE.MeshStandardMaterial({ color: "#16191b", metalness: 0.75, roughness: 0.35 }), []);
  const head = MINER_POS.y - 0.45;
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

export function Floor({ reflect }: { reflect: boolean }) {
  return (
    <mesh rotation={[-Math.PI / 2, 0, 0]} position={[0, 0, 5]} receiveShadow>
      <planeGeometry args={[90, 90]} />
      {reflect ? (
        <MeshReflectorMaterial blur={[400, 120]} resolution={512} mixBlur={1} mixStrength={6} roughness={0.85} depthScale={1.1} minDepthThreshold={0.4} maxDepthThreshold={1.3} color="#0e1513" metalness={0.55} mirror={0} />
      ) : (
        <meshStandardMaterial color="#111816" roughness={0.75} metalness={0.25} />
      )}
    </mesh>
  );
}

export function Lights({ shadowSize = 2048 }: { shadowSize?: number }) {
  return (
    <>
      <hemisphereLight args={["#d8efe4", "#0b120f", 0.35]} />
      <directionalLight
        position={[9, 16, 16]}
        intensity={2.4}
        color="#fff4e6"
        castShadow
        shadow-mapSize={[shadowSize, shadowSize]}
        shadow-bias={-0.0003}
        shadow-normalBias={0.03}
        shadow-camera-left={-10}
        shadow-camera-right={10}
        shadow-camera-top={14}
        shadow-camera-bottom={-3}
        shadow-camera-near={1}
        shadow-camera-far={50}
      />
      <directionalLight position={[-10, 6, -6]} intensity={0.9} color="#7fe0c0" />
      <spotLight position={[0, 13, 14]} angle={0.5} penumbra={0.8} intensity={60} distance={32} color="#e8fff4" />
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
      <Lightformer form="rect" intensity={0.6} position={[0, 2, -8]} scale={[20, 4, 1]} color="#a6d17e" />
    </Environment>
  );
}
