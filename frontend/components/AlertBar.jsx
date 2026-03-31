import styles from './css/AlertBar.module.css'

export default function AlertBar({ alerts, resolveAlertById, resolveAllAlerts }) {
  if (!alerts.length) return null
  
  return (
    <div className={styles.wrap}>
      {/* Nút Xử lý tất cả: Hiển thị khi có từ 2 cảnh báo trở lên */}
      {alerts.length > 1 && resolveAllAlerts && (
        <div style={{ display: 'flex', justifyContent: 'flex-end', marginBottom: '2px' }}>
          <button 
            className={styles.resolve} 
            onClick={resolveAllAlerts}
            style={{ 
              background: 'rgba(16,185,129,0.15)', 
              borderColor: 'rgba(16,185,129,0.3)', 
              color: 'var(--success)' 
            }}
          >
            Đã xử lý tất cả ({alerts.length}) ✓
          </button>
        </div>
      )}

      {/* Danh sách các cảnh báo lẻ */}
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