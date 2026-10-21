// The world around the rig, and the "useful work" made visible:
//   a Delhi rooftop at golden hour whose sky and skyline drown in haze as the AQI rises,
//   pollution motes drifting through the rack and being taken up by living plants,
//   the miner camera's scan sweeping the shelves once per inference cycle,
//   and, on every mint, the proof flowing from the plants into the miner.
import { useFrame } from "@react-three/fiber";
import { useEffect, useMemo, useRef } from "react";
import * as THREE from "three";
import { rigLayout } from "../../config";
import { useTwin } from "../../store";
import { airState, SKY } from "./materials";
import { RACK_H, RACK_W, RIG, slotPosition } from "./Rig";
import { LENS_WORLD } from "./Stage";

const rand = (seed: number) => {
  let s = seed >>> 0;
  return () => {
    s = (Math.imul(s, 1664525) + 1013904223) >>> 0;
    return s / 2 ** 32;
  };
};

/* ---------------------------------------------------------------- sky */

const SUN_DIR = new THREE.Vector3(-0.62, 0.22, -0.75).normalize();

export function SkyDome() {
  const mat = useMemo(
    () =>
      new THREE.ShaderMaterial({
        side: THREE.BackSide,
        depthWrite: false,
        fog: false,
        uniforms: {
          uZenith: { value: SKY.zenithClean.clone() },
          uHorizon: { value: SKY.horizonClean.clone() },
          uSun: { value: SKY.sunClean.clone() },
          uSunDir: { value: SUN_DIR },
          uK: { value: 0 },
        },
        vertexShader: /* glsl */ `
          varying vec3 vDir;
          void main() {
            vDir = normalize(position);
            vec4 p = projectionMatrix * modelViewMatrix * vec4(position, 1.0);
            gl_Position = p.xyww;
          }`,
        fragmentShader: /* glsl */ `
          uniform vec3 uZenith; uniform vec3 uHorizon; uniform vec3 uSun; uniform vec3 uSunDir; uniform float uK;
          varying vec3 vDir;
          void main() {
            float h = clamp(vDir.y, -0.2, 1.0);
            vec3 col = mix(uHorizon, uZenith, pow(smoothstep(-0.02, 0.75, h), 0.7));
            float d = max(dot(normalize(vDir), uSunDir), 0.0);
            // smog spreads the sun into a dull wide glow; clean air keeps a tight bright disc
            float disc = smoothstep(0.9993 - uK * 0.002, 0.9998, d) * (1.0 - uK * 0.75);
            float glow = pow(d, mix(48.0, 8.0, uK)) * mix(0.55, 0.9, uK);
            col += uSun * (disc * 1.6 + glow);
            // haze band hugging the horizon, thicker in smog
            col = mix(col, uHorizon, smoothstep(0.18 + uK * 0.22, -0.05, h) * (0.35 + uK * 0.6));
            gl_FragColor = vec4(col, 1.0);
            #include <colorspace_fragment>
          }`,
      }),
    [],
  );
  useFrame(() => {
    const k = airState.k;
    mat.uniforms.uK.value = k;
    (mat.uniforms.uZenith.value as THREE.Color).copy(SKY.zenithClean).lerp(SKY.zenithSmog, k);
    (mat.uniforms.uHorizon.value as THREE.Color).copy(SKY.horizonClean).lerp(SKY.horizonSmog, k);
    (mat.uniforms.uSun.value as THREE.Color).copy(SKY.sunClean).lerp(SKY.sunSmog, k);
  });
  return (
    <mesh material={mat} renderOrder={-1} frustumCulled={false}>
      <sphereGeometry args={[130, 32, 16]} />
    </mesh>
  );
}

/* ---------------------------------------------------------------- city */

