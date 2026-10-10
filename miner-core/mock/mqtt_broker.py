"""Small local MQTT 3.1.1 broker used when Docker/Mosquitto is unavailable.

It intentionally implements the demo subset: CONNECT, exact/+/# subscriptions, retained
PUBLISH, QoS 0/1, PUBACK, PING and DISCONNECT. Production deployments should use Mosquitto.
"""

from __future__ import annotations

import asyncio
import logging

log = logging.getLogger("mqtt-broker")


async def read_remaining(reader: asyncio.StreamReader) -> int:
    value, multiplier = 0, 1
    while True:
        byte = (await reader.readexactly(1))[0]
        value += (byte & 127) * multiplier
        if not byte & 128:
            return value
        multiplier *= 128
        if multiplier > 128**3:
            raise ValueError("malformed MQTT remaining length")


def remaining(value: int) -> bytes:
    out = bytearray()
    while True:
        byte = value % 128
        value //= 128
        out.append(byte | (128 if value else 0))
        if not value:
            return bytes(out)


def mqtt_string(value: str) -> bytes:
    encoded = value.encode()
    return len(encoded).to_bytes(2, "big") + encoded


def take_string(payload: bytes, offset: int) -> tuple[str, int]:
    size = int.from_bytes(payload[offset:offset + 2], "big")
    offset += 2
    return payload[offset:offset + size].decode(), offset + size


def matches(pattern: str, name: str) -> bool:
    pattern_parts, name_parts = pattern.split("/"), name.split("/")
    for index, part in enumerate(pattern_parts):
        if part == "#":
            return True
        if index >= len(name_parts) or (part != "+" and part != name_parts[index]):
            return False
    return len(pattern_parts) == len(name_parts)


class Broker:
    def __init__(self):
        self.clients: dict[asyncio.StreamWriter, set[str]] = {}
        self.retained: dict[str, bytes] = {}
        self.packet_id = 0

    def next_packet_id(self) -> int:
        self.packet_id = self.packet_id % 65535 + 1
        return self.packet_id

    async def send_publish(self, writer: asyncio.StreamWriter, name: str, payload: bytes,
                           qos: int = 0, retain_flag: bool = False) -> None:
        header = 0x30 | (qos << 1) | int(retain_flag)
        body = mqtt_string(name)
        if qos:
            body += self.next_packet_id().to_bytes(2, "big")
        body += payload
        writer.write(bytes([header]) + remaining(len(body)) + body)
        await writer.drain()

    async def publish(self, name: str, payload: bytes, retain_flag: bool) -> None:
        if retain_flag:
            if payload:
                self.retained[name] = payload
            else:
                self.retained.pop(name, None)
        dead = []
        for writer, subscriptions in list(self.clients.items()):
            if any(matches(pattern, name) for pattern in subscriptions):
                try:
                    await self.send_publish(writer, name, payload)
                except (ConnectionError, asyncio.CancelledError):
                    dead.append(writer)
        for writer in dead:
            self.clients.pop(writer, None)

    async def client(self, reader: asyncio.StreamReader, writer: asyncio.StreamWriter) -> None:
        self.clients[writer] = set()
        peer = writer.get_extra_info("peername")
        try:
            while True:
                fixed = await reader.readexactly(1)
                packet_type, flags = fixed[0] >> 4, fixed[0] & 0x0F
                payload = await reader.readexactly(await read_remaining(reader))
                if packet_type == 1:  # CONNECT
                    writer.write(b"\x20\x02\x00\x00")
                    await writer.drain()
                elif packet_type == 8:  # SUBSCRIBE
                    packet_id, offset = payload[:2], 2
                    granted = []
                    new_patterns = []
                    while offset < len(payload):
                        pattern, offset = take_string(payload, offset)
                        requested_qos = payload[offset]
                        offset += 1
                        self.clients[writer].add(pattern)
                        new_patterns.append(pattern)
                        granted.append(min(requested_qos, 1))
                    body = packet_id + bytes(granted)
                    writer.write(b"\x90" + remaining(len(body)) + body)
                    await writer.drain()
                    for name, retained_payload in self.retained.items():
                        if any(matches(pattern, name) for pattern in new_patterns):
                            await self.send_publish(writer, name, retained_payload, retain_flag=True)
                elif packet_type == 3:  # PUBLISH
                    name, offset = take_string(payload, 0)
                    qos = (flags >> 1) & 0x03
                    packet_id = payload[offset:offset + 2] if qos else b""
                    if qos:
                        offset += 2
                    await self.publish(name, payload[offset:], bool(flags & 1))
                    if qos == 1:
                        writer.write(b"\x40\x02" + packet_id)
                        await writer.drain()
                elif packet_type == 12:  # PINGREQ
                    writer.write(b"\xd0\x00")
                    await writer.drain()
                elif packet_type == 14:  # DISCONNECT
                    break
                elif packet_type in (4,):  # PUBACK
                    continue
                else:
                    log.debug("ignoring MQTT packet type %s from %s", packet_type, peer)
        except (asyncio.IncompleteReadError, ConnectionError):
            pass
        finally:
            self.clients.pop(writer, None)
            writer.close()
            await writer.wait_closed()


async def serve(host: str = "0.0.0.0", port: int = 1883) -> None:
    broker = Broker()
    server = await asyncio.start_server(broker.client, host, port)
    log.info("fallback MQTT broker listening on %s:%s", host, port)
    async with server:
        await server.serve_forever()


def main() -> None:
    logging.basicConfig(level=logging.INFO, format="%(levelname)s %(name)s: %(message)s")
    try:
        asyncio.run(serve())
    except KeyboardInterrupt:
        pass


if __name__ == "__main__":
    main()
