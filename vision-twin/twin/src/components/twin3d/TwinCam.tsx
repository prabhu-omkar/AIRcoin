// "What the miner's camera sees": the same twin world rendered from the lens, at the Camera Module 3 Wide
// field of view, with the vision pipeline's annotations drawn on top (ArUco quads, plant boxes, status).
import { Canvas, useFrame, useThree } from "@react-three/fiber";
import { useEffect, useMemo, useRef } from "react";
import * as THREE from "three";
import { rigLayout } from "../../config";
import type { PlantStatus } from "../../contracts";
import { speciesName } from "../../species";
import { useTwin } from "../../store";
import { markerCorners, PLANT_LAYER, PLANT_MAX_H, Rig, RIG, slotPosition } from "./Rig";
import { Atmosphere, CAMERA_VFOV, Floor, LENS_WORLD, Lights, Studio } from "./Stage";

const FPS = 15;
const COLORS: Record<PlantStatus, string> = { present: "#7bd389", suspect: "#ff6b5a", missing: "#f2b33d", removed: "#9aa7a3" };

interface Box { tag: number; x0: number; y0: number; x1: number; y1: number }

/** Renders at a fixed rate and draws the detection overlay right after each frame. */
function CameraRender({ ndvi, focus, overlay, boxes }: { ndvi: boolean; focus?: number; overlay: React.RefObject<HTMLCanvasElement>; boxes: React.MutableRefObject<Box[]> }) {
  const { gl, scene, camera, invalidate, size } = useThree();
  const dark = useMemo(() => new THREE.MeshBasicMaterial({ color: "#0b1530" }), []);
  const v = useMemo(() => new THREE.Vector3(), []);
  const corners = useMemo(() => rigLayout.plants.map((rp) => ({ rp, marker: markerCorners(rp.slot), base: slotPosition(rp.slot) })), []);
  const jitter = useRef({ at: 0, seed: 1 });
  const scenePositions = useTwin((s) => s.scenePositions);

  useEffect(() => {
    // the whole rack at the lens's real field of view, or zoomed onto one plant (like a crop of the frame)
    const rp = focus !== undefined ? rigLayout.plants.find((p) => p.tag_id === focus) : undefined;
    const cam = camera as THREE.PerspectiveCamera;
    camera.position.copy(LENS_WORLD);
    if (rp) {
      const moved = scenePositions[rp.tag_id];
      const p = moved ? new THREE.Vector3(...moved) : slotPosition(rp.slot);
      camera.lookAt(p.x, p.y + 0.45, p.z);
      cam.fov = 19;
    } else {
      camera.lookAt(LENS_WORLD.x, LENS_WORLD.y, 0);
      cam.fov = CAMERA_VFOV;
    }
    cam.updateProjectionMatrix();
    invalidate();
  }, [camera, focus, invalidate, scenePositions]);
  useEffect(() => {
    const id = setInterval(() => invalidate(), 1000 / FPS);
    return () => clearInterval(id);
  }, [camera, invalidate]);

  useFrame((state) => {
    // ---- render: NDVI = everything dark, then only the plants in false colour ----
    if (ndvi) {
      const plants: THREE.Object3D[] = [];
      scene.traverse((o) => { if ((o as THREE.Mesh).isMesh && o.layers.isEnabled(PLANT_LAYER)) plants.push(o); });
      plants.forEach((o) => (o.visible = false));
      scene.overrideMaterial = dark;
      gl.render(scene, camera);
      scene.overrideMaterial = null;
      plants.forEach((o) => (o.visible = true));
      camera.layers.set(PLANT_LAYER);
      gl.autoClear = false;
      gl.render(scene, camera);
      gl.autoClear = true;
      camera.layers.enableAll();
    } else {
      gl.render(scene, camera);
    }

    // ---- detection overlay (what aircoin_vision.detect draws) ----
    const cv = overlay.current;
    if (!cv) return;
    const dpr = Math.min(window.devicePixelRatio, 2);
    const W = size.width;
    const H = size.height;
    if (cv.width !== Math.round(W * dpr)) { cv.width = Math.round(W * dpr); cv.height = Math.round(H * dpr); }
    const g = cv.getContext("2d")!;
    g.setTransform(dpr, 0, 0, dpr, 0, 0);
    g.clearRect(0, 0, W, H);
    const st = useTwin.getState();
    const tel = st.telemetry;
    const now = state.clock.elapsedTime;
    if (now - jitter.current.at > 0.5) jitter.current = { at: now, seed: Math.random() * 1000 };
    const js = jitter.current.seed;
    const project = (p: THREE.Vector3) => {
      v.copy(p).project(camera);
      return [(v.x * 0.5 + 0.5) * W, (-v.y * 0.5 + 0.5) * H] as const;
    };
    const fs = Math.max(8, Math.min(12, W / 64));
    g.font = `600 ${fs}px "IBM Plex Mono", ui-monospace, monospace`;
    g.lineJoin = "round";
    const out: Box[] = [];
    for (const { rp, marker, base: expectedBase } of corners) {
      const p = tel?.plants.find((x) => x.tag_id === rp.tag_id);
      const moved = st.scenePositions[rp.tag_id];
      const base = moved ? new THREE.Vector3(...moved) : expectedBase;
      const delta = base.clone().sub(expectedBase);
      const actualMarker = marker.map((point) => point.clone().add(delta));
      const status: PlantStatus = p?.status ?? "missing";
      const potHere = status !== "missing" && status !== "removed";
      const sel = st.selectedPlant === rp.tag_id;
      const jx = Math.sin(js + rp.tag_id * 7.1) * 0.8;
      const jy = Math.cos(js + rp.tag_id * 3.3) * 0.8;
      // plant crop box
      const pts = [
        new THREE.Vector3(base.x - 0.88, base.y - RIG.potH + 0.02, base.z + RIG.potR),
        new THREE.Vector3(base.x + 0.88, base.y + PLANT_MAX_H - 0.05, base.z + RIG.potR),
      ].map(project);
      const x0 = Math.min(pts[0][0], pts[1][0]) + jx;
      const x1 = Math.max(pts[0][0], pts[1][0]) + jx;
      const y0 = Math.min(pts[0][1], pts[1][1]) + jy;
      const y1 = Math.max(pts[0][1], pts[1][1]) + jy;
      out.push({ tag: rp.tag_id, x0, y0, x1, y1 });
      const col = COLORS[status];
      g.strokeStyle = col;
      g.fillStyle = col;
      g.lineWidth = sel ? 2.5 : 1.4;
      if (potHere) {
        g.setLineDash([]);
        g.strokeRect(x0, y0, x1 - x0, y1 - y0);
        // ArUco quad + first-corner marker, as cv2.aruco.drawDetectedMarkers does
        const q = actualMarker.map(project);
        g.beginPath();
        q.forEach(([x, y], i) => (i ? g.lineTo(x + jx, y + jy) : g.moveTo(x + jx, y + jy)));
        g.closePath();
        g.strokeStyle = "#a6d17e";
        g.stroke();
        g.fillStyle = "#df6a4f";
        g.fillRect(q[0][0] + jx - 2, q[0][1] + jy - 2, 4, 4);
        g.fillStyle = col;
        const wide = x1 - x0 > 150;
        const text = status === "suspect" ? `#${rp.tag_id} SUSPECT` : wide ? `#${rp.tag_id} ${speciesName(rp.species).toLowerCase()} ${(p?.species_conf ?? 0).toFixed(2)}` : `#${rp.tag_id} ${(p?.species_conf ?? 0).toFixed(2)}`;
        const tw = Math.min(g.measureText(text).width + 8, x1 - x0);
        g.fillRect(x0, y0, tw, fs + 5);
        g.fillStyle = status === "suspect" ? "#fff" : "#04130b";
        g.fillText(text, x0 + 4, y0 + fs + 1, tw - 6);
      } else {
        // expected slot with no marker in view
        g.setLineDash([5, 4]);
        g.strokeRect(x0, y0, x1 - x0, y1 - y0);
        g.setLineDash([]);
        const label = `#${rp.tag_id} ${status.toUpperCase()}`;
        g.fillText(label, x0 + 4, y1 - 6, x1 - x0 - 8);
      }
      if (sel) {
        g.strokeStyle = "#ffffff";
        g.lineWidth = 1;
        g.setLineDash([2, 3]);
        g.strokeRect(x0 - 3, y0 - 3, x1 - x0 + 6, y1 - y0 + 6);
        g.setLineDash([]);
      }
    }
    boxes.current = out;
  }, 1);
  return null;
}

