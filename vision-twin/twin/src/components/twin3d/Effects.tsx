// Scene effects driven by live data: smog particles (AQI), clean-air motes (plant rates),
// the camera's vision frustum and scan sweep, and AIR coins rising on each mint.
import { Html } from "@react-three/drei";
import { useFrame } from "@react-three/fiber";
import { useEffect, useMemo, useRef, useState } from "react";
import * as THREE from "three";
import { rigLayout } from "../../config";
import { fromBaseUnits } from "../../contracts";
import { useTwin } from "../../store";
import { sharedTime } from "./materials";
import { RACK_H, RACK_W, RIG, slotPosition } from "./Rig";
import { coinTexture } from "./textures";

const pointsVertex = /* glsl */ `
  attribute float aSize;
  attribute float aAlpha;
  varying float vAlpha;
  uniform float uScale;
  void main() {
    vec4 mv = modelViewMatrix * vec4(position, 1.0);
    gl_Position = projectionMatrix * mv;
    gl_PointSize = min(aSize * uScale / -mv.z, 5.0);
    vAlpha = aAlpha;
  }
`;
const pointsFragment = /* glsl */ `
  uniform vec3 uColor;
  uniform float uOpacity;
  varying float vAlpha;
  void main() {
    vec2 c = gl_PointCoord - 0.5;
    float d = length(c);
    if (d > 0.5) discard;
    float a = smoothstep(0.5, 0.0, d);
    gl_FragColor = vec4(uColor, a * a * vAlpha * uOpacity);
  }
`;

function pointsMaterial(color: string, opacity: number, blending: THREE.Blending) {
  return new THREE.ShaderMaterial({
    vertexShader: pointsVertex,
    fragmentShader: pointsFragment,
    uniforms: { uColor: { value: new THREE.Color(color) }, uOpacity: { value: opacity }, uScale: { value: 300 } },
    transparent: true,
    depthWrite: false,
    blending,
  });
}

const HAZE_N = 5000;
const HAZE_BOUNDS = { x: 9, y0: 0.1, y1: 13, z0: 0.6, z1: 14 };
const CLEAN = new THREE.Color("#a9e8d2");
const DIRTY = new THREE.Color("#c99a5b");
const SMOG = new THREE.Color("#a8653a");

