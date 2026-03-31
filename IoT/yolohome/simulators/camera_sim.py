"""Simulated USB/CSI camera for face recognition testing."""

import time
import numpy as np
from typing import Optional, List

from yolohome.data_models import CameraFrame, FaceRegion
from yolohome.devices.base import CameraDevice


class SimulatedCamera(CameraDevice):
    """
    Generates synthetic video frames with optional face rectangles.

    Scenarios:
        "empty"        — no faces
        "single_face"  — one known face appears at t=1s
        "multi_face"   — two faces appear at t=0.5s
        "dark"         — underexposed frames
        "noise"        — heavy sensor noise
    """

    SCENARIOS = {
        "empty": {"faces": []},
        "single_face": {
            "faces": [
                FaceRegion(200, 120, 150, 180, label="alice", confidence=0.95)
            ],
            "appear_at": 1.0,
        },
        "multi_face": {
            "faces": [
                FaceRegion(100, 100, 130, 160, label="alice", confidence=0.93),
                FaceRegion(380, 110, 140, 170, label="bob", confidence=0.88),
            ],
            "appear_at": 0.5,
        },
        "dark": {"faces": [], "brightness": 15},
        "noise": {"faces": [], "noise_level": 80},
    }

    def __init__(
        self,
        resolution: tuple = (640, 480),
        scenario: str = "single_face",
        fps: int = 15,
    ):
        if scenario not in self.SCENARIOS:
            raise ValueError(
                f"Unknown scenario '{scenario}'. "
                f"Choose from {list(self.SCENARIOS)}"
            )
        self.width, self.height = resolution
        self.scenario = scenario
        self.fps = fps
        self.config = self.SCENARIOS[scenario]
        self._frame_count = 0

    def open(self):
        pass  # no hardware to initialize

    def close(self):
        pass  # no hardware to release

    def _generate_frame(self, elapsed: float) -> np.ndarray:
        brightness = self.config.get("brightness", 60)
        noise_level = self.config.get("noise_level", 10)

        frame = np.full(
            (self.height, self.width, 3), brightness, dtype=np.uint8
        )

        appear_at = self.config.get("appear_at", 0.0)
        if elapsed >= appear_at:
            for face in self.config.get("faces", []):
                color = np.array([200, 180, 160], dtype=np.uint8)
                y1 = face.y
                y2 = min(face.y + face.h, self.height)
                x1 = face.x
                x2 = min(face.x + face.w, self.width)
                frame[y1:y2, x1:x2] = color

                # Simple eyes
                ey = face.y + face.h // 3
                frame[
                    ey - 2 : ey + 2,
                    face.x + face.w // 3 - 2 : face.x + face.w // 3 + 2,
                ] = 40
                frame[
                    ey - 2 : ey + 2,
                    face.x + 2 * face.w // 3 - 2 : face.x + 2 * face.w // 3 + 2,
                ] = 40

        noise = np.random.randint(
            -noise_level, noise_level + 1, frame.shape, dtype=np.int16
        )
        frame = np.clip(
            frame.astype(np.int16) + noise, 0, 255
        ).astype(np.uint8)
        return frame

    def get_face_ground_truth(self, elapsed: float) -> List[FaceRegion]:
        appear_at = self.config.get("appear_at", 0.0)
        if elapsed >= appear_at:
            return self.config.get("faces", [])
        return []

    def capture_once(self, elapsed: float = 0.0) -> CameraFrame:
        frame_data = self._generate_frame(elapsed)
        self._frame_count += 1
        return CameraFrame(
            timestamp=time.time(),
            frame=frame_data,
            frame_id=self._frame_count,
            width=self.width,
            height=self.height,
        )

    def stream(self, duration: float = 10.0, fps: Optional[int] = None):
        fps = fps or self.fps
        interval = 1.0 / fps
        start = time.time()
        elapsed = 0.0
        while elapsed < duration:
            yield self.capture_once(elapsed)
            time.sleep(interval)
            elapsed = time.time() - start
