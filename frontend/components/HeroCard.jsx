import styles from './css/HeroCard.module.css'

const LED_MAP = {
  ready:   { id: 'blue',   cls: 'onBlue',   label: 'READY'  },
  auth:    { id: 'yellow', cls: 'onYellow',  label: 'AUTH'   },
  granted: { id: 'green',  cls: 'onGreen',   label: 'OK'     },
  denied:  { id: 'red',    cls: 'onRed',     label: 'DENIED' },
}

function LedIndicator({ id, label, active, colorClass }) {
  return (
    <div className={styles.ledItem}>
      <div className={`${styles.led} ${active ? styles[colorClass] + ' ' + styles.pulse : styles.off}`} />
      <span>{label}</span>
    </div>
  )
}

export default function HeroCard({ locked, busy, ledState, startAuth, manualUnlock, manualLock }) {
  const statusMap = {
    locked:   { text: '● Đang Khóa',    cls: styles.pillLocked   },
    unlocked: { text: '● Đã Mở',        cls: styles.pillUnlocked },
    auth:     { text: '● Đang Xác Thực',cls: styles.pillAuth     },
    granted:  { text: '● Truy Cập OK',  cls: styles.pillGranted  },
    denied:   { text: '● Từ Chối',      cls: styles.pillDenied   },
  }
  const statusKey = ledState === 'auth' ? 'auth'
    : ledState === 'granted' ? 'granted'
    : ledState === 'denied'  ? 'denied'
    : locked ? 'locked' : 'unlocked'
  const status = statusMap[statusKey]

  return (
    <div className={styles.hero}>
      <div className={styles.left}>
        <div className={styles.doorIcon} style={{ filter: `drop-shadow(0 0 12px var(--theme))` }}>
          {locked ? '🔒' : '🔓'}
        </div>
        <div>
          <div className={styles.title}>Smart Front Door</div>
          <div className={styles.sub}>YOLO Home Security System</div>
          <div className={`${styles.pill} ${status.cls}`}>{status.text}</div>
          <div className={styles.ledRow}>
            {['blue','yellow','green','red'].map(color => {
              const mapping = Object.values(LED_MAP).find(m => m.id === color)
              const isActive = LED_MAP[ledState]?.id === color
              const colorClass = mapping?.cls || 'off'
              return <LedIndicator key={color} id={color} label={mapping?.label || color.toUpperCase()} active={isActive} colorClass={colorClass} />
            })}
          </div>
        </div>
      </div>
      <div className={styles.right}>
        <button className={`${styles.btn} ${styles.btnPrimary}`} onClick={startAuth} disabled={busy}>
          {busy ? '⏳ Đang xác thực...' : '🔍 Xác Thực'}
        </button>
        <button className={`${styles.btn} ${styles.btnSuccess}`} onClick={manualUnlock}>🔓 Mở</button>
        <button className={`${styles.btn} ${styles.btnDanger}`}  onClick={manualLock}>🔒 Khóa</button>
      </div>
    </div>
  )
}
