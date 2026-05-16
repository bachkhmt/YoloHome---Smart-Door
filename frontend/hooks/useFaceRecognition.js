/**
 * useFaceRecognition.js — Face-recognizer pipeline hook
 *
 * Two modes:
 *   useRealApi: false  → Mock pipeline (synthetic data, no server needed)
 *   useRealApi: true   → Live pipeline  (calls face-recognizer FastAPI via proxy)
 *
 * FastAPI endpoints (proxied by Vite /face-recognizer → localhost:8000):
 *   POST /recognize       → RecognizeResponse { matched, name, confidence, is_real, face_bbox, per_stage_ms, total_ms }
 *   POST /enroll          → EnrollResponse   { name, row_id, liveness_score, quality, threshold }
 *   GET  /people          → PeopleResponse   { names, threshold, vector_count }
 *   DELETE /people/{name} → DeleteResponse   { removed }
 *   POST /calibrate       → CalibrateResponse{ threshold, max_cross_id, margin, identities, vectors }
 */

import { useState, useRef, useCallback, useEffect } from 'react'

const API_BASE = '/face-recognizer'

// ── Mock data ────────────────────────────────────────────────────
const MOCK_IDENTITIES = [
  { name: 'Alice Johnson', vectors: 3 },
  { name: 'Bob Williams',  vectors: 2 },
  { name: 'Carol Davis',    vectors: 1 },
]
const MOCK_THRESHOLD = 0.62
const STAGE_TIMING = {
  detect: { cold: 80, warm: 25 }, liveness: { cold: 45, warm: 18 },
  align: { cold: 120, warm: 30 }, embed: { cold: 90, warm: 22 },
  search: { cold: 5, warm: 1 },
}

