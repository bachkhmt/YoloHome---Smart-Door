"""
Micro:bit parser — optional sensor check.

Parses button presses, shake gestures, and environment readings.
This is an auxiliary input; the primary unlock path is
face recognition + sound recognition.
"""

import logging
from typing import Optional, List

from yolohome.data_models import MicrobitReading, ParsedEvent, EventType

logger = logging.getLogger(__name__)


class MicrobitParser:
    """
    Consumes MicrobitReading objects and emits:
        - BUTTON_TRIGGER   when a button is pressed
        - MOTION_TRIGGER   when the accelerometer exceeds threshold
        - ENVIRONMENT      on every reading (for dashboard display)
    """

    def __init__(self, motion_accel_threshold: int = 1500):
        self.motion_accel_threshold = motion_accel_threshold

    def parse(self, reading: MicrobitReading) -> List[ParsedEvent]:
        """
        Parse a single micro:bit reading into zero or more events.

        Returns:
            List of ParsedEvents (may be empty).
        """
        events: List[ParsedEvent] = []

        # Button presses
        if reading.button_a_pressed:
            events.append(ParsedEvent(
                event_type=EventType.BUTTON_TRIGGER,
                timestamp=reading.timestamp,
                source="microbit",
                data={"button": "A"},
            ))
            logger.info("Button A pressed")

        if reading.button_b_pressed:
            events.append(ParsedEvent(
                event_type=EventType.BUTTON_TRIGGER,
                timestamp=reading.timestamp,
                source="microbit",
                data={"button": "B"},
            ))

        # Motion / shake detection
        ax, ay, az = reading.accelerometer
        magnitude = (ax ** 2 + ay ** 2 + az ** 2) ** 0.5

        if (
            magnitude > self.motion_accel_threshold
            or reading.gesture == "shake"
        ):
            events.append(ParsedEvent(
                event_type=EventType.MOTION_TRIGGER,
                timestamp=reading.timestamp,
                source="microbit",
                data={
                    "gesture": reading.gesture,
                    "accel_magnitude": round(magnitude, 1),
                },
            ))
            logger.info(
                f"Motion detected: gesture={reading.gesture}, "
                f"magnitude={magnitude:.0f}"
            )

        # Environment (always emit — used for dashboard + threshold checks)
        events.append(ParsedEvent(
            event_type=EventType.ENVIRONMENT,
            timestamp=reading.timestamp,
            source="microbit",
            data={
                "temperature": reading.temperature,
                "light_level": reading.light_level,
            },
        ))

        return events
