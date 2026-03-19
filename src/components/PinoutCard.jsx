import styles from './css/PinoutCard.module.css'

const PINS = [
  { label: 'GPIO12 · SERVO', cls: 'c' },
  { label: 'GPIO5 · LED',    cls: 'p' },
  { label: 'GPIO4 · DHT22',  cls: 'g' },
  { label: 'I2C · CAMERA',   cls: 'c' },
  { label: 'I2S · MIC',      cls: 'g' },
  { label: 'UART · DEBUG',   cls: 'y' },
  { label: '3V3',            cls: 'p' },
  { label: 'GND',            cls: 'n' },
]

export default function PinoutCard() {
  return (
    <div className={styles.card}>
      <div className={styles.label}>📟 YOLO:Bit — Sơ Đồ Kết Nối</div>
      <div className={styles.hwBox}>
        <div className={styles.chipTitle}>ESP32 (YOLO:Bit v3)</div>
        {[
          '📷 Camera OV2640 ——— I2C / DVP Bus',
          '🎙️ Mic INMP441 ———— I2S (GPIO 25/26/27)',
          '🔒 Servo MG996R ——— PWM GPIO 12',
          '💡 LED WS2812B ——— GPIO 5 (NeoPixel)',
          '🌡️ Cảm biến DHT22 —— GPIO 4 (Data)',
          '📡 WiFi / Bluetooth — Onboard ESP32',
        ].map(line => <div key={line}>{line}</div>)}
      </div>
      <div className={styles.pins}>
        {PINS.map(p => (
          <span key={p.label} className={`${styles.pin} ${styles[p.cls]}`}>{p.label}</span>
        ))}
      </div>
    </div>
  )
}