export function useFaceRecognition({ useRealApi = false, esp32Url = null, distance = null, onMatch = null } = {}) {
  // ── Pipeline state ─────────────────────────────────────────────
  const [pipelineState, setPipelineState] = useState('idle')
  const [stages, setStages] = useState([
    { key: 'detect', label: 'Detect', status: 'idle', timeMs: 0 },
    { key: 'liveness', label: 'Liveness', status: 'idle', timeMs: 0 },
    { key: 'align', label: 'Align', status: 'idle', timeMs: 0 },
    { key: 'embed', label: 'Embed', status: 'idle', timeMs: 0 },
    { key: 'search', label: 'Match', status: 'idle', timeMs: 0 },
  ])
  const [lastResult, setLastResult] = useState(null)

  // ── Enrollment ─────────────────────────────────────────────────
  const [enrolling, setEnrolling] = useState(false)
  const [enrollName, setEnrollName] = useState('')
  const [enrollProgress, setEnrollProgress] = useState(0)

  // ── Identities ─────────────────────────────────────────────────
  const [identities, setIdentities] = useState(MOCK_IDENTITIES)
  const [threshold, setThreshold] = useState(MOCK_THRESHOLD)

  // ── Live detection (mock mode only) ─────────────────────────────
  const [faceDetected, setFaceDetected] = useState(false)
  const [faceBbox, setFaceBbox] = useState(null)

  // ── Webcam (real API mode) ─────────────────────────────────────
  const [cameraActive, setCameraActive] = useState(false)
  const videoRef = useRef(null)
  const streamRef = useRef(null)
  const busyRef = useRef(false)
  const blockUnlockRef = useRef(false)  // blocks onMatch during enrollment
  const mockInterval = useRef(null)

  // ── Proximity auto-trigger ─────────────────────────────────────
  const PROXIMITY_THRESHOLD = 50       // cm — trigger when person is closer than this
  const RETRY_DELAY_MS = 30000         // 30s between retries
  const MAX_RETRIES = 10               // max failures before lockout
  const retryTimerRef = useRef(null)
  const failCountRef = useRef(0)
  const sensorActiveRef = useRef(false)
  const lockedOutRef = useRef(false)
  const [failCount, setFailCount] = useState(0)
  const [lockedOut, setLockedOut] = useState(false)

  // ── ESP32-CAM mode ────────────────────────────────────────────
  const useEsp32 = !!(useRealApi && esp32Url)
  const esp32StreamUrl = esp32Url ? `${esp32Url}:81/stream` : null
  const esp32CaptureUrl = '/esp32/capture'   // proxied through Vite
  const cameraResolutionRef = useRef({ width: 640, height: 480 })

  // ═══════════════════════════════════════════════════════════════
  //  FETCH PEOPLE (real API) — load identities on mount
  // ═══════════════════════════════════════════════════════════════
  const fetchPeople = useCallback(async () => {
    if (!useRealApi) return
    try {
      const res = await fetch(`${API_BASE}/people`)
      if (!res.ok) throw new Error(`/people → ${res.status}`)
      const data = await res.json()
      setIdentities(data.names.map(n => ({ name: n, vectors: '?' })))
      setThreshold(data.threshold)
    } catch (e) {
      console.warn('fetchPeople failed:', e.message)
    }
  }, [useRealApi])

  useEffect(() => { fetchPeople() }, [fetchPeople])

  // ═══════════════════════════════════════════════════════════════
  //  WEBCAM (real API mode)
  // ═══════════════════════════════════════════════════════════════
  const startCamera = useCallback(async () => {
    if (!useRealApi) return
    try {
      if (useEsp32) {
        // ESP32-CAM: no getUserMedia needed — MJPEG stream renders via <img>
        setCameraActive(true)
        return
      }
      const stream = await navigator.mediaDevices.getUserMedia({
        video: { width: { ideal: 640 }, height: { ideal: 480 }, facingMode: 'user' },
      })
      streamRef.current = stream
      setCameraActive(true)   // triggers video element render, then useEffect attaches stream
    } catch (e) {
      console.warn('Camera access denied:', e.message)
    }
  }, [useRealApi, useEsp32])

  // Attach stream to video element AFTER React renders it (webcam only — not ESP32)
  useEffect(() => {
    if (cameraActive && streamRef.current && videoRef.current && !useEsp32) {
      videoRef.current.srcObject = streamRef.current
      videoRef.current.play().catch(() => {})
      // Detect webcam resolution once video is playing
      const checkRes = () => {
        if (videoRef.current?.videoWidth) {
          cameraResolutionRef.current = {
            width: videoRef.current.videoWidth,
            height: videoRef.current.videoHeight,
          }
        } else {
          requestAnimationFrame(checkRes)
        }
      }
      requestAnimationFrame(checkRes)
    }
  }, [cameraActive])

  const stopCamera = useCallback(() => {
    if (!useEsp32) {
      streamRef.current?.getTracks().forEach(t => t.stop())
      streamRef.current = null
    }
    if (videoRef.current) videoRef.current.srcObject = null
    setCameraActive(false)
  }, [useEsp32])

  // ── Stop camera on unmount ────────────────────────────────────
  useEffect(() => {
    return () => stopCamera()
  }, [stopCamera])

  // ═══════════════════════════════════════════════════════════════
  //  PROXIMITY — MQTT-driven auto-trigger from yolohome.distance feed
  // ═══════════════════════════════════════════════════════════════
  useEffect(() => {
    if (!useRealApi || !cameraActive || distance === null) return

    const inRange = distance < PROXIMITY_THRESHOLD

    // Person entered range → trigger immediately
    if (inRange && !sensorActiveRef.current) {
      sensorActiveRef.current = true
      lockedOutRef.current = false
      failCountRef.current = 0
      setFailCount(0)
      setLockedOut(false)
      console.log(`[PROXIMITY] ${distance}cm — in range, triggering recognition`)
      recognize()
    }

    // Person left range → reset everything
    if (!inRange && sensorActiveRef.current) {
      sensorActiveRef.current = false
      lockedOutRef.current = false
      failCountRef.current = 0
      setFailCount(0)
      setLockedOut(false)
      clearTimeout(retryTimerRef.current)
      console.log('[PROXIMITY] Out of range — reset')
    }
  }, [distance, useRealApi, cameraActive, recognize])

  // Cleanup retry timer on unmount
  useEffect(() => {
    return () => clearTimeout(retryTimerRef.current)
  }, [])

  // ═══════════════════════════════════════════════════════════════
  //  FRAME CAPTURE helper — video/webcam → JPEG Blob
  //  ESP32 mode: fetches a single JPEG from the ESP32-CAM /capture endpoint
  // ═══════════════════════════════════════════════════════════════
  const captureFrame = useCallback(async () => {
    // ESP32-CAM: fetch single JPEG from /capture endpoint (proxied via Vite)
    if (useEsp32) {
      try {
        const res = await fetch(esp32CaptureUrl)
        if (!res.ok) throw new Error(`ESP32 capture failed: ${res.status}`)
        const blob = await res.blob()

        // Detect actual camera resolution from the JPEG
        try {
          const img = await createImageBitmap(blob)
          if (img.width !== cameraResolutionRef.current.width ||
              img.height !== cameraResolutionRef.current.height) {
            cameraResolutionRef.current = { width: img.width, height: img.height }
            console.log(`[ESP32] Resolution detected: ${img.width}x${img.height}`)
          }
          img.close()
        } catch (_) { /* createImageBitmap not available — keep default */ }

        return blob
      } catch (e) {
        console.warn('ESP32 capture error:', e.message)
        return null
      }
    }

    // Webcam: draw <video> → canvas → JPEG Blob
    const video = videoRef.current
    if (!video || video.readyState < 2) return null

    const canvas = document.createElement('canvas')
    canvas.width = video.videoWidth
    canvas.height = video.videoHeight
    canvas.getContext('2d').drawImage(video, 0, 0)

    return new Promise((resolve) => {
      canvas.toBlob(blob => resolve(blob), 'image/jpeg', 0.92)
    })
  }, [useEsp32, esp32CaptureUrl])

  // ═══════════════════════════════════════════════════════════════
  //  MOCK HELPERS
  // ═══════════════════════════════════════════════════════════════
  const resetStages = useCallback(() => {
    setStages(prev => prev.map(s => ({ ...s, status: 'idle', timeMs: 0 })))
  }, [])

  const simulateStage = useCallback(async (stageKey, warm = true) => {
    const timing = STAGE_TIMING[stageKey]
    const ms = Math.round(warm ? timing.warm + Math.random() * 15 : timing.cold)
    setStages(prev => prev.map(s => s.key === stageKey ? { ...s, status: 'running' } : s))
    await new Promise(r => setTimeout(r, ms))
    setStages(prev => prev.map(s => s.key === stageKey ? { ...s, status: 'done', timeMs: ms } : s))
    return ms
  }, [])

  // Mock face detection pulsing
  useEffect(() => {
    if (useRealApi) return
    mockInterval.current = setInterval(() => {
      if (busyRef.current) return
      const detected = Math.random() > 0.15
      setFaceDetected(detected)
      if (detected) {
        setFaceBbox({ x: 0.22 + Math.random() * 0.12, y: 0.15 + Math.random() * 0.08, w: 0.30 + Math.random() * 0.06, h: 0.42 + Math.random() * 0.08 })
      } else {
        setFaceBbox(null)
      }
    }, 800)
    return () => clearInterval(mockInterval.current)
  }, [useRealApi])

  // ═══════════════════════════════════════════════════════════════
  //  RECOGNIZE
  // ═══════════════════════════════════════════════════════════════
  const recognize = useCallback(async () => {
    if (busyRef.current) return null
    busyRef.current = true
    setPipelineState('scanning')
    resetStages()

    try {
      // ── REAL API ──────────────────────────────────────────────
      if (useRealApi) {
        const blob = await captureFrame()
        if (!blob) {
          const r = { matched: false, name: null, confidence: 0, is_real: null, face_bbox: null, error: 'No webcam frame captured', timing: {} }
          setLastResult(r); setPipelineState('error'); busyRef.current = false; return r
        }

        const form = new FormData()
        form.append('file', blob, 'frame.jpg')
        form.append('skip_liveness', 'true')

        const t0 = performance.now()
        const res = await fetch(`${API_BASE}/recognize`, { method: 'POST', body: form })
        const totalMs = Math.round(performance.now() - t0)

        if (!res.ok) {
          const err = await res.json().catch(() => ({ detail: `HTTP ${res.status}` }))
          // 403 = spoof detected
          if (res.status === 403) {
            setStages(prev => prev.map(s => s.key === 'liveness' ? { ...s, status: 'failed' } : s))
          }
          const r = { matched: false, name: null, confidence: 0, is_real: res.status === 403 ? false : null, face_bbox: null, error: err.detail || `HTTP ${res.status}`, timing: { total: totalMs } }
          setLastResult(r)
          setPipelineState(res.status === 403 ? 'denied' : 'error')
          busyRef.current = false
          return r
        }

        const data = await res.json()  // RecognizeResponse
        // Map API response to our stages
        if (data.per_stage_ms) {
          setStages(prev => prev.map(s => ({
            ...s,
            status: s.key === 'liveness' && data.is_real === false ? 'failed' : 'done',
            timeMs: Math.round(data.per_stage_ms[s.key] || 0),
          })))
        } else {
          setStages(prev => prev.map(s => ({ ...s, status: 'done', timeMs: 0 })))
        }

        // Normalize face_bbox [x1,y1,x2,y2] px → {x,y,w,h} 0-1 for overlay
        // Mirror x-axis to match the video's scaleX(-1) selfie flip
        let normBbox = null
        if (data.face_bbox) {
          const { width: vw, height: vh } = cameraResolutionRef.current
          const [x1, y1, x2, y2] = data.face_bbox
          const x = 1 - (x2 / vw)   // mirror: right edge becomes left
          const w = (x2 - x1) / vw
          normBbox = { x, y: y1 / vh, w, h: (y2 - y1) / vh }
        }

        const result = {
          matched: data.matched,
          name: data.name,
          confidence: data.confidence,
          is_real: data.is_real,
          face_bbox: normBbox,
          error: data.matched ? null : `No match — threshold ${threshold.toFixed(2)}`,
          timing: data.per_stage_ms ? { ...data.per_stage_ms, total: data.total_ms } : { total: totalMs },
        }
        setLastResult(result)
        setPipelineState(data.matched ? 'matched' : 'denied')

        // Trigger door unlock on match (unless blocked — e.g., during enrollment)
        if (data.matched && onMatch && !blockUnlockRef.current) {
          onMatch(result)
        }

        // Proximity retry logic
        if (data.matched) {
          // Success — reset failure counter
          failCountRef.current = 0
          lockedOutRef.current = false
          setFailCount(0)
          setLockedOut(false)
          clearTimeout(retryTimerRef.current)
        } else if (sensorActiveRef.current && !lockedOutRef.current) {
          // Failure — increment and schedule retry
          failCountRef.current += 1
          setFailCount(failCountRef.current)
          console.log(`[RETRY] Failure #${failCountRef.current}/${MAX_RETRIES}`)

          if (failCountRef.current >= MAX_RETRIES) {
            lockedOutRef.current = true
            setLockedOut(true)
            console.log('[RETRY] Locked out — step away from sensor to reset')
          } else {
            retryTimerRef.current = setTimeout(() => {
              if (sensorActiveRef.current && !lockedOutRef.current && !busyRef.current) {
                console.log('[RETRY] 30s — retrying...')
                recognize()
              }
            }, RETRY_DELAY_MS)
          }
        }

        busyRef.current = false
        return result
      }

      // ── MOCK ──────────────────────────────────────────────────
      const timings = {}
      let totalMs = 0

      let t = await simulateStage('detect'); timings.detect = t; totalMs += t
      t = await simulateStage('liveness'); timings.liveness = t; totalMs += t

      const isReal = Math.random() > 0.1
      if (!isReal) {
        setStages(prev => prev.map(s => s.key === 'liveness' ? { ...s, status: 'failed' } : s))
        const r = { matched: false, name: null, confidence: 0, is_real: false, face_bbox: faceBbox, error: 'Spoof detected — liveness check failed', timing: { ...timings, total: totalMs } }
        setLastResult(r); setPipelineState('denied'); busyRef.current = false; return r
      }

      t = await simulateStage('align'); timings.align = t; totalMs += t
      t = await simulateStage('embed'); timings.embed = t; totalMs += t
      t = await simulateStage('search'); timings.search = t; totalMs += t

      const matched = Math.random() > 0.25
      const matchPerson = matched ? identities[Math.floor(Math.random() * identities.length)] : null
      const confidence = matched ? 0.72 + Math.random() * 0.26 : 0.18 + Math.random() * 0.35

      const r = {
        matched, name: matchPerson?.name ?? null, confidence: Math.round(confidence * 100) / 100,
        is_real: true, face_bbox: faceBbox,
        error: matched ? null : `No match — best distance ${(1 - confidence).toFixed(2)} above threshold ${threshold}`,
        timing: { ...timings, total: totalMs },
      }
      setLastResult(r)
      setPipelineState(matched ? 'matched' : 'denied')
      busyRef.current = false
      return r

    } catch (e) {
      setPipelineState('error')
      setLastResult({ matched: false, name: null, confidence: 0, is_real: null, face_bbox: null, error: e.message, timing: {} })
      busyRef.current = false
      return null
    }
  }, [useRealApi, captureFrame, threshold, faceBbox, identities, resetStages, simulateStage])

  // ═══════════════════════════════════════════════════════════════
  //  ENROLL
  // ═══════════════════════════════════════════════════════════════
  const enroll = useCallback(async (name) => {
    if (busyRef.current || !name?.trim()) return { ok: false, reason: 'No name' }
    busyRef.current = true
    blockUnlockRef.current = true  // prevent recognize from unlocking during enrollment
    setEnrolling(true)
    setPipelineState('enrolling')
    resetStages()
    setEnrollProgress(0)

    try {
      // ── REAL API ──────────────────────────────────────────────
      if (useRealApi) {
        const blob = await captureFrame()
        if (!blob) {
          setPipelineState('error'); setEnrolling(false); busyRef.current = false; blockUnlockRef.current = false
          return { ok: false, reason: 'No webcam frame captured' }
        }
        setEnrollProgress(30)

        const form = new FormData()
        form.append('file', blob, 'frame.jpg')
        form.append('name', name.trim())
        form.append('skip_liveness', 'true')

        const res = await fetch(`${API_BASE}/enroll`, { method: 'POST', body: form })
        setEnrollProgress(90)

        if (!res.ok) {
          const err = await res.json().catch(() => ({ detail: `HTTP ${res.status}` }))
          if (res.status === 403) {
            setStages(prev => prev.map(s => s.key === 'liveness' ? { ...s, status: 'failed' } : s))
            setPipelineState('denied')
          } else if (res.status === 400) {
            setStages(prev => prev.map(s => s.key === 'detect' ? { ...s, status: 'failed' } : s))
            setPipelineState('error')
          } else {
            setPipelineState('error')
          }
          setEnrolling(false); busyRef.current = false; blockUnlockRef.current = false
          return { ok: false, reason: err.detail || `HTTP ${res.status}` }
        }

        setEnrollProgress(100)
        const data = await res.json()  // EnrollResponse
        setThreshold(data.threshold)
        await fetchPeople()  // refresh list
        setPipelineState('matched')
        setEnrolling(false)
        busyRef.current = false
        blockUnlockRef.current = false
        return { ok: true, name: name.trim(), row_id: data.row_id, liveness_score: data.liveness_score }
      }

      // ── MOCK ──────────────────────────────────────────────────
      await simulateStage('detect'); setEnrollProgress(25)
      const isReal = Math.random() > 0.05
      await simulateStage('liveness'); setEnrollProgress(50)

      if (!isReal) {
        setStages(prev => prev.map(s => s.key === 'liveness' ? { ...s, status: 'failed' } : s))
        setPipelineState('denied'); setEnrolling(false); busyRef.current = false; blockUnlockRef.current = false
        return { ok: false, reason: 'Spoof detected — cannot enroll from a photo/replay' }
      }

      await simulateStage('align'); setEnrollProgress(70)
      await simulateStage('embed'); setEnrollProgress(90)
      await simulateStage('search'); setEnrollProgress(100)

      setIdentities(prev => [...prev, { name: name.trim(), vectors: 1 }])
      setPipelineState('matched'); setEnrolling(false); busyRef.current = false; blockUnlockRef.current = false
      return { ok: true, name: name.trim(), row_id: identities.length + 1, liveness_score: 0.85 + Math.random() * 0.14 }

    } catch (e) {
      setPipelineState('error'); setEnrolling(false); busyRef.current = false; blockUnlockRef.current = false
      return { ok: false, reason: e.message }
    }
  }, [useRealApi, captureFrame, fetchPeople, identities, resetStages, simulateStage])

  // ═══════════════════════════════════════════════════════════════
  //  DELETE PERSON
  // ═══════════════════════════════════════════════════════════════
  const deletePerson = useCallback(async (name) => {
    if (useRealApi) {
      try {
        await fetch(`${API_BASE}/people/${encodeURIComponent(name)}`, { method: 'DELETE' })
        await fetchPeople()
        // Recalibrate after delete
        fetch(`${API_BASE}/calibrate`, { method: 'POST', body: new URLSearchParams({ margin: '0.05' }) })
          .then(r => r.json()).then(d => setThreshold(d.threshold)).catch(() => {})
      } catch (e) {
        console.warn('deletePerson failed:', e.message)
      }
    } else {
      setIdentities(prev => prev.filter(p => p.name !== name))
    }
  }, [useRealApi, fetchPeople])

  // ═══════════════════════════════════════════════════════════════
  //  CALIBRATE
  // ═══════════════════════════════════════════════════════════════
  const calibrate = useCallback(async () => {
    if (useRealApi) {
      try {
        const form = new URLSearchParams({ margin: '0.05' })
        const res = await fetch(`${API_BASE}/calibrate`, { method: 'POST', body: form })
        const data = await res.json()
        setThreshold(data.threshold)
        return data
      } catch (e) {
        console.warn('calibrate failed:', e.message)
      }
    } else {
      const t = 0.55 + Math.random() * 0.18
      await new Promise(r => setTimeout(r, 400))
      setThreshold(Math.round(t * 100) / 100)
      return { threshold: t, max_cross_id: t - 0.05 }
    }
  }, [useRealApi])

  // ═══════════════════════════════════════════════════════════════
  //  RESET
  // ═══════════════════════════════════════════════════════════════
  const reset = useCallback(() => {
    busyRef.current = false
    blockUnlockRef.current = false
    clearTimeout(retryTimerRef.current)
    setFailCount(0)
    setLockedOut(false)
    setPipelineState('idle')
    setLastResult(null)
    resetStages()
    setEnrolling(false)
    setEnrollProgress(0)
    setEnrollName('')
  }, [resetStages])

  return {
    pipelineState, stages, lastResult,
    faceDetected, faceBbox,
    enrolling, enrollProgress, enrollName,
    identities, threshold,
    cameraActive, videoRef,
    useEsp32, esp32StreamUrl,
    failCount, lockedOut, MAX_RETRIES,
    setEnrollName,
    recognize, enroll, deletePerson, calibrate, reset,
    startCamera, stopCamera, fetchPeople,
  }
}
