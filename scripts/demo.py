#!/usr/bin/env python3
"""AIRcoin Cross-Platform Demo Controller (macOS, Linux, Windows).

Starts, monitors, and recovers all 6 AIRcoin components:
  1. MQTT Broker (Mosquitto on :1883 or built-in mock broker)
  2. Local Blockchain (Hardhat node on :8545) with contract deploy & seed
  3. Validator Oracle (Express on :3001)
  4. Miner Daemon & Scenario Controller (FastAPI on :8090)
  5. Chain-Market Web Portal (Vite on :5173)
  6. Vision-Twin Delhi Simulation (Vite on :5174)
"""

from __future__ import annotations

import json
import os
import signal
import socket
import subprocess
import sys
import time
import urllib.request
from pathlib import Path

REPO_ROOT = Path(__file__).resolve().parent.parent
RUNTIME_DIR = REPO_ROOT / ".demo"
LOGS_DIR = RUNTIME_DIR / "logs"
PIDS_FILE = RUNTIME_DIR / "pids.json"

CONTRACTS_DIR = REPO_ROOT / "chain-market" / "contracts"
VALIDATOR_DIR = REPO_ROOT / "chain-market" / "validator"
WEB_DIR = REPO_ROOT / "chain-market" / "web"
TWIN_DIR = REPO_ROOT / "vision-twin" / "twin"
MINER_DIR = REPO_ROOT / "miner-core"

# Locate Python executable (prefer root .venv if present)
if (REPO_ROOT / ".venv" / "bin" / "python").exists():
    PYTHON_EXE = str(REPO_ROOT / ".venv" / "bin" / "python")
elif (REPO_ROOT / ".venv" / "Scripts" / "python.exe").exists():
    PYTHON_EXE = str(REPO_ROOT / ".venv" / "Scripts" / "python.exe")
else:
    PYTHON_EXE = sys.executable

PORTS = {
    "mqtt": 1883,
    "blockchain": 8545,
    "validator": 3001,
    "miner": 8090,
    "web_portal": 5173,
    "twin_sim": 5174,
}


def read_pids() -> dict[str, int]:
    if PIDS_FILE.exists():
        try:
            with open(PIDS_FILE, "r", encoding="utf-8") as f:
                return json.load(f)
        except Exception:
            return {}
    return {}


def write_pids(pids: dict[str, int]) -> None:
    RUNTIME_DIR.mkdir(parents=True, exist_ok=True)
    with open(PIDS_FILE, "w", encoding="utf-8") as f:
        json.dump(pids, f, indent=2)


def is_port_open(port: int, host: str = "127.0.0.1", timeout: float = 0.5) -> bool:
    s = socket.socket(socket.AF_INET, socket.SOCK_STREAM)
    s.settimeout(timeout)
    try:
        s.connect((host, port))
        s.close()
        return True
    except Exception:
        return False


def wait_for_port(port: int, wanted: bool = True, timeout: int = 30) -> bool:
    limit = time.time() + timeout
    while time.time() < limit:
        if is_port_open(port) == wanted:
            return True
        time.sleep(0.3)
    return False


def is_process_alive(pid: int) -> bool:
    try:
        os.kill(pid, 0)
        return True
    except OSError:
        return False


def stop_process(name: str) -> None:
    pids = read_pids()
    pid = pids.get(name)
    if pid:
        if is_process_alive(pid):
            print(f"Stopping {name} (PID {pid})...")
            try:
                if os.name == "nt":
                    subprocess.run(["taskkill", "/F", "/T", "/PID", str(pid)], capture_output=True)
                else:
                    os.kill(pid, signal.SIGTERM)
                    time.sleep(0.5)
                    if is_process_alive(pid):
                        os.kill(pid, signal.SIGKILL)
            except Exception as e:
                print(f"Error terminating {name}: {e}")
        pids.pop(name, None)
        write_pids(pids)


