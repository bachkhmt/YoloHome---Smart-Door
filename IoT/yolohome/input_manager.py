"""
Input Manager — Module 1 orchestrator.

Wires up the three parsers (camera, sound, micro:bit) to their
data sources (simulator or real hardware), collects ParsedEvents,
and optionally forwards them to the Gateway.
"""

import time
import logging
import threading
from typing import Optional, List, Callable

from yolohome.config import AppConfig, load_config
from yolohome.data_models import (
    ParsedEvent,
    CameraFrame,
    AudioChunk,
    MicrobitReading,
)
from yolohome.parsers.camera_parser import CameraParser
from yolohome.parsers.sound_parser import SoundParser
from yolohome.parsers.microbit_device import MicrobitParser

logger = logging.getLogger(__name__)


class InputManager:
    """
    Central orchestrator for Module 1.

    Responsibilities:
        1. Start data sources (simulators or real hardware)
        2. Feed data through the appropriate parser
        3. Emit ParsedEvents to registered callbacks
        4. Optionally sync events to the IoT Gateway

    Usage:
        manager = InputManager()
        manager.on_event(my_handler)
        manager.start()
        time.sleep(10)
        manager.stop()
        print(manager.event_log)
    """

    def __init__(self, config: Optional[AppConfig] = None):
        self.config = config or load_config()

        # Initialize parsers with config values
        self.camera_parser = CameraParser()
        self.sound_parser = SoundParser(
            rms_threshold=self.config.microphone.rms_threshold,
        )
        self.microbit_parser = MicrobitParser(
            motion_accel_threshold=self.config.microbit.motion_accel_threshold,
        )

        # Event subscribers
        self._event_handlers: List[Callable[[ParsedEvent], None]] = []

        # Event log (for testing / debugging)
        self.event_log: List[ParsedEvent] = []

        # Gateway reference (set externally via set_gateway)
        self._gateway = None

        # Threading
        self._running = False
        self._threads: List[threading.Thread] = []

    def set_gateway(self, gateway):
        """Attach an IoT Gateway to auto-sync events to Adafruit IO."""
        self._gateway = gateway

    def on_event(self, handler: Callable[[ParsedEvent], None]):
        """Register a callback for parsed events."""
        self._event_handlers.append(handler)

    def _emit(self, event: ParsedEvent):
        """Dispatch an event to all subscribers + log + gateway."""
        self.event_log.append(event)

        for handler in self._event_handlers:
            try:
                handler(event)
            except Exception as e:
                logger.error(f"Event handler error: {e}")

        if self._gateway:
            try:
                self._gateway.sync_event(event)
            except Exception as e:
                logger.error(f"Gateway sync error: {e}")

    # ── Data source callbacks ──

    def handle_camera_frame(self, frame: CameraFrame):
        """Process a camera frame through the face parser."""
        event = self.camera_parser.parse(frame)
        if event:
            self._emit(event)

    def handle_audio_chunk(self, chunk: AudioChunk):
        """Process an audio chunk through the sound parser."""
        event = self.sound_parser.parse(chunk)
        if event:
            self._emit(event)

    def handle_microbit_reading(self, reading: MicrobitReading):
        """Process a micro:bit reading through the sensor parser."""
        events = self.microbit_parser.parse(reading)
        for event in events:
            self._emit(event)

    # ── Lifecycle ──

    def start(self):
        """
        Start consuming data from devices.

        Uses the device factory to create the right device (sim or real)
        based on config.use_simulator. No code change needed when
        switching to real hardware — just set use_simulator: false
        in settings.yaml.
        """
        from yolohome.devices import create_devices

        self._cam, self._mic, self._mb = create_devices(self.config)

        # Open hardware / resources
        self._cam.open()
        self._mic.open()
        # self._mb.open() # <-- Microbit 

        self._running = True

        t_cam = threading.Thread(
            target=self._run_camera, args=(self._cam,), daemon=True
        )
        t_cam.start()
        self._threads.append(t_cam)

        t_mic = threading.Thread(
            target=self._run_microphone, args=(self._mic,), daemon=True
        )
        t_mic.start()
        self._threads.append(t_mic)

        # t_mb = threading.Thread(
        #     target=self._run_microbit, args=(self._mb,), daemon=True
        # )
        # t_mb.start()
        # self._threads.append(t_mb)

        mode = "simulator" if self.config.use_simulator else "real hardware"
        logger.info(f"InputManager started ({mode})")

    def stop(self):
        """Stop all data source threads and release devices."""
        self._running = False
        for t in self._threads:
            t.join(timeout=2.0)
        self._threads.clear()

        # Release hardware
        for dev in ("_cam", "_mic", "_mb"):
            device = getattr(self, dev, None)
            if device:
                try:
                    device.close()
                except Exception as e:
                    logger.warning(f"Error closing {dev}: {e}")

        logger.info(
            f"InputManager stopped. "
            f"Total events: {len(self.event_log)}"
        )

    def _run_camera(self, cam):
        start = time.time()
        interval = 1.0 / self.config.camera.fps
        while self._running:
            elapsed = time.time() - start
            
            # --- ĐOẠN MỚI THÊM TRY...EXCEPT Ở ĐÂY ---
            try:
                frame = cam.capture_once(elapsed)
                # Chỉ xử lý nếu frame hợp lệ (để phòng hờ trường hợp capture_once trả về None)
                if frame is not None:
                    self.handle_camera_frame(frame)
            except RuntimeError as e:
                logger.warning(f"Lỗi đọc camera (Mất kết nối?): {e}. Thử lại sau 1s...")
                time.sleep(1.0)
                continue
            except Exception as e:
                logger.error(f"Lỗi không xác định ở camera thread: {e}")
                time.sleep(1.0)
                continue
            # ----------------------------------------
            
            time.sleep(interval)

    def _run_microphone(self, mic):
        start = time.time()
        interval = self.config.microphone.chunk_ms / 1000.0
        while self._running:
            elapsed = time.time() - start
            chunk = mic.capture_chunk(elapsed, self.config.microphone.chunk_ms)
            self.handle_audio_chunk(chunk)
            time.sleep(interval)

    def _run_microbit(self, mb):
        start = time.time()
        while self._running:
            elapsed = time.time() - start
            reading = mb.read_once(elapsed)
            self.handle_microbit_reading(reading)
            time.sleep(0.5)
