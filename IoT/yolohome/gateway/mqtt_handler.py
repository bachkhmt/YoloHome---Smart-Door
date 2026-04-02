# """
# MQTT handler for Adafruit IO.
# Real-time pub/sub for sensor data and device commands.
# """

# import json
# import logging
# import time
# import threading
# from typing import Callable, Dict, List, Optional, Any

# from yolohome.data_models import FeedUpdate, DeviceCommand

# logger = logging.getLogger(__name__)


# class MQTTHandler:
#     """
#     Manages MQTT connections to Adafruit IO.

#     In simulator mode, provides an in-process message bus
#     so modules can pub/sub without a real broker.

#     Topic format: {username}/feeds/{feed_key}
#     """

#     def __init__(
#         self,
#         username: str = "",
#         aio_key: str = "",
#         host: str = "io.adafruit.com",
#         port: int = 1883,
#         use_simulator: bool = True,
#     ):
#         self.username = username
#         self.aio_key = aio_key
#         self.host = host
#         self.port = port
#         self.use_simulator = use_simulator

#         # Subscriber callbacks: feed_key -> [callback]
#         self._subscribers: Dict[str, List[Callable]] = {}

#         # Simulator message log
#         self._sim_messages: List[dict] = []

#         self._connected = False
#         self._client = None  # paho.mqtt.client if real mode

#     def _topic(self, feed_key: str) -> str:
#         return f"{self.username}/feeds/{feed_key}"

#     # ── Connection ──

#     def connect(self):
#         """Connect to the MQTT broker (or start the simulator bus)."""
#         if self.use_simulator:
#             self._connected = True
#             logger.info("[SIM] MQTT bus started (in-process)")
#             return

#         try:
#             import paho.mqtt.client as mqtt_lib

#             self._client = mqtt_lib.Client()
#             self._client.username_pw_set(self.username, self.aio_key)
#             self._client.on_message = self._on_real_message
#             self._client.connect(self.host, self.port, keepalive=60)
#             self._client.loop_start()
#             self._connected = True
#             logger.info(f"MQTT connected to {self.host}:{self.port}")
#         except Exception as e:
#             logger.error(f"MQTT connection failed: {e}")

#     def disconnect(self):
#         """Disconnect from the broker."""
#         self._connected = False
#         if self._client:
#             self._client.loop_stop()
#             self._client.disconnect()
#             logger.info("MQTT disconnected")
#         else:
#             logger.info("[SIM] MQTT bus stopped")

#     # ── Subscribe ──

#     def subscribe(self, feed_key: str, callback: Callable[[FeedUpdate], None]):
#         """
#         Subscribe to a feed. Callback receives FeedUpdate on each message.

#         Args:
#             feed_key: Feed to subscribe to (e.g. "yolohome.door-lock")
#             callback: Called with FeedUpdate when a message arrives
#         """
#         self._subscribers.setdefault(feed_key, []).append(callback)

#         if not self.use_simulator and self._client:
#             self._client.subscribe(self._topic(feed_key))
#             logger.info(f"Subscribed to {feed_key}")
#         else:
#             logger.info(f"[SIM] Subscribed to {feed_key}")

#     # ── Publish ──

#     def publish(self, feed_key: str, value: Any):
#         """
#         Publish a value to a feed.

#         Args:
#             feed_key: Target feed
#             value: Value to publish (JSON-serialized)
#         """
#         str_value = json.dumps(value) if not isinstance(value, str) else value
#         update = FeedUpdate(feed_key=feed_key, value=str_value)

#         if self.use_simulator:
#             self._sim_messages.append(update.to_dict())
#             logger.info(f"[SIM] MQTT publish {feed_key}: {str_value}")
#             # Dispatch to local subscribers
#             for cb in self._subscribers.get(feed_key, []):
#                 try:
#                     cb(update)
#                 except Exception as e:
#                     logger.error(f"Subscriber error on {feed_key}: {e}")
#             return

#         if self._client:
#             self._client.publish(self._topic(feed_key), str_value)
#             logger.info(f"MQTT publish {feed_key}: {str_value}")

#     # ── Internal ──

#     def _on_real_message(self, client, userdata, msg):
#         """Handle incoming MQTT message from the real broker."""
#         topic = msg.topic
#         payload = msg.payload.decode("utf-8", errors="replace")
        
