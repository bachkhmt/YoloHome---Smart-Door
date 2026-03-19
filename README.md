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
┌─────────────────────────────────────────────────────────────────┐
│                     KIẾN TRÚC HỆ THỐNG                         │
│                                                                 │
│   [React Dashboard]  ←──────────────────────────────────────┐  │
│        :5173         │  HTTP / Proxy                        │  │
│           │          ▼                                       │  │
│           └───► [Node.js Backend] ◄──► [MySQL Database]     │  │
│                      :3001         SQL       yolo_home       │  │
│                        │                                     │  │
│                        │  HTTP POST/GET                      │  │
│                        ▼                                     │  │
│                  [YOLO:Bit ESP32]  ──────────────────────────┘  │
│                    (WiFi)                                        │
│                        │                                        │
│              ┌─────────┼──────────┐                             │
│              ▼         ▼          ▼                             │
│           [Servo]    [LED]    [Buzzer]                          │
│           GPIO12    GPIO5    GPIO15                             │
└─────────────────────────────────────────────────────────────────┘
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
├── 📄 .env.example            # Mẫu file .env
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

Hoặc copy toàn bộ nội dung dưới đây vào tab SQL mới và Execute:

```sql
CREATE DATABASE IF NOT EXISTS yolo_home
  CHARACTER SET utf8mb4
  COLLATE utf8mb4_unicode_ci;

USE yolo_home;

-- Bảng người dùng
CREATE TABLE IF NOT EXISTS users (
  id         INT          AUTO_INCREMENT PRIMARY KEY,
  name       VARCHAR(100) NOT NULL,
  role       VARCHAR(50)  NOT NULL DEFAULT 'Guest',
  seed       VARCHAR(100) NOT NULL,
  online     TINYINT(1)   NOT NULL DEFAULT 1,
  created_at TIMESTAMP    DEFAULT CURRENT_TIMESTAMP
);

-- Dữ liệu mẫu
INSERT INTO users (name, role, seed, online) VALUES
  ('Nguyễn Văn An', 'Owner',  'AnOwner',  1),
  ('Trần Thị Bích', 'Family', 'BichFam',  1),
  ('Lê Minh Đức',   'Guest',  'DucGuest', 0);

-- Bảng lịch sử truy cập
CREATE TABLE IF NOT EXISTS access_logs (
  id         INT          AUTO_INCREMENT PRIMARY KEY,
  user_name  VARCHAR(100) NOT NULL,
  method     VARCHAR(50)  NOT NULL,
  action     VARCHAR(50)  NOT NULL DEFAULT 'Vào',
  success    TINYINT(1)   NOT NULL DEFAULT 0,
  latency    VARCHAR(20)  NULL,
  created_at TIMESTAMP    DEFAULT CURRENT_TIMESTAMP,
  INDEX idx_created (created_at)
);

-- Bảng dữ liệu cảm biến
CREATE TABLE IF NOT EXISTS sensor_readings (
  id         INT   AUTO_INCREMENT PRIMARY KEY,
  temp       FLOAT NOT NULL,
  hum        FLOAT NOT NULL,
  light      FLOAT NOT NULL,
  created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
  INDEX idx_created (created_at)
);

-- Bảng trạng thái cửa
CREATE TABLE IF NOT EXISTS door_state (
  id         INT        AUTO_INCREMENT PRIMARY KEY,
  locked     TINYINT(1) NOT NULL DEFAULT 1,
  changed_at TIMESTAMP  DEFAULT CURRENT_TIMESTAMP,
  INDEX idx_changed (changed_at)
);

INSERT INTO door_state (locked) VALUES (1);
```

### Bước 4.3 — Kiểm Tra

Sau khi chạy xong, trong panel **Schemas** bên trái sẽ thấy:

```
yolo_home
  └── Tables
       ├── access_logs
       ├── door_state
       ├── sensor_readings
       └── users
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
DB_PASS=
DB_NAME=yolo_home
PORT=3001
```

> **Lưu ý:** Nếu MySQL của bạn có password, điền vào `DB_PASS=matkhau`. Nếu không có password (không hỏi khi mở Workbench), để trống `DB_PASS=`.

### Bước 5.2 — Cài Dependencies & Chạy

Mở terminal, `cd` vào thư mục `server/`:

