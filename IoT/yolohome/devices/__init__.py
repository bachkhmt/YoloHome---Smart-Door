"""
Device factory — creates the right device based on config.

This is the single place where sim ↔ real switching happens.
Everything else in the pipeline only sees CameraDevice,
MicrophoneDevice, MicrobitDevice.

Usage:
    from devices import create_devices

    cam, mic, mb = create_devices(config)
    cam.open()
    frame = cam.capture_once()
"""

import logging
from typing import Tuple

from yolohome.config import AppConfig, load_config
from yolohome.devices.base import CameraDevice, MicrophoneDevice, MicrobitDevice

logger = logging.getLogger(__name__)


def create_camera(config: AppConfig) -> CameraDevice:
    if config.use_simulator:
        from yolohome.simulators.camera_sim import SimulatedCamera
        return SimulatedCamera(
            resolution=(config.camera.width, config.camera.height),
            fps=config.camera.fps,
        )
    else:
        from yolohome.devices.real_camera import RealCamera
        return RealCamera(
            width=config.camera.width,
            height=config.camera.height,
            fps=config.camera.fps,
        )


def create_microphone(config: AppConfig) -> MicrophoneDevice:
    if config.use_simulator:
        from yolohome.simulators.microphone_sim import SimulatedMicrophone
        return SimulatedMicrophone(
            sample_rate=config.microphone.sample_rate,
        )
    else:
        from yolohome.devices.real_microphone import RealMicrophone
        return RealMicrophone(
            sample_rate=config.microphone.sample_rate,
        )


def create_microbit(config: AppConfig) -> MicrobitDevice:
    if config.use_simulator:
        from yolohome.simulators.microbit_sim import SimulatedMicrobit
        return SimulatedMicrobit()
    else:
        from yolohome.devices.real_microbit import RealMicrobit
        return RealMicrobit(
            port=config.microbit.serial_port,
            baud_rate=config.microbit.baud_rate,
        )


def create_devices(
    config: AppConfig = None,
) -> Tuple[CameraDevice, MicrophoneDevice, MicrobitDevice]:
    """Create all three devices based on config."""
    config = config or load_config()
    mode = "simulator" if config.use_simulator else "real hardware"
    logger.info(f"Creating devices in {mode} mode")

    return (
        create_camera(config),
        create_microphone(config),
        create_microbit(config),
    )