/** PM2.5 haze: density and colour follow the AQI; particles drift into the rack and are absorbed. */
export function Haze({ density = 1 }: { density?: number }) {
  const aqi = useTwin((s) => s.telemetry?.aqi ?? 120);
  const { geo, vel, life } = useMemo(() => {
    const g = new THREE.BufferGeometry();
    const pos = new Float32Array(HAZE_N * 3);
    const size = new Float32Array(HAZE_N);
    const alpha = new Float32Array(HAZE_N);
    const v = new Float32Array(HAZE_N * 3);
    const l = new Float32Array(HAZE_N);
    for (let i = 0; i < HAZE_N; i++) {
      pos[i * 3] = (Math.random() * 2 - 1) * HAZE_BOUNDS.x;
      pos[i * 3 + 1] = HAZE_BOUNDS.y0 + Math.random() * (HAZE_BOUNDS.y1 - HAZE_BOUNDS.y0);
      pos[i * 3 + 2] = HAZE_BOUNDS.z0 + Math.random() * (HAZE_BOUNDS.z1 - HAZE_BOUNDS.z0);
      size[i] = 0.035 + Math.random() * 0.09;
      v[i * 3] = (Math.random() - 0.5) * 0.08;
      v[i * 3 + 1] = (Math.random() - 0.5) * 0.04;
      v[i * 3 + 2] = -(0.12 + Math.random() * 0.3);
      l[i] = Math.random();
    }
    g.setAttribute("position", new THREE.BufferAttribute(pos, 3));
    g.setAttribute("aSize", new THREE.BufferAttribute(size, 1));
    g.setAttribute("aAlpha", new THREE.BufferAttribute(alpha, 1));
    return { geo: g, vel: v, life: l };
  }, []);
  const mat = useMemo(() => pointsMaterial("#c99a5b", 0.6, THREE.NormalBlending), []);
  const level = useRef(0.3);
  const color = useMemo(() => new THREE.Color(), []);

  useFrame(({ size }, dt0) => {
    const dt = Math.min(dt0, 0.05);
    const t = sharedTime.value;
    const target = THREE.MathUtils.clamp(aqi / 420, 0.06, 1);
    level.current += (target - level.current) * Math.min(1, dt * 0.8);
    const lv = level.current;
    if (lv < 0.5) color.copy(CLEAN).lerp(DIRTY, lv * 2);
    else color.copy(DIRTY).lerp(SMOG, (lv - 0.5) * 2);
    mat.uniforms.uColor.value.copy(color);
    mat.uniforms.uOpacity.value = 0.35 + lv * 0.5;
    mat.uniforms.uScale.value = size.height * 0.9;
    const n = Math.floor(HAZE_N * lv * density);
    geo.setDrawRange(0, n);
    const pos = geo.attributes.position.array as Float32Array;
    const alpha = geo.attributes.aAlpha.array as Float32Array;
    const front = RIG.z + RIG.plankDepth / 2 + 0.2;
    for (let i = 0; i < n; i++) {
      const j = i * 3;
      pos[j] += (vel[j] + Math.sin(t * 0.7 + i) * 0.03) * dt;
      pos[j + 1] += (vel[j + 1] + Math.cos(t * 0.5 + i * 0.3) * 0.02) * dt;
      pos[j + 2] += vel[j + 2] * dt * (0.6 + lv);
      life[i] = Math.min(1, life[i] + dt * 0.4);
      // absorbed when it reaches the plants in front of the rack
      const inRack = Math.abs(pos[j]) < RACK_W / 2 && pos[j + 1] < RACK_H + 1;
      const depth = pos[j + 2] - front;
      let a = life[i];
      if (inRack && depth < 1.2) a *= Math.max(0, depth / 1.2);
      alpha[i] = a;
      if ((inRack && depth < 0) || pos[j + 2] < -3 || Math.abs(pos[j]) > HAZE_BOUNDS.x + 1) {
        pos[j] = (Math.random() * 2 - 1) * HAZE_BOUNDS.x;
        pos[j + 1] = HAZE_BOUNDS.y0 + Math.random() * (HAZE_BOUNDS.y1 - HAZE_BOUNDS.y0);
        pos[j + 2] = HAZE_BOUNDS.z1 - Math.random() * 2;
        life[i] = 0;
      }
    }
    geo.attributes.position.needsUpdate = true;
    geo.attributes.aAlpha.needsUpdate = true;
  });
  return <points geometry={geo} material={mat} frustumCulled={false} />;
}

const MOTES_PER_PLANT = 14;

/** Bright motes rising from each healthy plant, faster with a higher removal rate. */
export function CleanAir() {
  const plants = useTwin((s) => s.telemetry?.plants);
  const N = rigLayout.plants.length * MOTES_PER_PLANT;
  const { geo, seed } = useMemo(() => {
    const g = new THREE.BufferGeometry();
    g.setAttribute("position", new THREE.BufferAttribute(new Float32Array(N * 3), 3));
    g.setAttribute("aSize", new THREE.BufferAttribute(new Float32Array(N).map(() => 0.05 + Math.random() * 0.07), 1));
    g.setAttribute("aAlpha", new THREE.BufferAttribute(new Float32Array(N), 1));
    return { geo: g, seed: new Float32Array(N * 3).map(() => Math.random()) };
  }, [N]);
  const mat = useMemo(() => pointsMaterial("#c9e8a4", 1.4, THREE.AdditiveBlending), []);
  mat.toneMapped = false;
  const bases = useMemo(() => rigLayout.plants.map((rp) => slotPosition(rp.slot)), []);

  useFrame(({ size }) => {
    mat.uniforms.uScale.value = size.height * 0.9;
    const t = sharedTime.value;
    const pos = geo.attributes.position.array as Float32Array;
    const alpha = geo.attributes.aAlpha.array as Float32Array;
    rigLayout.plants.forEach((rp, pi) => {
      const p = plants?.find((x) => x.tag_id === rp.tag_id);
      const on = p?.status === "present" ? 1 : 0;
      const speed = 0.12 + Math.min(1, (p?.rate_air_per_h ?? 0) * 6) * 0.25;
      const b = bases[pi];
      for (let k = 0; k < MOTES_PER_PLANT; k++) {
        const i = pi * MOTES_PER_PLANT + k;
        const s0 = seed[i * 3];
        const s1 = seed[i * 3 + 1];
        const s2 = seed[i * 3 + 2];
        const ph = (t * speed + s0) % 1;
        const r = 0.15 + s1 * 0.45;
        const ang = s2 * Math.PI * 2 + t * 0.4;
        pos[i * 3] = b.x + Math.cos(ang) * r;
        pos[i * 3 + 1] = b.y + 0.3 + ph * 1.6;
        pos[i * 3 + 2] = b.z + Math.sin(ang) * r * 0.6 + 0.2;
        alpha[i] = on * Math.sin(ph * Math.PI) * 0.9;
      }
    });
    geo.attributes.position.needsUpdate = true;
    geo.attributes.aAlpha.needsUpdate = true;
  });
  return <points geometry={geo} material={mat} frustumCulled={false} />;
}

