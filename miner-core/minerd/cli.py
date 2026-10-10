"""python -m minerd <command>

  attest   build + sign one epoch's C3 attestation from mock inputs (Phase 1 "one command")
  verify   recompute evidence_hash and check the signature of an attestation file
  hashes   print calibration_hash, device address and sticker_set_hash
  keygen   create a device key in var/device-key.hex
  c1check  run C1 vision messages (file or live MQTT) through the real tracker: what would B pay?
  daemon   run the Phase 2 real-time miner with durable C3 delivery
  soak     accelerated multi-hour pipeline and no-missed-epoch validation
"""

from __future__ import annotations

import argparse
import json
import logging
import sys
import time
from pathlib import Path

from eth_account import Account

from . import contracts
from .catalogue import Catalogue
from .config import EPOCH_MS, Config
from .mockrun import build_engine, run_epoch
from .signer import Signer, recover, sticker_set_hash, verify
from simulator.scenarios import SCENARIOS


def _write(doc: dict, out: str | None) -> None:
    text = json.dumps(doc, indent=2)
    if out:
        Path(out).parent.mkdir(parents=True, exist_ok=True)
        Path(out).write_text(text + "\n", encoding="utf-8")
    else:
        print(text)


def _faults(vision, args, epoch: int) -> None:
    start = epoch * EPOCH_MS
    for tag in args.drop or []:
        vision.faults.dropped[tag] = start + 20_000
    vision.faults.fake.update(args.fake or [])


def cmd_attest(args, cfg: Config) -> int:
    if not args.mock:
        print("Phase 1 only builds attestations from mock inputs: pass --mock", file=sys.stderr)
        return 2
    epoch = args.epoch if args.epoch is not None else int(time.time() * 1000) // EPOCH_MS - 1
    engine, vision = build_engine(cfg, args.scenario, seed=args.seed)
    _faults(vision, args, epoch)
    result = run_epoch(engine, vision, epoch)
    signer = Signer(cfg.device_key())
    att = signer.sign(result.c3_unsigned(engine.cat.calibration_hash))

    errs = contracts.errors("c3-attestation", att)
    _write(att, args.out)
    paid = sum(1 for p in att["plants"] if p["air"] > 0)
    print(f"epoch {epoch} [{args.scenario}, AQI {att['sensor_summary']['aqi']}]: {result.total_air} AIR "
          f"from {paid}/{len(att['plants'])} plants, amount {att['amount']}, signed by {signer.address}",
          file=sys.stderr)
    if args.epoch_out:
        _write(result.c2_epoch({"status": "pending", "evidence_hash": att["evidence_hash"],
                                "amount": att["amount"]}), args.epoch_out)
    if errs:
        print("schema errors:\n  " + "\n  ".join(errs), file=sys.stderr)
        return 1
    print("c3-attestation schema: ok", file=sys.stderr)
    return 0


def cmd_verify(args, cfg: Config) -> int:
    att = json.loads(Path(args.file).read_text(encoding="utf-8"))
    expected = args.address or cfg.registration().device_address
    problems = contracts.errors("c3-attestation", att) + verify(att, expected)
    try:
        signer = recover(att)
    except Exception:
        signer = "?"
    if problems:
        print(f"FAIL {args.file}: {', '.join(problems)} (recovered {signer}, expected {expected})")
        return 1
    print(f"ok   {args.file}: evidence_hash matches, signed by {signer}")
    return 0


def cmd_hashes(args, cfg: Config) -> int:
    cat = Catalogue.load(cfg.catalogue_path, cfg.overlay_path)
    reg = cfg.registration()
    print(json.dumps({
        "catalogue_version": cat.version,
        "catalogue_status": cat.status,
        "calibration_hash": cat.calibration_hash,
        "overlaid_from_coefficients_v0": cat.overlaid,
        "miner_id": reg.miner_id,
        "device_address": Account.from_key(cfg.device_key()).address,
        "registered_device_address": reg.device_address,
        "sticker_set_hash": sticker_set_hash(reg.sticker_ids),
    }, indent=2))
    return 0


def cmd_keygen(args, cfg: Config) -> int:
    path = cfg.var_dir / "device-key.hex"
    if path.exists() and not args.force:
        print(f"{path} exists (use --force to replace)", file=sys.stderr)
        return 1
    acct = Account.create()
    path.parent.mkdir(parents=True, exist_ok=True)
    path.write_text(acct.key.hex() if acct.key.hex().startswith("0x") else "0x" + acct.key.hex(), encoding="utf-8")
    pub = "0x04" + acct._key_obj.public_key.to_bytes().hex()
    print(json.dumps({"device_address": acct.address, "device_public_key": pub, "key_file": str(path)}, indent=2))
    print("register this address for the miner in chain-market's MinerRegistry", file=sys.stderr)
    return 0


def _load_c1(path: str) -> list[dict]:
    text = Path(path).read_text(encoding="utf-8").strip()
    if text.startswith("["):
        return json.loads(text)
    if text.startswith("{") and "\n{" not in text:
        return [json.loads(text)]
    return [json.loads(line) for line in text.splitlines() if line.strip()]  # JSON Lines


def _listen_c1(cfg: Config, seconds: float) -> list[dict]:
    from .mqtt import Bus, topic
    msgs: list[dict] = []
    bus = Bus(cfg.mqtt_host, cfg.mqtt_port, "minerd-c1check")
    bus.subscribe(topic(cfg.miner_id, "vision"), msgs.append)
    bus.start()
    print(f"listening on {topic(cfg.miner_id, 'vision')} for {seconds:g} s ...", file=sys.stderr)
    time.sleep(seconds)
    bus.stop()
    return msgs


