import styles from './css/AuthModes.module.css'

export default function AuthModes({ authMode, toggleAuthMode }) {
  return (
    <div className={styles.card}>
      <div className={styles.label}>🔐 Phương Thức Xác Thực</div>
      <div className={styles.grid}>
        {[
          { key: 'face',  icon: '👤', name: 'FACE ID'  },
          { key: 'voice', icon: '🎙️', name: 'VOICE ID' },
        ].map(m => (
          <div
            key={m.key}
            className={`${styles.mode} ${authMode[m.key] ? styles.on : ''}`}
            onClick={() => toggleAuthMode(m.key)}
          >
            <div className={styles.icon}>{m.icon}</div>
            <div className={styles.name}>{m.name}</div>
            <div className={styles.badge}>{authMode[m.key] ? 'BẬT' : 'TẮT'}</div>
          </div>
        ))}
      </div>
    </div>
  )
}
