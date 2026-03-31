"""
Adafruit IO REST API client.
Pushes sensor data to feeds and reads commands from the dashboard.
"""

import json
import logging
import time
from typing import Optional, Dict, Any

from yolohome.data_models import FeedUpdate

logger = logging.getLogger(__name__)


class AdafruitClient:
    """
    Thin wrapper around Adafruit IO REST API v2.

    In simulator mode, all API calls are logged but not actually sent.
    Switch to real mode by setting use_simulator=False and providing
    valid credentials.

    Feeds used by YOLOHOME:
        - yolohome.temperature   (micro:bit sensor)
        - yolohome.light         (micro:bit sensor)
        - yolohome.face-detected (camera module)
        - yolohome.sound-event   (microphone module)
        - yolohome.door-lock     (output: "lock" / "unlock")
        - yolohome.buzzer        (output: "on" / "off")
    """

    def __init__(
        self,
        username: str = "",
        aio_key: str = "",
        base_url: str = "https://io.adafruit.com/api/v2",
        use_simulator: bool = True,
    ):
        self.username = username
        self.aio_key = aio_key
        self.base_url = base_url
        self.use_simulator = use_simulator

        # In-memory store for simulator mode
        self._sim_feeds: Dict[str, list] = {}

    def _headers(self) -> dict:
        return {
            "X-AIO-Key": self.aio_key,
            "Content-Type": "application/json",
        }

    def _feed_url(self, feed_key: str) -> str:
        return f"{self.base_url}/{self.username}/feeds/{feed_key}/data"

    # ── Push data to a feed ──

    def publish(self, feed_key: str, value: Any) -> FeedUpdate:
        """
        Send a value to an Adafruit IO feed.

        Args:
            feed_key: The feed identifier (e.g. "yolohome.temperature")
            value: The value to publish (will be JSON-serialized)

        Returns:
            FeedUpdate with the published data.
        """
        str_value = json.dumps(value) if not isinstance(value, str) else value
        update = FeedUpdate(feed_key=feed_key, value=str_value)

        if self.use_simulator:
            self._sim_feeds.setdefault(feed_key, []).append(update)
            logger.info(
                f"[SIM] Published to {feed_key}: {str_value}"
            )
            return update

        # Real API call (requires `requests` installed)
        try:
            import requests
            resp = requests.post(
                self._feed_url(feed_key),
                headers=self._headers(),
                json={"value": str_value},
                timeout=10,
            )
            resp.raise_for_status()
            logger.info(f"Published to {feed_key}: {str_value}")
        except Exception as e:
            logger.error(f"Failed to publish to {feed_key}: {e}")

        return update

    # ── Read latest value from a feed ──

    def get_latest(self, feed_key: str) -> Optional[FeedUpdate]:
        """
        Get the most recent value from a feed.

        Returns:
            FeedUpdate or None if no data.
        """
        if self.use_simulator:
            history = self._sim_feeds.get(feed_key, [])
            if history:
                return history[-1]
            logger.debug(f"[SIM] No data in feed {feed_key}")
            return None

        try:
            import requests
            resp = requests.get(
                self._feed_url(feed_key) + "/last",
                headers=self._headers(),
                timeout=10,
            )
            resp.raise_for_status()
            data = resp.json()
            return FeedUpdate(
                feed_key=feed_key,
                value=data.get("value", ""),
                timestamp=time.time(),
            )
        except Exception as e:
            logger.error(f"Failed to read {feed_key}: {e}")
            return None

    # ── Simulator helpers ──

    def get_sim_history(self, feed_key: str) -> list:
        """Get all values published to a feed in simulator mode."""
        return list(self._sim_feeds.get(feed_key, []))

    def clear_sim(self):
        """Reset the in-memory simulator store."""
        self._sim_feeds.clear()
