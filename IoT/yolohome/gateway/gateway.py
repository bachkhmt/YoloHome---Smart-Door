"""
IoT Gateway — unified interface for server communication.
All modules talk to Adafruit IO through this class.
"""

import logging
from typing import Callable, Any, Optional
import requests
from yolohome.config import AppConfig, load_config
from yolohome.data_models import FeedUpdate, DeviceCommand, ParsedEvent, EventType
from yolohome.gateway.adafruit_client import AdafruitClient
from yolohome.gateway.mqtt_handler import MQTTHandler

logger = logging.getLogger(__name__)


# Standard feed keys used by YOLOHOME
FEEDS = {
    "temperature": "yolohome.temperature",
    "light": "yolohome.light",
    "face": "yolohome.face-detected",
    "sound": "yolohome.sound-event",
    "door_lock": "yolohome.door-lock",
    "buzzer": "yolohome.buzzer",
    "activity": "yolohome.activity-log",
}


class Gateway:
    """
    Unified IoT gateway used by all modules.

    Provides:
        - publish_sensor_data()  — push parsed events to server
        - send_command()         — control output devices
        - subscribe()            — listen for dashboard commands
        - sync_event()           — push a ParsedEvent to the right feed

    Usage:
        gw = Gateway()           # loads config, auto-detects sim mode
        gw.start()
        gw.sync_event(parsed_event)
        gw.send_command(DeviceCommand("door_lock", "unlock"))
        gw.stop()
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

    # ── Lifecycle ──

    def start(self):
        """Connect MQTT and prepare the gateway."""
        self.mqtt.connect()
        logger.info("Gateway started")

    def stop(self):
        """Disconnect cleanly."""
        self.mqtt.disconnect()
        logger.info("Gateway stopped")

    # ── Push data ──

    def publish(self, feed_key: str, value: Any) -> FeedUpdate:
        """Publish a value to a specific feed via REST."""
        return self.rest.publish(feed_key, value)

    def sync_event(self, event: ParsedEvent):
        """
        Route a ParsedEvent to the appropriate Adafruit IO feed.

        This is the main integration point between Module 1 (input parser)
        and the server. Downstream modules (M2 threshold, M5 dashboard)
        can subscribe to these feeds.
        """
        if event.event_type == EventType.ENVIRONMENT:
            temp = event.data.get("temperature")
            light = event.data.get("light_level")
            if temp is not None:
                self.mqtt.publish(FEEDS["temperature"], temp)
            if light is not None:
                self.mqtt.publish(FEEDS["light"], light)

        elif event.event_type == EventType.FACE_DETECTED:
            self.mqtt.publish(FEEDS["face"], event.data)

        elif event.event_type == EventType.SOUND_DETECTED:
            self.mqtt.publish(FEEDS["sound"], event.data)

        elif event.event_type in (
            EventType.BUTTON_TRIGGER,
            EventType.MOTION_TRIGGER,
            EventType.DOOR_UNLOCK_REQUEST,
        ):
            self.mqtt.publish(
                FEEDS["activity"],
                {"trigger": event.event_type.value, **event.data},
            )

        local_api = "http://localhost:3001/api" # Đảm bảo cổng này khớp với cổng server Node.js chạy
        
        try:
            if event.event_type == EventType.ENVIRONMENT:
                # API /api/sensors yêu cầu: temperature, light_level, sound_level, motion_detected
                payload = {
                    "temperature": event.data.get("temperature", 0),
                    "light_level": event.data.get("light_level", 0),
                    "sound_level": event.data.get("sound_level", 0),
                    "motion_detected": False 
                }
                requests.post(f"{local_api}/sensors", json=payload, timeout=2)

            elif event.event_type == EventType.FACE_DETECTED:
                # Lấy khuôn mặt đầu tiên phát hiện được
                faces = event.data.get("faces", [])
                for face in faces:
                    label = face.get("label", "unknown")
                    conf = face.get("confidence", 0.0)
                    
                    # API /api/logs yêu cầu: user_id, action, status, confidence, image_snapshot
                    log_payload = {
                        "user_id": 1 if label != "unknown" else None, # Tạm gán ID 1 cho người quen
                        "action": "face_detected",
                        "status": "success" if conf > 0.8 else "failed",
                        "confidence": conf,
                        "image_snapshot": None
                    }
                    requests.post(f"{local_api}/logs", json=log_payload, timeout=2)

            elif event.event_type in (EventType.MOTION_TRIGGER, EventType.SOUND_DETECTED):
                # Lưu log khi có âm thanh hoặc chuyển động bất thường
                log_payload = {
                    "user_id": None,
                    "action": f"{event.event_type.value}_alert",
                    "status": "warning",
                    "confidence": event.confidence,
                    "image_snapshot": None
                }
                requests.post(f"{local_api}/logs", json=log_payload, timeout=2)
                
        except requests.exceptions.RequestException as e:
            logger.warning(f"Không thể kết nối với Node.js Local Server: {e}")

    # ── Receive commands ──

    def subscribe(self, feed_key: str, callback: Callable[[FeedUpdate], None]):
        """Subscribe to a feed for incoming commands."""
        self.mqtt.subscribe(feed_key, callback)

    def on_door_command(self, callback: Callable[[FeedUpdate], None]):
        """Convenience: subscribe to door lock commands."""
        self.subscribe(FEEDS["door_lock"], callback)

    # ── Send commands ──

    def send_command(self, cmd: DeviceCommand):
        """
        Send a command to an output device via the server.
        The device reads the feed value and acts accordingly.
        """
        feed = FEEDS.get(cmd.device_id)
        if feed:
            self.mqtt.publish(feed, cmd.action)
            logger.info(
                f"Command sent: {cmd.device_id} -> {cmd.action}"
            )
        else:
            logger.warning(
                f"Unknown device_id '{cmd.device_id}', "
                f"known: {list(FEEDS.keys())}"
            )
