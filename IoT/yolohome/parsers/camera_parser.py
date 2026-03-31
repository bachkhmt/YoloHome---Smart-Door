"""
Camera parser — face detection from camera frames.

In production, swap the simple brightness check for a real
face detector (YOLO, dlib, or MediaPipe).
"""
import face_recognition
import requests
import cv2 
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

    def __init__(self, cooldown=2.0):
        self.cooldown = cooldown
        self._last_event_time = 0.0
        self.known_face_encodings = []
        self.known_face_names = []
        self.last_load_time = 0  # 👈 Thêm biến đếm thời gian
        self.load_known_faces()

    def load_known_faces(self):
        """Tải danh sách người nhà từ Node.js Server"""
        self.last_load_time = time.time()
        
        try:
            res = requests.get("http://localhost:3001/api/users/encodings", timeout=5)
            if res.status_code != 200:
                logger.warning(f"Lỗi từ Node.js Server ({res.status_code}): {res.text}")
                return
            
            data = res.json()

            if isinstance(data, list):
                self.known_face_encodings = [np.array(u['face_encoding']) for u in data if u.get('face_encoding')]
                self.known_face_names = [u['name'] for u in data if u.get('face_encoding')]
                logger.info(f"Đã cập nhật {len(self.known_face_names)} khuôn mặt người nhà.")
            else:
                logger.warning(f"Dữ liệu API không đúng định dạng (không phải mảng): {data}")
                
        except Exception as e:
            logger.warning(f"Không thể kết nối đến Backend: {e}")

    def parse(self, frame: CameraFrame) -> Optional[ParsedEvent]:
        """
        Analyze a single frame for faces.

        Returns:
            ParsedEvent if a face is detected, else None.
        """
        if time.time() - self.last_load_time > 10:
            self.load_known_faces()
        now = time.time()
        if now - self._last_event_time < self.cooldown:
            return None

        faces = self._detect_faces(frame)
        if not faces:
            return None
        
        # ---------------------------------------------------------
        # 📸 THÊM ĐOẠN NÀY ĐỂ CHỤP VÀ MÃ HÓA ẢNH
        import cv2
        import base64
        # Chuyển màu từ RGB (AI dùng) sang BGR (OpenCV dùng để nén ảnh)
        bgr_img = cv2.cvtColor(frame.frame, cv2.COLOR_RGB2BGR)
        # Nén thành chuẩn JPEG cho nhẹ
        _, buffer = cv2.imencode('.jpg', bgr_img)
        # Chuyển thành chuỗi Base64 để gửi qua mạng
        img_b64 = "data:image/jpeg;base64," + base64.b64encode(buffer).decode('utf-8')
        # ---------------------------------------------------------

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
                "image_snapshot": img_b64,
            },
            confidence=max(f.confidence for f in faces),
        )

    # def _detect_faces(self, frame: CameraFrame) -> list:
    #     """
    #     Simple face detection using brightness analysis.

    #     In a real system, replace this with:
    #         import cv2
    #         detector = cv2.CascadeClassifier(...)
    #         rects = detector.detectMultiScale(gray)
    #     or a YOLO / dlib / MediaPipe detector.
    #     """
        
    #     gray = frame.frame.mean(axis=2)
    #     max_brightness = gray.max()
    #     mean_brightness = gray.mean()

    #     if (
    #         max_brightness <= self.brightness_threshold
    #         or (max_brightness - mean_brightness) <= 40
    #     ):
    #         return []

    #     bright_mask = gray > (mean_brightness + 30)
    #     rows = np.any(bright_mask, axis=1)
    #     cols = np.any(bright_mask, axis=0)

    #     if not (rows.any() and cols.any()):
    #         return []

    #     y_indices = np.where(rows)[0]
    #     x_indices = np.where(cols)[0]
    #     y1, y2 = int(y_indices[0]), int(y_indices[-1])
    #     x1, x2 = int(x_indices[0]), int(x_indices[-1])

    #     face = FaceRegion(
    #         x=x1, y=y1,
    #         w=x2 - x1, h=y2 - y1,
    #         label="detected",
    #         confidence=0.85,
    #     )

    #     logger.debug(
    #         f"Face detected: bbox=({x1},{y1},{x2-x1},{y2-y1})"
    #     )
    #     return [face]

    # def _detect_faces(self, frame: CameraFrame) -> list:
    #     gray_frame = cv2.cvtColor(frame.frame, cv2.COLOR_RGB2GRAY)
    #     faces_detected = self.face_cascade.detectMultiScale(
    #         gray_frame,
    #         scaleFactor=1.1,   # Hệ số scale ảnh để tìm mặt ở các khoảng cách khác nhau
    #         minNeighbors=5,    # Số lượng box lân cận để xác nhận là 1 khuôn mặt (giảm nhiễu)
    #         minSize=(50, 50)   # Kích thước tối thiểu của khuôn mặt
    #     )
    #     result = []
    #     for (x, y, w, h) in faces_detected:
    #         face = FaceRegion(
    #             x=int(x), 
    #             y=int(y),
    #             w=int(w), 
    #             h=int(h),
    #             label="detected",
    #             confidence=0.85,
    #         )
    #         result.append(face)
    #     if result:
    #         logger.info(f"🟢 Phát hiện {len(result)} khuôn mặt tại tọa độ: {[(f.x, f.y) for f in result]}")
    #     return result


    def _detect_faces(self, frame: CameraFrame) -> list:
        # Tìm vị trí và encoding của tất cả mặt trong ảnh
        face_locations = face_recognition.face_locations(frame.frame)
        face_encodings = face_recognition.face_encodings(frame.frame, face_locations)

        result = []
        for encoding, location in zip(face_encodings, face_locations):
            name = "unknown" 
            
            # So sánh với người nhà
            if self.known_face_encodings:
                matches = face_recognition.compare_faces(self.known_face_encodings, encoding, tolerance=0.45)
                if True in matches:
                    idx = matches.index(True)
                    name = self.known_face_names[idx]

            top, right, bottom, left = location
            result.append(FaceRegion(
                x=left, y=top, w=right-left, h=bottom-top,
                label=name,
                confidence=1.0 if name != "unknown" else 0.8 
            ))
        return result