/** Camera field of view onto the rack, with a scan line sweeping at the inference rate. */
export function VisionCone({ lens, visible }: { lens: THREE.Vector3; visible: boolean }) {
  const top = RACK_H + 0.6;
  const bot = 0.3;
  const zf = RIG.z + RIG.plankDepth / 2 + 0.25;
  const hw = RACK_W / 2 + 0.2;
  const { lines, faces } = useMemo(() => {
    const corners = [new THREE.Vector3(-hw, top, zf), new THREE.Vector3(hw, top, zf), new THREE.Vector3(hw, bot, zf), new THREE.Vector3(-hw, bot, zf)];
    const lp: number[] = [];
    corners.forEach((c, i) => {
      lp.push(lens.x, lens.y, lens.z, c.x, c.y, c.z);
      const n = corners[(i + 1) % 4];
      lp.push(c.x, c.y, c.z, n.x, n.y, n.z);
    });
    const lg = new THREE.BufferGeometry();
    lg.setAttribute("position", new THREE.Float32BufferAttribute(lp, 3));
    const fp: number[] = [];
    corners.forEach((c, i) => {
      const n = corners[(i + 1) % 4];
      fp.push(lens.x, lens.y, lens.z, c.x, c.y, c.z, n.x, n.y, n.z);
    });
    const fg = new THREE.BufferGeometry();
    fg.setAttribute("position", new THREE.Float32BufferAttribute(fp, 3));
    return { lines: lg, faces: fg };
  }, [lens, hw, top, zf]);
  const lineMat = useMemo(() => new THREE.LineBasicMaterial({ color: new THREE.Color("#e6ecd9").multiplyScalar(1.2), transparent: true, opacity: 0.2, toneMapped: false, depthWrite: false }), []);
  const faceMat = useMemo(() => new THREE.MeshBasicMaterial({ color: "#e6ecd9", transparent: true, opacity: 0.008, side: THREE.DoubleSide, depthWrite: false, blending: THREE.AdditiveBlending }), []);
  const scanMat = useMemo(
    () =>
      new THREE.ShaderMaterial({
        transparent: true,
        depthWrite: false,
        blending: THREE.AdditiveBlending,
        toneMapped: false,
        uniforms: { uColor: { value: new THREE.Color("#e6ecd9") } },
        vertexShader: "varying vec2 vUv; void main(){ vUv = uv; gl_Position = projectionMatrix * modelViewMatrix * vec4(position,1.0); }",
        fragmentShader: "uniform vec3 uColor; varying vec2 vUv; void main(){ float a = pow(vUv.y, 6.0) * 0.55 + smoothstep(0.97, 1.0, vUv.y) * 2.5; float edge = smoothstep(0.0, 0.04, vUv.x) * smoothstep(1.0, 0.96, vUv.x); gl_FragColor = vec4(uColor * (1.0 + 2.0 * smoothstep(0.97,1.0,vUv.y)), a * edge * 0.6); }",
      }),
    [],
  );
  const scan = useRef<THREE.Mesh>(null);
  const group = useRef<THREE.Group>(null);
  useFrame(({ clock }, dt) => {
    const ph = (clock.elapsedTime % 1.6) / 1.6;
    if (scan.current) scan.current.position.y = top - ph * (top - bot) * 1.15;
    if (group.current) {
      const target = visible ? 1 : 0;
      const o = lineMat.opacity / 0.2 + (target - lineMat.opacity / 0.2) * Math.min(1, dt * 4);
      lineMat.opacity = 0.2 * o;
      faceMat.opacity = 0.008 * o;
      group.current.visible = o > 0.02;
    }
  });
  return (
    <group ref={group}>
      <lineSegments geometry={lines} material={lineMat} />
      <mesh geometry={faces} material={faceMat} />
      <mesh ref={scan} position={[0, top, zf]} material={scanMat}>
        <planeGeometry args={[hw * 2, 1.4]} />
      </mesh>
    </group>
  );
}

