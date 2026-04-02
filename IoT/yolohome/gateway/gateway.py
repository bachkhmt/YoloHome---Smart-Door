# """
# IoT Gateway — unified interface for server communication.

# Luồng dữ liệu:

#   Flow A — Cảm biến môi trường (mạch thật → cloud → Python → web):
#     ESP32/Yolo:Bit  →[WiFi]→  Adafruit IO feed
#     Python subscribe  →  _on_sensor_update()  →  POST Node.js /api/sensors
#     Node.js socket.emit  →  React UI cập nhật real-time

#   Flow B — Nhận diện khuôn mặt (Python AI → Adafruit → Python → web):
#     ESP32-CAM  →[MJPEG]→  Python OpenCV  →  face_recognition AI
#     Python publish  →  Adafruit IO yolohome.face-detected
#     Python subscribe  →  _on_face_update()  →  POST Node.js /api/logs
#     Node.js socket.emit  →  React UI cập nhật real-time
#     Nếu người quen  →  send_command(door_lock, unlock)  →  Adafruit  →  ESP32

#   Flow C — Lệnh từ Adafruit Dashboard (cloud → Python → web):
#     Adafruit dashboard bấm nút  →  publish feed door-lock
#     Python subscribe  →  _on_door_command_from_cloud()  →  POST Node.js /api/logs
# """

# import json
# import logging
# import time
# from typing import Callable, Any, Optional

# import requests

# from yolohome.config import AppConfig, load_config
# from yolohome.data_models import FeedUpdate, DeviceCommand, ParsedEvent, EventType
# from yolohome.gateway.adafruit_client import AdafruitClient
# from yolohome.gateway.mqtt_handler import MQTTHandler

# logger = logging.getLogger(__name__)

# LOCAL_API = "http://localhost:3001/api"

# FEEDS = {
#     "temperature": "yolohome.temperature",
#     "light":       "yolohome.light",
#     "sound":       "yolohome.sound-event",
#     "face":        "yolohome.face-detected",
#     "door_lock":   "yolohome.door-lock",
#     "buzzer":      "yolohome.buzzer",
#     "activity":    "yolohome.activity-log",
# }


# class Gateway:
#     """
#     Unified IoT gateway — tất cả module giao tiếp với server qua class này.

#     Public API:
#         start()            — kết nối MQTT + subscribe tất cả feed cần thiết
#         stop()             — ngắt kết nối
#         sync_event(event)  — Python/AI module gửi ParsedEvent vào đây
#         send_command(cmd)  — điều khiển thiết bị đầu ra
#         subscribe(feed, cb)— đăng ký lắng nghe feed bất kỳ
#         publish(feed, val) — publish thẳng lên Adafruit qua REST
#     """

#     def __init__(self, config: Optional[AppConfig] = None):
#         self.config = config or load_config()
#         ada = self.config.adafruit
#         sim = self.config.use_simulator

#         self.rest = AdafruitClient(
#             username=ada.username,
#             aio_key=ada.aio_key,
#             use_simulator=sim,
#         )
#         self.mqtt = MQTTHandler(
#             username=ada.username,
#             aio_key=ada.aio_key,
#             host=ada.mqtt_host,
#             port=ada.mqtt_port,
#             use_simulator=sim,
#         )

#     # ══════════════════════════════════════════════════════
#     # Lifecycle
#     # ══════════════════════════════════════════════════════

#     def start(self):
#         """
#         Kết nối MQTT và subscribe tất cả feed cần thiết.

#         Subscribe list:
#           - temperature / light / sound  → nhận data từ mạch thật, bridge sang Node.js
#           - face-detected                → nhận kết quả AI (do chính Python publish),
#                                            bridge sang Node.js + kích hoạt mở cửa
#           - door-lock                    → nhận lệnh từ Adafruit Dashboard, log về Node.js
#         """
#         self.mqtt.connect()

