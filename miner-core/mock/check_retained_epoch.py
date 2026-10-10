"""Exit successfully only when MQTT supplies a valid retained C2 epoch."""

from __future__ import annotations

import json
import threading

import paho.mqtt.client as mqtt

from minerd import contracts
from minerd.config import Config
from minerd.mqtt import topic


def main() -> None:
    cfg = Config.from_env()
    received = threading.Event()
    errors: list[str] = []
    client = mqtt.Client(mqtt.CallbackAPIVersion.VERSION2, client_id="retained-epoch-check")

    def connected(c, userdata, flags, reason_code, properties):
        if reason_code.is_failure:
            errors.append(str(reason_code))
            received.set()
        else:
            c.subscribe(topic(cfg.miner_id, "epoch"), qos=1)

    def message(c, userdata, msg):
        try:
            doc = json.loads(msg.payload)
            errors.extend(contracts.errors("c2-epoch", doc))
            if not msg.retain:
                errors.append("epoch message was not retained")
        except Exception as exc:
            errors.append(str(exc))
        finally:
            received.set()

    client.on_connect = connected
    client.on_message = message
    client.connect(cfg.mqtt_host, cfg.mqtt_port, 10)
    client.loop_start()
    try:
        if not received.wait(10):
            raise SystemExit("no retained C2 epoch received within 10 seconds")
        if errors:
            raise SystemExit("invalid retained C2 epoch: " + "; ".join(errors))
        print("valid retained C2 epoch received")
    finally:
        client.disconnect()
        client.loop_stop()


if __name__ == "__main__":
    main()
