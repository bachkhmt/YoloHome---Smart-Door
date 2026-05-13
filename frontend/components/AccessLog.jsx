import styles from './css/AccessLog.module.css'

export default function AccessLog({ logs }) {
  return (
    <div className={styles.card}>
      <div className={styles.label}>📋 Access Log</div>
      <div className={styles.wrap}>
        <table>
          <thead>
            <tr>
              <th>Time</th>
              <th>User</th>
              <th>Method</th>
              <th>Status</th>
              <th>Latency</th>
            </tr>
          </thead>
          <tbody>
            {logs.map((l, i) => (
              <tr key={i}>
                <td className={styles.time}>{l.time instanceof Date ? l.time.toLocaleTimeString('en-US') : l.time}</td>
                <td>{l.user}</td>
                <td><span className={styles.tag}>{l.method}</span></td>
                <td><span className={`${styles.badge} ${l.success ? styles.ok : styles.fail}`}>{l.success ? 'Success' : 'Failed'}</span></td>
                <td className={styles.lat}>{l.latency}</td>
              </tr>
            ))}
          </tbody>
        </table>
      </div>
    </div>
  )
}
