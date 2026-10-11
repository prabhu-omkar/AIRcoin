// The miner device, modelled at real scale (1 unit = 10 cm) from procedural geometry.
// Local +z is the camera's viewing direction. When the Blender glTF is ready, a part's body
// can be swapped for its .glb node; PARTS (ids, positions, readings) stay the same.
import { Html, RoundedBox } from "@react-three/drei";
import { useFrame, type ThreeEvent } from "@react-three/fiber";
import { useEffect, useMemo, useRef, useState, type ReactNode } from "react";
import * as THREE from "three";
import type { Telemetry } from "../../contracts";
import { useTwin } from "../../store";
import { labelTexture, meshCapTexture, noiseTexture, pcbTexture, pmsTexture } from "./textures";

type Vec3 = [number, number, number];

export interface PartDef {
  id: string;
  name: string;
  hardware: string;
  role: string;
  pos: Vec3; // assembled, miner-local
  exploded: Vec3; // offset in the exploded view
  readings: (t?: Telemetry) => [string, string][];
}

const fmt = (v: number | undefined, d = 1, unit = "") => (v === undefined ? "—" : `${v.toFixed(d)}${unit}`);

export const PARTS: PartDef[] = [
  {
    id: "pi", name: "Raspberry Pi", hardware: "Raspberry Pi 4 (4 GB)", role: "Runs vision, estimation and signing",
    pos: [-0.42, -0.56, -0.18], exploded: [0, 0.75, -0.15],
    readings: (t) => [["CPU temp", fmt(t?.device?.cpu_temp_c, 1, " °C")], ["CPU", fmt(t?.device?.cpu_pct, 0, " %")], ["Memory", fmt(t?.device?.mem_pct, 0, " %")], ["Uplink", t?.uplink?.online === false ? "offline" : t ? "online" : "—"]],
  },
  {
    id: "camera", name: "Camera", hardware: "Pi Camera Module 3 NoIR Wide, blue gel filter", role: "Reads stickers, sizes plants, NDVI liveness",
    pos: [0, 0.12, 0.5], exploded: [0, 0.3, -0.1],
    readings: (t) => {
      const seen = t?.plants.filter((p) => p.status === "present" || p.status === "suspect").length;
      return [["Plants seen", t ? `${seen}/${t.plants.length}` : "—"], ["Suspect", t ? String(t.plants.filter((p) => p.status === "suspect").length) : "—"]];
    },
  },
  {
    id: "gps", name: "GPS", hardware: "u-blox NEO-6M with patch antenna", role: "Location for anti-cheat and local AQI",
    pos: [-0.55, 0.6, -0.15], exploded: [0, 1.25, 0],
    readings: (t) => [["Fix", t?.gps.fix ?? "—"], ["Satellites", t?.gps.satellites !== undefined ? String(t.gps.satellites) : "—"], ["Lat, lon", t ? `${t.gps.lat.toFixed(5)}, ${t.gps.lon.toFixed(5)}` : "—"]],
  },
  {
    id: "pms", name: "Particulate sensor", hardware: "Plantower PMS5003", role: "PM2.5 / PM10",
    pos: [0.68, -0.53, -0.28], exploded: [0.15, 0.9, -0.1],
    readings: (t) => [["PM2.5", fmt(t?.sensors.pm25_ugm3, 0, " µg/m³")], ["PM10", fmt(t?.sensors.pm10_ugm3, 0, " µg/m³")], ["AQI", fmt(t?.aqi, 0)]],
  },
  {
    id: "mq135", name: "Gas / VOC sensor", hardware: "MQ-135", role: "VOCs and NO₂",
    pos: [0.62, -0.645, 0.32], exploded: [0.15, 0.85, 0.15],
    readings: (t) => [["VOC index", fmt(t?.sensors.voc_index, 0)], ["NO₂", fmt(t?.sensors.no2_ppb, 0, " ppb")], ["CO", fmt(t?.sensors.co_ppm, 2, " ppm")]],
  },
  {
    id: "scd40", name: "CO₂ sensor", hardware: "Sensirion SCD40", role: "CO₂",
    pos: [0.2, -0.645, 0.36], exploded: [0, 0.7, 0.15],
    readings: (t) => [["CO₂", fmt(t?.sensors.co2_ppm, 0, " ppm")]],
  },
  {
    id: "bme280", name: "Climate sensor", hardware: "Bosch BME280", role: "Temperature, humidity, pressure",
    pos: [0.3, -0.645, 0.02], exploded: [0, 0.6, 0],
    readings: (t) => [["Temp", fmt(t?.sensors.temp_c, 1, " °C")], ["Humidity", fmt(t?.sensors.humidity_pct, 0, " %")], ["Pressure", fmt(t?.sensors.pressure_hpa, 0, " hPa")]],
  },
];