#         # Flow A: cảm biến môi trường từ mạch thật
#         self.subscribe(FEEDS["temperature"], self._on_sensor_update)
#         self.subscribe(FEEDS["light"],       self._on_sensor_update)
#         self.subscribe(FEEDS["sound"],       self._on_sensor_update)

#         # Flow B: kết quả nhận diện khuôn mặt (Python tự publish rồi tự nhận)
#         self.subscribe(FEEDS["face"],        self._on_face_update)

#         # Flow C: lệnh từ Adafruit Dashboard
#         self.subscribe(FEEDS["door_lock"],   self._on_door_command_from_cloud)

#         logger.info("Gateway started — subscribed to all feeds")

#     def stop(self):
#         self.mqtt.disconnect()
#         logger.info("Gateway stopped")

#     # ══════════════════════════════════════════════════════
#     # Flow A: Mạch thật → Adafruit → Python → Node.js
#     # ══════════════════════════════════════════════════════

#     def _on_sensor_update(self, update: FeedUpdate):
#         """
#         Callback khi mạch thật (ESP32/Yolo:Bit) publish sensor lên Adafruit IO.
#         Python nhận được rồi chuyển tiếp về Node.js để hiển thị real-time trên React.
#         """
#         feed_key = update.feed_key
#         raw = update.value

#         logger.info(f"[HW→ADA→PY] Sensor [{feed_key}]: {raw}")

#         try:
#             value = float(raw)
#         except (ValueError, TypeError):
#             logger.warning(f"Giá trị không hợp lệ từ {feed_key}: {raw!r}")
#             return

#         # ✅ Chỉ gửi field nào có data
#         FEED_TO_FIELD = {
#             FEEDS["temperature"]: "temp",
#             FEEDS["light"]:        "light",
#             FEEDS["sound"]:        "sound_level",
#         }
#         field = FEED_TO_FIELD.get(feed_key)
#         if field:
#             self._post_to_nodejs("/sensors", {field: value})

#     # ══════════════════════════════════════════════════════
#     # Flow B: Camera AI → Adafruit → Python → Node.js
#     # ══════════════════════════════════════════════════════

#     def _on_face_update(self, update: FeedUpdate):
#         """
#         Callback khi feed face-detected có dữ liệu mới.

#         Python AI publish kết quả lên Adafruit → Python nhận lại qua subscribe →
#         bridge sang Node.js để lưu log + hiển thị real-time trên React dashboard.

#         Nếu nhận ra người quen → gửi lệnh mở khoá cửa.
#         """
#         logger.info(f"[ADA→PY] Face update: {update.value}")

#         try:
#             data = json.loads(update.value)
#         except (json.JSONDecodeError, TypeError):
#             logger.warning(f"Face update payload không hợp lệ: {update.value!r}")
#             return

#         label      = data.get("label", "unknown")
#         is_known   = data.get("known", False)
#         confidence = data.get("confidence", 0.0)

#         # Log về Node.js để hiển thị lên React AccessLog + ActivityChart
#         log_payload = {
#             "user_id":        data.get("user_id"),
#             "action":         "face_recognized" if is_known else "face_unknown",
#             "status":         "success" if is_known else "warning",
#             "confidence":     confidence,
#             "image_snapshot": data.get("snapshot"),
#         }
#         self._post_to_nodejs("/logs", log_payload)

#         # Tự động mở cửa nếu nhận ra người quen
#         if is_known:
#             logger.info(f"🔓 Chào {label}! Đang mở cửa...")
#             self.send_command(DeviceCommand("door_lock", "unlock"))

#     # ══════════════════════════════════════════════════════
#     # Flow C: Adafruit Dashboard → Python → Node.js
#     # ══════════════════════════════════════════════════════

#     def _on_door_command_from_cloud(self, update: FeedUpdate):
#         """
#         Callback khi Adafruit Dashboard gửi lệnh khoá/mở cửa thủ công.
#         Log hành động này về Node.js để hiển thị trên React AccessLog.
#         """
#         action = update.value.strip().lower()
#         logger.info(f"[CLOUD→PY] Lệnh cửa từ dashboard: {action}")

