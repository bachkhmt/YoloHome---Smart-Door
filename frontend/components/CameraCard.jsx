import { useState, useRef, useCallback } from 'react'
import styles from './css/CameraCard.module.css'

export default function CameraCard({ camState, authProgress }) {
  const [mode,         setMode]         = useState('sim')
  const [cameraActive, setCameraActive] = useState(false)
  const [camError,     setCamError]     = useState(null)
  const videoRef  = useRef(null)
  const streamRef = useRef(null)

  const startCamera = useCallback(async () => {
    setCamError(null)
    try {
      const stream = await navigator.mediaDevices.getUserMedia({
        video: { width: { ideal: 640 }, height: { ideal: 480 }, facingMode: 'user' },
      })
      streamRef.current = stream
      if (videoRef.current) {
        videoRef.current.srcObject = stream
        await videoRef.current.play()
      }
      setCameraActive(true)
    } catch (e) {
      const msg =
        e.name === 'NotAllowedError' ? 'Cần cho phép quyền camera trong trình duyệt' :
        e.name === 'NotFoundError'   ? 'Không tìm thấy camera' :
        'Lỗi: ' + e.message
      setCamError(msg)
    }
  }, [])

  const stopCamera = useCallback(() => {
    streamRef.current?.getTracks().forEach(t => t.stop())
    streamRef.current = null
    if (videoRef.current) videoRef.current.srcObject = null
    setCameraActive(false)
    setCamError(null)
  }, [])

  const handleEnableReal = useCallback(async () => {
    setMode('real')
    await startCamera()
  }, [startCamera])

  const handleDisableReal = useCallback(() => {
    stopCamera()
    setMode('sim')
  }, [stopCamera])

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
          {authProgress.active && (
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

      {/* ── CAMERA THẬT ── */}
      {mode === 'real' && (
        <div className={styles.realWrap}>
          <div className={styles.videoWrap}>
            <video
              ref={videoRef}
              className={styles.video}
              muted playsInline autoPlay
            />
            {!cameraActive && !camError && (
              <div className={styles.videoOverlay}>Đang khởi động camera...</div>
            )}
            {camError && (
              <div className={styles.videoOverlay} style={{ color: 'var(--danger)' }}>
                ❌ {camError}
              </div>
            )}
            {/* Góc khung */}
            <div className={styles.corners}>
              <div className={`${styles.c} ${styles.tl}`}/><div className={`${styles.c} ${styles.tr}`}/>
              <div className={`${styles.c} ${styles.bl}`}/><div className={`${styles.c} ${styles.br}`}/>
            </div>
          </div>
          {cameraActive && (
            <div className={styles.liveTag}>🔴 LIVE</div>
          )}
        </div>
      )}
    </div>
  )
}
