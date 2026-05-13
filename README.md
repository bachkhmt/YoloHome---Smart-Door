# 🏠 YOLO Home — Smart Door System

AI-powered smart door with **face recognition**, **IoT sensor monitoring**, and **remote hardware control** via ESP32 / YOLO:Bit.

[![Stack](https://img.shields.io/badge/Frontend-React_+_Vite-61DAFB?style=flat-square)](https://vitejs.dev)
[![Stack](https://img.shields.io/badge/Backend-Node.js_+_Express-339933?style=flat-square)](https://expressjs.com)
[![Stack](https://img.shields.io/badge/AI-Face_Recognizer_Pipeline-3776AB?style=flat-square)](https://github.com/khenm/face-recognizer)
[![Stack](https://img.shields.io/badge/Hardware-ESP32_+_YOLO:Bit-E34F26?style=flat-square)](https://www.espressif.com)

---

## Architecture

```
┌──────────────────────────────────────────────────────────────┐
│                     React Dashboard (:5173)                  │
│               Face recognition · Door control · Sensors      │
└────────────┬─────────────────────────────────┬──────────────┘
             │ HTTP (Vite proxy)               │ HTTP
             ▼                                 ▼
┌────────────────────────┐    ┌────────────────────────────────┐
│  Node.js + Express     │    │  Face Recognizer (:8000)       │
│  + MySQL (:3001)       │    │  YOLO → Liveness → DFA →       │
│  Users · Logs · Door   │    │  ArcFace → FAISS + SQLite      │
└────────┬───────────────┘    └────────────────────────────────┘
         │ MQTT (Adafruit IO)
         ▼
┌─────────────────────────────────────────────────────────────┐
│              ESP32 / YOLO:Bit Hardware                      │
│  ESP32-CAM · Servo (GPIO12) · LED (GPIO5) · DHT22 (GPIO4)  │
└─────────────────────────────────────────────────────────────┘
```

## Quick Start

### Prerequisites

| Tool | Version |
|---|---|
| Node.js | ≥ 18 |
| Python | ≥ 3.10 + [uv](https://docs.astral.sh/uv/) |
| MySQL | ≥ 8.0 |

### 1. Database

```sql
CREATE DATABASE yolo_home;
```

Run `server/schema.sql` in MySQL to create tables and seed data.

### 2. Environment

Create `.env` in the project root:

```env
DB_HOST=localhost
DB_USER=root
DB_PASS=your_password
DB_NAME=yolo_home
PORT=3001
ADAFRUIT_USERNAME=your_username   # optional, for MQTT
ADAFRUIT_KEY=your_aio_key         # optional, for MQTT
```

### 3. Backend

```bash
cd server
npm install
node index.js       # → http://localhost:3001
```

### 4. Frontend

```bash
npm install
npm run dev         # → http://localhost:5173
```

### 5. Face Recognizer (AI Pipeline)

```bash
git clone https://github.com/khenm/face-recognizer.git
cd face-recognizer
uv sync
uv run python scripts/download_models.py
uv run python scripts/serve.py    # → http://localhost:8000
```

The dashboard auto-connects to the face recognizer via the Vite proxy (`/face-recognizer` → `localhost:8000`).

## Features

### 🔐 Face Recognition Door Lock

- **Enroll**: Capture face from webcam → stored in vector database (FAISS + SQLite)
- **Recognize**: 5-stage pipeline — YOLO detect → Liveness check → DFA align → ArcFace embed → FAISS search
- **Auto-unlock**: Matching face triggers door unlock via MQTT → servo
- **Spoof detection**: MiniFASNet liveness check blocks photos/replays
- **Access log**: Every authentication recorded with timestamp, method, confidence

### 🌡️ Sensor Monitoring

- Temperature, humidity, light level from DHT22
- Real-time charts (7-day activity history)
- Configurable alert thresholds

### 🎛️ Hardware Control

- **Servo door lock** (GPIO12)
- **RGB LED mood lighting** (GPIO5, NeoPixel WS2812B)
- **Fan speed control** via PWM
- All commands routed through Adafruit IO MQTT

## API Endpoints

### Node.js Backend (`:3001`)

| Method | Path | Description |
|---|---|---|
| GET | `/api/health` | Health check + DB status |
| GET | `/api/summary` | Dashboard summary |
| GET/POST/PATCH/DELETE | `/api/users/*` | User CRUD |
| GET/POST | `/api/logs` | Access log read/write |
| GET/POST | `/api/door/state` | Door lock state |
| POST | `/api/door/unlock` | Unlock door (publishes to Adafruit) |
| POST | `/api/door/lock` | Lock door (publishes to Adafruit) |
| GET/POST | `/api/sensors/*` | Sensor readings |
| GET/POST/PATCH | `/api/remote/*` | Remote device commands |
| GET/POST/PATCH | `/api/alerts/*` | Security alerts |
| GET/POST/PATCH | `/api/backups/*` | System backups |
| GET | `/api/chart/weekly` | Weekly auth stats |

### Face Recognizer (`:8000`)

| Method | Path | Description |
|---|---|---|
| GET | `/health` | Liveness probe |
| GET | `/people` | List enrolled identities + threshold |
| POST | `/recognize` | Recognize face in uploaded image |
| POST | `/enroll` | Enroll new person from image |
| POST | `/calibrate` | Recompute match threshold |
| DELETE | `/people/{name}` | Remove enrolled person |

## Hardware Wiring

| Component | GPIO | Notes |
|---|---|---|
| Servo MG996R | 12 | Door lock actuator |
| LED WS2812B | 5 | NeoPixel status indicator |
| DHT22 | 4 | Temperature + humidity |
| ESP32-CAM | I2C | Camera module |
| Buzzer | 15 | Optional alert buzzer |

## Project Structure

```
YoloHome---Smart-Door/
├── frontend/               # React + Vite dashboard
│   ├── components/         # UI cards (Hero, Camera, Sensors, etc.)
│   ├── hooks/              # State management + face recognition
│   └── lib/                # Axios API client
├── server/                 # Node.js + Express + MySQL
│   ├── index.js            # API server
│   └── schema.sql          # Database schema + seed data
├── IoT/                    # Python IoT gateway
│   ├── yolohome/           # Core package
│   │   ├── devices/        # Hardware abstraction (ESP32-CAM, mic, sensors)
│   │   ├── parsers/        # Event parsers (camera, sound, micro:bit)
│   │   ├── simulators/     # Simulated devices for development
│   │   └── gateway/        # MQTT + Adafruit IO bridge
│   ├── gateway_bridge.py   # Gateway → Node.js DB bridge
│   └── scripts/run.py      # Gateway entrypoint
├── yolobit/                # MicroPython firmware for YOLO:Bit
│   └── main.py
├── vite.config.js          # Vite config + API proxy
└── package.json            # Frontend dependencies
```

## Development Without Hardware

The system supports full software-only development:

- **Face Recognizer**: Use laptop webcam (click "Start Camera" in dashboard)
- **Sensors**: Simulated data from `IoT/yolohome/simulators/` or dashboard defaults
- **Door state**: Toggle manually via dashboard buttons
- Set `use_simulator: true` in `IoT/configs/settings.yaml` for the Python gateway

## Troubleshooting

| Issue | Fix |
|---|---|
| Camera not showing | Click "▶ Start Camera" — browser requires user gesture for `getUserMedia` |
| No MySQL connection | Verify `.env` has correct `DB_HOST`, `DB_USER`, `DB_PASS`, `DB_NAME` |
| Face recognizer offline | Ensure `face-recognizer` server is running on port 8000 |
| Liveness false positives | Liveness is skipped by default (`skip_liveness: true`) |
| MQTT disconnected | Set `ADAFRUIT_USERNAME` and `ADAFRUIT_KEY` in `.env` |

## License

MIT
