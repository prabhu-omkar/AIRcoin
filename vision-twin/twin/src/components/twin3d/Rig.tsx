// The physical rig: a 4 x 5 plant rack, one pot per tagged slot.
// Two layers drive each slot:
//  - physical: what is really in the pot (mock tampering animates immediately: pot lifted out, plant swapped)
//  - detected: the C2 status the miner reports (LED, ghost, brackets); it catches up after the debounce.
import { Html } from "@react-three/drei";
import { useFrame, type ThreeEvent } from "@react-three/fiber";
import { useEffect, useMemo, useRef, useState } from "react";
import * as THREE from "three";
import { rigLayout, type RigPlant } from "../../config";
import type { PlantStatus, TelemetryPlant } from "../../contracts";
import { useTwin, type Tamper } from "../../store";
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

/** Plants also live on layer 1 so the camera's NDVI view can draw them in a separate pass. */
export const PLANT_LAYER = 1;
const tagPlant = (o: THREE.Object3D | null) => o?.layers.enable(PLANT_LAYER);

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
  const steel = new THREE.MeshStandardMaterial({ color: "#1b1f22", roughness: 0.45, metalness: 0.8 });
  const back = new THREE.MeshStandardMaterial({ color: "#3a4541", roughness: 0.9, map: noiseTexture("back", "#cfd6d2", 0.08) });
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

const STATUS_TEXT: Record<PlantStatus, string> = { present: "healthy", missing: "missing", removed: "removed", suspect: "suspect" };
type Variant = "real" | "fake" | "swap" | "none";

function targetVariant(phys: { kind: Tamper } | undefined, status: PlantStatus): Variant {
  if (phys) return phys.kind === "removed" ? "none" : phys.kind;
  return status === "missing" || status === "removed" ? "none" : "real";
}

/** Grow scale from the measured leaf area, normalised so every species fits under the shelf above. */
function sizeScale(p: TelemetryPlant | undefined, height: number): number {
  const a = p?.leaf_area_cm2 && p.leaf_area_cm2 > 0 ? p.leaf_area_cm2 : 480;
  const fit = Math.min(2.1, PLANT_MAX_H / Math.max(height, 0.3));
  return fit * THREE.MathUtils.clamp(Math.sqrt(a / 480), 0.8, 1.15);
}

const OUT_S = 1.1;
const IN_S = 1.2;
const LIFT = 2.6;
const PUFF_N = 28;

