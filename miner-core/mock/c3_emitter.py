"""Mock C3 emitter for chain-market: signed attestations to print or POST to a validator.

    python -m mock.c3_emitter                                  # print one attestation
    python -m mock.c3_emitter --post http://localhost:3001     # POST /v1/attestations
    python -m mock.c3_emitter --post ... --tamper amount       # expect bad_signature
    python -m mock.c3_emitter --post ... --count 5 --interval 60

Each attestation is the last closed epoch at send time, built from mock inputs and signed with
the miner's device key, so a validator on the local chain should accept it.
"""

from __future__ import annotations

import argparse
import json
import logging
import time

import httpx

from minerd.config import EPOCH_MS, Config
from minerd.mockrun import build_engine, run_epoch
from minerd.signer import Signer
from simulator.scenarios import SCENARIOS

TAMPER = {
    "amount": lambda a: a.update(amount=str(int(a["amount"]) * 10)),
    "epoch": lambda a: a.update(epoch=a["epoch"] - 1),
    "plant": lambda a: a["plants"][0].update(air=a["plants"][0]["air"] + 1),
    "gps": lambda a: a["gps"].update(lat=a["gps"]["lat"] + 0.01),
    "signature": lambda a: a.update(signature=a["signature"][:10] + ("0" if a["signature"][10] != "0" else "1")
                                    + a["signature"][11:]),
}


def build(cfg: Config, scenario: str, epoch: int, tamper: str | None) -> dict:
    engine, vision = build_engine(cfg, scenario)
    result = run_epoch(engine, vision, epoch)
    att = Signer(cfg.device_key()).sign(result.c3_unsigned(engine.cat.calibration_hash))
    if tamper:
        TAMPER[tamper](att)
    return att


def main() -> None:
    p = argparse.ArgumentParser(description=__doc__, formatter_class=argparse.RawDescriptionHelpFormatter)
    p.add_argument("--scenario", default="festival_smog", choices=sorted(SCENARIOS))
    p.add_argument("--post", metavar="VALIDATOR_URL", help="POST to {url}/v1/attestations instead of printing")
    p.add_argument("--tamper", choices=sorted(TAMPER), help="break one field after signing")
    p.add_argument("--count", type=int, default=1)
    p.add_argument("--interval", type=float, default=60, help="seconds between attestations")
    args = p.parse_args()
    logging.basicConfig(level=logging.WARNING, format="%(levelname)s %(name)s: %(message)s")
    cfg = Config.from_env()

    for i in range(args.count):
        if i:
            time.sleep(args.interval)
        epoch = int(time.time() * 1000) // EPOCH_MS - 1
        att = build(cfg, args.scenario, epoch, args.tamper)
        if not args.post:
            print(json.dumps(att, indent=2))
            continue
        url = args.post.rstrip("/") + "/v1/attestations"
        try:
            r = httpx.post(url, json=att, timeout=30)
            print(f"epoch {epoch} amount {att['amount']} -> HTTP {r.status_code} {r.text}")
        except httpx.HTTPError as e:
            print(f"epoch {epoch} -> {url} unreachable: {e}")


if __name__ == "__main__":
    main()
