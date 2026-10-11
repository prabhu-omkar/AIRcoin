// The physical rig: a 4 x 5 plant rack, one pot per tagged slot, each driven by the C2 plant status.
import { Html } from "@react-three/drei";
import { useFrame, type ThreeEvent } from "@react-three/fiber";
import { useMemo, useRef } from "react";
import * as THREE from "three";
import { rigLayout, type RigPlant } from "../../config";
import type { PlantStatus, TelemetryPlant } from "../../contracts";
import { useTwin } from "../../store";
import { easeInOut, easeOut, makePlantMaterial, STATUS_COLOR } from "./materials";
import { buildPlant } from "./plants";
import { markerTexture, noiseTexture, woodTexture } from "./textures";

export const RIG = {
  colX: 2.3,
  rowGap: 2.9,
  baseY: 0.55,
  z: 0,
  potH: 0.8,
  potR: 0.44,
  plankDepth: 1.6,
};

const ROWS = rigLayout.rows;
const COLS = rigLayout.cols;
export const RACK_W = COLS * RIG.colX + 0.6;
export const RACK_H = RIG.baseY + ROWS * RIG.rowGap + 0.4;
export const PLANT_MAX_H = 1.9;

/** Top surface of the plank for grid row r (row 0 is the top shelf, as in the camera image). */
export const plankTop = (row: number) => RIG.baseY + (ROWS - 1 - row) * RIG.rowGap;

/** World position of the soil surface for a slot. */
export function slotPosition(slot: number): THREE.Vector3 {
  const row = Math.floor(slot / COLS);
  const col = slot % COLS;
  return new THREE.Vector3((col - (COLS - 1) / 2) * RIG.colX, plankTop(row) + RIG.potH, RIG.z);
}

// Sticker on the pot front, slot-local. The marker square sits in the upper part of the label.
const STICKER = { y: -0.4, z: RIG.potR * 0.94 + 0.012, w: 0.36, h: 0.45, tilt: 0.1, marker: 0.27, markerDy: 0.062 };

/** World corners of the ArUco marker on a slot's pot (TL, TR, BR, BL as seen by the camera). */
export function markerCorners(slot: number): THREE.Vector3[] {
  const base = slotPosition(slot);
  const m = new THREE.Matrix4().makeRotationX(STICKER.tilt).setPosition(base.x, base.y + STICKER.y, base.z + STICKER.z);
  const h = STICKER.marker / 2;
  return [[-h, h], [h, h], [h, -h], [-h, -h]].map(([x, y]) => new THREE.Vector3(x, y + STICKER.markerDy, 0).applyMatrix4(m));
}

// ---------- shared geometry and materials ----------
const potGeometry = (() => {
  const h = RIG.potH;
  const R = RIG.potR;
  const pts = [
    [0, -h], [R * 0.74, -h], [R * 0.78, -h + 0.03], [R * 0.93, -0.16], [R * 1.0, -0.14],
    [R * 1.06, -0.12], [R * 1.07, 0.04], [R * 1.04, 0.07], [R * 0.95, 0.07], [R * 0.93, 0.0], [R * 0.9, -0.06],
  ].map(([x, y]) => new THREE.Vector2(x, y));
  const g = new THREE.LatheGeometry(pts, 40);
  g.computeVertexNormals();
  return g;
})();
const soilGeometry = new THREE.CircleGeometry(RIG.potR * 0.91, 32).rotateX(-Math.PI / 2).translate(0, -0.05, 0);
const stickerGeometry = new THREE.PlaneGeometry(STICKER.w, STICKER.h);
const ringGeometry = new THREE.RingGeometry(RIG.potR * 1.15, RIG.potR * 1.32, 48).rotateX(-Math.PI / 2);
const ledGeometry = new THREE.BoxGeometry(0.55, 0.05, 0.02);
const scarGeometry = new THREE.CircleGeometry(RIG.potR * 0.78, 32).rotateX(-Math.PI / 2);