/** Low-rise blocks, a few towers and rooftop water tanks in a wide arc behind the terrace. */
export function Skyline() {
  const { blocks, tanks } = useMemo(() => {
    const r = rand(7);
    const blocks: { p: THREE.Vector3; s: THREE.Vector3 }[] = [];
    const tanks: THREE.Vector3[] = [];
    for (let ring = 0; ring < 3; ring++) {
      const radius = 48 + ring * 22;
      const n = 34 + ring * 10;
      for (let i = 0; i < n; i++) {
        const a = -Math.PI * 0.92 + (i / n) * Math.PI * 0.84 + (r() - 0.5) * 0.04;
        const tower = r() < 0.08 + ring * 0.04;
        const w = 4 + r() * 7;
        const h = tower ? 18 + r() * 22 : 5 + r() * 9;
        const d = 4 + r() * 6;
        const p = new THREE.Vector3(Math.cos(a) * radius, h / 2, Math.sin(a) * radius - 6);
        blocks.push({ p, s: new THREE.Vector3(w, h, d) });
        if (!tower && r() < 0.35) tanks.push(new THREE.Vector3(p.x + (r() - 0.5) * w * 0.5, h + 0.9, p.z));
      }
    }
    return { blocks, tanks };
  }, []);

  const blockRef = useRef<THREE.InstancedMesh>(null);
  const tankRef = useRef<THREE.InstancedMesh>(null);
  useEffect(() => {
    const m = new THREE.Matrix4();
    const q = new THREE.Quaternion();
    blocks.forEach((b, i) => {
      m.compose(b.p, q, b.s);
      blockRef.current?.setMatrixAt(i, m);
    });
    tanks.forEach((t, i) => {
      m.compose(t, q, new THREE.Vector3(1, 1, 1));
      tankRef.current?.setMatrixAt(i, m);
    });
    if (blockRef.current) blockRef.current.instanceMatrix.needsUpdate = true;
    if (tankRef.current) tankRef.current.instanceMatrix.needsUpdate = true;
  }, [blocks, tanks]);

  return (
    <group>
      <instancedMesh ref={blockRef} args={[undefined, undefined, blocks.length]} frustumCulled={false}>
        <boxGeometry />
        <meshStandardMaterial color="#b9ab97" roughness={1} />
      </instancedMesh>
      <instancedMesh ref={tankRef} args={[undefined, undefined, tanks.length]} frustumCulled={false}>
        <cylinderGeometry args={[1, 1, 1.8, 14]} />
        <meshStandardMaterial color="#2b2e30" roughness={0.7} />
      </instancedMesh>
    </group>
  );
}

/** The terrace edge: a painted steel railing, and a black plastic water tank, the most Delhi object there is. */
export function Terrace() {
  const posts = useMemo(() => Array.from({ length: 23 }, (_, i) => -33 + i * 3), []);
  return (
    <group>
      <group position={[0, 0, -16]}>
        {posts.map((x) => (
          <mesh key={x} position={[x, 5, 0]} castShadow>
            <boxGeometry args={[0.18, 10, 0.18]} />
            <meshStandardMaterial color="#3f4c48" roughness={0.6} metalness={0.4} />
          </mesh>
        ))}
        {[9.8, 5].map((y) => (
          <mesh key={y} position={[0, y, 0]} castShadow>
            <boxGeometry args={[66, 0.22, 0.22]} />
            <meshStandardMaterial color="#3f4c48" roughness={0.6} metalness={0.4} />
          </mesh>
        ))}
        <mesh position={[0, 0.6, 0]} receiveShadow castShadow>
          <boxGeometry args={[66, 1.2, 1.4]} />
          <meshStandardMaterial color="#cfc4b2" roughness={0.95} />
        </mesh>
      </group>
      <group position={[-20, 0, -8]}>
        <mesh position={[0, 4.6, 0]} castShadow receiveShadow>
          <cylinderGeometry args={[3.2, 3.4, 8.4, 40]} />
          <meshStandardMaterial color="#1d2022" roughness={0.55} />
        </mesh>
        {[1.6, 4.2, 6.8].map((y) => (
          <mesh key={y} position={[0, y, 0]}>
            <torusGeometry args={[3.33, 0.08, 6, 48]} />
            <meshStandardMaterial color="#121416" roughness={0.6} />
          </mesh>
        ))}
        <mesh position={[0, 9.1, 0]} castShadow>
          <cylinderGeometry args={[1.2, 1.6, 0.6, 24]} />
          <meshStandardMaterial color="#1d2022" roughness={0.55} />
        </mesh>
        <mesh position={[0, 0.2, 0]} receiveShadow>
          <boxGeometry args={[8, 0.4, 8]} />
          <meshStandardMaterial color="#bdb2a0" roughness={0.95} />
        </mesh>
      </group>
    </group>
  );
}

