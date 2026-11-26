#!/usr/bin/env python3
"""AIRcoin demo runner (Windows, macOS, Linux).

    python scripts/demo.py start [--nodes 4] [--fresh] [--camera synthetic|picam|usb:0] [--no-ui]
    python scripts/demo.py status
    python scripts/demo.py kill-node 3        # show the chain surviving a dead miner
    python scripts/demo.py restart node3      # ...and the node catching back up
    python scripts/demo.py logs miner
    python scripts/demo.py stop

What runs:
  mqtt      Mosquitto (1883, WebSocket 9001) via Docker or a local install; else miner-core's broker (no WS)
  node0..N  aircoind: AIRcoin chain nodes, one per miner; gateways on :8700, :8701, ...
  miner     miner-core daemon for miner-001 (real engine and signer) -> node0
  sim-*     simulated miners for miner-002.. (aircoind simulate-miner) -> their own nodes
  vision    camera pipeline (only with --camera): C1 over MQTT, streams on :8080
  web       marketplace   http://localhost:3000
  twin      digital twin  http://localhost:5174

Chain data lives in .demo/chain and survives restarts; --fresh starts a new chain.
"""

from __future__ import annotations

import argparse
import json
import os
import shutil
import signal
import socket
import subprocess
import sys
import time
import urllib.request
from pathlib import Path

ROOT = Path(__file__).resolve().parent.parent
RUN = ROOT / ".demo"
LOGS = RUN / "logs"
PIDS = RUN / "pids.json"
CHAIN_DIR = ROOT / "aircoin-chain"
NET = RUN / "chain"
SEED = CHAIN_DIR / "demo" / "demo-accounts.json"
WIN = os.name == "nt"
BIN = CHAIN_DIR / "bin" / ("aircoind.exe" if WIN else "aircoind")
API_BASE = 8700
PY = sys.executable


# ---------------------------------------------------------------- process helpers

def pids() -> dict[str, int]:
    try:
        return json.loads(PIDS.read_text())
    except Exception:
        return {}


def save_pids(p: dict[str, int]) -> None:
    RUN.mkdir(parents=True, exist_ok=True)
    PIDS.write_text(json.dumps(p, indent=2))


def alive(pid: int) -> bool:
    if WIN:
        out = subprocess.run(["tasklist", "/FI", f"PID eq {pid}"], capture_output=True, text=True).stdout
        return str(pid) in out
    try:
        os.kill(pid, 0)
        return True
    except OSError:
        return False


def port_open(port: int) -> bool:
    with socket.socket() as s:
        s.settimeout(0.3)
        return s.connect_ex(("127.0.0.1", port)) == 0


def wait_port(port: int, timeout: float = 30) -> bool:
    end = time.time() + timeout
    while time.time() < end:
        if port_open(port):
            return True
        time.sleep(0.3)
    return False


def launch(name: str, cmd: list[str], cwd: Path, env: dict[str, str] | None = None) -> None:
    p = pids()
    if name in p and alive(p[name]):
        print(f"  {name:<12} already running (pid {p[name]})")
        return
    LOGS.mkdir(parents=True, exist_ok=True)
    log = open(LOGS / f"{name}.log", "ab")
    kw: dict = {"cwd": str(cwd), "stdout": log, "stderr": subprocess.STDOUT, "stdin": subprocess.DEVNULL,
                "env": {**os.environ, **(env or {})}}
    if WIN:
        kw["creationflags"] = subprocess.CREATE_NEW_PROCESS_GROUP | 0x08000000  # CREATE_NO_WINDOW
    else:
        kw["start_new_session"] = True
    proc = subprocess.Popen(cmd, **kw)
    p[name] = proc.pid
    save_pids(p)
    print(f"  {name:<12} pid {proc.pid:<7} log .demo/logs/{name}.log")


def kill(name: str) -> None:
    p = pids()
    pid = p.pop(name, None)
    save_pids(p)
    if not pid or not alive(pid):
        return
    if WIN:
        subprocess.run(["taskkill", "/F", "/T", "/PID", str(pid)], capture_output=True)
    else:
        try:
            os.killpg(pid, signal.SIGTERM)
            for _ in range(30):
                if not alive(pid):
                    break
                time.sleep(0.2)
            else:
                os.killpg(pid, signal.SIGKILL)
        except OSError:
            pass
    print(f"  stopped {name}")


def need(tool: str, hint: str) -> str:
    path = shutil.which(tool)
    if not path:
        sys.exit(f"{tool} not found: {hint}")
    return path


def get_json(url: str):
    try:
        with urllib.request.urlopen(url, timeout=2) as r:
            return json.load(r)
    except Exception:
        return None


# ---------------------------------------------------------------- services

