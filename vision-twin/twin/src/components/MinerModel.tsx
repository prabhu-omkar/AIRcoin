// 3D miner, v1: built from primitives so it works today. When the Blender glTF is ready,
// swap each <Part> body for the matching node of the .glb; PARTS (ids, positions, readings) stay the same.
import { Canvas, useFrame, type ThreeEvent } from "@react-three/fiber";
import { Html, OrbitControls, RoundedBox } from "@react-three/drei";
import { Fragment, useMemo, useRef, useState, type ReactNode } from "react";
import * as THREE from "three";
import type { Telemetry } from "../contracts";
import { useTwin } from "../store";

type Vec3 = [number, number, number];

interface PartDef {
  id: string;
  name: string;
  hardware: string;
  role: string;
  pos: Vec3; // assembled
  exploded: Vec3; // offset added when exploded
  readings: (t?: Telemetry) => [string, string][];
}

const fmt = (v: number | undefined, d = 1, unit = "") => (v === undefined ? "—" : `${v.toFixed(d)}${unit}`);

export const PARTS: PartDef[] = [
  {
    id: "pi", name: "Raspberry Pi", hardware: "Raspberry Pi 4 (4 GB) / Pi 5", role: "Runs vision, estimation and signing",
    pos: [0, -0.18, 0], exploded: [0, 0.05, -0.15],
    readings: (t) => [["CPU temp", fmt(t?.device?.cpu_temp_c, 1, " °C")], ["CPU", fmt(t?.device?.cpu_pct, 0, " %")], ["Memory", fmt(t?.device?.mem_pct, 0, " %")], ["Uplink", t?.uplink?.online === false ? "offline" : t ? "online" : "—"]],
  },
  {
    id: "camera", name: "Camera", hardware: "Pi Camera Module 3 NoIR Wide + blue gel filter", role: "Reads stickers, sizes plants, NDVI liveness",
    pos: [0, 0.32, 0.5], exploded: [0, 0.35, 0.45],
    readings: (t) => {
      const seen = t?.plants.filter((p) => p.status === "present" || p.status === "suspect").length;
      return [["Plants seen", t ? `${seen}/${t.plants.length}` : "—"], ["Suspect", t ? String(t.plants.filter((p) => p.status === "suspect").length) : "—"]];
    },
  },
  {
    id: "gps", name: "GPS", hardware: "u-blox NEO-6M / NEO-M8N (UART)", role: "Fixes location for anti-cheat and local AQI",
    pos: [-0.62, 0.3, -0.2], exploded: [-0.35, 0.5, -0.25],
    readings: (t) => [["Fix", t?.gps.fix ?? "—"], ["Satellites", t?.gps.satellites !== undefined ? String(t.gps.satellites) : "—"], ["Lat, lon", t ? `${t.gps.lat.toFixed(5)}, ${t.gps.lon.toFixed(5)}` : "—"]],
  },
  {
    id: "pms", name: "Particulate sensor", hardware: "PMS5003", role: "PM2.5 / PM10 (simulated in the demo)",
    pos: [0.55, 0.06, -0.15], exploded: [0.45, 0.4, -0.3],
    readings: (t) => [["PM2.5", fmt(t?.sensors.pm25_ugm3, 0, " µg/m³")], ["PM10", fmt(t?.sensors.pm10_ugm3, 0, " µg/m³")], ["AQI", fmt(t?.aqi, 0)]],
  },
  {
    id: "mq135", name: "Gas / VOC sensor", hardware: "MQ-135", role: "VOCs and NO₂ (simulated in the demo)",
    pos: [-0.35, 0.08, 0.25], exploded: [-0.45, 0.35, 0.3],
    readings: (t) => [["VOC index", fmt(t?.sensors.voc_index, 0)], ["NO₂", fmt(t?.sensors.no2_ppb, 0, " ppb")], ["CO", fmt(t?.sensors.co_ppm, 2, " ppm")]],
  },
  {
    id: "scd40", name: "CO₂ sensor", hardware: "SCD40", role: "CO₂ (simulated in the demo)",
    pos: [0.25, 0.06, 0.3], exploded: [0.2, 0.5, 0.5],
    readings: (t) => [["CO₂", fmt(t?.sensors.co2_ppm, 0, " ppm")]],
  },
  {
    id: "bme280", name: "Climate sensor", hardware: "BME280", role: "Temperature, humidity, pressure",
    pos: [0.62, 0.06, 0.3], exploded: [0.4, 0.45, 0.35],
    readings: (t) => [["Temp", fmt(t?.sensors.temp_c, 1, " °C")], ["Humidity", fmt(t?.sensors.humidity_pct, 0, " %")], ["Pressure", fmt(t?.sensors.pressure_hpa, 0, " hPa")]],
  },
];

