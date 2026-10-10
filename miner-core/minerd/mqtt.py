"""Thin paho-mqtt wrapper: JSON publish/subscribe on the shared Mosquitto broker."""

from __future__ import annotations

import json
import logging
import uuid
from typing import Callable

import paho.mqtt.client as mqtt

log = logging.getLogger(__name__)


def topic(miner_id: str, kind: str) -> str:
    return f"miner/{miner_id}/{kind}"


class Bus:
    def __init__(self, host: str, port: int, client_id: str):
        self.client = mqtt.Client(mqtt.CallbackAPIVersion.VERSION2,
                                  client_id=f"{client_id}-{uuid.uuid4().hex[:6]}")
        self.client.on_connect = self._on_connect
        self.client.on_message = self._on_message
        self._subs: dict[str, Callable[[dict], None]] = {}
        self._connect_handlers: list[Callable[[], None]] = []
        self.host, self.port = host, port

    @property
    def connected(self) -> bool:
        return self.client.is_connected()

    def start(self) -> "Bus":
        self.client.connect_async(self.host, self.port, keepalive=30)
        self.client.loop_start()
        return self

    def stop(self) -> None:
        self.client.loop_stop()
        self.client.disconnect()

    def _on_connect(self, client, userdata, flags, reason_code, properties):
        if reason_code.is_failure:
            log.error("MQTT connect to %s:%s failed: %s", self.host, self.port, reason_code)
            return
        log.info("MQTT connected to %s:%s", self.host, self.port)
        for t in self._subs:
            client.subscribe(t, qos=1)
        for handler in self._connect_handlers:
            try:
                handler()
            except Exception:
                log.exception("MQTT reconnect handler failed")

    def _on_message(self, client, userdata, msg):
        handler = self._subs.get(msg.topic)
        if handler is None:
            return
        try:
            handler(json.loads(msg.payload))
        except Exception:
            log.exception("bad message on %s", msg.topic)

    def subscribe(self, t: str, handler: Callable[[dict], None]) -> None:
        self._subs[t] = handler
        if self.client.is_connected():
            self.client.subscribe(t, qos=1)

    def on_connect(self, handler: Callable[[], None]) -> None:
        """Run a handler after every connection, including automatic reconnects."""
        self._connect_handlers.append(handler)

    def publish(self, t: str, doc: dict, qos: int = 0, retain: bool = False) -> None:
        self.client.publish(t, json.dumps(doc, separators=(",", ":")), qos=qos, retain=retain)