// ---------- materials ----------
let M: ReturnType<typeof makeMaterials> | undefined;
function makeMaterials() {
  const std = (p: THREE.MeshStandardMaterialParameters) => new THREE.MeshStandardMaterial(p);
  const brushed = noiseTexture("brushed", "#d0d4d8", 0.035, true);
  return {
    silver: std({ color: "#c9ced3", metalness: 0.95, roughness: 0.28, map: brushed }),
    alu: std({ color: "#aeb4ba", metalness: 0.9, roughness: 0.38, map: brushed }),
    darkMetal: std({ color: "#3a3f44", metalness: 0.85, roughness: 0.4 }),
    gold: std({ color: "#d8b45a", metalness: 1, roughness: 0.25 }),
    brass: std({ color: "#c49a4a", metalness: 1, roughness: 0.35 }),
    black: std({ color: "#121314", roughness: 0.55 }),
    blackGloss: std({ color: "#0c0d0e", roughness: 0.18, metalness: 0.2 }),
    white: std({ color: "#ecebe6", roughness: 0.5 }),
    usbBlue: std({ color: "#1d5fd1", roughness: 0.45 }),
    bakelite: std({ color: "#8a4b22", roughness: 0.6 }),
    ceramic: std({ color: "#d9c79c", roughness: 0.7 }),
    housing: std({ color: "#1d2321", roughness: 0.5, metalness: 0.15, map: noiseTexture("housing", "#c4c8c6", 0.06) }),
    rubber: std({ color: "#0e0f10", roughness: 0.95 }),
    glass: new THREE.MeshPhysicalMaterial({ color: "#05070a", metalness: 0.2, roughness: 0.02, clearcoat: 1, clearcoatRoughness: 0.02, reflectivity: 1 }),
    gel: new THREE.MeshPhysicalMaterial({ color: "#2b55ff", transparent: true, opacity: 0.55, roughness: 0.05, clearcoat: 1, emissive: new THREE.Color("#1b3cff"), emissiveIntensity: 0.4 }),
    ribbon: std({ color: "#f0ede4", roughness: 0.4, side: THREE.DoubleSide }),
    pcbEdge: std({ color: "#c8b273", roughness: 0.6 }),
  };
}
function mats() {
  if (!M) M = makeMaterials();
  return M;
}

function pcbMaterials(key: string, mask: string, trace: string, w: number, d: number, label?: string, sub?: string) {
  const top = new THREE.MeshStandardMaterial({ map: pcbTexture({ key, mask, trace, label, sub, aspect: w / d, seed: key.length * 13 }), roughness: 0.38, metalness: 0.1 });
  const side = new THREE.MeshStandardMaterial({ color: new THREE.Color(mask).multiplyScalar(0.7), roughness: 0.6 });
  return [side, side, top, side, side, side];
}

function Pcb({ size, mask, trace, label, sub, k }: { size: Vec3; mask: string; trace: string; label?: string; sub?: string; k: string }) {
  // eslint-disable-next-line react-hooks/exhaustive-deps
  const m = useMemo(() => pcbMaterials(k, mask, trace, size[0], size[2], label, sub), [k]);
  return (
    <mesh material={m} castShadow receiveShadow>
      <boxGeometry args={size} />
    </mesh>
  );
}

function Box({ pos, size, m, rot }: { pos: Vec3; size: Vec3; m: THREE.Material; rot?: Vec3 }) {
  return (
    <mesh position={pos} rotation={rot} material={m} castShadow receiveShadow>
      <boxGeometry args={size} />
    </mesh>
  );
}

function Cyl({ pos, r, h, m, rot, seg = 24 }: { pos: Vec3; r: number; h: number; m: THREE.Material; rot?: Vec3; seg?: number }) {
  return (
    <mesh position={pos} rotation={rot} material={m} castShadow receiveShadow>
      <cylinderGeometry args={[r, r, h, seg]} />
    </mesh>
  );
}

function Led({ pos, color, blink, size = 0.018 }: { pos: Vec3; color: string; blink?: (t: number) => number; size?: number }) {
  const mat = useMemo(() => new THREE.MeshStandardMaterial({ color: "#111", emissive: new THREE.Color(color), emissiveIntensity: 4, toneMapped: false }), [color]);
  useFrame(({ clock }) => {
    if (blink) mat.emissiveIntensity = 0.2 + 5 * blink(clock.elapsedTime);
  });
  return (
    <mesh position={pos} material={mat}>
      <boxGeometry args={[size, size * 0.5, size * 0.7]} />
    </mesh>
  );
}