#         self._post_to_nodejs("/logs", {
#             "user_id":        None,
#             "action":         f"door_{action}_manual",
#             "status":         "success",
#             "confidence":     1.0,
#             "image_snapshot": None,
#         })

#     # ══════════════════════════════════════════════════════
#     # sync_event — Python/AI modules gọi vào đây
#     # ══════════════════════════════════════════════════════

#     def sync_event(self, event: ParsedEvent):
#         """
#         Tiếp nhận ParsedEvent từ các module AI/parser và xử lý:
#           1. Publish lên Adafruit IO (feed tương ứng)
#           2. Callback _on_*_update sẽ tự động bridge sang Node.js

#         Lưu ý: FACE_DETECTED publish lên Adafruit → callback _on_face_update
#         được gọi ngay → tự bridge sang Node.js. Không cần POST trực tiếp ở đây.
#         """
#         if event.event_type == EventType.ENVIRONMENT:
#             self._sync_environment(event)

#         elif event.event_type == EventType.FACE_DETECTED:
#             self._sync_face_detected(event)

#         elif event.event_type == EventType.SOUND_DETECTED:
#             self._sync_sound(event)

#         elif event.event_type in (
#             EventType.BUTTON_TRIGGER,
#             EventType.MOTION_TRIGGER,
#             EventType.DOOR_UNLOCK_REQUEST,
#         ):
#             self._sync_trigger(event)

#     def _sync_environment(self, event: ParsedEvent):
#         """
#         Môi trường từ Python (ví dụ đọc serial từ Yolo:Bit).
#         Publish từng giá trị → callback _on_sensor_update bridge sang Node.js.
#         """
#         temp  = event.data.get("temperature")
#         light = event.data.get("light_level")
#         sound = event.data.get("sound_level")

#         if temp  is not None:
#             self.mqtt.publish(FEEDS["temperature"], temp)
#         if light is not None:
#             self.mqtt.publish(FEEDS["light"], light)
#         if sound is not None:
#             self.mqtt.publish(FEEDS["sound"], sound)

#     def _sync_face_detected(self, event: ParsedEvent):
#         """
#         Kết quả nhận diện khuôn mặt từ camera_parser.
#         Publish từng khuôn mặt lên Adafruit → callback _on_face_update xử lý tiếp.
#         """
#         faces = event.data.get("faces", [])

#         if not faces:
#             # Không tìm thấy khuôn mặt nào — vẫn publish để dashboard biết
#             self.mqtt.publish(FEEDS["face"], json.dumps({
#                 "label":      "none",
#                 "known":      False,
#                 "confidence": 0.0,
#                 "user_id":    None,
#                 "snapshot":   None,
#                 "timestamp":  time.time(),
#             }))
#             return

#         for face in faces:
#             label    = face.get("label", "unknown")
#             is_known = label not in ("unknown", "Người lạ")

#             payload = json.dumps({
#                 "label":      label,
#                 "known":      is_known,
#                 "confidence": face.get("confidence", event.confidence),
#                 "user_id":    face.get("user_id"),
#                 "snapshot":   face.get("snapshot"),   # base64 hoặc None
#                 "timestamp":  time.time(),
#             })
#             # Publish lên Adafruit → _on_face_update callback tự xử lý
#             self.mqtt.publish(FEEDS["face"], payload)

#     def _sync_sound(self, event: ParsedEvent):
#         """Âm thanh bất thường — publish lên Adafruit + log trực tiếp về Node.js."""
#         self.mqtt.publish(FEEDS["sound"], event.data)

#         self._post_to_nodejs("/logs", {
#             "user_id":        None,
#             "action":         "sound_alert",
#             "status":         "warning",
#             "confidence":     event.confidence,
#             "image_snapshot": None,
#         })

