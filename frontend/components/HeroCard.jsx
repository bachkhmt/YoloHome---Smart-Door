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
    locked:   { text: '● Locked',       cls: styles.pillLocked   },
    unlocked: { text: '● Unlocked',     cls: styles.pillUnlocked },
    auth:     { text: '● Scanning',     cls: styles.pillAuth     },
    granted:  { text: '● Access OK',    cls: styles.pillGranted  },
    denied:   { text: '● Denied',       cls: styles.pillDenied   },
  }

  const statusKey = ledState === 'auth' ? 'auth'
    : ledState === 'granted' ? 'granted'
    : ledState === 'denied'  ? 'denied'
    : locked ? 'locked' : 'unlocked'
  const status = statusMap[statusKey]

  const handleUnlock = async () => {
    try {
      console.log('[DOOR] Sending unlock command → Node.js → Adafruit → Python...');
      const res = await fetch('/api/door/unlock', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
      });
      if (!res.ok) {
        const err = await res.json().catch(() => ({}));
        throw new Error(err.error || `HTTP ${res.status}`);
      }
      const data = await res.json();
      console.log('[DOOR] Unlock success:', data.message);
      if (manualUnlock) manualUnlock();
    } catch (error) {
      console.error('[DOOR] Unlock error:', error.message);
      alert('Cannot unlock: ' + error.message);
    }
  };

  const handleLock = async () => {
    try {
      console.log('[DOOR] Sending lock command → Node.js → Adafruit → Python...');
      const res = await fetch('/api/door/lock', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
      });
      if (!res.ok) {
        const err = await res.json().catch(() => ({}));
        throw new Error(err.error || `HTTP ${res.status}`);
      }
      const data = await res.json();
      console.log('[DOOR] Lock success:', data.message);
      if (manualLock) manualLock();
    } catch (error) {
      console.error('[DOOR] Lock error:', error.message);
      alert('Cannot lock: ' + error.message);
    }
  };

  const handleAuth = async () => {
    if (authInProgress) {
      console.warn('[AUTH] Another auth request in progress')
      return
    }

    setAuthInProgress(true)

    try {
      console.log('[AUTH] Sending auth trigger...')

      const res = await fetch('/api/auth/trigger', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
      })

      if (!res.ok) {
        throw new Error(`HTTP ${res.status}`)
      }

      const data = await res.json()
      console.log('[AUTH] Trigger sent:', data)

      if (startAuth) {
        startAuth()
      }

    } catch (error) {
      console.error('[AUTH] Trigger error:', error)
      alert('Unable to trigger authentication. Please try again.')
    } finally {
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
          {authInProgress ? '⏳ Authenticating...' : busy ? '⏳ Processing...' : '🔍 Authenticate'}
        </button>

        <button
          className={`${styles.btn} ${styles.btnSuccess}`}
          onClick={handleUnlock}
        >
          🔓 Unlock
        </button>

        <button
          className={`${styles.btn} ${styles.btnDanger}`}
          onClick={handleLock}
        >
          🔒 Lock
        </button>
      </div>
    </div>
  )
}
