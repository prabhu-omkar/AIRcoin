"""Phase 3 demo controller for the simulated miner."""

from __future__ import annotations

import threading
import time
from typing import Any

import uvicorn
import httpx
from fastapi import FastAPI, HTTPException
from fastapi.responses import HTMLResponse
from pydantic import BaseModel

from simulator.plants import MockVision, SPECIES
from simulator.scenarios import SCENARIOS, SensorSimulator
from minerd.diagnostics import resources


class SwapRequest(BaseModel):
    species: str


class ToggleRequest(BaseModel):
    enabled: bool


class MoveRequest(BaseModel):
    north_m: float = 0
    east_m: float = 0


class ControllerState:
    def __init__(self, sensors: SensorSimulator, vision: MockVision | None, gps: Any, uplink: Any = None,
                 bus: Any = None, validator_url: str = "http://localhost:3001",
                 chain_rpc_url: str = "http://localhost:8545"):
        self.sensors, self.vision, self.gps, self.uplink = sensors, vision, gps, uplink
        self.bus = bus
        self.validator_url = validator_url
        self.chain_rpc_url = chain_rpc_url
        self._latest: dict = {}
        self._lock = threading.Lock()

    def update(self, telemetry: dict) -> None:
        with self._lock:
            self._latest = {
                "ts": telemetry.get("ts"),
                "aqi": telemetry.get("aqi"),
                "running_air": telemetry.get("current_epoch", {}).get("running_air"),
                "epoch": telemetry.get("current_epoch", {}).get("epoch"),
                "flags": telemetry.get("flags", []),
            }

    def _fallback_gps(self):
        return getattr(self.gps, "fallback", self.gps)

    def status(self) -> dict:
        faults = self.vision.faults if self.vision else None
        gps = self._fallback_gps()
        with self._lock:
            latest = dict(self._latest)
        return {
            "scenario": self.sensors.scenario,
            "scenarios": list(SCENARIOS),
            "vision_source": "mock" if self.vision else "mqtt",
            "faults": {
                "removed": sorted(faults.dropped) if faults else [],
                "fake": sorted(faults.fake) if faults else [],
                "swapped": dict(faults.swapped) if faults else {},
                "unknown": sorted(faults.unknown_tags) if faults else [],
                "frozen_camera": bool(faults.frozen) if faults else False,
            },
            "gps_offset_m": list(getattr(gps, "offset_m", (0.0, 0.0))),
            "uplink": self.uplink.status() if self.uplink else None,
            "latest": latest,
            "resources": resources(),
        }

    def health(self) -> dict:
        services = {
            "miner": {"ok": True, "detail": "controller responding"},
            "mqtt": {"ok": bool(self.bus and self.bus.connected), "detail": "broker connection"},
            "validator": {"ok": False, "detail": self.validator_url},
            "blockchain": {"ok": False, "detail": self.chain_rpc_url},
        }
        try:
            response = httpx.get(f"{self.validator_url}/health", timeout=1.0)
            services["validator"]["ok"] = response.is_success
        except httpx.HTTPError:
            pass
        try:
            response = httpx.post(
                self.chain_rpc_url,
                json={"jsonrpc": "2.0", "id": 1, "method": "eth_chainId", "params": []},
                timeout=1.0,
            )
            services["blockchain"]["ok"] = response.is_success and bool(response.json().get("result"))
        except (httpx.HTTPError, ValueError):
            pass
        if self.uplink:
            services["validator"]["queued_attestations"] = self.uplink.queued_count()
        return {
            "ok": all(item["ok"] for item in services.values()),
            "checked_at_ms": int(time.time() * 1000),
            "services": services,
        }

    def require_vision(self) -> MockVision:
        if self.vision is None:
            raise HTTPException(409, "plant controls require VISION_SOURCE=mock")
        return self.vision

    def check_tag(self, tag_id: int) -> None:
        vision = self.require_vision()
        if tag_id not in vision.tag_ids:
            raise HTTPException(404, f"tag {tag_id} is not registered to this miner")

    def reset(self) -> None:
        self.sensors.set_scenario("clean_morning")
        if self.vision:
            f = self.vision.faults
            f.dropped.clear()
            f.fake.clear()
            f.swapped.clear()
            f.unknown_tags.clear()
            f.frozen = False
        gps = self._fallback_gps()
        if hasattr(gps, "offset_m"):
            gps.offset_m = (0.0, 0.0)


