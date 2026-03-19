import styles from './css/SensorCard.module.css'

export default function SensorCard({ icon, label, value, unit, barPct, delay = 0 }) {
  return (
    <div className={styles.card} style={{ animationDelay: delay + 's' }}>
      <div className={styles.label}>{icon} {label}</div>
      <div className={styles.valBig}>
        <span className={styles.val}>{value}</span>
        <span className={styles.unit}>{unit}</span>
      </div>
      <div className={styles.bar}>
        <div className={styles.fill} style={{ width: barPct + '%' }} />
      </div>
    </div>
  )
}
