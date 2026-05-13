"""
Real camera driver using OpenCV + MJPEG stream server + Face registration.

Requirements:
    pip install opencv-python flask flask-cors face_recognition requests

Usage:
    cam = RealCamera(device_id="http://192.168.1.131:81/stream")
    cam.open()
    frame = cam.capture_once()
    cam.close()

Flask endpoints (auto-started on open()):
    GET  /video_feed            — MJPEG live stream
    POST /register_face?user_id=<id> — Capture & register face encoding
"""

import time
import logging
import threading
from typing import Optional, Generator

import cv2
import requests
import face_recognition
from flask import Flask, Response, request
from flask_cors import CORS

from yolohome.data_models import CameraFrame
from yolohome.devices.base import CameraDevice

logger = logging.getLogger(__name__)

# ──────────────────────────────────────────────
# Shared state (thread-safe)
# ──────────────────────────────────────────────
_latest_frame = None
_frame_lock = threading.Lock()

FLASK_HOST = "0.0.0.0"
FLASK_PORT = 5050
STREAM_FPS = 20          # MJPEG target fps
NODE_API   = "http://localhost:3001/api"


# ──────────────────────────────────────────────
# Flask app (singleton — created once at module level)
# ──────────────────────────────────────────────
app = Flask(__name__)
CORS(app)


@app.route("/video_feed")
def video_feed():
    """MJPEG live stream endpoint."""
    def generate():
        interval = 1.0 / STREAM_FPS
        while True:
            with _frame_lock:
                frame = _latest_frame.copy() if _latest_frame is not None else None

            if frame is None:
                time.sleep(0.1)
                continue

            ret, buffer = cv2.imencode(".jpg", frame, [cv2.IMWRITE_JPEG_QUALITY, 80])
            if not ret:
                continue

            yield (
                b"--frame\r\n"
                b"Content-Type: image/jpeg\r\n\r\n"
                + buffer.tobytes()
                + b"\r\n"
            )
            time.sleep(interval)

    return Response(generate(), mimetype="multipart/x-mixed-replace; boundary=frame")


@app.route("/register_face", methods=["POST"])
def register_face():
    """
    Capture current frame, extract face encoding, send to Node.js API.

    Query params:
        user_id (str): Target user ID to update.
    """
    user_id = request.args.get("user_id")
    if not user_id:
        return {"error": "Missing user_id parameter"}, 400

    with _frame_lock:
        frame = _latest_frame.copy() if _latest_frame is not None else None

    if frame is None:
        return {"error": "Camera not ready"}, 503

    rgb_frame = cv2.cvtColor(frame, cv2.COLOR_BGR2RGB)
    encodings = face_recognition.face_encodings(rgb_frame)

    if not encodings:
        return {"error": "No face found in frame"}, 400

    face_data = encodings[0].tolist()

    try:
        res = requests.patch(
            f"{NODE_API}/users/{user_id}/face",
            json={"face_encoding": face_data},
            timeout=5,
        )
        res.raise_for_status()
        return res.json()
    except requests.Timeout:
        return {"error": "Node.js API timeout"}, 504
    except requests.RequestException as e:
        logger.error("register_face: Node API error — %s", e)
        return {"error": str(e)}, 502


# ──────────────────────────────────────────────
# RealCamera
# ──────────────────────────────────────────────
class RealCamera(CameraDevice):
    """
    Captures frames from a USB / CSI / IP camera via OpenCV.

    Automatically starts a Flask MJPEG server on open() and
    stops it on close().

    Args:
        device_id: Camera URL or index (0 = default webcam).
        width:     Requested frame width.
        height:    Requested frame height.
        fps:       Requested capture FPS.
    """

    def __init__(
        self,
        device_id: str = "http://192.168.1.131:81/stream",
        width: int = 640,
        height: int = 480,
        fps: int = 15,
    ):
        self.device_id = device_id
        self.width = width
        self.height = height
        self.fps = fps

        self._cap: Optional[cv2.VideoCapture] = None
        self._frame_count: int = 0
        self._flask_thread: Optional[threading.Thread] = None

    # ── Lifecycle ──────────────────────────────

    def open(self) -> None:
        """Open camera and start MJPEG stream server."""
        self._cap = cv2.VideoCapture(self.device_id)
        if not self._cap.isOpened():
            raise RuntimeError(f"Cannot open camera device: {self.device_id}")

        # Optional: uncomment to force resolution / fps
        # self._cap.set(cv2.CAP_PROP_FRAME_WIDTH,  self.width)
        # self._cap.set(cv2.CAP_PROP_FRAME_HEIGHT, self.height)
        # self._cap.set(cv2.CAP_PROP_FPS,          self.fps)

        actual_w = int(self._cap.get(cv2.CAP_PROP_FRAME_WIDTH))
        actual_h = int(self._cap.get(cv2.CAP_PROP_FRAME_HEIGHT))
        logger.info(
            "Camera opened: device=%s, resolution=%dx%d",
            self.device_id, actual_w, actual_h,
        )

        self._start_flask()

    def close(self) -> None:
        """Release camera. Flask daemon thread stops with the process."""
        if self._cap and self._cap.isOpened():
            self._cap.release()
            logger.info("Camera closed")
        self._cap = None

    # ── Capture ────────────────────────────────

    def capture_once(self, elapsed: float = 0.0) -> CameraFrame:
        """
        Capture a single frame.

        Args:
            elapsed: Unused — kept for interface compatibility.

        Returns:
            CameraFrame with RGB pixel data.
        """
        if self._cap is None or not self._cap.isOpened():
            raise RuntimeError("Camera not opened. Call open() first.")

        ret, frame = self._cap.read()
        if not ret or frame is None:
            raise RuntimeError("Failed to capture frame from camera")

        # Share latest BGR frame with Flask stream (thread-safe)
        global _latest_frame
        with _frame_lock:
            _latest_frame = frame.copy()

        # Convert BGR → RGB for downstream AI / YOLO pipeline
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
        self,
        duration: float = 10.0,
        fps: Optional[int] = None,
    ) -> Generator[CameraFrame, None, None]:
        """
        Yield frames continuously for `duration` seconds.

        Args:
            duration: How long to stream (seconds).
            fps:      Override instance fps for this stream.
        """
        fps = fps or self.fps
        interval = 1.0 / fps
        deadline = time.time() + duration

        while time.time() < deadline:
            yield self.capture_once()
            time.sleep(interval)

    # ── Context manager ────────────────────────

    def __enter__(self) -> "RealCamera":
        self.open()
        return self

    def __exit__(self, *args) -> None:
        self.close()

    # ── Internal helpers ───────────────────────

    def _start_flask(self) -> None:
        """Start the MJPEG Flask server in a background daemon thread."""
        if self._flask_thread and self._flask_thread.is_alive():
            return  # Already running

        self._flask_thread = threading.Thread(
            target=lambda: app.run(
                host=FLASK_HOST,
                port=FLASK_PORT,
                debug=False,
                use_reloader=False,
            ),
            daemon=True,
            name="flask-mjpeg-server",
        )
        self._flask_thread.start()
        logger.info(
            "MJPEG stream server started at http://%s:%d/video_feed",
            FLASK_HOST, FLASK_PORT,
        )