```bash
cd yolo-home/server
npm install
npm run dev
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

→ Kiểm tra lại `DB_PASS` trong file `.env`.

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
npm run dev
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

## 7. Kết Nối YOLO:Bit (ESP32)

### Bước 7.1 — Cài Thonny IDE

Tải và cài Thonny từ https://thonny.org

### Bước 7.2 — Nạp MicroPython Firmware (nếu chưa có)

1. Tải firmware: https://micropython.org/download/ESP32_GENERIC/
2. Trong Thonny: **Run → Select Interpreter → MicroPython (ESP32)**
3. Click **"Install or update MicroPython"** → chọn file `.bin` vừa tải → Flash

### Bước 7.3 — Tìm IP Máy Tính

YOLO:Bit cần biết IP máy tính để gọi API. Tìm IP bằng cách:

**Windows:**
```
ipconfig
```
Tìm dòng `IPv4 Address` → ví dụ: `192.168.1.105`

**Mac/Linux:**
```bash
ifconfig | grep "inet "
```

> **Lưu ý:** Máy tính và YOLO:Bit phải cùng WiFi network.

### Bước 7.4 — Upload Code MicroPython

Tạo file `main.py` với nội dung sau, **thay đổi 3 dòng cấu hình đầu:**

```python
# ════════════════════════════════════════════════
#  YOLO Home — MicroPython cho YOLO:Bit (ESP32)
#  File: main.py  — nạp vào board qua Thonny
# ════════════════════════════════════════════════

import network
import urequests
import ujson
from machine import Pin, PWM
import time
import neopixel

# ── ⚙️ CẤU HÌNH — SỬA 3 DÒNG NÀY ──────────────
WIFI_SSID = "TenWifi_CuaBan"          # Tên WiFi
WIFI_PASS = "MatKhauWifi_CuaBan"      # Mật khẩu WiFi
API_URL   = "http://192.168.1.105:3001"  # IP máy tính chạy backend
# ────────────────────────────────────────────────

POLL_MS = 2000  # Hỏi server mỗi 2 giây

# ── PHẦN CỨNG ────────────────────────────────────
servo  = PWM(Pin(12), freq=50)          # Servo GPIO 12
pixels = neopixel.NeoPixel(Pin(5), 1)  # LED WS2812B GPIO 5
buzzer = Pin(15, Pin.OUT)              # Buzzer GPIO 15

# ── HÀM ĐIỀU KHIỂN SERVO ─────────────────────────
def set_servo(angle):
    """0° = khóa | 90° = mở"""
    duty = int((angle / 180) * 77 + 26)
    servo.duty(duty)

# ── HÀM ĐIỀU KHIỂN LED ───────────────────────────
def set_led(r, g, b):
    pixels[0] = (r, g, b)
    pixels.write()

def led_red():    set_led(255, 0, 0)    # Đỏ  = khóa
def led_green():  set_led(0, 255, 0)    # Xanh = mở
def led_yellow(): set_led(255, 200, 0)  # Vàng = đang xác thực
def led_off():    set_led(0, 0, 0)

# ── HÀM BUZZER ───────────────────────────────────
def beep(times=1, duration_ms=100):
    for _ in range(times):
        buzzer.value(1)
        time.sleep_ms(duration_ms)
        buzzer.value(0)
        time.sleep_ms(100)

# ── KẾT NỐI WIFI ─────────────────────────────────
def connect_wifi():
    wlan = network.WLAN(network.STA_IF)
    wlan.active(True)
    if wlan.isconnected():
        return wlan
    wlan.connect(WIFI_SSID, WIFI_PASS)
    led_yellow()
    print("Đang kết nối WiFi", end="")
    timeout = 20
    while not wlan.isconnected() and timeout > 0:
        print(".", end="")
        time.sleep(1)
        timeout -= 1
    if wlan.isconnected():
        print("\n✅ WiFi OK —", wlan.ifconfig()[0])
        led_green()
        beep(2)
    else:
        print("\n❌ WiFi thất bại!")
        led_red()
        beep(3)
    return wlan

# ── GỬI LOG LÊN SERVER ───────────────────────────
def send_log(user, method, success):
    try:
        data = ujson.dumps({
            "user_name": user,
            "method":    method,
            "action":    "Vào",
            "success":   success,
            "latency":   "120ms"
        })
        r = urequests.post(
            API_URL + "/api/logs",
            data=data,
            headers={"Content-Type": "application/json"},
            timeout=3
        )
        r.close()
    except Exception as e:
        print("Log error:", e)

