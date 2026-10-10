// Procedural plant geometry: one merged, vertex-coloured mesh per plant, shaped per species.
// Origin is the soil surface in the pot; +y is up. Units: 1 = 10 cm.
import * as THREE from "three";
import { mergeGeometries } from "three/examples/jsm/utils/BufferGeometryUtils.js";

export function rng(seed: number): () => number {
  let a = seed >>> 0;
  return () => {
    a = (a + 0x6d2b79f5) | 0;
    let t = Math.imul(a ^ (a >>> 15), 1 | a);
    t = (t + Math.imul(t ^ (t >>> 7), 61 | t)) ^ t;
    return ((t ^ (t >>> 14)) >>> 0) / 4294967296;
  };
}

type Shape = (t: number) => number;
const SHAPES = {
  lance: (t: number) => Math.pow(Math.sin(Math.PI * t), 0.75) * (1 - 0.3 * t),
  sword: (t: number) => (0.55 + 0.45 * Math.min(1, t * 5)) * Math.pow(Math.max(0, 1 - t), 0.5),
  strap: (t: number) => Math.min(1, t * 6) * Math.pow(Math.max(0, 1 - t), 0.3),
  ovate: (t: number) => Math.pow(Math.sin(Math.PI * Math.pow(t, 0.75)), 0.8),
  heart: (t: number) => Math.pow(Math.sin(Math.PI * Math.pow(t, 0.55)), 0.7),
  petal: (t: number) => Math.pow(Math.sin(Math.PI * Math.pow(t, 0.6)), 0.6),
  round: (t: number) => Math.sqrt(Math.max(0, 1 - (2 * t - 1) ** 2)),
  linear: (t: number) => Math.min(1, t * 4) * (1 - t * 0.8),
} satisfies Record<string, Shape>;

const C = (hex: string) => new THREE.Color(hex);
const tmp = new THREE.Color();

interface LeafOpts {
  len: number;
  width: number;
  shape: Shape;
  a0: number; // start angle from vertical (rad)
  curl: number; // extra bend over the length (rad), positive droops
  yaw: number;
  base: THREE.Vector3;
  fold?: number;
  segs?: number;
  color: THREE.Color;
  tip?: THREE.Color;
  edge?: THREE.Color;
  center?: THREE.Color;
  band?: number; // cross-banding strength (snake plant)
  matrix?: THREE.Matrix4; // extra transform applied last
}

function finish(geo: THREE.BufferGeometry): THREE.BufferGeometry {
  geo.deleteAttribute("uv");
  const g = geo.index ? geo.toNonIndexed() : geo;
  if (!g.getAttribute("normal")) g.computeVertexNormals();
  return g;
}

function leaf(o: LeafOpts): THREE.BufferGeometry {
  const segs = o.segs ?? 6;
  const pos: number[] = [];
  const col: number[] = [];
  const idx: number[] = [];
  let y = 0;
  let z = 0;
  const ds = o.len / segs;
  const tip = o.tip ?? o.color;
  for (let i = 0; i <= segs; i++) {
    const t = i / segs;
    const a = o.a0 + o.curl * t;
    if (i > 0) {
      y += Math.cos(a) * ds;
      z += Math.sin(a) * ds;
    }
    const w = o.width * o.shape(t);
    const f = (o.fold ?? 0.3) * w;
    const ny = Math.sin(a);
    const nz = -Math.cos(a);
    pos.push(-w, y + ny * f, z + nz * f, 0, y, z, w, y + ny * f, z + nz * f);
    tmp.copy(o.color).lerp(tip, t);
    if (o.band) tmp.multiplyScalar(1 + o.band * Math.sin(t * 38));
    const e = o.edge ? tmp.clone().lerp(o.edge, 0.85) : tmp;
    const c = o.center ? tmp.clone().lerp(o.center, 0.8) : tmp;
    col.push(e.r, e.g, e.b, c.r, c.g, c.b, e.r, e.g, e.b);
    if (i < segs) {
      const b = i * 3;
      const n = b + 3;
      idx.push(b, b + 1, n, b + 1, n + 1, n, b + 1, b + 2, n + 1, b + 2, n + 2, n + 1);
    }
  }
  const geo = new THREE.BufferGeometry();
  geo.setAttribute("position", new THREE.Float32BufferAttribute(pos, 3));
  geo.setAttribute("color", new THREE.Float32BufferAttribute(col, 3));
  geo.setIndex(idx);
  geo.computeVertexNormals();
  const m = new THREE.Matrix4().makeRotationY(o.yaw).setPosition(o.base);
  geo.applyMatrix4(m);
  if (o.matrix) geo.applyMatrix4(o.matrix);
  return finish(geo);
}

