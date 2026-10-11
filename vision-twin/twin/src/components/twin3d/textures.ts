// Procedural canvas textures for the twin (no image assets, works offline).
import * as THREE from "three";
import { rng } from "./plants";

const cache = new Map<string, THREE.Texture>();

function canvasTexture(key: string, w: number, h: number, draw: (g: CanvasRenderingContext2D, w: number, h: number) => void, srgb = true): THREE.Texture {
  const hit = cache.get(key);
  if (hit) return hit;
  const c = document.createElement("canvas");
  c.width = w;
  c.height = h;
  const g = c.getContext("2d")!;
  draw(g, w, h);
  const tex = new THREE.CanvasTexture(c);
  if (srgb) tex.colorSpace = THREE.SRGBColorSpace;
  tex.anisotropy = 8;
  cache.set(key, tex);
  return tex;
}

/** Printed circuit board: solder mask, copper traces, pads, vias, silkscreen. */
export function pcbTexture(opts: { key: string; mask: string; trace: string; label?: string; sub?: string; seed?: number; holes?: boolean; aspect?: number }): THREE.Texture {
  const aspect = opts.aspect ?? 1;
  const W = 512;
  const H = Math.round(W / aspect);
  return canvasTexture(`pcb:${opts.key}`, W, H, (g, w, h) => {
    const r = rng(opts.seed ?? 7);
    g.fillStyle = opts.mask;
    g.fillRect(0, 0, w, h);
    // subtle mask mottling
    for (let i = 0; i < 900; i++) {
      g.fillStyle = `rgba(255,255,255,${r() * 0.025})`;
      g.fillRect(r() * w, r() * h, 2 + r() * 6, 2 + r() * 6);
    }
    // traces: orthogonal runs with 45° jogs
    g.strokeStyle = opts.trace;
    g.lineCap = "round";
    for (let i = 0; i < 70; i++) {
      g.lineWidth = r() < 0.8 ? 1.5 : 3.5;
      let x = r() * w;
      let y = r() * h;
      g.beginPath();
      g.moveTo(x, y);
      for (let k = 0; k < 4; k++) {
        const len = 20 + r() * 120;
        const dir = Math.floor(r() * 8) * (Math.PI / 4);
        x += Math.cos(dir) * len;
        y += Math.sin(dir) * len;
        g.lineTo(x, y);
      }
      g.stroke();
      g.fillStyle = "#c9a54a";
      g.beginPath();
      g.arc(x, y, 2.6, 0, Math.PI * 2);
      g.fill();
    }
    // SMD pads
    for (let i = 0; i < 60; i++) {
      g.fillStyle = r() < 0.5 ? "#d8b65a" : "#b9bcbf";
      const pw = 4 + r() * 6;
      g.fillRect(r() * w, r() * h, pw, pw * (0.5 + r()));
    }
    // vias
    for (let i = 0; i < 120; i++) {
      const x = r() * w;
      const y = r() * h;
      g.fillStyle = "#c9a54a";
      g.beginPath();
      g.arc(x, y, 2.2, 0, Math.PI * 2);
      g.fill();
      g.fillStyle = "#111";
      g.beginPath();
      g.arc(x, y, 0.9, 0, Math.PI * 2);
      g.fill();
    }
    // component outlines
    g.strokeStyle = "rgba(240,240,240,0.65)";
    g.lineWidth = 1.5;
    for (let i = 0; i < 10; i++) g.strokeRect(r() * w * 0.9, r() * h * 0.9, 14 + r() * 40, 10 + r() * 26);
    // mounting holes
    if (opts.holes !== false) {
      const m = Math.min(w, h) * 0.065;
      for (const [x, y] of [[m, m], [w - m, m], [m, h - m], [w - m, h - m]]) {
        g.fillStyle = "#d4b25a";
        g.beginPath();
        g.arc(x, y, m * 0.62, 0, Math.PI * 2);
        g.fill();
        g.fillStyle = "#0a0a0a";
        g.beginPath();
        g.arc(x, y, m * 0.36, 0, Math.PI * 2);
        g.fill();
      }
    }
    if (opts.label) {
      g.fillStyle = "rgba(245,245,245,0.92)";
      g.font = `600 ${Math.round(h * 0.075)}px Inter, Arial, sans-serif`;
      g.fillText(opts.label, w * 0.08, h * 0.9);
      if (opts.sub) {
        g.font = `${Math.round(h * 0.05)}px Inter, Arial, sans-serif`;
        g.fillText(opts.sub, w * 0.08, h * 0.96);
      }
    }
  });
}

