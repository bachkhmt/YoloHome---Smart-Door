/**
 * useFaceAuth.js — v3
 *
 * Kiến trúc 2 tầng:
 *  Tầng 1 — MediaPipe FaceDetection  : detect & crop khuôn mặt (mạnh, realtime)
 *  Tầng 2 — face-api.js FaceRecognition: tính 128D descriptor để so sánh danh tính
 *
 * Tại sao dùng 2 thư viện?
 *  - TinyFaceDetector (face-api) fail nhiều khi ánh sáng yếu / góc nghiêng
 *  - MediaPipe BlazeFace detect tốt hơn nhiều (dùng trong Google Meet)
 *  - Nhưng MediaPipe không có recognition → dùng face-api chỉ cho phần đó
 */
import { useState, useRef, useCallback, useEffect } from 'react'
import * as faceapi from 'face-api.js'

const MODEL_URL       = '/models'
const MATCH_THRESHOLD = 0.5   // 0 = giống hệt, 1 = hoàn toàn khác. 0.5 là cân bằng tốt

// ── Load MediaPipe qua CDN (không cần npm install) ──────────────
let mediapipeDetector = null

async function loadMediaPipe() {
  if (mediapipeDetector) return mediapipeDetector
  // Dùng @mediapipe/tasks-vision qua CDN
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
  const [debugInfo,     setDebugInfo]     = useState('')  // hiển thị debug realtime

  const videoRef        = useRef(null)
  const canvasRef       = useRef(null)   // canvas để vẽ bounding box
  const streamRef       = useRef(null)
  const descriptorsRef  = useRef([])
  const modelsLoadedRef = useRef(false)
  const animFrameRef    = useRef(null)   // requestAnimationFrame ID

  // ── LOAD CẢ 2 MODEL ────────────────────────────────────────────
  const loadModels = useCallback(async () => {
    if (modelsLoadedRef.current || loadingModels) return
    setLoadingModels(true)
    setError(null)
    try {
      // Song song: face-api recognition model + MediaPipe detector
      await Promise.all([
        // face-api: chỉ cần landmark + recognition (KHÔNG cần tinyFaceDetector nữa)
        faceapi.nets.faceLandmark68Net.loadFromUri(MODEL_URL),
        faceapi.nets.faceRecognitionNet.loadFromUri(MODEL_URL),
        // MediaPipe: tự tải qua CDN
        loadMediaPipe(),
      ])
      modelsLoadedRef.current = true
      setModelsLoaded(true)
    } catch (e) {
      const isModelFile = e.message?.includes('404') || e.message?.includes('fetch')
      setError(isModelFile
        ? 'Thiếu file models — cần 4 file trong /public/models/ (xem README.txt)'
        : 'Lỗi load models: ' + e.message
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
      startLiveDraw()        // bắt đầu vẽ bounding box realtime
    } catch (e) {
      const msg =
        e.name === 'NotAllowedError' ? 'Cần cho phép quyền camera trong trình duyệt' :
        e.name === 'NotFoundError'   ? 'Không tìm thấy camera' :
        'Lỗi camera: ' + e.message
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

  // ── LIVE DRAW — vẽ bounding box lên canvas realtime ───────────
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

          // Vẽ box màu xanh
          ctx.strokeStyle = '#10b981'
          ctx.lineWidth   = 2
          ctx.strokeRect(bbox.originX, bbox.originY, bbox.width, bbox.height)

          // Label confidence
          ctx.fillStyle = '#10b981'
          ctx.font      = '13px monospace'
          ctx.fillText(`${conf}%`, bbox.originX + 4, bbox.originY - 6)

          setDebugInfo(`Phát hiện khuôn mặt — ${conf}% tin cậy`)
        } else {
          setDebugInfo('Chưa phát hiện khuôn mặt')
        }
      } catch (_) {}

      animFrameRef.current = requestAnimationFrame(draw)
    }
    animFrameRef.current = requestAnimationFrame(draw)
  }

  // ── CROP khuôn mặt bằng MediaPipe → canvas ────────────────────
  async function cropFaceCanvas() {
    const video    = videoRef.current
    const detector = await loadMediaPipe()
    const result   = detector.detect(video)

    if (!result.detections.length) return null

    const bbox    = result.detections[0].boundingBox
    const padding = 40  // thêm vùng xung quanh để face-api nhận diện tốt hơn

    const x = Math.max(0, bbox.originX - padding)
    const y = Math.max(0, bbox.originY - padding)
    const w = Math.min(video.videoWidth  - x, bbox.width  + padding * 2)
    const h = Math.min(video.videoHeight - y, bbox.height + padding * 2)

    // Vẽ vùng crop vào canvas tạm
    const tmp    = document.createElement('canvas')
    tmp.width    = w
    tmp.height   = h
    tmp.getContext('2d').drawImage(video, x, y, w, h, 0, 0, w, h)
    return tmp
  }

  // ── ENROLL ─────────────────────────────────────────────────────
  const enrollFace = useCallback(async (userId, name, seed) => {
    if (!modelsLoadedRef.current) {
      return { ok: false, reason: 'Models chưa load — chờ "✅ Sẵn sàng"' }
    }
    if (!streamRef.current) {
      return { ok: false, reason: 'Camera chưa bật' }
    }

    try {
      setDebugInfo('Đang detect khuôn mặt...')

      // Bước 1: MediaPipe detect & crop
      const faceCanvas = await cropFaceCanvas()
      if (!faceCanvas) {
        return {
          ok: false,
          reason: 'Không phát hiện khuôn mặt\n→ Nhìn thẳng vào camera, đủ ánh sáng, 30–60cm',
        }
      }

      setDebugInfo('Đang tính face descriptor...')

      // Bước 2: face-api tính 128D descriptor từ vùng crop
      const detection = await faceapi
        .detectSingleFace(faceCanvas, new faceapi.TinyFaceDetectorOptions({ inputSize: 224, scoreThreshold: 0.2 }))
        .withFaceLandmarks()
        .withFaceDescriptor()

      // Fallback: nếu TinyFaceDetector fail trên crop, thử SsdMobilenetv1
      let descriptor = detection?.descriptor

      if (!descriptor) {
        // Thử detect thẳng trên video (không crop)
        const det2 = await faceapi
          .detectSingleFace(videoRef.current, new faceapi.TinyFaceDetectorOptions({ inputSize: 416, scoreThreshold: 0.2 }))
          .withFaceLandmarks()
          .withFaceDescriptor()
        descriptor = det2?.descriptor
      }

      if (!descriptor) {
        return {
          ok: false,
          reason: 'Phát hiện khuôn mặt OK nhưng không tính được descriptor\n→ Đảm bảo đủ 4 file models trong /public/models/',
        }
      }

      // Lưu vào ref
      descriptorsRef.current = descriptorsRef.current.filter(d => d.userId !== userId)
      descriptorsRef.current.push({ userId, name, seed, descriptor })
      setEnrolledUsers(descriptorsRef.current.map(d => ({ userId: d.userId, name: d.name })))
      setDebugInfo(`✅ Đã đăng ký: ${name}`)

      return { ok: true, reason: null }
    } catch (e) {
      return { ok: false, reason: 'Lỗi: ' + e.message }
    }
  }, [])

  // ── RECOGNIZE ──────────────────────────────────────────────────
  const recognizeFace = useCallback(async () => {
    if (!modelsLoadedRef.current)         return { ok: false, user: null, reason: 'Models chưa load' }
    if (!streamRef.current)               return { ok: false, user: null, reason: 'Camera chưa bật' }
    if (!descriptorsRef.current.length)   return { ok: false, user: null, reason: 'Chưa đăng ký khuôn mặt nào — nhấn 📸 Đăng ký trước' }

    try {
      setDebugInfo('Đang nhận diện...')

      const faceCanvas = await cropFaceCanvas()
      if (!faceCanvas) return { ok: false, user: null, reason: 'Không phát hiện khuôn mặt' }

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

      if (!descriptor) return { ok: false, user: null, reason: 'Không tính được descriptor' }

      const labeled = descriptorsRef.current.map(d =>
        new faceapi.LabeledFaceDescriptors(String(d.userId), [d.descriptor])
      )
      const matcher = new faceapi.FaceMatcher(labeled, MATCH_THRESHOLD)
      const match   = matcher.findBestMatch(descriptor)

      if (match.label === 'unknown') {
        setDebugInfo('❌ Không khớp')
        return { ok: false, user: null, reason: `Khuôn mặt không khớp (distance: ${match.distance.toFixed(2)})` }
      }

      const userInfo = descriptorsRef.current.find(d => d.userId === parseInt(match.label))
      const confidence = Math.round((1 - match.distance) * 100)
      setDebugInfo(`✅ Khớp: ${userInfo?.name} (${confidence}%)`)
      return { ok: true, user: userInfo, confidence, distance: match.distance }
    } catch (e) {
      return { ok: false, user: null, reason: 'Lỗi nhận diện: ' + e.message }
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
