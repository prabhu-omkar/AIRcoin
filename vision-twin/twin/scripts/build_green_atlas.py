#!/usr/bin/env python3
"""
Build green building atlas entries from user-supplied PNG/JPG images.

Usage:
  1. Place your 4 green building images in:
       art/source/green-buildings/
     Named: b0.png, b1.png, b2.png, b3.png

  2. Run from twin/ directory:
       python scripts/build_green_atlas.py
"""

import json, sys
from pathlib import Path
from PIL import Image
import numpy as np

SCRIPT_DIR  = Path(__file__).parent
TWIN_DIR    = SCRIPT_DIR.parent
SRC_DIR     = TWIN_DIR / "art" / "source" / "green-buildings"
ATLAS_IMG   = TWIN_DIR / "public" / "assets" / "city" / "delhi-atlas.webp"
ATLAS_JSON  = TWIN_DIR / "public" / "assets" / "city" / "delhi-atlas.json"

BUILDING_W  = 368
BUILDING_H  = 470
BLACK_THRESH = 18
PADDING     = 24

def remove_black_background(img):
    img = img.convert("RGBA")
    data = np.array(img, dtype=np.uint16)
    r, g, b, a = data[...,0], data[...,1], data[...,2], data[...,3]
    mask = (r < BLACK_THRESH) & (g < BLACK_THRESH) & (b < BLACK_THRESH)
    data[...,3] = np.where(mask, 0, a)
    return Image.fromarray(data.astype(np.uint8), "RGBA")

def crop_to_content(img, padding=8):
    bbox = img.getbbox()
    if bbox is None:
        return img
    l, t, r, b = bbox
    return img.crop((max(0,l-padding), max(0,t-padding),
                     min(img.width,r+padding), min(img.height,b+padding)))

def scale_to_fit(img, max_w, max_h):
    ratio = min(max_w / img.width, max_h / img.height, 1.0)
    return img.resize((round(img.width*ratio), round(img.height*ratio)), Image.LANCZOS)

def find_input(idx):
    for ext in ("png", "jpg", "jpeg", "webp"):
        p = SRC_DIR / f"b{idx}.{ext}"
        if p.exists():
            return p
    return None

def main():
    if not SRC_DIR.exists():
        print(f"ERROR: Input folder not found: {SRC_DIR}")
        sys.exit(1)

    atlas = Image.open(ATLAS_IMG).convert("RGBA")
    with open(ATLAS_JSON) as f:
        atlas_data = json.load(f)

    existing_w, existing_h = atlas.size
    print(f"Existing atlas: {existing_w}x{existing_h}")

    sprites = []
    for i in range(4):
        src = find_input(i)
        if src is None:
            print(f"  WARN: b{i}.* not found, using placeholder")
            fr = atlas_data["frames"]["apartment-0"]["frame"]
            sprites.append(atlas.crop((fr["x"],fr["y"],fr["x"]+fr["w"],fr["y"]+fr["h"])))
            continue

        print(f"  Processing b{i} ({src.name})...")
        raw     = Image.open(src)
        no_bg   = remove_black_background(raw)
        cropped = crop_to_content(no_bg)
        scaled  = scale_to_fit(cropped, BUILDING_W, BUILDING_H)

        canvas = Image.new("RGBA", (BUILDING_W, BUILDING_H), (0,0,0,0))
        ox = (BUILDING_W - scaled.width) // 2
        oy = BUILDING_H - scaled.height
        canvas.paste(scaled, (ox, oy), scaled)
        sprites.append(canvas)
        print(f"    -> {scaled.width}x{scaled.height} prepared")

    new_row_y = existing_h + PADDING
    new_w     = max(existing_w, len(sprites)*(BUILDING_W+PADDING)+PADDING)
    new_h     = new_row_y + BUILDING_H + PADDING

    new_atlas = Image.new("RGBA", (new_w, new_h), (0,0,0,0))
    new_atlas.paste(atlas, (0, 0))

    for i, sprite in enumerate(sprites):
        x = PADDING + i*(BUILDING_W+PADDING)
        y = new_row_y
        new_atlas.paste(sprite, (x, y), sprite)
        key = f"green-apartment-{i}"
        atlas_data["frames"][key] = {
            "frame":            {"x": x, "y": y, "w": BUILDING_W, "h": BUILDING_H},
            "rotated":          False,
            "trimmed":          False,
            "spriteSourceSize": {"x": 0, "y": 0, "w": BUILDING_W, "h": BUILDING_H},
            "sourceSize":       {"w": BUILDING_W, "h": BUILDING_H},
            "pivot":            {"x": 0.5, "y": 0.94},
        }
        print(f"  Frame {key}: x={x} y={y}")

    atlas_data["meta"]["size"] = {"w": new_atlas.width, "h": new_atlas.height}

    new_atlas.save(str(ATLAS_IMG), "WEBP", quality=92)
    with open(ATLAS_JSON, "w") as f:
        json.dump(atlas_data, f, indent=2)

    print(f"\nAtlas saved -> {ATLAS_IMG} ({new_atlas.width}x{new_atlas.height})")
    print(f"JSON saved  -> {ATLAS_JSON}")

if __name__ == "__main__":
    main()
