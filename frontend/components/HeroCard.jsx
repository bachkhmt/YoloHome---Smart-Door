import { useState } from 'react'
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
  const [authInProgress, setAuthInProgress] = useState(false)

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


  const handleUnlock = async () => {
    try {
      console.log('[DOOR] 🔓 Gửi lệnh mở khóa → Node.js → Adafruit → Python...');
      const res = await fetch('/api/door/unlock', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
      });
      if (!res.ok) {
        const err = await res.json().catch(() => ({}));
        throw new Error(err.error || `HTTP ${res.status}`);
      }
      const data = await res.json();
      console.log('[DOOR] ✅ Mở khóa thành công:', data.message);
      if (manualUnlock) manualUnlock();
    } catch (error) {
      console.error('[DOOR] ❌ Lỗi mở khóa:', error.message);
      alert('Không thể mở khóa: ' + error.message);
    }
  };

  const handleLock = async () => {
    try {
      console.log('[DOOR] 🔒 Gửi lệnh khóa → Node.js → Adafruit → Python...');
      const res = await fetch('/api/door/lock', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
      });
      if (!res.ok) {
        const err = await res.json().catch(() => ({}));
        throw new Error(err.error || `HTTP ${res.status}`);
      }
      const data = await res.json();
      console.log('[DOOR] ✅ Khóa cửa thành công:', data.message);
      if (manualLock) manualLock();
    } catch (error) {
      console.error('[DOOR] ❌ Lỗi khóa cửa:', error.message);
      alert('Không thể khóa cửa: ' + error.message);
    }
  };

  /**
   * Kích hoạt xác thực khuôn mặt qua API.
   * 
   * Flow:
   *   1. POST /api/auth/trigger
   *   2. Node.js publish lên Adafruit yolohome.auth-trigger
   *   3. Python nhận → mở camera → xác thực 1 lần → đóng camera
   *   4. Kết quả trả về qua socket hoặc polling
   */
  const handleAuth = async () => {
    if (authInProgress) {
      console.warn('[AUTH] Đang xử lý request xác thực khác')
      return
    }

    setAuthInProgress(true)

    try {
      console.log('[AUTH] 🔍 Gửi lệnh xác thực...')

      const res = await fetch('/api/auth/trigger', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
      })

      if (!res.ok) {
        throw new Error(`HTTP ${res.status}`)
      }

      const data = await res.json()
      console.log('[AUTH] ✅ Lệnh xác thực đã gửi:', data)

      // Gọi callback của parent (nếu có logic thêm)
      if (startAuth) {
        startAuth()
      }

    } catch (error) {
      console.error('[AUTH] ❌ Lỗi khi gửi lệnh xác thực:', error)
      alert('Không thể kích hoạt xác thực. Vui lòng thử lại.')
    } finally {
      // Reset trạng thái sau 3s (hoặc đợi response từ socket)
      setTimeout(() => setAuthInProgress(false), 3000)
    }
  }

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
        <button 
          className={`${styles.btn} ${styles.btnPrimary}`} 
          onClick={handleAuth} 
          disabled={busy || authInProgress}
        >
          {authInProgress ? '⏳ Đang xác thực...' : busy ? '⏳ Đang xử lý...' : '🔍 Xác Thực'}
        </button>
        
        <button 
          className={`${styles.btn} ${styles.btnSuccess}`} 
          onClick={handleUnlock}
        >
          🔓 Mở
        </button>
        
        <button 
          className={`${styles.btn} ${styles.btnDanger}`} 
          onClick={handleLock}
        >
          🔒 Khóa
        </button>
      </div>
    </div>
  )
}