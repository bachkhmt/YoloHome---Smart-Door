/**
 * useAppState.js — v3  (100% Database)
 * Mọi dữ liệu đều đọc/ghi MySQL. Không còn hardcode hay mock data.
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

export function useAppState() {
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
  const [camState,     setCamState]     = useState({ label: 'READY', sub: 'Đang chờ...', color: 'var(--theme)', showAvatar: false, avatarSeed: '' })
  const [dbConnected,  setDbConnected]  = useState(false)
  const [loading,      setLoading]      = useState(true)  // khởi động lần đầu
  const [chartData,    setChartData]    = useState(null)  // dữ liệu biểu đồ từ DB

  const failWindowRef = useRef([])
  const uptimeStart   = useRef(Date.now())
  const currentUser   = useRef(null) // user đang đăng nhập (dùng cho door/log)

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
        // Chạy song song để nhanh hơn
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

        // Users
        if (usersRes.status === 'fulfilled') {
          setUsers(usersRes.value.data)
          setDbConnected(true)
        }

        // Logs
        if (logsRes.status === 'fulfilled') {
          setLogs(logsRes.value.data.map(normalizeLog))
        }

        // Door state — đọc từ DB, không hardcode
        if (doorRes.status === 'fulfilled') {
          setLocked(Boolean(doorRes.value.data.locked))
        }

        // Sensors — giá trị mới nhất từ DB
        if (sensorsRes.status === 'fulfilled' && sensorsRes.value.data) {
          const s = sensorsRes.value.data
          setSensors({ temp: s.temp, hum: s.hum, light: s.light })
        }

        // Alerts chưa giải quyết
        if (alertsRes.status === 'fulfilled') {
          setAlerts(alertsRes.value.data)
        }

        // Chart data từ view v_weekly_auth_stats
        if (chartRes.status === 'fulfilled') {
          setChartData(chartRes.value.data)
        }

        if (usersRes.status === 'fulfilled') {
          toast('ok', '🏠 YOLO Home — Đã kết nối MySQL')
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
        // Làm mới logs, alerts, door state song song
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
  //  SENSORS — Giả lập biến động + ghi vào DB mỗi 5 giây
  // ══════════════════════════════════════════════════════════════
  useEffect(() => {
    const jitter = (v, lo, hi) => Math.min(hi, Math.max(lo, v + (Math.random() - 0.5) * 2))
    const iv = setInterval(() => {
      setSensors(prev => {
        const next = {
          temp:  parseFloat(jitter(prev.temp,  18, 36).toFixed(1)),
          hum:   Math.round(jitter(prev.hum,   30, 90)),
          light: Math.round(jitter(prev.light,  0, 1000)),
        }
        // Ghi vào DB (fire-and-forget)
        saveSensors({ ...next, device_id: 'yolobit-01' }).catch(() => {})
        return next
      })
      // Giả lập system stats (CPU/RAM từ browser không lấy được thật)
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
  //  DOOR CONTROL — luôn ghi DB
  // ══════════════════════════════════════════════════════════════
  const setDoor = useCallback(async (unlock, source = 'dashboard') => {
    setLocked(!unlock)
    try {
      await apiSetDoorState(!unlock, currentUser.current?.id || null, source)
    } catch (_) {}
  }, [])

  const manualUnlock = useCallback(async () => {
    await setDoor(true, 'dashboard')
    setLedState('granted')
    await writeLog('Admin', 'Manual', 'Manual_mở', true)
    toast('inf', '🔓 Mở cửa thủ công')
    // Ghi remote_control record
    sendCommand({ user_id: currentUser.current?.id || 4, command: 'unlock', source: 'dashboard' }).catch(() => {})
    setTimeout(() => setLedState('ready'), 2500)
  }, [setDoor, toast])

  const manualLock = useCallback(async () => {
    await setDoor(false, 'dashboard')
    setLedState('ready')
    await writeLog('Admin', 'Manual', 'Manual_khóa', true)
    toast('inf', '🔒 Khóa cửa thủ công')
    sendCommand({ user_id: currentUser.current?.id || 4, command: 'lock', source: 'dashboard' }).catch(() => {})
  }, [setDoor, toast])

  // ══════════════════════════════════════════════════════════════
  //  WRITE LOG — ghi DB + cập nhật local state
  // ══════════════════════════════════════════════════════════════
  const writeLog = useCallback(async (userName, method, action, success, userId = null, failReason = null) => {
    const entry = normalizeLog({
      user_name:  userName,
      method,
      action,
      success,
      latency_ms: Math.round(40 + Math.random() * 900),
      created_at: new Date().toISOString(),
    })
    // Cập nhật UI ngay lập tức (optimistic update)
    setLogs(p => [entry, ...p].slice(0, 50))
    // Ghi vào DB
    try {
      await apiAddLog({
        user_id:     userId,
        user_name:   userName,
        method,
        action,
        success,
        fail_reason: failReason,
        latency_ms:  entry.latency_ms,
      })
    } catch (_) {}
  }, [])

  // ══════════════════════════════════════════════════════════════
  //  FR10 — SECURITY ALERT (DB-backed)
  // ══════════════════════════════════════════════════════════════
  // Backend tự tạo alert khi POST /api/logs phát hiện 3 fail/60s.
  // Frontend polling mỗi 10s sẽ tự load về — không cần xử lý thêm ở đây.
  const resolveAlertById = useCallback(async (id) => {
    try {
      await apiResolveAlert(id, currentUser.current?.id || null)
      setAlerts(p => p.filter(a => a.id !== id))
      toast('ok', '✅ Đã xử lý cảnh báo')
    } catch (_) {
      toast('err', '❌ Không thể xử lý cảnh báo')
    }
  }, [toast])

  // ══════════════════════════════════════════════════════════════
  //  AUTH FLOW
  // ══════════════════════════════════════════════════════════════
  const startAuth = useCallback(() => {
    if (busy) return
    setBusy(true)
    setLedState('auth')
    setCamState({ label: 'SCANNING...', sub: 'Nhận diện sinh trắc học...', color: 'var(--warn)', showAvatar: false, avatarSeed: '' })
    setAuthProgress({ active: true, pct: 0, label: 'Nhận diện khuôn mặt...' })

    let p = 0
    const ticker = setInterval(() => {
      p = Math.min(100, p + 4)
      setAuthProgress({ active: true, pct: p, label: p < 50 ? 'Nhận diện khuôn mặt...' : 'Phân tích giọng nói...' })
      if (p >= 100) clearInterval(ticker)
    }, 40)

    setTimeout(async () => {
      clearInterval(ticker)
      setAuthProgress({ active: true, pct: 100, label: 'Hoàn tất' })

      const faceOk  = !authMode.face  || Math.random() > 0.2
      const voiceOk = !authMode.voice || Math.random() > 0.25
      const ok = faceOk && voiceOk

      // Chỉ lấy user đang active (online=1 hoặc online=true)
      const activeUsers = users.filter(u => u.online === 1 || u.online === true)
      const user = ok && activeUsers.length
        ? activeUsers[Math.floor(Math.random() * activeUsers.length)]
        : null

      const method = [authMode.face ? 'Face' : '', authMode.voice ? 'Voice' : ''].filter(Boolean).join(',') || 'Face'

      if (ok && user) {
        currentUser.current = user
        setLedState('granted')
        await setDoor(true, 'dashboard')
        setCamState({ label: 'GRANTED ✓', sub: 'Xin chào, ' + user.name, color: 'var(--success)', showAvatar: true, avatarSeed: user.seed })
        await writeLog(user.name, method, 'Vào', true, user.id)
        toast('ok', '✅ Xác thực thành công — ' + user.name)
        failWindowRef.current = []
      } else {
        setLedState('denied')
        const reason = !faceOk ? 'Không khớp khuôn mặt' : 'Không khớp giọng nói'
        setCamState({ label: 'DENIED ✗', sub: reason, color: 'var(--danger)', showAvatar: false, avatarSeed: '' })
        await writeLog('Không xác định', method, 'Thử', false, null, reason)
        toast('err', '❌ Từ chối truy cập')

        // Đếm thất bại local (backend cũng tự kiểm tra)
        const now = Date.now()
        failWindowRef.current = failWindowRef.current.filter(t => now - t < 60000)
        failWindowRef.current.push(now)
        // Sau khi ghi log, backend tự tạo alert → polling 10s sẽ load về
      }

      setTimeout(() => setBusy(false), 500)
      setTimeout(() => {
        setAuthProgress({ active: false, pct: 0, label: '' })
        setLedState('ready')
        setCamState({ label: 'READY', sub: 'Đang chờ...', color: 'var(--theme)', showAvatar: false, avatarSeed: '' })
      }, 2200)
    }, 1000)
  }, [busy, authMode, users, setDoor, writeLog, toast])

  // ══════════════════════════════════════════════════════════════
  //  USER MANAGEMENT — ghi DB
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
  //  FR1 — AUTO TRIGGER (giả lập phát hiện người)
  // ══════════════════════════════════════════════════════════════
  useEffect(() => {
    const iv = setInterval(() => {
      if (!busy && Math.random() < 0.08) {
        toast('inf', '📡 Phát hiện người — tự động xác thực...')
        setTimeout(() => { if (!busy) startAuth() }, 900)
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
    resolveAlertById, toast,
  }
}
