"""
YOLO Home — run.py
Đặt vào: YOLOHOME/ (cùng cấp với run.sh, pyproject.toml)
Chạy: python run.py
Yêu cầu Node server chạy trước: cd server && node index.js
"""
import time, signal, logging, threading, sys
from yolohome.config import load_config
from yolohome.input_manager import InputManager
from gateway_bridge import BridgeGateway

logging.basicConfig(level=logging.INFO,
    format="%(asctime)s [%(levelname)s] %(name)s — %(message)s")
logger = logging.getLogger("yolohome.run")

def main():
    config  = load_config()
    logger.info(f"YOLO Home — {'simulator' if config.use_simulator else 'hardware'}")

    gateway = BridgeGateway(config)
    gateway.start()

    # --- ĐOẠN CẦN THÊM VÀO ĐÂY ---
    def handle_mqtt_command(update):
        # Hàm này sẽ chạy khi có dữ liệu mới từ Adafruit
        command = str(update.value).upper()
        logger.info(f"==> NHẬN LỆNH TỪ ADAFRUIT: {command}")
        
        if command == "UNLOCK":
            logger.info("🔓 Đang thực hiện mở khóa...")
            # Thêm code điều khiển phần cứng của bạn ở đây
        elif command == "LOCK":
            logger.info("🔒 Đang thực hiện khóa...")
            # Thêm code điều khiển phần cứng của bạn ở đây

    # Đăng kí lắng nghe kênh door-lock
    gateway.on_door_command(handle_mqtt_command)
    # ----------------------------------------------------

    manager = InputManager(config)
    manager.set_gateway(gateway)
    manager.on_event(lambda e: logger.info(f"EVENT → {e}"))

    threading.Thread(target=gateway.poll_controls_loop,
                     kwargs={"interval": 1.5}, daemon=True).start()
    manager.start()

    def shutdown(sig, frame):
        manager.stop(); gateway.stop(); sys.exit(0)
    signal.signal(signal.SIGINT, shutdown)
    signal.signal(signal.SIGTERM, shutdown)

    logger.info("Running. Ctrl+C to stop.")
    while True:
        time.sleep(1)

if __name__ == "__main__":
    main()