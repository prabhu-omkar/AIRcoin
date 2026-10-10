import { defineConfig } from "vitest/config";
import react from "@vitejs/plugin-react";
import { fileURLToPath } from "node:url";

const repoRoot = fileURLToPath(new URL("../..", import.meta.url));

export default defineConfig({
  plugins: [react()],
  // The twin imports ../config/rig.json and ../../contracts-schema (read-only).
  server: { host: true, port: 5173, fs: { allow: [repoRoot] } },
  build: { chunkSizeWarningLimit: 2000 },
  test: { environment: "node" },
});
