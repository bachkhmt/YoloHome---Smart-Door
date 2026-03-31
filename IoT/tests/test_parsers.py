"""Tests for Module 1 — Input Parser."""

import sys
import os
import time

# Add project root to path
sys.path.insert(0, os.path.dirname(os.path.dirname(
    os.path.dirname(os.path.dirname(os.path.abspath(__file__)))
)))

from yolohome.data_models import (
    CameraFrame, AudioChunk, MicrobitReading,
    EventType, ParsedEvent,
)
from yolohome.parsers.camera_parser import CameraParser
from yolohome.parsers.sound_parser import SoundParser
from yolohome.parsers.microbit_device import MicrobitParser
from yolohome.simulators import SimulatedCamera, SimulatedMicrophone, SimulatedMicrobit

import numpy as np


def test_camera_parser_detects_face():
    """Camera parser should detect a face in a bright region."""
    cam = SimulatedCamera(scenario="single_face")
    parser = CameraParser(brightness_threshold=100, cooldown=0.0)

    frame = cam.capture_once(elapsed=2.0)  # after face appears
    event = parser.parse(frame)

    assert event is not None, "Expected FACE_DETECTED event"
    assert event.event_type == EventType.FACE_DETECTED
    assert event.data["num_faces"] >= 1
    print("  PASS: camera_parser detects face")


def test_camera_parser_empty_frame():
    """Camera parser should return None for empty frames."""
    cam = SimulatedCamera(scenario="empty")
    parser = CameraParser(brightness_threshold=100, cooldown=0.0)

    frame = cam.capture_once(elapsed=0.0)
    event = parser.parse(frame)

    assert event is None, "Expected None for empty frame"
    print("  PASS: camera_parser returns None for empty")


def test_camera_parser_dark_frame():
    """Camera parser should return None for dark/underexposed frames."""
    cam = SimulatedCamera(scenario="dark")
    parser = CameraParser(brightness_threshold=100, cooldown=0.0)

    frame = cam.capture_once(elapsed=0.0)
    event = parser.parse(frame)

    assert event is None, "Expected None for dark frame"
    print("  PASS: camera_parser returns None for dark frame")


def test_camera_parser_cooldown():
    """Camera parser should respect cooldown between events."""
    cam = SimulatedCamera(scenario="single_face")
    parser = CameraParser(brightness_threshold=100, cooldown=2.0)

    f1 = cam.capture_once(elapsed=2.0)
    e1 = parser.parse(f1)
    assert e1 is not None

    f2 = cam.capture_once(elapsed=2.1)
    e2 = parser.parse(f2)
    assert e2 is None, "Expected None due to cooldown"
    print("  PASS: camera_parser respects cooldown")


def test_sound_parser_detects_doorbell():
    """Sound parser should detect a tonal sound."""
    mic = SimulatedMicrophone(scenario="doorbell")
    parser = SoundParser(rms_threshold=0.03, cooldown=0.0)

    # Capture chunk during the doorbell event (t=1.0..1.6s)
    chunk = mic.capture_chunk(elapsed=1.2, chunk_ms=100)
    event = parser.parse(chunk)

    assert event is not None, "Expected SOUND_DETECTED event"
    assert event.event_type == EventType.SOUND_DETECTED
    assert event.data["sound_type"] == "tonal"
    print("  PASS: sound_parser detects doorbell (tonal)")


def test_sound_parser_silence():
    """Sound parser should return None for silence."""
    mic = SimulatedMicrophone(scenario="silence")
    parser = SoundParser(rms_threshold=0.03, cooldown=0.0)

    chunk = mic.capture_chunk(elapsed=0.0, chunk_ms=100)
    event = parser.parse(chunk)

    assert event is None, "Expected None for silence"
    print("  PASS: sound_parser returns None for silence")


def test_sound_parser_knock():
    """Sound parser should detect impulse sounds."""
    mic = SimulatedMicrophone(scenario="knock")
    parser = SoundParser(rms_threshold=0.03, cooldown=0.0)

    chunk = mic.capture_chunk(elapsed=0.5, chunk_ms=100)
    event = parser.parse(chunk)

    assert event is not None, "Expected SOUND_DETECTED for knock"
    assert event.data["sound_type"] == "impulse"
    print("  PASS: sound_parser detects knock (impulse)")


def test_microbit_parser_button():
    """Micro:bit parser should detect button presses."""
    mb = SimulatedMicrobit(scenario="button_press")
    parser = MicrobitParser()

    reading = mb.read_once(elapsed=2.0)  # button A pressed
    events = parser.parse(reading)

    types = [e.event_type for e in events]
    assert EventType.BUTTON_TRIGGER in types, (
        "Expected BUTTON_TRIGGER event"
    )
    assert EventType.ENVIRONMENT in types, (
        "Expected ENVIRONMENT event (always emitted)"
    )
    print("  PASS: microbit_parser detects button A")


def test_microbit_parser_shake():
    """Micro:bit parser should detect shake gesture."""
    mb = SimulatedMicrobit(scenario="shake_unlock")
    parser = MicrobitParser(motion_accel_threshold=1500)

    reading = mb.read_once(elapsed=1.0)
    events = parser.parse(reading)

    types = [e.event_type for e in events]
    assert EventType.MOTION_TRIGGER in types, (
        "Expected MOTION_TRIGGER event"
    )
    print("  PASS: microbit_parser detects shake")


def test_microbit_parser_idle():
    """Micro:bit parser in idle should only emit ENVIRONMENT."""
    mb = SimulatedMicrobit(scenario="idle")
    parser = MicrobitParser()

    reading = mb.read_once(elapsed=0.0)
    events = parser.parse(reading)

    types = [e.event_type for e in events]
    assert EventType.ENVIRONMENT in types
    assert EventType.BUTTON_TRIGGER not in types
    assert EventType.MOTION_TRIGGER not in types
    print("  PASS: microbit_parser idle emits only ENVIRONMENT")


def test_parsed_event_serialization():
    """ParsedEvent.to_dict() should produce valid dicts."""
    event = ParsedEvent(
        event_type=EventType.FACE_DETECTED,
        timestamp=time.time(),
        source="camera",
        data={"frame_id": 1, "num_faces": 2},
        confidence=0.9,
    )
    d = event.to_dict()
    assert d["event_type"] == "face_detected"
    assert d["source"] == "camera"
    assert d["data"]["num_faces"] == 2
    print("  PASS: ParsedEvent serialization")


if __name__ == "__main__":
    print("=" * 50)
    print("Module 1 — Input Parser Tests")
    print("=" * 50)

    tests = [
        test_camera_parser_detects_face,
        test_camera_parser_empty_frame,
        test_camera_parser_dark_frame,
        test_camera_parser_cooldown,
        test_sound_parser_detects_doorbell,
        test_sound_parser_silence,
        test_sound_parser_knock,
        test_microbit_parser_button,
        test_microbit_parser_shake,
        test_microbit_parser_idle,
        test_parsed_event_serialization,
    ]

    passed = 0
    failed = 0
    for test_fn in tests:
        try:
            test_fn()
            passed += 1
        except Exception as e:
            print(f"  FAIL: {test_fn.__name__} — {e}")
            failed += 1

    print(f"\nResults: {passed} passed, {failed} failed")