function Part({ def, exploded, selected, onSelect, children }: { def: PartDef; exploded: boolean; selected: boolean; onSelect: (id: string) => void; children: ReactNode }) {
  const ref = useRef<THREE.Group>(null);
  const [hover, setHover] = useState(false);
  const target = useMemo(() => new THREE.Vector3(...def.pos), [def.pos]);
  const explodedTarget = useMemo(() => new THREE.Vector3(...def.pos).add(new THREE.Vector3(...def.exploded)), [def]);
  useFrame((_, dt) => {
    if (!ref.current) return;
    ref.current.position.lerp(exploded ? explodedTarget : target, Math.min(1, dt * 4));
    const s = selected || hover ? 1.06 : 1;
    ref.current.scale.lerp(new THREE.Vector3(s, s, s), Math.min(1, dt * 8));
  });
  return (
    <group
      ref={ref}
      position={def.pos}
      onClick={(e: ThreeEvent<MouseEvent>) => { e.stopPropagation(); onSelect(def.id); }}
      onPointerOver={(e) => { e.stopPropagation(); setHover(true); document.body.style.cursor = "pointer"; }}
      onPointerOut={() => { setHover(false); document.body.style.cursor = ""; }}
    >
      {children}
      {(selected || hover) && (
        <Html position={[0, 0.2, 0]} center style={{ pointerEvents: "none" }}>
          <div className="pill" style={{ color: "var(--text)" }}>{def.name}</div>
        </Html>
      )}
    </group>
  );
}

function Board({ size, color }: { size: Vec3; color: string }) {
  return (
    <mesh castShadow>
      <boxGeometry args={size} />
      <meshStandardMaterial color={color} roughness={0.6} metalness={0.1} />
    </mesh>
  );
}

function Chip({ pos, size, color = "#1b1b1b", metal = 0.2 }: { pos: Vec3; size: Vec3; color?: string; metal?: number }) {
  return (
    <mesh position={pos} castShadow>
      <boxGeometry args={size} />
      <meshStandardMaterial color={color} roughness={0.4} metalness={metal} />
    </mesh>
  );
}

function Bodies({ id, live }: { id: string; live: boolean }) {
  switch (id) {
    case "pi":
      return (
        <group>
          <Board size={[0.85, 0.03, 0.56]} color="#1f7a3e" />
          <Chip pos={[-0.1, 0.03, 0]} size={[0.15, 0.03, 0.15]} color="#c9c9c9" metal={0.8} />
          <Chip pos={[0.15, 0.03, -0.1]} size={[0.1, 0.02, 0.12]} />
          <Chip pos={[0.36, 0.06, -0.15]} size={[0.14, 0.09, 0.16]} color="#b8bec4" metal={0.9} />
          <Chip pos={[0.36, 0.06, 0.12]} size={[0.14, 0.09, 0.16]} color="#b8bec4" metal={0.9} />
          <Chip pos={[-0.2, 0.025, -0.26]} size={[0.4, 0.04, 0.04]} color="#222" />
        </group>
      );
    case "camera":
      return (
        <group>
          <Board size={[0.25, 0.25, 0.02]} color="#1f7a3e" />
          <mesh position={[0, 0, 0.05]} rotation={[Math.PI / 2, 0, 0]} castShadow>
            <cylinderGeometry args={[0.06, 0.07, 0.08, 32]} />
            <meshStandardMaterial color="#111" metalness={0.5} roughness={0.3} />
          </mesh>
          <mesh position={[0, 0, 0.092]}>
            <circleGeometry args={[0.045, 32]} />
            <meshStandardMaterial color="#2b4cff" emissive="#1730c0" emissiveIntensity={live ? 0.9 : 0.1} transparent opacity={0.85} />
          </mesh>
          <mesh position={[0, -0.25, -0.03]} castShadow>
            <boxGeometry args={[0.04, 0.3, 0.04]} />
            <meshStandardMaterial color="#555" metalness={0.6} roughness={0.4} />
          </mesh>
        </group>
      );
    case "gps":
      return (
        <group>
          <Board size={[0.25, 0.02, 0.3]} color="#1d4fa3" />
          <Chip pos={[0, 0.03, 0]} size={[0.18, 0.04, 0.18]} color="#d9c9a3" />
          <Chip pos={[0, 0.055, 0]} size={[0.06, 0.01, 0.06]} color="#c0c0c0" metal={0.9} />
        </group>
      );
    case "pms":
      return <Chip pos={[0, 0, 0]} size={[0.38, 0.17, 0.3]} color="#b7bcc1" metal={0.85} />;
    case "mq135":
      return (
        <group>
          <Board size={[0.22, 0.02, 0.2]} color="#1d4fa3" />
          <mesh position={[0, 0.07, 0]} castShadow>
            <cylinderGeometry args={[0.07, 0.07, 0.12, 24]} />
            <meshStandardMaterial color="#9aa1a8" metalness={0.7} roughness={0.5} wireframe={false} />
          </mesh>
        </group>
      );
    case "scd40":
      return (
        <group>
          <Board size={[0.16, 0.02, 0.16]} color="#2d2d2d" />
          <Chip pos={[0, 0.025, 0]} size={[0.08, 0.03, 0.08]} color="#c0c0c0" metal={0.9} />
        </group>
      );
    case "bme280":
      return (
        <group>
          <Board size={[0.13, 0.02, 0.11]} color="#6b2fa0" />
          <Chip pos={[0, 0.02, 0]} size={[0.035, 0.015, 0.035]} color="#c0c0c0" metal={0.9} />
        </group>
      );
    default:
      return null;
  }
}