def start_detached(cmd: list[str], cwd: Path, log_file: Path) -> int:
    LOGS_DIR.mkdir(parents=True, exist_ok=True)
    out = open(log_file, "a", encoding="utf-8")
    if os.name == "nt":
        creationflags = subprocess.CREATE_NEW_PROCESS_GROUP | subprocess.DETACHED_PROCESS
        p = subprocess.Popen(
            cmd,
            cwd=str(cwd),
            stdout=out,
            stderr=subprocess.STDOUT,
            stdin=subprocess.DEVNULL,
            creationflags=creationflags,
        )
    else:
        p = subprocess.Popen(
            cmd,
            cwd=str(cwd),
            stdout=out,
            stderr=subprocess.STDOUT,
            stdin=subprocess.DEVNULL,
            start_new_session=True,
        )
    return p.pid


def start_mqtt() -> None:
    if is_port_open(1883):
        print("MQTT broker already listening on :1883")
        return
    print("Starting MQTT broker...")
    # Check if Docker is available
    has_docker = False
    try:
        res = subprocess.run(["docker", "info"], stdout=subprocess.DEVNULL, stderr=subprocess.DEVNULL)
        has_docker = (res.returncode == 0)
    except FileNotFoundError:
        pass

    if has_docker:
        subprocess.run(["docker", "compose", "up", "-d", "mqtt"], cwd=str(REPO_ROOT), check=True)
    else:
        print("Docker not detected; using built-in lightweight Python MQTT broker...")
        pid = start_detached([PYTHON_EXE, "-m", "mock.mqtt_broker"], MINER_DIR, LOGS_DIR / "mqtt.log")
        pids = read_pids()
        pids["mqtt"] = pid
        write_pids(pids)

    if not wait_for_port(1883, True, 15):
        raise RuntimeError("Port 1883 did not open for MQTT")
    print("[OK] MQTT running on :1883")


def start_chain(deploy: bool = True) -> None:
    if is_port_open(8545):
        print("Blockchain already listening on :8545")
    else:
        print("Starting local Hardhat blockchain on :8545...")
        env = os.environ.copy()
        env["HARDHAT_DISABLE_TELEMETRY"] = "true"
        pid = start_detached(["npx", "hardhat", "node"], CONTRACTS_DIR, LOGS_DIR / "chain.log")
        pids = read_pids()
        pids["blockchain"] = pid
        write_pids(pids)
        if not wait_for_port(8545, True, 30):
            raise RuntimeError("Port 8545 did not open for blockchain")
        print("[OK] Blockchain running on :8545")

    if deploy:
        print("Deploying & seeding contracts...")
        subprocess.run(["npx", "hardhat", "run", "scripts/deploy.ts", "--network", "localhost"], cwd=str(CONTRACTS_DIR), check=True)
        subprocess.run(["npx", "hardhat", "run", "scripts/seed.ts", "--network", "localhost"], cwd=str(CONTRACTS_DIR), check=True)
        print("[OK] Contracts deployed and seeded")


def start_validator() -> None:
    if is_port_open(3001):
        print("Validator already listening on :3001")
        return
    print("Building and starting Validator on :3001...")
    subprocess.run(["npm", "run", "build"], cwd=str(VALIDATOR_DIR), check=True)
    pid = start_detached(["node", "dist/server.js"], VALIDATOR_DIR, LOGS_DIR / "validator.log")
    pids = read_pids()
    pids["validator"] = pid
    write_pids(pids)
    if not wait_for_port(3001, True, 20):
        raise RuntimeError("Port 3001 did not open for validator")
    print("[OK] Validator running on :3001")


def start_miner() -> None:
    if is_port_open(8090):
        print("Miner & Controller already listening on :8090")
        return
    print("Starting Miner daemon & Scenario Controller on :8090...")
    pid = start_detached(
        [PYTHON_EXE, "-m", "minerd", "daemon", "--vision-source", "mock", "--gps-source", "none"],
        MINER_DIR,
        LOGS_DIR / "miner.log",
    )
    pids = read_pids()
    pids["miner"] = pid
    write_pids(pids)
    if not wait_for_port(8090, True, 25):
        raise RuntimeError("Port 8090 did not open for miner controller")
    print("[OK] Miner & Controller running on :8090")


