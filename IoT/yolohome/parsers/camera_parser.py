"""
Camera parser — face detection from camera frames.

In production, swap the simple brightness check for a real
face detector (YOLO, dlib, or MediaPipe).
"""

import time
import logging
import numpy as np
from typing import Optional, Callable

from yolohome.data_models import CameraFrame, ParsedEvent, EventType, FaceRegion

logger = logging.getLogger(__name__)


class CameraParser:
    """
    Consumes CameraFrame objects and emits FACE_DETECTED events.

    The detection logic is intentionally simple (brightness threshold)
    so it works with the simulator. Replace `_detect_faces()` with
    a real model for production.
    """

    def __init__(
        self,
        brightness_threshold: int = 100,
        cooldown: float = 1.0,
    ):
        self.brightness_threshold = brightness_threshold
        self.cooldown = cooldown
        self._last_event_time = 0.0

    def parse(self, frame: CameraFrame) -> Optional[ParsedEvent]:
        """
        Analyze a single frame for faces.

        Returns:
            ParsedEvent if a face is detected, else None.
        """
        now = time.time()
        if now - self._last_event_time < self.cooldown:
            return None

        faces = self._detect_faces(frame)
        if not faces:
            return None

        self._last_event_time = now

        return ParsedEvent(
            event_type=EventType.FACE_DETECTED,
            timestamp=frame.timestamp,
            source="camera",
            data={
                "frame_id": frame.frame_id,
                "faces": [f.to_dict() for f in faces],
                "frame_shape": list(frame.shape),
                "num_faces": len(faces),
            },
            confidence=max(f.confidence for f in faces),
        )

    def _detect_faces(self, frame: CameraFrame) -> list:
        """
        Simple face detection using brightness analysis.

        In a real system, replace this with:
            import cv2
            detector = cv2.CascadeClassifier(...)
            rects = detector.detectMultiScale(gray)
        or a YOLO / dlib / MediaPipe detector.
        """
        gray = frame.frame.mean(axis=2)
        max_brightness = gray.max()
        mean_brightness = gray.mean()

        if (
            max_brightness <= self.brightness_threshold
            or (max_brightness - mean_brightness) <= 40
        ):
            return []

        bright_mask = gray > (mean_brightness + 30)
        rows = np.any(bright_mask, axis=1)
        cols = np.any(bright_mask, axis=0)

        if not (rows.any() and cols.any()):
            return []

        y_indices = np.where(rows)[0]
        x_indices = np.where(cols)[0]
        y1, y2 = int(y_indices[0]), int(y_indices[-1])
        x1, x2 = int(x_indices[0]), int(x_indices[-1])

        face = FaceRegion(
            x=x1, y=y1,
            w=x2 - x1, h=y2 - y1,
            label="detected",
            confidence=0.85,
        )

        logger.debug(
            f"Face detected: bbox=({x1},{y1},{x2-x1},{y2-y1})"
        )
        return [face]
