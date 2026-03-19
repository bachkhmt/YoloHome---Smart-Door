Chỉ cần 4 file (face-api.js dùng cho recognition, MediaPipe tải tự động qua CDN):

Tải từ: https://github.com/justadudewhohacks/face-api.js/tree/master/weights

1. face_landmark_68_model-weights_manifest.json
   face_landmark_68_model-shard1

2. face_recognition_model-weights_manifest.json
   face_recognition_model-shard1
   face_recognition_model-shard2

Tổng ~6.2MB. Đặt tất cả vào thư mục /public/models/ này.

KHÔNG cần tiny_face_detector (đã thay bằng MediaPipe BlazeFace).
