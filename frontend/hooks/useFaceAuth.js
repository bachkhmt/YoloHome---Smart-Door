/**
 * useFaceAuth.js — v3
 *
 * Two-stage architecture:
 *  Stage 1 — MediaPipe FaceDetection  : detect & crop face (robust, realtime)
 *  Stage 2 — face-api.js FaceRecognition: compute 128D descriptor for identity matching
 *
 * Why two libraries?
 *  - TinyFaceDetector (face-api) fails often in low light / angled poses
 *  - MediaPipe BlazeFace detects much better (used in Google Meet)
 *  - But MediaPipe has no recognition → use face-api.js for that part only
 */
import { useState, useRef, useCallback, useEffect } from 'react'
import * as faceapi from 'face-api.js'

const MODEL_URL       = '/models'
const MATCH_THRESHOLD = 0.5   // 0 = identical, 1 = completely different. 0.5 is a good balance

// ── Load MediaPipe via CDN (no npm install needed) ─────────────
let mediapipeDetector = null

async function loadMediaPipe() {
  if (mediapipeDetector) return mediapipeDetector
  // Load @mediapipe/tasks-vision via CDN
  const { FaceDetector, FilesetResolver } = await import(
    'https://cdn.jsdelivr.net/npm/@mediapipe/tasks-vision@0.10.3/+esm'
  )
  const vision = await FilesetResolver.forVisionTasks(
    'https://cdn.jsdelivr.net/npm/@mediapipe/tasks-vision@0.10.3/wasm'
  )
  mediapipeDetector = await FaceDetector.createFromOptions(vision, {
    baseOptions: {
      modelAssetPath:
        'https://storage.googleapis.com/mediapipe-models/face_detector/blaze_face_short_range/float16/1/blaze_face_short_range.tflite',
      delegate: 'GPU',
    },
    runningMode:      'IMAGE',
    minDetectionConfidence: 0.5,
  })
  return mediapipeDetector
}