function colorize(geo: THREE.BufferGeometry, color: THREE.Color): THREE.BufferGeometry {
  const n = geo.getAttribute("position").count;
  const arr = new Float32Array(n * 3);
  for (let i = 0; i < n; i++) arr.set([color.r, color.g, color.b], i * 3);
  geo.setAttribute("color", new THREE.BufferAttribute(arr, 3));
  return geo;
}

function stem(p0: THREE.Vector3, p1: THREE.Vector3, r0: number, r1: number, color: THREE.Color, radial = 5): THREE.BufferGeometry {
  const dir = p1.clone().sub(p0);
  const len = dir.length();
  const geo = new THREE.CylinderGeometry(r1, r0, len, radial, 1, true);
  geo.translate(0, len / 2, 0);
  geo.applyQuaternion(new THREE.Quaternion().setFromUnitVectors(new THREE.Vector3(0, 1, 0), dir.normalize()));
  geo.translate(p0.x, p0.y, p0.z);
  return colorize(finish(geo), color);
}

function blob(p: THREE.Vector3, r: number, color: THREE.Color, detail = 1): THREE.BufferGeometry {
  const geo = new THREE.IcosahedronGeometry(r, detail);
  const a = geo.getAttribute("position");
  const rr = rng(Math.floor((p.x + 7) * 1000 + p.y * 300));
  for (let i = 0; i < a.count; i++) {
    const k = 1 + (rr() - 0.5) * 0.25;
    a.setXYZ(i, a.getX(i) * k, a.getY(i) * k, a.getZ(i) * k);
  }
  geo.translate(p.x, p.y, p.z);
  geo.computeVertexNormals();
  return colorize(finish(geo), color);
}

/** Points along a spine (same parametrisation as leaf) in the yz plane, then yawed. */
function spine(len: number, a0: number, curl: number, yaw: number, base: THREE.Vector3, n: number): THREE.Vector3[] {
  const pts: THREE.Vector3[] = [];
  let y = 0;
  let z = 0;
  const ds = len / n;
  const m = new THREE.Matrix4().makeRotationY(yaw).setPosition(base);
  for (let i = 0; i <= n; i++) {
    const a = a0 + curl * (i / n);
    if (i > 0) {
      y += Math.cos(a) * ds;
      z += Math.sin(a) * ds;
    }
    pts.push(new THREE.Vector3(0, y, z).applyMatrix4(m));
  }
  return pts;
}

function polyStem(pts: THREE.Vector3[], r0: number, r1: number, color: THREE.Color, out: THREE.BufferGeometry[]) {
  for (let i = 0; i < pts.length - 1; i++) {
    const t0 = i / (pts.length - 1);
    const t1 = (i + 1) / (pts.length - 1);
    out.push(stem(pts[i], pts[i + 1], r0 + (r1 - r0) * t0, r0 + (r1 - r0) * t1, color, 4));
  }
}

