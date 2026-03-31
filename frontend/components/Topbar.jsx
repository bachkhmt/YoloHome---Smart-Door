import { useState, useEffect } from 'react'
import styles from './css/Topbar.module.css'

export default function Topbar({ dbConnected, uptimeStart }) {
  const [time, setTime] = useState('')
  const [uptime, setUptime] = useState('0:00')

  useEffect(() => {
    const iv = setInterval(() => {
      setTime(new Date().toTimeString().slice(0, 8))
      const sec = Math.floor((Date.now() - uptimeStart.current) / 1000)
      setUptime(
        String(Math.floor(sec / 3600)).padStart(2,'0') + ':' +
        String(Math.floor(sec % 3600 / 60)).padStart(2,'0')
      )
    }, 1000)
    return () => clearInterval(iv)
  }, [uptimeStart])

  return (
    <header className={styles.topbar}>
      <div className={styles.logo}>🏠 YOLO Home</div>
      <div className={styles.timeBadge}>{time || '--:--:--'}</div>
      <div className={styles.right}>
        <span className={`${styles.dbBadge} ${dbConnected ? styles.dbOn : styles.dbOff}`}>
          {dbConnected ? '🗄️ MySQL Connected' : '🗄️ Local Mode'}
        </span>
        <span className={styles.onlineDot}>System Online · {uptime}</span>
      </div>
    </header>
  )
}