/** 2 x 20 GPIO header with gold pins. */
function GpioHeader({ pos }: { pos: Vec3 }) {
  const m = mats();
  const ref = useRef<THREE.InstancedMesh>(null);
  useEffect(() => {
    const o = new THREE.Object3D();
    for (let i = 0; i < 40; i++) {
      o.position.set(-0.24 + (i >> 1) * 0.0254, 0.045, (i & 1) * 0.0254 - 0.0127);
      o.updateMatrix();
      ref.current!.setMatrixAt(i, o.matrix);
    }
    ref.current!.instanceMatrix.needsUpdate = true;
  }, []);
  return (
    <group position={pos}>
      <Box pos={[0, 0.0125, 0]} size={[0.51, 0.025, 0.051]} m={m.black} />
      <instancedMesh ref={ref} args={[undefined, undefined, 40]} material={m.gold} castShadow>
        <boxGeometry args={[0.0064, 0.06, 0.0064]} />
      </instancedMesh>
    </group>
  );
}

function PiBody({ live, cpu }: { live: boolean; cpu: number }) {
  const m = mats();
  const fins = Array.from({ length: 7 }, (_, i) => i);
  return (
    <group>
      <Pcb k="pi4" size={[0.85, 0.016, 0.56]} mask="#0f6a37" trace="#1f8c4d" label="Raspberry Pi 4 Model B" sub="© Raspberry Pi 2019" />
      {/* brass standoffs */}
      {[[-0.38, -0.23], [0.2, -0.23], [-0.38, 0.23], [0.2, 0.23]].map(([x, z]) => <Cyl key={`${x}${z}`} pos={[x, -0.05, z]} r={0.018} h={0.09} m={m.brass} seg={6} />)}
      {/* SoC with finned heatsink */}
      <Box pos={[-0.1, 0.018, -0.02]} size={[0.15, 0.02, 0.15]} m={m.silver} />
      <Box pos={[-0.1, 0.038, -0.02]} size={[0.16, 0.02, 0.16]} m={m.darkMetal} />
      {fins.map((i) => <Box key={i} pos={[-0.1, 0.085, -0.092 + i * 0.024]} size={[0.16, 0.075, 0.008]} m={m.darkMetal} />)}
      {/* RAM, USB controller, PMIC */}
      <Box pos={[0.09, 0.016, -0.02]} size={[0.1, 0.014, 0.14]} m={m.blackGloss} />
      <Box pos={[0.22, 0.014, 0.09]} size={[0.06, 0.01, 0.06]} m={m.blackGloss} />
      <Box pos={[-0.3, 0.012, 0.12]} size={[0.05, 0.008, 0.05]} m={m.blackGloss} />
      <GpioHeader pos={[-0.065, 0.008, -0.245]} />
      {/* PoE header */}
      <Box pos={[0.25, 0.025, -0.2]} size={[0.05, 0.035, 0.05]} m={m.black} />
      {/* Ethernet + two USB stacks on the short edge */}
      <group position={[0.35, 0.008, 0]}>
        <Box pos={[0, 0.0675, -0.17]} size={[0.21, 0.135, 0.16]} m={m.silver} />
        <Box pos={[0.106, 0.06, -0.17]} size={[0.004, 0.09, 0.12]} m={m.black} />
        <Box pos={[0, 0.08, 0.0]} size={[0.175, 0.16, 0.145]} m={m.silver} />
        <Box pos={[0, 0.08, 0.18]} size={[0.175, 0.16, 0.145]} m={m.silver} />
        {[0.0, 0.18].flatMap((z) => [0.045, 0.115].map((y) => <Box key={`${z}${y}`} pos={[0.089, y, z]} size={[0.004, 0.05, 0.12]} m={z === 0 ? m.usbBlue : m.black} />))}
      </group>
      {/* USB-C, 2x micro HDMI, audio on the long edge */}
      <Box pos={[-0.31, 0.024, 0.255]} size={[0.09, 0.032, 0.075]} m={m.silver} />
      <Box pos={[-0.165, 0.022, 0.255]} size={[0.065, 0.03, 0.075]} m={m.silver} />
      <Box pos={[-0.03, 0.022, 0.255]} size={[0.065, 0.03, 0.075]} m={m.silver} />
      <Box pos={[0.115, 0.04, 0.22]} size={[0.07, 0.06, 0.12]} m={m.black} />
      <Cyl pos={[0.115, 0.04, 0.285]} r={0.022} h={0.02} m={m.black} rot={[Math.PI / 2, 0, 0]} />
      {/* CSI camera connector */}
      <Box pos={[0.045, 0.03, 0.17]} size={[0.05, 0.045, 0.22]} m={m.black} />
      <Box pos={[0.045, 0.055, 0.17]} size={[0.03, 0.01, 0.2]} m={m.white} />
      {/* DSI */}
      <Box pos={[-0.39, 0.03, 0.0]} size={[0.05, 0.045, 0.22]} m={m.black} />
      {/* status LEDs: red power, green activity (flickers with CPU load) */}
      <Led pos={[-0.405, 0.016, 0.16]} color="#ff2a2a" />
      <Led pos={[-0.405, 0.016, 0.2]} color="#2aff6a" blink={(t) => (live && Math.sin(t * 37) * Math.sin(t * 13) > 1 - cpu / 70 ? 1 : 0.02)} />
    </group>
  );
}