let shared: ReturnType<typeof makeShared> | undefined;
function makeShared() {
  const terracotta = new THREE.MeshStandardMaterial({ color: "#b8643f", roughness: 0.92, map: noiseTexture("terracotta", "#d7d0c8", 0.18) });
  const soil = new THREE.MeshStandardMaterial({ color: "#3b2a1e", roughness: 1, map: noiseTexture("soil", "#9a8a7a", 0.6) });
  soil.map!.repeat.set(2, 2);
  const wood = new THREE.MeshStandardMaterial({ map: woodTexture(), roughness: 0.7 });
  const steel = new THREE.MeshStandardMaterial({ color: "#2b3036", roughness: 0.4, metalness: 0.75 });
  const back = new THREE.MeshStandardMaterial({ color: "#b8c0c6", roughness: 0.9, map: noiseTexture("back", "#cfd6d2", 0.08) });
  const growLight = new THREE.MeshStandardMaterial({ color: "#000", emissive: new THREE.Color("#fff3df"), emissiveIntensity: 3.2, toneMapped: false });
  const ledHousing = new THREE.MeshStandardMaterial({ color: "#2a2e31", metalness: 0.7, roughness: 0.35 });
  const scar = new THREE.MeshStandardMaterial({ color: "#20160f", roughness: 1, transparent: true, opacity: 0.55, depthWrite: false });
  return { terracotta, soil, wood, steel, back, growLight, ledHousing, scar };
}
function useShared() {
  if (!shared) shared = makeShared();
  return shared;
}

function Shelf() {
  const m = useShared();
  const halfW = RACK_W / 2;
  const d = RIG.plankDepth;
  const uprightH = RACK_H + 0.3;
  return (
    <group position={[0, 0, RIG.z]}>
      {[-1, 1].flatMap((sx) => [-1, 1].map((sz) => (
        <mesh key={`${sx}${sz}`} position={[sx * halfW, uprightH / 2, sz * (d / 2 - 0.06)]} material={m.steel} castShadow receiveShadow>
          <boxGeometry args={[0.12, uprightH, 0.12]} />
        </mesh>
      )))}
      {Array.from({ length: ROWS }, (_, row) => {
        const y = plankTop(row) - 0.06;
        return (
          <group key={row}>
            <mesh position={[0, y, 0]} material={m.wood} castShadow receiveShadow>
              <boxGeometry args={[RACK_W + 0.1, 0.12, d]} />
            </mesh>
            <mesh position={[0, y - 0.04, d / 2 + 0.02]} material={m.steel} castShadow>
              <boxGeometry args={[RACK_W + 0.12, 0.2, 0.04]} />
            </mesh>
            <pointLight position={[0, y + RIG.rowGap - 0.5, 0.9]} color="#fff1dc" intensity={7} distance={6.5} decay={1.6} />
            <group position={[0, y + RIG.rowGap - 0.2, -0.1]}>
              <mesh material={m.ledHousing}>
                <boxGeometry args={[RACK_W - 0.6, 0.07, 0.22]} />
              </mesh>
              <mesh position={[0, -0.04, 0]} material={m.growLight}>
                <boxGeometry args={[RACK_W - 0.7, 0.012, 0.14]} />
              </mesh>
            </group>
          </group>
        );
      })}
      <mesh position={[0, RACK_H + 0.15, 0]} material={m.steel} castShadow>
        <boxGeometry args={[RACK_W + 0.12, 0.08, d]} />
      </mesh>
      <mesh position={[0, uprightH / 2, -d / 2 - 0.02]} material={m.back} receiveShadow>
        <boxGeometry args={[RACK_W + 0.12, uprightH, 0.04]} />
      </mesh>
    </group>
  );
}

/** Grow scale from the measured leaf area, normalised so every species fits under the shelf above. */
function sizeScale(p: TelemetryPlant | undefined, height: number): number {
  const a = p?.leaf_area_cm2 && p.leaf_area_cm2 > 0 ? p.leaf_area_cm2 : 480;
  const fit = Math.min(2.1, PLANT_MAX_H / Math.max(height, 0.3));
  return fit * THREE.MathUtils.clamp(Math.sqrt(a / 480), 0.8, 1.15);
}

