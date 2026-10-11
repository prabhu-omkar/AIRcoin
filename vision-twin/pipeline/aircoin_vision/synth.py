"""Render a synthetic picture of the 20-plant rig (for tests and trying the
pipeline without hardware).

    python -m aircoin_vision.synth out.jpg [--missing 7 12] [--unknown 55] [--tilt 0.08]
    python -m aircoin_vision.synth out.jpg --noir --fake 12 --swap 3:snake_plant

Each species gets its own look (leaf colour, size, shape, posture, flowers), so a swapped
plant really looks different. --noir renders what the Pi Camera NoIR sees through the blue gel:
the red channel carries near-infrared, so living leaves come out red/pink (high NDVI) and a
plastic plant does not (NDVI near 0).
"""

import argparse
import hashlib

import cv2
import numpy as np

from .config import load_rig
from .markers import get_dictionary


def species_look(species):
    """Deterministic appearance for a species."""
    r = np.random.default_rng(int(hashlib.md5(species.encode()).hexdigest()[:8], 16))
    return {
        "hue": int(r.integers(32, 82)),  # OpenCV hue: 30-85 is yellow-green to blue-green
        "sat": int(r.integers(110, 235)),
        "val": int(r.integers(80, 210)),
        "n": int(r.integers(9, 26)),
        "length": float(r.uniform(0.05, 0.13)),  # leaf half-length, fraction of the cell width
        "aspect": float(r.uniform(0.18, 0.9)),  # width / length
        "upright": float(r.uniform(0.0, 1.0)),  # 1 = vertical blades, 0 = any angle
        "spread": float(r.uniform(0.06, 0.15)),
        "flowers": tuple(int(x) for x in r.integers(0, 256, 3)) if r.random() < 0.35 else None,
    }


def _leaf_colour(look, rng, noir, plastic):
    h = look["hue"] + (0 if plastic else int(rng.integers(-4, 5)))
    s = look["sat"] if plastic else int(np.clip(look["sat"] + rng.integers(-25, 26), 0, 255))
    v = look["val"] if plastic else int(np.clip(look["val"] + rng.integers(-30, 31), 30, 255))
    b, g, r = (int(x) for x in cv2.cvtColor(np.uint8([[[h, s, v]]]), cv2.COLOR_HSV2BGR)[0, 0])
    if not noir:
        return (b, g, r)
    # NoIR + blue gel: red channel ~ NIR (high for living leaves), blue channel ~ visible blue.
    nir = 0.25 * v if plastic else 120 + 0.55 * v
    return (int(np.clip(0.35 * b + 0.25 * v, 0, 255)), int(np.clip(0.45 * g + 0.15 * v, 0, 255)), int(np.clip(nir + 0.2 * r, 0, 255)))


