"""
IoT Gateway — unified interface for server communication.

FIXED: Thêm publish door state lên Adafruit khi mở/khóa cửa thành công.
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

OBSTACLE_DISTANCE_THRESHOLD_CM = 30.0 # Khoảng cách dưới 30cm được coi là có vật cản
OBSTACLE_ALERT_COOLDOWN_SECONDS = 30

FEEDS = {
    "temperature":  "yolohome.temperature",
    "light":        "yolohome.light",
    "sound":        "yolohome.sound-event",
    "distance":     "yolohome.distance",
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
        self._last_obstacle_trigger_at = 0.0

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
        self.subscribe(FEEDS["distance"],    self._on_distance_update)

        # Flow B: kết quả nhận diện khuôn mặt
        self.subscribe(FEEDS["face"],        self._on_face_update)

        # Flow C: lệnh từ Adafruit Dashboard / Frontend
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

        logger.info(f"[DEVICE→ADA→PY] Sensor [{feed_key}]: {raw}")

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
            
    def _on_distance_update(self, update: FeedUpdate):
        """
        Module 2 — Obstacle / presence trigger.

        Khi cảm biến khoảng cách phát hiện vật cản/người ở gần cửa:
        1. Kiểm tra distance < OBSTACLE_DISTANCE_THRESHOLD_CM
        2. Nếu đúng, kích hoạt camera/auth callback để chụp ảnh/xác thực
        3. Gửi cảnh báo lên backend
        4. Dùng cooldown để tránh spam cảnh báo liên tục
        """
        raw = update.value
        logger.info(f"[DEVICE→ADA→PY] Distance sensor [{update.feed_key}]: {raw}")

        try:
            distance_cm = float(raw)
        except (ValueError, TypeError):
            logger.warning(f"Giá trị khoảng cách không hợp lệ: {raw!r}")
            return

        if distance_cm >= OBSTACLE_DISTANCE_THRESHOLD_CM:
            self._post_to_nodejs("/alerts/resolve-by-type", {
                "alert_type": "target_in_range"
            })
            return

        now = time.time()
        if now - self._last_obstacle_trigger_at < OBSTACLE_ALERT_COOLDOWN_SECONDS:
            logger.info(
                f"Obstacle trigger bị bỏ qua do cooldown: "
                f"{distance_cm}cm < {OBSTACLE_DISTANCE_THRESHOLD_CM}cm"
            )
            return

        self._last_obstacle_trigger_at = now

        logger.warning(
            f"Phát hiện vật cản/người trước cửa: "
            f"{distance_cm}cm < {OBSTACLE_DISTANCE_THRESHOLD_CM}cm"
        )

        # 1. Kích hoạt chụp ảnh / xác thực nếu camera callback đã đăng ký
        if self._auth_callback:
            try:
                self._auth_callback()
                logger.info("Đã kích hoạt camera/auth callback từ distance sensor")
            except Exception as e:
                logger.error(f"Lỗi khi kích hoạt auth callback từ distance sensor: {e}", exc_info=True)
        else:
            logger.warning(
                "Phát hiện vật cản nhưng chưa có auth callback. "
                "Cần gọi gateway.set_auth_callback(...) trong module camera/AI."
            )

        # 2. Gửi cảnh báo lên backend
        self._post_to_nodejs("/alerts", {
            "alert_type": "target_in_range",
            "severity": "low",
            "message": (
                f"Phát hiện người/vật cản trong vùng truy cập "
                f"ở khoảng cách {distance_cm:.1f}cm"
            ),
        })

    # ══════════════════════════════════════════════════════
    # Flow B: Camera AI → Adafruit → Python → Node.js
    # ══════════════════════════════════════════════════════

    def _on_face_update(self, update: FeedUpdate):
        """
        Xử lý kết quả nhận diện — được gọi sau CẢ HAI loại detect:
          • Auto detect từ vòng loop liên tục
          • Instant detect từ UI trigger

        FIXED: Tự động mở cửa nếu nhận ra người quen,
               và PUBLISH trạng thái "UNLOCK" lên Adafruit.
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
            
            # ✅ FIX CHÍNH: Publish trạng thái cửa lên Adafruit
            self.mqtt.publish(FEEDS["door_lock"], "UNLOCK")
            logger.info("📤 [PY→ADA] Published door state: UNLOCK")

    # ══════════════════════════════════════════════════════
    # Flow C: Adafruit Dashboard / Frontend → Python → Hardware
    # ══════════════════════════════════════════════════════

    def _on_door_command_from_cloud(self, update: FeedUpdate):
        """
        Nhận lệnh UNLOCK/LOCK từ Frontend (qua Adafruit).
        
        Flow:
          1. Frontend publish "UNLOCK" lên yolohome.door-lock
          2. Python nhận được ở đây
          3. Điều khiển hardware (ESP32-CAM flash LED)
        """
        action = update.value.strip().upper()
        logger.info(f"[CLOUD→PY] Lệnh cửa từ Frontend/Dashboard: {action}")

        # Điều khiển ESP32-CAM flash LED
        if action == "UNLOCK":
            logger.info("🔓 Đang thực hiện mở khóa (Bật Flash)...")
            try:
                requests.get("http://192.168.1.131/control?var=led_intensity&val=10", timeout=1)
                logger.info("Đã bật Flash LED")
            except Exception as e:
                logger.error(f"❌ Lỗi điều khiển thiết bị: {e}")
                
        elif action == "LOCK":
            logger.info("🔒 Đang thực hiện khóa (Tắt Flash)...")
            try:
                requests.get("http://192.168.1.131/control?var=led_intensity&val=0", timeout=1)
                logger.info("Đã tắt Flash LED")
            except Exception as e:
                logger.error(f"❌ Lỗi điều khiển thiết bị: {e}")

        # Cập nhật trạng thái cửa vào backend để alert door_left_unlocked hoạt động
        if action in ("UNLOCK", "LOCK"):
            self._post_to_nodejs("/door/state", {
                "locked": 0 if action == "UNLOCK" else 1,
                "changed_by": None,
                "source": "auto",
            })

        # Log vào Node.js
        self._post_to_nodejs("/logs", {
            "user_id":     None,
            "user_name":   "System",
            "method":      "Door",
            "action":      f"door_{action.lower()}",
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
        logger.info("Instant auth trigger callback đã được đăng ký")

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
        """DEPRECATED: Dùng subscribe() trực tiếp."""
        self.subscribe(FEEDS["door_lock"], callback)

    def send_command(self, cmd: DeviceCommand):
        feed = FEEDS.get(cmd.device_id)
        if feed:
            self.mqtt.publish(feed, cmd.action)
            logger.info(f"[PY→ADA→DEVICE] {cmd.device_id} → {cmd.action}")
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