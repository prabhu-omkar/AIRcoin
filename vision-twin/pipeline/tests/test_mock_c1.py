import time

from aircoin_vision.mock_c1 import Scene


def errors(validator, msg):
    return [f"{list(e.absolute_path)}: {e.message}" for e in validator.iter_errors(msg)]


def test_mock_messages_follow_c1_schema_through_every_scenario(rig, c1_validator):
    scene = Scene(rig)
    t0 = int(time.time() * 1000)
    script = {3: "remove 7", 5: "fake 12", 6: "swap 3", 7: "unknown 55", 8: "freeze", 20: "unfreeze", 30: "restore 7"}
    seen_hashes = []
    statuses = {}
    for k in range(80):
        if k in script:
            scene.command(script[k])
        msg = scene.message(t0 + k * 1000)
        assert not errors(c1_validator, msg)
        assert len(msg["plants"]) == 20
        seen_hashes.append(msg["frame_hash"])
        statuses[k] = {p["tag_id"]: p["status"] for p in msg["plants"]}
        if k == 10:
            assert msg["unknown_tag_ids"] == [55]

    assert statuses[2][7] == "present"
    assert statuses[11][7] == "present"  # unseen 9 s
    assert statuses[12][7] == "missing"  # unseen 10 s
    assert statuses[29][7] == "missing"
    assert statuses[40][7] == "present"  # restored
    assert statuses[10][12] == "suspect" and statuses[10][3] == "suspect"
    assert statuses[10][0] == "present"
    assert len(set(seen_hashes[8:20])) == 1  # frozen camera
    assert len(set(seen_hashes[20:])) == 60


def test_removed_after_60s(rig):
    scene = Scene(rig)
    t0 = int(time.time() * 1000)
    scene.message(t0)
    scene.command("remove 4")
    msg = None
    for k in range(1, 63):
        msg = scene.message(t0 + k * 1000)
    p = next(p for p in msg["plants"] if p["tag_id"] == 4)
    assert p["status"] == "removed" and p["bbox"] is None and p["leaf_area_cm2"] == 0