# ── GỬI TRẠNG THÁI CỬA LÊN SERVER ───────────────
def send_door_state(locked):
    try:
        data = ujson.dumps({"locked": locked})
        r = urequests.post(
            API_URL + "/api/door/state",
            data=data,
            headers={"Content-Type": "application/json"},
            timeout=3
        )
        r.close()
    except Exception as e:
        print("Door state error:", e)

# ── LẤY TRẠNG THÁI CỬA TỪ SERVER ────────────────
def get_door_state():
    try:
        r = urequests.get(API_URL + "/api/door/state", timeout=3)
        data = r.json()
        r.close()
        return bool(data.get("locked", True))
    except Exception as e:
        print("Get state error:", e)
        return None  # Không lấy được → giữ nguyên

# ── VÒNG LẶP CHÍNH ───────────────────────────────
def main():
    wlan = connect_wifi()

    # Khởi tạo — trạng thái khóa
    set_servo(0)
    led_red()
    print("🔒 Hệ thống sẵn sàng")

    last_locked = True

    while True:
        # Kiểm tra WiFi còn kết nối không
        if not wlan.isconnected():
            print("WiFi mất kết nối, đang kết nối lại...")
            led_yellow()
            connect_wifi()

        # Hỏi server trạng thái cửa
        locked = get_door_state()

        if locked is not None and locked != last_locked:
            if not locked:
                # ── MỞ KHÓA ──
                print("🔓 Mở khóa!")
                led_yellow()
                time.sleep_ms(300)
                set_servo(90)      # Quay servo 90° → mở
                led_green()
                beep(1, 200)       # Beep 1 tiếng = thành công
                send_log("Dashboard", "Manual", True)

            else:
                # ── KHÓA LẠI ──
                print("🔒 Khóa lại!")
                set_servo(0)       # Quay servo về 0° → khóa
                led_red()
                beep(2, 100)       # Beep 2 tiếng = đã khóa
                send_log("Dashboard", "Manual", True)

            last_locked = locked

        time.sleep_ms(POLL_MS)

# Chạy chương trình
main()
```

### Bước 7.5 — Nạp vào YOLO:Bit

1. Cắm YOLO:Bit vào máy tính qua cáp USB
2. Mở Thonny → **Run → Select Interpreter → MicroPython (ESP32)**
3. Chọn đúng cổng COM (ví dụ: `COM3` trên Windows, `/dev/ttyUSB0` trên Linux)
4. Copy code trên vào Thonny
5. **File → Save As → MicroPython device** → đặt tên `main.py`
6. Nhấn **F5** hoặc nút Run

**Theo dõi Shell của Thonny:**

```
Đang kết nối WiFi....
✅ WiFi OK — 192.168.1.200
🔒 Hệ thống sẵn sàng
```

Bây giờ khi bạn nhấn nút **Mở** trên dashboard React, Servo sẽ quay và LED đổi xanh trong vòng 2 giây!

---

## 8. Sơ Đồ Kết Nối Phần Cứng

```
YOLO:Bit (ESP32)
│
├── GPIO 12 ────────────────► Servo MG996R (Signal/Orange wire)
│                              Servo VCC (Red)   → Nguồn 5V
│                              Servo GND (Brown) → GND
│
├── GPIO 5  ────────────────► LED WS2812B (Data In)
│                              LED VCC            → 3.3V hoặc 5V
│                              LED GND            → GND
│
├── GPIO 15 ────────────────► Buzzer (+)
│                              Buzzer (-)         → GND
│
├── 3V3     ────────────────► Nguồn cho LED (nếu dùng 3.3V)
└── GND     ────────────────► GND chung tất cả
```

> ⚠️ **Lưu ý nguồn điện:** Servo MG996R cần dòng lớn (1-2A). Nên dùng nguồn 5V/2A riêng thay vì lấy từ USB của YOLO:Bit để tránh board bị reset.

---

## 9. API Endpoints

Backend chạy tại `http://localhost:3001`

| Method | Endpoint | Body | Mô tả |
|---|---|---|---|
| GET | `/api/health` | — | Kiểm tra kết nối DB |
| GET | `/api/users` | — | Lấy danh sách người dùng |
| POST | `/api/users` | `{name, role, seed}` | Thêm người dùng |
| PATCH | `/api/users/:id` | `{name, role, online}` | Cập nhật người dùng |
| DELETE | `/api/users/:id` | — | Xóa người dùng |
| GET | `/api/logs?limit=50` | — | Lấy lịch sử truy cập |
| POST | `/api/logs` | `{user_name, method, action, success, latency}` | Ghi log |
| GET | `/api/sensors/latest` | — | Cảm biến mới nhất |
| POST | `/api/sensors` | `{temp, hum, light}` | Lưu dữ liệu cảm biến |
| GET | `/api/door/state` | — | Trạng thái cửa hiện tại |
| POST | `/api/door/state` | `{locked: true/false}` | Cập nhật trạng thái cửa |

