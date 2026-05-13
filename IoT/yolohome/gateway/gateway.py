"""
IoT Gateway — unified interface for server communication.

FIXED: Publish door state to Adafruit on successful lock/unlock.
"""

import json
import logging
import time
from typing import Callable, Any, Optional

import requests

from yolohome.config import AppConfig, load_config
from yolohome.data_models import FeedUpdate, DeviceCommand, ParsedEvent, EventType
from yolohome.gateway.adafruit_client import AdafruitClient
from yolohome.gateway.mqtt_handler import MQTTHandler

logger = logging.getLogger(__name__)

LOCAL_API = "http://localhost:3001/api"

FEEDS = {
    "temperature":  "yolohome.temperature",
    "light":        "yolohome.light",
    "sound":        "yolohome.sound-event",
    "face":         "yolohome.face-detected",
    "door_lock":    "yolohome.door-lock",
    "buzzer":       "yolohome.buzzer",
    "activity":     "yolohome.activity-log",
    "auth_trigger": "yolohome.auth-trigger",
}


class Gateway:
    """
    Unified IoT gateway — all modules communicate with the server through this class.

    Public API:
        start()               — connect MQTT + subscribe all feeds
        stop()                — disconnect
        sync_event(event)     — Python/AI module sends ParsedEvent here
        send_command(cmd)     — control output devices
        subscribe(feed, cb)   — listen to any feed
        publish(feed, val)    — publish directly to Adafruit via REST

        set_auth_callback(cb) — register callback for INSTANT trigger from UI
    """

    def __init__(self, config: Optional[AppConfig] = None):
        self.config = config or load_config()
        ada = self.config.adafruit
        sim = self.config.use_simulator

        self.rest = AdafruitClient(
            username=ada.username,
            aio_key=ada.aio_key,
            use_simulator=sim,
        )
        self.mqtt = MQTTHandler(
            username=ada.username,
            aio_key=ada.aio_key,
            host=ada.mqtt_host,
            port=ada.mqtt_port,
            use_simulator=sim,
        )

        self._auth_callback: Optional[Callable[[], None]] = None

    # ══════════════════════════════════════════════════════
    # Lifecycle
    # ══════════════════════════════════════════════════════

    def start(self):
        """Connect MQTT and subscribe to all required feeds."""
        self.mqtt.connect()

        # Flow A: environmental sensors from real hardware
        self.subscribe(FEEDS["temperature"], self._on_sensor_update)
        self.subscribe(FEEDS["light"],       self._on_sensor_update)
        self.subscribe(FEEDS["sound"],       self._on_sensor_update)

        # Flow B: face recognition results
        self.subscribe(FEEDS["face"],        self._on_face_update)

        # Flow C: commands from Adafruit Dashboard / Frontend
        self.subscribe(FEEDS["door_lock"],   self._on_door_command_from_cloud)

        # Flow D: INSTANT trigger from React UI "Authenticate" button
        self.subscribe(FEEDS["auth_trigger"], self._on_auth_trigger)

        logger.info("Gateway started — subscribed to all feeds")

    def stop(self):
        self.mqtt.disconnect()
        logger.info("Gateway stopped")

    # ══════════════════════════════════════════════════════
    # Flow A: Hardware → Adafruit → Python → Node.js
    # ══════════════════════════════════════════════════════

    def _on_sensor_update(self, update: FeedUpdate):
        feed_key = update.feed_key
        raw = update.value

        logger.info(f"[DEVICE→ADA→PY] Sensor [{feed_key}]: {raw}")

        try:
            value = float(raw)
        except (ValueError, TypeError):
            logger.warning(f"Invalid value from {feed_key}: {raw!r}")
            return

        FEED_TO_FIELD = {
            FEEDS["temperature"]: "temp",
            FEEDS["light"]:        "light",
            FEEDS["sound"]:        "sound_level",
        }
        field = FEED_TO_FIELD.get(feed_key)
        if field:
            self._post_to_nodejs("/sensors", {field: value})

    # ══════════════════════════════════════════════════════
    # Flow B: Camera AI → Adafruit → Python → Node.js
    # ══════════════════════════════════════════════════════

    def _on_face_update(self, update: FeedUpdate):
        """
        Process recognition results — called after BOTH detection types:
          • Auto detect from continuous loop
          • Instant detect from UI trigger

        FIXED: Auto-unlock door if known person recognized,
               and PUBLISH "UNLOCK" state to Adafruit.
        """
        logger.info(f"[ADA→PY] Face update: {update.value}")

        try:
            data = json.loads(update.value)
        except (json.JSONDecodeError, TypeError):
            logger.warning(f"Invalid face update payload: {update.value!r}")
            return

        label      = data.get("label", "unknown")
        is_known   = data.get("known", False)
        confidence = data.get("confidence", 0.0)

        # Log to Node.js for React AccessLog + ActivityChart display
        self._post_to_nodejs("/logs", {
            "user_id":     data.get("user_id"),
            "user_name":   label,
            "method":      "Face",
            "action":      "Enter",
            "success":     1 if is_known else 0,
            "fail_reason": None if is_known else "Stranger",
            "latency_ms":  None,
            "ip_address":  None,
        })

        # Auto-unlock door if known person recognized
        if is_known:
            logger.info(f"🔓 Hello {label}! Unlocking door...")
            
            # MAIN FIX: Publish door state to Adafruit
            self.mqtt.publish(FEEDS["door_lock"], "UNLOCK")
            logger.info("📤 [PY→ADA] Published door state: UNLOCK")

    # ══════════════════════════════════════════════════════
    # Flow C: Adafruit Dashboard / Frontend → Python → Hardware
    # ══════════════════════════════════════════════════════

    def _on_door_command_from_cloud(self, update: FeedUpdate):
        """
        Receive UNLOCK/LOCK commands from Frontend (via Adafruit).
        
        Flow:
          1. Frontend publishes "UNLOCK" to yolohome.door-lock
          2. Python receives it here
          3. Controls hardware (ESP32-CAM flash LED)
        """
        action = update.value.strip().upper()
        logger.info(f"[CLOUD→PY] Door command from Frontend/Dashboard: {action}")

        # Control ESP32-CAM flash LED
        if action == "UNLOCK":
            logger.info("🔓 Unlocking (Flash ON)...")
            try:
                requests.get("http://192.168.1.131/control?var=led_intensity&val=10", timeout=1)
                logger.info("Flash LED ON")
            except Exception as e:
                logger.error(f"❌ Device control error: {e}")
                
        elif action == "LOCK":
            logger.info("🔒 Locking (Flash OFF)...")
            try:
                requests.get("http://192.168.1.131/control?var=led_intensity&val=0", timeout=1)
                logger.info("Flash LED OFF")
            except Exception as e:
                logger.error(f"❌ Device control error: {e}")

        # Log to Node.js
        self._post_to_nodejs("/logs", {
            "user_id":     None,
            "user_name":   "Dashboard",
            "method":      "Manual",
            "action":      f"door_{action.lower()}",
            "success":     1,
            "fail_reason": None,
            "latency_ms":  None,
            "ip_address":  None,
        })

    # ══════════════════════════════════════════════════════
    # Flow D: React UI button → INSTANT detect
    # ══════════════════════════════════════════════════════

    def _on_auth_trigger(self, update: FeedUpdate):
        """
        Callback when receiving INSTANT trigger from React UI.

        Note: Camera continues auto-detecting via its loop.
        This callback only triggers one additional IMMEDIATE detection
        when the user clicks the button — independent of the main loop.
        """
        logger.info(f"[UI→ADA→PY] 🔔 Received instant trigger: {update.value}")

        if self._auth_callback:
            try:
                self._auth_callback()
            except Exception as e:
                logger.error(f"Auth callback error: {e}", exc_info=True)
        else:
            logger.warning(
                "⚠️ Received instant trigger but no callback registered\n"
                "   → Call gateway.set_auth_callback() to register"
            )

    def set_auth_callback(self, callback: Callable[[], None]):
        """
        Register callback for INSTANT trigger from UI "Authenticate" button.

        This callback runs in parallel with the auto detect loop —
        camera keeps running, this is just an additional instant detection.

        Callback should:
          1. Run in a separate thread (don't block MQTT)
          2. Use lock if sharing camera with auto loop

        Example:
            def on_instant_trigger():
                # Run in separate thread, share lock with auto loop
                with detect_lock:
                    frame = camera.capture_once()
                    result = face_parser.parse(frame)
                    gateway.sync_event(result)

            gateway.set_auth_callback(on_instant_trigger)
        """
        self._auth_callback = callback
        logger.info("Instant auth trigger callback registered")

    # ══════════════════════════════════════════════════════
    # sync_event — Python/AI modules call here
    # ══════════════════════════════════════════════════════

    def sync_event(self, event: ParsedEvent):
        if event.event_type == EventType.ENVIRONMENT:
            self._sync_environment(event)
        elif event.event_type == EventType.FACE_DETECTED:
            self._sync_face_detected(event)
        elif event.event_type == EventType.SOUND_DETECTED:
            self._sync_sound(event)
        elif event.event_type in (
            EventType.BUTTON_TRIGGER,
            EventType.MOTION_TRIGGER,
            EventType.DOOR_UNLOCK_REQUEST,
        ):
            self._sync_trigger(event)

    def _sync_environment(self, event: ParsedEvent):
        temp  = event.data.get("temperature")
        light = event.data.get("light_level")
        sound = event.data.get("sound_level")

        if temp  is not None: self.mqtt.publish(FEEDS["temperature"], temp)
        if light is not None: self.mqtt.publish(FEEDS["light"], light)
        if sound is not None: self.mqtt.publish(FEEDS["sound"], sound)

    def _sync_face_detected(self, event: ParsedEvent):
        faces = event.data.get("faces", [])

        if not faces:
            self.mqtt.publish(FEEDS["face"], json.dumps({
                "label": "none", "known": False, "confidence": 0.0,
                "user_id": None, "snapshot": None, "timestamp": time.time(),
            }))
            return

        for face in faces:
            label    = face.get("label", "unknown")
            is_known = label not in ("unknown", "Stranger")
            self.mqtt.publish(FEEDS["face"], json.dumps({
                "label":      label,
                "known":      is_known,
                "confidence": face.get("confidence", event.confidence),
                "user_id":    face.get("user_id"),
                "snapshot":   face.get("snapshot"),
                "timestamp":  time.time(),
            }))

    def _sync_sound(self, event: ParsedEvent):
        self.mqtt.publish(FEEDS["sound"], event.data)
        self._post_to_nodejs("/logs", {
            "user_id": None, "user_name": "System", "method": "Sound",
            "action": "sound_alert", "success": 0,
            "fail_reason": "Abnormal sound",
            "latency_ms": None, "ip_address": None,
        })

    def _sync_trigger(self, event: ParsedEvent):
        self.mqtt.publish(FEEDS["activity"], {
            "trigger": event.event_type.value, "timestamp": time.time(),
            **event.data,
        })
        self._post_to_nodejs("/logs", {
            "user_id": None, "user_name": "System", "method": "Trigger",
            "action": f"{event.event_type.value}", "success": 1,
            "fail_reason": None, "latency_ms": None, "ip_address": None,
        })

    # ══════════════════════════════════════════════════════
    # Subscribe / Publish / Command
    # ══════════════════════════════════════════════════════

    def subscribe(self, feed_key: str, callback: Callable[[FeedUpdate], None]):
        self.mqtt.subscribe(feed_key, callback)

    def on_door_command(self, callback: Callable[[FeedUpdate], None]):
        """DEPRECATED: Use subscribe() directly."""
        self.subscribe(FEEDS["door_lock"], callback)

    def send_command(self, cmd: DeviceCommand):
        feed = FEEDS.get(cmd.device_id)
        if feed:
            self.mqtt.publish(feed, cmd.action)
            logger.info(f"[PY→ADA→DEVICE] {cmd.device_id} → {cmd.action}")
        else:
            logger.warning(
                f"Device not found:  '{cmd.device_id}'. "
                f"Valid: {list(FEEDS.keys())}"
            )

    def publish(self, feed_key: str, value: Any) -> FeedUpdate:
        return self.rest.publish(feed_key, value)

    # ══════════════════════════════════════════════════════
    # Internal helper
    # ══════════════════════════════════════════════════════

    def _post_to_nodejs(self, endpoint: str, payload: dict):
        url = f"{LOCAL_API}{endpoint}"
        try:
            resp = requests.post(url, json=payload, timeout=2)
            resp.raise_for_status()
            logger.debug(f"[PY→NODE] POST {endpoint} {resp.status_code}")
        except requests.exceptions.ConnectionError:
            logger.warning(f"Node.js not running — POST {endpoint} failed")
        except requests.exceptions.Timeout:
            logger.warning(f"POST {endpoint} timeout (>2s)")
        except requests.exceptions.HTTPError as e:
            logger.error(f"Node.js HTTP error at {endpoint}: {e}")
        except requests.exceptions.RequestException as e:
            logger.error(f"POST error {endpoint}: {e}")