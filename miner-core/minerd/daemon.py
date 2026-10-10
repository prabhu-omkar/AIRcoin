"""Real-time miner daemon: C1 + sensors -> C2 telemetry + queued C3 attestations."""

from __future__ import annotations

import logging
import signal
import time

from . import contracts
from .catalogue import Catalogue
from .config import Config
from .engine import Engine
from .gps import make_gps
from .mqtt import Bus, topic
from .signer import Signer
from .uplink import UplinkQueue
from simulator.plants import MockVision
from simulator.scenarios import SensorSimulator
from controller import ControllerServer, ControllerState

log = logging.getLogger(__name__)


def run(cfg: Config, duration_s: float = 0) -> int:
    reg = cfg.registration()
    cat = Catalogue.load(cfg.catalogue_path, cfg.overlay_path)
    engine = Engine(reg, cat, SensorSimulator(cfg.scenario), make_gps(cfg.gps_source, reg.lat, reg.lon))
    signer = Signer(cfg.device_key())
    bus = Bus(cfg.mqtt_host, cfg.mqtt_port, "minerd")
    t_vision = topic(reg.miner_id, "vision")
    t_telemetry = topic(reg.miner_id, "telemetry")
    t_epoch = topic(reg.miner_id, "epoch")

    def publish_epoch(epoch_doc: dict, att_status: dict) -> None:
        doc = dict(epoch_doc)
        doc["attestation"] = att_status
        errs = contracts.errors("c2-epoch", doc)
        if errs:
            log.error("refusing invalid C2 epoch: %s", errs)
            return
        bus.publish(t_epoch, doc, qos=1, retain=True)

    uplink = UplinkQueue(cfg.db_path, cfg.validator_url, publish_epoch).start()

    def replay_epochs() -> None:
        messages = uplink.epoch_messages()
        for doc in messages:
            bus.publish(t_epoch, doc, qos=1, retain=True)
        if messages:
            log.info("replayed %s persisted C2 epochs after MQTT connection", len(messages))

    bus.on_connect(replay_epochs)
    mock_vision = MockVision(reg.miner_id, reg.sticker_ids) if cfg.vision_source == "mock" else None
    controller_state = ControllerState(
        engine.sensors, mock_vision, engine.gps, uplink, bus, cfg.validator_url, cfg.chain_rpc_url
    )
    controller = ControllerServer(controller_state, cfg.controller_port).start()

    if mock_vision is None:
        def ingest(msg: dict) -> None:
            errs = contracts.errors("c1-vision-event", msg)
            if errs:
                log.warning("discarding invalid C1: %s", errs[:3])
                return
            engine.ingest_vision(msg, int(time.time() * 1000))
        bus.subscribe(t_vision, ingest)

    bus.start()
    stopping = False

    def stop(*_args) -> None:
        nonlocal stopping
        stopping = True

    signal.signal(signal.SIGINT, stop)
    signal.signal(signal.SIGTERM, stop)
    started = time.monotonic()
    log.info("minerd started: vision=%s gps=%s validator=%s", cfg.vision_source, cfg.gps_source,
             cfg.validator_url)
    log.info("scenario controller: http://localhost:%s", cfg.controller_port)
    try:
        while not stopping and (not duration_s or time.monotonic() - started < duration_s):
            tick_started = time.monotonic()
            now = int(time.time() * 1000)
            if mock_vision is not None:
                engine.ingest_vision(mock_vision.message(now), now)
            telemetry, closed = engine.tick(now)
            telemetry["uplink"] = uplink.status()
            controller_state.update(telemetry)
            errs = contracts.errors("c2-telemetry", telemetry)
            if errs:
                log.error("refusing invalid C2 telemetry: %s", errs)
            else:
                bus.publish(t_telemetry, telemetry, qos=0)

            if closed is not None:
                att = signer.sign(closed.c3_unsigned(cat.calibration_hash))
                errs = contracts.errors("c3-attestation", att)
                if errs:
                    log.error("refusing invalid C3 attestation: %s", errs)
                else:
                    queued = {"status": "queued", "evidence_hash": att["evidence_hash"],
                              "amount": att["amount"]}
                    epoch_doc = closed.c2_epoch(queued)
                    if uplink.enqueue(att, epoch_doc):
                        publish_epoch(epoch_doc, queued)
                        log.info("epoch %s closed: %s AIR queued", closed.epoch, closed.total_air)

            wait = 1.0 - (time.monotonic() - tick_started)
            if wait > 0:
                time.sleep(wait)
    finally:
        controller.stop()
        uplink.stop()
        bus.stop()
    return 0
