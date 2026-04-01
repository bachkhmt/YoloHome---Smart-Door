# 🏠 YOLO Home — Smart Door System & IoT Dashboard

> Hệ thống nhà thông minh tích hợp **AI Face Recognition**, **IoT Gateway** và **điều khiển phần cứng** thời gian thực.

![Stack](https://img.shields.io/badge/Frontend-React%20%2B%20Vite-61DAFB?style=flat-square)
![Stack](https://img.shields.io/badge/Backend-Node.js%20%2B%20Express-339933?style=flat-square)
![Stack](https://img.shields.io/badge/AI-Python%20%2B%20face__recognition-3776AB?style=flat-square)
![Stack](https://img.shields.io/badge/Hardware-ESP32%20%2B%20YoloBit-E34F26?style=flat-square)
![Stack](https://img.shields.io/badge/Protocol-MQTT%20%2F%20HTTP-FF6600?style=flat-square)

---

## 📖 Tổng quan

**YOLO Home** là hệ thống quản lý nhà thông minh đa diện, kết hợp giữa **IoT**, **phần cứng** (Yolo:Bit / ESP32 Camera) và **Trí tuệ nhân tạo (Computer Vision)** để:

- 🔐 Tự động mở/khóa cửa bằng nhận diện khuôn mặt
- 🌡️ Đo đạc và giám sát môi trường (nhiệt độ, độ ẩm, ánh sáng)
- 💡 Điều khiển thiết bị từ xa (đèn, quạt, servo)
- 📊 Theo dõi lịch sử ra vào và log thiết bị qua Dashboard

---

## 🏗️ Kiến trúc hệ thống

```
┌──────────────────────────────────────────────────────────────┐
│                        WEB DASHBOARD                         │
│                   React.js + Vite  (:5173)                   │
└──────────────────────────┬───────────────────────────────────┘
                           │ HTTP / REST API
┌──────────────────────────▼───────────────────────────────────┐
│                      BACKEND SERVER                          │
│             Node.js + Express + MySQL  (:3001)               │
└──────────────────────────┬───────────────────────────────────┘
                           │ HTTP API  +  MQTT (Adafruit IO)
┌──────────────────────────▼───────────────────────────────────┐
│                      IoT GATEWAY (Python)                    │
│        face_recognition + OpenCV + Flask  (:5050)            │
└──────────┬───────────────────────────────┬───────────────────┘
           │ Serial (USB)                  │ HTTP Stream
┌──────────▼──────────┐        ┌──────────▼───────────────────┐
│   Yolo:Bit / Micro  │        │       ESP32 CAM              │
│   Bit (MicroPython) │        │   (Video stream MJPEG)       │
│  Temp · Humi · Light│        └──────────────────────────────┘
│  Relay · Servo Door │
└─────────────────────┘
```

---

## 📁 Cấu trúc thư mục

```
yolo-home/
├── frontend/               # 🌐 Giao diện Web (React + Vite)
│   ├── components/         # UI Widgets: CameraCard, ActivityChart, AccessLog...
│   ├── hooks/              # Logic gọi API và quản lý state
│   └── lib/                # Cấu hình Axios kết nối Backend
│
├── server/                 # ⚙️ Backend API (Node.js + Express)
│   ├── index.js            # Khởi chạy server, định nghĩa API endpoints
│   └── schema.sql          # Script SQL tạo cấu trúc Database
│
├── IoT/                    # 🧠 IoT Gateway & AI Engine (Python)
│   ├── yolohome/
│   │   ├── devices/        # Driver thiết bị: real_camera.py (Flask :5050)
│   │   ├── parsers/        # Xử lý dữ liệu thô → Event (auto-reload DB)
│   │   └── gateway/        # Quản lý luồng MQTT, nhận/gửi message
│   ├── run.py              # Script khởi chạy toàn bộ Gateway
│   └── .env                # Cấu hình MQTT key, Serial port, DB connection
│
└── yolobit/                # 🔌 Firmware phần cứng
    └── main.py             # MicroPython chạy trên Yolo:Bit / Micro:Bit
```

---

## ⚙️ Cơ chế hoạt động

### 🔐 Mở khóa bằng AI (Face ID)

#### Đăng ký khuôn mặt (Enrollment)
1. Người dùng bấm **📸 Đăng ký khuôn mặt** trên Web Dashboard
2. Dashboard gọi API đến IoT Gateway (Flask, Port `5050`)
3. Gateway lấy frame từ Camera ESP32 và kích hoạt thuật toán AI
4. AI trích xuất **mảng 128 số đặc trưng** (128D Face Encoding)
5. Encoding được gửi về Backend Node.js và lưu vào Database

#### Nhận diện thời gian thực (Detection)
1. Gateway liên tục đọc hình ảnh từ Camera ESP32
2. Danh sách khuôn mặt được **tự động reload từ DB mỗi 10 giây**
3. **Khuôn mặt khớp** → nhãn "Người quen" → phát lệnh MQTT mở servo cửa
4. **Không khớp** → nhãn `"unknown"` (Người lạ) → cửa tiếp tục khóa
5. Toàn bộ sự kiện được log về Dashboard theo thời gian thực

### 🌡️ Cảm biến môi trường & Điều khiển

| Chiều | Luồng dữ liệu |
|-------|--------------|
| Sensor → Cloud | Yolo:Bit đọc cảm biến → gửi qua Serial → Gateway phân tích → đẩy lên MQTT → Dashboard |
| Cloud → Device | Dashboard gửi lệnh → Backend → Gateway → Serial → Yolo:Bit đóng/mở Relay |

---

## 🚀 Hướng dẫn cài đặt

### Yêu cầu hệ thống

| Công cụ | Phiên bản |
|---------|-----------|
| Node.js | v18+ |
| Python | v3.10+ |
| MySQL | 8.0+ (hoặc MariaDB) |
| C++ Build Tools | **Bắt buộc trên Windows** (để build `dlib`) |

---

### Bước 1 — Setup Database

```sql
CREATE DATABASE yolo_home;
```

Sau đó chạy toàn bộ nội dung `server/schema.sql` trong MySQL để khởi tạo các bảng.

> ⚠️ Đảm bảo cột `user_id` trong bảng `remote_controls` cho phép `NULL` nếu muốn lưu log điều khiển vô danh.

---

### Bước 2 — Setup Backend

```bash
cd server
npm install
```

Tạo file `.env` trong thư mục `server/`:

```env
DB_HOST=localhost
DB_USER=root
DB_PASS=your_password
DB_NAME=yolo_home
PORT=3001
```

Khởi chạy:

```bash
node index.js
```

---

### Bước 3 — Setup Frontend

```bash
cd frontend
npm install
npm run dev
```

Truy cập **http://localhost:5173** để xem Dashboard.

---

### Bước 4 — Setup IoT Gateway (Python AI)

```bash
cd IoT

# Tạo và kích hoạt môi trường ảo
# Windows:
python -m venv .venv && .venv\Scripts\activate

# Mac / Linux:
python3 -m venv .venv && source .venv/bin/activate

# Cài đặt thư viện
pip install opencv-python numpy requests cmake dlib face_recognition paho-mqtt flask flask-cors

# Khởi chạy (kèm cờ UTF-8 để tránh lỗi đường dẫn tiếng Việt)
python -X utf8 run.py
```

> Flask server xử lý đăng ký khuôn mặt sẽ tự động chạy ngầm ở **Port 5050**.

---

## 🎯 Quy trình kiểm thử

```
1. Tạo thành viên    →  Mở Dashboard → Tab "Quản lý thành viên" → Tạo user mới
        ↓
2. Đăng ký khuôn mặt →  Đứng trước Camera ESP32 → Bấm 📸
        ↓
3. Kiểm tra mở cửa   →  Bước ra khỏi khung hình → Đứng lại → Chờ ~10s
        ↓
4. Xem logs          →  Dashboard cập nhật lịch sử ra vào theo thời gian thực
```

---

## 🔧 Xử lý sự cố thường gặp

| Lỗi | Giải pháp |
|-----|-----------|
| `dlib` không cài được | Cài **C++ Build Tools** (Windows) hoặc `build-essential` (Linux) |
| Lỗi đường dẫn tiếng Việt | Luôn chạy: `python -X utf8 run.py` |
| Camera không kết nối | Kiểm tra IP của ESP32 CAM trong cấu hình Gateway |
| MQTT mất kết nối | Xác minh Adafruit IO key và tên feed trong `.env` |
| Khuôn mặt không cập nhật | Gateway reload DB mỗi 10s — đợi hoặc restart Gateway |

---

## 📄 License

MIT © YOLO Home Team