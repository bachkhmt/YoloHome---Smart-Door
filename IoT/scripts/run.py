"""
YOLOHOME — Main entry point
=============================
Wires up Module 1 (input parser) + IoT Gateway and runs a demo.

Usage:
    python run.py                      # default 5s demo
    python run.py --duration 10        # 10s demo
    python run.py --scenario doorbell  # specific mic scenario
"""

import time
import logging
import argparse

from yolohome.config import load_config
from yolohome.data_models import ParsedEvent, EventType
from yolohome.gateway import Gateway
from yolohome.input_manager import InputManager

logger = logging.getLogger(__name__)


def setup_logging(level: str = "INFO"):
    logging.basicConfig(
        level=getattr(logging, level),
        format="%(asctime)s [%(name)-20s] %(levelname)-5s %(message)s",
        datefmt="%H:%M:%S",
    )


def main():
    parser = argparse.ArgumentParser(description="YOLOHOME demo")
    parser.add_argument(
        "--duration", type=float, default=5.0,
        help="Demo duration in seconds",
    )
    parser.add_argument(
        "--log-level", default="INFO",
        choices=["DEBUG", "INFO", "WARNING"],
    )
    args = parser.parse_args()

    setup_logging(args.log_level)
    config = load_config()

    # ── Start gateway ──
    gw = Gateway(config)
    gw.start()

    # ── Start Module 1 ──
    manager = InputManager(config)
    manager.set_gateway(gw)

    # Log non-environment events to console
    def on_event(event: ParsedEvent):
        if event.event_type != EventType.ENVIRONMENT:
            logger.info(f">> {event}")

    manager.on_event(on_event)

    mode = "simulator" if config.use_simulator else "real hardware"
    logger.info("=" * 55)
    logger.info(f"YOLOHOME — Module 1 demo ({mode} mode)")
    logger.info(f"Running for {args.duration}s...")
    logger.info("=" * 55)

    manager.start()
    try:
        logger.info("Press Ctrl+C to stop...")
        while True:
            time.sleep(1)  # Infinite loop
    except KeyboardInterrupt:
        logger.info("Shutting down...")
    finally:
        manager.stop()
        gw.stop()

    # ── Summary ──
    logger.info(f"\n{'— Summary ':—<55}")
    by_type: dict = {}
    for e in manager.event_log:
        by_type.setdefault(e.event_type.value, 0)
        by_type[e.event_type.value] += 1
        
    for k, v in sorted(by_type.items()):
        logger.info(f"  {k}: {v}")
    logger.info(f"  total: {len(manager.event_log)}")

    # Show what the gateway received
    mqtt_msgs = gw.mqtt.get_sim_messages()
    logger.info(f"\nGateway MQTT messages sent: {len(mqtt_msgs)}")


if __name__ == "__main__":
    main()