function CameraBody({ live }: { live: boolean }) {
  const m = mats();
  return (
    <group>
      <group rotation={[Math.PI / 2, 0, 0]}>
        <Pcb k="cam3" size={[0.25, 0.012, 0.24]} mask="#0f6a37" trace="#1e874a" />
      </group>
      <Box pos={[0, 0, 0.03]} size={[0.088, 0.088, 0.045]} m={m.black} />
      <Cyl pos={[0, 0, 0.068]} r={0.038} h={0.035} m={m.blackGloss} rot={[Math.PI / 2, 0, 0]} seg={32} />
      <Cyl pos={[0, 0, 0.086]} r={0.026} h={0.004} m={m.glass} rot={[Math.PI / 2, 0, 0]} seg={32} />
      {/* blue gel filter in front of the lens */}
      <Cyl pos={[0, 0, 0.1]} r={0.052} h={0.006} m={m.gel} rot={[Math.PI / 2, 0, 0]} seg={32} />
      {/* aluminium L-bracket down to the tray */}
      <Box pos={[0, -0.39, -0.03]} size={[0.2, 0.66, 0.012]} m={m.alu} />
      <Box pos={[0, -0.715, -0.12]} size={[0.2, 0.012, 0.18]} m={m.alu} />
      <Led pos={[0.1, 0.1, 0.01]} color="#e5484d" blink={(t) => (live ? 0.6 + 0.4 * Math.sin(t * 4) : 0)} size={0.014} />
    </group>
  );
}

const GPS_CABLE = new THREE.CatmullRomCurve3([new THREE.Vector3(0.1, 0.03, -0.12), new THREE.Vector3(0.18, 0.06, -0.16), new THREE.Vector3(0.26, 0.03, -0.1)]);

function GpsBody({ fix }: { fix: boolean }) {
  const m = mats();
  const shield = useMemo(() => new THREE.MeshStandardMaterial({ map: labelTexture("neo6m", "#cfd3d6", "#1d1d1d", [["u-blox", 46, "800"], ["NEO-6M-0-001", 34], ["1631 B05", 28, "400"]]), metalness: 0.7, roughness: 0.35 }), []);
  const shieldMats = useMemo(() => [m.silver, m.silver, shield, m.silver, m.silver, m.silver], [m.silver, shield]);
  return (
    <group>
      <Pcb k="gy-neo6m" size={[0.25, 0.016, 0.36]} mask="#1b4fa8" trace="#2d68cc" label="GY-NEO6MV2" />
      <mesh position={[0, 0.022, -0.05]} material={shieldMats} castShadow>
        <boxGeometry args={[0.16, 0.03, 0.16]} />
      </mesh>
      <Cyl pos={[0.05, 0.016, 0.1]} r={0.045} h={0.012} m={m.silver} seg={28} />
      <Led pos={[-0.08, 0.016, 0.12]} color="#2aff6a" blink={(t) => (fix && t % 1 < 0.12 ? 1 : 0)} />
      {/* ceramic patch antenna */}
      <group position={[0.32, 0, 0]}>
        <Box pos={[0, 0.02, 0]} size={[0.25, 0.04, 0.25]} m={m.ceramic} />
        <Box pos={[0, 0.042, 0]} size={[0.18, 0.004, 0.18]} m={m.silver} />
        <Cyl pos={[0.02, 0.046, 0.02]} r={0.012} h={0.006} m={m.gold} seg={12} />
      </group>
      <mesh material={m.black}>
        <tubeGeometry args={[GPS_CABLE, 12, 0.008, 6, false]} />
      </mesh>
    </group>
  );
}

function PmsBody() {
  const m = mats();
  const top = useMemo(() => new THREE.MeshStandardMaterial({ map: pmsTexture(), metalness: 0.75, roughness: 0.32 }), []);
  const mm = useMemo(() => [m.alu, m.alu, top, m.alu, m.alu, m.alu], [m.alu, top]);
  return (
    <group>
      <mesh material={mm} castShadow receiveShadow>
        <boxGeometry args={[0.5, 0.21, 0.38]} />
      </mesh>
      {/* inlet and outlet */}
      <Box pos={[0.252, 0.03, -0.08]} size={[0.006, 0.08, 0.12]} m={m.black} />
      <Box pos={[0.252, -0.04, 0.1]} size={[0.006, 0.07, 0.12]} m={m.black} />
      <Box pos={[-0.252, -0.05, 0.12]} size={[0.008, 0.04, 0.1]} m={m.white} />
    </group>
  );
}