def create_app(state: ControllerState) -> FastAPI:
    app = FastAPI(title="AIRcoin Scenario Controller", version="1.0.0")

    @app.get("/", response_class=HTMLResponse)
    def panel():
        return PANEL_HTML

    @app.get("/api/status")
    def status():
        return state.status()

    @app.get("/api/health")
    def health():
        return state.health()

    @app.get("/health", response_class=HTMLResponse)
    def health_page():
        return HEALTH_HTML

    @app.post("/api/scenario/{name}")
    def scenario(name: str):
        try:
            state.sensors.set_scenario(name)
        except ValueError as exc:
            raise HTTPException(400, str(exc)) from exc
        return state.status()

    @app.post("/api/plants/{tag_id}/remove")
    def remove(tag_id: int):
        state.check_tag(tag_id)
        state.vision.faults.dropped[tag_id] = int(time.time() * 1000) - 60_000
        return state.status()

    @app.post("/api/plants/{tag_id}/restore")
    def restore(tag_id: int):
        state.check_tag(tag_id)
        state.vision.faults.dropped.pop(tag_id, None)
        return state.status()

    @app.post("/api/plants/{tag_id}/fake")
    def fake(tag_id: int):
        state.check_tag(tag_id)
        state.vision.faults.fake.add(tag_id)
        return state.status()

    @app.post("/api/plants/{tag_id}/real")
    def real(tag_id: int):
        state.check_tag(tag_id)
        state.vision.faults.fake.discard(tag_id)
        return state.status()

    @app.post("/api/plants/{tag_id}/swap")
    def swap(tag_id: int, body: SwapRequest):
        state.check_tag(tag_id)
        if body.species not in SPECIES:
            raise HTTPException(400, "unknown species")
        state.vision.faults.swapped[tag_id] = body.species
        return state.status()

    @app.post("/api/plants/{tag_id}/unswap")
    def unswap(tag_id: int):
        state.check_tag(tag_id)
        state.vision.faults.swapped.pop(tag_id, None)
        return state.status()

    @app.post("/api/unknown/{tag_id}")
    def add_unknown(tag_id: int):
        state.require_vision().faults.unknown_tags.add(tag_id)
        return state.status()

    @app.delete("/api/unknown/{tag_id}")
    def remove_unknown(tag_id: int):
        state.require_vision().faults.unknown_tags.discard(tag_id)
        return state.status()

    @app.post("/api/camera/frozen")
    def frozen(body: ToggleRequest):
        state.require_vision().faults.frozen = body.enabled
        return state.status()

    @app.post("/api/gps/move")
    def move(body: MoveRequest):
        gps = state._fallback_gps()
        if not hasattr(gps, "offset_m"):
            raise HTTPException(409, "GPS source cannot be moved")
        gps.offset_m = (body.north_m, body.east_m)
        return state.status()

    @app.post("/api/reset")
    def reset():
        state.reset()
        return state.status()

    return app


class ControllerServer:
    def __init__(self, state: ControllerState, port: int):
        config = uvicorn.Config(create_app(state), host="0.0.0.0", port=port, log_level="warning")
        self.server = uvicorn.Server(config)
        self.thread = threading.Thread(target=self.server.run, name="scenario-controller", daemon=True)

    def start(self) -> "ControllerServer":
        self.thread.start()
        return self

    def stop(self) -> None:
        self.server.should_exit = True
        self.thread.join(timeout=3)


