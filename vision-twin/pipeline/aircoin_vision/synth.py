"""Render a synthetic picture of the 20-plant rig (for tests and trying the
pipeline without hardware).

    python -m aircoin_vision.synth out.jpg [--missing 7 12] [--unknown 55] [--tilt 0.08]
"""

import argparse

import cv2
import numpy as np

from .config import load_rig
from .markers import get_dictionary


def render_rig(rig, width=2304, height=1296, missing=(), unknown=(), tilt=0.06, noise=4.0, blur=1, seed=0,
               marker_px=None):
    """Return a BGR image of the rig seen by a slightly tilted camera."""
    rng = np.random.default_rng(seed)
    dictionary = get_dictionary(rig.aruco_dictionary)
    board_w, board_h = width, height
    board = np.full((board_h, board_w, 3), (205, 215, 222), np.uint8)  # pale wall
    cell_w, cell_h = board_w / rig.cols, board_h / rig.rows
    side = int(marker_px or min(cell_w, cell_h) * 0.2)

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
    for slot, _ in tags:
        cx = int((slot % rig.cols + 0.5) * cell_w)
        for _ in range(14):
            lx = int(cx + rng.normal(0, cell_w * 0.12))
            ly = int(marker_top(slot) - side * 0.4 - abs(rng.normal(cell_h * 0.25, cell_h * 0.12)))
            green = (int(rng.integers(20, 60)), int(rng.integers(120, 190)), int(rng.integers(20, 70)))
            cv2.ellipse(board, (lx, ly), (int(cell_w * 0.07), int(cell_h * 0.05)), float(rng.uniform(0, 180)), 0, 360, green, -1)

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
    args = ap.parse_args(argv)
    img = render_rig(load_rig(args.rig), args.width, args.height, args.missing, args.unknown, args.tilt)
    cv2.imwrite(args.out, img)
    print(f"wrote {args.out}")


if __name__ == "__main__":
    main()
