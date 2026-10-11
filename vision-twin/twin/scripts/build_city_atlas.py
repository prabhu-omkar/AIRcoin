"""Build the AIRcoin isometric city runtime atlas from generated source art.

Usage: python scripts/build_city_atlas.py
Requires Pillow. The output is deterministic and safe to commit/deploy.
"""

from __future__ import annotations

import json
from pathlib import Path

from PIL import Image

ROOT = Path(__file__).resolve().parents[1]
SOURCE = ROOT / "art" / "source"
OUTPUT = ROOT / "public" / "assets" / "city"
ATLAS_SIZE = (2048, 2048)
CELL_SIZE = 512
PADDING = 18

SPECS = [
    ("apartment-0", "empty-apartments.png", 470, (0,0,570,724)),
    ("apartment-1", "empty-apartments.png", 470, (570,0,1100,724)),
    ("apartment-2", "empty-apartments.png", 470, (1100,0,1644,724)),
    ("apartment-3", "empty-apartments.png", 470, (1644,0,2172,724)),
    ("neem", "neem-tree.png", 265, None),
    ("okhla-factory", "okhla-factory-v2.png", 470, None),
    ("metro-real", "metro-real.png", 470, None),
    ("auto-se", "traffic-sheet-delhi-v2.png", 235, (0, 0, 470, 724)),
    ("hatchback", "traffic-sheet-delhi-v2.png", 245, (900, 0, 1460, 724)),
    ("delhi-bus", "traffic-sheet-delhi-v2.png", 300, (1430, 0, 2172, 724)),
    ("vendor-cart", "street-props-delhi-v2.png", 255, (0, 0, 555, 887)),
    ("chai-stall", "street-props-delhi-v2.png", 245, (545, 0, 1060, 887)),
    ("auto-nw", "traffic-rear.png", 235, (0,0,480,887)),
    ("car-nw", "traffic-rear.png", 245, (480,0,1010,887)),
    ("bus-nw", "traffic-rear.png", 300, (1010,0,1774,887)),
]


def prepare(source: Path, max_size: int, crop: tuple[int, int, int, int] | None) -> Image.Image:
    image = Image.open(source).convert("RGBA")
    if crop:
        image = image.crop(crop)
    alpha_box = image.getchannel("A").getbbox()
    if not alpha_box:
        raise ValueError(f"{source.name} has no visible pixels")
    image = image.crop(alpha_box)
    scale = min(max_size / image.width, max_size / image.height, 1)
    size = (max(1, round(image.width * scale)), max(1, round(image.height * scale)))
    return image.resize(size, Image.Resampling.LANCZOS)


def main() -> None:
    OUTPUT.mkdir(parents=True, exist_ok=True)
    atlas = Image.new("RGBA", ATLAS_SIZE, (0, 0, 0, 0))
    frames: dict[str, dict] = {}

    for index, (key, filename, max_size, crop) in enumerate(SPECS):
        source = SOURCE / filename
        if not source.exists():
            raise FileNotFoundError(f"missing city source asset: {source}")
        sprite = prepare(source, max_size, crop)
        cell_x = (index % 4) * CELL_SIZE
        cell_y = (index // 4) * CELL_SIZE
        x = cell_x + (CELL_SIZE - sprite.width) // 2
        y = cell_y + CELL_SIZE - sprite.height - PADDING
        if y < cell_y + PADDING:
            raise ValueError(f"{filename} does not fit its atlas cell")
        atlas.alpha_composite(sprite, (x, y))
        frames[key] = {
            "frame": {"x": x, "y": y, "w": sprite.width, "h": sprite.height},
            "rotated": False,
            "trimmed": False,
            "spriteSourceSize": {"x": 0, "y": 0, "w": sprite.width, "h": sprite.height},
            "sourceSize": {"w": sprite.width, "h": sprite.height},
            "pivot": {"x": 0.5, "y": 0.94},
        }

    atlas_path = OUTPUT / "delhi-atlas.webp"
    json_path = OUTPUT / "delhi-atlas.json"
    atlas.save(atlas_path, "WEBP", quality=88, method=6, lossless=False, exact=True)
    payload = {
        "frames": frames,
        "meta": {
            "app": "AIRcoin city asset pipeline",
            "version": "1.0",
            "image": atlas_path.name,
            "format": "RGBA8888",
            "size": {"w": ATLAS_SIZE[0], "h": ATLAS_SIZE[1]},
            "scale": "1",
        },
    }
    json_path.write_text(json.dumps(payload, indent=2) + "\n", encoding="utf-8")
    print(f"built {atlas_path.relative_to(ROOT)} ({atlas_path.stat().st_size / 1024:.0f} KiB)")
    print(f"validated {len(frames)} named frames with anchors")


if __name__ == "__main__":
    main()
