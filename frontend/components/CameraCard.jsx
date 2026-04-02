import { useState } from 'react'
import styles from './css/CameraCard.module.css'

const BACKEND_URL = 'http://localhost:5050'

export default function CameraCard({ camState, authProgress }) {
  const [imageError, setImageError] = useState(false)

  const handleImageError = () => {
    setImageError(true)
  }

  const handleImageLoad = () => {
    setImageError(false)
  }

  return (
    <div className={styles.card}>
      <div className={styles.topRow}>
        <div className={styles.label}>📷 Live Feed - ESP32-CAM</div>
      </div>

      {/* ── CAMERA THẬT (ESP32-CAM qua Python Flask) ── */}
      <div className={styles.realWrap}>
        <div className={styles.videoWrap} style={{ position: 'relative' }}>
          {!imageError ? (
            <img
              src={`${BACKEND_URL}/video_feed`}
              className={styles.video}
              alt="ESP32-CAM via Python"
              onError={handleImageError}
              onLoad={handleImageLoad}
            />
          ) : (
            <div 
              className={styles.videoOverlay} 
              style={{ 
                display: 'flex', 
                color: 'var(--danger)',
                alignItems: 'center',
                justifyContent: 'center',
                flexDirection: 'column',
                gap: '1rem',
                padding: '2rem',
                textAlign: 'center'
              }}
            >
              <div style={{ fontSize: '3rem' }}>❌</div>
              <div>Không thể kết nối luồng camera</div>
              <div style={{ fontSize: '0.9rem', opacity: 0.7 }}>
                Kiểm tra Backend Python đang chạy tại {BACKEND_URL}
              </div>
            </div>
          )}

          {/* Overlay trạng thái xác thực */}
          <div style={{
            position: 'absolute', 
            bottom: '0.5rem', 
            left: 0, 
            right: 0,
            display: 'flex', 
            flexDirection: 'column', 
            alignItems: 'center',
            pointerEvents: 'none',
          }}>
            <div className={styles.camLabel} style={{ color: camState.color }}>
              {camState.label}
            </div>
            <div className={styles.camSub}>{camState.sub}</div>
          </div>

          {/* Góc trang trí */}
          <div className={styles.corners}>
            <div className={`${styles.c} ${styles.tl}`}/>
            <div className={`${styles.c} ${styles.tr}`}/>
            <div className={`${styles.c} ${styles.bl}`}/>
            <div className={`${styles.c} ${styles.br}`}/>
          </div>
        </div>

        <div className={styles.liveTag}>
          🔴 LIVE ESP32-CAM
        </div>
      </div>

      {/* Thanh tiến trình xác thực */}
      {authProgress?.active && (
        <div className={styles.progWrap}>
          <div className={styles.progHd}>
            <span>{authProgress.label}</span>
            <span>{authProgress.pct}%</span>
          </div>
          <div className={styles.progBar}>
            <div 
              className={styles.progFill} 
              style={{ width: authProgress.pct + '%' }} 
            />
          </div>
        </div>
      )}
    </div>
  )
}