/** Pseudo ArUco-style 4x4 marker (visual only; the real stickers come from the pipeline). */
export function markerTexture(id: number): THREE.Texture {
  return canvasTexture(`marker:${id}`, 128, 160, (g, w, h) => {
    g.fillStyle = "#f4f4ef";
    g.fillRect(0, 0, w, h);
    const s = 96;
    const ox = (w - s) / 2;
    const oy = 10;
    const cell = s / 6;
    g.fillStyle = "#0b0b0b";
    g.fillRect(ox, oy, s, s);
    const r = rng(1000 + id * 7919);
    g.fillStyle = "#f4f4ef";
    for (let y = 0; y < 4; y++) for (let x = 0; x < 4; x++) if (r() > 0.5) g.fillRect(ox + (x + 1) * cell, oy + (y + 1) * cell, cell, cell);
    g.fillStyle = "#222";
    g.font = "600 20px JetBrains Mono, monospace";
    g.textAlign = "center";
    g.fillText(`#${id}`, w / 2, h - 18);
  });
}

/** Wood grain for shelf planks. */
export function woodTexture(): THREE.Texture {
  const t = canvasTexture("wood", 1024, 128, (g, w, h) => {
    const r = rng(42);
    const grad = g.createLinearGradient(0, 0, 0, h);
    grad.addColorStop(0, "#6b4a2f");
    grad.addColorStop(0.5, "#7a5636");
    grad.addColorStop(1, "#5e4029");
    g.fillStyle = grad;
    g.fillRect(0, 0, w, h);
    for (let i = 0; i < 140; i++) {
      g.strokeStyle = `rgba(${40 + r() * 30},${25 + r() * 15},${10 + r() * 10},${0.15 + r() * 0.3})`;
      g.lineWidth = 0.5 + r() * 2;
      const y = r() * h;
      g.beginPath();
      g.moveTo(0, y);
      for (let x = 0; x <= w; x += 32) g.lineTo(x, y + Math.sin(x * 0.01 + i) * (2 + r() * 3));
      g.stroke();
    }
    for (let i = 0; i < 4; i++) {
      const x = r() * w;
      const y = r() * h;
      g.fillStyle = "rgba(40,24,12,0.45)";
      g.beginPath();
      g.ellipse(x, y, 10 + r() * 14, 4 + r() * 4, 0, 0, Math.PI * 2);
      g.fill();
    }
  });
  t.wrapS = t.wrapT = THREE.RepeatWrapping;
  return t;
}

/** Fine noise used for terracotta, soil and brushed metal variation. */
export function noiseTexture(key: string, base: string, spread: number, streak = false): THREE.Texture {
  const t = canvasTexture(`noise:${key}`, 256, 256, (g, w, h) => {
    const r = rng(key.length * 131);
    g.fillStyle = base;
    g.fillRect(0, 0, w, h);
    const n = streak ? 2200 : 5000;
    for (let i = 0; i < n; i++) {
      const v = (r() - 0.5) * spread;
      g.fillStyle = v > 0 ? `rgba(255,255,255,${v})` : `rgba(0,0,0,${-v})`;
      if (streak) g.fillRect(r() * w * 0.5, r() * h, w * (0.2 + r() * 0.5), 1);
      else g.fillRect(r() * w, r() * h, 1 + r() * 3, 1 + r() * 3);
    }
  });
  t.wrapS = t.wrapT = THREE.RepeatWrapping;
  return t;
}

