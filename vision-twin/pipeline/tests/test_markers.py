import cv2

from aircoin_vision.markers import MarkerDetector, annotate, plant_box, summarize
from aircoin_vision.synth import render_rig


def test_all_20_stickers_detected_in_synthetic_rig(rig):
    img = render_rig(rig)
    s = summarize(MarkerDetector(rig.aruco_dictionary).detect(img), rig)
    assert s == {"detected": rig.sticker_ids, "missing": [], "unknown": []}


def test_small_markers(rig):
    # 24 px is the smallest marker size we rely on (blurred, noisy, tilted). Below ~22 px
    # detection degrades fast: capture at a resolution that keeps stickers >= 24 px.
    det = MarkerDetector(rig.aruco_dictionary)
    for seed in range(4):
        img = render_rig(rig, 1280, 720, marker_px=24, seed=seed)
        assert len(summarize(det.detect(img), rig)["detected"]) == 20


def test_missing_and_unknown_reported(rig):
    img = render_rig(rig, missing=[7, 12], unknown=[55])
    s = summarize(MarkerDetector(rig.aruco_dictionary).detect(img), rig)
    assert s["missing"] == [7, 12]
    assert s["unknown"] == [55]


def test_plant_box_is_above_marker_and_clipped(rig):
    img = render_rig(rig)
    dets = MarkerDetector(rig.aruco_dictionary).detect(img)
    for d in dets:
        x, y, w, h = plant_box(d, rig.crop, img.shape)
        assert 0 <= x and 0 <= y and x + w <= img.shape[1] and y + h <= img.shape[0]
        assert y + h <= d.corners[:, 1].min()
    assert annotate(img, dets, rig).shape == img.shape


def test_grayscale_input(rig):
    gray = cv2.cvtColor(render_rig(rig), cv2.COLOR_BGR2GRAY)
    assert len(MarkerDetector(rig.aruco_dictionary).detect(gray)) == 20