const MOVE_S = 1.1;
const LIFT = 2.6;

/** Plants also sit on this layer so the camera's NDVI view can render them in a separate pass. */
export const PLANT_LAYER = 1;
const NDVI_LOW = new THREE.Color("#2340a0");
const NDVI_MID = new THREE.Color("#e8d33a");
const NDVI_HIGH = new THREE.Color("#2fbf4a");
/** NDVI false colour: blue = no living tissue (plastic), yellow = weak, green = healthy. */
function ndviColour(alive: number, out: THREE.Color) {
  return alive < 0.5 ? out.copy(NDVI_LOW).lerp(NDVI_MID, alive * 2) : out.copy(NDVI_MID).lerp(NDVI_HIGH, (alive - 0.5) * 2);
}

interface SlotProps {
  rp: RigPlant;
  vision: boolean;
  selected: boolean;
  labels: boolean;
  ndvi: boolean;
  onSelect?: (tag: number) => void;
}

function PlantSlot({ rp, vision, selected, labels, ndvi, onSelect }: SlotProps) {
  const m = useShared();
  const p = useTwin((s) => s.telemetry?.plants.find((x) => x.tag_id === rp.tag_id));
  const status: PlantStatus = p?.status ?? "missing";
  const lost = status === "missing" || status === "removed";
  const pos = useMemo(() => slotPosition(rp.slot), [rp.slot]);
  const model = useMemo(() => buildPlant(rp.species, rp.tag_id + 1, RIG.potR), [rp.species, rp.tag_id]);
  const mat = useMemo(() => makePlantMaterial(), []);
  const ndviMat = useMemo(() => new THREE.MeshBasicMaterial({ side: THREE.DoubleSide }), []);
  const ghostMat = useMemo(() => new THREE.MeshBasicMaterial({ wireframe: true, transparent: true, opacity: 0, depthWrite: false, toneMapped: false }), []);
  const ledMat = useMemo(() => new THREE.MeshStandardMaterial({ color: "#111", emissive: STATUS_COLOR.present.clone(), emissiveIntensity: 2, toneMapped: false }), []);
  const ringMat = useMemo(() => new THREE.MeshBasicMaterial({ color: "#f4f4f5", transparent: true, opacity: 0, depthWrite: false }), []);
  const stickerMat = useMemo(() => new THREE.MeshStandardMaterial({ map: markerTexture(rp.tag_id), roughness: 0.45 }), [rp.tag_id]);
  const bracket = useMemo(() => {
    const w = 1.0;
    const top = PLANT_MAX_H + 0.25;
    const bot = -RIG.potH + 0.05;
    const k = 0.22;
    const c = [
      [-w, top, -w + k, top], [-w, top, -w, top - k], [w, top, w - k, top], [w, top, w, top - k],
      [-w, bot, -w + k, bot], [-w, bot, -w, bot + k], [w, bot, w - k, bot], [w, bot, w, bot + k],
    ];
    const g = new THREE.BufferGeometry();
    g.setAttribute("position", new THREE.Float32BufferAttribute(c.flatMap(([x0, y0, x1, y1]) => [x0, y0, 0, x1, y1, 0]), 3));
    return { geometry: g, material: new THREE.LineBasicMaterial({ transparent: true }), top };
  }, []);

  const potRef = useRef<THREE.Group>(null);
  const ghostRef = useRef<THREE.Group>(null);
  // 0 = pot on the shelf, 1 = lifted away; eased towards the reported status
  const away = useRef(lost ? 1 : 0);
  const scale = sizeScale(p, model.height);

  useFrame(({ clock }, dt0) => {
    const dt = Math.min(dt0, 0.1);
    const k = Math.min(1, dt * 3);
    away.current = THREE.MathUtils.clamp(away.current + (lost ? 1 : -1) * (dt / MOVE_S), 0, 1);
    const a = away.current;
    const e = lost ? easeInOut(a) : 1 - easeOut(1 - a);
    if (potRef.current) {
      potRef.current.position.set(0, e * LIFT, e * 1.4);
      potRef.current.scale.setScalar(Math.max(0.001, 1 - Math.max(0, a - 0.6) / 0.4));
      potRef.current.visible = a < 0.999;
    }
    const alive = p?.alive_score ?? 1;
    const u = mat.userData.u;
    u.uSat.value += ((status === "suspect" && alive < 0.4 ? 0.3 : 0.55 + 0.45 * alive) - u.uSat.value) * k;
    mat.emissive.setRGB(0.9, 0.2, 0.18);
    mat.emissiveIntensity += ((status === "suspect" ? 0.18 : 0) - mat.emissiveIntensity) * k;
    ndviColour(status === "suspect" ? Math.min(alive, 0.15) : alive, ndviMat.color);
    ghostMat.opacity += ((lost ? 0.1 : 0) - ghostMat.opacity) * k;
    ghostMat.color.copy(STATUS_COLOR[status]);
    if (ghostRef.current) ghostRef.current.visible = ghostMat.opacity > 0.01;
    ledMat.emissive.lerp(STATUS_COLOR[status], k);
    bracket.material.color.copy(STATUS_COLOR[status]);
    bracket.material.opacity = selected ? 1 : 0.7;
    ringMat.opacity += ((selected ? 0.6 + 0.2 * Math.sin(clock.elapsedTime * 4) : 0) - ringMat.opacity) * k;
  });

  const click = (e: ThreeEvent<MouseEvent>) => {
    if (!onSelect || e.delta > 6) return;
    e.stopPropagation();
    onSelect(rp.tag_id);
  };

  return (
    <group
      position={pos}
      onClick={click}
      onPointerOver={(e) => { if (onSelect) { e.stopPropagation(); document.body.style.cursor = "pointer"; } }}
      onPointerOut={() => (document.body.style.cursor = "")}
    >
      <group ref={potRef}>
        <mesh geometry={potGeometry} material={m.terracotta} castShadow receiveShadow />
        <mesh geometry={soilGeometry} material={m.soil} receiveShadow />
        <mesh geometry={stickerGeometry} position={[0, STICKER.y, STICKER.z]} rotation={[STICKER.tilt, 0, 0]} material={stickerMat} />
        <mesh geometry={model.geometry} material={ndvi ? ndviMat : mat} position={[0, -0.04, 0]} scale={scale} castShadow ref={(o) => o?.layers.enable(PLANT_LAYER)} />
      </group>
      {lost && <mesh geometry={scarGeometry} position={[0, -RIG.potH + 0.008, 0]} material={m.scar} />}
      <group ref={ghostRef} visible={false}>
        <mesh geometry={potGeometry} material={ghostMat} />
        <mesh geometry={model.geometry} material={ghostMat} position={[0, -0.04, 0]} scale={scale} />
      </group>
      <mesh geometry={ledGeometry} position={[0, -RIG.potH - 0.1, RIG.plankDepth / 2 + 0.045]} material={ledMat} />
      <mesh geometry={ringGeometry} position={[0, -RIG.potH + 0.012, 0]} material={ringMat} />
      {vision && labels && (
        <group position={[0, 0, RIG.potR + 0.1]}>
          <lineSegments geometry={bracket.geometry} material={bracket.material} />
          {(selected || status !== "present") && (
            <Html position={[-1.0, bracket.top + 0.12, 0]} style={{ pointerEvents: "none" }} zIndexRange={[5, 0]}>
              <div className={`vision-tag ${status}`}>#{rp.tag_id} · {status}</div>
            </Html>
          )}
        </group>
      )}
    </group>
  );
}

export function Rig({ vision, selected, onSelect, labels = true, ndvi = false }: { vision: boolean; selected?: number; onSelect?: (tag: number) => void; labels?: boolean; ndvi?: boolean }) {
  return (
    <group>
      <Shelf />
      {rigLayout.plants.map((rp) => (
        <PlantSlot key={rp.tag_id} rp={rp} vision={vision} selected={selected === rp.tag_id} onSelect={onSelect} labels={labels} ndvi={ndvi} />
      ))}
    </group>
  );
}