/* ---------------------------------------------------------------- particulates */

const MAX_MOTES = 1600;
const BOX = { x0: -15, x1: 15, y0: 0.4, y1: RACK_H + 3, z0: -1.4, z1: 13 };

/** Soft round sprite shader shared by the motes and the mint stream. */
function spriteMaterial(additive: boolean, maxPx = 9) {
  return new THREE.ShaderMaterial({
    transparent: true,
    depthWrite: false,
    blending: additive ? THREE.AdditiveBlending : THREE.NormalBlending,
    uniforms: { uScale: { value: 1 }, uMax: { value: maxPx } },
    vertexShader: /* glsl */ `
      attribute float aSize; attribute vec4 aColor;
      uniform float uScale; uniform float uMax;
      varying vec4 vColor;
      void main() {
        vColor = aColor;
        vec4 mv = modelViewMatrix * vec4(position, 1.0);
        gl_PointSize = min(aSize * uScale * (240.0 / -mv.z), uMax);
        gl_Position = projectionMatrix * mv;
      }`,
    fragmentShader: /* glsl */ `
      varying vec4 vColor;
      void main() {
        float d = length(gl_PointCoord - 0.5);
        float a = smoothstep(0.5, 0.0, d);
        if (a < 0.01) discard;
        gl_FragColor = vec4(vColor.rgb, vColor.a * a);
        #include <colorspace_fragment>
      }`,
  });
}

/**
 * PM2.5 made visible. Motes drift in on a slow breeze; how many are in the air follows the AQI.
 * When one passes through the canopy of a healthy, earning plant it is taken up: it slows, turns green
 * and fades. Missing, removed and suspect plants take up nothing, so they visibly stop cleaning.
 */
