from aircoin_vision.status import StatusMachine


def run(sm, until_s, seen, suspect=(), start_s=0):
    out = None
    for t in range(start_s, until_s + 1):
        out = sm.update(t * 1000, seen, suspect)
    return out


def test_present_missing_removed_timeline():
    sm = StatusMachine([1, 2], start_ms=0)
    assert run(sm, 5, {1, 2}) == {1: "present", 2: "present"}
    assert run(sm, 14, {1}, start_s=6)[2] == "present"  # unseen 9 s: still present
    assert run(sm, 15, {1}, start_s=15)[2] == "missing"  # unseen 10 s
    assert run(sm, 64, {1}, start_s=16)[2] == "missing"
    assert run(sm, 65, {1}, start_s=65)[2] == "removed"  # unseen 60 s
    assert run(sm, 66, {1, 2}, start_s=66)[2] == "present"  # back


def test_short_occlusion_is_ignored():
    sm = StatusMachine([1], start_ms=0)
    run(sm, 3, {1})
    assert run(sm, 8, set(), start_s=4)[1] == "present"


def test_suspect_is_debounced():
    sm = StatusMachine([1], start_ms=0)
    run(sm, 5, {1})
    assert run(sm, 7, {1}, {1}, start_s=6)[1] == "present"  # 1 s of suspect signal
    assert run(sm, 9, {1}, {1}, start_s=8)[1] == "suspect"  # 3 s
    assert run(sm, 11, {1}, start_s=10)[1] == "suspect"  # 1 s good
    assert run(sm, 13, {1}, start_s=12)[1] == "present"  # 3 s good


def test_never_seen_tags_are_missing():
    sm = StatusMachine([1], start_ms=0)
    assert sm.update(0, set())[1] == "missing"