function Mq135Body({ live }: { live: boolean }) {
  const m = mats();
  const cap = useMemo(() => new THREE.MeshStandardMaterial({ map: meshCapTexture(), metalness: 0.85, roughness: 0.35 }), []);
  const glow = useMemo(() => new THREE.MeshStandardMaterial({ color: "#200", emissive: new THREE.Color("#ff6a1a"), emissiveIntensity: 1.5, toneMapped: false }), []);
  useFrame(({ clock }) => (glow.emissiveIntensity = live ? 1.2 + 0.4 * Math.sin(clock.elapsedTime * 1.3) : 0));
  return (
    <group>
      <Pcb k="mq135" size={[0.32, 0.016, 0.22]} mask="#1b4fa8" trace="#2d68cc" label="MQ-135" />
      <Cyl pos={[-0.03, 0.03, 0]} r={0.1} h={0.04} m={m.bakelite} seg={32} />
      <Cyl pos={[-0.03, 0.105, 0]} r={0.06} h={0.08} m={glow} seg={16} />
      <mesh position={[-0.03, 0.105, 0]} material={cap} castShadow>
        <cylinderGeometry args={[0.094, 0.094, 0.11, 32, 1, true]} />
      </mesh>
      <Cyl pos={[-0.03, 0.161, 0]} r={0.094} h={0.004} m={m.silver} seg={32} />
      <Box pos={[0.11, 0.035, 0.05]} size={[0.06, 0.055, 0.06]} m={m.usbBlue} />
      <Cyl pos={[0.11, 0.065, 0.05]} r={0.018} h={0.006} m={m.brass} seg={12} />
      <Led pos={[0.12, 0.016, -0.06]} color="#ff2a2a" />
      <Led pos={[0.09, 0.016, -0.06]} color="#2aff6a" blink={(t) => (live && Math.sin(t * 0.7) > 0.3 ? 1 : 0)} />
    </group>
  );
}

function Scd40Body() {
  const m = mats();
  return (
    <group>
      <Pcb k="scd40" size={[0.2, 0.016, 0.2]} mask="#1c1c1e" trace="#2b2b2f" />
      <Box pos={[0, 0.04, 0]} size={[0.1, 0.065, 0.1]} m={m.silver} />
      <Cyl pos={[0, 0.074, 0]} r={0.012} h={0.004} m={m.black} seg={12} />
      <Led pos={[0.07, 0.016, 0.07]} color="#2aff6a" />
    </group>
  );
}

function Bme280Body() {
  const m = mats();
  return (
    <group>
      <Pcb k="bme280" size={[0.15, 0.016, 0.11]} mask="#5b2b8f" trace="#7a45b5" />
      <Box pos={[0, 0.016, 0]} size={[0.025, 0.012, 0.025]} m={m.silver} />
      <Cyl pos={[0.004, 0.023, 0.004]} r={0.003} h={0.002} m={m.black} seg={8} />
    </group>
  );
}

function Bodies({ id, t }: { id: string; t?: Telemetry }) {
  const live = !!t;
  switch (id) {
    case "pi": return <PiBody live={live} cpu={t?.device?.cpu_pct ?? 30} />;
    case "camera": return <CameraBody live={live} />;
    case "gps": return <GpsBody fix={!!t && t.gps.fix !== "none"} />;
    case "pms": return <PmsBody />;
    case "mq135": return <Mq135Body live={live} />;
    case "scd40": return <Scd40Body />;
    case "bme280": return <Bme280Body />;
    default: return null;
  }
}

const v3 = (a: Vec3) => new THREE.Vector3(...a);
const ease = (k: number) => 1 - (1 - k) ** 3;

/** Eases a group between its assembled and exploded position. */
function useExplode(ref: React.RefObject<THREE.Group>, pos: Vec3, offset: Vec3, exploded: boolean) {
  const from = useMemo(() => v3(pos), [pos]);
  const to = useMemo(() => v3(pos).add(v3(offset)), [pos, offset]);
  const k = useRef(0);
  useFrame((_, dt) => {
    const step = Math.min(dt, 0.05) / 0.9;
    k.current = exploded ? Math.min(1, k.current + step) : Math.max(0, k.current - step);
    ref.current?.position.lerpVectors(from, to, ease(k.current));
  });
}

function Part({ def, exploded, selected, onSelect, t, children }: { def: PartDef; exploded: boolean; selected: boolean; onSelect: (id: string) => void; t?: Telemetry; children: ReactNode }) {
  const ref = useRef<THREE.Group>(null);
  const [hover, setHover] = useState(false);
  useExplode(ref, def.pos, def.exploded, exploded);
  const reading = def.readings(t)[0];
  return (
    <group
      ref={ref}
      position={def.pos}
      onClick={(e: ThreeEvent<MouseEvent>) => { e.stopPropagation(); onSelect(def.id); }}
      onPointerOver={(e) => { e.stopPropagation(); setHover(true); document.body.style.cursor = "pointer"; }}
      onPointerOut={() => { setHover(false); document.body.style.cursor = ""; }}
    >
      {children}
      {(exploded || hover || selected) && (
        <Html position={[0, 0.2, 0]} center style={{ pointerEvents: "none" }} zIndexRange={[20, 10]}>
          <div className={`part-tag ${selected ? "sel" : ""}`}>
            <b>{def.name}</b>
            {reading && <span>{reading[0]} <em>{reading[1]}</em></span>}
          </div>
        </Html>
      )}
    </group>
  );
}