#     def _sync_trigger(self, event: ParsedEvent):
#         """Nút bấm / chuyển động / yêu cầu mở khoá — log lên Adafruit + Node.js."""
#         self.mqtt.publish(FEEDS["activity"], {
#             "trigger":   event.event_type.value,
#             "timestamp": time.time(),
#             **event.data,
#         })

#         self._post_to_nodejs("/logs", {
#             "user_id":        None,
#             "action":         f"{event.event_type.value}_trigger",
#             "status":         "info",
#             "confidence":     event.confidence,
#             "image_snapshot": None,
#         })

#     # ══════════════════════════════════════════════════════
#     # Subscribe / Publish / Command
#     # ══════════════════════════════════════════════════════

#     def subscribe(self, feed_key: str, callback: Callable[[FeedUpdate], None]):
#         """Subscribe vào một Adafruit IO feed."""
#         self.mqtt.subscribe(feed_key, callback)

#     def on_door_command(self, callback: Callable[[FeedUpdate], None]):
#         """Shortcut: lắng nghe lệnh door-lock từ dashboard."""
#         self.subscribe(FEEDS["door_lock"], callback)

#     def send_command(self, cmd: DeviceCommand):
#         """
#         Gửi lệnh điều khiển thiết bị lên Adafruit IO.
#         Mạch thật subscribe feed này và thực thi lệnh.
#         """
#         feed = FEEDS.get(cmd.device_id)
#         if feed:
#             self.mqtt.publish(feed, cmd.action)
#             logger.info(f"[PY→ADA→HW] {cmd.device_id} → {cmd.action}")
#         else:
#             logger.warning(
#                 f"Không tìm thấy device '{cmd.device_id}'. "
#                 f"Hợp lệ: {list(FEEDS.keys())}"
#             )

#     def publish(self, feed_key: str, value: Any) -> FeedUpdate:
#         """Publish thẳng lên Adafruit qua REST (dùng khi cần gửi 1 lần)."""
#         return self.rest.publish(feed_key, value)

#     # ══════════════════════════════════════════════════════
#     # Internal helper
#     # ══════════════════════════════════════════════════════

#     def _post_to_nodejs(self, endpoint: str, payload: dict):
#         """POST dữ liệu về Node.js Local Server (:3001)."""
#         url = f"{LOCAL_API}{endpoint}"
#         try:
#             resp = requests.post(url, json=payload, timeout=2)
#             resp.raise_for_status()
#             logger.debug(f"[PY→NODE] POST {endpoint} {resp.status_code}")
#         except requests.exceptions.ConnectionError:
#             logger.warning(f"Node.js chưa chạy — POST {endpoint} thất bại")
#         except requests.exceptions.Timeout:
#             logger.warning(f"POST {endpoint} timeout (>2s)")
#         except requests.exceptions.HTTPError as e:
#             logger.error(f"Node.js lỗi HTTP tại {endpoint}: {e}")
#         except requests.exceptions.RequestException as e:
#             logger.error(f"Lỗi POST {endpoint}: {e}")