#         # 1. In ra MỌI THỨ bay về từ Adafruit để xem có nhận được gì không
#         logger.info(f"👉 [DEBUG MQTT] BẮT ĐƯỢC TIN NHẮN! Topic: {topic} | Giá trị: {payload}")
        
#         # 2. Xử lý đường dẫn linh hoạt (Adafruit có thể dùng /feeds/ hoặc /f/)
#         if "/feeds/" in topic:
#             feed_key = topic.split("/feeds/")[1]
#         elif "/f/" in topic:
#             feed_key = topic.split("/f/")[1]
#         else:
#             feed_key = topic.split("/")[-1]  # Lấy đại chữ cuối cùng nếu cấu trúc lạ
            
#         update = FeedUpdate(
#             feed_key=feed_key,
#             value=payload,
#         )
        
#         # 3. Kiểm tra xem code có đang lắng nghe đúng Feed này không
#         subs = self._subscribers.get(feed_key, [])
#         if not subs:
#             logger.warning(f"⚠️ [DEBUG MQTT] Kênh '{feed_key}' có dữ liệu nhưng KHÔNG CÓ HÀM NÀO LẮNG NGHE!")
#             logger.warning(f"   (Các kênh đang được lắng nghe hiện tại: {list(self._subscribers.keys())})")
#             return

#         # 4. Truyền dữ liệu cho hàm xử lý
#         for cb in subs:
#             try:
#                 cb(update)
#             except Exception as e:
#                 logger.error(f"Subscriber error on {feed_key}: {e}")

#     # ── Simulator helpers ──

#     def get_sim_messages(self) -> list:
#         return list(self._sim_messages)

#     def clear_sim(self):
#         self._sim_messages.clear()



"""
MQTT handler for Adafruit IO.
Real-time pub/sub cho sensor data và device commands.

Topic format: {username}/feeds/{feed_key}

Simulator mode: in-process message bus — pub/sub hoạt động đầy đủ
                mà không cần kết nối broker thật.
Real mode:      paho-mqtt kết nối tới io.adafruit.com:1883,
                subscribe ngay sau khi connect.
"""

import json
import logging
import threading
from typing import Callable, Dict, List, Any, Optional

from yolohome.data_models import FeedUpdate

logger = logging.getLogger(__name__)