/** Flat ribbon cable along a curve (width along local x). */
function Ribbon({ points, width }: { points: THREE.Vector3[]; width: number }) {
  const geo = useMemo(() => {
    const curve = new THREE.CatmullRomCurve3(points);
    const n = 40;
    const pos: number[] = [];
    const idx: number[] = [];
    for (let i = 0; i <= n; i++) {
      const q = curve.getPoint(i / n);
      pos.push(q.x - width / 2, q.y, q.z, q.x + width / 2, q.y, q.z);
      if (i < n) idx.push(i * 2, i * 2 + 1, i * 2 + 2, i * 2 + 1, i * 2 + 3, i * 2 + 2);
    }
    const g = new THREE.BufferGeometry();
    g.setAttribute("position", new THREE.Float32BufferAttribute(pos, 3));
    g.setIndex(idx);
    g.computeVertexNormals();
    return g;
  }, [points, width]);
  return <mesh geometry={geo} material={mats().ribbon} castShadow />;
}

const WIRE_COLORS = ["#d93f3f", "#222222", "#e8c547", "#3c9b52", "#3577d4", "#e2873a"];
const partPos = (id: string) => v3(PARTS.find((p) => p.id === id)!.pos);

/** Jumper wires from the Pi's GPIO header and the camera ribbon; shown only when assembled. */
function Wiring({ visible }: { visible: boolean }) {
  const { wires, ribbon } = useMemo(() => {
    const pi = partPos("pi");
    const header = (i: number) => pi.clone().add(new THREE.Vector3(-0.29 + i * 0.0254, 0.08, -0.245));
    const ends: [number, THREE.Vector3][] = [
      [1, partPos("pms").add(new THREE.Vector3(-0.26, -0.05, 0.12))],
      [3, partPos("mq135").add(new THREE.Vector3(-0.12, 0.02, -0.08))],
      [5, partPos("scd40").add(new THREE.Vector3(-0.08, 0.02, -0.1))],
      [7, partPos("bme280").add(new THREE.Vector3(-0.06, 0.02, -0.05))],
      [9, partPos("gps").add(new THREE.Vector3(0, -0.02, 0.17))],
      [11, partPos("pms").add(new THREE.Vector3(-0.26, -0.05, 0.15))],
    ];
    const csi = pi.clone().add(new THREE.Vector3(0.045, 0.06, 0.17));
    const cam = partPos("camera").add(new THREE.Vector3(0, -0.12, -0.02));
    return {
      wires: ends.map(([pin, end], i) => {
        const start = header(pin);
        const mid = start.clone().lerp(end, 0.5).add(new THREE.Vector3(0, 0.18 + (i % 3) * 0.04, 0));
        return { color: WIRE_COLORS[i], curve: new THREE.CatmullRomCurve3([start, start.clone().add(new THREE.Vector3(0, 0.07, 0)), mid, end.clone().add(new THREE.Vector3(0, 0.07, 0)), end]) };
      }),
      ribbon: [csi, csi.clone().add(new THREE.Vector3(0, 0.12, 0.05)), cam.clone().add(new THREE.Vector3(0, -0.1, -0.15)), cam],
    };
  }, []);
  return (
    <group visible={visible}>
      {wires.map((w, i) => (
        <mesh key={i} castShadow>
          <tubeGeometry args={[w.curve, 48, 0.008, 6, false]} />
          <meshStandardMaterial color={w.color} roughness={0.5} />
        </mesh>
      ))}
      <Ribbon width={0.15} points={ribbon} />
    </group>
  );
}

// ---------- IP65 enclosure: grey ABS body, gasketed front cover with a clear window ----------
const W = 2.3, H = 1.5, D = 1.3, T = 0.06; // outer size (x, y, z) and wall thickness; 1 unit = 10 cm
export const WINDOW = { y: 0.12, r: 0.22 };