"""
IoT Gateway — unified interface for server communication.

Luồng dữ liệu:

  Flow A — Cảm biến môi trường (mạch thật → cloud → Python → web):
    ESP32/Yolo:Bit  →[WiFi]→  Adafruit IO feed
    Python subscribe  →  _on_sensor_update()  →  POST Node.js /api/sensors
    Node.js socket.emit  →  React UI cập nhật real-time

  Flow B — Nhận diện khuôn mặt (Python AI → Adafruit → Python → web):
    Python camera_parser  →  publish yolohome.face-detected
    Python subscribe callback  →  _on_face_update()  →  POST Node.js /api/logs
    Nếu is_known → tự động mở cửa

  Flow C — Adafruit Dashboard → Python → Node.js:
    Người dùng bấm nút trên dashboard Adafruit
    Python subscribe  →  _on_door_command_from_cloud()  →  POST Node.js /api/logs

Sửa lỗi (v2):
  ✅ Lỗi 1: _on_sensor_update không còn ghi đè các field về 0
  ✅ Lỗi 2: POST /api/sensors dùng đúng field name (temp, hum, light)
  ✅ Lỗi 3: POST /api/logs dùng đúng field name (success thay vì status)
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

# ══════════════════════════════════════════════════════════════════
# Feed keys
# ══════════════════════════════════════════════════════════════════
FEEDS = {
    "temperature": "yolohome.temperature",
    "light":       "yolohome.light",
    "sound":       "yolohome.sound-event",
    "face":        "yolohome.face-detected",
    "door_lock":   "yolohome.door-lock",
    "buzzer":      "yolohome.buzzer",
    "activity":    "yolohome.activity-log",
}


class Gateway:
    """
    Unified IoT gateway cho tất cả modules.

    Chức năng:
      - subscribe Adafruit feeds → bridge dữ liệu về Node.js
      - sync_event() nhận ParsedEvent từ AI/parser → publish lên Adafruit
      - send_command() điều khiển mạch thật qua Adafruit IO
      - Tự động mở cửa khi nhận diện người quen

    Khởi động:
        gw = Gateway()
        gw.start()         # kết nối MQTT + subscribe các feed
        gw.sync_event(...)
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

    # ══════════════════════════════════════════════════════
    # Lifecycle
    # ══════════════════════════════════════════════════════

    def start(self):
        """Kết nối MQTT và subscribe các feed từ Adafruit."""
        self.mqtt.connect()

        # Subscribe feed từ mạch thật
        self.mqtt.subscribe(FEEDS["temperature"], self._on_sensor_update)
        self.mqtt.subscribe(FEEDS["light"],       self._on_sensor_update)
        self.mqtt.subscribe(FEEDS["sound"],       self._on_sensor_update)

        # Subscribe feed từ Python AI
        self.mqtt.subscribe(FEEDS["face"], self._on_face_update)

        # Subscribe lệnh từ Adafruit Dashboard
        self.mqtt.subscribe(FEEDS["door_lock"], self._on_door_command_from_cloud)

        logger.info("Gateway started — subscribed to Adafruit feeds")

    def stop(self):
        """Ngắt kết nối."""
        self.mqtt.disconnect()
        logger.info("Gateway stopped")

    # ══════════════════════════════════════════════════════
    # Flow A: Adafruit → Python → Node.js (sensor data)
    # ══════════════════════════════════════════════════════

    def _on_sensor_update(self, update: FeedUpdate):
        """
        Callback khi nhận data từ Adafruit IO feed (mạch thật publish).
        Bridge về Node.js để hiển thị lên React UI.

        ✅ FIX: Không ghi đè các field về 0 nữa — chỉ gửi field nào có data.
        """
        feed_key = update.feed_key
        value    = update.value

        logger.info(f"[ADA→PY] Sensor update [{feed_key}]: {value}")

        # Parse value thành số
        try:
            numeric_value = float(value)
        except (ValueError, TypeError):
            logger.warning(f"Sensor value không hợp lệ: {value!r}")
            return

        # ✅ FIX Lỗi 1 + 2: Chỉ gửi field nào có data, đúng tên field mà Node.js expect
        if feed_key == FEEDS["temperature"]:
            self._post_to_nodejs("/sensors", {"temp": numeric_value})

        elif feed_key == FEEDS["light"]:
            self._post_to_nodejs("/sensors", {"light": numeric_value})

        elif feed_key == FEEDS["sound"]:
            self._post_to_nodejs("/sensors", {"hum": numeric_value})  # hoặc sound_level nếu có field riêng

    # ══════════════════════════════════════════════════════
    # Flow B: Python AI → Adafruit → Python → Node.js (face)
    # ══════════════════════════════════════════════════════

    def _on_face_update(self, update: FeedUpdate):
        """
        Callback khi Python AI publish kết quả nhận diện khuôn mặt lên Adafruit.
        Bridge về Node.js để ghi log + tự động mở cửa nếu người quen.

        ✅ FIX: Dùng đúng field 'success' thay vì 'status'
        """
        logger.info(f"[ADA→PY] Face update: {update.value}")

        try:
            data = json.loads(update.value)
        except (json.JSONDecodeError, TypeError):
            logger.warning(f"Face update payload không hợp lệ: {update.value!r}")
            return

        label      = data.get("label", "unknown")
        is_known   = data.get("known", False)
        confidence = data.get("confidence", 0.0)

        # ✅ FIX Lỗi 3: Dùng đúng schema /api/logs
        log_payload = {
            "user_id":        data.get("user_id"),
            "user_name":      label,
            "method":         "Face",
            "action":         "Vào",
            "success":        1 if is_known else 0,  # ← field đúng
            "fail_reason":    None if is_known else "Người lạ",
            "latency_ms":     None,
            "ip_address":     None,
        }
        self._post_to_nodejs("/logs", log_payload)

        # Tự động mở cửa nếu nhận ra người quen
        if is_known:
            logger.info(f"🔓 Chào {label}! Đang mở cửa...")
            self.send_command(DeviceCommand("door_lock", "unlock"))

    # ══════════════════════════════════════════════════════
    # Flow C: Adafruit Dashboard → Python → Node.js
    # ══════════════════════════════════════════════════════

    def _on_door_command_from_cloud(self, update: FeedUpdate):
        """
        Callback khi Adafruit Dashboard gửi lệnh khoá/mở cửa thủ công.
        Log hành động này về Node.js để hiển thị trên React AccessLog.
        """
        action = update.value.strip().lower()
        logger.info(f"[CLOUD→PY] Lệnh cửa từ dashboard: {action}")

        self._post_to_nodejs("/logs", {
            "user_id":        None,
            "user_name":      "Dashboard",
            "method":         "Manual",
            "action":         f"door_{action}",
            "success":        1,
            "fail_reason":    None,
            "latency_ms":     None,
            "ip_address":     None,
        })

    # ══════════════════════════════════════════════════════
    # sync_event — Python/AI modules gọi vào đây
    # ══════════════════════════════════════════════════════

    def sync_event(self, event: ParsedEvent):
        """
        Tiếp nhận ParsedEvent từ các module AI/parser và xử lý:
          1. Publish lên Adafruit IO (feed tương ứng)
          2. Callback _on_*_update sẽ tự động bridge sang Node.js

        Lưu ý: FACE_DETECTED publish lên Adafruit → callback _on_face_update
        được gọi ngay → tự bridge sang Node.js. Không cần POST trực tiếp ở đây.
        """
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
        """
        Môi trường từ Python (ví dụ đọc serial từ Yolo:Bit).
        Publish từng giá trị → callback _on_sensor_update bridge sang Node.js.
        """
        temp  = event.data.get("temperature")
        light = event.data.get("light_level")
        sound = event.data.get("sound_level")

        if temp  is not None:
            self.mqtt.publish(FEEDS["temperature"], temp)
        if light is not None:
            self.mqtt.publish(FEEDS["light"], light)
        if sound is not None:
            self.mqtt.publish(FEEDS["sound"], sound)

    def _sync_face_detected(self, event: ParsedEvent):
        """
        Kết quả nhận diện khuôn mặt từ camera_parser.
        Publish từng khuôn mặt lên Adafruit → callback _on_face_update xử lý tiếp.
        """
        faces = event.data.get("faces", [])

        if not faces:
            # Không tìm thấy khuôn mặt nào — vẫn publish để dashboard biết
            self.mqtt.publish(FEEDS["face"], json.dumps({
                "label":      "none",
                "known":      False,
                "confidence": 0.0,
                "user_id":    None,
                "snapshot":   None,
                "timestamp":  time.time(),
            }))
            return

        for face in faces:
            label    = face.get("label", "unknown")
            is_known = label not in ("unknown", "Người lạ")

            payload = json.dumps({
                "label":      label,
                "known":      is_known,
                "confidence": face.get("confidence", event.confidence),
                "user_id":    face.get("user_id"),
                "snapshot":   face.get("snapshot"),   # base64 hoặc None
                "timestamp":  time.time(),
            })
            # Publish lên Adafruit → _on_face_update callback tự xử lý
            self.mqtt.publish(FEEDS["face"], payload)

    def _sync_sound(self, event: ParsedEvent):
        """Âm thanh bất thường — publish lên Adafruit + log trực tiếp về Node.js."""
        self.mqtt.publish(FEEDS["sound"], event.data)

        self._post_to_nodejs("/logs", {
            "user_id":        None,
            "user_name":      "System",
            "method":         "Sound",
            "action":         "sound_alert",
            "success":        0,  # cảnh báo = thất bại xác thực
            "fail_reason":    "Âm thanh bất thường",
            "latency_ms":     None,
            "ip_address":     None,
        })

    def _sync_trigger(self, event: ParsedEvent):
        """Nút bấm / chuyển động / yêu cầu mở khoá — log lên Adafruit + Node.js."""
        self.mqtt.publish(FEEDS["activity"], {
            "trigger":   event.event_type.value,
            "timestamp": time.time(),
            **event.data,
        })

        self._post_to_nodejs("/logs", {
            "user_id":        None,
            "user_name":      "System",
            "method":         "Trigger",
            "action":         f"{event.event_type.value}",
            "success":        1,
            "fail_reason":    None,
            "latency_ms":     None,
            "ip_address":     None,
        })

    # ══════════════════════════════════════════════════════
    # Subscribe / Publish / Command
    # ══════════════════════════════════════════════════════

    def subscribe(self, feed_key: str, callback: Callable[[FeedUpdate], None]):
        """Subscribe vào một Adafruit IO feed."""
        self.mqtt.subscribe(feed_key, callback)

    def on_door_command(self, callback: Callable[[FeedUpdate], None]):
        """Shortcut: lắng nghe lệnh door-lock từ dashboard."""
        self.subscribe(FEEDS["door_lock"], callback)

    def send_command(self, cmd: DeviceCommand):
        """
        Gửi lệnh điều khiển thiết bị lên Adafruit IO.
        Mạch thật subscribe feed này và thực thi lệnh.
        """
        feed = FEEDS.get(cmd.device_id)
        if feed:
            self.mqtt.publish(feed, cmd.action)
            logger.info(f"[PY→ADA→HW] {cmd.device_id} → {cmd.action}")
        else:
            logger.warning(
                f"Không tìm thấy device '{cmd.device_id}'. "
                f"Hợp lệ: {list(FEEDS.keys())}"
            )

    def publish(self, feed_key: str, value: Any) -> FeedUpdate:
        """Publish thẳng lên Adafruit qua REST (dùng khi cần gửi 1 lần)."""
        return self.rest.publish(feed_key, value)

    # ══════════════════════════════════════════════════════
    # Internal helper
    # ══════════════════════════════════════════════════════

    def _post_to_nodejs(self, endpoint: str, payload: dict):
        """POST dữ liệu về Node.js Local Server (:3001)."""
        url = f"{LOCAL_API}{endpoint}"
        try:
            resp = requests.post(url, json=payload, timeout=2)
            resp.raise_for_status()
            logger.debug(f"[PY→NODE] POST {endpoint} {resp.status_code}")
        except requests.exceptions.ConnectionError:
            logger.warning(f"Node.js chưa chạy — POST {endpoint} thất bại")
        except requests.exceptions.Timeout:
            logger.warning(f"POST {endpoint} timeout (>2s)")
        except requests.exceptions.HTTPError as e:
            logger.error(f"Node.js lỗi HTTP tại {endpoint}: {e}")
        except requests.exceptions.RequestException as e:
            logger.error(f"Lỗi POST {endpoint}: {e}")