/** Pinnate frond: rachis plus leaflets on both sides. */
function frond(out: THREE.BufferGeometry[], r: () => number, o: { len: number; a0: number; curl: number; yaw: number; base: THREE.Vector3; pairs: number; leafLen: number; leafW: number; rachis: THREE.Color; color: THREE.Color; tip: THREE.Color; droop?: number }) {
  const n = o.pairs;
  const pts = spine(o.len, o.a0, o.curl, o.yaw, o.base, n);
  polyStem(pts, 0.012, 0.004, o.rachis, out);
  const m = new THREE.Matrix4().makeRotationY(o.yaw);
  for (let i = 2; i <= n; i++) {
    const t = i / n;
    const a = o.a0 + o.curl * t;
    const L = o.leafLen * Math.sin(Math.PI * Math.min(1, 0.15 + t * 0.9)) * (0.85 + r() * 0.3);
    for (const side of [-1, 1]) {
      // leaflet in frond-local frame, pointing sideways, rotated to follow rachis pitch
      const local = new THREE.Matrix4()
        .makeRotationX(a * 0.6)
        .premultiply(m)
        .setPosition(pts[i]);
      out.push(leaf({ len: L, width: o.leafW, shape: SHAPES.lance, a0: 1.2 + r() * 0.2, curl: o.droop ?? 0.5, yaw: side * (Math.PI / 2 + 0.35), base: new THREE.Vector3(), segs: 3, fold: 0.25, color: o.color, tip: o.tip, matrix: local }));
    }
  }
}

/** Branched stems with leaves along them; returns branch tips for flowers. */
function bush(out: THREE.BufferGeometry[], r: () => number, o: { stems: number; height: number; spread: number; leafLen: number; leafW: number; shape: Shape; every: number; stemColor: THREE.Color; color: THREE.Color; tip?: THREE.Color; a0?: number; curl?: number; trunk?: number }): THREE.Vector3[] {
  const tips: THREE.Vector3[] = [];
  const baseY = o.trunk ?? 0;
  if (o.trunk) out.push(stem(new THREE.Vector3(0, 0, 0), new THREE.Vector3(r() * 0.04, o.trunk, r() * 0.04), 0.05, 0.03, o.stemColor, 7));
  for (let s = 0; s < o.stems; s++) {
    const yaw = (s / o.stems) * Math.PI * 2 + r() * 0.8;
    const len = o.height * (0.7 + r() * 0.4);
    const pts = spine(len, (o.trunk ? 0.6 : 0.15) + r() * o.spread, 0.2 + r() * 0.4, yaw, new THREE.Vector3((r() - 0.5) * 0.08, baseY, (r() - 0.5) * 0.08), 6);
    polyStem(pts, o.trunk ? 0.022 : 0.016, 0.006, o.stemColor, out);
    tips.push(pts[pts.length - 1]);
    // leaves along the stem
    const total = Math.max(3, Math.floor(len / o.every));
    for (let k = 1; k <= total; k++) {
      const t = k / total;
      const fi = t * (pts.length - 1);
      const i0 = Math.floor(fi);
      const p = pts[i0].clone().lerp(pts[Math.min(pts.length - 1, i0 + 1)], fi - i0);
      for (let j = 0; j < 2; j++) {
        out.push(leaf({ len: o.leafLen * (0.75 + r() * 0.5) * (1 - t * 0.3), width: o.leafW, shape: o.shape, a0: (o.a0 ?? 0.9) + r() * 0.5, curl: o.curl ?? 0.4, yaw: r() * Math.PI * 2, base: p, segs: 4, color: o.color, tip: o.tip }));
      }
    }
  }
  return tips;
}

function flower(out: THREE.BufferGeometry[], r: () => number, p: THREE.Vector3, o: { petals: number; len: number; w: number; color: THREE.Color; center?: THREE.Color; cup?: number }) {
  const off = r() * Math.PI;
  for (let i = 0; i < o.petals; i++) {
    out.push(leaf({ len: o.len, width: o.w, shape: SHAPES.petal, a0: 1.0 - (o.cup ?? 0.3), curl: o.cup ?? 0.3, yaw: off + (i / o.petals) * Math.PI * 2, base: p, segs: 4, fold: 0.15, color: o.color, tip: o.color.clone().multiplyScalar(1.15) }));
  }
  if (o.center) out.push(blob(p.clone().add(new THREE.Vector3(0, 0.015, 0)), o.len * 0.18, o.center, 0));
}