/** Live "what the miner will do next" hint while detection catches up with a tamper. */
function Countdown({ phys, status }: { phys: { kind: Tamper; at: number }; status: PlantStatus }) {
  const [, tick] = useState(0);
  useEffect(() => {
    const id = setInterval(() => tick((n) => n + 1), 250);
    return () => clearInterval(id);
  }, []);
  const s = (Date.now() - phys.at) / 1000;
  let text: string | undefined;
  let cls = "warn";
  if (phys.kind === "removed") {
    if (status === "present") text = `tag lost · missing in ${Math.max(0, 10 - s).toFixed(0)}s`;
    else if (status === "missing") text = `unseen ${s.toFixed(0)}s · removed in ${Math.max(0, 60 - s).toFixed(0)}s`;
  } else if (status === "present") {
    text = phys.kind === "fake" ? `NDVI check… ${Math.max(0, 3 - s).toFixed(0)}s` : `matching species… ${Math.max(0, 3 - s).toFixed(0)}s`;
    cls = "info";
  }
  if (!text) return null;
  return <div className={`countdown ${cls}`}>{text}</div>;
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
  const phys = useTwin((s) => s.physical[rp.tag_id]);
  const status: PlantStatus = p?.status ?? "missing";
  const target = targetVariant(phys, status);
  const pos = useMemo(() => slotPosition(rp.slot), [rp.slot]);

  const swapSpecies = rigLayout.plants[(rp.slot + 7) % rigLayout.plants.length].species;
  const models = useMemo(() => ({
    real: buildPlant(rp.species, rp.tag_id + 1, RIG.potR),
    swap: buildPlant(swapSpecies, rp.tag_id + 101, RIG.potR),
  }), [rp.species, rp.tag_id, swapSpecies]);
  const mats = useMemo(() => ({ real: makePlantMaterial(), swap: makePlantMaterial(), fake: makePlantMaterial({ plastic: true }) }), []);
  const ghostMat = useMemo(() => new THREE.MeshBasicMaterial({ color: "#d9a441", wireframe: true, transparent: true, opacity: 0, depthWrite: false, blending: THREE.AdditiveBlending, toneMapped: false }), []);
  const ledMat = useMemo(() => new THREE.MeshStandardMaterial({ color: "#111", emissive: STATUS_COLOR.present.clone(), emissiveIntensity: 2.5, toneMapped: false }), []);
  const ringMat = useMemo(() => new THREE.MeshBasicMaterial({ color: "#ebe8df", transparent: true, opacity: 0, toneMapped: false, depthWrite: false }), []);
  const stickerMat = useMemo(() => new THREE.MeshStandardMaterial({ map: markerTexture(rp.tag_id), roughness: 0.45 }), [rp.tag_id]);
  const puff = useMemo(() => {
    const g = new THREE.BufferGeometry();
    g.setAttribute("position", new THREE.BufferAttribute(new Float32Array(PUFF_N * 3), 3));
    const mat = new THREE.PointsMaterial({ color: "#6b4a30", size: 0.07, transparent: true, opacity: 0, depthWrite: false });
    const vel = new Float32Array(PUFF_N * 3);
    return { g, mat, vel, born: -10 };
  }, []);

  const potRef = useRef<THREE.Group>(null);
  const plantRef = useRef<THREE.Group>(null);
  const ghostRef = useRef<THREE.Group>(null);
  const puffRef = useRef<THREE.Points>(null);
  const [shown, setShown] = useState<Variant>(target);
  const anim = useRef({ phase: "idle" as "idle" | "out" | "in", t: 0, which: "plant" as "pot" | "plant", from: target as Variant, landed: false });
  const shownRef = useRef<Variant>(target);
  const baseScale = useRef(1);
  useEffect(() => {
    baseScale.current = sizeScale(p, models.real.height);
  }, []); // eslint-disable-line react-hooks/exhaustive-deps

  const firePuff = (y: number, t: number) => {
    const a = puff.g.attributes.position.array as Float32Array;
    for (let i = 0; i < PUFF_N; i++) {
      const ang = Math.random() * Math.PI * 2;
      const r = RIG.potR * (0.4 + Math.random() * 0.6);
      a.set([Math.cos(ang) * r, y, Math.sin(ang) * r], i * 3);
      puff.vel.set([Math.cos(ang) * (0.4 + Math.random() * 0.8), 0.6 + Math.random() * 1.2, Math.sin(ang) * (0.4 + Math.random() * 0.8)], i * 3);
    }
    puff.born = t;
    puff.g.attributes.position.needsUpdate = true;
  };

  const model = shown === "swap" ? models.swap : models.real;
  const scale = sizeScale(p, model.height);
  const ghostScale = sizeScale(p, models.real.height);

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
    return { geometry: g, material: new THREE.LineBasicMaterial({ color: STATUS_COLOR.present.clone().multiplyScalar(2), transparent: true, toneMapped: false }), top };
  }, []);

  const tmpColor = useMemo(() => new THREE.Color(), []);
  useFrame(({ clock }, dt0) => {
    const dt = Math.min(dt0, 0.1);
    const t = clock.elapsedTime;
    const k = Math.min(1, dt * 3);
    const a = anim.current;

    // ---- physical animation state machine ----
    if (a.phase === "idle" && shownRef.current !== target) {
      a.from = shownRef.current;
      if (shownRef.current === "none") {
        shownRef.current = target;
        setShown(target);
        a.phase = "in";
        a.which = "pot";
      } else {
        a.phase = "out";
        a.which = target === "none" ? "pot" : "plant";
        firePuff(a.which === "pot" ? -RIG.potH + 0.05 : -0.04, t);
      }
      a.t = 0;
      a.landed = false;
    }
    let potY = 0, potZ = 0, potTilt = 0, potS = 1, plantY = 0, plantS = 1, plantTilt = 0;
    if (a.phase === "out") {
      a.t = Math.min(1, a.t + dt / OUT_S);
      const e = easeInOut(a.t);
      const fade = a.t < 0.65 ? 1 : 1 - (a.t - 0.65) / 0.35;
      if (a.which === "pot") { potY = e * LIFT; potZ = e * 1.4; potTilt = Math.sin(a.t * Math.PI) * 0.12; potS = Math.max(0.001, fade); }
      else { plantY = e * LIFT; plantTilt = Math.sin(a.t * Math.PI) * 0.18; plantS = Math.max(0.001, fade); }
      if (a.t >= 1) {
        const next = target;
        shownRef.current = next;
        setShown(next);
        if (next === "none") a.phase = "idle";
        else { a.phase = "in"; a.which = a.which === "pot" ? "pot" : "plant"; a.t = 0; a.landed = false; }
      }
    } else if (a.phase === "in") {
      a.t = Math.min(1, a.t + dt / IN_S);
      const e = easeOut(Math.min(1, a.t / 0.8));
      const drop = (1 - e) * LIFT;
      const squash = a.t > 0.8 ? Math.sin(((a.t - 0.8) / 0.2) * Math.PI) * 0.06 : 0;
      if (a.which === "pot") { potY = drop - squash * 0.3; potZ = (1 - e) * 1.4; potS = Math.min(1, 0.35 + a.t * 1.3); }
      else { plantY = drop; plantS = Math.min(1, 0.35 + a.t * 1.3); plantTilt = (1 - e) * -0.12; }
      if (!a.landed && a.t > 0.78) {
        a.landed = true;
        firePuff(a.which === "pot" ? -RIG.potH + 0.05 : -0.04, t);
      }
      if (a.t >= 1) a.phase = "idle";
    }
    if (potRef.current) {
      potRef.current.position.set(0, potY, potZ);
      potRef.current.rotation.x = potTilt;
      potRef.current.scale.setScalar(potS);
      potRef.current.visible = shownRef.current !== "none" || a.phase === "out";
    }
    if (plantRef.current) {
      if (a.phase === "in" && a.t < 0.05) baseScale.current = scale;
      baseScale.current += (scale - baseScale.current) * Math.min(1, dt * 2);
      plantRef.current.position.set(0, -0.04 + plantY, 0);
      plantRef.current.rotation.z = plantTilt;
      plantRef.current.scale.setScalar(Math.max(0.0001, baseScale.current * plantS));
      plantRef.current.visible = shown !== "none";
    }

    // ---- puff of soil ----
    const age = t - puff.born;
    if (puffRef.current) {
      puffRef.current.visible = age < 1.2;
      if (age < 1.2) {
        const arr = puff.g.attributes.position.array as Float32Array;
        for (let i = 0; i < PUFF_N; i++) {
          arr[i * 3] += puff.vel[i * 3] * dt;
          arr[i * 3 + 1] += puff.vel[i * 3 + 1] * dt;
          arr[i * 3 + 2] += puff.vel[i * 3 + 2] * dt;
          puff.vel[i * 3 + 1] -= 4 * dt;
        }
        puff.g.attributes.position.needsUpdate = true;
        puff.mat.opacity = 0.9 * (1 - age / 1.2);
      }
    }

    // ---- detection-driven look ----
    const alive = p?.alive_score ?? 1;
    const pulse = 0.5 + 0.5 * Math.sin(t * 5);
    for (const key of ["real", "swap", "fake"] as const) {
      const mat = mats[key];
      const u = mat.userData.u;
      u.uNdvi.value = ndvi ? 1 : 0;
      const satTarget = key === "fake" ? 1 : status === "suspect" && alive < 0.4 ? 0.3 : 0.55 + 0.45 * alive;
      u.uSat.value += (satTarget - u.uSat.value) * k;
      mat.emissive.setRGB(1, 0.08, 0.12);
      mat.emissiveIntensity += ((status === "suspect" && !ndvi ? 0.06 + 0.22 * pulse : 0) - mat.emissiveIntensity) * k;
    }
    const lost = status === "missing" || status === "removed";
    const ghostTarget = lost && !ndvi ? 0.05 + 0.07 * (0.5 + 0.5 * Math.sin(t * 2.2)) : 0;
    ghostMat.opacity += (ghostTarget - ghostMat.opacity) * k;
    ghostMat.color.copy(status === "removed" ? STATUS_COLOR.removed : STATUS_COLOR.missing);
    if (ghostRef.current) ghostRef.current.visible = ghostMat.opacity > 0.01;
    tmpColor.copy(STATUS_COLOR[status]);
    ledMat.emissive.lerp(tmpColor, k);
    ledMat.emissiveIntensity = status === "suspect" ? 1.5 + 2.5 * pulse : status === "removed" ? 0.6 : 2.5;
    bracket.material.color.copy(STATUS_COLOR[status]).multiplyScalar(selected ? 3 : 1.8);
    bracket.material.opacity = status === "present" ? 0.75 : 0.55 + 0.45 * pulse;
    ringMat.opacity += ((selected ? 0.55 + 0.35 * pulse : 0) - ringMat.opacity) * k;
  });

  const click = (e: ThreeEvent<MouseEvent>) => {
    if (!onSelect || e.delta > 6) return;
    e.stopPropagation();
    onSelect(rp.tag_id);
  };
  const over = (e: ThreeEvent<PointerEvent>) => {
    if (!onSelect) return;
    e.stopPropagation();
    document.body.style.cursor = "pointer";
  };
  const out = () => (document.body.style.cursor = "");
  const plantMat = shown === "fake" ? mats.fake : shown === "swap" ? mats.swap : mats.real;

  return (
    <group position={pos} onClick={click} onPointerOver={over} onPointerOut={out}>
      {/* the pot (lifted away when removed) */}
      <group ref={potRef}>
        <mesh geometry={potGeometry} material={m.terracotta} castShadow receiveShadow />
        <mesh geometry={soilGeometry} material={m.soil} receiveShadow />
        <mesh geometry={stickerGeometry} position={[0, STICKER.y, STICKER.z]} rotation={[STICKER.tilt, 0, 0]} material={stickerMat} />
        <group ref={plantRef} position={[0, -0.04, 0]} scale={scale}>
          <mesh geometry={model.geometry} material={plantMat} castShadow ref={tagPlant} />
        </group>
      </group>
      {/* ring of soil left on the shelf where the pot stood */}
      {shown === "none" && <mesh geometry={scarGeometry} position={[0, -RIG.potH + 0.008, 0]} material={m.scar} />}
      <points ref={puffRef} geometry={puff.g} material={puff.mat} visible={false} frustumCulled={false} />
      {/* detection ghost: what the miner last saw */}
      <group ref={ghostRef} visible={false}>
        <mesh geometry={potGeometry} material={ghostMat} />
        <mesh geometry={models.real.geometry} material={ghostMat} position={[0, -0.04, 0]} scale={ghostScale} />
      </group>
      {/* status LED on the shelf lip */}
      <mesh geometry={ledGeometry} position={[0, -RIG.potH - 0.1, RIG.plankDepth / 2 + 0.045]} material={ledMat} />
      <mesh geometry={ringGeometry} position={[0, -RIG.potH + 0.012, 0]} material={ringMat} />
      {vision && labels && (
        <group position={[0, 0, RIG.potR + 0.1]}>
          <lineSegments geometry={bracket.geometry} material={bracket.material} />
          {(selected || status !== "present") && (
            <Html position={[-1.0, bracket.top + 0.12, 0]} style={{ pointerEvents: "none" }} zIndexRange={[5, 0]}>
              <div className={`vision-tag ${status}`}>
                #{rp.tag_id} · {status === "present" ? `${Math.round((p?.species_conf ?? 0) * 100)}%` : STATUS_TEXT[status]}
              </div>
            </Html>
          )}
        </group>
      )}
      {labels && phys && (
        <Html position={[0, PLANT_MAX_H * 0.55, 0.6]} center style={{ pointerEvents: "none" }} zIndexRange={[6, 0]}>
          <Countdown phys={phys} status={status} />
        </Html>
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
