"""
Real micro:bit driver using pyserial.

Requirements:
    pip install pyserial

The micro:bit must be running a MicroPython program that prints
JSON sensor data over serial. Example micro:bit code:

    import json
    from microbit import *

    while True:
        data = {
            "t": temperature(),
            "l": display.read_light_level(),
            "ax": accelerometer.get_x(),
            "ay": accelerometer.get_y(),
            "az": accelerometer.get_z(),
            "ba": button_a.was_pressed(),
            "bb": button_b.was_pressed(),
            "g": accelerometer.current_gesture(),
        }
        print(json.dumps(data))
        sleep(500)

Usage:
    mb = RealMicrobit(port="/dev/ttyACM0")
    mb.open()
    reading = mb.read_once()
    mb.close()
"""

import time
import json
import logging
from typing import Optional, Generator

from yolohome.data_models import MicrobitReading
from yolohome.devices.base import MicrobitDevice

logger = logging.getLogger(__name__)


class RealMicrobit(MicrobitDevice):
    """
    Reads sensor data from a micro:bit over USB serial.

    Args:
        port:      Serial port (e.g. "/dev/ttyACM0" on Linux,
                   "COM3" on Windows).
        baud_rate: Must match the micro:bit's serial speed (default 115200).
        timeout:   Read timeout in seconds.
    """

    def __init__(
        self,
        port: str = "/dev/ttyACM0",
        baud_rate: int = 115200,
        timeout: float = 2.0,
    ):
        self.port = port
        self.baud_rate = baud_rate
        self.timeout = timeout
        self._serial = None

    def open(self):
        import serial

        self._serial = serial.Serial(
            port=self.port,
            baudrate=self.baud_rate,
            timeout=self.timeout,
        )

        # Flush any stale data in the buffer
        self._serial.reset_input_buffer()

        logger.info(
            f"Micro:bit opened: port={self.port}, "
            f"baud={self.baud_rate}"
        )

    def close(self):
        if self._serial and self._serial.is_open:
            self._serial.close()
            logger.info("Micro:bit serial closed")
        self._serial = None

    def read_once(self, elapsed: float = 0.0) -> MicrobitReading:
        if self._serial is None or not self._serial.is_open:
            raise RuntimeError(
                "Micro:bit not connected. Call open() first."
            )

        line = self._serial.readline().decode("utf-8", errors="replace").strip()

        if not line:
            raise RuntimeError(
                "No data received from micro:bit "
                f"(timeout={self.timeout}s). "
                "Check that the micro:bit is running the sensor program."
            )

        try:
            data = json.loads(line)
        except json.JSONDecodeError as e:
            logger.warning(f"Bad JSON from micro:bit: {line!r}")
            raise RuntimeError(f"Invalid micro:bit data: {e}")

        # Map the compact JSON keys to MicrobitReading fields
        # (see the micro:bit code in the module docstring)
        gesture_raw = data.get("g", "")
        gesture = gesture_raw if gesture_raw not in ("", "face up", "face down") else None

        return MicrobitReading(
            timestamp=time.time(),
            temperature=float(data.get("t", 0)),
            light_level=int(data.get("l", 0)),
            accelerometer=(
                int(data.get("ax", 0)),
                int(data.get("ay", 0)),
                int(data.get("az", 0)),
            ),
            button_a_pressed=bool(data.get("ba", False)),
            button_b_pressed=bool(data.get("bb", False)),
            gesture=gesture,
        )

    def stream(
        self, duration: float = 10.0, interval: float = 0.5
    ) -> Generator[MicrobitReading, None, None]:
        start = time.time()

        while (time.time() - start) < duration:
            try:
                yield self.read_once()
            except RuntimeError as e:
                logger.warning(f"Skipping bad reading: {e}")
            time.sleep(interval)

    def __enter__(self):
        self.open()
        return self

    def __exit__(self, *args):
        self.close()

    @staticmethod
    def find_ports() -> list:
        """List serial ports that look like a micro:bit."""
        import serial.tools.list_ports

        candidates = []
        for port in serial.tools.list_ports.comports():
            desc = (port.description or "").lower()
            mfr = (port.manufacturer or "").lower()
            if any(
                kw in desc + mfr
                for kw in ("micro:bit", "microbit", "mbed", "arm")
            ):
                candidates.append({
                    "port": port.device,
                    "description": port.description,
                    "manufacturer": port.manufacturer,
                })
        return candidates