function rosette(out: THREE.BufferGeometry[], r: () => number, o: { n: number; len: [number, number]; width: number; shape: Shape; a0: [number, number]; curl: number; fold?: number; color: THREE.Color; tip?: THREE.Color; edge?: THREE.Color; center?: THREE.Color; band?: number; segs?: number; spread?: number; y?: number }) {
  for (let i = 0; i < o.n; i++) {
    const t = i / o.n;
    const yaw = t * Math.PI * 2 * 2.39996 + r() * 0.3; // golden angle phyllotaxis
    const inner = 1 - t; // later leaves are outer and more spread
    const a0 = o.a0[0] + (o.a0[1] - o.a0[0]) * (0.3 * r() + 0.7 * t);
    const rad = (o.spread ?? 0.06) * r();
    out.push(leaf({
      len: o.len[0] + (o.len[1] - o.len[0]) * (0.4 * r() + 0.6 * inner),
      width: o.width * (0.85 + r() * 0.3), shape: o.shape, a0, curl: o.curl * (0.7 + r() * 0.6), yaw,
      base: new THREE.Vector3(Math.sin(yaw) * rad, o.y ?? 0, Math.cos(yaw) * rad), fold: o.fold, segs: o.segs ?? 7,
      color: o.color, tip: o.tip, edge: o.edge, center: o.center, band: o.band,
    }));
  }
}

function trailing(out: THREE.BufferGeometry[], r: () => number, o: { vines: number; leafLen: number; leafW: number; color: THREE.Color; tip?: THREE.Color; center?: THREE.Color; stem: THREE.Color; potR: number }) {
  for (let v = 0; v < o.vines; v++) {
    const yaw = (v / o.vines) * Math.PI * 2 + r() * 0.6;
    const dir = new THREE.Vector3(Math.sin(yaw), 0, Math.cos(yaw));
    const drop = 0.35 + r() * 0.55;
    const curve = new THREE.CatmullRomCurve3([
      dir.clone().multiplyScalar(0.12).setY(0.02),
      dir.clone().multiplyScalar(o.potR * 0.85).setY(0.14 + r() * 0.08),
      dir.clone().multiplyScalar(o.potR + 0.12).setY(-0.05),
      dir.clone().multiplyScalar(o.potR + 0.18 + r() * 0.08).setY(-drop),
    ]);
    const pts = curve.getPoints(10);
    polyStem(pts, 0.008, 0.005, o.stem, out);
    const nLeaves = 6 + Math.floor(r() * 5);
    for (let k = 0; k < nLeaves; k++) {
      const p = curve.getPoint((k + 0.5) / nLeaves);
      const s = 1 - (k / nLeaves) * 0.35;
      out.push(leaf({ len: o.leafLen * s, width: o.leafW * s, shape: SHAPES.heart, a0: 0.9 + r() * 0.7, curl: 0.3, yaw: yaw + (r() - 0.5) * 2.2, base: p, segs: 4, fold: 0.2, color: o.color, tip: o.tip, center: o.center }));
    }
  }
  // mound on top
  rosette(out, r, { n: 9, len: [o.leafLen * 0.9, o.leafLen * 1.2], width: o.leafW, shape: SHAPES.heart, a0: [0.5, 1.1], curl: 0.4, color: o.color, tip: o.tip, center: o.center, segs: 4, spread: 0.2, y: 0.04 });
}

export interface PlantModel {
  geometry: THREE.BufferGeometry;
  height: number;
}

