


"""
IoT Gateway — unified interface for server communication.

Cải tiến: Thêm instant auth trigger — camera vẫn auto detect liên tục,
nhưng bấm nút "Xác Thực" trên UI sẽ kích hoạt detect NGAY LẬP TỨC.

Feeds:
    yolohome.auth-trigger — nhận instant trigger từ React UI
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
    Unified IoT gateway — tất cả module giao tiếp với server qua class này.

    Public API:
        start()               — kết nối MQTT + subscribe tất cả feed
        stop()                — ngắt kết nối
        sync_event(event)     — Python/AI module gửi ParsedEvent vào đây
        send_command(cmd)     — điều khiển thiết bị đầu ra
        subscribe(feed, cb)   — đăng ký lắng nghe feed bất kỳ
        publish(feed, val)    — publish thẳng lên Adafruit qua REST

        set_auth_callback(cb) — đăng ký callback khi có INSTANT trigger từ UI
                                Camera vẫn auto detect liên tục, callback này
                                chỉ được gọi khi user bấm nút "Xác Thực"
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

        # Callback được gọi khi nhận INSTANT trigger từ UI
        # (khác với auto detect loop — cái này chỉ fire khi user bấm nút)
        self._auth_callback: Optional[Callable[[], None]] = None

    # ══════════════════════════════════════════════════════
    # Lifecycle
    # ══════════════════════════════════════════════════════

    def start(self):
        """Kết nối MQTT và subscribe tất cả feed cần thiết."""
        self.mqtt.connect()

        # Flow A: cảm biến môi trường từ mạch thật
        self.subscribe(FEEDS["temperature"], self._on_sensor_update)
        self.subscribe(FEEDS["light"],       self._on_sensor_update)
        self.subscribe(FEEDS["sound"],       self._on_sensor_update)

        # Flow B: kết quả nhận diện khuôn mặt
        self.subscribe(FEEDS["face"],        self._on_face_update)

        # Flow C: lệnh từ Adafruit Dashboard
        self.subscribe(FEEDS["door_lock"],   self._on_door_command_from_cloud)

        # Flow D: INSTANT trigger từ React UI bấm nút "Xác Thực"
        self.subscribe(FEEDS["auth_trigger"], self._on_auth_trigger)

        logger.info("Gateway started — subscribed to all feeds")

    def stop(self):
        self.mqtt.disconnect()
        logger.info("Gateway stopped")

    # ══════════════════════════════════════════════════════
    # Flow A: Mạch thật → Adafruit → Python → Node.js
    # ══════════════════════════════════════════════════════

    def _on_sensor_update(self, update: FeedUpdate):
        feed_key = update.feed_key
        raw = update.value

        logger.info(f"[HW→ADA→PY] Sensor [{feed_key}]: {raw}")

        try:
            value = float(raw)
        except (ValueError, TypeError):
            logger.warning(f"Giá trị không hợp lệ từ {feed_key}: {raw!r}")
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
        Xử lý kết quả nhận diện — được gọi sau CẢ HAI loại detect:
          • Auto detect từ vòng loop liên tục
          • Instant detect từ UI trigger

        Tự động mở cửa nếu nhận ra người quen.
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

        # Log về Node.js để hiển thị lên React AccessLog + ActivityChart
        self._post_to_nodejs("/logs", {
            "user_id":     data.get("user_id"),
            "user_name":   label,
            "method":      "Face",
            "action":      "Vào",
            "success":     1 if is_known else 0,
            "fail_reason": None if is_known else "Người lạ",
            "latency_ms":  None,
            "ip_address":  None,
        })

        # Tự động mở cửa nếu nhận ra người quen
        if is_known:
            logger.info(f"🔓 Chào {label}! Đang mở cửa...")
            self.send_command(DeviceCommand("door_lock", "unlock"))

    # ══════════════════════════════════════════════════════
    # Flow C: Adafruit Dashboard → Python → Node.js
    # ══════════════════════════════════════════════════════

    def _on_door_command_from_cloud(self, update: FeedUpdate):
        action = update.value.strip().lower()
        logger.info(f"[CLOUD→PY] Lệnh cửa từ dashboard: {action}")

        self._post_to_nodejs("/logs", {
            "user_id":     None,
            "user_name":   "Dashboard",
            "method":      "Manual",
            "action":      f"door_{action}",
            "success":     1,
            "fail_reason": None,
            "latency_ms":  None,
            "ip_address":  None,
        })

    # ══════════════════════════════════════════════════════
    # Flow D: React UI bấm nút → INSTANT detect
    # ══════════════════════════════════════════════════════

    def _on_auth_trigger(self, update: FeedUpdate):
        """
        Callback khi nhận INSTANT trigger từ React UI.

        Lưu ý: Camera vẫn đang auto detect liên tục theo loop.
        Callback này chỉ kích hoạt thêm 1 lần detect NGAY LẬP TỨC
        khi user chủ động bấm nút, không liên quan đến loop chính.
        """
        logger.info(f"[UI→ADA→PY] 🔔 Nhận instant trigger: {update.value}")

        if self._auth_callback:
            try:
                self._auth_callback()
            except Exception as e:
                logger.error(f"Auth callback error: {e}", exc_info=True)
        else:
            logger.warning(
                "⚠️ Nhận instant trigger nhưng chưa có callback\n"
                "   → Gọi gateway.set_auth_callback() để đăng ký"
            )

    def set_auth_callback(self, callback: Callable[[], None]):
        """
        Đăng ký callback cho INSTANT trigger từ UI bấm nút "Xác Thực".

        Callback này được gọi song song với auto detect loop —
        camera vẫn chạy liên tục, đây chỉ là detect thêm ngay lập tức.

        Callback nên:
          1. Chạy trong thread riêng (không block MQTT)
          2. Dùng lock nếu dùng chung camera với auto loop

        Example:
            def on_instant_trigger():
                # Chạy trong thread riêng, dùng lock chung với auto loop
                with detect_lock:
                    frame = camera.capture_once()
                    result = face_parser.parse(frame)
                    gateway.sync_event(result)

            gateway.set_auth_callback(on_instant_trigger)
        """
        self._auth_callback = callback
        logger.info("✅ Instant auth trigger callback đã được đăng ký")

    # ══════════════════════════════════════════════════════
    # sync_event — Python/AI modules gọi vào đây
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
            is_known = label not in ("unknown", "Người lạ")
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
            "fail_reason": "Âm thanh bất thường",
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
        self.subscribe(FEEDS["door_lock"], callback)

    def send_command(self, cmd: DeviceCommand):
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
            logger.warning(f"Node.js chưa chạy — POST {endpoint} thất bại")
        except requests.exceptions.Timeout:
            logger.warning(f"POST {endpoint} timeout (>2s)")
        except requests.exceptions.HTTPError as e:
            logger.error(f"Node.js lỗi HTTP tại {endpoint}: {e}")
        except requests.exceptions.RequestException as e:
            logger.error(f"Lỗi POST {endpoint}: {e}")