class MQTTHandler:
    """
    Quản lý kết nối MQTT tới Adafruit IO.

    Lưu ý quan trọng với real mode:
        - subscribe() phải được gọi SAU connect() để paho đăng ký topic.
        - Trong Gateway.start(), tất cả subscribe() được gọi sau mqtt.connect()
          nên thứ tự đúng.
        - Nếu kết nối bị ngắt và reconnect, các topic sẽ được subscribe lại
          tự động qua on_connect callback (clean_session=False).
    """

    def __init__(
        self,
        username: str = "",
        aio_key: str = "",
        host: str = "io.adafruit.com",
        port: int = 1883,
        use_simulator: bool = True,
    ):
        self.username  = username
        self.aio_key   = aio_key
        self.host      = host
        self.port      = port
        self.use_simulator = use_simulator

        # feed_key → [callback, ...]
        self._subscribers: Dict[str, List[Callable[[FeedUpdate], None]]] = {}

        # Log các message đã publish (simulator)
        self._sim_messages: List[dict] = []

        self._connected = False
        self._client = None   # paho.mqtt.Client khi real mode
        self._lock = threading.Lock()

    def _topic(self, feed_key: str) -> str:
        return f"{self.username}/feeds/{feed_key}"

    # ══════════════════════════════════════════
    # Connection
    # ══════════════════════════════════════════

    def connect(self):
        """Kết nối tới MQTT broker hoặc khởi động simulator bus."""
        if self.use_simulator:
            self._connected = True
            logger.info("[SIM] MQTT in-process bus started")
            return

        try:
            import paho.mqtt.client as mqtt_lib

            client = mqtt_lib.Client(
                client_id=f"yolohome-{self.username}",
                clean_session=False,   # Giữ subscriptions khi reconnect
            )
            client.username_pw_set(self.username, self.aio_key)
            client.on_connect    = self._on_connect
            client.on_disconnect = self._on_disconnect
            client.on_message    = self._on_real_message

            client.connect(self.host, self.port, keepalive=60)
            client.loop_start()   # Thread ngầm xử lý network I/O

            self._client = client
            self._connected = True
            logger.info(f"MQTT connecting → {self.host}:{self.port}")

        except ImportError:
            logger.error("paho-mqtt chưa được cài. Chạy: pip install paho-mqtt")
        except Exception as e:
            logger.error(f"MQTT connection failed: {e}")

    def disconnect(self):
        """Ngắt kết nối MQTT."""
        self._connected = False
        if self._client:
            self._client.loop_stop()
            self._client.disconnect()
            logger.info("MQTT disconnected")
        else:
            logger.info("[SIM] MQTT bus stopped")

    def _on_connect(self, client, userdata, flags, rc):
        """Callback khi paho kết nối thành công — subscribe lại tất cả feed."""
        if rc == 0:
            logger.info(f"MQTT connected (rc=0)")
            # Re-subscribe sau reconnect
            with self._lock:
                for feed_key in self._subscribers:
                    client.subscribe(self._topic(feed_key), qos=1)
                    logger.info(f"(Re)subscribed: {feed_key}")
        else:
            logger.error(f"MQTT connect failed rc={rc}")

    def _on_disconnect(self, client, userdata, rc):
        if rc != 0:
            logger.warning(f"MQTT unexpected disconnect rc={rc} — paho sẽ tự reconnect")

    # ══════════════════════════════════════════
    # Subscribe
    # ══════════════════════════════════════════

    def subscribe(self, feed_key: str, callback: Callable[[FeedUpdate], None]):
        """
        Đăng ký callback cho một feed.
        Có thể gọi nhiều lần với cùng feed_key — tất cả callback đều được gọi.

        Args:
            feed_key: Feed cần subscribe (vd "yolohome.door-lock")
            callback: Hàm nhận FeedUpdate khi có message mới
        """
        with self._lock:
            self._subscribers.setdefault(feed_key, []).append(callback)

        if not self.use_simulator and self._client and self._connected:
            self._client.subscribe(self._topic(feed_key), qos=1)
            logger.info(f"Subscribed: {feed_key}")
        else:
            logger.info(f"[SIM] Subscribed: {feed_key}")

    # ══════════════════════════════════════════
    # Publish
    # ══════════════════════════════════════════

    def publish(self, feed_key: str, value: Any):
        """
        Publish một giá trị lên feed.

        Args:
            feed_key: Feed đích (vd "yolohome.temperature")
            value: Giá trị — sẽ được JSON-serialize nếu không phải string
        """
        str_value = (
            value if isinstance(value, str)
            else json.dumps(value, ensure_ascii=False)
        )
        update = FeedUpdate(feed_key=feed_key, value=str_value)

        if self.use_simulator:
            # Simulator: dispatch trực tiếp tới subscriber trong process
            with self._lock:
                self._sim_messages.append(update.to_dict())
                callbacks = list(self._subscribers.get(feed_key, []))

            logger.info(f"[SIM] MQTT publish {feed_key}: {str_value[:120]}")

            for cb in callbacks:
                try:
                    cb(update)
                except Exception as e:
                    logger.error(f"Subscriber error [{feed_key}]: {e}")
            return

        # Real mode
        if self._client and self._connected:
            self._client.publish(self._topic(feed_key), str_value, qos=1)
            logger.info(f"MQTT publish {feed_key}: {str_value[:120]}")
        else:
            logger.warning(f"MQTT chưa kết nối — bỏ qua publish {feed_key}")

    # ══════════════════════════════════════════
    # Internal
    # ══════════════════════════════════════════

    def _on_real_message(self, client, userdata, msg):
        """Xử lý message MQTT từ broker thật."""
        parts = msg.topic.split("/feeds/")
        if len(parts) != 2:
            logger.warning(f"Topic không đúng format: {msg.topic}")
            return

        feed_key = parts[1]
        payload  = msg.payload.decode("utf-8", errors="replace")
        update   = FeedUpdate(feed_key=feed_key, value=payload)

        logger.info(f"[ADA→PY] Received [{feed_key}]: {payload[:120]}")

        with self._lock:
            callbacks = list(self._subscribers.get(feed_key, []))

        for cb in callbacks:
            try:
                cb(update)
            except Exception as e:
                logger.error(f"Subscriber error [{feed_key}]: {e}")

    # ══════════════════════════════════════════
    # Simulator helpers
    # ══════════════════════════════════════════

    def get_sim_messages(self) -> list:
        """Trả về tất cả message đã publish trong simulator mode."""
        with self._lock:
            return list(self._sim_messages)

    def clear_sim(self):
        """Xóa log message trong simulator mode."""
        with self._lock:
            self._sim_messages.clear() 