/** Build the plant for a species. `seed` keeps each tag's plant stable across reloads. */
export function buildPlant(species: string, seed: number, potR: number): PlantModel {
  const r = rng(seed * 9973 + 17);
  const out: THREE.BufferGeometry[] = [];
  const green = C("#3f7a35");
  switch (species) {
    case "snake_plant":
      rosette(out, r, { n: 8, len: [1.0, 1.45], width: 0.11, shape: SHAPES.sword, a0: [0.03, 0.28], curl: 0.08, fold: 0.15, color: C("#244d2a"), tip: C("#2f5f33"), edge: C("#c8c25e"), band: 0.22, segs: 12 });
      break;
    case "aloe_vera":
      rosette(out, r, { n: 14, len: [0.45, 0.75], width: 0.1, shape: SHAPES.sword, a0: [0.25, 1.0], curl: 0.35, fold: 0.6, color: C("#5f7f5c"), tip: C("#8a9d6d"), band: 0.05 });
      break;
    case "red_edged_dracaena": {
      for (let c = 0; c < 3; c++) {
        const h = 0.6 + c * 0.25 + r() * 0.15;
        const top = new THREE.Vector3((r() - 0.5) * 0.2, h, (r() - 0.5) * 0.2);
        out.push(stem(new THREE.Vector3((r() - 0.5) * 0.1, 0, (r() - 0.5) * 0.1), top, 0.022, 0.016, C("#6f5a43"), 6));
        for (let i = 0; i < 22; i++) out.push(leaf({ len: 0.38 + r() * 0.15, width: 0.022, shape: SHAPES.linear, a0: 0.1 + r() * 1.6, curl: 0.5, yaw: r() * Math.PI * 2, base: top, segs: 5, fold: 0.2, color: C("#355a2b"), tip: C("#4a6a2a"), edge: C("#b1304d") }));
      }
      break;
    }
    case "janet_craig_dracaena": {
      const top = new THREE.Vector3(0, 0.55, 0);
      out.push(stem(new THREE.Vector3(), top, 0.035, 0.028, C("#6b5a45"), 7));
      rosette(out, r, { n: 14, len: [0.55, 0.8], width: 0.075, shape: SHAPES.strap, a0: [0.2, 0.9], curl: 1.0, fold: 0.2, color: C("#1d4524"), tip: C("#2a5a2d"), y: 0.55, segs: 9 });
      rosette(out, r, { n: 8, len: [0.5, 0.7], width: 0.07, shape: SHAPES.strap, a0: [0.5, 1.1], curl: 1.1, fold: 0.2, color: C("#1d4524"), tip: C("#2a5a2d"), y: 0.25, segs: 9 });
      break;
    }
    case "peace_lily": {
      for (let i = 0; i < 12; i++) {
        const yaw = i * 2.39996;
        const pts = spine(0.35 + r() * 0.2, 0.15 + r() * 0.35, 0.3, yaw, new THREE.Vector3(), 3);
        polyStem(pts, 0.012, 0.009, C("#3d6e33"), out);
        out.push(leaf({ len: 0.42 + r() * 0.12, width: 0.13, shape: SHAPES.lance, a0: 0.5 + r() * 0.4, curl: 0.9, yaw: yaw + (r() - 0.5) * 0.3, base: pts[pts.length - 1], segs: 8, fold: 0.3, color: C("#1f5428"), tip: C("#2c6a30") }));
      }
      for (let i = 0; i < 3; i++) {
        const yaw = r() * Math.PI * 2;
        const top = new THREE.Vector3(Math.sin(yaw) * 0.12, 0.8 + r() * 0.15, Math.cos(yaw) * 0.12);
        out.push(stem(new THREE.Vector3(), top, 0.008, 0.007, C("#4b7a3c")));
        out.push(leaf({ len: 0.24, width: 0.11, shape: SHAPES.petal, a0: 0.15, curl: -0.2, yaw, base: top.clone().add(new THREE.Vector3(0, -0.06, 0)), segs: 6, fold: 0.9, color: C("#f2f4ec"), tip: C("#ffffff") }));
        out.push(stem(top.clone().add(new THREE.Vector3(0, -0.02, 0)), top.clone().add(new THREE.Vector3(Math.sin(yaw) * 0.02, 0.07, Math.cos(yaw) * 0.02)), 0.012, 0.01, C("#e8dfb0")));
      }
      break;
    }
    case "bamboo_palm":
    case "areca_palm": {
      const areca = species === "areca_palm";
      const canes = areca ? 3 : 4;
      for (let c = 0; c < canes; c++) {
        const yaw0 = (c / canes) * Math.PI * 2;
        const h = 0.35 + r() * 0.35;
        const top = new THREE.Vector3(Math.sin(yaw0) * 0.06, h, Math.cos(yaw0) * 0.06);
        out.push(stem(new THREE.Vector3(Math.sin(yaw0) * 0.04, 0, Math.cos(yaw0) * 0.04), top, 0.025, 0.02, areca ? C("#a79b4c") : C("#4f6e33"), 6));
        for (let f = 0; f < 3; f++) {
          frond(out, r, { len: 0.8 + r() * 0.35, a0: 0.15 + r() * 0.45, curl: 1.1, yaw: yaw0 + (f - 1) * 1.2 + r() * 0.4, base: top, pairs: 13, leafLen: 0.24, leafW: 0.022, rachis: areca ? C("#b2a14d") : C("#4b6b30"), color: areca ? C("#5a9137") : C("#2f6a2f"), tip: areca ? C("#7aa944") : C("#3d7d36"), droop: 0.7 });
        }
      }
      break;
    }
    case "boston_fern":
      for (let f = 0; f < 22; f++) {
        frond(out, r, { len: 0.6 + r() * 0.35, a0: 0.3 + r() * 0.8, curl: 1.5, yaw: f * 2.39996, base: new THREE.Vector3(0, 0.02, 0), pairs: 18, leafLen: 0.08, leafW: 0.018, rachis: C("#4f7d34"), color: C("#4f9234"), tip: C("#79b54a"), droop: 0.3 });
      }
      break;
    case "english_ivy":
      trailing(out, r, { vines: 7, leafLen: 0.11, leafW: 0.075, color: C("#1f4a26"), tip: C("#2b5c2e"), center: C("#8fa98a"), stem: C("#5b4a36"), potR });
      break;
    case "money_plant":
      trailing(out, r, { vines: 6, leafLen: 0.17, leafW: 0.11, color: C("#3f7c2f"), tip: C("#5d9a35"), center: C("#d9cf6a"), stem: C("#4f7a3a"), potR });
      break;
    case "chinese_evergreen":
      for (let i = 0; i < 13; i++) {
        const yaw = i * 2.39996;
        const pts = spine(0.15 + r() * 0.15, 0.2 + r() * 0.4, 0.2, yaw, new THREE.Vector3(), 2);
        polyStem(pts, 0.014, 0.01, C("#a8b39a"), out);
        out.push(leaf({ len: 0.4 + r() * 0.15, width: 0.12, shape: SHAPES.lance, a0: 0.45 + r() * 0.5, curl: 0.6, yaw, base: pts[pts.length - 1], segs: 8, fold: 0.25, color: C("#2e5a33"), tip: C("#335f36"), center: C("#b9c7b0") }));
      }
      break;
    case "spider_plant":
      rosette(out, r, { n: 26, len: [0.5, 0.75], width: 0.034, shape: SHAPES.strap, a0: [0.2, 0.9], curl: 1.6, fold: 0.25, color: C("#4f8f3a"), tip: C("#6aa548"), center: C("#ebe8c6"), segs: 10 });
      for (let i = 0; i < 2; i++) {
        const yaw = r() * Math.PI * 2;
        const pts = spine(0.8, 0.9, 1.6, yaw, new THREE.Vector3(), 6);
        polyStem(pts, 0.006, 0.005, C("#c9c79a"), out);
        rosette(out, r, { n: 7, len: [0.12, 0.18], width: 0.02, shape: SHAPES.strap, a0: [0.3, 1.0], curl: 0.8, color: C("#5b9a40"), center: C("#ebe8c6"), segs: 4, spread: 0 });
        const last = out.splice(out.length - 7, 7);
        const m = new THREE.Matrix4().makeTranslation(pts[6].x, pts[6].y, pts[6].z);
        last.forEach((g) => out.push(g.applyMatrix4(m)));
      }
      break;
    case "florists_chrysanthemum": {
      const tips = bush(out, r, { stems: 9, height: 0.6, spread: 0.6, leafLen: 0.12, leafW: 0.055, shape: SHAPES.ovate, every: 0.09, stemColor: C("#4a6b34"), color: C("#335f2c"), tip: C("#3f6e30") });
      tips.forEach((p) => out.push(blob(p.clone().add(new THREE.Vector3(0, 0.03, 0)), 0.075 + r() * 0.02, C(r() > 0.5 ? "#f2c53d" : "#f7d65a"), 2)));
      break;
    }
    case "tulsi": {
      const tips = bush(out, r, { stems: 8, height: 0.65, spread: 0.5, leafLen: 0.11, leafW: 0.05, shape: SHAPES.ovate, every: 0.08, stemColor: C("#5e4058"), color: C("#3f6b33"), tip: C("#6a4a5e") });
      tips.forEach((p) => {
        const top = p.clone().add(new THREE.Vector3(0, 0.16, 0));
        out.push(stem(p, top, 0.012, 0.004, C("#7d4f86")));
      });
      break;
    }
    case "hibiscus": {
      const tips = bush(out, r, { stems: 7, height: 0.85, spread: 0.6, leafLen: 0.15, leafW: 0.08, shape: SHAPES.ovate, every: 0.1, stemColor: C("#5a4a35"), color: C("#1d4a22"), tip: C("#285a29") });
      tips.slice(0, 4).forEach((p) => flower(out, r, p, { petals: 5, len: 0.15, w: 0.1, color: C("#d81b3c"), center: C("#f2d34a"), cup: 0.5 }));
      break;
    }
    case "bougainvillea": {
      const tips = bush(out, r, { stems: 8, height: 0.8, spread: 0.8, leafLen: 0.1, leafW: 0.055, shape: SHAPES.ovate, every: 0.1, stemColor: C("#5a4a35"), color: C("#2f5f2b") });
      tips.forEach((p) => {
        for (let k = 0; k < 4; k++) flower(out, r, p.clone().add(new THREE.Vector3((r() - 0.5) * 0.14, (r() - 0.5) * 0.1, (r() - 0.5) * 0.14)), { petals: 3, len: 0.06, w: 0.05, color: C("#d6267f"), center: C("#f4f0e0"), cup: 0.6 });
      });
      break;
    }
    case "yellow_oleander": {
      const tips = bush(out, r, { stems: 7, height: 0.85, spread: 0.5, leafLen: 0.16, leafW: 0.014, shape: SHAPES.linear, every: 0.06, stemColor: C("#4e6a36"), color: C("#2f6a2c"), a0: 0.6 });
      tips.forEach((p) => flower(out, r, p, { petals: 5, len: 0.08, w: 0.05, color: C("#f3d02c"), cup: 0.7 }));
      break;
    }
    case "weeping_fig":
    case "neem":
    case "shisham": {
      const trunkH = 0.55 + r() * 0.15;
      const opts = {
        weeping_fig: { color: C("#22502a"), tip: C("#2f6431"), leafLen: 0.1, leafW: 0.045, shape: SHAPES.lance, curl: 0.9 },
        neem: { color: C("#4f8f34"), tip: C("#6aa63f"), leafLen: 0.09, leafW: 0.025, shape: SHAPES.lance, curl: 0.4 },
        shisham: { color: C("#5d8f3a"), tip: C("#7aa84a"), leafLen: 0.07, leafW: 0.045, shape: SHAPES.round, curl: 0.3 },
      }[species]!;
      bush(out, r, { stems: 7, height: 0.6, spread: 0.6, leafLen: opts.leafLen, leafW: opts.leafW, shape: opts.shape, every: 0.045, stemColor: C("#6a5641"), color: opts.color, tip: opts.tip, a0: 1.0, curl: opts.curl, trunk: trunkH });
      break;
    }
    default:
      rosette(out, r, { n: 12, len: [0.4, 0.6], width: 0.08, shape: SHAPES.lance, a0: [0.3, 1.0], curl: 0.7, color: green });
  }
  const geometry = mergeGeometries(out, false)!;
  out.forEach((g) => g.dispose());
  geometry.computeBoundingBox();
  geometry.computeBoundingSphere();
  return { geometry, height: geometry.boundingBox!.max.y };
}
