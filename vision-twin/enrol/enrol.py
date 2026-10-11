from __future__ import annotations

import argparse
import json
from pathlib import Path

import cv2
import numpy as np


def main() -> None:
    parser = argparse.ArgumentParser(description="Enrol a tag from a cropped plant reference photo")
    parser.add_argument("tag_id", type=int)
    parser.add_argument("species")
    parser.add_argument("image", type=Path)
    parser.add_argument("--output", type=Path, default=Path(__file__).with_name("enrolment.json"))
    args = parser.parse_args()
    image = cv2.imread(str(args.image))
    if image is None:
        raise SystemExit(f"could not read {args.image}")
    hist = cv2.calcHist([image], [0, 1], None, [8, 8], [0, 256, 0, 256]).flatten()
    hist /= max(float(hist.sum()), 1.0)
    data = json.loads(args.output.read_text(encoding="utf-8")) if args.output.exists() else {"plants": []}
    row = {"tag_id": args.tag_id, "species": args.species, "reference_histogram": np.round(hist, 7).tolist()}
    data["plants"] = [p for p in data["plants"] if p["tag_id"] != args.tag_id] + [row]
    data["plants"].sort(key=lambda p: p["tag_id"])
    args.output.write_text(json.dumps(data, indent=2) + "\n", encoding="utf-8")
    print(f"enrolled tag {args.tag_id} as {args.species} -> {args.output}")


if __name__ == "__main__":
    main()

