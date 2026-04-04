/**
 * useAppState.js — v6 (FIXED)
 *
 * Thay đổi so với v5:
 *  - Thêm logic publish lên Adafruit khi thay đổi door state
 *  - Khi ấn nút Mở/Khóa → gửi command lên Adafruit → Python nhận được
 */
import { useState, useRef, useCallback, useEffect } from 'react'
import {
  getUsers, addUser as apiAddUser, deleteUser as apiDeleteUser,
  getLogs, addLog as apiAddLog,
  getDoorState, setDoorState as apiSetDoorState,
  getSensorsLatest, saveSensors,
  getAlerts, resolveAlert as apiResolveAlert,
  sendCommand,
  getWeeklyStats,
} from '../lib/api'
import useAdafruitMqtt from '../hooks/useAdafruitMqtt'

export function useAppState() {
  // ── ADAFRUIT MQTT — Dữ liệu real-time từ feeds ──────────────────
  const { sensorData, latestFace, doorState: mqttDoorState, publishDoorState } = useAdafruitMqtt()

  // ── Core state ──────────────────────────────────────────────────
  const [locked,       setLocked]       = useState(true)
  const [busy,         setBusy]         = useState(false)
  const [ledState,     setLedState]     = useState('ready')
  const [authMode,     setAuthMode]     = useState({ face: true, voice: true })
  const [users,        setUsers]        = useState([])
  const [logs,         setLogs]         = useState([])
  const [alerts,       setAlerts]       = useState([])
  const [toasts,       setToasts]       = useState([])
  const [theme,        setTheme]        = useState({ primary: '#ec4899', secondary: '#8b5cf6', name: 'Pink Fusion' })
  const [fanSpeed,     setFanSpeed]     = useState(72)
  const [sensors,      setSensors]      = useState({ temp: 24.5, hum: 52, light: 310 })
  const [sysStats,     setSysStats]     = useState({ cpu: 0, ram: 0, net: true, latency: 0 })
  const [authProgress, setAuthProgress] = useState({ active: false, pct: 0, label: '' })
  const [camState,     setCamState]     = useState({ label: 'READY', sub: '...', color: 'var(--theme)', showAvatar: false, avatarSeed: '' })
  const [dbConnected,  setDbConnected]  = useState(false)
  const [loading,      setLoading]      = useState(true)
  const [chartData,    setChartData]    = useState(null)

  const failWindowRef = useRef([])
  const uptimeStart   = useRef(Date.now())
  const currentUser   = useRef(null)

  // ══════════════════════════════════════════════════════════════
  //  CẬP NHẬT SENSORS TỪ ADAFRUIT MQTT
  // ══════════════════════════════════════════════════════════════
  useEffect(() => {
    if (sensorData) {
      setSensors({
        temp:  sensorData.temp  ?? sensors.temp,
        hum:   sensorData.hum   ?? sensors.hum,
        light: sensorData.light ?? sensors.light,
      })
      // Tùy chọn: Lưu vào DB mỗi khi có dữ liệu mới
      saveSensors({ 
        temp: sensorData.temp, 
        hum: sensorData.hum, 
        light: sensorData.light, 
        device_id: 'yolobit-01' 
      }).catch(() => {})
    }
  }, [sensorData]) // eslint-disable-line

  // ══════════════════════════════════════════════════════════════
  //  ĐỒNG BỘ DOOR STATE TỪ MQTT
  // ══════════════════════════════════════════════════════════════
  useEffect(() => {
    if (mqttDoorState !== undefined && mqttDoorState !== null) {
      // mqttDoorState có thể là "UNLOCK"/"LOCK" hoặc "locked"/"unlocked"
      const isLocked = mqttDoorState.toUpperCase() === 'LOCK' || mqttDoorState === 'locked' || mqttDoorState === true
      console.log('📥 [MQTT] Nhận door state từ Adafruit:', mqttDoorState, '→ locked =', isLocked)
      setLocked(isLocked)
    }
  }, [mqttDoorState])

  // ══════════════════════════════════════════════════════════════
  //  TOAST
  // ══════════════════════════════════════════════════════════════
  const toast = useCallback((type, msg) => {
    const id = Date.now() + Math.random()
    setToasts(p => [...p, { id, type, msg }])
    setTimeout(() => setToasts(p => p.filter(t => t.id !== id)), 4100)
  }, [])

  // ══════════════════════════════════════════════════════════════
  //  LOAD TẤT CẢ DỮ LIỆU KHI KHỞI ĐỘNG
  // ══════════════════════════════════════════════════════════════
  useEffect(() => {
    async function bootstrap() {
      try {
        const [
          usersRes,
          logsRes,
          doorRes,
          sensorsRes,
          alertsRes,
          chartRes,
        ] = await Promise.allSettled([
          getUsers(),
          getLogs(50),
          getDoorState(),
          getSensorsLatest(),
          getAlerts(),
          getWeeklyStats(),
        ])

        if (usersRes.status === 'fulfilled') {
          setUsers(usersRes.value.data)
          setDbConnected(true)
        }
        if (logsRes.status === 'fulfilled') {
          setLogs(logsRes.value.data.map(normalizeLog))
        }
        if (doorRes.status === 'fulfilled') {
          setLocked(Boolean(doorRes.value.data.locked))
        }
        if (sensorsRes.status === 'fulfilled' && sensorsRes.value.data) {
          const s = sensorsRes.value.data
          setSensors({ temp: s.temp, hum: s.hum, light: s.light })
        }
        if (alertsRes.status === 'fulfilled') {
          setAlerts(alertsRes.value.data)
        }
        if (chartRes.status === 'fulfilled') {
          setChartData(chartRes.value.data)
        }

        if (usersRes.status === 'fulfilled') {
          toast('ok', '🏠 YOLO Home — Đã kết nối MySQL + Adafruit MQTT')
        } else {
          toast('warn', '⚠️ Chạy ở Local Mode — không có DB')
        }
      } catch (e) {
        toast('warn', '⚠️ Không thể kết nối backend')
      } finally {
        setLoading(false)
      }
    }
    bootstrap()
  }, []) // eslint-disable-line

  // ══════════════════════════════════════════════════════════════
  //  POLLING — Làm mới dữ liệu mỗi 10 giây
  // ══════════════════════════════════════════════════════════════
  useEffect(() => {
    if (!dbConnected) return
    const iv = setInterval(async () => {
      try {
        const [logsRes, alertsRes, doorRes] = await Promise.allSettled([
          getLogs(50),
          getAlerts(),
          getDoorState(),
        ])
        if (logsRes.status === 'fulfilled')
          setLogs(logsRes.value.data.map(normalizeLog))
        if (alertsRes.status === 'fulfilled')
          setAlerts(alertsRes.value.data)
        if (doorRes.status === 'fulfilled')
          setLocked(Boolean(doorRes.value.data.locked))
      } catch (_) {}
    }, 10000)
    return () => clearInterval(iv)
  }, [dbConnected])

  // ══════════════════════════════════════════════════════════════
  //  SYSTEM STATS — Giả lập CPU/RAM (không liên quan đến sensors)
  // ══════════════════════════════════════════════════════════════
  useEffect(() => {
    const iv = setInterval(() => {
      setSysStats({
        cpu:     Math.round(15 + Math.random() * 50),
        ram:     Math.round(35 + Math.random() * 35),
        net:     Math.random() > 0.05,
        latency: Math.round(6  + Math.random() * 24),
      })
    }, 5000)
    return () => clearInterval(iv)
  }, [])

  // ══════════════════════════════════════════════════════════════
  //  HELPERS
  // ══════════════════════════════════════════════════════════════
  function normalizeLog(l) {
    return {
      ...l,
      user:    l.user_name || l.user,
      latency: l.latency_ms ? l.latency_ms + 'ms' : (l.latency || '—'),
      time:    l.created_at ? new Date(l.created_at) : (l.time || new Date()),
    }
  }

  const applyTheme = useCallback((primary, secondary, name) => {
    document.documentElement.style.setProperty('--theme',  primary)
    document.documentElement.style.setProperty('--theme2', secondary)
    setTheme({ primary, secondary, name })
    toast('inf', '🎨 Mood: ' + name)
  }, [toast])

  // ══════════════════════════════════════════════════════════════
  //  DOOR CONTROL — FIXED: Thêm publish lên Adafruit
  // ══════════════════════════════════════════════════════════════
  const setDoor = useCallback(async (unlock, source = 'dashboard') => {
    const newState = unlock ? 'UNLOCK' : 'LOCK'
    
    console.log(`🚪 [DOOR] Thay đổi trạng thái → ${newState} (nguồn: ${source})`)
    
    // 1. Cập nhật UI ngay lập tức
    setLocked(!unlock)
    
    // 2. PUBLISH LÊN ADAFRUIT (QUAN TRỌNG!)
    if (publishDoorState) {
      console.log('📤 [MQTT] Publishing lên Adafruit feed yolohome.door-lock:', newState)
      publishDoorState(newState)
    } else {
      console.warn('⚠️ [MQTT] publishDoorState chưa sẵn sàng')
    }
    
    // 3. Lưu vào MySQL (nếu backend có endpoint)
    try {
      await apiSetDoorState(unlock ? 0 : 1)
    } catch (e) {
      console.warn('Không thể lưu door state vào DB:', e.message)
    }
  }, [publishDoorState])

  const manualUnlock = useCallback(async () => {
    if (busy) return
    setBusy(true)
    toast('inf', '🔓 Đang mở khóa...')
    try {
      await setDoor(true, 'manual')
      toast('ok', '✅ Đã mở khóa thủ công')
    } catch (e) {
      toast('err', '❌ Lỗi: ' + e.message)
    } finally {
      setTimeout(() => setBusy(false), 500)
    }
  }, [busy, setDoor, toast])

  const manualLock = useCallback(async () => {
    if (busy) return
    setBusy(true)
    toast('inf', '🔒 Đang khóa cửa...')
    try {
      await setDoor(false, 'manual')
      toast('ok', '✅ Đã khóa cửa thủ công')
    } catch (e) {
      toast('err', '❌ Lỗi: ' + e.message)
    } finally {
      setTimeout(() => setBusy(false), 500)
    }
  }, [busy, setDoor, toast])

  // ══════════════════════════════════════════════════════════════
  //  LOG ENTRY
  // ══════════════════════════════════════════════════════════════
  const writeLog = useCallback(async (user, method, action, success, userId = null, failReason = null) => {
    const entry = {
      user_id:     userId,
      user_name:   user,
      method:      method,
      action:      action,
      success:     success ? 1 : 0,
      fail_reason: failReason,
      latency_ms:  Math.round(10 + Math.random() * 120),
      ip_address:  '127.0.0.1',
    }
    try {
      const res = await apiAddLog(entry)
      if (res.data?.alert_created) {
        setAlerts(p => [...p, res.data.alert])
        toast('warn', '⚠️ Cảnh báo: thất bại nhiều lần liên tiếp')
      }
      const newLogs = await getLogs(50)
      setLogs(newLogs.data.map(normalizeLog))
    } catch (e) {
      console.error('writeLog error:', e)
    }
  }, [toast])

  const resolveAlertById = useCallback(async (id) => {
    try {
      await apiResolveAlert(id, currentUser.current?.id || null)
      setAlerts(p => p.filter(a => a.id !== id))
      toast('ok', '✅ Đã xử lý cảnh báo')
    } catch (_) {
      toast('err', '❌ Lỗi khi xử lý cảnh báo')
    }
  }, [toast])

  const resolveAllAlerts = useCallback(async () => {
    if (!alerts.length) return
    try {
      await Promise.all(alerts.map(a => apiResolveAlert(a.id, currentUser.current?.id || null)))
      setAlerts([])
      toast('ok', `✅ Đã xử lý toàn bộ ${alerts.length} cảnh báo`)
    } catch (_) {
      toast('err', '❌ Có lỗi khi xử lý danh sách cảnh báo')
    }
  }, [alerts, toast])

  // ══════════════════════════════════════════════════════════════
  //  AUTH FLOW — tích hợp recognizeFace thật
  // ══════════════════════════════════════════════════════════════
  const startAuth = useCallback(async (recognizeFace = null) => {
    if (busy) return
    setBusy(true)
    setLedState('auth')
    setCamState({ label: 'SCANNING...', sub: 'Nhận diện sinh trắc học...', color: 'var(--warn)', showAvatar: false, avatarSeed: '' })
    setAuthProgress({ active: true, pct: 0, label: 'Nhận diện khuôn mặt...' })

    // Animate progress bar trong khi chờ nhận diện
    let p = 0
    const ticker = setInterval(() => {
      p = Math.min(90, p + 5)
      setAuthProgress({ active: true, pct: p, label: p < 50 ? 'Nhận diện khuôn mặt...' : 'Phân tích kết quả...' })
    }, 60)

    try {
      const method = [authMode.face ? 'Face' : '', authMode.voice ? 'Voice' : ''].filter(Boolean).join(',') || 'Face'

      let faceResult = null

      if (authMode.face && typeof recognizeFace === 'function') {
        // ── NHẬN DIỆN THẬT (useFaceAuth) ──────────────────────────
        faceResult = await recognizeFace()
      } else if (authMode.face) {
        // ── FALLBACK: random (dev mode khi chưa truyền recognizeFace) ──
        const activeUsers = users.filter(u => u.online === 1 || u.online === true)
        const randomOk    = Math.random() > 0.2
        if (randomOk && activeUsers.length) {
          const u = activeUsers[Math.floor(Math.random() * activeUsers.length)]
          faceResult = { ok: true, user: { ...u, userId: u.id }, confidence: 85 }
        } else {
          faceResult = { ok: false, user: null, reason: 'Không khớp (dev mode)' }
        }
      } else {
        // Face auth tắt → coi như pass
        faceResult = { ok: true, user: null }
      }

      // Voice auth: vẫn giả lập (chưa có module voice thật)
      const voiceOk = !authMode.voice || Math.random() > 0.25

      clearInterval(ticker)
      setAuthProgress({ active: true, pct: 100, label: 'Hoàn tất' })

      const ok = faceResult.ok && voiceOk

      if (ok && faceResult.user) {
        // Khớp với user từ useFaceAuth — tìm record đầy đủ trong DB nếu có
        const userId   = faceResult.user.userId ?? faceResult.user.id ?? null
        const userName = faceResult.user.name ?? 'Người dùng'
        const dbUser   = users.find(u => u.id === userId) || faceResult.user
        const seed     = dbUser.seed || userName.replace(/\s+/g, '')

        currentUser.current = dbUser

        setLedState('granted')
        await setDoor(true, 'face_auth')
        setCamState({
          label: 'GRANTED ✓',
          sub: `Xin chào, ${userName} (${faceResult.confidence ?? '—'}%)`,
          color: 'var(--success)',
          showAvatar: true,
          avatarSeed: seed,
        })
        await writeLog(userName, method, 'Vào', true, userId)
        toast('ok', `✅ Xác thực thành công — ${userName}`)
        failWindowRef.current = []

      } else if (ok && !faceResult.user) {
        // Face tắt + voice ok → mở nhưng không có thông tin user
        setLedState('granted')
        await setDoor(true, 'voice_auth')
        setCamState({ label: 'GRANTED ✓', sub: 'Xác thực giọng nói', color: 'var(--success)', showAvatar: false, avatarSeed: '' })
        await writeLog('Không xác định', method, 'Vào', true)
        toast('ok', '✅ Xác thực giọng nói thành công')
        failWindowRef.current = []

      } else {
        // THẤT BẠI
        setLedState('denied')
        const reason = !faceResult.ok
          ? (faceResult.reason || 'Không khớp khuôn mặt')
          : 'Không khớp giọng nói'
        setCamState({ label: 'DENIED ✗', sub: reason, color: 'var(--danger)', showAvatar: false, avatarSeed: '' })
        await writeLog('Không xác định', method, 'Thử', false, null, reason)
        toast('err', '❌ Từ chối truy cập — ' + reason)

        const now = Date.now()
        failWindowRef.current = failWindowRef.current.filter(t => now - t < 60000)
        failWindowRef.current.push(now)
      }
    } catch (e) {
      clearInterval(ticker)
      toast('err', '❌ Lỗi xác thực: ' + e.message)
    } finally {
      setTimeout(() => setBusy(false), 500)
      setTimeout(() => {
        setAuthProgress({ active: false, pct: 0, label: '' })
        setLedState('ready')
        setCamState({ label: 'READY', sub: '...', color: 'var(--theme)', showAvatar: false, avatarSeed: '' })
      }, 2200)
    }
  }, [busy, authMode, users, setDoor, writeLog, toast])

  // ══════════════════════════════════════════════════════════════
  //  USER MANAGEMENT
  // ══════════════════════════════════════════════════════════════
  const addUserLocal = useCallback(async (name, role) => {
    if (!name.trim()) { toast('warn', '⚠️ Vui lòng nhập tên'); return false }
    try {
      const res = await apiAddUser({
        name: name.trim(),
        role: role.trim() || 'Guest',
        seed: name.trim().replace(/\s+/g, ''),
      })
      setUsers(p => [...p, res.data])
      toast('ok', '✅ Đã thêm: ' + name)
      return true
    } catch (e) {
      toast('err', '❌ Lỗi thêm người dùng: ' + (e.response?.data?.error || e.message))
      return false
    }
  }, [toast])

  const removeUser = useCallback(async (id) => {
    try {
      await apiDeleteUser(id)
      setUsers(p => p.filter(u => u.id !== id))
      toast('inf', 'Đã xóa người dùng')
    } catch (e) {
      toast('err', '❌ Không thể xóa: ' + (e.response?.data?.error || e.message))
    }
  }, [toast])

  // ══════════════════════════════════════════════════════════════
  //  AUTH MODE TOGGLE
  // ══════════════════════════════════════════════════════════════
  const toggleAuthMode = useCallback((m) => {
    setAuthMode(p => {
      const next = { ...p, [m]: !p[m] }
      toast('inf', (m === 'face' ? '👤 Face ID' : '🎙️ Voice ID') + ': ' + (next[m] ? 'BẬT' : 'TẮT'))
      return next
    })
  }, [toast])

  // ══════════════════════════════════════════════════════════════
  //  FR1 — AUTO TRIGGER
  // ══════════════════════════════════════════════════════════════
  const recognizeFaceFnRef = useRef(null)

  const setAutoRecognizeFace = useCallback((fn) => {
    recognizeFaceFnRef.current = fn
  }, [])

  useEffect(() => {
    const iv = setInterval(() => {
      if (!busy && Math.random() < 0.08) {
        toast('inf', '📡 Phát hiện người — tự động xác thực...')
        setTimeout(() => {
          if (!busy) startAuth(recognizeFaceFnRef.current)
        }, 900)
      }
    }, 18000)
    return () => clearInterval(iv)
  }, [busy, startAuth, toast])

  return {
    // State
    locked, busy, ledState, authMode, users, logs, alerts, toasts,
    theme, fanSpeed, sensors, sysStats, authProgress, camState,
    dbConnected, loading, chartData, uptimeStart,
    // Setters
    setFanSpeed,
    // Actions
    startAuth, manualUnlock, manualLock,
    addUserLocal, removeUser,
    toggleAuthMode, applyTheme,
    resolveAlertById, toast, resolveAllAlerts,
    setAutoRecognizeFace,
    // MQTT data
    latestFace,
  }
}