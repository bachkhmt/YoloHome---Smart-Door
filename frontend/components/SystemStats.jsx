import styles from './css/SystemStats.module.css'

export default function SystemStats({ sysStats }) {
  const items = [
    { label: 'CPU',      value: sysStats.cpu + '%',   color: 'var(--theme)'   },
    { label: 'RAM',      value: sysStats.ram + '%',   color: 'var(--theme2)'  },
    { label: 'Network',  value: sysStats.net ? 'OK' : 'WEAK', color: sysStats.net ? 'var(--success)' : 'var(--warn)' },
    { label: 'Latency',  value: sysStats.latency + 'ms', color: 'var(--theme)' },
    { label: 'Accuracy', value: '97.8%',              color: 'var(--success)' },
  ]
  return (
    <div className={styles.card}>
      <div className={styles.label}>🖥️ System</div>
      <div className={styles.grid}>
        {items.map(item => (
          <div key={item.label} className={styles.item}>
            <div className={styles.iLabel}>{item.label}</div>
            <div className={styles.iVal} style={{ color: item.color }}>{item.value}</div>
          </div>
        ))}
      </div>
    </div>
  )
}
