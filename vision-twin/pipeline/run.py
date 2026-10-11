from __future__ import annotations

import argparse
import json
import os
import time

import cv2
import paho.mqtt.client as mqtt

from .engine import VisionEngine


def main() -> None:
    parser = argparse.ArgumentParser(description="Publish camera frames as AIRcoin C1 vision events")
    parser.add_argument("--camera", default="0", help="camera index or video path")
    parser.add_argument("--miner-id", default=os.getenv("MINER_ID", "miner-001"))
    parser.add_argument("--mqtt-host", default=os.getenv("MQTT_HOST", "localhost"))
    parser.add_argument("--mqtt-port", type=int, default=int(os.getenv("MQTT_PORT", "1883")))
    parser.add_argument("--source", choices=["pi_camera", "laptop_camera", "recorded"], default="laptop_camera")
    parser.add_argument("--preview", action="store_true")
    parser.add_argument("--count", type=int, default=0)
    args = parser.parse_args()

    camera: int | str = int(args.camera) if args.camera.isdigit() else args.camera
    capture = cv2.VideoCapture(camera)
    if not capture.isOpened():
        raise SystemExit(f"could not open camera/video: {args.camera}")
    engine = VisionEngine(args.miner_id)
    client = mqtt.Client(mqtt.CallbackAPIVersion.VERSION2, client_id="vision-twin-c1")
    client.connect(args.mqtt_host, args.mqtt_port)
    client.loop_start()
    topic = f"miner/{args.miner_id}/vision"
    sent = 0
    try:
        while not args.count or sent < args.count:
            started = time.monotonic()
            ok, frame = capture.read()
            if not ok:
                if isinstance(camera, str):
                    capture.set(cv2.CAP_PROP_POS_FRAMES, 0)
                    continue
                break
            message = engine.process(frame, int(time.time() * 1000), args.source)
            client.publish(topic, json.dumps(message, separators=(",", ":")), qos=0)
            print(json.dumps({"ts": message["ts"], "seen": sum(p["bbox"] is not None for p in message["plants"]), "unknown": message["unknown_tag_ids"]}))
            sent += 1
            if args.preview:
                cv2.aruco.drawDetectedMarkers(frame, *engine.detector.detectMarkers(frame)[:2])
                cv2.imshow("AIRcoin vision", frame)
                if cv2.waitKey(1) & 0xFF == 27:
                    break
            time.sleep(max(0, 1.0 - (time.monotonic() - started)))
    finally:
        capture.release()
        client.loop_stop()
        client.disconnect()
        cv2.destroyAllWindows()


if __name__ == "__main__":
    main()

