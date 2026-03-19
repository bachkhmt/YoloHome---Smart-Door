import styles from './css/AccessLog.module.css'

export default function AccessLog({ logs }) {
  return (
    <div className={styles.card}>
      <div className={styles.label}>📋 Lịch Sử Truy Cập</div>
      <div className={styles.wrap}>
        <table>
          <thead>
            <tr>
              <th>Thời Gian</th>
              <th>Người Dùng</th>
              <th>Phương Thức</th>
              <th>Trạng Thái</th>
              <th>Latency</th>
            </tr>
          </thead>
          <tbody>
            {logs.map((l, i) => (
              <tr key={i}>
                <td className={styles.time}>{l.time instanceof Date ? l.time.toLocaleTimeString('vi-VN') : l.time}</td>
                <td>{l.user}</td>
                <td><span className={styles.tag}>{l.method}</span></td>
                <td><span className={`${styles.badge} ${l.success ? styles.ok : styles.fail}`}>{l.success ? 'Thành công' : 'Thất bại'}</span></td>
                <td className={styles.lat}>{l.latency}</td>
              </tr>
            ))}
          </tbody>
        </table>
      </div>
    </div>
  )
}
