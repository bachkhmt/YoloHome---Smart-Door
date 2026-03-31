# """
# Real camera driver using OpenCV.

# Requirements:
#     pip install opencv-python

# Usage:
#     cam = RealCamera(device_id=0, width=640, height=480)
#     cam.open()
#     frame = cam.capture_once()
#     cam.close()
# """

# import time
# import logging
# from typing import Optional, Generator

# from yolohome.data_models import CameraFrame
# from yolohome.devices.base import CameraDevice

# logger = logging.getLogger(__name__)


# class RealCamera(CameraDevice):
#     """
#     Captures frames from a USB / CSI camera via OpenCV.

#     Args:
#         device_id: Camera index (0 = default webcam, 1 = second camera, etc.)
#                    Can also be an RTSP URL string for IP cameras.
#         width:     Requested frame width.
#         height:    Requested frame height.
#         fps:       Requested capture FPS (hardware may not support all values).
#     """

#     def __init__(
#         self,
#         device_id: str = "http://192.168.1.131",
#         width: int = 640,
#         height: int = 480,
#         fps: int = 15,
#     ):
#         self.device_id = device_id
#         self.width = width
#         self.height = height
#         self.fps = fps
#         self._cap = None
#         self._frame_count = 0

#     def open(self):
#         import cv2

#         self._cap = cv2.VideoCapture(self.device_id)
#         if not self._cap.isOpened():
#             raise RuntimeError(
#                 f"Cannot open camera device {self.device_id}"
#             )

#         # self._cap.set(cv2.CAP_PROP_FRAME_WIDTH, self.width)
#         # self._cap.set(cv2.CAP_PROP_FRAME_HEIGHT, self.height)
#         # self._cap.set(cv2.CAP_PROP_FPS, self.fps)

#         # Read actual values (hardware may override)
#         actual_w = int(self._cap.get(cv2.CAP_PROP_FRAME_WIDTH))
#         actual_h = int(self._cap.get(cv2.CAP_PROP_FRAME_HEIGHT))
#         logger.info(
#             f"Camera opened: device={self.device_id}, "
#             f"resolution={actual_w}x{actual_h}"
#         )

#     def close(self):
#         if self._cap and self._cap.isOpened():
#             self._cap.release()
#             logger.info("Camera closed")
#         self._cap = None

#     def capture_once(self, elapsed: float = 0.0) -> CameraFrame:
#         if self._cap is None or not self._cap.isOpened():
#             raise RuntimeError("Camera not opened. Call open() first.")

#         import cv2

#         ret, frame = self._cap.read()
#         if not ret or frame is None:
#             raise RuntimeError("Failed to capture frame from camera")

#         # OpenCV returns BGR — convert to RGB for consistency
#         frame_rgb = cv2.cvtColor(frame, cv2.COLOR_BGR2RGB)

#         self._frame_count += 1
#         h, w = frame_rgb.shape[:2]

#         return CameraFrame(
#             timestamp=time.time(),
#             frame=frame_rgb,
#             frame_id=self._frame_count,
#             width=w,
#             height=h,
#         )

#     def stream(
#         self, duration: float = 10.0, fps: Optional[int] = None
#     ) -> Generator[CameraFrame, None, None]:
#         fps = fps or self.fps
#         interval = 1.0 / fps
#         start = time.time()

#         while (time.time() - start) < duration:
#             yield self.capture_once()
#             time.sleep(interval)

#     def __enter__(self):
#         self.open()
#         return self

#     def __exit__(self, *args):
#         self.close()


import time
import logging
import threading
from typing import Optional, Generator
import requests
import face_recognition

import cv2
from flask import Flask, Response, request
from flask_cors import CORS

from yolohome.data_models import CameraFrame
from yolohome.devices.base import CameraDevice

logger = logging.getLogger(__name__)

