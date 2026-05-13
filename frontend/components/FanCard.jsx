import styles from './css/FanCard.module.css'

export default function FanCard({ fanSpeed, setFanSpeed }) {
  const spinDuration = fanSpeed === 0 ? 0 : (105 - fanSpeed) / 20
  return (
    <div className={styles.card}>
      <div className={styles.label}>⚙️ Fan Speed</div>
      <div className={styles.row}>
        <span
          className={styles.fanIcon}
          style={{ animation: fanSpeed > 0 ? `spin ${spinDuration}s linear infinite` : 'none' }}
        >🌀</span>
        <input
          type="range" min="0" max="100" value={fanSpeed}
          className={styles.slider}
          onChange={e => setFanSpeed(Number(e.target.value))}
        />
        <span className={styles.val}>{fanSpeed}%</span>
      </div>
      <div className={styles.hint}>GPIO 12 — YOLO:Bit PWM</div>
    </div>
  )
}
