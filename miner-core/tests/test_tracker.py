from minerd.tracker import Tracker
from simulator.plants import MockVision

TAGS = list(range(20))  # registry miner-001: tags 0..19
T0 = 1_791_600_000_000


def feed(tracker, vision, start_s, end_s):
    for s in range(start_s, end_s):
        t = T0 + s * 1000
        tracker.ingest(vision.message(t), t)


def status(tracker, tag, at_s):
    return {p.tag_id: p.status for p in tracker.snapshot(T0 + at_s * 1000)}[tag]


def test_dropped_plant_goes_missing_then_removed():
    tracker, vision = Tracker(TAGS), MockVision("miner-001", TAGS, seed=1)
    vision.faults.dropped = {3: T0 + 5_000}
    feed(tracker, vision, 0, 10)
    assert status(tracker, 3, 9) == "present"
    feed(tracker, vision, 10, 20)
    assert status(tracker, 3, 19) == "missing"
    feed(tracker, vision, 20, 70)
    assert status(tracker, 3, 69) == "removed"
    assert status(tracker, 4, 69) == "present"


def test_unseen_plant_times_out_without_vision_status():
    tracker, vision = Tracker(TAGS), MockVision("miner-001", TAGS, seed=1)
    feed(tracker, vision, 0, 3)  # then the feed stops entirely
    assert status(tracker, 1, 3) == "present"
    assert status(tracker, 1, 13) == "missing"
    assert status(tracker, 1, 63) == "removed"


def test_fake_and_swapped_plants_are_suspect():
    tracker, vision = Tracker(TAGS), MockVision("miner-001", TAGS, seed=1)
    feed(tracker, vision, 0, 5)
    vision.faults.fake = {12}
    other = "neem" if vision.message(T0)["plants"][7]["species"] != "neem" else "tulsi"
    vision.faults.swapped = {7: other}
    feed(tracker, vision, 5, 10)
    assert status(tracker, 12, 9) == "suspect"
    assert status(tracker, 7, 9) == "suspect"
    codes = {(f["code"], f.get("tag_id")) for f in tracker.active_flags()}
    assert ("low_liveness", 12) in codes and ("species_mismatch", 7) in codes


def test_unknown_sticker_and_frozen_camera_flagged():
    tracker, vision = Tracker(TAGS), MockVision("miner-001", TAGS, seed=1)
    vision.faults.unknown_tags = {77}
    vision.faults.frozen = True
    feed(tracker, vision, 0, 8)
    codes = {(f["code"], f.get("tag_id")) for f in tracker.active_flags()}
    assert ("unknown_sticker", 77) in codes
    assert ("frozen_camera", None) in codes


def test_clock_drift_flagged():
    tracker, vision = Tracker(TAGS), MockVision("miner-001", TAGS, seed=1)
    msg = vision.message(T0)
    tracker.ingest(msg, T0 + 9_000)
    assert any(f["code"] == "clock_drift" for f in tracker.active_flags())


def test_new_plant_burst_flagged_after_settling():
    tracker, vision = Tracker(TAGS), MockVision("miner-001", TAGS, seed=1)
    first = vision.message(T0)
    first["plants"] = []
    tracker.ingest(first, T0)
    burst = vision.message(T0 + 61_000)
    burst["plants"] = burst["plants"][:6]
    tracker.ingest(burst, T0 + 61_000)
    assert any(f["code"] == "too_many_new_plants" for f in tracker.active_flags())
