"""Enrol the plants: save a photo and a feature vector for every tagged plant.

    python -m aircoin_vision.enrol picam                    # capture from the Pi camera
    python -m aircoin_vision.enrol rig.jpg                  # from a still
    python -m aircoin_vision.enrol picam --tags 7 12        # re-enrol replaced plants only
    python -m aircoin_vision.enrol picam --check            # compare live plants with the enrolment

Output (vision-twin/data/enrolment/<miner_id>/):
    enrolment.json     manifest: backend, per tag species, crop box, marker size, files
    tag-07.jpg         plant crop
    tag-07.npy         L2-normalised feature vector
    frame.jpg          the full frame used

The plant-match step (Phase 2) compares each live crop with tag-XX.npy; a low
score means the plant was swapped.
"""

import argparse
import datetime
import json
import sys
from pathlib import Path

import cv2
import numpy as np

from .capture import ImageSource, open_source
from .config import DATA_DIR, load_rig
from .embed import make_embedder, similarity
from .markers import MarkerDetector, plant_box


def best_frame(source, detector, rig, frames, embed=None):
    """Take up to `frames` frames and keep the one with the most registered stickers.

    With `embed`, also returns every tag's feature vector averaged over all frames it appeared in:
    one frame catches the leaves wherever they happened to be, the average is what the plant looks like.
    """
    best, best_dets, best_n = None, [], -1
    registered = set(rig.sticker_ids)
    vecs = {}
    for k, (_, frame) in enumerate(source):
        dets = [d for d in detector.detect(frame) if d.tag_id in registered]
        if embed is not None:
            for d in dets:
                x, y, w, h = plant_box(d, rig.crop, frame.shape)
                if w >= 8 and h >= 8:
                    vecs.setdefault(d.tag_id, []).append(embed(frame[y:y + h, x:x + w]))
        if len(dets) > best_n:
            best, best_dets, best_n = frame, dets, len(dets)
        if (embed is None and best_n == len(registered)) or k + 1 >= frames:
            break
    mean = {t: (lambda v: v / (np.linalg.norm(v) + 1e-9))(np.mean(v, axis=0)) for t, v in vecs.items()}
    return (best, best_dets, mean) if embed is not None else (best, best_dets)


def leaf_area_estimate(crop, mm_per_px):
    """Rough visible leaf area (cm2) from excess-green pixels. Refined in Phase 2."""
    b, g, r = [c.astype(np.int16) for c in cv2.split(crop)]
    mask = (2 * g - r - b) > 20
    return float(mask.sum()) * (mm_per_px ** 2) / 100.0


def main(argv=None):
    ap = argparse.ArgumentParser(description=__doc__, formatter_class=argparse.RawDescriptionHelpFormatter)
    ap.add_argument("source", help="image, folder, video file, usb:N or picam")
    ap.add_argument("--rig", help="rig.json path")
    ap.add_argument("--tags", type=int, nargs="*", help="only these tags (default: all registered)")
    ap.add_argument("--frames", type=int, default=15, help="live sources: frames to try (keeps the best)")
    ap.add_argument("--backend", default="auto", choices=["auto", "mobilenet", "leafhist", "colorhist"])
    ap.add_argument("--out", help="output folder (default: data/enrolment/<miner_id>)")
    ap.add_argument("--check", action="store_true", help="compare with the saved enrolment instead of saving")
    args = ap.parse_args(argv)

    rig = load_rig(args.rig)
    out = Path(args.out) if args.out else DATA_DIR / "enrolment" / rig.miner_id
    manifest_path = out / "enrolment.json"
    manifest = json.loads(manifest_path.read_text()) if manifest_path.exists() else None

    backend = args.backend
    if args.check:
        if not manifest:
            sys.exit(f"no enrolment at {manifest_path}")
        backend = manifest["backend"]
    elif manifest and args.tags and backend == "auto":
        backend = manifest["backend"]  # keep vectors comparable when re-enrolling a few tags
    embed = make_embedder(backend)
    if manifest and manifest.get("backend") not in (None, embed.name) and not args.check:
        if args.tags:
            sys.exit(f"existing enrolment uses {manifest['backend']}; re-enrol all tags to switch backend")
        manifest = None

    detector = MarkerDetector(rig.aruco_dictionary)
    source = open_source(args.source, rig.camera.get("width"), rig.camera.get("height"))
    try:
        n = args.frames if not isinstance(source, ImageSource) or len(source.paths) > 1 else 1
        frame, dets, vectors = best_frame(source, detector, rig, n, embed)
    finally:
        source.close()
    if frame is None:
        sys.exit("no frame captured")

    wanted = set(args.tags) if args.tags else set(rig.sticker_ids)
    by_tag = {d.tag_id: d for d in dets}
    missing = sorted(wanted - by_tag.keys())

    if args.check:
        print(f"backend {embed.name}; similarity to enrolment (1.0 = identical):")
        for tag in sorted(wanted & by_tag.keys()):
            entry = manifest["tags"].get(str(tag))
            if not entry:
                print(f"  tag {tag:2d}: not enrolled")
                continue
            x, y, w, h = plant_box(by_tag[tag], rig.crop, frame.shape)
            score = similarity(embed(frame[y:y + h, x:x + w]), np.load(out / entry["vector"]))
            print(f"  tag {tag:2d} {entry['species']:<24} {score:.3f}")
        if missing:
            print(f"not seen: {missing}")
        return 0

    out.mkdir(parents=True, exist_ok=True)
    manifest = manifest or {"miner_id": rig.miner_id, "backend": embed.name, "tags": {}}
    manifest["backend"] = embed.name
    manifest["updated"] = datetime.datetime.now(datetime.timezone.utc).isoformat(timespec="seconds")
    manifest["marker_size_mm"] = rig.marker_size_mm
    manifest["frame_size"] = {"w": frame.shape[1], "h": frame.shape[0]}
    cv2.imwrite(str(out / "frame.jpg"), frame)

    for tag in sorted(wanted & by_tag.keys()):
        d = by_tag[tag]
        x, y, w, h = plant_box(d, rig.crop, frame.shape)
        if w < 8 or h < 8:
            print(f"  tag {tag}: crop too small ({w}x{h}), skipped")
            continue
        crop = frame[y:y + h, x:x + w]
        cv2.imwrite(str(out / f"tag-{tag:02d}.jpg"), crop)
        np.save(out / f"tag-{tag:02d}.npy", vectors.get(tag, embed(crop)))
        mmpp = d.mm_per_px(rig.marker_size_mm)
        manifest["tags"][str(tag)] = {
            "species": rig.plant(tag).species,
            "bbox": [x, y, w, h],
            "marker_side_px": round(d.side_px, 1),
            "mm_per_px": round(mmpp, 4),
            "leaf_area_cm2": round(leaf_area_estimate(crop, mmpp), 1),
            "photo": f"tag-{tag:02d}.jpg",
            "vector": f"tag-{tag:02d}.npy",
            "enrolled": manifest["updated"],
        }
    manifest_path.write_text(json.dumps(manifest, indent=2) + "\n")
    done = len(wanted & by_tag.keys())
    print(f"enrolled {done}/{len(wanted)} plants with {embed.name} -> {out}")
    if missing:
        print(f"NOT SEEN, not enrolled: {missing}")
    return 0 if not missing else 1


if __name__ == "__main__":
    sys.exit(main())
