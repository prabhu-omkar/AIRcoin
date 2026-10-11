"""Generate printable ArUco sticker sheets for a miner.

    python -m aircoin_vision.stickers                    # all stickers in config/rig.json
    python -m aircoin_vision.stickers --extra 99         # plus spare sticker(s)
    python -m aircoin_vision.stickers --out data/stickers --marker-mm 45

Writes A4 pages at 300 DPI as PNG and one PDF (stickers.pdf). Print at
100 % / "actual size" and check the 50 mm scale bar with a ruler: the
marker size feeds the leaf-area scale, so it must be exact.
"""

import argparse
import zlib
from pathlib import Path

import cv2
import numpy as np

from .config import DATA_DIR, load_rig
from .markers import get_dictionary
from .species import display_name

DPI = 300
A4_MM = (210, 297)


def mm(v):
    return int(round(v * DPI / 25.4))


def marker_bits(dictionary):
    return dictionary.markerSize + 2  # data bits + 1-bit black border each side


def render_sticker(dictionary, tag_id, marker_mm, miner_id, species):
    """One sticker: quiet zone, marker, labels. Returns grayscale image."""
    module_mm = marker_mm / marker_bits(dictionary)
    quiet = mm(max(module_mm, 4))
    side = mm(marker_mm)
    text_h = mm(15)
    w = side + 2 * quiet
    h = side + 2 * quiet + text_h
    img = np.full((h, w), 255, np.uint8)
    marker = cv2.aruco.generateImageMarker(dictionary, tag_id, side, borderBits=1)
    img[quiet : quiet + side, quiet : quiet + side] = marker

    def text(s, y_mm, size, thick):
        (tw, _), _ = cv2.getTextSize(s, cv2.FONT_HERSHEY_SIMPLEX, size, thick)
        cv2.putText(img, s, ((w - tw) // 2, quiet * 2 + side + mm(y_mm)), cv2.FONT_HERSHEY_SIMPLEX, size, 0, thick, cv2.LINE_AA)

    text(f"TAG {tag_id}", 2, 2.2, 5)
    text(species, 7.5, 1.4, 3)
    text(f"AIRcoin {miner_id}", 12, 1.1, 2)
    return img


def layout_pages(stickers):
    page_w, page_h = mm(A4_MM[0]), mm(A4_MM[1])
    margin, gap = mm(10), mm(6)
    sw, sh = stickers[0].shape[1], stickers[0].shape[0]
    cols = max(1, (page_w - 2 * margin + gap) // (sw + gap))
    footer = mm(18)
    rows = max(1, (page_h - 2 * margin - footer + gap) // (sh + gap))
    per_page = cols * rows
    pages = []
    for start in range(0, len(stickers), per_page):
        page = np.full((page_h, page_w), 255, np.uint8)
        for k, st in enumerate(stickers[start : start + per_page]):
            r, c = divmod(k, cols)
            x, y = margin + c * (sw + gap), margin + r * (sh + gap)
            page[y : y + sh, x : x + sw] = st
            # light cut line
            cv2.rectangle(page, (x - mm(1.5), y - mm(1.5)), (x + sw + mm(1.5), y + sh + mm(1.5)), 190, 1)
        # 50 mm scale bar
        y = page_h - margin - mm(6)
        x0 = margin
        cv2.rectangle(page, (x0, y), (x0 + mm(50), y + mm(3)), 0, -1)
        cv2.putText(page, "Print at 100% (actual size). This bar must measure exactly 50 mm.",
                    (x0, y - mm(2)), cv2.FONT_HERSHEY_SIMPLEX, 1.0, 0, 2, cv2.LINE_AA)
        pages.append(page)
    return pages


def write_pdf(pages, path):
    """Minimal PDF writer: one grayscale image per A4 page, exact physical size."""
    pw, ph = A4_MM[0] / 25.4 * 72, A4_MM[1] / 25.4 * 72
    objects = []

    def add(body):
        objects.append(body)
        return len(objects)

    catalog = add(None)
    pages_obj = add(None)
    kids = []
    for page in pages:
        h, w = page.shape
        data = zlib.compress(page.tobytes(), 9)
        img = add(
            f"<< /Type /XObject /Subtype /Image /Width {w} /Height {h} /ColorSpace /DeviceGray "
            f"/BitsPerComponent 8 /Filter /FlateDecode /Length {len(data)} >>\nstream\n".encode() + data + b"\nendstream"
        )
        content = f"q {pw:.3f} 0 0 {ph:.3f} 0 0 cm /Im0 Do Q".encode()
        cont = add(f"<< /Length {len(content)} >>\nstream\n".encode() + content + b"\nendstream")
        kids.append(add(
            f"<< /Type /Page /Parent {pages_obj} 0 R /MediaBox [0 0 {pw:.3f} {ph:.3f}] "
            f"/Resources << /XObject << /Im0 {img} 0 R >> >> /Contents {cont} 0 R >>".encode()
        ))
    objects[catalog - 1] = f"<< /Type /Catalog /Pages {pages_obj} 0 R >>".encode()
    objects[pages_obj - 1] = f"<< /Type /Pages /Kids [{' '.join(f'{k} 0 R' for k in kids)}] /Count {len(kids)} >>".encode()

    out = bytearray(b"%PDF-1.4\n")
    offsets = []
    for i, body in enumerate(objects, 1):
        offsets.append(len(out))
        out += f"{i} 0 obj\n".encode() + body + b"\nendobj\n"
    xref = len(out)
    out += f"xref\n0 {len(objects) + 1}\n0000000000 65535 f \n".encode()
    out += b"".join(f"{o:010d} 00000 n \n".encode() for o in offsets)
    out += f"trailer\n<< /Size {len(objects) + 1} /Root {catalog} 0 R >>\nstartxref\n{xref}\n%%EOF\n".encode()
    Path(path).write_bytes(bytes(out))


def main(argv=None):
    ap = argparse.ArgumentParser(description=__doc__, formatter_class=argparse.RawDescriptionHelpFormatter)
    ap.add_argument("--rig", help="rig.json path")
    ap.add_argument("--out", default=str(DATA_DIR / "stickers"))
    ap.add_argument("--marker-mm", type=float, help="override marker size (update rig.json to match!)")
    ap.add_argument("--extra", type=int, nargs="*", default=[], help="extra sticker IDs (spares, second virtual miner)")
    args = ap.parse_args(argv)

    rig = load_rig(args.rig)
    marker_mm = args.marker_mm or rig.marker_size_mm
    dictionary = get_dictionary(rig.aruco_dictionary)
    out = Path(args.out)
    out.mkdir(parents=True, exist_ok=True)

    entries = [(p.tag_id, display_name(p.species)) for p in rig.plants] + [(i, "spare") for i in args.extra]
    stickers = [render_sticker(dictionary, tag, marker_mm, rig.miner_id, name) for tag, name in entries]
    pages = layout_pages(stickers)
    for n, page in enumerate(pages, 1):
        cv2.imwrite(str(out / f"stickers-page-{n}.png"), page)
    write_pdf(pages, out / "stickers.pdf")
    print(f"{len(stickers)} stickers ({rig.aruco_dictionary}, {marker_mm:g} mm) on {len(pages)} page(s) -> {out}/stickers.pdf")


if __name__ == "__main__":
    main()