interface CoinFx {
  id: string;
  air: number;
  born: number;
}

/** A gold AIR coin rises out of the miner whenever chain-market mints for it. */
export function MintCoins({ origin }: { origin: THREE.Vector3 }) {
  const newest = useTwin((s) => s.mints[0]);
  const [coins, setCoins] = useState<CoinFx[]>([]);
  const first = useRef(true);
  useEffect(() => {
    if (!newest) return;
    if (first.current) {
      first.current = false;
      return;
    }
    setCoins((c) => [...c.slice(-3), { id: newest.tx_hash, air: fromBaseUnits(newest.amount), born: performance.now() }]);
  }, [newest?.tx_hash]); // eslint-disable-line react-hooks/exhaustive-deps
  useEffect(() => {
    if (!coins.length) return;
    const id = setTimeout(() => setCoins((c) => c.filter((x) => performance.now() - x.born < 4200)), 4300);
    return () => clearTimeout(id);
  }, [coins]);
  return (
    <>
      {coins.map((c) => (
        <Coin key={c.id} fx={c} origin={origin} />
      ))}
    </>
  );
}

function Coin({ fx, origin }: { fx: CoinFx; origin: THREE.Vector3 }) {
  const ref = useRef<THREE.Group>(null);
  const coin = useRef<THREE.Group>(null);
  const light = useRef<THREE.PointLight>(null);
  const mats = useMemo(() => {
    const face = new THREE.MeshStandardMaterial({ map: coinTexture(), metalness: 1, roughness: 0.22, emissive: new THREE.Color("#ffb300"), emissiveIntensity: 0.25 });
    const rim = new THREE.MeshStandardMaterial({ color: "#e0a93a", metalness: 1, roughness: 0.25, emissive: new THREE.Color("#ffb300"), emissiveIntensity: 0.25 });
    return [rim, face, face];
  }, []);
  useFrame(() => {
    const age = (performance.now() - fx.born) / 1000;
    const g = ref.current;
    if (!g) return;
    const k = Math.min(1, age / 3.6);
    const ease = 1 - (1 - k) ** 3;
    g.position.set(origin.x, origin.y + 0.3 + ease * 0.55, origin.z);
    const pop = age < 0.4 ? age / 0.4 : age > 3.4 ? Math.max(0, 1 - (age - 3.4) / 0.6) : 1;
    g.scale.setScalar(pop);
    if (coin.current) coin.current.rotation.y = age * 4.5;
    if (light.current) light.current.intensity = 6 * pop;
  });
  return (
    <group ref={ref}>
      <group ref={coin}>
        <mesh material={mats} rotation={[Math.PI / 2, 0, 0]} castShadow>
          <cylinderGeometry args={[0.3, 0.3, 0.05, 48]} />
        </mesh>
      </group>
      <pointLight ref={light} color="#ffcf5a" distance={4} intensity={0} />
      <Html position={[0, -0.42, 0]} center style={{ pointerEvents: "none" }}>
        <div className="coin-tag">+{fx.air.toFixed(4)} AIR</div>
      </Html>
    </group>
  );
}