def render_rig(rig, width=2304, height=1296, missing=(), unknown=(), tilt=0.06, noise=4.0, blur=1, seed=0,
               marker_px=None, swap=None, fake=(), noir=False):
    """Return a BGR image of the rig seen by a slightly tilted camera.

    swap: {tag_id: species} draws a different species in that pot; fake: tag IDs with a plastic plant;
    noir: render as the NoIR camera with the blue gel filter.
    """
    rng = np.random.default_rng(seed)
    swap = swap or {}
    fake = set(fake)
    dictionary = get_dictionary(rig.aruco_dictionary)
    board_w, board_h = width, height
    board = np.full((board_h, board_w, 3), (214, 206, 204) if noir else (205, 215, 222), np.uint8)  # pale wall
    cell_w, cell_h = board_w / rig.cols, board_h / rig.rows
    # sticker ~14 % of a shelf cell, like 40 mm stickers on ~35 cm shelves: the plant crop (4.5 stickers tall)
    # then stays below the shelf above
    side = int(marker_px or min(cell_w, cell_h) * 0.14)

    tags = [(p.slot, p.tag_id) for p in rig.plants if p.tag_id not in set(missing)]

    for slot in range(rig.rows * rig.cols):
        r, c = divmod(slot, rig.cols)
        cx = int((c + 0.5) * cell_w)
        base_y = int((r + 0.92) * cell_h)
        cv2.ellipse(board, (cx, base_y), (int(cell_w * 0.28), int(cell_h * 0.08)), 0, 0, 360, (40, 70, 120), -1)

    def marker_top(slot):
        r, _ = divmod(slot, rig.cols)
        return int((r + 0.88) * cell_h) - side

    # leaves first, so a plant never covers a neighbour's sticker (real rigs keep stickers clear too)
    species_of = {p.tag_id: p.species for p in rig.plants}
    for slot, tag in tags:
        sp = swap.get(tag, species_of[tag])
        look = species_look(sp)
        plastic = tag in fake
        # the plant itself is fixed per pot (layout from tag + species); each frame only sways it a little
        prng = np.random.default_rng(int(hashlib.md5(f"{tag}:{sp}:{plastic}".encode()).hexdigest()[:8], 16))
        cx = int((slot % rig.cols + 0.5) * cell_w)
        base = marker_top(slot) - side * 0.5
        for _ in range(look["n"]):
            lx = cx + prng.normal(0, cell_w * look["spread"]) + rng.normal(0, cell_w * 0.008)
            ly = base - abs(prng.normal(cell_h * 0.22, cell_h * 0.11)) + rng.normal(0, cell_h * 0.006)
            L = int(cell_w * look["length"] * prng.uniform(0.8, 1.2))
            angle = 90 + prng.normal(0, 70 * (1 - look["upright"]) + 8) + rng.normal(0, 4)
            cv2.ellipse(board, (int(lx), int(ly)), (L, max(2, int(L * look["aspect"]))), float(angle), 0, 360,
                        _leaf_colour(look, prng, noir, plastic), -1)
        if look["flowers"] is not None:
            for _ in range(5):
                fx = int(cx + prng.normal(0, cell_w * look["spread"]))
                fy = int(base - abs(prng.normal(cell_h * 0.32, cell_h * 0.08)))
                col = look["flowers"] if not noir else (int(look["flowers"][0] * 0.6), int(look["flowers"][1] * 0.6), 45 if plastic else 150)
                cv2.circle(board, (fx, fy), int(cell_w * 0.025), col, -1)

    for slot, tag in tags:
        # sticker: white quiet zone + marker
        cx = int((slot % rig.cols + 0.5) * cell_w)
        q = max(4, side // 6)
        x0, y0 = cx - side // 2, marker_top(slot)
        cv2.rectangle(board, (x0 - q, y0 - q), (x0 + side + q, y0 + side + q), (255, 255, 255), -1)
        board[y0 : y0 + side, x0 : x0 + side] = cv2.cvtColor(
            cv2.aruco.generateImageMarker(dictionary, tag, side, borderBits=1), cv2.COLOR_GRAY2BGR
        )

    # unknown stickers: along the top edge of the board
    for k, tag in enumerate(unknown):
        x0, y0 = int(cell_w * 0.3 + k * side * 2.5), int(cell_h * 0.08)
        q = max(4, side // 6)
        cv2.rectangle(board, (x0 - q, y0 - q), (x0 + side + q, y0 + side + q), (255, 255, 255), -1)
        board[y0 : y0 + side, x0 : x0 + side] = cv2.cvtColor(
            cv2.aruco.generateImageMarker(dictionary, tag, side, borderBits=1), cv2.COLOR_GRAY2BGR
        )

    # perspective: camera slightly above, looking down at the board
    dx, dy = tilt * board_w, tilt * board_h
    src = np.float32([[0, 0], [board_w, 0], [board_w, board_h], [0, board_h]])
    dst = np.float32([[dx, dy], [board_w - dx, dy], [board_w, board_h], [0, board_h]])
    img = cv2.warpPerspective(board, cv2.getPerspectiveTransform(src, dst), (width, height), borderValue=(60, 60, 60))
    if seed:  # a little exposure drift between frames
        img = np.clip(img.astype(np.float32) * rng.uniform(0.9, 1.1), 0, 255).astype(np.uint8)
    if blur:
        img = cv2.GaussianBlur(img, (2 * blur + 1, 2 * blur + 1), 0)
    if noise:
        img = np.clip(img.astype(np.float32) + rng.normal(0, noise, img.shape), 0, 255).astype(np.uint8)
    return img


def main(argv=None):
    ap = argparse.ArgumentParser(description=__doc__, formatter_class=argparse.RawDescriptionHelpFormatter)
    ap.add_argument("out")
    ap.add_argument("--rig")
    ap.add_argument("--missing", type=int, nargs="*", default=[])
    ap.add_argument("--unknown", type=int, nargs="*", default=[])
    ap.add_argument("--tilt", type=float, default=0.06)
    ap.add_argument("--width", type=int, default=2304)
    ap.add_argument("--height", type=int, default=1296)
    ap.add_argument("--fake", type=int, nargs="*", default=[], help="tags with a plastic plant")
    ap.add_argument("--swap", nargs="*", default=[], metavar="TAG:SPECIES", help="draw another species in a pot")
    ap.add_argument("--noir", action="store_true", help="render as the NoIR camera behind the blue gel")
    ap.add_argument("--seed", type=int, default=0)
    ap.add_argument("--frames", type=int, default=1, help="write N frames (sway, noise, exposure vary) into the folder OUT")
    args = ap.parse_args(argv)
    swap = {int(t): sp for t, sp in (x.split(":", 1) for x in args.swap)}
    rig = load_rig(args.rig)
    render = lambda seed: render_rig(rig, args.width, args.height, args.missing, args.unknown, args.tilt,  # noqa: E731
                                     seed=seed, swap=swap, fake=args.fake, noir=args.noir)
    if args.frames > 1:
        from pathlib import Path
        out = Path(args.out)
        out.mkdir(parents=True, exist_ok=True)
        for k in range(args.frames):
            cv2.imwrite(str(out / f"frame-{k:03d}.jpg"), render(args.seed + k + 1))
        print(f"wrote {args.frames} frames to {out}")
        return
    cv2.imwrite(args.out, render(args.seed))
    print(f"wrote {args.out}")


if __name__ == "__main__":
    main()
