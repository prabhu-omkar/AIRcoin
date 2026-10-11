from __future__ import annotations

import argparse
from pathlib import Path

import cv2
import numpy as np


def main() -> None:
    parser = argparse.ArgumentParser(description="Generate printable AIRcoin 4x4 ArUco plant stickers")
    parser.add_argument("--output", type=Path, default=Path("markers"))
    parser.add_argument("--pixels", type=int, default=600, help="marker image size; print at 45 mm square")
    parser.add_argument("--spare", type=int, default=42, help="extra unknown marker for anti-cheat demo")
    args = parser.parse_args()
    args.output.mkdir(parents=True, exist_ok=True)
    dictionary = cv2.aruco.getPredefinedDictionary(cv2.aruco.DICT_4X4_50)
    for tag_id in [*range(20), args.spare]:
        marker = cv2.aruco.generateImageMarker(dictionary, tag_id, args.pixels)
        border = max(24, args.pixels // 12)
        sheet = np.full((args.pixels + border * 2, args.pixels + border * 2), 255, np.uint8)
        sheet[border:-border, border:-border] = marker
        target = args.output / f"aruco-4x4-{tag_id:02d}.png"
        cv2.imwrite(str(target), sheet)
    print(f"wrote 21 markers (0-19 plus spare {args.spare}) to {args.output}")


if __name__ == "__main__":
    main()
