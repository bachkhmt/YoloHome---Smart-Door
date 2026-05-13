"""YOLO Home — entrypoint.

Run: python run.py
Requires Node server running: cd server && node index.js
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