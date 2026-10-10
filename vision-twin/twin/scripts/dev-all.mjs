// npm run dev: mock hub + twin (:5173) + dashboard (:5174), each in its own process.
import { spawn } from "node:child_process";

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
