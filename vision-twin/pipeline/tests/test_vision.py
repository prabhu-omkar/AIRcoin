"""Phase 2 checks on synthetic rigs, through the real runner (detect -> analyse -> status machine -> C1).

- swapped plant flagged in at least 4 of 5 tries (PRD gate 2)
- plastic plant flagged by NDVI on the NoIR camera
- removed plant missing after 10 s, removed after 60 s
- every C1 message is schema-valid; inference fits in a 1 Hz cycle
"""

import time

import cv2
import pytest

from aircoin_vision import enrol
from aircoin_vision.run import VisionRunner
from aircoin_vision.synth import render_rig
from aircoin_vision.vision import PlantAnalyzer, ndvi_colour

W, H = 1600, 900  # smaller than the Pi's 2304x1296 to keep the suite quick; markers are still ~31 px


@pytest.fixture(scope="module")
def enrolled(rig, tmp_path_factory):
    """Enrol both camera types from a clean synthetic frame, like `enrol picam` on the real rig."""
    out = {}
    for noir in (True, False):
        d = tmp_path_factory.mktemp("noir" if noir else "rgb")
        img = d / "rig.png"
        cv2.imwrite(str(img), render_rig(rig, W, H, noir=noir))
        assert enrol.main([str(img), "--out", str(d / "enrolment"), "--backend", "leafhist"]) == 0
        out[noir] = d / "enrolment"
    return out


def run_frames(rig, enrolment, frames, noir=True, c1_validator=None):
    """frames: list of (seconds, render kwargs). Returns (messages, runner)."""
    t0 = 1_800_000_000_000
    analyzer = PlantAnalyzer(rig, enrolment, liveness="ndvi" if noir else "rgb")
    runner = VisionRunner(rig, analyzer, t0, source="recorded")
    msgs = []
    for k, (sec, kw) in enumerate(frames):
        frame = render_rig(rig, W, H, seed=k + 1, noir=noir, **kw)
        msg = runner.step(t0 + int(sec * 1000), frame)
        if c1_validator is not None:
            errs = [e.message for e in c1_validator.iter_errors(msg)]
            assert not errs, errs
        msgs.append(msg)
    return msgs, runner


def status(msg, tag):
    return next(p for p in msg["plants"] if p["tag_id"] == tag)


@pytest.mark.parametrize("noir", [True, False], ids=["noir", "rgb"])
def test_swapped_plant_flagged_in_at_least_4_of_5_tries(rig, enrolled, noir):
    species = [p.species for p in rig.plants]
    flagged = 0
    for trial, tag in enumerate([3, 7, 11, 14, 18]):
        other = species[(tag + 5 + trial) % len(species)]
        frames = [(s, {"swap": {tag: other} if s >= 2 else {}}) for s in range(0, 10)]
        msgs, _ = run_frames(rig, enrolled[noir], frames, noir)
        last = msgs[-1]
        flagged += status(last, tag)["status"] == "suspect"
        false_alarms = [p["tag_id"] for p in last["plants"] if p["tag_id"] != tag and p["status"] != "present"]
        assert not false_alarms, f"untouched plants flagged: {false_alarms}"
    assert flagged >= 4, f"swap flagged in {flagged}/5 tries"


def test_plastic_plant_flagged_by_ndvi(rig, enrolled, c1_validator):
    frames = [(s, {"fake": [12] if s >= 2 else []}) for s in range(0, 9)]
    msgs, runner = run_frames(rig, enrolled[True], frames, True, c1_validator)
    before, after = status(msgs[1], 12), status(msgs[-1], 12)
    assert before["status"] == "present" and before["ndvi"] > 0.25
    assert after["status"] == "suspect"
    assert after["ndvi"] < 0.15 and after["alive_score"] < 0.35
    others = [p for p in msgs[-1]["plants"] if p["tag_id"] != 12]
    assert all(p["status"] == "present" and p["ndvi"] > 0.25 for p in others)
    assert runner.last[1][12].reason == "low_liveness"
    assert ndvi_colour(render_rig(rig, 320, 180, noir=True)).shape == (180, 320, 3)


def test_removed_plant_goes_missing_after_10s_then_removed(rig, enrolled, c1_validator):
    frames = [(s, {"missing": [7] if s >= 2 else []}) for s in [0, 1, 2, 5, 10, 11, 30, 60, 61]]
    msgs, _ = run_frames(rig, enrolled[True], frames, True, c1_validator)
    by_sec = {sec: status(m, 7) for (sec, _), m in zip(frames, msgs)}
    assert by_sec[1]["status"] == "present"
    assert by_sec[5]["status"] == "present"  # grace period: a hand in front of the camera changes nothing
    assert by_sec[10]["status"] == "present"  # last seen at 1 s: unseen 9 s
    assert by_sec[11]["status"] == "missing" and by_sec[11]["bbox"] is None and by_sec[11]["leaf_area_cm2"] == 0
    assert by_sec[60]["status"] == "missing"
    assert by_sec[61]["status"] == "removed"  # unseen 60 s
    assert by_sec[61]["last_seen_ts"] == 1_800_000_000_000 + 1000


def test_inference_fits_a_1hz_cycle(rig, enrolled):
    analyzer = PlantAnalyzer(rig, enrolled[True], liveness="ndvi")
    runner = VisionRunner(rig, analyzer, 0)
    frame = render_rig(rig, 2304, 1296, noir=True, seed=3)  # the Pi camera's resolution
    runner.step(0, frame)  # warm-up
    t = time.perf_counter()
    for k in range(3):
        msg = runner.step(1000 * (k + 1), frame)
    per_step = (time.perf_counter() - t) / 3
    assert len([p for p in msg["plants"] if p["status"] == "present"]) == 20
    print(f"\ninference at 2304x1296: {per_step * 1000:.0f} ms per cycle ({1 / per_step:.1f} Hz max)")
    assert per_step < 1.0