function CamScene({ ndvi }: { ndvi: boolean }) {
  const selected = useTwin((s) => s.selectedPlant);
  return (
    <>
      <Atmosphere />
      <Studio />
      <Lights shadowSize={1024} />
      <Floor />
      <Rig vision={false} labels={false} selected={selected} ndvi={ndvi} showFakes />
    </>
  );
}

function useClock() {
  const ref = useRef<HTMLSpanElement>(null);
  useEffect(() => {
    const id = setInterval(() => {
      if (!ref.current) return;
      const d = new Date();
      ref.current.textContent = `${d.toISOString().slice(0, 10)} ${d.toTimeString().slice(0, 8)}.${String(d.getMilliseconds()).padStart(3, "0").slice(0, 2)}`;
    }, 80);
    return () => clearInterval(id);
  }, []);
  return ref;
}

/** The miner camera view: same world as the twin, seen through the lens. */
/** mode "live" = the lens view; "ndvi" = plant health in false colour (blue = no living tissue). */
export function TwinCam({ mode = "live", focus }: { mode?: "live" | "ndvi"; focus?: number }) {
  const overlay = useRef<HTMLCanvasElement>(null);
  const boxes = useRef<Box[]>([]);
  const clock = useClock();
  const tel = useTwin((s) => s.telemetry);
  const selectPlant = useTwin((s) => s.selectPlant);
  const selected = useTwin((s) => s.selectedPlant);
  const seen = rigLayout.plants.filter((rp) => {
    const st = tel?.plants.find((p) => p.tag_id === rp.tag_id)?.status;
    return st !== "missing" && st !== "removed";
  }).length;

  const click = (e: React.MouseEvent<HTMLCanvasElement>) => {
    const r = e.currentTarget.getBoundingClientRect();
    const x = e.clientX - r.left;
    const y = e.clientY - r.top;
    const hit = boxes.current.find((b) => x >= b.x0 && x <= b.x1 && y >= b.y0 && y <= b.y1);
    selectPlant(hit && hit.tag !== selected ? hit.tag : undefined);
  };

  return (
    <div className="twincam">
      <div className="twincam-frame">
        <Canvas
          frameloop="demand"
          dpr={1}
          shadows
          gl={{ antialias: true, toneMapping: THREE.AgXToneMapping, powerPreference: "high-performance" }}
          camera={{ fov: CAMERA_VFOV, near: 0.1, far: 90, position: LENS_WORLD.toArray() }}
        >
          <CamScene ndvi={mode === "ndvi"} />
          <CameraRender ndvi={mode === "ndvi"} focus={focus} overlay={overlay} boxes={boxes} />
        </Canvas>
        <canvas ref={overlay} className="twincam-overlay" onClick={click} />
      </div>
      <div className="osd">
        <div className="osd-tl"><span className="rec">● REC</span> CAM0 · IMX708 NoIR Wide{mode === "ndvi" ? " · NDVI" : ""}</div>
        <div className="osd-tr"><span ref={clock} /></div>
        <div className="osd-bl">tags {seen}/{rigLayout.plants.length} · 1.0 Hz · 2304×1296</div>
        <div className="osd-br">{tel?.miner_id ?? "miner"} · epoch {tel?.current_epoch.epoch ?? "—"}</div>
      </div>
    </div>
  );
}
