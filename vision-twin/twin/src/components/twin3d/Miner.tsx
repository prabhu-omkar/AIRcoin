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
  readings: (t?: Telemetry) => [string, string][];
}

const fmt = (v: number | undefined, d = 1, unit = "") => (v === undefined ? "—" : `${v.toFixed(d)}${unit}`);

export const PARTS: PartDef[] = [
  {
    id: "pi", name: "Raspberry Pi", hardware: "Raspberry Pi 4 (4 GB) / Pi 5", role: "Runs vision, estimation and signing",
    pos: [-0.2, -0.17, -0.12],
    readings: (t) => [["CPU temp", fmt(t?.device?.cpu_temp_c, 1, " °C")], ["CPU", fmt(t?.device?.cpu_pct, 0, " %")], ["Memory", fmt(t?.device?.mem_pct, 0, " %")], ["Uplink", t?.uplink?.online === false ? "offline" : t ? "online" : "—"]],
  },
  {
    id: "camera", name: "Camera", hardware: "Pi Camera Module 3 NoIR Wide + blue gel filter", role: "Reads stickers, sizes plants, NDVI liveness",
    pos: [0, 0.66, 0.5],
    readings: (t) => {
      const seen = t?.plants.filter((p) => p.status === "present" || p.status === "suspect").length;
      return [["Plants seen", t ? `${seen}/${t.plants.length}` : "—"], ["Suspect", t ? String(t.plants.filter((p) => p.status === "suspect").length) : "—"]];
    },
  },
  {
    id: "gps", name: "GPS", hardware: "u-blox NEO-6M / NEO-M8N (UART)", role: "Fixes location for anti-cheat and local AQI",
    pos: [-0.5, 0.53, -0.38],
    readings: (t) => [["Fix", t?.gps.fix ?? "—"], ["Satellites", t?.gps.satellites !== undefined ? String(t.gps.satellites) : "—"], ["Lat, lon", t ? `${t.gps.lat.toFixed(5)}, ${t.gps.lon.toFixed(5)}` : "—"]],
  },
  {
    id: "pms", name: "Particulate sensor", hardware: "PMS5003", role: "PM2.5 / PM10 (simulated in the demo)",
    pos: [0.58, -0.135, -0.3],
    readings: (t) => [["PM2.5", fmt(t?.sensors.pm25_ugm3, 0, " µg/m³")], ["PM10", fmt(t?.sensors.pm10_ugm3, 0, " µg/m³")], ["AQI", fmt(t?.aqi, 0)]],
  },
  {
    id: "mq135", name: "Gas / VOC sensor", hardware: "MQ-135", role: "VOCs and NO₂ (simulated in the demo)",
    pos: [-0.55, -0.22, 0.38],
    readings: (t) => [["VOC index", fmt(t?.sensors.voc_index, 0)], ["NO₂", fmt(t?.sensors.no2_ppb, 0, " ppb")], ["CO", fmt(t?.sensors.co_ppm, 2, " ppm")]],
  },
  {
    id: "scd40", name: "CO₂ sensor", hardware: "SCD40", role: "CO₂ (simulated in the demo)",
    pos: [0.18, -0.22, 0.4],
    readings: (t) => [["CO₂", fmt(t?.sensors.co2_ppm, 0, " ppm")]],
  },
  {
    id: "bme280", name: "Climate sensor", hardware: "BME280", role: "Temperature, humidity, pressure",
    pos: [0.6, -0.22, 0.42],
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
      {/* blue gel filter in a clip */}
      <Cyl pos={[0, 0, 0.1]} r={0.052} h={0.006} m={m.gel} rot={[Math.PI / 2, 0, 0]} seg={32} />
      <mesh position={[0, 0, 0.1]} material={m.black}>
        <torusGeometry args={[0.053, 0.006, 8, 32]} />
      </mesh>
      {/* holes and a small connector */}
      <Box pos={[0, -0.095, -0.012]} size={[0.16, 0.035, 0.016]} m={m.black} />
      {/* aluminium mast + tilt joint */}
      <Box pos={[0, -0.2, -0.04]} size={[0.06, 0.2, 0.025]} m={m.alu} />
      <Cyl pos={[0, -0.1, -0.04]} r={0.022} h={0.08} m={m.darkMetal} rot={[0, 0, Math.PI / 2]} />
      <Led pos={[0.1, 0.1, 0.01]} color="#ff2040" blink={(t) => (live ? 0.6 + 0.4 * Math.sin(t * 4) : 0)} size={0.014} />
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

function Part({ def, selected, onSelect, t, children }: { def: PartDef; selected: boolean; onSelect: (id: string) => void; t?: Telemetry; children: ReactNode }) {
  const [hover, setHover] = useState(false);
  const reading = def.readings(t)[0];
  return (
    <group
      position={def.pos}
      onClick={(e: ThreeEvent<MouseEvent>) => { e.stopPropagation(); onSelect(def.id); }}
      onPointerOver={(e) => { e.stopPropagation(); setHover(true); document.body.style.cursor = "pointer"; }}
      onPointerOut={() => { setHover(false); document.body.style.cursor = ""; }}
    >
      {children}
      {(hover || selected) && (
        <Html position={[0, 0.22, 0]} center style={{ pointerEvents: "none" }} zIndexRange={[20, 10]}>
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
      const p = curve.getPoint(i / n);
      pos.push(p.x - width / 2, p.y, p.z, p.x + width / 2, p.y, p.z);
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

const RIBBON_PATH = [new THREE.Vector3(-0.155, -0.1, 0.05), new THREE.Vector3(-0.155, 0.1, 0.1), new THREE.Vector3(-0.05, 0.3, 0.32), new THREE.Vector3(0, 0.44, 0.44), new THREE.Vector3(0, 0.56, 0.48)];
const WIRE_COLORS = ["#e53935", "#212121", "#fdd835", "#43a047", "#1e88e5", "#fb8c00", "#f5f5f5", "#8e24aa"];

/** Dupont jumper wires from the GPIO header to each sensor. */
function Wiring() {
  const wires = useMemo(() => {
    const pi = new THREE.Vector3(...PARTS[0].pos);
    const header = (i: number) => pi.clone().add(new THREE.Vector3(-0.29 + i * 0.0254, 0.08, -0.245));
    const ends: [number, string, THREE.Vector3][] = [
      [1, "pms", new THREE.Vector3(...PARTS[3].pos).add(new THREE.Vector3(-0.26, -0.05, 0.12))],
      [2, "pms", new THREE.Vector3(...PARTS[3].pos).add(new THREE.Vector3(-0.26, -0.05, 0.14))],
      [4, "mq135", new THREE.Vector3(...PARTS[4].pos).add(new THREE.Vector3(0.16, 0.02, -0.08))],
      [5, "mq135", new THREE.Vector3(...PARTS[4].pos).add(new THREE.Vector3(0.16, 0.02, -0.05))],
      [7, "scd40", new THREE.Vector3(...PARTS[5].pos).add(new THREE.Vector3(-0.08, 0.02, -0.1))],
      [8, "scd40", new THREE.Vector3(...PARTS[5].pos).add(new THREE.Vector3(-0.05, 0.02, -0.1))],
      [10, "bme280", new THREE.Vector3(...PARTS[6].pos).add(new THREE.Vector3(-0.06, 0.02, -0.05))],
      [12, "gps", new THREE.Vector3(...PARTS[2].pos).add(new THREE.Vector3(0, -0.04, 0.17))],
    ];
    return ends.map(([pin, , end], i) => {
      const start = header(pin);
      const mid = start.clone().lerp(end, 0.5).add(new THREE.Vector3(0, 0.22 + (i % 3) * 0.05, 0));
      return { color: WIRE_COLORS[i % WIRE_COLORS.length], curve: new THREE.CatmullRomCurve3([start, start.clone().add(new THREE.Vector3(0, 0.08, 0)), mid, end.clone().add(new THREE.Vector3(0, 0.08, 0)), end]) };
    });
  }, []);
  return (
    <group>
      {wires.map((w, i) => (
        <mesh key={i} castShadow>
          <tubeGeometry args={[w.curve, 48, 0.009, 6, false]} />
          <meshStandardMaterial color={w.color} roughness={0.45} />
        </mesh>
      ))}
      <Ribbon width={0.15} points={RIBBON_PATH} />
    </group>
  );
}

function ExhaustFan({ cpu }: { cpu: number }) {
  const m = mats();
  const blades = useRef<THREE.Group>(null);
  useFrame((_, dt) => {
    if (blades.current) blades.current.rotation.z += dt * (6 + cpu * 0.5);
  });
  return (
    <group position={[0.952, 0.08, 0.05]} rotation={[0, Math.PI / 2, 0]}>
      <Box pos={[0, 0, 0]} size={[0.32, 0.32, 0.04]} m={m.black} />
      <mesh position={[0, 0, 0.021]} material={m.blackGloss}>
        <circleGeometry args={[0.15, 32]} />
      </mesh>
      <group ref={blades} position={[0, 0, 0.03]}>
        {Array.from({ length: 7 }, (_, i) => (
          <mesh key={i} rotation={[0.35, 0, (i / 7) * Math.PI * 2]} position={[0, 0, 0]} material={m.black}>
            <boxGeometry args={[0.03, 0.26, 0.004]} />
          </mesh>
        ))}
        <Cyl pos={[0, 0, 0.005]} r={0.05} h={0.02} m={m.black} rot={[Math.PI / 2, 0, 0]} />
      </group>
      {/* grille */}
      {[-0.09, -0.03, 0.03, 0.09].map((y) => <Box key={y} pos={[0, y, 0.045]} size={[0.3, 0.008, 0.008]} m={m.silver} />)}
    </group>
  );
}

function Enclosure({ online }: { online: boolean }) {
  const m = mats();
  const shell = useMemo(() => new THREE.MeshPhysicalMaterial({ color: "#cfeee2", transparent: true, opacity: 0.1, roughness: 0.04, metalness: 0, clearcoat: 1, clearcoatRoughness: 0.03, depthWrite: false, envMapIntensity: 1.5, side: THREE.DoubleSide }), []);
  const lidMat = useMemo(() => new THREE.MeshPhysicalMaterial({ color: "#13221d", transparent: true, opacity: 0.42, roughness: 0.06, clearcoat: 1, depthWrite: false, envMapIntensity: 1.6 }), []);
  const strip = useMemo(() => new THREE.MeshStandardMaterial({ color: "#111", emissive: new THREE.Color("#3fb950"), emissiveIntensity: 3, toneMapped: false }), []);
  const plate = useMemo(() => new THREE.MeshStandardMaterial({ map: labelTexture("nameplate", "#0f1513", "#e6efe9", [["AIRcoin", 64, "800"], ["MINER · PoUW · v1", 30, "500"]], 512, 192), roughness: 0.35, metalness: 0.4 }), []);
  strip.emissive.set(online ? "#3fb950" : "#d29922");
  return (
    <group>
      <RoundedBox args={[1.92, 0.12, 1.42]} radius={0.04} smoothness={4} position={[0, -0.32, 0]} material={m.housing} castShadow receiveShadow />
      <RoundedBox args={[1.9, 0.72, 1.4]} radius={0.035} smoothness={3} position={[0, 0.1, 0]} material={shell} />
      {/* aluminium corner posts */}
      {[-1, 1].flatMap((sx) => [-1, 1].map((sz) => <Box key={`${sx}${sz}`} pos={[sx * 0.93, 0.1, sz * 0.68]} size={[0.045, 0.72, 0.045]} m={m.alu} />))}
      <RoundedBox args={[1.96, 0.05, 1.46]} radius={0.02} smoothness={3} position={[0, 0.47, 0]} material={lidMat} />
      {/* rear nameplate and status strip (rear faces the viewer in the rig) */}
      <mesh position={[0, -0.32, -0.716]} rotation={[0, Math.PI, 0]} material={plate}>
        <planeGeometry args={[0.6, 0.1]} />
      </mesh>
      <mesh position={[-0.55, -0.32, 0.716]} material={plate}>
        <planeGeometry args={[0.6, 0.1]} />
      </mesh>
      <Box pos={[0.62, -0.32, -0.714]} size={[0.4, 0.018, 0.006]} m={strip} />
      <Box pos={[0.35, -0.32, 0.714]} size={[0.7, 0.018, 0.006]} m={strip} />
      {/* rubber feet */}
      {[-1, 1].flatMap((sx) => [-1, 1].map((sz) => <Cyl key={`f${sx}${sz}`} pos={[sx * 0.8, -0.395, sz * 0.58]} r={0.06} h={0.03} m={m.rubber} seg={16} />))}
      {/* vent slots on the -x wall */}
      {Array.from({ length: 6 }, (_, i) => <Box key={`v${i}`} pos={[-0.952, -0.05 + i * 0.07, 0]} size={[0.006, 0.025, 0.6]} m={m.black} />)}
    </group>
  );
}

export function Miner({ selected, onSelect }: { selected?: string; onSelect: (id: string) => void }) {
  const t = useTwin((s) => s.telemetry);
  return (
    <group>
      <Enclosure online={t?.uplink?.online !== false} />
      <ExhaustFan cpu={t?.device?.cpu_pct ?? 30} />
      <Wiring />
      {PARTS.map((def) => (
        <Part key={def.id} def={def} selected={selected === def.id} onSelect={onSelect} t={t}>
          <Bodies id={def.id} t={t} />
        </Part>
      ))}
    </group>
  );
}

/** Lens position in miner-local space (for the vision frustum). */
export const LENS_LOCAL = new THREE.Vector3(0, 0.66, 0.6);
