"""Build and publish C1 vision events (contracts-schema/schemas/c1-vision-event.schema.json).

Topic: miner/{miner_id}/vision, QoS 0, ~1 message/s.
"""

import hashlib
import json
from urllib.parse import urlparse


def frame_hash(frame):
    """sha256 of the raw frame bytes, 0x-prefixed."""
    return "0x" + hashlib.sha256(frame.tobytes() if hasattr(frame, "tobytes") else bytes(frame)).hexdigest()


def topic(miner_id):
    return f"miner/{miner_id}/vision"


def plant_entry(tag_id, species, status, species_conf, leaf_area_cm2, alive_score, bbox, last_seen_ts=None, ndvi=None):
    entry = {
        "tag_id": int(tag_id),
        "species": species,
        "species_conf": round(min(1.0, max(0.0, float(species_conf))), 3),
        "leaf_area_cm2": round(max(0.0, float(leaf_area_cm2)), 1),
        "alive_score": round(min(1.0, max(0.0, float(alive_score))), 3),
        "bbox": [int(v) for v in bbox] if bbox is not None else None,
        "status": status,
    }
    if ndvi is not None:
        entry["ndvi"] = round(min(1.0, max(-1.0, float(ndvi))), 3)
    if last_seen_ts is not None:
        entry["last_seen_ts"] = int(last_seen_ts)
    return entry


def build_message(miner_id, ts_ms, fhash, plants, frame_size=None, unknown_tag_ids=(), source="pi_camera"):
    msg = {
        "v": 1,
        "miner_id": miner_id,
        "ts": int(ts_ms),
        "frame_hash": fhash,
        "plants": sorted(plants, key=lambda p: p["tag_id"]),
        "unknown_tag_ids": sorted(set(int(t) for t in unknown_tag_ids)),
        "source": source,
    }
    if frame_size:
        msg["frame_size"] = {"w": int(frame_size[0]), "h": int(frame_size[1])}
    return msg


class Publisher:
    """MQTT publisher (paho-mqtt 2.x), or stdout when url is '-'."""

    def __init__(self, url):
        self.client = None
        if url == "-":
            return
        import paho.mqtt.client as mqtt

        u = urlparse(url)
        self.client = mqtt.Client(mqtt.CallbackAPIVersion.VERSION2, client_id="", protocol=mqtt.MQTTv311)
        if u.username:
            self.client.username_pw_set(u.username, u.password)
        self.client.connect(u.hostname or "localhost", u.port or 1883, keepalive=30)
        self.client.loop_start()

    def publish(self, msg):
        payload = json.dumps(msg, separators=(",", ":"))
        if self.client is None:
            print(payload, flush=True)
        else:
            self.client.publish(topic(msg["miner_id"]), payload, qos=0)

    def close(self):
        if self.client is not None:
            self.client.loop_stop()
            self.client.disconnect()
