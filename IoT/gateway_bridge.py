"""
YOLO Home — Gateway Bridge (gateway_bridge.py)
================================================
Extends the base Gateway to write data to MySQL via the Node/Express server
running at server/index.js (port 3001).

No FastAPI or db.py needed — Node server handles everything.

Place this file in: YOLOHOME/ (sibling of run.sh, pyproject.toml)

Usage in run.py:
    from gateway_bridge import BridgeGateway as Gateway
"""

import json
import logging
import time
import requests
from typing import Optional

from yolohome.gateway.gateway import Gateway
from yolohome.data_models import ParsedEvent, EventType
from yolohome.config import AppConfig

logger = logging.getLogger("yolohome.bridge")

# Point at the existing Node/Express server
API_BASE = "http://localhost:3001"


def _post(path: str, data: dict, timeout: float = 2.0):
    try:
        r = requests.post(f"{API_BASE}{path}", json=data, timeout=timeout)
        r.raise_for_status()
        return r.json()
    except Exception as e:
        logger.warning(f"Bridge POST {path} — {e}")
        return None


def _get(path: str, params: dict = None, timeout: float = 2.0):
    try:
        r = requests.get(f"{API_BASE}{path}", params=params, timeout=timeout)
        r.raise_for_status()
        return r.json()
    except Exception as e:
        logger.warning(f"Bridge GET {path} — {e}")
        return None


def _patch(path: str, data: dict = None, timeout: float = 2.0):
    try:
        r = requests.patch(f"{API_BASE}{path}", json=data or {}, timeout=timeout)
        r.raise_for_status()
        return r.json()
    except Exception as e:
        logger.warning(f"Bridge PATCH {path} — {e}")
        return None


class BridgeGateway(Gateway):
    """
    Extended Gateway: Adafruit IO (parent) + writes DB via Node server.

    Trong run.py:
        gw = BridgeGateway(config)
        gw.start()
        manager.set_gateway(gw)

        import threading
        threading.Thread(target=gw.poll_controls_loop, daemon=True).start()
    """

    def sync_event(self, event: ParsedEvent):
        super().sync_event(event)   # Adafruit IO as before
        self._sync_to_db(event)     # also write to DB via Node

    def _sync_to_db(self, event: ParsedEvent):

        # ENVIRONMENT → /api/sensors
        if event.event_type == EventType.ENVIRONMENT:
            _post("/api/sensors", {
                "temp":      event.data.get("temperature", 0.0),
                "hum":       event.data.get("humidity", 0.0),
                "light":     event.data.get("light_level", 0),
                "device_id": event.source,
            })

        # FACE_DETECTED → /api/logs  (Node creates alert if ≥ 3 fails / 60s)
        elif event.event_type == EventType.FACE_DETECTED:
            faces   = event.data.get("faces", [])
            label   = faces[0].get("label", "unknown") if faces else "unknown"
            success = label != "unknown"
            latency = int((time.time() - event.timestamp) * 1000)

            _post("/api/logs", {
                "user_name":  label if success else "Unknown",
                "method":     "Face",
                "action":     "Enter",
                "success":    success,
                "latency_ms": latency,
                "fail_reason": None if success else "Face not recognized",
            })

            if success:
                _post("/api/door/state", {"locked": False, "source": "yolobit"})

        # SOUND_DETECTED → /api/logs (only knock/doorbell, skip ambient)
        elif event.event_type == EventType.SOUND_DETECTED:
            sound_type = event.data.get("sound_type", "ambient")
            if sound_type in ("tonal", "impulse"):
                _post("/api/logs", {
                    "user_name": "Unknown",
                    "method":    "Voice" if sound_type == "tonal" else "Knock",
                    "action":    "Attempt",
                    "success":   False,
                })

        # BUTTON_TRIGGER / DOOR_UNLOCK_REQUEST → unlock door + log
        elif event.event_type in (EventType.BUTTON_TRIGGER, EventType.DOOR_UNLOCK_REQUEST):
            _post("/api/door/state", {"locked": False, "source": "yolobit"})
            _post("/api/logs", {
                "user_name": "YOLO:Bit",
                "method":    "Button",
                "action":    "Enter",
                "success":   True,
            })

    def poll_controls_loop(self, interval: float = 1.5):
        """
        Daemon thread — polls GET /api/remote/pending every 1.5s.
        Node server returns the latest pending command (null if none).
        After execution, PATCH /api/remote/:id/ack to acknowledge.
        """
        logger.info(f"Poll loop → {API_BASE}/api/remote/pending")
        while True:
            try:
                ctrl = _get("/api/remote/pending", params={"device": "yolobit"})
                if ctrl:
                    self._execute_control(ctrl)
            except Exception as e:
                logger.error(f"Poll loop error: {e}")
            time.sleep(interval)

    def _execute_control(self, ctrl: dict):
        cmd     = ctrl.get("command")
        ctrl_id = ctrl.get("id")
        payload = ctrl.get("payload") or {}

        if isinstance(payload, str):
            try:
                payload = json.loads(payload)
            except Exception:
                payload = {}

        try:
            if cmd == "fan_speed":
                self.mqtt.publish("yolohome.fan-speed", payload.get("speed", 0))

            elif cmd == "led_color":
                self.mqtt.publish("yolohome.led-color", payload.get("color", "#000000"))

            elif cmd == "lock":
                self.mqtt.publish("yolohome.door-lock", "lock")
                _post("/api/door/state", {"locked": True, "source": "yolobit"})

            elif cmd == "unlock":
                self.mqtt.publish("yolohome.door-lock", "unlock")
                _post("/api/door/state", {"locked": False, "source": "yolobit"})

            _patch(f"/api/remote/{ctrl_id}/ack")
            logger.info(f"Executed & acked: {cmd} (id={ctrl_id})")

        except Exception as e:
            logger.error(f"Execute error (id={ctrl_id}): {e}")