export function AirParticles() {
  const { geom, pos, col, size, vel, life, seed } = useMemo(() => {
    const r = rand(11);
    const pos = new Float32Array(MAX_MOTES * 3);
    const col = new Float32Array(MAX_MOTES * 4);
    const size = new Float32Array(MAX_MOTES);
    const vel = new Float32Array(MAX_MOTES * 3);
    const life = new Float32Array(MAX_MOTES); // 1 = airborne, <1 = being absorbed
    const seed = new Float32Array(MAX_MOTES);
    for (let i = 0; i < MAX_MOTES; i++) {
      pos[i * 3] = BOX.x0 + r() * (BOX.x1 - BOX.x0);
      pos[i * 3 + 1] = BOX.y0 + r() * (BOX.y1 - BOX.y0);
      pos[i * 3 + 2] = BOX.z0 + r() * (BOX.z1 - BOX.z0);
      size[i] = 0.35 + r() * 0.65;
      life[i] = 1;
      seed[i] = r() * 100;
    }
    const geom = new THREE.BufferGeometry();
    geom.setAttribute("position", new THREE.BufferAttribute(pos, 3).setUsage(THREE.DynamicDrawUsage));
    geom.setAttribute("aColor", new THREE.BufferAttribute(col, 4).setUsage(THREE.DynamicDrawUsage));
    geom.setAttribute("aSize", new THREE.BufferAttribute(size, 1));
    geom.boundingSphere = new THREE.Sphere(new THREE.Vector3(0, 6, 5), 30);
    return { geom, pos, col, size, vel, life, seed };
  }, []);
  const mat = useMemo(() => spriteMaterial(true), []);
  const canopies = useMemo(() => rigLayout.plants.map((rp) => ({ tag: rp.tag_id, c: slotPosition(rp.slot).add(new THREE.Vector3(0, 0.85, 0.15)) })), []);
  const r = useMemo(() => rand(23), []);
  const dust = useMemo(() => new THREE.Color("#f4d9a8"), []);
  const leaf = useMemo(() => new THREE.Color("#8dff6a"), []);
  const tmp = useMemo(() => new THREE.Color(), []);

  useFrame(({ clock }, dt0) => {
    const dt = Math.min(dt0, 0.05);
    const t = clock.elapsedTime;
    const k = airState.k;
    const active = Math.floor(MAX_MOTES * (0.08 + 0.72 * k));
    const plants = useTwin.getState().telemetry?.plants;
    const earning = new Set(plants?.filter((p) => p.status === "present").map((p) => p.tag_id));
    for (let i = 0; i < MAX_MOTES; i++) {
      const j = i * 3;
      if (i >= active) {
        col[i * 4 + 3] = Math.max(0, col[i * 4 + 3] - dt * 0.6);
        continue;
      }
      let x = pos[j], y = pos[j + 1], z = pos[j + 2];
      const s = seed[i];
      if (life[i] >= 1) {
        // breeze towards the rack with slow curling turbulence
        vel[j] = Math.sin(t * 0.21 + s + y * 0.3) * 0.35 + 0.12;
        vel[j + 1] = Math.sin(t * 0.33 + s * 1.7 + x * 0.25) * 0.18;
        vel[j + 2] = -0.42 + Math.cos(t * 0.17 + s * 0.9) * 0.2;
        x += vel[j] * dt; y += vel[j + 1] * dt; z += vel[j + 2] * dt;
        for (const cp of canopies) {
          if (!earning.has(cp.tag)) continue;
          const dx = cp.c.x - x, dy = cp.c.y - y, dz = cp.c.z - z;
          const d2 = dx * dx + dy * dy * 1.6 + dz * dz;
          if (d2 < 1.3) {
            life[i] = 0.999; // caught by the leaves
            break;
          }
          if (d2 < 4.5) { // leaves pull nearby particles in slightly
            x += dx * dt * 0.35; y += dy * dt * 0.35; z += dz * dt * 0.35;
          }
        }
        const a = Math.min(1, col[i * 4 + 3] + dt * 0.5);
        tmp.copy(dust);
        col[i * 4] = tmp.r; col[i * 4 + 1] = tmp.g; col[i * 4 + 2] = tmp.b; col[i * 4 + 3] = Math.min(a, 0.32 + k * 0.3);
      } else {
        // absorption: settle onto the leaf, flash green, fade
        life[i] -= dt * 0.9;
        y -= dt * 0.15;
        const g = 1 - life[i];
        tmp.copy(dust).lerp(leaf, Math.min(1, g * 3));
        col[i * 4] = tmp.r; col[i * 4 + 1] = tmp.g; col[i * 4 + 2] = tmp.b; col[i * 4 + 3] = Math.max(0, 0.85 * (1 - g));
        if (life[i] <= 0) {
          life[i] = 1;
          col[i * 4 + 3] = 0;
          x = BOX.x0 + r() * (BOX.x1 - BOX.x0);
          y = BOX.y0 + r() * (BOX.y1 - BOX.y0);
          z = BOX.z1 - r() * 1.5;
        }
      }
      // recycle anything that drifts out of the box back to the windward side
      if (z < BOX.z0 || x > BOX.x1 + 1 || x < BOX.x0 - 1 || y < BOX.y0 - 0.5 || y > BOX.y1 + 1) {
        x = BOX.x0 + r() * (BOX.x1 - BOX.x0);
        y = BOX.y0 + r() * (BOX.y1 - BOX.y0);
        z = BOX.z1 - r() * 1.5;
        col[i * 4 + 3] = 0;
      }
      pos[j] = x; pos[j + 1] = y; pos[j + 2] = z;
    }
    geom.attributes.position.needsUpdate = true;
    geom.attributes.aColor.needsUpdate = true;
    void size;
  });

  return <points geometry={geom} material={mat} frustumCulled={false} />;
}

/* ---------------------------------------------------------------- camera scan */

