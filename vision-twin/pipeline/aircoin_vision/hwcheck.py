"""Phase 1 hardware check: Pi, camera and GPS.

    python -m aircoin_vision.hwcheck                      # Pi camera + GPS on /dev/serial0
    python -m aircoin_vision.hwcheck --camera usb:0       # laptop / USB camera
    python -m aircoin_vision.hwcheck --gps /dev/ttyACM0 --gps-seconds 30
    python -m aircoin_vision.hwcheck --no-gps

Saves one frame to data/hwcheck.jpg, reports resolution, frame rate and how
many stickers are visible, then reads NMEA sentences from the GPS (u-blox
NEO-6M/M8N, 9600 baud) and reports the fix. Exits non-zero if anything fails.
The GPS service itself belongs to miner-core; this only confirms the wiring.
"""

import argparse
import platform
import sys
import time
from pathlib import Path

import cv2

from .capture import open_source
from .config import DATA_DIR, load_rig
from .markers import MarkerDetector, summarize


def check_pi():
    model = Path("/proc/device-tree/model")
    name = model.read_text().strip("\x00\n") if model.exists() else platform.platform()
    temp = Path("/sys/class/thermal/thermal_zone0/temp")
    t = f", CPU {int(temp.read_text()) / 1000:.1f} °C" if temp.exists() else ""
    print(f"[host]   {name}{t}")
    return True


def check_camera(spec, rig, seconds=3.0):
    try:
        source = open_source(spec, rig.camera.get("width"), rig.camera.get("height"))
    except Exception as e:  # noqa: BLE001 - report any camera failure
        print(f"[camera] FAIL: cannot open {spec}: {e}")
        return False
    detector = MarkerDetector(rig.aruco_dictionary)
    n, t0, frame, summary = 0, time.time(), None, None
    try:
        for _, frame in source:
            n += 1
            if time.time() - t0 >= seconds:
                break
        if frame is None:
            print(f"[camera] FAIL: no frames from {spec}")
            return False
        summary = summarize(detector.detect(frame), rig)
    finally:
        source.close()
    fps = n / max(1e-6, time.time() - t0)
    DATA_DIR.mkdir(parents=True, exist_ok=True)
    cv2.imwrite(str(DATA_DIR / "hwcheck.jpg"), frame)
    print(f"[camera] OK: {frame.shape[1]}x{frame.shape[0]} at {fps:.1f} fps; "
          f"stickers {len(summary['detected'])}/{len(rig.sticker_ids)}; frame saved to {DATA_DIR / 'hwcheck.jpg'}")
    if summary["missing"]:
        print(f"         not visible: {summary['missing']}")
    return True


def parse_nmea_coord(value, hemi):
    if not value:
        return None
    dot = value.index(".")
    deg = float(value[: dot - 2]) + float(value[dot - 2 :]) / 60
    return -deg if hemi in ("S", "W") else deg


def check_gps(port, baud, seconds):
    try:
        import serial  # pyserial
    except ImportError:
        print("[gps]    SKIP: pip install pyserial")
        return False
    try:
        ser = serial.Serial(port, baud, timeout=1)
    except Exception as e:  # noqa: BLE001
        print(f"[gps]    FAIL: cannot open {port}: {e}")
        return False
    t0, sentences, fix = time.time(), 0, None
    with ser:
        while time.time() - t0 < seconds:
            line = ser.readline().decode("ascii", "replace").strip()
            if not line.startswith("$"):
                continue
            sentences += 1
            f = line.split("*")[0].split(",")
            if f[0][3:] == "GGA" and len(f) > 9:
                quality, sats = int(f[6] or 0), int(f[7] or 0)
                lat, lon = parse_nmea_coord(f[2], f[3]), parse_nmea_coord(f[4], f[5])
                fix = (quality, sats, lat, lon, f[9])
                if quality > 0:
                    break
    if not sentences:
        print(f"[gps]    FAIL: no NMEA on {port} at {baud} baud (check wiring TX->RX, enable UART in raspi-config)")
        return False
    if not fix or fix[0] == 0:
        sats = fix[1] if fix else 0
        print(f"[gps]    OK (wired), NO FIX yet: {sentences} sentences, {sats} satellites. Try near a window.")
        return True
    q, sats, lat, lon, alt = fix
    print(f"[gps]    OK: fix quality {q}, {sats} satellites, {lat:.6f}, {lon:.6f}, alt {alt} m")
    return True


def main(argv=None):
    ap = argparse.ArgumentParser(description=__doc__, formatter_class=argparse.RawDescriptionHelpFormatter)
    ap.add_argument("--rig", help="rig.json path")
    ap.add_argument("--camera", help="camera source (default: rig.json camera.source)")
    ap.add_argument("--gps", default="/dev/serial0")
    ap.add_argument("--baud", type=int, default=9600)
    ap.add_argument("--gps-seconds", type=float, default=15)
    ap.add_argument("--no-gps", action="store_true")
    args = ap.parse_args(argv)

    rig = load_rig(args.rig)
    ok = check_pi()
    ok &= check_camera(args.camera or rig.camera.get("source", "picam"), rig)
    if not args.no_gps:
        ok &= check_gps(args.gps, args.baud, args.gps_seconds)
    return 0 if ok else 1


if __name__ == "__main__":
    sys.exit(main())