def start_web_frontends() -> None:
    if not is_port_open(5173):
        print("Starting Chain-Market Web Portal on :5173...")
        pid1 = start_detached(
            ["npx", "vite", "--host", "0.0.0.0", "--port", "5173"],
            WEB_DIR,
            LOGS_DIR / "web.log",
        )
        pids = read_pids()
        pids["web"] = pid1
        write_pids(pids)
        if wait_for_port(5173, True, 20):
            print("[OK] Chain-Market Portal running on :5173")
    else:
        print("Chain-Market Portal already listening on :5173")

    if not is_port_open(5174):
        print("Starting Vision-Twin Digital Twin on :5174...")
        pid2 = start_detached(
            ["npx", "vite", "--host", "0.0.0.0", "--port", "5174"],
            TWIN_DIR,
            LOGS_DIR / "twin.log",
        )
        pids = read_pids()
        pids["twin"] = pid2
        write_pids(pids)
        if wait_for_port(5174, True, 20):
            print("[OK] Vision-Twin Digital Twin running on :5174")
    else:
        print("Vision-Twin Digital Twin already listening on :5174")


def show_status() -> None:
    print("\n" + "=" * 62)
    print("  AIRcoin System Status")
    print("=" * 62)
    for name, port in PORTS.items():
        state = "\033[32m[GREEN / UP]\033[0m" if is_port_open(port) else "\033[31m[RED / DOWN]\033[0m"
        print(f"  {name:<15} :{port:<5} {state}")
    print("-" * 62)

    if is_port_open(8090):
        try:
            req = urllib.request.urlopen("http://127.0.0.1:8090/api/health", timeout=3)
            data = json.loads(req.read().decode())
            overall = "\033[32mOK\033[0m" if data.get("ok") else "\033[31mATTENTION NEEDED\033[0m"
            print(f"Health API (http://127.0.0.1:8090/api/health): {overall}")
            for k, v in data.get("services", {}).items():
                s = "\033[32mOK\033[0m" if v.get("ok") else "\033[31mFAIL\033[0m"
                extra = f" (queue: {v.get('queued_attestations')})" if "queued_attestations" in v else ""
                print(f"    - {k:<12} : {s}{extra}")
        except Exception as e:
            print(f"Health API request error: {e}")

    print("=" * 62)
    print("Access URLs:")
    print("  - Miner Scenario Controller : http://localhost:8090/")
    print("  - Red/Green Health Page     : http://localhost:8090/health")
    print("  - Chain-Market Web Platform : http://localhost:5173/")
    print("  - 3D Miner Digital Twin     : http://localhost:5174/")
    print("=" * 62 + "\n")


def stop_all() -> None:
    print("Stopping all AIRcoin demo services...")
    for name in ["twin", "web", "miner", "validator", "blockchain", "mqtt"]:
        stop_process(name)
    try:
        subprocess.run(["docker", "compose", "stop", "mqtt"], cwd=str(REPO_ROOT), stdout=subprocess.DEVNULL, stderr=subprocess.DEVNULL)
    except Exception:
        pass
    print("All services stopped.")
    show_status()


def main() -> None:
    action = sys.argv[1] if len(sys.argv) > 1 else "start"

    if action == "start":
        start_mqtt()
        chain_was_down = not is_port_open(8545)
        start_chain(chain_was_down)
        start_validator()
        start_miner()
        start_web_frontends()
        show_status()
    elif action == "stop":
        stop_all()
    elif action == "status":
        show_status()
    elif action == "restart-mqtt":
        stop_process("mqtt")
        wait_for_port(1883, False, 10)
        start_mqtt()
        show_status()
    elif action == "restart-validator":
        stop_process("validator")
        wait_for_port(3001, False, 10)
        start_validator()
        show_status()
    elif action == "restart-miner":
        stop_process("miner")
        wait_for_port(8090, False, 10)
        start_miner()
        show_status()
    elif action == "restart-chain":
        stop_process("validator")
        stop_process("blockchain")
        wait_for_port(8545, False, 10)
        start_chain(True)
        start_validator()
        show_status()
    else:
        print(f"Unknown action: {action}")
        print("Usage: python scripts/demo.py {start|stop|status|restart-mqtt|restart-validator|restart-miner|restart-chain}")
        sys.exit(1)


if __name__ == "__main__":
    main()
