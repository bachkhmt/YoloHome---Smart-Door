# 🏠 YoloHome — Hệ Thống Nhà Thông Minh Dựa Trên AI

> Một hệ thống IoT thông minh kết hợp thị giác máy tính (Computer Vision), xử lý âm thanh, và cảm biến vật lý để giám sát và điều khiển ngôi nhà theo thời gian thực.

---

## 📋 Mục Lục

- [Giới thiệu](#-giới-thiệu)
- [Kiến trúc hệ thống](#-kiến-trúc-hệ-thống)
- [Luồng dữ liệu](#-luồng-dữ-liệu)
- [Cấu trúc thư mục](#-cấu-trúc-thư-mục)
- [Yêu cầu hệ thống](#-yêu-cầu-hệ-thống)
- [Cài đặt](#-cài-đặt)
- [Cấu hình](#-cấu-hình)
- [Khởi chạy](#-khởi-chạy)
- [Chế độ mô phỏng](#-chế-độ-mô-phỏng-simulator)
- [Mở rộng hệ thống](#-mở-rộng-hệ-thống)
- [Kiểm thử](#-kiểm-thử)
- [Dashboard](#-dashboard)
- [Công nghệ sử dụng](#-công-nghệ-sử-dụng)

---

## 🎯 Giới Thiệu

**YoloHome** là một dự án nhà thông minh mã nguồn mở được xây dựng theo kiến trúc module hóa cao. Hệ thống có khả năng:

- 🎥 **Nhận diện khuôn mặt / phát hiện người** qua camera sử dụng YOLO
- 🔊 **Phân tích âm thanh** để nhận biết tiếng gõ cửa, tiếng chuông, tiếng nói
- 🌡️ **Đọc cảm biến vật lý** nhiệt độ, độ ẩm, gia tốc từ BBC Micro:bit
- ☁️ **Đồng bộ dữ liệu lên đám mây** thông qua Adafruit IO (REST + MQTT)
- 📊 **Hiển thị dashboard thời gian thực** bằng giao diện React

Dự án được thiết kế theo nguyên tắc **SOLID**, tách biệt rõ ràng giữa phần cứng và logic nghiệp vụ, cho phép chạy hoàn toàn trên phần mềm giả lập mà không cần thiết bị thật.

---

## 🏗️ Kiến Trúc Hệ Thống

```
┌─────────────────────────────────────────────────────────────────┐
│                        YoloHome Architecture                    │
│                                                                 │
│  ┌──────────────┐    ┌──────────────┐    ┌──────────────────┐  │
│  │   DEVICES    │    │   PARSERS    │    │    GATEWAY       │  │
│  │              │    │              │    │                  │  │
│  │  📷 Camera   │───▶│ CameraParser │    │  ┌────────────┐  │  │
│  │  🎤 Mic      │───▶│ SoundParser  │───▶│  │ REST API   │  │  │
│  │  📡 Micro:bit│───▶│MicrobitParser│    │  │ (Adafruit) │  │  │
│  └──────────────┘    └──────────────┘    │  └────────────┘  │  │
│         ▲                                │  ┌────────────┐  │  │
│  ┌──────────────┐                        │  │    MQTT    │  │  │
│  │  SIMULATORS  │                        │  │  Handler   │  │  │
│  │  (Fallback)  │                        │  └────────────┘  │  │
│  └──────────────┘                        └──────────────────┘  │
│                                                   │             │
│                            ┌──────────────────────▼──────────┐ │
│                            │         Adafruit IO Cloud        │ │
│                            └──────────────────────┬──────────┘ │
│                                                   │             │
│                            ┌──────────────────────▼──────────┐ │
│                            │    React Dashboard (Browser)     │ │
│                            └──────────────────────────────────┘ │
└─────────────────────────────────────────────────────────────────┘
```

### Các Tầng Chính

| Tầng | Thành phần | Trách nhiệm |
|---|---|---|
| **Input** | Devices / Simulators | Thu thập dữ liệu thô từ phần cứng hoặc giả lập |
| **Processing** | Parsers | Xử lý và phân tích dữ liệu bằng AI / logic |
| **Orchestration** | InputManager | Điều phối luồng dữ liệu giữa các tầng |
| **Output** | Gateway | Đẩy kết quả lên Adafruit IO qua REST & MQTT |
| **Visualization** | Dashboard (React) | Hiển thị trạng thái nhà cho người dùng |

---

## 🔄 Luồng Dữ Liệu

```
run.py
  └─▶ InputManager.start()
        ├─▶ DeviceFactory.create_camera()    ─▶ CameraParser  ─▶ ParsedEvent{type: FACE_DETECTED}
        ├─▶ DeviceFactory.create_mic()       ─▶ SoundParser   ─▶ ParsedEvent{type: DOORBELL}
        └─▶ DeviceFactory.create_microbit()  ─▶ MicrobitParser─▶ ParsedEvent{type: BUTTON_TRIGGER}
                                                                         │
                                                               Gateway.publish(event)
                                                                         │
                                                         ┌───────────────┴───────────────┐
                                                         ▼                               ▼
                                               AdafruitClient.post()          MQTTHandler.publish()
                                               (REST - lưu lịch sử)         (MQTT - real-time)
                                                         │                               │
                                                         └───────────────┬───────────────┘
                                                                         ▼
                                                              Adafruit IO Dashboard
                                                              yolohome_dashboard.jsx
```

**Giải thích chi tiết:**

1. `run.py` khởi tạo `InputManager` và `Gateway`
2. `InputManager` gọi `DeviceFactory` để lấy thiết bị (thật hoặc giả lập tùy `configs/settings.yaml`)
3. Mỗi thiết bị chạy vòng lặp liên tục, gửi dữ liệu thô vào Parser tương ứng
4. Parser xử lý → tạo ra đối tượng `ParsedEvent` chuẩn hóa
5. `Gateway` nhận sự kiện và gửi lên Adafruit IO bằng cả hai giao thức:
   - **REST API**: Lưu trữ lịch sử dữ liệu
   - **MQTT**: Đẩy thông báo tức thì xuống dashboard
6. **Dashboard React** lắng nghe MQTT feed và cập nhật giao diện theo thời gian thực

---

## 📁 Cấu Trúc Thư Mục

```
yolohome/
│
├── 📄 pyproject.toml          # Khai báo dependencies (uv package manager)
├── 📄 uv.lock                 # Lock file đảm bảo tái tạo môi trường
├── 📄 README.md               # Tài liệu này
├── 📄 run.sh                  # Script khởi chạy nhanh toàn bộ hệ thống
│
├── 📁 configs/
│   └── settings.yaml          # Cấu hình trung tâm: ngưỡng cảm biến, Adafruit credentials, chế độ giả lập
│
├── 📁 scripts/
│   └── run.py                 # Entrypoint chính: kết nối InputManager ↔ Gateway
│
├── 📁 tests/
│   └── test_parsers.py        # Unit tests cho các Parser
│
├── 📁 yolohome/               # Gói Python cốt lõi
│   │
│   ├── 📄 __init__.py
│   ├── 📄 data_models.py      # Định nghĩa CameraFrame, AudioChunk, MicrobitReading, ParsedEvent
│   ├── 📄 config.py           # Đọc settings.yaml → AppConfig object
│   ├── 📄 input_manager.py    # "Đầu não": khởi tạo devices, điều phối parsers
│   │
│   ├── 📁 devices/            # Lớp trừu tượng phần cứng (Hardware Abstraction Layer)
│   │   ├── base.py            # Interface: BaseCamera, BaseMic, BaseMicrobit
│   │   ├── real_camera.py     # Driver camera thật (OpenCV)
│   │   ├── real_microphone.py # Driver mic thật (PyAudio)
│   │   ├── real_microbit.py   # Driver Micro:bit thật (Serial/USB)
│   │   └── __init__.py        # DeviceFactory: quyết định thật hay giả lập
│   │
│   ├── 📁 simulators/         # Thiết bị giả lập (không cần phần cứng)
│   │   ├── camera_sim.py      # Sinh ảnh giả có hình người
│   │   ├── microphone_sim.py  # Sinh âm thanh giả (chuông cửa, tiếng gõ)
│   │   └── microbit_sim.py    # Sinh dữ liệu cảm biến giả (nhiệt độ, gia tốc)
│   │
│   ├── 📁 parsers/            # Logic AI & xử lý dữ liệu
│   │   ├── camera_parser.py   # Phát hiện khuôn mặt / người (tích hợp YOLO)
│   │   ├── sound_parser.py    # Phân tích RMS âm thanh → nhận diện sự kiện
│   │   └── microbit_device.py # Diễn giải nút bấm / gia tốc → sự kiện ngữ nghĩa
│   │
│   └── 📁 gateway/            # Kết nối Adafruit IO
│       ├── adafruit_client.py # REST API client
│       ├── mqtt_handler.py    # MQTT client (real-time bi-directional)
│       └── gateway.py         # Wrapper hợp nhất REST + MQTT
│
└── 📄 yolohome_dashboard.jsx  # Frontend React: hiển thị trạng thái nhà thời gian thực
```

---

## ⚙️ Yêu Cầu Hệ Thống

### Phần Mềm

| Công cụ | Phiên bản tối thiểu | Ghi chú |
|---|---|---|
| Python | 3.10+ | Bắt buộc |
| uv | mới nhất | Package manager |
| Node.js | 18+ | Chỉ cần nếu chạy dashboard |

### Phần Cứng (Tùy chọn — có thể dùng Simulator)

| Thiết bị | Mục đích | Bắt buộc? |
|---|---|---|
| Webcam / IP Camera | Phát hiện khuôn mặt | ❌ (có Simulator) |
| Microphone | Nhận diện âm thanh | ❌ (có Simulator) |
| BBC Micro:bit | Cảm biến nhiệt độ, nút bấm | ❌ (có Simulator) |

### Tài Khoản Bên Ngoài

- **Adafruit IO**: Tạo tài khoản miễn phí tại [io.adafruit.com](https://io.adafruit.com)
- Lấy `AIO_KEY` và `AIO_USERNAME` từ trang Account Settings

---

## 🛠️ Cài Đặt

### 1. Clone dự án

```bash
git clone https://github.com/your-username/yolohome.git
cd yolohome
```

### 2. Cài đặt dependencies bằng `uv`

```bash
# Cài uv nếu chưa có
curl -LsSf https://astral.sh/uv/install.sh | sh

# Cài tất cả dependencies
uv sync
```

Các thư viện chính sẽ được cài:
- `opencv-python` — xử lý ảnh từ camera
- `ultralytics` — YOLO model phát hiện đối tượng
- `paho-mqtt` — giao tiếp MQTT với Adafruit IO
- `pyaudio` — thu âm thanh từ microphone
- `pyserial` — giao tiếp USB với Micro:bit

### 3. Cài đặt dependencies Frontend (tùy chọn)

```bash
cd frontend  # hoặc thư mục chứa .jsx
npm install
```

---

## ⚙️ Cấu Hình

Toàn bộ tham số hệ thống được quản lý tập trung trong một file duy nhất:

```yaml
# configs/settings.yaml

# ───────────────────────────────────────
# Chế độ vận hành
# ───────────────────────────────────────
use_simulator: true        # true = dùng Simulator (không cần phần cứng)
                           # false = dùng thiết bị thật

# ───────────────────────────────────────
# Kết nối Adafruit IO
# ───────────────────────────────────────
adafruit:
  username: "your_username"
  aio_key: "your_aio_key"
  feed_camera: "yolohome.camera-events"
  feed_sound: "yolohome.sound-events"
  feed_microbit: "yolohome.microbit-data"

# ───────────────────────────────────────
# Ngưỡng xử lý cảm biến
# ───────────────────────────────────────
thresholds:
  temperature_high: 35.0   # °C — cảnh báo nhiệt độ cao
  temperature_low: 18.0    # °C — cảnh báo nhiệt độ thấp
  sound_rms: 0.05          # Ngưỡng RMS để nhận diện tiếng ồn
  brightness_min: 30       # Ngưỡng độ sáng tối thiểu (0–255)

# ───────────────────────────────────────
# Camera & YOLO
# ───────────────────────────────────────
camera:
  device_id: 0             # Index camera (0 = camera mặc định)
  fps: 10                  # Frame per second xử lý
  yolo_model: "yolov8n"   # Mô hình YOLO (n=nano, s=small, m=medium)
  confidence: 0.5          # Ngưỡng tin cậy phát hiện

# ───────────────────────────────────────
# Micro:bit
# ───────────────────────────────────────
microbit:
  port: "/dev/ttyACM0"     # Cổng Serial (Linux) hoặc "COM3" (Windows)
  baud_rate: 115200
```

> ⚠️ **Bảo mật**: Không commit `settings.yaml` chứa `aio_key` thật lên Git. Sử dụng biến môi trường hoặc file `.env` cho production.

---

## 🚀 Khởi Chạy

### Cách 1: Script tự động (khuyến nghị)

```bash
chmod +x run.sh
./run.sh
```

### Cách 2: Thủ công

```bash
uv run python scripts/run.py
```

### Cách 3: Với thời gian chạy cụ thể

```bash
# Chạy demo trong 60 giây rồi tự dừng
uv run python scripts/run.py --duration 60
```

Khi khởi chạy thành công, bạn sẽ thấy log:

```
[INFO] Loading configuration from configs/settings.yaml
[INFO] use_simulator = True — using simulated devices
[INFO] InputManager initialized with 3 devices
[INFO] Gateway connected to Adafruit IO (MQTT)
[INFO] System running... Press Ctrl+C to stop
[EVENT] FACE_DETECTED — confidence=0.92 → published to feed
[EVENT] DOORBELL — rms=0.12 → published to feed
[EVENT] TEMPERATURE — value=28.3°C → published to feed
```

---

## 🧪 Chế Độ Mô Phỏng (Simulator)

Đặt `use_simulator: true` trong `settings.yaml`. Hệ thống sẽ sử dụng:

| Simulator | Dữ liệu giả lập |
|---|---|
| `camera_sim.py` | Frame ảnh chứa hình người (numpy array), kích hoạt ngẫu nhiên |
| `microphone_sim.py` | Âm thanh giả có chu kỳ RMS cao mô phỏng tiếng chuông |
| `microbit_sim.py` | Nhiệt độ dao động theo sin wave, nút bấm kích hoạt theo thời gian |

Chế độ này cho phép:
- ✅ Phát triển và debug toàn bộ luồng hệ thống mà không cần phần cứng
- ✅ Chạy CI/CD trên cloud server
- ✅ Demo dự án cho người chưa có thiết bị

---

## 🔌 Mở Rộng Hệ Thống

### Thêm loại cảm biến mới

1. **Tạo interface** trong `yolohome/devices/base.py`:

```python
class BaseGasSensor(ABC):
    @abstractmethod
    def read(self) -> GasReading:
        pass
```

2. **Tạo thiết bị thật** trong `yolohome/devices/real_gas_sensor.py`

3. **Tạo simulator** trong `yolohome/simulators/gas_sim.py`

4. **Đăng ký vào Factory** trong `yolohome/devices/__init__.py`

5. **Tạo Parser** trong `yolohome/parsers/gas_parser.py`:

```python
class GasParser:
    def parse(self, reading: GasReading) -> Optional[ParsedEvent]:
        if reading.ppm > self.threshold:
            return ParsedEvent(type="GAS_LEAK", value=reading.ppm)
        return None
```

6. **Cập nhật `InputManager`** để khởi tạo và xử lý sensor mới

### Tích hợp YOLO nâng cao

Để tích hợp YOLO vào `camera_parser.py`:

```python
from ultralytics import YOLO

class CameraParser:
    def __init__(self, config):
        self.model = YOLO(config.camera.yolo_model)
        self.confidence = config.camera.confidence

    def parse(self, frame: CameraFrame) -> Optional[ParsedEvent]:
        results = self.model(frame.data, conf=self.confidence)
        persons = [r for r in results[0].boxes if r.cls == 0]  # class 0 = person
        if persons:
            return ParsedEvent(type="PERSON_DETECTED", count=len(persons))
        return None
```

---

## 🧪 Kiểm Thử

```bash
# Chạy toàn bộ test suite
uv run pytest tests/ -v

# Chạy test cho một parser cụ thể
uv run pytest tests/test_parsers.py::test_sound_parser -v

# Chạy với coverage report
uv run pytest tests/ --cov=yolohome --cov-report=html
```

**Cấu trúc test:**

```
tests/
└── test_parsers.py
    ├── test_camera_parser_detects_face()
    ├── test_camera_parser_returns_none_when_empty()
    ├── test_sound_parser_triggers_on_high_rms()
    ├── test_sound_parser_ignores_silence()
    ├── test_microbit_parser_button_event()
    └── test_microbit_parser_temperature_reading()
```

---

## 📊 Dashboard

`yolohome_dashboard.jsx` là giao diện React kết nối trực tiếp với **Adafruit IO MQTT** để hiển thị:

- 🎥 Trạng thái camera (có người / không có người)
- 🔔 Lịch sử sự kiện âm thanh
- 🌡️ Nhiệt độ & độ ẩm hiện tại (real-time chart)
- 🔘 Trạng thái nút bấm Micro:bit
- ⚠️ Cảnh báo ngưỡng vượt giới hạn

### Chạy Dashboard

```bash
npm start
# Mở trình duyệt tại http://localhost:3000
```

### Cấu hình Dashboard

Cập nhật các biến sau trong đầu file `.jsx`:

```javascript
const AIO_USERNAME = "your_username";
const AIO_KEY      = "your_aio_key";
const FEEDS = {
  camera:   "yolohome.camera-events",
  sound:    "yolohome.sound-events",
  microbit: "yolohome.microbit-data",
};
```

---

## 🧰 Công Nghệ Sử Dụng

| Hạng mục | Công nghệ | Mục đích |
|---|---|---|
| **Runtime** | Python 3.10+ | Ngôn ngữ chính của backend |
| **Package Manager** | `uv` | Quản lý dependencies nhanh và hiệu quả |
| **AI/CV** | YOLO (Ultralytics) | Phát hiện người, khuôn mặt qua camera |
| **Camera** | OpenCV | Đọc và xử lý khung hình |
| **Audio** | PyAudio | Thu âm thanh từ microphone |
| **Hardware** | PySerial | Giao tiếp với BBC Micro:bit qua USB |
| **IoT Protocol** | MQTT (paho-mqtt) | Kết nối thời gian thực với Adafruit IO |
| **Cloud IoT** | Adafruit IO | Lưu trữ và relay dữ liệu cảm biến |
| **Frontend** | React (JSX) | Dashboard giám sát nhà thông minh |
| **Testing** | pytest | Kiểm thử tự động các parser |
| **Config** | YAML | Cấu hình hệ thống tập trung |

---

## 🗺️ Roadmap

- [ ] Tích hợp nhận diện khuôn mặt cụ thể (face recognition) với cơ sở dữ liệu cư dân
- [ ] Hỗ trợ nhiều camera đồng thời
- [ ] Thêm cảm biến khí gas và khói
- [ ] Điều khiển thiết bị (đèn, ổ khóa) từ Dashboard qua MQTT
- [ ] Lưu trữ lịch sử cục bộ bằng SQLite
- [ ] Đóng gói Docker cho triển khai dễ dàng
- [ ] Hỗ trợ Home Assistant integration

---

## 📄 License

MIT License — Xem file `LICENSE` để biết thêm chi tiết.

---

> **Ghi chú phát triển**: Để thêm logic AI mới, hãy bắt đầu tại thư mục `yolohome/parsers/`. Mọi thay đổi ở đây không ảnh hưởng đến phần cứng hay kết nối mạng nhờ kiến trúc module hóa của dự án.