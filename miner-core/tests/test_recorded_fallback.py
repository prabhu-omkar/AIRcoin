from mock.recorded_fallback import load_recording, make_recording
from minerd import contracts


def test_recorded_fallback_is_valid_c2(tmp_path):
    path = tmp_path / "fallback.jsonl"
    made = make_recording(path)
    loaded = load_recording(path)
    assert loaded == made
    assert len(loaded) == 44
    for event in loaded:
        target = "c2-epoch" if event["kind"] == "epoch" else "c2-telemetry"
        assert contracts.errors(target, event["payload"]) == []
