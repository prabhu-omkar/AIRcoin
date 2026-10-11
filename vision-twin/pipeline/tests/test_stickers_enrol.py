import json

import cv2
import numpy as np

from aircoin_vision import enrol, stickers
from aircoin_vision.markers import MarkerDetector
from aircoin_vision.synth import render_rig


def test_sticker_sheets_are_detectable_and_pdf_is_written(rig, tmp_path):
    stickers.main(["--out", str(tmp_path), "--extra", "99"])
    pages = sorted(tmp_path.glob("stickers-page-*.png"))
    found = set()
    det = MarkerDetector(rig.aruco_dictionary)
    for p in pages:
        found |= {d.tag_id for d in det.detect(cv2.imread(str(p)))}
    assert found == set(rig.sticker_ids) | {99}
    pdf = (tmp_path / "stickers.pdf").read_bytes()
    assert pdf.startswith(b"%PDF") and f"/Count {len(pages)}".encode() in pdf


def test_marker_physical_size(rig):
    # 40 mm at 300 DPI = 472 px
    img = stickers.render_sticker(stickers.get_dictionary(rig.aruco_dictionary), 0, 40, rig.miner_id, "x")
    d = MarkerDetector(rig.aruco_dictionary).detect(cv2.cvtColor(img, cv2.COLOR_GRAY2BGR))[0]
    assert abs(d.side_px - 40 * 300 / 25.4) < 3


def test_enrol_and_check(rig, tmp_path, capsys):
    img_path = tmp_path / "rig.jpg"
    cv2.imwrite(str(img_path), render_rig(rig))
    out = tmp_path / "enrol"
    assert enrol.main([str(img_path), "--backend", "colorhist", "--out", str(out)]) == 0
    manifest = json.loads((out / "enrolment.json").read_text())
    assert manifest["backend"] == "colorhist" and len(manifest["tags"]) == 20
    vec = np.load(out / "tag-00.npy")
    assert abs(np.linalg.norm(vec) - 1) < 1e-4
    assert manifest["tags"]["0"]["leaf_area_cm2"] > 0

    capsys.readouterr()
    assert enrol.main([str(img_path), "--check", "--out", str(out)]) == 0
    scores = [float(line.split()[-1]) for line in capsys.readouterr().out.splitlines() if line.strip().startswith("tag")]
    assert len(scores) == 20 and min(scores) > 0.99

    # re-enrol a single tag keeps the others
    assert enrol.main([str(img_path), "--tags", "7", "--out", str(out)]) == 0
    assert len(json.loads((out / "enrolment.json").read_text())["tags"]) == 20
