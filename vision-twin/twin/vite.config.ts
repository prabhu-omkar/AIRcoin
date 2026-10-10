import { defineConfig } from "vitest/config";
import react from "@vitejs/plugin-react";
import { fileURLToPath } from "node:url";

// Two apps share src/ (data layer, 3D scene, panels):
//   twin       judges' demo: full-screen 3D digital twin          vite --mode twin       :5173
//   dashboard  miner owner: camera, plants, sensors, earnings     vite --mode dashboard  :5174
const APPS = { twin: 5173, dashboard: 5174 } as const;
const here = (p: string) => fileURLToPath(new URL(p, import.meta.url));
const repoRoot = here("../..");

export default defineConfig(({ mode }) => {
  const app = (mode in APPS ? mode : "twin") as keyof typeof APPS;
  return {
    root: here(`apps/${app}`),
    envDir: here("."),
    cacheDir: here(`node_modules/.vite-${app}`), // two dev servers must not share one optimizer cache
    publicDir: here("public"),
    plugins: [react()],
    // The apps import ../config/rig.json and ../../contracts-schema (read-only).
    server: { host: true, port: APPS[app], strictPort: true, fs: { allow: [repoRoot] } },
    preview: { port: APPS[app] },
    build: { outDir: here(`dist/${app}`), emptyOutDir: true, chunkSizeWarningLimit: 2500 },
    test: { root: here("."), dir: here("src"), environment: "node" },
  };
});
