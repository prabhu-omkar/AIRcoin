import numpy as np

from mock.emitter import make_message
from pipeline.engine import VisionEngine
from pipeline.state import TagState


def test_mock_faults_keep_all_twenty_plants():
    message = make_message(1, {7}, {12}, {5}, [42])
    assert len(message["plants"]) == 20
    assert message["plants"][7]["status"] == "missing"
    assert message["plants"][12]["alive_score"] < 0.3
    assert message["plants"][5]["species_conf"] < 0.5
    assert message["unknown_tag_ids"] == [42]


def test_state_machine_times_out():
    state = TagState(last_seen_ts=1_000, status="present")
    assert state.update(10_999, False, 0, 0) == "present"
    assert state.update(11_000, False, 0, 0) == "missing"
    assert state.update(61_000, False, 0, 0) == "removed"


def test_blank_frame_is_valid_shape():
    event = VisionEngine().process(np.zeros((720, 1280, 3), dtype=np.uint8), 1_800_000_000_000)
    assert event["frame_size"] == {"w": 1280, "h": 720}
    assert len(event["plants"]) == 20
    assert len(event["frame_hash"]) == 66


def test_generated_aruco_is_detected():
    import cv2

    dictionary = cv2.aruco.getPredefinedDictionary(cv2.aruco.DICT_4X4_50)
    marker = cv2.aruco.generateImageMarker(dictionary, 3, 160)
    frame = np.full((480, 640, 3), 255, dtype=np.uint8)
    frame[260:420, 240:400] = cv2.cvtColor(marker, cv2.COLOR_GRAY2BGR)
    event = VisionEngine().process(frame, 1_800_000_000_000)
    tag = event["plants"][3]
    assert tag["bbox"] is not None
    assert tag["status"] == "present"
