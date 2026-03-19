# 🏠 YOLO Home — Smart Door System

Hệ thống khóa cửa thông minh sử dụng **YOLO:Bit (ESP32)** kết hợp với dashboard **React + Vite** và database **MySQL**.

---

## 📋 Mục Lục

1. [Tổng Quan Hệ Thống](#1-tổng-quan-hệ-thống)
2. [Yêu Cầu Cài Đặt](#2-yêu-cầu-cài-đặt)
3. [Cấu Trúc Dự Án](#3-cấu-trúc-dự-án)
4. [Thiết Lập Database MySQL](#4-thiết-lập-database-mysql)
5. [Cài Đặt & Chạy Backend](#5-cài-đặt--chạy-backend)
6. [Cài Đặt & Chạy Frontend](#6-cài-đặt--chạy-frontend)
7. [Kết Nối YOLO:Bit (ESP32)](#7-kết-nối-yolobit-esp32)
8. [Sơ Đồ Kết Nối Phần Cứng](#8-sơ-đồ-kết-nối-phần-cứng)
9. [API Endpoints](#9-api-endpoints)
10. [Tính Năng & FR Mapping](#10-tính-năng--fr-mapping)
11. [Xử Lý Lỗi Thường Gặp](#11-xử-lý-lỗi-thường-gặp)

---

## 1. Tổng Quan Hệ Thống

```
┌────────────────────────────────────────────────────────────────┐
│                     KIẾN TRÚC HỆ THỐNG                         │
│                                                                │
│   [React Dashboard]  ←──────────────────────────────────────┐  │
│        :5173         │  HTTP / Proxy                        │  │
│           │          ▼                                      │  │
│           └───► [Node.js Backend] ◄──► [MySQL Database]     │  │
│                      :3001         SQL       yolo_home      │  │
│                        │                                    │  │
│                        │  HTTP POST/GET                     │  │
│                        ▼                                    │  │
│                  [YOLO:Bit ESP32]  ─────────────────────────┘  │
│                    (WiFi)                                      │
│                        │                                       │
│              ┌─────────┼──────────┐                            │
│              ▼         ▼          ▼                            │
│           [Servo]    [LED]    [Buzzer]                         │
│           GPIO12    GPIO5    GPIO15                            │
└────────────────────────────────────────────────────────────────┘
```

**Luồng hoạt động:**
1. Dashboard React gửi lệnh mở/khóa → Backend Node.js lưu vào MySQL
2. YOLO:Bit polling Backend mỗi 2 giây → nhận trạng thái → điều khiển Servo + LED
3. Mọi sự kiện xác thực được ghi vào bảng `access_logs` trong MySQL
4. Dashboard hiển thị realtime từ database

---

## 2. Yêu Cầu Cài Đặt

### Máy Tính (PC/Laptop)

| Phần mềm | Phiên bản | Link tải |
|---|---|---|
| Node.js | >= 18.0 | https://nodejs.org |
| MySQL Server | >= 8.0 | https://dev.mysql.com/downloads/ |
| MySQL Workbench | Bất kỳ | https://dev.mysql.com/downloads/workbench/ |
| Git | Bất kỳ | https://git-scm.com |

### YOLO:Bit / ESP32

| Phần mềm | Link tải |
|---|---|
| Thonny IDE | https://thonny.org |
| MicroPython firmware cho ESP32 | https://micropython.org/download/ESP32_GENERIC/ |

### Linh Kiện Phần Cứng

| Linh kiện | Số lượng | GPIO | Ghi chú |
|---|---|---|---|
| YOLO:Bit (ESP32) | 1 | — | Board chính |
| Servo MG996R | 1 | GPIO 12 | Điều khiển khóa cửa |
| LED WS2812B (NeoPixel) | 1 | GPIO 5 | Đèn trạng thái |
| Buzzer | 1 | GPIO 15 | Còi cảnh báo (tùy chọn) |
| Dây jumper | Nhiều | — | Kết nối các linh kiện |
| Nguồn 5V/2A | 1 | — | Cấp nguồn cho Servo |

---

## 3. Cấu Trúc Dự Án

```
yolo-home/
│
├── 📄 index.html              # Entry HTML
├── 📄 vite.config.js          # Cấu hình Vite + proxy API
├── 📄 package.json            # Dependencies frontend
├── 📄 .env                    # Biến môi trường (tự tạo, không commit)
│
├── 📁 src/                    # Mã nguồn React
│   ├── main.jsx               # Entry point React
│   ├── App.jsx                # Component gốc + layout grid
│   ├── App.module.css         # CSS dashboard grid
│   ├── index.css              # CSS global + biến màu
│   │
│   ├── 📁 hooks/
│   │   └── useAppState.js     # Toàn bộ state management
│   │
│   ├── 📁 lib/
│   │   └── api.js             # Axios — gọi API backend
│   │
│   └── 📁 components/        # 13 components UI
│       ├── Topbar.*           # Thanh điều hướng + đồng hồ + DB status
│       ├── AlertBar.*         # Cảnh báo bảo mật nhiều lần thất bại
│       ├── HeroCard.*         # Trạng thái cửa + LED + nút điều khiển
│       ├── CameraCard.*       # Khung camera giả lập + thanh tiến trình
│       ├── AuthModes.*        # Bật/tắt Face ID / Voice ID
│       ├── SensorCard.*       # Hiển thị cảm biến (dùng lại cho 3 loại)
│       ├── FanCard.*          # Điều khiển tốc độ quạt PWM
│       ├── MoodCard.*         # Chọn màu RGB LED (5 chế độ)
│       ├── ActivityChart.*    # Biểu đồ Chart.js 7 ngày
│       ├── UserManager.*      # CRUD người dùng
│       ├── AccessLog.*        # Bảng lịch sử truy cập
│       ├── SystemStats.*      # CPU / RAM / Network / Latency
│       ├── PinoutCard.*       # Sơ đồ GPIO YOLO:Bit
│       └── ToastContainer.*   # Thông báo toast góc dưới phải
│
└── 📁 server/                 # Backend Node.js
    ├── index.js               # Express API server
    ├── schema.sql             # SQL tạo database + bảng + dữ liệu mẫu
    └── package.json           # Dependencies backend
```

---

## 4. Thiết Lập Database MySQL

### Bước 4.1 — Mở MySQL Workbench

Mở MySQL Workbench → click vào connection **"Local instance MySQL"** → đăng nhập.

### Bước 4.2 — Chạy Schema SQL

1. Vào menu **File → Open SQL Script**
2. Chọn file `server/schema.sql` trong thư mục project
3. Nhấn **⚡ Execute All** (hoặc `Ctrl + Shift + Enter`)


### Bước 4.3 — Kiểm Tra

Sau khi chạy xong, trong panel **Schemas** bên trái sẽ thấy:

```
yolo_home
  ├── Tables
  │    ├── access_logs
  │    ├── door_state
  │    ├── remote_controls
  │    ├── security_alerts
  │    ├── sensor_readings
  │    ├── system_backups
  │    └── users
  └── Views
       ├── v_access_log_full
       ├── v_dashboard_summary
       ├── v_unresolved_alerts
       └── v_weekly_auth_stats
```

Chạy lệnh này để kiểm tra dữ liệu mẫu đã vào chưa:

```sql
USE yolo_home;
SELECT * FROM users;
```

Nếu thấy 3 dòng (Nguyễn Văn An, Trần Thị Bích, Lê Minh Đức) là thành công.

---

## 5. Cài Đặt & Chạy Backend

### Bước 5.1 — Tạo file `.env`

Trong thư mục **gốc** của project (cùng cấp với `package.json`), tạo file tên `.env`:

```env
DB_HOST=localhost
DB_PORT=3306
DB_USER=root
DB_PASS=Pass_MySQL
DB_NAME=yolo_home
PORT=3001
```

> **Lưu ý:** Nếu MySQL của bạn có password, điền vào `DB_PASS=matkhau`.

### Bước 5.2 — Cài Dependencies & Chạy

Mở terminal, `cd` vào thư mục `server/`:

```bash
cd yolo-home/server
npm install
npm run dev             # chạy backend
```

**Output thành công:**

```
Restarting 'index.js'
🏠 YOLO Home API → http://localhost:3001
✅ MySQL connected
```

**Nếu thấy lỗi MySQL:**

```
❌ MySQL error: Access denied for user 'root'@'localhost'
```

→ Kiểm tra lại `DB_PASS` trong file `.env` và trong `server/index.js`

### Bước 5.3 — Kiểm Tra API

Mở trình duyệt vào:

```
http://localhost:3001/api/health
```

Kết quả đúng:

```json
{ "status": "ok", "db": "connected" }
```

---

## 6. Cài Đặt & Chạy Frontend

> **Quan trọng:** Giữ terminal backend đang chạy, mở terminal **mới**.

### Bước 6.1 — Cài Dependencies

```bash
cd yolo-home
npm install
```

### Bước 6.2 — Chạy Dev Server

```bash
npm run dev         # chạy frontend
```

**Output:**

```
  VITE v5.x.x  ready in 300ms

  ➜  Local:   http://localhost:5173/
  ➜  Network: http://192.168.1.xxx:5173/
```

### Bước 6.3 — Mở Trình Duyệt

Vào `http://localhost:5173`

- Badge **"🗄️ MySQL Connected"** trên topbar = kết nối DB thành công
- Badge **"🗄️ Local Mode"** = backend chưa chạy (app vẫn hoạt động với mock data)

### Bước 6.4 — Build Production

```bash
npm run build
npm run preview
```

---

