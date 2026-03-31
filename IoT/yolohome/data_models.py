"""
YOLOHOME — Shared data models
==============================
All data classes that cross module boundaries live here.
Simulators produce these, modules consume them.
"""

import time
import numpy as np
from dataclasses import dataclass, field
from typing import Optional, List
from enum import Enum


# ─── Sensor / Hardware Data ─────────────────────────────────────────────────

class SensorEvent(Enum):
    BUTTON_A = "button_a"
    BUTTON_B = "button_b"
    SHAKE = "shake"
    TILT_LEFT = "tilt_left"
    TILT_RIGHT = "tilt_right"


@dataclass
class MicrobitReading:
    """A single snapshot from the micro:bit sensors."""
    timestamp: float
    temperature: float
    light_level: int
    accelerometer: tuple        # (x, y, z) in milli-g
    button_a_pressed: bool
    button_b_pressed: bool
    gesture: Optional[str] = None

    def is_door_trigger(self) -> bool:
        return self.button_a_pressed or self.gesture == "shake"

    def to_dict(self) -> dict:
        return {
            "timestamp": self.timestamp,
            "temperature": self.temperature,
            "light_level": self.light_level,
            "accelerometer": list(self.accelerometer),
            "button_a": self.button_a_pressed,
            "button_b": self.button_b_pressed,
            "gesture": self.gesture,
        }


@dataclass
class CameraFrame:
    """A single camera frame."""
    timestamp: float
    frame: np.ndarray           # HxWxC uint8
    frame_id: int
    width: int
    height: int
    channels: int = 3

    @property
    def shape(self) -> tuple:
        return self.frame.shape


@dataclass
class AudioChunk:
    """A chunk of audio samples."""
    timestamp: float
    samples: np.ndarray         # 1D float32, [-1, 1]
    sample_rate: int
    chunk_id: int
    duration_ms: float

    @property
    def rms(self) -> float:
        return float(np.sqrt(np.mean(self.samples ** 2)))

    @property
    def peak(self) -> float:
        return float(np.max(np.abs(self.samples)))


@dataclass
class FaceRegion:
    """Detected face bounding box."""
    x: int
    y: int
    w: int
    h: int
    label: str = "unknown"
    confidence: float = 0.0

    def to_dict(self) -> dict:
        return {
            "x": self.x, "y": self.y,
            "w": self.w, "h": self.h,
            "label": self.label,
            "confidence": self.confidence,
        }


# ─── Parsed Events (output of Module 1, consumed by M2-M5) ─────────────────

class EventType(Enum):
    FACE_DETECTED = "face_detected"
    SOUND_DETECTED = "sound_detected"
    BUTTON_TRIGGER = "button_trigger"
    MOTION_TRIGGER = "motion_trigger"
    ENVIRONMENT = "environment_update"
    DOOR_UNLOCK_REQUEST = "door_unlock_request"


@dataclass
class ParsedEvent:
    """Hardware-agnostic event emitted by the input parser."""
    event_type: EventType
    timestamp: float
    source: str                 # "camera", "microphone", "microbit"
    data: dict = field(default_factory=dict)
    confidence: float = 1.0

    def to_dict(self) -> dict:
        return {
            "event_type": self.event_type.value,
            "timestamp": self.timestamp,
            "source": self.source,
            "data": self.data,
            "confidence": self.confidence,
        }

    def __repr__(self):
        return (
            f"ParsedEvent({self.event_type.value}, "
            f"source={self.source}, conf={self.confidence:.2f})"
        )


# ─── Gateway / Adafruit Feed Data ──────────────────────────────────────────
@dataclass
class FeedUpdate:
    """A single value pushed to / pulled from an Adafruit IO feed."""
    feed_key: str
    value: str
    timestamp: float = field(default_factory=time.time)

    def to_dict(self) -> dict:
        return {
            "feed_key": self.feed_key,
            "value": self.value,
            "timestamp": self.timestamp,
        }


@dataclass
class DeviceCommand:
    """Command sent to an output device (door lock, LED, buzzer, etc.)."""
    device_id: str
    action: str                 # "unlock", "lock", "on", "off", "set"
    params: dict = field(default_factory=dict)
    timestamp: float = field(default_factory=time.time)
