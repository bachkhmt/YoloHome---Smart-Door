import { useState, useCallback, useRef, useEffect } from 'react'
import styles from './css/CameraCard.module.css'

export default function CameraCard({ camState, authProgress }) {
  const [mode, setMode] = useState('sim')

  // ── Refs cho webcam (chế độ giả lập) ──
  const videoRef   = useRef(null)
  const streamRef  = useRef(null)   // lưu MediaStream để stop sau này
  const [camError, setCamError] = useState(null)

  // Bật webcam
  const startWebcam = useCallback(async () => {
    setCamError(null)
    try {
      const stream = await navigator.mediaDevices.getUserMedia({
        video: { facingMode: 'user', width: { ideal: 640 }, height: { ideal: 480 } },
        audio: false,
      })
      streamRef.current = stream
      if (videoRef.current) {
        videoRef.current.srcObject = stream
      }
    } catch (err) {
      setCamError('Không thể truy cập webcam: ' + err.message)
    }
  }, [])

  // Tắt webcam khi rời chế độ sim
  const stopWebcam = useCallback(() => {
    if (streamRef.current) {
      streamRef.current.getTracks().forEach(t => t.stop())
      streamRef.current = null
    }
  }, [])

  // Khởi động webcam khi vào chế độ sim, dừng khi rời
  useEffect(() => {
    if (mode === 'sim') {
      startWebcam()
    } else {
      stopWebcam()
    }
    return () => {
      if (mode === 'sim') stopWebcam()
    }
  }, [mode])

  useEffect(() => {
    if (mode === 'sim' && videoRef.current && streamRef.current) {
      videoRef.current.srcObject = streamRef.current
    }
  }, [mode])

  const handleEnableReal = useCallback(() => setMode('real'),  [])
  const handleDisableReal = useCallback(() => setMode('sim'), [])

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

      {/* ── GIẢ LẬP — webcam máy tính ── */}
      {mode === 'sim' && (
        <>
          <div className={styles.realWrap}>
            <div className={styles.videoWrap}>
              {camError ? (
                <div className={styles.videoOverlay} style={{ display: 'flex', color: 'var(--danger)', alignItems: 'center', justifyContent: 'center' }}>
                  ❌ {camError}
                </div>
              ) : (
                <video
                  ref={videoRef}
                  autoPlay
                  playsInline
                  muted
                  className={styles.video}
                  style={{ objectFit: 'cover', background: '#000' }}
                />
              )}

              {/* Overlay trạng thái xác thực (SCANNING / GRANTED / DENIED) */}
              <div style={{
                position: 'absolute', bottom: '0.5rem', left: 0, right: 0,
                display: 'flex', flexDirection: 'column', alignItems: 'center',
                pointerEvents: 'none',
              }}>
                <div className={styles.camLabel} style={{ color: camState.color }}>{camState.label}</div>
                <div className={styles.camSub}>{camState.sub}</div>
              </div>

              <div className={styles.corners}>
                <div className={`${styles.c} ${styles.tl}`}/><div className={`${styles.c} ${styles.tr}`}/>
                <div className={`${styles.c} ${styles.bl}`}/><div className={`${styles.c} ${styles.br}`}/>
              </div>
            </div>
            <div className={styles.liveTag}>🟢 WEBCAM</div>
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

      {/* ── CAMERA THẬT (ESP32-CAM qua Python Flask) ── */}
      {mode === 'real' && (
        <div className={styles.realWrap}>
          <div className={styles.videoWrap}>
            <img
              src="http://localhost:5050/video_feed"
              className={styles.video}
              alt="ESP32-CAM via Python"
              onError={(e) => {
                e.target.style.display = 'none'
                if (e.target.nextSibling) {
                  e.target.nextSibling.style.display = 'block'
                }
              }}
            />
            <div className={styles.videoOverlay} style={{ display: 'none', color: 'var(--danger)' }}>
              ❌ Không thể kết nối luồng camera (Hãy kiểm tra Backend Python)
            </div>
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