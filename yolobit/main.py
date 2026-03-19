# ═══════════════════════════════════════════
#  YOLO Home — Firmware YOLO:Bit (ESP32)
#  MicroPython
#  Nạp file này vào YOLO:Bit qua Thonny IDE
# ═══════════════════════════════════════════

import network, urequests, ujson, time
from machine import Pin, PWM
import neopixel

# ── ⚙️ SỬA 3 DÒNG NÀY TRƯỚC KHI NẠP ──────
WIFI_SSID = "TenWifi_CuaBan"
WIFI_PASS = "MatKhauWifi_CuaBan"
API_URL   = "http://192.168.1.xxx:3001"   # IP máy tính chạy backend
# ──────────────────────────────────────────

POLL_MS = 2000

servo = PWM(Pin(12), freq=50)
led   = neopixel.NeoPixel(Pin(5), 1)

def set_servo(angle):
    duty = int((angle / 180) * 77 + 26)
    servo.duty(duty)

def set_led(r, g, b):
    led[0] = (r, g, b)
    led.write()

def blink_led(r, g, b, times=3):
    for _ in range(times):
        set_led(r, g, b)
        time.sleep_ms(200)
        set_led(0, 0, 0)
        time.sleep_ms(200)

def connect_wifi():
    wlan = network.WLAN(network.STA_IF)
    wlan.active(True)
    if wlan.isconnected():
        return wlan
    wlan.connect(WIFI_SSID, WIFI_PASS)
    print("Đang kết nối WiFi", end="")
    timeout = 20
    while not wlan.isconnected() and timeout > 0:
        print(".", end="")
        time.sleep(1)
        timeout -= 1
    if wlan.isconnected():
        print("\n✅ WiFi OK —", wlan.ifconfig()[0])
        blink_led(0, 255, 0)
    else:
        print("\n❌ WiFi thất bại")
        blink_led(255, 0, 0)
    return wlan

def send_log(user, method, success):
    try:
        body = ujson.dumps({
            "user_name": user,
            "method":    method,
            "action":    "Vào",
            "success":   success,
            "latency":   "120ms"
        })
        urequests.post(API_URL + "/api/logs", data=body,
            headers={"Content-Type": "application/json"}, timeout=3)
    except Exception as e:
        print("❌ Log error:", e)

def send_door_state(locked):
    try:
        body = ujson.dumps({"locked": locked})
        urequests.post(API_URL + "/api/door/state", data=body,
            headers={"Content-Type": "application/json"}, timeout=3)
    except Exception as e:
        print("❌ Door error:", e)

def get_door_state():
    try:
        r = urequests.get(API_URL + "/api/door/state", timeout=3)
        return r.json().get("locked", True)
    except:
        return None

def main():
    wlan = connect_wifi()
    set_servo(0)
    set_led(255, 0, 0)
    print("🔒 Hệ thống sẵn sàng")

    last_locked = True

    while True:
        if not wlan.isconnected():
            print("⚠️ Mất WiFi, reconnect...")
            set_led(255, 165, 0)
            connect_wifi()

        locked = get_door_state()

        if locked is not None and locked != last_locked:
            if not locked:
                set_servo(90)
                set_led(0, 255, 0)
                print("🔓 Mở khóa")
            else:
                set_servo(0)
                set_led(255, 0, 0)
                print("🔒 Khóa lại")
            last_locked = locked

        time.sleep_ms(POLL_MS)

main()