**Ví dụ gọi từ YOLO:Bit:**

```python
# Lấy trạng thái cửa
urequests.get("http://192.168.1.105:3001/api/door/state")
# → {"locked": true}

# Ghi log xác thực
urequests.post("http://192.168.1.105:3001/api/logs",
    data='{"user_name":"An","method":"Face","action":"Vào","success":true}',
    headers={"Content-Type": "application/json"})
```

---

## 10. Tính Năng & FR Mapping

| FR | Tính năng | Component | Database |
|---|---|---|---|
| FR1 | Tự động phát hiện & xác thực | `App.jsx` useEffect | — |
| FR2 | Toggle Face ID / Voice ID | `AuthModes` | — |
| FR3 | Mở khóa khi xác thực thành công | `useAppState` → Servo | `door_state` |
| FR4 | Từ chối & hiển thị lý do | `useAppState` → LED đỏ | `access_logs` |
| FR5 | LED 4 màu chỉ trạng thái | `HeroCard` + YOLO:Bit | — |
| FR6 | Biểu đồ hoạt động 7 ngày | `ActivityChart` | `access_logs` |
| FR7 | Mở/khóa thủ công từ dashboard | `HeroCard` buttons | `door_state` |
| FR8 | Ghi & hiển thị lịch sử | `AccessLog` | `access_logs` |
| FR9 | Quản lý người dùng CRUD | `UserManager` | `users` |
| FR10 | Cảnh báo nhiều lần thất bại | `AlertBar` | — |

---

## 11. Xử Lý Lỗi Thường Gặp

### ❌ `ECONNREFUSED` ở Vite console
**Nguyên nhân:** Backend chưa chạy.
**Giải pháp:** Chạy `cd server && npm run dev` ở terminal riêng.

### ❌ `Access denied for user 'root'@'localhost'`
**Nguyên nhân:** Sai password MySQL trong `.env`.
**Giải pháp:** Kiểm tra lại `DB_PASS` trong file `.env`. Nếu không có password thì để trống: `DB_PASS=`

### ❌ Badge hiển thị "Local Mode" thay vì "MySQL Connected"
**Nguyên nhân:** Backend chưa chạy hoặc DB lỗi.
**Giải pháp:** Mở `http://localhost:3001/api/health` xem kết quả, paste lỗi để debug.

### ❌ YOLO:Bit không kết nối được WiFi
**Nguyên nhân:** Sai tên/mật khẩu WiFi, hoặc WiFi 5GHz (ESP32 chỉ hỗ trợ 2.4GHz).
**Giải pháp:** Kiểm tra `WIFI_SSID` và `WIFI_PASS` trong `main.py`. Đảm bảo dùng WiFi 2.4GHz.

### ❌ YOLO:Bit kết nối WiFi nhưng không gọi được API
**Nguyên nhân:** Sai IP máy tính trong `API_URL`.
**Giải pháp:**
1. Chạy `ipconfig` (Windows) hoặc `ifconfig` (Mac/Linux) để tìm IP
2. Cập nhật `API_URL = "http://IP_CUA_BAN:3001"` trong `main.py`
3. Đảm bảo máy tính và YOLO:Bit cùng mạng WiFi

### ❌ Servo không quay
**Nguyên nhân:** Sai GPIO hoặc thiếu nguồn.
**Giải pháp:** Kiểm tra dây nối GPIO 12, dùng nguồn 5V riêng cho Servo.

### ❌ `Warning: Invalid key: jsx` khi chạy Vite
**Nguyên nhân:** Warning vô hại từ cấu hình editor, không ảnh hưởng app.
**Giải pháp:** Bỏ qua, app vẫn chạy bình thường.

---

## 🚀 Tóm Tắt Khởi Động Nhanh

```bash
# Terminal 1 — Backend
cd yolo-home/server
npm install
npm run dev
# → 🏠 YOLO Home API → http://localhost:3001
# → ✅ MySQL connected

# Terminal 2 — Frontend
cd yolo-home
npm install
npm run dev
# → Mở http://localhost:5173
```

Sau đó nạp `main.py` vào YOLO:Bit qua Thonny — hệ thống sẵn sàng! 🎉