export function useFaceAuth() {
  const [modelsLoaded,  setModelsLoaded]  = useState(false)
  const [cameraActive,  setCameraActive]  = useState(false)
  const [loadingModels, setLoadingModels] = useState(false)
  const [error,         setError]         = useState(null)
  const [enrolledUsers, setEnrolledUsers] = useState([])
  const [debugInfo,     setDebugInfo]     = useState('')

  const videoRef        = useRef(null)
  const canvasRef       = useRef(null)
  const streamRef       = useRef(null)
  const descriptorsRef  = useRef([])
  const modelsLoadedRef = useRef(false)
  const animFrameRef    = useRef(null)

  // Load both models
  const loadModels = useCallback(async () => {
    if (modelsLoadedRef.current || loadingModels) return
    setLoadingModels(true)
    setError(null)
    try {
      // Parallel: face-api recognition model + MediaPipe detector
      await Promise.all([
        // face-api: only need landmark + recognition (no tinyFaceDetector)
        faceapi.nets.faceLandmark68Net.loadFromUri(MODEL_URL),
        faceapi.nets.faceRecognitionNet.loadFromUri(MODEL_URL),
        // MediaPipe: auto-downloads via CDN
        loadMediaPipe(),
      ])
      modelsLoadedRef.current = true
      setModelsLoaded(true)
    } catch (e) {
      const isModelFile = e.message?.includes('404') || e.message?.includes('fetch')
      setError(isModelFile
        ? 'Missing model files — need 4 files in /public/models/ (see README.txt)'
        : 'Model load error: ' + e.message
      )
    } finally {
      setLoadingModels(false)
    }
  }, [loadingModels])

  // ── START CAMERA ───────────────────────────────────────────────
  const startCamera = useCallback(async () => {
    setError(null)
    try {
      const stream = await navigator.mediaDevices.getUserMedia({
        video: { width: { ideal: 640 }, height: { ideal: 480 }, facingMode: 'user' },
      })
      streamRef.current = stream
      const video = videoRef.current
      if (video) {
        video.srcObject = stream
        await new Promise((res, rej) => {
          video.onloadeddata = res
          video.onerror = rej
          video.play().catch(rej)
        })
      }
      setCameraActive(true)
      startLiveDraw()
    } catch (e) {
      const msg =
        e.name === 'NotAllowedError' ? 'Camera permission denied in browser' :
        e.name === 'NotFoundError'   ? 'No camera found' :
        'Camera error: ' + e.message
      setError(msg)
    }
  }, [])

  // ── STOP CAMERA ────────────────────────────────────────────────
  const stopCamera = useCallback(() => {
    if (animFrameRef.current) cancelAnimationFrame(animFrameRef.current)
    streamRef.current?.getTracks().forEach(t => t.stop())
    streamRef.current = null
    if (videoRef.current) videoRef.current.srcObject = null
    setCameraActive(false)
    setDebugInfo('')
  }, [])

  // Live-draw bounding box on canvas
  function startLiveDraw() {
    const draw = async () => {
      const video  = videoRef.current
      const canvas = canvasRef.current
      if (!video || !canvas || !modelsLoadedRef.current) {
        animFrameRef.current = requestAnimationFrame(draw)
        return
      }
      const ctx = canvas.getContext('2d')
      canvas.width  = video.videoWidth  || 320
      canvas.height = video.videoHeight || 240
      ctx.clearRect(0, 0, canvas.width, canvas.height)

      try {
        const detector = await loadMediaPipe()
        const result   = detector.detect(video)

        if (result.detections.length > 0) {
          const det  = result.detections[0]
          const bbox = det.boundingBox
          const conf = Math.round(det.categories[0]?.score * 100) || 0

          // Green bounding box
          ctx.strokeStyle = '#10b981'
          ctx.lineWidth   = 2
          ctx.strokeRect(bbox.originX, bbox.originY, bbox.width, bbox.height)

          // Confidence label
          ctx.fillStyle = '#10b981'
          ctx.font      = '13px monospace'
          ctx.fillText(`${conf}%`, bbox.originX + 4, bbox.originY - 6)

          setDebugInfo(`Face detected — ${conf}% confidence`)
        } else {
          setDebugInfo('No face detected')
        }
      } catch (_) {}

      animFrameRef.current = requestAnimationFrame(draw)
    }
    animFrameRef.current = requestAnimationFrame(draw)
  }

  // Crop face with MediaPipe → canvas
  async function cropFaceCanvas() {
    const video    = videoRef.current
    const detector = await loadMediaPipe()
    const result   = detector.detect(video)

    if (!result.detections.length) return null

    const bbox    = result.detections[0].boundingBox
    const padding = 40  // add padding for better face-api recognition

    const x = Math.max(0, bbox.originX - padding)
    const y = Math.max(0, bbox.originY - padding)
    const w = Math.min(video.videoWidth  - x, bbox.width  + padding * 2)
    const h = Math.min(video.videoHeight - y, bbox.height + padding * 2)

    // Draw crop region to temp canvas
    const tmp    = document.createElement('canvas')
    tmp.width    = w
    tmp.height   = h
    tmp.getContext('2d').drawImage(video, x, y, w, h, 0, 0, w, h)
    return tmp
  }

  // ── ENROLL ─────────────────────────────────────────────────────
  const enrollFace = useCallback(async (userId, name, seed) => {
    if (!modelsLoadedRef.current) {
      return { ok: false, reason: 'Models not loaded — wait for "✅ Ready"' }
    }
    if (!streamRef.current) {
      return { ok: false, reason: 'Camera not active' }
    }

    try {
      setDebugInfo('Detecting face...')

      // Step 1: MediaPipe detect & crop
      const faceCanvas = await cropFaceCanvas()
      if (!faceCanvas) {
        return {
          ok: false,
          reason: 'No face detected\n→ Look straight at camera, good lighting, 30–60cm',
        }
      }

      setDebugInfo('Computing face descriptor...')

      // Step 2: face-api computes 128D descriptor from crop region
      const detection = await faceapi
        .detectSingleFace(faceCanvas, new faceapi.TinyFaceDetectorOptions({ inputSize: 224, scoreThreshold: 0.2 }))
        .withFaceLandmarks()
        .withFaceDescriptor()

      // Fallback: if TinyFaceDetector fails on crop, try SsdMobilenetv1
      let descriptor = detection?.descriptor

      if (!descriptor) {
        // Try detecting directly on video (no crop)
        const det2 = await faceapi
          .detectSingleFace(videoRef.current, new faceapi.TinyFaceDetectorOptions({ inputSize: 416, scoreThreshold: 0.2 }))
          .withFaceLandmarks()
          .withFaceDescriptor()
        descriptor = det2?.descriptor
      }

      if (!descriptor) {
        return {
          ok: false,
          reason: 'Face detected but descriptor computation failed\n→ Ensure 4 model files in /public/models/',
        }
      }

      // Save to ref
      descriptorsRef.current = descriptorsRef.current.filter(d => d.userId !== userId)
      descriptorsRef.current.push({ userId, name, seed, descriptor })
      setEnrolledUsers(descriptorsRef.current.map(d => ({ userId: d.userId, name: d.name })))
      setDebugInfo(`✅ Enrolled: ${name}`)

      return { ok: true, reason: null }
    } catch (e) {
      return { ok: false, reason: 'Error: ' + e.message }
    }
  }, [])

  // ── RECOGNIZE ──────────────────────────────────────────────────
  const recognizeFace = useCallback(async () => {
    if (!modelsLoadedRef.current)         return { ok: false, user: null, reason: 'Models not loaded' }
    if (!streamRef.current)               return { ok: false, user: null, reason: 'Camera not active' }
    if (!descriptorsRef.current.length)   return { ok: false, user: null, reason: 'No enrolled faces — enroll first' }

    try {
      setDebugInfo('Recognizing...')

      const faceCanvas = await cropFaceCanvas()
      if (!faceCanvas) return { ok: false, user: null, reason: 'No face detected' }

      const detection = await faceapi
        .detectSingleFace(faceCanvas, new faceapi.TinyFaceDetectorOptions({ inputSize: 224, scoreThreshold: 0.2 }))
        .withFaceLandmarks()
        .withFaceDescriptor()

      let descriptor = detection?.descriptor
      if (!descriptor) {
        const det2 = await faceapi
          .detectSingleFace(videoRef.current, new faceapi.TinyFaceDetectorOptions({ inputSize: 416, scoreThreshold: 0.2 }))
          .withFaceLandmarks()
          .withFaceDescriptor()
        descriptor = det2?.descriptor
      }

      if (!descriptor) return { ok: false, user: null, reason: 'Descriptor computation failed' }

      const labeled = descriptorsRef.current.map(d =>
        new faceapi.LabeledFaceDescriptors(String(d.userId), [d.descriptor])
      )
      const matcher = new faceapi.FaceMatcher(labeled, MATCH_THRESHOLD)
      const match   = matcher.findBestMatch(descriptor)

      if (match.label === 'unknown') {
        setDebugInfo('❌ No match')
        return { ok: false, user: null, reason: `Face does not match (distance: ${match.distance.toFixed(2)})` }
      }

      const userInfo = descriptorsRef.current.find(d => d.userId === parseInt(match.label))
      const confidence = Math.round((1 - match.distance) * 100)
      setDebugInfo(`✅ Matched: ${userInfo?.name} (${confidence}%)`)
      return { ok: true, user: userInfo, confidence, distance: match.distance }
    } catch (e) {
      return { ok: false, user: null, reason: 'Recognition error: ' + e.message }
    }
  }, [])

  useEffect(() => {
    loadModels()
    return () => stopCamera()
  }, []) // eslint-disable-line

  return {
    modelsLoaded, loadingModels, cameraActive, error,
    enrolledUsers, debugInfo,
    videoRef, canvasRef,
    loadModels, startCamera, stopCamera,
    enrollFace, recognizeFace,
  }
}
