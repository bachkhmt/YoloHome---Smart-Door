import styles from './css/FaceRecognitionCard.module.css'

/**
 * FaceRecognitionCard — Face Recognizer Pipeline
 *
 * Two modes:
 *   Mock:  simulated silhouette + bounding box + mock pipeline
 *   Live:  real webcam <video> + calls face-recognizer API at /face-recognizer
 */
export default function FaceRecognitionCard({
  pipelineState, stages, lastResult,
  faceDetected, faceBbox,
  enrolling, enrollProgress, enrollName,
  identities, threshold,
  cameraActive, videoRef,
  useEsp32, esp32StreamUrl,
  setEnrollName,
  recognize, enroll, deletePerson, calibrate, reset,
  startCamera,
}) {
  const stageIcons = {
    detect: '🔍', liveness: '🫀', align: '📐', embed: '🧬', search: '🔎',
  }
  const statusIcons = {
    idle: '○', running: '◌', done: '✓', failed: '✗', skipped: '—',
  }
  const stageClasses = (s) => {
    if (s.status === 'running') return styles.stageRunning
    if (s.status === 'done') return styles.stageDone
    if (s.status === 'failed') return styles.stageFailed
    if (s.status === 'skipped') return styles.stageSkipped
    return ''
  }
  const faceBoxClass = () => {
    if (pipelineState === 'scanning') return styles.faceBoxScanning
    if (pipelineState === 'denied' || pipelineState === 'error') return styles.faceBoxDenied
    return ''
  }

  const isBusy = pipelineState === 'scanning' || pipelineState === 'enrolling'
  const isLive = cameraActive
  const canRecognize = isLive ? cameraActive : faceDetected
  const canEnroll = isLive ? cameraActive && enrollName.trim() : faceDetected && enrollName.trim()

  const confLevel = lastResult?.confidence ?? 0
  const confClass = confLevel >= 0.7 ? styles.confHigh : confLevel >= 0.5 ? styles.confMedium : styles.confLow

  return (
    <div className={styles.card}>
      {/* ── Header ─────────────────────────── */}
      <div className={styles.header}>
        <div className={styles.title}>
          <span className={styles.titleIcon}>🧠</span>
          Face Recognizer Pipeline
        </div>
        <div className={styles.apiMode}>{isLive ? 'LIVE' : 'MOCK'}</div>
      </div>

      {/* ── Body: camera + stages ──────────── */}
      <div className={styles.body}>
        {/* LEFT: Camera viewport */}
        <div className={styles.cameraSection}>
          <div className={styles.viewport}>
            {/* Real webcam feed (webcam) or ESP32 MJPEG stream */}
            {isLive && useEsp32 ? (
              <img
                ref={videoRef}
                src={esp32StreamUrl}
                className={styles.videoFeed}
                alt="ESP32-CAM Stream"
              />
            ) : isLive && (
              <video
                ref={videoRef}
                className={styles.videoFeed}
                muted
                playsInline
              />
            )}

            {/* Bounding box overlay on live video */}
            {isLive && lastResult?.face_bbox && (
              <div
                className={styles.faceBox}
                style={{
                  left: `${lastResult.face_bbox.x * 100}%`,
                  top: `${lastResult.face_bbox.y * 100}%`,
                  width: `${lastResult.face_bbox.w * 100}%`,
                  height: `${lastResult.face_bbox.h * 100}%`,
                }}
              />
            )}

            {/* Mock silhouette (when no camera) */}
            {!isLive && (
              <div className={styles.mockFeed}>
                <div className={styles.silhouette}>
                  <div className={styles.silhouetteHead} />
                  <div className={styles.silhouetteBody} />
                </div>
              </div>
            )}

            {/* Face bounding box overlay (mock mode only) */}
            {!isLive && faceDetected && faceBbox && (
              <div
                className={`${styles.faceBox} ${faceBoxClass()}`}
                style={{
                  left: `${faceBbox.x * 100}%`, top: `${faceBbox.y * 100}%`,
                  width: `${faceBbox.w * 100}%`, height: `${faceBbox.h * 100}%`,
                }}
              />
            )}

            {/* Scanning animation when pipeline active */}
            {isBusy && <div className={styles.scanLine} />}

            {/* No face message (mock only) */}
            {!isLive && !faceDetected && !isBusy && (
              <div className={styles.noFace}>
                <span>📡</span>
                <span>Waiting for face...</span>
              </div>
            )}

            {/* Live tag */}
            <div className={styles.camLabel}>
              {isLive ? '📷 LIVE' : '📷 STREAMING'}
            </div>
            <div className={styles.camSource}>
              {isLive ? (useEsp32 ? 'ESP32-CAM' : 'Webcam') : 'ESP32-CAM'}
            </div>

            {/* Start camera button (needs user gesture) */}
            {!isLive && (
              <button
                className={styles.startCamBtn}
                onClick={(e) => { e.stopPropagation(); startCamera(); }}
              >
                ▶ Start Camera
              </button>
            )}

            {/* Corners */}
            <div className={styles.corners}>
              <div className={`${styles.c} ${styles.tl}`} />
              <div className={`${styles.c} ${styles.tr}`} />
              <div className={`${styles.c} ${styles.bl}`} />
              <div className={`${styles.c} ${styles.br}`} />
            </div>
          </div>

          {/* ── Controls ──────────────────── */}
          <div className={styles.controls}>
            <button
              className={`${styles.btn} ${styles.btnPrimary}`}
              disabled={isBusy || !canRecognize}
              onClick={recognize}
            >
              🔍 Recognize
            </button>
            <button className={styles.btn} disabled={isBusy} onClick={reset}>
              ↺ Reset
            </button>
          </div>
        </div>

        {/* RIGHT: Stages + results */}
        <div className={styles.rightPanel}>
          <div className={styles.stagesLabel}>Pipeline Stages</div>
          <div className={styles.stages}>
            {stages.map(s => (
              <div key={s.key} className={`${styles.stage} ${stageClasses(s)}`}>
                <div className={styles.stageIcon}>
                  {s.status === 'running' ? stageIcons[s.key] : statusIcons[s.status]}
                </div>
                <div className={styles.stageName}>{s.label}</div>
                {s.timeMs > 0 && <div className={styles.stageTime}>{s.timeMs}ms</div>}
              </div>
            ))}
          </div>

          {/* Timing bar */}
          {stages.some(s => s.timeMs > 0) && (
            <>
              <div className={styles.timingBar}>
                {stages.filter(s => s.timeMs > 0).map(s => (
                  <div
                    key={s.key}
                    className={`${styles.timingSegment} ${styles[`tSeg${s.key.charAt(0).toUpperCase() + s.key.slice(1)}`] || ''}`}
                    style={{ flex: s.timeMs }}
                  />
                ))}
              </div>
              <div className={styles.totalTiming}>
                Total: {lastResult?.timing?.total ?? stages.reduce((a, s) => a + s.timeMs, 0)}ms
              </div>
            </>
          )}

          {/* ── Recognition Result ────────── */}
          {lastResult && (
            <div className={styles.resultCard}>
              <div className={styles.resultHeader}>
                <span className={styles.resultIcon}>
                  {lastResult.matched ? '✅' : lastResult.error?.includes('Spoof') ? '🚫' : '❌'}
                </span>
                <span className={`${styles.resultTitle} ${
                  lastResult.matched ? styles.resultMatched
                  : lastResult.error?.includes('Spoof') ? styles.resultError
                  : styles.resultDenied
                }`}>
                  {lastResult.matched
                    ? `MATCH — ${lastResult.name}`
                    : lastResult.error?.includes('Spoof')
                    ? 'SPOOF DETECTED'
                    : lastResult.error?.includes('No face')
                    ? 'NO FACE'
                    : 'NO MATCH'}
                </span>
              </div>

              {lastResult.matched && (
                <>
                  <div className={styles.resultMeta}>
                    <div className={styles.metaItem}>
                      Confidence: <span className={styles.metaValue}>{Math.round(lastResult.confidence * 100)}%</span>
                    </div>
                    <div className={styles.metaItem}>
                      Liveness: <span className={styles.metaValue} style={{ color: 'var(--success)' }}>✓ Real</span>
                    </div>
                    <div className={styles.metaItem}>
                      Total: <span className={styles.metaValue}>{lastResult.timing?.total ?? '—'}ms</span>
                    </div>
                  </div>
                  <div className={styles.confBar}>
                    <div className={`${styles.confFill} ${confClass}`} style={{ width: `${lastResult.confidence * 100}%` }} />
                  </div>
                </>
              )}

              {lastResult.error && <div className={styles.errorMsg}>{lastResult.error}</div>}

              {lastResult.is_real !== undefined && !lastResult.is_real && (
                <div className={styles.spoofWarning}>
                  ⚠️ Liveness check failed — possible photo/replay attack
                </div>
              )}
            </div>
          )}

          {/* ── Enrollment Panel ──────────── */}
          <div className={styles.enrollPanel}>
            <div style={{ fontSize: '0.65rem', color: 'var(--text2)', fontFamily: 'var(--font-mono)', letterSpacing: '1px' }}>
              📸 ENROLL NEW FACE
            </div>
            <input
              className={styles.enrollInput}
              placeholder="Name..."
              value={enrollName}
              onChange={e => setEnrollName(e.target.value)}
              disabled={isBusy}
            />
            {enrolling && (
              <div className={styles.enrollProgress}>
                <div className={styles.enrollProgressFill} style={{ width: `${enrollProgress}%` }} />
              </div>
            )}
            <button
              className={`${styles.btn} ${styles.btnPrimary}`}
              disabled={isBusy || !canEnroll}
              onClick={() => enroll(enrollName)}
            >
              {enrolling ? `Enrolling... ${enrollProgress}%` : '📸 Enroll Face'}
            </button>
          </div>
        </div>
      </div>

      {/* ── Identities List ───────────────── */}
      <div className={styles.identitiesSection}>
        <div className={styles.identitiesHeader}>
          <div className={styles.identitiesTitle}>
            👥 Enrolled ({identities.length})
          </div>
          <div style={{ display: 'flex', gap: 8, alignItems: 'center' }}>
            <div className={styles.thresholdBadge}>
              θ = {threshold.toFixed(4)}
            </div>
            <button
              className={styles.btn}
              style={{ padding: '4px 10px', fontSize: '0.6rem' }}
              onClick={calibrate}
              disabled={isBusy}
            >
              ⚙️ Calibrate
            </button>
          </div>
        </div>
        <div className={styles.identityList}>
          {identities.map(id => (
            <div key={id.name} className={styles.identityRow}>
              <div>
                <span className={styles.identityName}>{id.name}</span>
                <span className={styles.identityMeta}> · {id.vectors ?? id.row_count ?? '?'} vectors</span>
              </div>
              <button
                className={styles.identityDelete}
                onClick={() => deletePerson(id.name)}
                disabled={isBusy}
                title={`Delete ${id.name}`}
              >
                🗑
              </button>
            </div>
          ))}
        </div>
      </div>
    </div>
  )
}