PANEL_HTML = """<!doctype html>
<html><head><meta charset="utf-8"><meta name="viewport" content="width=device-width,initial-scale=1">
<title>AIRcoin Controller</title><style>
:root{color-scheme:dark}body{font:15px system-ui;background:#07130f;color:#e7fff3;margin:0;padding:24px}
main{max-width:900px;margin:auto}h1{color:#62e6a7}.card{background:#10231c;border:1px solid #24533f;border-radius:14px;padding:18px;margin:14px 0}
button,select,input{background:#173c2d;color:#fff;border:1px solid #398461;border-radius:8px;padding:9px;margin:4px}button:hover{background:#206044}
.danger{background:#642b32}.grid{display:flex;flex-wrap:wrap;gap:8px;align-items:center}pre{white-space:pre-wrap;color:#a9d9c3}
</style></head><body><main><h1>AIRcoin Scenario Controller</h1>
<div class="card"><h3>Air quality</h3><div class="grid">
<button onclick="post('/api/scenario/clean_morning')">Clean morning</button><button onclick="post('/api/scenario/rush_hour')">Rush hour</button>
<button onclick="post('/api/scenario/festival_smog')">Festival smog</button><button onclick="post('/api/scenario/rain_washout')">Rain washout</button></div></div>
<div class="card"><h3>Plant</h3><input id="tag" type="number" min="0" max="19" value="3">
<button class="danger" onclick="plant('remove')">Remove</button><button onclick="plant('restore')">Restore</button>
<button class="danger" onclick="plant('fake')">Fake</button><button onclick="plant('real')">Real</button></div>
<div class="card"><h3>Anti-cheat</h3><div class="grid">
<button class="danger" onclick="post('/api/camera/frozen',{enabled:true})">Freeze camera</button><button onclick="post('/api/camera/frozen',{enabled:false})">Unfreeze</button>
<button class="danger" onclick="post('/api/unknown/42')">Add unknown tag</button><button class="danger" onclick="post('/api/gps/move',{north_m:100,east_m:0})">Move miner 100 m</button>
<button onclick="post('/api/reset')">Reset all</button></div></div>
<div class="card"><h3>Live state</h3><pre id="state">Loading…</pre></div>
<script>
async function post(path,body){await fetch(path,{method:'POST',headers:{'content-type':'application/json'},body:body?JSON.stringify(body):null});await refresh()}
function plant(action){post('/api/plants/'+document.getElementById('tag').value+'/'+action)}
async function refresh(){let r=await fetch('/api/status');document.getElementById('state').textContent=JSON.stringify(await r.json(),null,2)}
setInterval(refresh,1000);refresh();
</script></main></body></html>"""

HEALTH_HTML = """<!doctype html><html><head><meta charset="utf-8">
<meta name="viewport" content="width=device-width,initial-scale=1"><title>AIRcoin Health</title>
<style>:root{color-scheme:dark}body{font:16px system-ui;background:#07130f;color:#e7fff3;padding:24px}
main{max-width:720px;margin:auto}.grid{display:grid;grid-template-columns:repeat(auto-fit,minmax(220px,1fr));gap:14px}
.card{border-radius:14px;padding:18px;border:1px solid #355}.green{background:#123b29;border-color:#2da66d}.red{background:#481f27;border-color:#dc5465}
.dot{font-size:24px}small{opacity:.75}</style></head><body><main><h1>AIRcoin service health</h1>
<div id="summary"></div><div class="grid" id="services"></div><p><small id="checked"></small></p>
<script>async function refresh(){try{let r=await fetch('/api/health'),h=await r.json();
summary.textContent=h.ok?'All services operational':'One or more services need attention';
services.innerHTML=Object.entries(h.services).map(([n,s])=>`<div class="card ${s.ok?'green':'red'}"><div class="dot">${s.ok?'●':'●'} ${n}</div><p>${s.ok?'GREEN':'RED'}</p><small>${s.detail||''}${s.queued_attestations!==undefined?' · queue '+s.queued_attestations:''}</small></div>`).join('');
checked.textContent='Checked '+new Date(h.checked_at_ms).toLocaleString()}catch(e){summary.textContent='Miner/controller unavailable'}}
setInterval(refresh,2000);refresh()</script></main></body></html>"""
