import styles from './css/AlertBar.module.css'

export default function AlertBar({ alerts, resolveAlertById }) {
  if (!alerts.length) return null
  return (
    <div className={styles.wrap}>
      {alerts.map(a => (
        <div key={a.id} className={styles.bar}>
          <span>⚠️ {a.message || a.msg}</span>
          <div className={styles.meta}>
            {a.severity && <span className={styles.sev}>{a.severity.toUpperCase()}</span>}
            {resolveAlertById && (
              <button className={styles.resolve} onClick={() => resolveAlertById(a.id)}>
                Đã xử lý ✓
              </button>
            )}
          </div>
        </div>
      ))}
    </div>
  )
}
