/**
 * YOLO Home — API Service Layer  (v2)
 * Base URL: /api  (proxied by Vite → http://localhost:3001)
 */
import axios from 'axios'

const api = axios.create({ baseURL: '/api', timeout: 3000 })

api.interceptors.response.use(
  res => res,
  err => Promise.reject(err)  // fail silently — app falls back to mock data
)

// ── HEALTH / SUMMARY ───────────────────────────────────────────────
export const getHealth  = ()           => api.get('/health')
export const getSummary = ()           => api.get('/summary')

// ── USERS ──────────────────────────────────────────────────────────
export const getUsers   = ()           => api.get('/users')
export const getUser    = (id)         => api.get(`/users/${id}`)
export const addUser    = (data)       => api.post('/users', data)
export const updateUser = (id, data)   => api.patch(`/users/${id}`, data)
export const deleteUser = (id)         => api.delete(`/users/${id}`)

// ── ACCESS LOGS ────────────────────────────────────────────────────
export const getLogs    = (limit = 50) => api.get('/logs', { params: { limit } })
export const addLog     = (data)       => api.post('/logs', data)

// ── DOOR STATE ─────────────────────────────────────────────────────
export const getDoorState    = ()              => api.get('/door/state')
export const setDoorState    = (locked, user_id, source) =>
  api.post('/door/state', { locked, changed_by: user_id, source })
export const getDoorHistory  = (limit = 20)   => api.get('/door/history', { params: { limit } })
export const unlockDoor = () => api.post('/door/unlock')
export const lockDoor = () => api.post('/door/lock')

// ── SENSORS ────────────────────────────────────────────────────────
export const getSensorsLatest  = ()               => api.get('/sensors/latest')
export const getSensorsHistory = (limit = 50, device) =>
  api.get('/sensors/history', { params: { limit, device } })
export const saveSensors       = (data)           => api.post('/sensors', data)

// ── REMOTE CONTROLS ────────────────────────────────────────────────
export const getRemoteHistory  = (limit = 20)     => api.get('/remote', { params: { limit } })
export const getPendingCommand = (device)         => api.get('/remote/pending', { params: { device } })
export const sendCommand       = (data)           => api.post('/remote', data)
export const ackCommand        = (id)             => api.patch(`/remote/${id}/ack`)

// ── SYSTEM BACKUPS ─────────────────────────────────────────────────
export const getBackups        = ()               => api.get('/backups')
export const createBackup      = (data)           => api.post('/backups', data)
export const updateBackup      = (id, data)       => api.patch(`/backups/${id}`, data)

// ── SECURITY ALERTS ────────────────────────────────────────────────
export const getAlerts          = (all = false)    => api.get('/alerts', { params: { all: all ? '1' : '0' } })
export const createAlert        = (data)           => api.post('/alerts', data)
export const resolveAlert       = (id, resolved_by) => api.patch(`/alerts/${id}/resolve`, { resolved_by })
export const resolveAlertByType = (alert_type, resolved_by = null) =>
  api.patch('/alerts/resolve-by-type', { alert_type, resolved_by })

// ── CHART DATA ─────────────────────────────────────────────────────
export const getWeeklyStats    = ()               => api.get('/chart/weekly')

export default api