def start_mqtt() -> None:
    if port_open(1883):
        print("  mqtt         already listening on :1883")
        return
    docker = shutil.which("docker")
    if docker and subprocess.run([docker, "info"], capture_output=True).returncode == 0:
        subprocess.run([docker, "compose", "up", "-d", "mqtt"], cwd=ROOT, check=True)
        wait_port(1883, 20)
        print("  mqtt         Mosquitto (Docker) on :1883, WebSocket :9001")
        return
    mosq = shutil.which("mosquitto") or next((p for p in [r"C:\Program Files\mosquitto\mosquitto.exe"] if Path(p).exists()), None)
    if mosq:
        RUN.mkdir(parents=True, exist_ok=True)
        conf = RUN / "mosquitto.conf"
        conf.write_text("listener 1883\nprotocol mqtt\nallow_anonymous true\n"
                        "listener 9001\nprotocol websockets\nsocket_domain ipv4\n")
        launch("mqtt", [mosq, "-c", str(conf)], ROOT)
        wait_port(1883, 10)
        print("  mqtt         Mosquitto on :1883, WebSocket :9001")
        return
    print("  mqtt         no Docker or Mosquitto: using miner-core's broker (the twin's live MQTT needs Mosquitto)")
    launch("mqtt", [PY, "-m", "mock.mqtt_broker"], ROOT / "miner-core")
    wait_port(1883, 10)


def build_chain() -> None:
    go = shutil.which("go")
    sources = list((CHAIN_DIR / "cmd").rglob("*.go")) + list((CHAIN_DIR / "internal").rglob("*.go"))
    newest = max(f.stat().st_mtime for f in sources)
    if BIN.exists() and BIN.stat().st_mtime >= newest:
        return
    if not go:
        if BIN.exists():
            return
        sys.exit("Go is needed to build aircoind: install it from https://go.dev/dl (1.21+)")
    print("  building aircoind…")
    subprocess.run([go, "build", "-o", str(BIN), "./cmd/aircoind"], cwd=CHAIN_DIR, check=True)


def accounts() -> dict:
    return json.loads((NET / "accounts.json").read_text())


def start_chain(n: int, fresh: bool) -> None:
    build_chain()
    if fresh and NET.exists():
        for name in [k for k in pids() if k.startswith(("node", "sim-")) or k == "miner"]:
            kill(name)
        shutil.rmtree(NET)
        shutil.rmtree(ROOT / "miner-core" / "var", ignore_errors=True)  # its queue holds old epochs
    if not (NET / "genesis.json").exists():
        subprocess.run([str(BIN), "testnet", "--validators", str(n), "--out", str(NET), "--seed", str(SEED)],
                       check=True, stdout=subprocess.DEVNULL)
        print(f"  new chain    {n} miner nodes, demo accounts from {SEED.relative_to(ROOT)}")
    for i, m in enumerate(accounts()["miners"]):
        launch(f"node{i}", [str(BIN), "start", "--home", m["node"]["home"]], ROOT)
    if not wait_port(API_BASE, 30):
        sys.exit("node0 gateway did not come up; see .demo/logs/node0.log")
    for _ in range(40):
        st = get_json(f"http://127.0.0.1:{API_BASE}/v1/status")
        if st and st["height"] > 0:
            print(f"  chain        {st['chain_id']} at block {st['height']}, {st['peers']} peers")
            break
        time.sleep(0.5)


def start_miners(camera: str | None) -> None:
    acc = accounts()
    env = {"CHAIN_URL": f"http://127.0.0.1:{API_BASE}", "MINER_ID": "miner-001", "GPS_SOURCE": "none",
           "VISION_SOURCE": "mqtt" if camera else "mock", "MQTT_HOST": "127.0.0.1"}
    launch("miner", [PY, "-m", "minerd", "daemon"], ROOT / "miner-core", env)
    for i, m in enumerate(acc["miners"][1:], start=1):
        launch(f"sim-{m['miner_id']}", [str(BIN), "simulate-miner", "--node", f"http://127.0.0.1:{API_BASE + i}",
                                        "--miner-id", m["miner_id"], "--key", m["device"]["private_key"]], ROOT)


def start_vision(camera: str) -> None:
    pipe = ROOT / "vision-twin" / "pipeline"
    src, extra = camera, []
    if camera == "synthetic":
        frames = ROOT / "vision-twin" / "data" / "demo-frames"
        if not frames.exists():
            subprocess.run([PY, "-m", "aircoin_vision.synth", str(frames), "--noir", "--frames", "24"], cwd=pipe, check=True)
        src, extra = str(frames), ["--loop"]
    if not (ROOT / "vision-twin" / "data" / "enrolment" / "miner-001" / "enrolment.json").exists():
        subprocess.run([PY, "-m", "aircoin_vision.enrol", src, "--backend", "leafhist", "--frames", "5"], cwd=pipe, check=True)
    launch("vision", [PY, "-m", "aircoin_vision.run", src, *extra, "--serve", "8080"], pipe)