# ========================================================
# 🚀 THÊM TRẠM PHÁT SÓNG (FLASK SERVER) TẠI ĐÂY
# ========================================================
app = Flask(__name__)
CORS(app) # Cho phép Web React kết nối mà không bị block
latest_frame = None # Biến toàn cục chứa khung hình mới nhất

@app.route('/video_feed')
def video_feed():
    def generate():
        global latest_frame
        while True:
            if latest_frame is None:
                time.sleep(0.1)
                continue
            # Đóng gói khung hình OpenCV thành chuẩn JPEG
            ret, buffer = cv2.imencode('.jpg', latest_frame)
            if not ret:
                continue
            frame_bytes = buffer.tobytes()
            # Bắn liên tục thành luồng Video (MJPEG)
            yield (b'--frame\r\n'
                   b'Content-Type: image/jpeg\r\n\r\n' + frame_bytes + b'\r\n')
            time.sleep(0.05) # Giới hạn 20fps cho mượt và nhẹ máy

    return Response(generate(), mimetype='multipart/x-mixed-replace; boundary=frame')

def start_flask_server():
    # Chạy trạm phát sóng ở cổng 5050
    app.run(host='0.0.0.0', port=5050, debug=False, use_reloader=False)

# Tự động bật trạm phát sóng chạy ngầm ngay khi bật AI
threading.Thread(target=start_flask_server, daemon=True).start()
# ========================================================

@app.route('/register_face', methods=['POST'])
def register_face():
    global latest_frame
    user_id = request.args.get('user_id')
    
    if latest_frame is None:
        return {"error": "Camera chưa sẵn sàng"}, 400
    
    # Trích xuất mã encoding từ khung hình hiện tại
    # Chuyển BGR sang RGB cho face_recognition
    rgb_frame = cv2.cvtColor(latest_frame, cv2.COLOR_BGR2RGB)
    encodings = face_recognition.face_encodings(rgb_frame)
    
    if len(encodings) == 0:
        return {"error": "Không tìm thấy khuôn mặt trong khung hình!"}, 400
    
    # Gửi mảng vector này về Node.js để lưu vào DB
    face_data = encodings[0].tolist() # Chuyển numpy array sang list để gửi JSON
    try:
        res = requests.patch(f"http://localhost:3001/api/users/{user_id}/face", 
                             json={"face_encoding": face_data}, timeout=5)
        return res.json()
    except Exception as e:
        return {"error": str(e)}, 500


class RealCamera(CameraDevice):
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
        self._cap = None
        self._frame_count = 0

    def open(self):
        self._cap = cv2.VideoCapture(self.device_id)
        if not self._cap.isOpened():
            raise RuntimeError(f"Cannot open camera device {self.device_id}")

        # self._cap.set(cv2.CAP_PROP_FRAME_WIDTH, self.width)
        # self._cap.set(cv2.CAP_PROP_FRAME_HEIGHT, self.height)
        # self._cap.set(cv2.CAP_PROP_FPS, self.fps)

        actual_w = int(self._cap.get(cv2.CAP_PROP_FRAME_WIDTH))
        actual_h = int(self._cap.get(cv2.CAP_PROP_FRAME_HEIGHT))
        logger.info(f"Camera opened: device={self.device_id}, resolution={actual_w}x{actual_h}")

    def close(self):
        if self._cap and self._cap.isOpened():
            self._cap.release()
            logger.info("Camera closed")
        self._cap = None

    def capture_once(self, elapsed: float = 0.0) -> CameraFrame:
        if self._cap is None or not self._cap.isOpened():
            raise RuntimeError("Camera not opened. Call open() first.")

        ret, frame = self._cap.read()
        if not ret or frame is None:
            raise RuntimeError("Failed to capture frame from camera")

        # ---> CUNG CẤP KHUNG HÌNH CHO TRẠM PHÁT SÓNG <---
        global latest_frame
        latest_frame = frame.copy()

        # OpenCV trả về BGR, chuyển sang RGB cho AI xử lý
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