function Enclosure({ exploded }: { exploded: boolean }) {
  const lid = useRef<THREE.Mesh>(null);
  useFrame((_, dt) => {
    if (!lid.current) return;
    const y = exploded ? 1.2 : 0.48;
    lid.current.position.y += (y - lid.current.position.y) * Math.min(1, dt * 4);
    const m = lid.current.material as THREE.MeshPhysicalMaterial;
    m.opacity += ((exploded ? 0.06 : 0.16) - m.opacity) * Math.min(1, dt * 4);
  });
  return (
    <group>
      <RoundedBox args={[1.7, 0.08, 1.2]} radius={0.03} position={[0, -0.3, 0]} receiveShadow>
        <meshStandardMaterial color="#2a3532" roughness={0.8} />
      </RoundedBox>
      <mesh ref={lid} position={[0, 0.48, 0]}>
        <boxGeometry args={[1.72, 0.04, 1.22]} />
        <meshPhysicalMaterial color="#9fd8c0" transparent opacity={0.16} roughness={0.1} />
      </mesh>
      <mesh position={[0, 0.09, 0]}>
        <boxGeometry args={[1.7, 0.74, 1.2]} />
        <meshPhysicalMaterial color="#9fd8c0" transparent opacity={0.05} roughness={0.1} depthWrite={false} />
      </mesh>
    </group>
  );
}

export function MinerModel() {
  const telemetry = useTwin((s) => s.telemetry);
  const [exploded, setExploded] = useState(false);
  const [selected, setSelected] = useState<string | undefined>();
  const [spin, setSpin] = useState(true);
  const part = PARTS.find((p) => p.id === selected);
  const live = !!telemetry;

  return (
    <>
      <Canvas shadows camera={{ position: [2.4, 1.9, 2.7], fov: 40 }} onPointerMissed={() => setSelected(undefined)} dpr={[1, 2]}>
        <color attach="background" args={["#0f1715"]} />
        <ambientLight intensity={0.55} />
        <directionalLight position={[3, 5, 2]} intensity={1.6} castShadow shadow-mapSize={[1024, 1024]} />
        <directionalLight position={[-3, 2, -2]} intensity={0.4} color="#9fd8c0" />
        <Enclosure exploded={exploded} />
        {PARTS.map((def) => (
          <Part key={def.id} def={def} exploded={exploded} selected={selected === def.id} onSelect={setSelected}>
            <Bodies id={def.id} live={live} />
          </Part>
        ))}
        <mesh rotation={[-Math.PI / 2, 0, 0]} position={[0, -0.35, 0]} receiveShadow>
          <circleGeometry args={[2.4, 48]} />
          <meshStandardMaterial color="#121b18" />
        </mesh>
        <OrbitControls autoRotate={spin && !selected} autoRotateSpeed={0.8} enablePan={false} minDistance={1.6} maxDistance={6} target={[0, 0.05, 0]} />
      </Canvas>
      <div className="overlay model-controls">
        <button className={exploded ? "active" : ""} onClick={() => setExploded((e) => !e)}>{exploded ? "Assemble" : "Explode"}</button>
        <button className={spin ? "active" : ""} onClick={() => setSpin((s) => !s)}>Rotate</button>
        <span className="hint">Click a part for live readings</span>
      </div>
      {part && (
        <div className="overlay part-card">
          <h3>{part.name}</h3>
          <p>{part.hardware}<br />{part.role}</p>
          <div className="kv">
            {part.readings(telemetry).map(([k, v]) => (
              <Fragment key={k}><span>{k}</span><b>{v}</b></Fragment>
            ))}
          </div>
        </div>
      )}
    </>
  );
}
