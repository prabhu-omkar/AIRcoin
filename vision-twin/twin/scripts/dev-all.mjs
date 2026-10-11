// npm run dev: mock hub + twin (:5173) + dashboard (:5174), each in its own process. npm run dev:live: real data.
import { spawn } from "node:child_process";

// --live: real data. C2 from miner-core relayed by the hub (no WebSocket broker needed), C4 from the
// chain-market indexer, camera from aircoin_vision.run --serve.
if (process.argv.includes("--live")) {
  Object.assign(process.env, {
    HUB_MODE: "bridge",
    VITE_SOURCE: "live",
    VITE_MQTT_URL: process.env.VITE_MQTT_URL ?? "http://localhost:5175",
    VITE_C4_URL: process.env.VITE_C4_URL ?? "http://localhost:3002",
    VITE_FEED_URL: process.env.VITE_FEED_URL ?? "http://localhost:8080/",
  });
}

const procs = [
  ["hub", "npx vite-node scripts/mock-hub.ts"],
  ["twin", "npx vite --mode twin"],
  ["dashboard", "npx vite --mode dashboard"],
].map(([name, cmd]) => {
  const p = spawn(cmd, { shell: true, stdio: ["ignore", "pipe", "pipe"] });
  const tag = `[${name}]`.padEnd(12);
  const out = (d) => d.toString().split(/\r?\n/).filter(Boolean).forEach((l) => console.log(tag, l));
  p.stdout.on("data", out);
  p.stderr.on("data", out);
  p.on("exit", (code) => console.log(tag, `exited (${code})`));
  return p;
});

const stop = () => {
  procs.forEach((p) => p.kill());
  process.exit(0);
};
process.on("SIGINT", stop);
process.on("SIGTERM", stop);