def start_ui(camera: str | None) -> None:
    npm = need("npm", "install Node.js 18+ from https://nodejs.org")
    for app in (ROOT / "chain-market" / "web", ROOT / "vision-twin" / "twin"):
        if not (app / "node_modules").exists():
            print(f"  npm install in {app.relative_to(ROOT)}…")
            subprocess.run([npm, "install", "--no-audit", "--no-fund"], cwd=app, check=True)
    chain = f"http://localhost:{API_BASE}"
    launch("web", [npm, "run", "dev"], ROOT / "chain-market" / "web",
           {"VITE_CHAIN_URL": chain, "VITE_TWIN_URL": "http://localhost:5174/"})
    twin_env = {"VITE_SOURCE": "live", "VITE_C4_URL": chain, "VITE_MQTT_WS": "ws://localhost:9001",
                "VITE_MARKET_URL": "http://localhost:3000/"}
    if camera:
        twin_env["VITE_FEED_URL"] = "http://localhost:8080/"
    launch("twin", [npm, "run", "dev"], ROOT / "vision-twin" / "twin", twin_env)


# ---------------------------------------------------------------- commands

def cmd_start(a) -> None:
    print("AIRcoin demo")
    start_mqtt()
    start_chain(a.nodes, a.fresh)
    if a.camera:
        start_vision(a.camera)
    start_miners(a.camera)
    if not a.no_ui:
        start_ui(a.camera)
    print()
    print(f"  chain gateways   http://localhost:{API_BASE} … :{API_BASE + len(accounts()['miners']) - 1}")
    print("  miner health     http://localhost:8090/health")
    if not a.no_ui:
        print("  marketplace      http://localhost:3000   (alice@aircoin.in, compliance@apexsteel.in … password: aircoin)")
        print("  digital twin     http://localhost:5174")
    print("  status / stop    python scripts/demo.py status | stop")


def cmd_status(_a) -> None:
    p = pids()
    for name, pid in p.items():
        print(f"  {name:<14} {'up  ' if alive(pid) else 'DOWN'} pid {pid}")
    if not NET.exists():
        return
    print()
    for i, m in enumerate(accounts()["miners"]):
        st = get_json(f"http://127.0.0.1:{API_BASE + i}/v1/status")
        info = get_json(f"http://127.0.0.1:{API_BASE + i}/v1/miners/{m['miner_id']}") if st else None
        if st:
            t = info["totals"] if info else {}
            print(f"  {m['miner_id']}  block {st['height']:<6} peers {st['peers']}  hash {st['app_hash'][:12]}  "
                  f"minted {int(t.get('minted', '0')) / 1e18:.4f} AIR in {t.get('epochs_minted', 0)} epochs, "
                  f"{t.get('epochs_rejected', 0)} rejected")
        else:
            print(f"  {m['miner_id']}  node offline")


def cmd_stop(_a) -> None:
    for name in reversed(list(pids())):
        kill(name)
    if shutil.which("docker") and port_open(1883):
        subprocess.run(["docker", "compose", "stop", "mqtt"], cwd=ROOT, capture_output=True)


def cmd_kill_node(a) -> None:
    kill(f"node{a.index}")
    print(f"  node{a.index} is down; the other miners keep making blocks (BFT tolerates up to 1/3 offline).")
    print(f"  bring it back with: python scripts/demo.py restart node{a.index}")


def cmd_restart(a) -> None:
    kill(a.service)
    if a.service.startswith("node"):
        i = int(a.service[4:])
        launch(a.service, [str(BIN), "start", "--home", accounts()["miners"][i]["node"]["home"]], ROOT)
    elif a.service == "mqtt":
        start_mqtt()
    elif a.service == "miner" or a.service.startswith("sim-"):
        start_miners(None)
    elif a.service in ("web", "twin"):
        start_ui(None)
    else:
        sys.exit(f"unknown service {a.service}")


def cmd_logs(a) -> None:
    f = LOGS / f"{a.service}.log"
    if not f.exists():
        sys.exit(f"no log for {a.service}")
    print("".join(f.read_text(errors="replace").splitlines(keepends=True)[-a.lines:]))


def main() -> None:
    ap = argparse.ArgumentParser(description=__doc__, formatter_class=argparse.RawDescriptionHelpFormatter)
    sub = ap.add_subparsers(dest="cmd")
    s = sub.add_parser("start")
    s.add_argument("--nodes", type=int, default=4, help="miner nodes in a new chain (default 4)")
    s.add_argument("--fresh", action="store_true", help="discard the chain and start a new one")
    s.add_argument("--camera", help="run the vision pipeline: synthetic | picam | usb:0 | a frames folder")
    s.add_argument("--no-ui", action="store_true", help="skip the marketplace and twin dev servers")
    sub.add_parser("status")
    sub.add_parser("stop")
    k = sub.add_parser("kill-node")
    k.add_argument("index", type=int)
    r = sub.add_parser("restart")
    r.add_argument("service")
    lg = sub.add_parser("logs")
    lg.add_argument("service")
    lg.add_argument("-n", "--lines", type=int, default=40)
    a = ap.parse_args()
    {"start": cmd_start, "status": cmd_status, "stop": cmd_stop, "kill-node": cmd_kill_node,
     "restart": cmd_restart, "logs": cmd_logs}.get(a.cmd or "start", cmd_start)(a if a.cmd else ap.parse_args(["start"]))


if __name__ == "__main__":
    main()