/** Sticker/label plate with text lines. */
export function labelTexture(key: string, bg: string, fg: string, lines: [string, number, string?][], w = 512, h = 256): THREE.Texture {
  return canvasTexture(`label:${key}`, w, h, (g) => {
    g.fillStyle = bg;
    g.fillRect(0, 0, w, h);
    let y = 0;
    for (const [text, size, weight] of lines) {
      y += size * 1.25;
      g.fillStyle = fg;
      g.font = `${weight ?? "600"} ${size}px Inter, Arial, sans-serif`;
      g.fillText(text, w * 0.07, y);
    }
  });
}

/** PMS5003 top: brushed aluminium with an inlet grille and printed label. */
export function pmsTexture(): THREE.Texture {
  return canvasTexture("pms", 512, 384, (g, w, h) => {
    const r = rng(5003);
    g.fillStyle = "#b9bec3";
    g.fillRect(0, 0, w, h);
    for (let i = 0; i < 600; i++) {
      g.fillStyle = `rgba(${r() > 0.5 ? 255 : 0},${r() > 0.5 ? 255 : 0},${r() > 0.5 ? 255 : 0},0.04)`;
      g.fillRect(0, r() * h, w, 1);
    }
    g.fillStyle = "#f2f2ee";
    g.fillRect(w * 0.06, h * 0.08, w * 0.56, h * 0.42);
    g.fillStyle = "#1a1a1a";
    g.font = "700 34px Inter, Arial, sans-serif";
    g.fillText("PLANTOWER", w * 0.09, h * 0.2);
    g.font = "600 46px Inter, Arial, sans-serif";
    g.fillText("PMS5003", w * 0.09, h * 0.34);
    g.font = "18px Inter, Arial, sans-serif";
    g.fillText("Digital particle concentration", w * 0.09, h * 0.44);
    g.fillStyle = "#2a2d30";
    for (let y = 0; y < 5; y++) for (let x = 0; x < 6; x++) {
      g.beginPath();
      g.arc(w * 0.7 + x * 22, h * 0.6 + y * 24, 7, 0, Math.PI * 2);
      g.fill();
    }
  });
}

/** Stainless mesh for the MQ-135 cap. */
export function meshCapTexture(): THREE.Texture {
  const t = canvasTexture("meshcap", 128, 128, (g, w, h) => {
    g.fillStyle = "#3a3f44";
    g.fillRect(0, 0, w, h);
    g.strokeStyle = "#cfd4d8";
    g.lineWidth = 2;
    for (let i = 0; i <= w; i += 8) {
      g.beginPath(); g.moveTo(i, 0); g.lineTo(i, h); g.stroke();
      g.beginPath(); g.moveTo(0, i); g.lineTo(w, i); g.stroke();
    }
  });
  t.wrapS = t.wrapT = THREE.RepeatWrapping;
  t.repeat.set(4, 2);
  return t;
}

/** Face of an AIR coin. */
export function coinTexture(): THREE.Texture {
  return canvasTexture("coin", 256, 256, (g, w, h) => {
    const grad = g.createRadialGradient(w / 2, h / 2, 10, w / 2, h / 2, w / 2);
    grad.addColorStop(0, "#ffe9a3");
    grad.addColorStop(0.7, "#e6b84a");
    grad.addColorStop(1, "#a8761f");
    g.fillStyle = grad;
    g.fillRect(0, 0, w, h);
    g.strokeStyle = "#9a6a17";
    g.lineWidth = 8;
    g.beginPath();
    g.arc(w / 2, h / 2, w * 0.4, 0, Math.PI * 2);
    g.stroke();
    g.fillStyle = "#7a520f";
    g.font = "800 78px Inter, Arial, sans-serif";
    g.textAlign = "center";
    g.textBaseline = "middle";
    g.translate(w / 2, h / 2);
    g.rotate(-Math.PI / 2); // cylinder caps map u/v sideways; pre-rotate so the text reads upright
    g.fillText("AIR", 0, 4);
  });
}
