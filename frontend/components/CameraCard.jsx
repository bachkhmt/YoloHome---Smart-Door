import { useState, useCallback } from 'react'
import styles from './css/CameraCard.module.css'

export default function CameraCard({ camState, authProgress }) {
  const [mode, setMode] = useState('sim')

  // Khi bấm "Camera thật", chúng ta chỉ cần chuyển mode để React render thẻ <img>
  const handleEnableReal = useCallback(() => {
    setMode('real')
  }, [])

  const handleDisableReal = useCallback(() => {
    setMode('sim')
  }, [])

  return (
    <div className={styles.card}>
      <div className={styles.topRow}>
        <div className={styles.label}>📷 Live Feed</div>
        <div className={styles.modeToggle}>
          <button
            className={`${styles.modeBtn} ${mode === 'sim'  ? styles.active : ''}`}
            onClick={handleDisableReal}
          >Giả lập</button>
          <button
            className={`${styles.modeBtn} ${mode === 'real' ? styles.active : ''}`}
            onClick={handleEnableReal}
          >Camera thật</button>
        </div>
      </div>

      {/* ── GIẢ LẬP ── */}
      {mode === 'sim' && (
        <>
          <div className={styles.camBox}>
            <div className={styles.scanline} />
            <div className={styles.corners}>
              <div className={`${styles.c} ${styles.tl}`}/><div className={`${styles.c} ${styles.tr}`}/>
              <div className={`${styles.c} ${styles.bl}`}/><div className={`${styles.c} ${styles.br}`}/>
            </div>
            {camState.showAvatar && (
              <img
                src={`https://api.dicebear.com/7.x/avataaars/svg?seed=${camState.avatarSeed}&backgroundColor=0f0a1f`}
                className={styles.avatar} alt="User"
              />
            )}
            <div className={styles.camLabel} style={{ color: camState.color }}>{camState.label}</div>
            <div className={styles.camSub}>{camState.sub}</div>
          </div>
          {authProgress?.active && (
            <div className={styles.progWrap}>
              <div className={styles.progHd}>
                <span>{authProgress.label}</span>
                <span>{authProgress.pct}%</span>
              </div>
              <div className={styles.progBar}>
                <div className={styles.progFill} style={{ width: authProgress.pct + '%' }} />
              </div>
            </div>
          )}
        </>
      )}

      {/* ── CAMERA THẬT (ESP32-CAM thông qua Python Flask) ── */}
      {mode === 'real' && (
        <div className={styles.realWrap}>
          <div className={styles.videoWrap}>
            {/* Lấy nguồn video từ trạm phát sóng Flask của Python ở port 5050.
              Việc thêm query `?t=...` giúp tránh bị cache hình ảnh trên trình duyệt 
            */}
            <img 
              src="http://localhost:5050/video_feed" 
              className={styles.video} 
              alt="ESP32-CAM via Python"
              onError={(e) => {
                // Tạm ẩn video và hiện thông báo lỗi để không gọi lại liên tục
                e.target.style.display = 'none';
                if (e.target.nextSibling) {
                  e.target.nextSibling.style.display = 'block';
                }
              }}
            />
            {/* Thông báo lỗi ẩn, chỉ hiện ra khi thẻ img bị lỗi (onError) */}
            <div className={styles.videoOverlay} style={{ display: 'none', color: 'var(--danger)' }}>
              ❌ Không thể kết nối luồng camera (Hãy kiểm tra Backend Python)
            </div>

            {/* Góc khung trang trí */}
            <div className={styles.corners}>
              <div className={`${styles.c} ${styles.tl}`}/><div className={`${styles.c} ${styles.tr}`}/>
              <div className={`${styles.c} ${styles.bl}`}/><div className={`${styles.c} ${styles.br}`}/>
            </div>
          </div>
          <div className={styles.liveTag}>🔴 LIVE ESP32</div>
        </div>
      )}
    </div>
  )
}