/** Fixed installation hardware: power conversion, terminal blocks, cooling and cable management. */
function InternalHardware() {
  const m = mats();
  const red = useMemo(() => new THREE.MeshStandardMaterial({ color: "#b6322d", roughness: 0.55 }), []);
  const blue = useMemo(() => new THREE.MeshStandardMaterial({ color: "#2464a8", roughness: 0.52 }), []);
  const copper = useMemo(() => new THREE.MeshStandardMaterial({ color: "#bd7335", metalness: 0.75, roughness: 0.32 }), []);
  const fan = useMemo(() => new THREE.MeshStandardMaterial({ color: "#202428", roughness: 0.48 }), []);
  return (
    <group>
      {/* slotted aluminium carrier and cable ducts */}
      <Box pos={[0, -0.64, -0.42]} size={[1.92, 0.035, 0.12]} m={m.alu} />
      {[-0.72, -0.24, 0.24, 0.72].map((x) => <Box key={x} pos={[x, -0.616, -0.42]} size={[0.22, 0.008, 0.13]} m={m.black} />)}
      <Box pos={[-1.02, -0.24, -0.18]} size={[0.09, 0.72, 0.54]} m={m.white} />
      <Box pos={[1.02, -0.24, -0.18]} size={[0.09, 0.72, 0.54]} m={m.white} />
      {Array.from({ length: 7 }, (_, i) => <Box key={`duct-${i}`} pos={[-1.025, -0.51 + i * 0.09, 0.105]} size={[0.1, 0.025, 0.04]} m={m.black} />)}

      {/* fused 12 V input and pluggable terminal strip */}
      <group position={[-0.83, -0.34, 0.26]}>
        <Box pos={[0, 0, 0]} size={[0.3, 0.12, 0.17]} m={m.black} />
        <Box pos={[-0.085, 0.07, 0]} size={[0.09, 0.045, 0.13]} m={red} />
        <Box pos={[0.075, 0.07, 0]} size={[0.14, 0.045, 0.13]} m={blue} />
        {[-0.11, -0.035, 0.04, 0.115].map((x) => <Cyl key={x} pos={[x, 0.1, 0]} r={0.015} h={0.012} m={m.silver} seg={12} />)}
      </group>

      {/* regulated DC power stage with inductor, capacitors and status LED */}
      <group position={[-0.74, 0.17, -0.38]}>
        <Pcb k="power-stage" size={[0.46, 0.018, 0.28]} mask="#174f8b" trace="#3474b5" label="12V → 5V" sub="3A REGULATOR" />
        <Cyl pos={[-0.09, 0.06, 0]} r={0.07} h={0.09} m={copper} seg={20} />
        <Box pos={[0.08, 0.045, -0.04]} size={[0.12, 0.065, 0.1]} m={m.blackGloss} />
        {[-0.16, 0.17].map((x) => <Cyl key={x} pos={[x, 0.065, 0.09]} r={0.025} h={0.11} m={m.black} seg={18} />)}
        <Led pos={[0.18, 0.025, -0.1]} color="#39d275" />
      </group>

      {/* filtered intake fan on the rear bulkhead */}
      <group position={[0.72, 0.25, -0.59]}>
        <RoundedBox args={[0.48, 0.48, 0.055]} radius={0.04} smoothness={3} material={fan} castShadow />
        <Cyl pos={[0, 0, 0.04]} r={0.075} h={0.07} m={m.darkMetal} rot={[Math.PI / 2, 0, 0]} seg={24} />
        {Array.from({ length: 7 }, (_, i) => (
          <mesh key={i} position={[0, 0, 0.078]} rotation={[0, 0, i * Math.PI / 3.5]} material={fan} castShadow>
            <boxGeometry args={[0.055, 0.34, 0.018]} />
          </mesh>
        ))}
        <mesh position={[0, 0, 0.09]} material={m.black}><torusGeometry args={[0.19, 0.012, 8, 36]} /></mesh>
      </group>

      {/* realistic board standoffs and earth bonding point */}
      {[[-0.88, -0.55], [0.88, -0.55], [-0.88, 0.45], [0.88, 0.45]].map(([x, z]) => <Cyl key={`${x}-${z}`} pos={[x, -0.57, z]} r={0.025} h={0.14} m={m.brass} seg={8} />)}
      <Cyl pos={[0.82, -0.58, 0.42]} r={0.035} h={0.13} m={m.gold} seg={12} />
      <Box pos={[0.72, -0.49, 0.42]} size={[0.2, 0.012, 0.035]} m={copper} />
    </group>
  );
}

function Wall({ pos, size, offset, exploded, m, children }: { pos: Vec3; size: Vec3; offset: Vec3; exploded: boolean; m: THREE.Material; children?: ReactNode }) {
  const ref = useRef<THREE.Group>(null);
  useExplode(ref, pos, offset, exploded);
  return (
    <group ref={ref} position={pos}>
      <RoundedBox args={size} radius={0.03} smoothness={3} material={m} castShadow receiveShadow />
      {children}
    </group>
  );
}

