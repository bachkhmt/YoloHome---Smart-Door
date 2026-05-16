/** useAppState — centralized dashboard state and actions */
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
  // Adafruit MQTT — real-time feed data
  const { sensorData, latestFace, doorState: mqttDoorState, publishDoorState, publishActivity } = useAdafruitMqtt()

  // Core state
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

  // Update sensors from Adafruit MQTT
  useEffect(() => {
    if (sensorData) {
      setSensors({
        temp:  sensorData.temp  ?? sensors.temp,
        hum:   sensorData.hum   ?? sensors.hum,
        light: sensorData.light ?? sensors.light,
      })
      // Optionally save to DB on each update
      saveSensors({ 
        temp: sensorData.temp, 
        hum: sensorData.hum, 
        light: sensorData.light, 
        device_id: 'yolobit-01' 
      }).catch(() => {})
    }
  }, [sensorData]) // eslint-disable-line

  // Sync door state from MQTT
  useEffect(() => {
    if (mqttDoorState !== undefined && mqttDoorState !== null) {
      // mqttDoorState may be "UNLOCK"/"LOCK" or "locked"/"unlocked"
      const isLocked = mqttDoorState.toUpperCase() === 'LOCK' || mqttDoorState === 'locked' || mqttDoorState === true
      console.log('[MQTT] Door state from Adafruit:', mqttDoorState, '→ locked =', isLocked)
      setLocked(isLocked)
    }
  }, [mqttDoorState])

  // Toast notifications
  const toast = useCallback((type, msg) => {
    const id = Date.now() + Math.random()
    setToasts(p => [...p, { id, type, msg }])
    setTimeout(() => setToasts(p => p.filter(t => t.id !== id)), 4100)
  }, [])

  // Bootstrap: load all data on mount
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
          toast('ok', '🏠 YOLO Home — MySQL + Adafruit MQTT connected')
        } else {
          toast('warn', '⚠️ Running in Local Mode — no DB')
        }
      } catch (e) {
        toast('warn', '⚠️ Cannot connect to backend')
      } finally {
        setLoading(false)
      }
    }
    bootstrap()
  }, []) // eslint-disable-line

  // Poll fresh data every 10s
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

  // Simulated system stats (unrelated to sensors)
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

  // Helpers
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

  // Door control — publishes to Adafruit MQTT
  const setDoor = useCallback(async (unlock, source = 'dashboard') => {
    const newState = unlock ? 'UNLOCK' : 'LOCK'
    
    console.log(`[DOOR] State change → ${newState} (source: ${source})`)
    
    // 1. Update UI immediately
    setLocked(!unlock)
    
    // 2. Publish to Adafruit MQTT
    if (publishDoorState) {
      console.log('[MQTT] Publishing to Adafruit feed yolohome.door-lock:', newState)
      publishDoorState(newState)

      // Also publish activity log entry
      publishActivity({
        action: newState,
        source: source,
        user: currentUser.current?.name || 'system',
        timestamp: new Date().toISOString(),
      })
    } else {
      console.warn('[MQTT] publishDoorState not ready')
    }
    
    // 3. Save to MySQL (if backend endpoint is available)
    try {
      await apiSetDoorState(unlock ? 0 : 1)
    } catch (e) {
      console.warn('Cannot save door state to DB:', e.message)
    }
  }, [publishDoorState, publishActivity])

  const manualUnlock = useCallback(async () => {
    if (busy) return
    setBusy(true)
    toast('inf', '🔓 Unlocking...')
    try {
      await setDoor(true, 'manual')
      toast('ok', '✅ Manually unlocked')
    } catch (e) {
      toast('err', '❌ Error: ' + e.message)
    } finally {
      setTimeout(() => setBusy(false), 500)
    }
  }, [busy, setDoor, toast])

  const manualLock = useCallback(async () => {
    if (busy) return
    setBusy(true)
    toast('inf', '🔒 Locking...')
    try {
      await setDoor(false, 'manual')
      toast('ok', '✅ Manually locked')
    } catch (e) {
      toast('err', '❌ Error: ' + e.message)
    } finally {
      setTimeout(() => setBusy(false), 500)
    }
  }, [busy, setDoor, toast])

  // Access log entry
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
        toast('warn', '⚠️ Alert: multiple consecutive failures')
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
      toast('ok', '✅ Alert resolved')
    } catch (_) {
      toast('err', '❌ Error resolving alert')
    }
  }, [toast])

  const resolveAllAlerts = useCallback(async () => {
    if (!alerts.length) return
    try {
      await Promise.all(alerts.map(a => apiResolveAlert(a.id, currentUser.current?.id || null)))
      setAlerts([])
      toast('ok', `✅ All ${alerts.length} alerts resolved`)
    } catch (_) {
      toast('err', '❌ Error resolving alert list')
    }
  }, [alerts, toast])

  // Auth flow — integrated face recognition
  const startAuth = useCallback(async (recognizeFace = null) => {
    if (busy) return
    setBusy(true)
    setLedState('auth')
    setCamState({ label: 'SCANNING...', sub: 'Biometric scan...', color: 'var(--warn)', showAvatar: false, avatarSeed: '' })
    setAuthProgress({ active: true, pct: 0, label: 'Recognizing face...' })

    // Animate progress bar while waiting
    let p = 0
    const ticker = setInterval(() => {
      p = Math.min(90, p + 5)
      setAuthProgress({ active: true, pct: p, label: p < 50 ? 'Face recognition...' : 'Analyzing results...' })
    }, 60)

    try {
      const method = [authMode.face ? 'Face' : '', authMode.voice ? 'Voice' : ''].filter(Boolean).join(',') || 'Face'

      let faceResult = null

      if (authMode.face && typeof recognizeFace === 'function') {
        // Real recognition via useFaceAuth
        faceResult = await recognizeFace()
      } else if (authMode.face) {
        // Fallback: random match (dev mode, no recognizeFace)
        const activeUsers = users.filter(u => u.online === 1 || u.online === true)
        const randomOk    = Math.random() > 0.2
        if (randomOk && activeUsers.length) {
          const u = activeUsers[Math.floor(Math.random() * activeUsers.length)]
          faceResult = { ok: true, user: { ...u, userId: u.id }, confidence: 85 }
        } else {
          faceResult = { ok: false, user: null, reason: 'No match (dev mode)' }
        }
      } else {
        // Face auth disabled → auto-pass
        faceResult = { ok: true, user: null }
      }

      // Voice auth: simulated (no real voice module yet)
      const voiceOk = !authMode.voice || Math.random() > 0.25

      clearInterval(ticker)
      setAuthProgress({ active: true, pct: 100, label: 'Complete' })

      const ok = faceResult.ok && voiceOk

      if (ok && faceResult.user) {
        // Matched user from useFaceAuth — find full DB record if available
        const userId   = faceResult.user.userId ?? faceResult.user.id ?? null
        const userName = faceResult.user.name ?? 'User'
        const dbUser   = users.find(u => u.id === userId) || faceResult.user
        const seed     = dbUser.seed || userName.replace(/\s+/g, '')

        currentUser.current = dbUser

        setLedState('granted')
        await setDoor(true, 'face_auth')
        setCamState({
          label: 'GRANTED ✓',
          sub: `Hello, ${userName} (${faceResult.confidence ?? '—'}%)`,
          color: 'var(--success)',
          showAvatar: true,
          avatarSeed: seed,
        })
        await writeLog(userName, method, 'Enter', true, userId)
        toast('ok', `✅ Auth success — ${userName}`)
        failWindowRef.current = []

      } else if (ok && !faceResult.user) {
        // Face disabled + voice ok → unlock without user info
        setLedState('granted')
        await setDoor(true, 'voice_auth')
        setCamState({ label: 'GRANTED ✓', sub: 'Voice verified', color: 'var(--success)', showAvatar: false, avatarSeed: '' })
        await writeLog('Unknown', method, 'Enter', true)
        toast('ok', '✅ Voice verification successful')
        failWindowRef.current = []

      } else {
        // THẤT BẠI
        setLedState('denied')
        const reason = !faceResult.ok
          ? (faceResult.reason || 'Face mismatch')
          : 'Voice mismatch'
        setCamState({ label: 'DENIED ✗', sub: reason, color: 'var(--danger)', showAvatar: false, avatarSeed: '' })
        await writeLog('Unknown', method, 'Attempt', false, null, reason)
        toast('err', '❌ Access denied — ' + reason)

        const now = Date.now()
        failWindowRef.current = failWindowRef.current.filter(t => now - t < 60000)
        failWindowRef.current.push(now)
      }
    } catch (e) {
      clearInterval(ticker)
      toast('err', '❌ Auth error: ' + e.message)
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
    if (!name.trim()) { toast('warn', '⚠️ Please enter a name'); return false }
    try {
      const res = await apiAddUser({
        name: name.trim(),
        role: role.trim() || 'Guest',
        seed: name.trim().replace(/\s+/g, ''),
      })
      setUsers(p => [...p, res.data])
      toast('ok', '✅ Added: ' + name)
      return true
    } catch (e) {
      toast('err', '❌ Failed to add user: ' + (e.response?.data?.error || e.message))
      return false
    }
  }, [toast])

  const removeUser = useCallback(async (id) => {
    try {
      await apiDeleteUser(id)
      setUsers(p => p.filter(u => u.id !== id))
      toast('inf', 'User deleted')
    } catch (e) {
      toast('err', '❌ Could not delete: ' + (e.response?.data?.error || e.message))
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
  //  FACE MATCH HANDLER — triggered by face-recognizer pipeline
  // ══════════════════════════════════════════════════════════════
  const handleFaceMatch = useCallback(async (match) => {
    const name = match.name || 'Unknown'
    const confidence = match.confidence ?? 0

    setLedState('granted')
    await setDoor(true, 'face_auth')
    setCamState({
      label: 'GRANTED ✓',
      sub: `Welcome, ${name} (${Math.round(confidence * 100)}%)`,
      color: 'var(--success)',
      showAvatar: true,
      avatarSeed: name.replace(/\s+/g, ''),
    })
    await writeLog(name, 'Face', 'Enter', true, null)
    toast('ok', `✅ Access granted — ${name}`)

    // Reset after 5 seconds
    setTimeout(() => {
      setLedState('ready')
      setCamState({ label: 'READY', sub: '...', color: 'var(--theme)', showAvatar: false, avatarSeed: '' })
    }, 5000)
  }, [setDoor, writeLog, toast, setLedState, setCamState])

  return {
    // State
    locked, busy, ledState, authMode, users, logs, alerts, toasts,
    theme, fanSpeed, sensors, sysStats, authProgress, camState,
    dbConnected, loading, chartData, uptimeStart,
    // Setters
    setFanSpeed, setLedState, setCamState,
    // Actions
    startAuth, manualUnlock, manualLock,
    addUserLocal, removeUser,
    toggleAuthMode, applyTheme,
    resolveAlertById, toast, resolveAllAlerts,
    handleFaceMatch,
    // MQTT data
    latestFace,
  }
}