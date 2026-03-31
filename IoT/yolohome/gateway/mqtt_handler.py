"""
MQTT handler for Adafruit IO.
Real-time pub/sub for sensor data and device commands.
"""

import json
import logging
import time
import threading
from typing import Callable, Dict, List, Optional, Any

from yolohome.data_models import FeedUpdate, DeviceCommand

logger = logging.getLogger(__name__)


class MQTTHandler:
    """
    Manages MQTT connections to Adafruit IO.

    In simulator mode, provides an in-process message bus
    so modules can pub/sub without a real broker.

    Topic format: {username}/feeds/{feed_key}
    """

    def __init__(
        self,
        username: str = "",
        aio_key: str = "",
        host: str = "io.adafruit.com",
        port: int = 1883,
        use_simulator: bool = True,
    ):
        self.username = username
        self.aio_key = aio_key
        self.host = host
        self.port = port
        self.use_simulator = use_simulator

        # Subscriber callbacks: feed_key -> [callback]
        self._subscribers: Dict[str, List[Callable]] = {}

        # Simulator message log
        self._sim_messages: List[dict] = []

        self._connected = False
        self._client = None  # paho.mqtt.client if real mode

    def _topic(self, feed_key: str) -> str:
        return f"{self.username}/feeds/{feed_key}"

    # ── Connection ──

    def connect(self):
        """Connect to the MQTT broker (or start the simulator bus)."""
        if self.use_simulator:
            self._connected = True
            logger.info("[SIM] MQTT bus started (in-process)")
            return

        try:
            import paho.mqtt.client as mqtt_lib

            self._client = mqtt_lib.Client()
            self._client.username_pw_set(self.username, self.aio_key)
            self._client.on_message = self._on_real_message
            self._client.connect(self.host, self.port, keepalive=60)
            self._client.loop_start()
            self._connected = True
            logger.info(f"MQTT connected to {self.host}:{self.port}")
        except Exception as e:
            logger.error(f"MQTT connection failed: {e}")

    def disconnect(self):
        """Disconnect from the broker."""
        self._connected = False
        if self._client:
            self._client.loop_stop()
            self._client.disconnect()
            logger.info("MQTT disconnected")
        else:
            logger.info("[SIM] MQTT bus stopped")

    # ── Subscribe ──

    def subscribe(self, feed_key: str, callback: Callable[[FeedUpdate], None]):
        """
        Subscribe to a feed. Callback receives FeedUpdate on each message.

        Args:
            feed_key: Feed to subscribe to (e.g. "yolohome.door-lock")
            callback: Called with FeedUpdate when a message arrives
        """
        self._subscribers.setdefault(feed_key, []).append(callback)

        if not self.use_simulator and self._client:
            self._client.subscribe(self._topic(feed_key))
            logger.info(f"Subscribed to {feed_key}")
        else:
            logger.info(f"[SIM] Subscribed to {feed_key}")

    # ── Publish ──

    def publish(self, feed_key: str, value: Any):
        """
        Publish a value to a feed.

        Args:
            feed_key: Target feed
            value: Value to publish (JSON-serialized)
        """
        str_value = json.dumps(value) if not isinstance(value, str) else value
        update = FeedUpdate(feed_key=feed_key, value=str_value)

        if self.use_simulator:
            self._sim_messages.append(update.to_dict())
            logger.info(f"[SIM] MQTT publish {feed_key}: {str_value}")
            # Dispatch to local subscribers
            for cb in self._subscribers.get(feed_key, []):
                try:
                    cb(update)
                except Exception as e:
                    logger.error(f"Subscriber error on {feed_key}: {e}")
            return

        if self._client:
            self._client.publish(self._topic(feed_key), str_value)
            logger.info(f"MQTT publish {feed_key}: {str_value}")

    # ── Internal ──

    def _on_real_message(self, client, userdata, msg):
        """Handle incoming MQTT message from the real broker."""
        topic = msg.topic
        # Extract feed_key from topic: username/feeds/feed_key
        parts = topic.split("/feeds/")
        if len(parts) != 2:
            return
        feed_key = parts[1]
        update = FeedUpdate(
            feed_key=feed_key,
            value=msg.payload.decode("utf-8", errors="replace"),
        )
        for cb in self._subscribers.get(feed_key, []):
            try:
                cb(update)
            except Exception as e:
                logger.error(f"Subscriber error on {feed_key}: {e}")

    # ── Simulator helpers ──

    def get_sim_messages(self) -> list:
        return list(self._sim_messages)

    def clear_sim(self):
        self._sim_messages.clear()
