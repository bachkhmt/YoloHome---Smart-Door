"""
Real camera driver using OpenCV.

Requirements:
    pip install opencv-python

Usage:
    cam = RealCamera(device_id=0, width=640, height=480)
    cam.open()
    frame = cam.capture_once()
    cam.close()
"""

import time
import logging
from typing import Optional, Generator

from yolohome.data_models import CameraFrame
from yolohome.devices.base import CameraDevice

logger = logging.getLogger(__name__)


class RealCamera(CameraDevice):
    """
    Captures frames from a USB / CSI camera via OpenCV.

    Args:
        device_id: Camera index (0 = default webcam, 1 = second camera, etc.)
                   Can also be an RTSP URL string for IP cameras.
        width:     Requested frame width.
        height:    Requested frame height.
        fps:       Requested capture FPS (hardware may not support all values).
    """

    def __init__(
        self,
        device_id: int = 0,
        width: int = 640,
        height: int = 480,
        fps: int = 15,
    ):
        self.device_id = device_id
        self.width = width
        self.height = height
        self.fps = fps
        self._cap = None
        self._frame_count = 0

    def open(self):
        import cv2

        self._cap = cv2.VideoCapture(self.device_id)
        if not self._cap.isOpened():
            raise RuntimeError(
                f"Cannot open camera device {self.device_id}"
            )

        self._cap.set(cv2.CAP_PROP_FRAME_WIDTH, self.width)
        self._cap.set(cv2.CAP_PROP_FRAME_HEIGHT, self.height)
        self._cap.set(cv2.CAP_PROP_FPS, self.fps)

        # Read actual values (hardware may override)
        actual_w = int(self._cap.get(cv2.CAP_PROP_FRAME_WIDTH))
        actual_h = int(self._cap.get(cv2.CAP_PROP_FRAME_HEIGHT))
        logger.info(
            f"Camera opened: device={self.device_id}, "
            f"resolution={actual_w}x{actual_h}"
        )

    def close(self):
        if self._cap and self._cap.isOpened():
            self._cap.release()
            logger.info("Camera closed")
        self._cap = None

    def capture_once(self, elapsed: float = 0.0) -> CameraFrame:
        if self._cap is None or not self._cap.isOpened():
            raise RuntimeError("Camera not opened. Call open() first.")

        import cv2

        ret, frame = self._cap.read()
        if not ret or frame is None:
            raise RuntimeError("Failed to capture frame from camera")

        # OpenCV returns BGR — convert to RGB for consistency
        frame_rgb = cv2.cvtColor(frame, cv2.COLOR_BGR2RGB)

        self._frame_count += 1
        h, w = frame_rgb.shape[:2]

        return CameraFrame(
            timestamp=time.time(),
            frame=frame_rgb,
            frame_id=self._frame_count,
            width=w,
            height=h,
        )

    def stream(
        self, duration: float = 10.0, fps: Optional[int] = None
    ) -> Generator[CameraFrame, None, None]:
        fps = fps or self.fps
        interval = 1.0 / fps
        start = time.time()

        while (time.time() - start) < duration:
            yield self.capture_once()
            time.sleep(interval)

    def __enter__(self):
        self.open()
        return self

    def __exit__(self, *args):
        self.close()
