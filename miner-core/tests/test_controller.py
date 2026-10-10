from fastapi.testclient import TestClient

from controller import ControllerState, create_app
from minerd.gps import FallbackGps
from simulator.plants import MockVision
from simulator.scenarios import SensorSimulator


def controller():
    sensors = SensorSimulator("clean_morning", seed=1)
    vision = MockVision("miner-001", list(range(20)), seed=1)
    gps = FallbackGps(12.9716, 77.5946)
    state = ControllerState(sensors, vision, gps)
    return state, TestClient(create_app(state))


def test_scenario_and_plant_controls():
    state, client = controller()
    assert client.post("/api/scenario/festival_smog").status_code == 200
    assert state.sensors.scenario == "festival_smog"

    client.post("/api/plants/3/remove")
    client.post("/api/plants/12/fake")
    status = client.get("/api/status").json()
    assert status["faults"]["removed"] == [3]
    assert status["faults"]["fake"] == [12]

    client.post("/api/plants/3/restore")
    client.post("/api/plants/12/real")
    assert client.get("/api/status").json()["faults"]["removed"] == []


def test_anticheat_and_reset_controls():
    state, client = controller()
    client.post("/api/camera/frozen", json={"enabled": True})
    client.post("/api/unknown/42")
    client.post("/api/gps/move", json={"north_m": 100, "east_m": 5})
    status = client.get("/api/status").json()
    assert status["faults"]["frozen_camera"] is True
    assert status["faults"]["unknown"] == [42]
    assert status["gps_offset_m"] == [100, 5]

    reset = client.post("/api/reset").json()
    assert reset["scenario"] == "clean_morning"
    assert reset["faults"]["unknown"] == []
    assert reset["gps_offset_m"] == [0, 0]


def test_invalid_controls_are_rejected():
    _, client = controller()
    assert client.post("/api/scenario/nope").status_code == 400
    assert client.post("/api/plants/99/remove").status_code == 404
    assert client.post("/api/plants/2/swap", json={"species": "not-a-plant"}).status_code == 400


def test_health_page_and_api(monkeypatch):
    state, client = controller()
    monkeypatch.setattr(state, "health", lambda: {
        "ok": True, "checked_at_ms": 1,
        "services": {"miner": {"ok": True, "detail": "controller responding"}},
    })
    assert client.get("/health").status_code == 200
    assert client.get("/api/health").json()["ok"] is True