/**
 * What the miner camera does once per inference cycle, drawn in the room: a faint frustum from the lens to
 * the rack and a light sheet that sweeps the shelves top to bottom.
 */
export function ScanSweep({ visible = true }: { visible?: boolean }) {
  const sheet = useRef<THREE.Mesh>(null);
  const glowMat = useMemo(
    () =>
      new THREE.ShaderMaterial({
        transparent: true,
        depthWrite: false,
        blending: THREE.AdditiveBlending,
        side: THREE.DoubleSide,
        uniforms: { uA: { value: 0 } },
        vertexShader: /* glsl */ `varying vec2 vUv; void main() { vUv = uv; gl_Position = projectionMatrix * modelViewMatrix * vec4(position, 1.0); }`,
        fragmentShader: /* glsl */ `
          uniform float uA; varying vec2 vUv;
          void main() {
            float core = smoothstep(0.5, 0.0, abs(vUv.y - 0.5));
            float edge = smoothstep(0.0, 0.08, vUv.x) * smoothstep(1.0, 0.92, vUv.x);
            gl_FragColor = vec4(vec3(0.48, 0.9, 0.62) * (0.6 + core), uA * core * edge);
          }`,
      }),
    [],
  );
  const frustum = useMemo(() => {
    const zf = RIG.z + 1.0;
    const hw = RACK_W / 2 + 0.2;
    const corners = [
      new THREE.Vector3(-hw, RACK_H + 0.1, zf),
      new THREE.Vector3(hw, RACK_H + 0.1, zf),
      new THREE.Vector3(hw, 0.3, zf),
      new THREE.Vector3(-hw, 0.3, zf),
    ];
    const pts: number[] = [];
    corners.forEach((c) => pts.push(LENS_WORLD.x, LENS_WORLD.y, LENS_WORLD.z, c.x, c.y, c.z));
    corners.forEach((c, i) => {
      const n = corners[(i + 1) % 4];
      pts.push(c.x, c.y, c.z, n.x, n.y, n.z);
    });
    const g = new THREE.BufferGeometry();
    g.setAttribute("position", new THREE.Float32BufferAttribute(pts, 3));
    return g;
  }, []);
  const lineMat = useMemo(() => new THREE.LineBasicMaterial({ color: "#7bd389", transparent: true, opacity: 0.22, depthWrite: false }), []);

  useFrame(({ clock }) => {
    const period = 3.2;
    const p = (clock.elapsedTime % period) / period;
    const sweep = Math.min(1, p / 0.62); // sweep, then rest until the next cycle
    if (sheet.current) {
      sheet.current.position.y = RACK_H + 0.1 - sweep * (RACK_H - 0.2);
      glowMat.uniforms.uA.value = visible ? (p < 0.62 ? 0.9 : Math.max(0, 0.9 - (p - 0.62) * 6)) : 0;
    }
    lineMat.opacity = visible ? 0.16 + 0.1 * Math.sin(clock.elapsedTime * 2) : 0;
  });

  return (
    <group>
      <lineSegments geometry={frustum} material={lineMat} />
      <mesh ref={sheet} position={[0, RACK_H, RIG.z + 1.0]} material={glowMat}>
        <planeGeometry args={[RACK_W + 0.4, 0.5]} />
      </mesh>
    </group>
  );
}

/* ---------------------------------------------------------------- mint */

const STREAM_PER_PLANT = 16;
const STREAM_S = 3.8;

/**
 * When an epoch is minted, the proof flows: green motes rise from every earning plant and arc into the
 * miner's lens, then a ring pulses out from the miner.
 */
