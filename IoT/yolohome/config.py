"""
YOLOHOME — Configuration
=========================
Central config for thresholds, device params, Adafruit credentials, etc.
Loaded from config/settings.yaml, with env-var overrides.
"""

import os
import yaml
from pathlib import Path
from dataclasses import dataclass, field
from typing import Optional


CONFIG_DIR = Path(__file__).parent / "config"
DEFAULT_CONFIG = CONFIG_DIR / "settings.yaml"


@dataclass
class AdafruitConfig:
    username: str = ""
    aio_key: str = ""
    base_url: str = "https://io.adafruit.com/api/v2"
    mqtt_host: str = "io.adafruit.com"
    mqtt_port: int = 1883


@dataclass
class CameraConfig:
    width: int = 640
    height: int = 480
    fps: int = 15
    face_brightness_threshold: int = 100


@dataclass
class MicrophoneConfig:
    sample_rate: int = 16000
    chunk_ms: float = 100
    rms_threshold: float = 0.05


@dataclass
class MicrobitConfig:
    serial_port: str = "/dev/ttyACM0"
    baud_rate: int = 115200
    motion_accel_threshold: int = 1500


@dataclass
class ThresholdConfig:
    """Module 2 — threshold ranges for alerting."""
    temperature_min: float = 10.0
    temperature_max: float = 40.0
    light_min: int = 0
    light_max: int = 200
    sound_rms_alert: float = 0.4


@dataclass
class AppConfig:
    """Top-level config aggregating all sub-configs."""
    adafruit: AdafruitConfig = field(default_factory=AdafruitConfig)
    camera: CameraConfig = field(default_factory=CameraConfig)
    microphone: MicrophoneConfig = field(default_factory=MicrophoneConfig)
    microbit: MicrobitConfig = field(default_factory=MicrobitConfig)
    thresholds: ThresholdConfig = field(default_factory=ThresholdConfig)
    use_simulator: bool = True
    log_level: str = "INFO"


def load_config(path: Optional[Path] = None) -> AppConfig:
    """Load config from YAML file with env-var overrides."""
    path = path or DEFAULT_CONFIG
    cfg = AppConfig()

    if path.exists():
        with open(path) as f:
            raw = yaml.safe_load(f) or {}

        # Adafruit
        ada = raw.get("adafruit", {})
        cfg.adafruit.username = ada.get("username", "")
        cfg.adafruit.aio_key = ada.get("aio_key", "")

        # Camera
        cam = raw.get("camera", {})
        cfg.camera.width = cam.get("width", 640)
        cfg.camera.height = cam.get("height", 480)
        cfg.camera.fps = cam.get("fps", 15)
        cfg.camera.face_brightness_threshold = cam.get(
            "face_brightness_threshold", 100
        )

        # Microphone
        mic = raw.get("microphone", {})
        cfg.microphone.sample_rate = mic.get("sample_rate", 16000)
        cfg.microphone.chunk_ms = mic.get("chunk_ms", 100)
        cfg.microphone.rms_threshold = mic.get("rms_threshold", 0.05)

        # Microbit
        mb = raw.get("microbit", {})
        cfg.microbit.serial_port = mb.get("serial_port", "/dev/ttyACM0")
        cfg.microbit.motion_accel_threshold = mb.get(
            "motion_accel_threshold", 1500
        )

        # Thresholds
        th = raw.get("thresholds", {})
        cfg.thresholds.temperature_min = th.get("temperature_min", 10.0)
        cfg.thresholds.temperature_max = th.get("temperature_max", 40.0)

        # Top-level
        cfg.use_simulator = raw.get("use_simulator", True)
        cfg.log_level = raw.get("log_level", "INFO")

    # Environment variable overrides (useful for CI / deployment)
    cfg.adafruit.username = os.getenv(
        "AIO_USERNAME", cfg.adafruit.username
    )
    cfg.adafruit.aio_key = os.getenv("AIO_KEY", cfg.adafruit.aio_key)
    cfg.use_simulator = os.getenv(
        "USE_SIMULATOR", str(cfg.use_simulator)
    ).lower() in ("true", "1", "yes")

    return cfg