function Enclosure({ exploded, online }: { exploded: boolean; online: boolean }) {
  const m = mats();
  const abs = useMemo(() => new THREE.MeshStandardMaterial({ color: "#cfd3d6", roughness: 0.62, metalness: 0, map: noiseTexture("abs", "#f2f2f2", 0.05) }), []);
  const lens = useMemo(() => new THREE.MeshPhysicalMaterial({ color: "#ffffff", roughness: 0.04, transmission: 1, thickness: 0.04, ior: 1.58, clearcoat: 1 }), []);
  const steel = useMemo(() => new THREE.MeshStandardMaterial({ color: "#c7ccd1", metalness: 1, roughness: 0.3 }), []);
  const led = useMemo(() => new THREE.MeshStandardMaterial({ color: "#111", emissive: new THREE.Color(online ? "#2fbf4a" : "#d29922"), emissiveIntensity: 2.5, toneMapped: false }), [online]);
  const plate = useMemo(() => new THREE.MeshStandardMaterial({ map: labelTexture("nameplate-v2", "#e9ecef", "#2b3036", [["AIRcoin miner", 54, "700"], ["miner-001, IP65", 30, "500"]], 512, 160), roughness: 0.5 }), []);
  const x = W / 2 - T / 2, y = H / 2 - T / 2, z = D / 2 - T / 2;
  const screws = ([[-1, -1], [1, -1], [-1, 1], [1, 1]] as const).map(([sx, sy]) => [sx * (W / 2 - 0.1), sy * (H / 2 - 0.1)] as const);
  return (
    <group>
      {/* bottom with the aluminium component tray */}
      <RoundedBox args={[W, T, D]} radius={0.03} smoothness={3} position={[0, -y, 0]} material={abs} castShadow receiveShadow />
      <mesh position={[0, -0.665, 0]} material={m.alu} receiveShadow><boxGeometry args={[W - 0.3, 0.02, D - 0.3]} /></mesh>
      {/* back, sides and lid come apart along their own axes */}
      <Wall pos={[0, 0, -z]} size={[W, H, T]} offset={[0, 0, -0.7]} exploded={exploded} m={abs}>
        <mesh position={[0.6, -0.5, -T / 2 - 0.002]} rotation={[0, Math.PI, 0]} material={plate}><planeGeometry args={[0.7, 0.22]} /></mesh>
      </Wall>
      <Wall pos={[-x, 0, 0]} size={[T, H, D]} offset={[-0.75, 0, 0]} exploded={exploded} m={abs} />
      <Wall pos={[x, 0, 0]} size={[T, H, D]} offset={[0.75, 0, 0]} exploded={exploded} m={abs}>
        {/* louvred vent beside the particulate sensor */}
        {Array.from({ length: 7 }, (_, i) => (
          <mesh key={i} position={[T / 2 + 0.008, -0.45 + i * 0.07, -0.25]} rotation={[0.5, 0, 0]} material={abs} castShadow><boxGeometry args={[0.02, 0.05, 0.5]} /></mesh>
        ))}
      </Wall>
      <Wall pos={[0, y, 0]} size={[W, T, D]} offset={[0, 1.25, 0]} exploded={exploded} m={abs} />
      {/* front cover: clear window over the lens, gasket, four stainless screws, status LED */}
      <Wall pos={[0, 0, z]} size={[W, H, T]} offset={[0, 0, 1.0]} exploded={exploded} m={abs}>
        <mesh position={[0, WINDOW.y, T / 2 + 0.004]} material={lens}><circleGeometry args={[WINDOW.r, 48]} /></mesh>
        <mesh position={[0, WINDOW.y, T / 2 + 0.006]} material={m.rubber}><ringGeometry args={[WINDOW.r, WINDOW.r + 0.035, 48]} /></mesh>
        {screws.map(([sx, sy], i) => <Cyl key={i} pos={[sx, sy, T / 2 + 0.01]} r={0.03} h={0.02} m={steel} rot={[Math.PI / 2, 0, 0]} seg={16} />)}
        <mesh position={[0.85, -0.55, T / 2 + 0.006]} material={led}><circleGeometry args={[0.025, 16]} /></mesh>
      </Wall>
      {/* cable gland, power lead and tripod plate underneath */}
      <Cyl pos={[-0.7, -H / 2 - 0.06, -0.3]} r={0.07} h={0.12} m={m.black} seg={16} />
      <mesh position={[-0.7, -H / 2 - 0.25, -0.3]} material={m.black}><cylinderGeometry args={[0.025, 0.025, 0.3, 10]} /></mesh>
      <RoundedBox args={[0.6, 0.05, 0.6]} radius={0.015} position={[0, -H / 2 - 0.025, 0]} material={m.darkMetal} castShadow />
    </group>
  );
}

export function Miner({ exploded, selected, onSelect }: { exploded: boolean; selected?: string; onSelect: (id: string) => void }) {
  const t = useTwin((s) => s.telemetry);
  return (
    <group>
      <Enclosure exploded={exploded} online={t?.uplink?.online !== false} />
      <InternalHardware />
      <Wiring visible />
      {PARTS.map((def) => (
        <Part key={def.id} def={def} exploded={exploded} selected={selected === def.id} onSelect={onSelect} t={t}>
          <Bodies id={def.id} t={t} />
        </Part>
      ))}
    </group>
  );
}

/** Lens position in miner-local space (the camera looks out through the front window). */
export const LENS_LOCAL = new THREE.Vector3(0, WINDOW.y, 0.62);
/** Distance from the miner's origin down to the tripod plate. */
export const MINER_BOTTOM = H / 2 + 0.05;