def cmd_c1check(args, cfg: Config) -> int:
    msgs = _listen_c1(cfg, args.seconds) if args.mqtt else _load_c1(args.file)
    if not msgs:
        print("no C1 messages", file=sys.stderr)
        return 1
    engine, _ = build_engine(cfg, args.scenario, seed=1)
    bad, flags, telemetry = 0, set(), None
    for i, msg in enumerate(sorted(msgs, key=lambda m: m.get("ts", 0))):
        errs = contracts.errors("c1-vision-event", msg)
        if msg.get("miner_id") != engine.miner_id:
            errs.append(f"miner_id {msg.get('miner_id')!r} is not {engine.miner_id!r} (message ignored by B)")
        if errs:
            bad += 1
            if bad <= 5:
                print(f"message {i} (ts {msg.get('ts')}): " + "; ".join(errs[:3]))
            continue
        now = msg["ts"]  # replay on the message's own clock
        engine.ingest_vision(msg, now)
        telemetry, _ = engine.tick(now)
        flags.update((f["code"], f.get("tag_id")) for f in telemetry["flags"])
    print(f"{len(msgs)} messages, {bad} rejected")
    if telemetry is None:
        return 1
    registered = set(engine.reg.sticker_ids)
    seen = {p["tag_id"] for p in telemetry["plants"]}
    print(f"\n{'tag':>3}  {'species':<24}{'status':<9}{'conf':>6}{'alive':>7}{'leaf cm2':>10}{'AIR/h':>10}  paid")
    for p in telemetry["plants"]:
        print(f"{p['tag_id']:>3}  {p['species']:<24}{p['status']:<9}{p['species_conf']:>6.2f}{p['alive_score']:>7.2f}"
              f"{p['leaf_area_cm2']:>10.1f}{p['rate_air_per_h']:>10.4f}  {'yes' if p['status'] == 'present' else 'NO'}")
    for tag in sorted(registered - seen):
        print(f"{tag:>3}  {'(never seen present)':<24}{'-':<9}{'':>6}{'':>7}{'':>10}{'':>10}  NO")
    print("\nflags raised: " + (", ".join(f"{c}" + (f"({t})" if t is not None else "") for c, t in sorted(
        flags, key=lambda x: (x[0], x[1] if x[1] is not None else -1))) or "none"))
    paid = sum(1 for p in telemetry["plants"] if p["status"] == "present")
    print(f"B would pay {paid}/{len(registered)} registered plants "
          f"({args.scenario} sensors, simulated); schema-valid: {'yes' if not bad else 'NO'}")
    return 1 if bad else 0


def main(argv: list[str] | None = None) -> int:
    logging.basicConfig(level=logging.INFO, format="%(levelname)s %(name)s: %(message)s")
    p = argparse.ArgumentParser(prog="python -m minerd", description=__doc__,
                                formatter_class=argparse.RawDescriptionHelpFormatter)
    sub = p.add_subparsers(dest="cmd", required=True)

    a = sub.add_parser("attest", help="build and sign one attestation")
    a.add_argument("--mock", action="store_true", help="use the sensor simulator and mock vision")
    a.add_argument("--scenario", default="festival_smog", choices=sorted(SCENARIOS))
    a.add_argument("--epoch", type=int, help="epoch index (default: the last closed epoch)")
    a.add_argument("--seed", type=int, default=None, help="seed for reproducible readings")
    a.add_argument("--drop", type=int, action="append", help="take this tag away 20 s into the epoch")
    a.add_argument("--fake", type=int, action="append", help="make this tag a plastic plant")
    a.add_argument("--out", help="write the C3 attestation here (default: stdout)")
    a.add_argument("--epoch-out", help="also write the matching C2 epoch message here")

    v = sub.add_parser("verify", help="check an attestation's evidence_hash and signature")
    v.add_argument("file")
    v.add_argument("--address", help="expected device address (default: the registered one)")

    sub.add_parser("hashes", help="print calibration_hash, device address, sticker_set_hash")

    k = sub.add_parser("keygen", help="generate a device key")
    k.add_argument("--force", action="store_true")

    c = sub.add_parser("c1check", help="replay C1 vision messages through the tracker and report")
    c.add_argument("file", nargs="?", help="C1 message file: one JSON object, a JSON array, or JSON Lines")
    c.add_argument("--mqtt", action="store_true", help="listen on miner/{id}/vision instead of reading a file")
    c.add_argument("--seconds", type=float, default=30, help="how long to listen with --mqtt")
    c.add_argument("--scenario", default="rush_hour", choices=sorted(SCENARIOS))

    d = sub.add_parser("daemon", help="run the Phase 2 real-time miner")
    d.add_argument("--duration", type=float, default=0, help="stop after N seconds (0 = forever)")
    d.add_argument("--vision-source", choices=("mqtt", "mock"), help="override VISION_SOURCE")
    d.add_argument("--gps-source", help="override GPS_SOURCE (none, gpsd, or serial:PORT)")

    s = sub.add_parser("soak", help="run an accelerated deterministic soak validation")
    s.add_argument("--hours", type=float, default=2.0)

    args = p.parse_args(argv)
    if args.cmd == "c1check" and not (args.file or args.mqtt):
        p.error("c1check needs a FILE or --mqtt")
    cfg = Config.from_env()
    if args.cmd == "daemon":
        if args.vision_source:
            cfg.vision_source = args.vision_source
        if args.gps_source:
            cfg.gps_source = args.gps_source
        from .daemon import run
        return run(cfg, args.duration)
    if args.cmd == "soak":
        from .soak import run
        print(json.dumps(run(args.hours), indent=2))
        return 0
    return {"attest": cmd_attest, "verify": cmd_verify, "hashes": cmd_hashes, "keygen": cmd_keygen,
            "c1check": cmd_c1check}[args.cmd](args, cfg)