export function MintStream() {
  const n = rigLayout.plants.length * STREAM_PER_PLANT;
  const { geom, pos, col, size } = useMemo(() => {
    const pos = new Float32Array(n * 3);
    const col = new Float32Array(n * 4);
    const size = new Float32Array(n);
    const geom = new THREE.BufferGeometry();
    geom.setAttribute("position", new THREE.BufferAttribute(pos, 3).setUsage(THREE.DynamicDrawUsage));
    geom.setAttribute("aColor", new THREE.BufferAttribute(col, 4).setUsage(THREE.DynamicDrawUsage));
    geom.setAttribute("aSize", new THREE.BufferAttribute(size, 1).setUsage(THREE.DynamicDrawUsage));
    return { geom, pos, col, size };
  }, [n]);
  const mat = useMemo(() => spriteMaterial(true, 18), []);
  const ring = useRef<THREE.Mesh>(null);
  const ringMat = useMemo(() => new THREE.MeshBasicMaterial({ color: "#9be37a", transparent: true, opacity: 0, depthWrite: false, blending: THREE.AdditiveBlending, side: THREE.DoubleSide, toneMapped: false }), []);
  const start = useRef(-100);
  const lastTx = useRef<string | undefined>(undefined);
  const sources = useRef<{ from: THREE.Vector3; on: boolean }[]>([]);
  const r = useMemo(() => rand(5), []);
  const jitter = useMemo(() => Array.from({ length: n }, () => [r(), r(), r()]), [n, r]);

  useFrame(({ clock }) => {
    const st = useTwin.getState();
    const tx = st.mints[0]?.tx_hash;
    if (tx && tx !== lastTx.current) {
      if (lastTx.current !== undefined) {
        const earning = new Set(st.telemetry?.plants.filter((p) => p.status === "present").map((p) => p.tag_id));
        sources.current = rigLayout.plants.map((rp) => ({ from: slotPosition(rp.slot).add(new THREE.Vector3(0, 0.9, 0.2)), on: earning.has(rp.tag_id) }));
        start.current = clock.elapsedTime;
      }
      lastTx.current = tx;
    }
    const age = clock.elapsedTime - start.current;
    const target = LENS_WORLD;
    const ctl = new THREE.Vector3();
    for (let i = 0; i < n; i++) {
      const src = sources.current[Math.floor(i / STREAM_PER_PLANT)];
      const [ja, jb, jc] = jitter[i];
      const delay = ja * 1.2;
      const u = (age - delay) / (STREAM_S - 1.2);
      if (!src || !src.on || u < 0 || u > 1) {
        col[i * 4 + 3] = 0;
        continue;
      }
      const e = u < 0.5 ? 2 * u * u : 1 - (-2 * u + 2) ** 2 / 2;
      ctl.copy(src.from).lerp(target, 0.5);
      ctl.y += 3 + jb * 2;
      ctl.x += (jc - 0.5) * 3;
      // quadratic Bezier from the canopy, up over the floor, into the lens
      const a = (1 - e) * (1 - e), b = 2 * (1 - e) * e, c = e * e;
      pos[i * 3] = a * src.from.x + b * ctl.x + c * target.x;
      pos[i * 3 + 1] = a * src.from.y + b * ctl.y + c * target.y;
      pos[i * 3 + 2] = a * src.from.z + b * ctl.z + c * target.z;
      col[i * 4] = 0.55; col[i * 4 + 1] = 0.95; col[i * 4 + 2] = 0.5;
      col[i * 4 + 3] = Math.sin(Math.PI * Math.min(1, u * 1.15)) * 0.95;
      size[i] = 1.6 + jb * 1.4;
    }
    geom.attributes.position.needsUpdate = true;
    geom.attributes.aColor.needsUpdate = true;
    geom.attributes.aSize.needsUpdate = true;
    // arrival pulse at the miner
    const pa = age - STREAM_S + 0.15;
    if (ring.current) {
      const on = pa > 0 && pa < 1.1;
      ring.current.visible = on;
      if (on) {
        ring.current.scale.setScalar(0.3 + pa * 4.5);
        ringMat.opacity = 0.75 * (1 - pa / 1.1);
      }
    }
  });

  return (
    <group>
      <points geometry={geom} material={mat} frustumCulled={false} />
      <mesh ref={ring} position={target(LENS_WORLD)} rotation={[0, 0, 0]} material={ringMat} visible={false}>
        <ringGeometry args={[0.9, 1.0, 64]} />
      </mesh>
    </group>
  );
}

const target = (v: THREE.Vector3): [number, number, number] => [v.x, v.y, v.z];
