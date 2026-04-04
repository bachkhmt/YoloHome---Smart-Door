/**
 * YOLO Home — Express + MySQL Backend  (v2)
 * Chạy: node server/index.js
 */

import express from 'express'
import mysql   from 'mysql2/promise'
import cors    from 'cors'
import dotenv  from 'dotenv'
import axios   from 'axios'

dotenv.config()

const app  = express()
const PORT = process.env.PORT || 3001

// Adafruit IO config (cho auth trigger)
const ADAFRUIT_USERNAME = process.env.ADAFRUIT_USERNAME
const ADAFRUIT_KEY      = process.env.ADAFRUIT_KEY
const ADAFRUIT_API      = 'https://io.adafruit.com/api/v2'
const AUTH_FEED         = 'yolohome.auth-trigger'

app.use(cors())
app.use(express.json())

// ══════════════════════════════════════════════════════════════════
// ⚠️  SOCKET.IO (optional — uncomment nếu muốn real-time push)
// ══════════════════════════════════════════════════════════════════
/*
import { createServer } from 'http'
import { Server } from 'socket.io'
 
const httpServer = createServer(app)
const io = new Server(httpServer, { 
  cors: { origin: '*' } 
})
 
io.on('connection', (socket) => {
  console.log('Client connected:', socket.id)
})
 
// Sau khi lưu DB, emit event:
// io.emit('sensor:update', { temp, hum, light })
// io.emit('log:new', { user_name, action, success })
 
// Cuối file thay app.listen → httpServer.listen
*/
// ══════════════════════════════════════════════════════════════════

// ── DB POOL ────────────────────────────────────────────────────────
let pool = null

async function getPool() {
  if (pool) return pool;

  if (!process.env.DB_HOST || !process.env.DB_USER || !process.env.DB_NAME) {
    console.error("❌ LỖI NGHIÊM TRỌNG: Thiếu thông tin cấu hình Database trong file .env!");
    process.exit(1); 
  }

  pool = mysql.createPool({
    host:               process.env.DB_HOST,
    port:               parseInt(process.env.DB_PORT) || 3306,
    user:               process.env.DB_USER,
    password:           process.env.DB_PASS, 
    database:           process.env.DB_NAME,
    waitForConnections: true,
    connectionLimit:    10,
    connectTimeout:     10000,
  })
  return pool
}

async function query(sql, params = []) {
  const db = await getPool()
  const [rows] = await db.query(sql, params)
  return rows
}

// ══════════════════════════════════════════════════════════════════
//  HEALTH
// ══════════════════════════════════════════════════════════════════
app.get('/api/health', async (req, res) => {
  try {
    await query('SELECT 1')
    res.json({ status: 'ok', db: 'connected' })
  } catch (e) {
    res.status(500).json({ status: 'error', message: e.message })
  }
})

// Dashboard summary (dùng VIEW v_dashboard_summary)
app.get('/api/summary', async (req, res) => {
  try {
    const rows = await query('SELECT * FROM v_dashboard_summary')
    res.json(rows[0] || {})
  } catch (e) {
    res.status(500).json({ error: e.message })
  }
})

// ══════════════════════════════════════════════════════════════════
//  USERS
// ══════════════════════════════════════════════════════════════════
app.get('/api/users', async (req, res) => {
  try {
    const rows = await query('SELECT * FROM users ORDER BY id')
    res.json(rows)
  } catch (e) {
    console.error('[GET /users]', e.message)
    res.status(500).json({ error: e.message })
  }
})

// 1. Lấy danh sách encodings của tất cả người nhà (cho Python tải về lúc khởi động)
app.get('/api/users/encodings', async (req, res) => {
  try {
    const rows = await query(
      'SELECT id, name, face_encoding FROM users WHERE face_enrolled = 1 AND online = 1'
    )
    // Chuyển string JSON từ DB thành object mảng cho Python dễ đọc
    const usersWithEncodings = rows.map(u => ({
      ...u,
      face_encoding: typeof u.face_encoding === 'string' ? JSON.parse(u.face_encoding) : u.face_encoding
    }))
    res.json(usersWithEncodings)
  } catch (e) {
    res.status(500).json({ error: e.message })
  }
})

// 2. Cập nhật khuôn mặt cho User cụ thể
app.patch('/api/users/:id/face', async (req, res) => {
  try {
    const { face_encoding } = req.body // Nhận mảng 128 số từ Python gửi lên
    if (!face_encoding || !Array.isArray(face_encoding)) {
      return res.status(400).json({ error: 'Dữ liệu khuôn mặt không hợp lệ' })
    }

    await query(
      'UPDATE users SET face_encoding = ?, face_enrolled = 1 WHERE id = ?',
      [JSON.stringify(face_encoding), req.params.id]
    )
    res.json({ ok: true, message: 'Đã lưu khuôn mặt thành công' })
  } catch (e) {
    res.status(500).json({ error: e.message })
  }
})

app.get('/api/users/:id', async (req, res) => {
  try {
    const rows = await query('SELECT * FROM users WHERE id = ?', [req.params.id])
    if (!rows.length) return res.status(404).json({ error: 'Không tìm thấy' })
    res.json(rows[0])
  } catch (e) {
    res.status(500).json({ error: e.message })
  }
})

app.post('/api/users', async (req, res) => {
  try {
    const { name, role, seed, face_enrolled, voice_enrolled } = req.body
    if (!name?.trim()) return res.status(400).json({ error: 'Thiếu tên' })
    const result = await query(
      `INSERT INTO users (name, role, seed, online, face_enrolled, voice_enrolled)
       VALUES (?, ?, ?, 1, ?, ?)`,
      [
        name.trim(),
        role || 'Guest',
        seed || name.trim().replace(/\s+/g, ''),
        face_enrolled  ? 1 : 0,
        voice_enrolled ? 1 : 0,
      ]
    )
    const [newUser] = await query('SELECT * FROM users WHERE id = ?', [result.insertId])
    res.status(201).json(newUser)
  } catch (e) {
    console.error('[POST /users]', e.message)
    res.status(500).json({ error: e.message })
  }
})

app.patch('/api/users/:id', async (req, res) => {
  try {
    const { name, role, online, face_enrolled, voice_enrolled } = req.body
    await query(
      `UPDATE users
       SET name=?, role=?, online=?, face_enrolled=?, voice_enrolled=?
       WHERE id=?`,
      [name, role, online ? 1 : 0, face_enrolled ? 1 : 0, voice_enrolled ? 1 : 0, req.params.id]
    )
    res.json({ ok: true })
  } catch (e) {
    res.status(500).json({ error: e.message })
  }
})

app.delete('/api/users/:id', async (req, res) => {
  try {
    await query('DELETE FROM users WHERE id = ?', [req.params.id])
    res.json({ ok: true })
  } catch (e) {
    res.status(500).json({ error: e.message })
  }
})

// ══════════════════════════════════════════════════════════════════
//  ACCESS LOGS
// ══════════════════════════════════════════════════════════════════
app.get('/api/logs', async (req, res) => {
  try {
    const limit = Math.min(parseInt(req.query.limit) || 50, 200)
    // Dùng VIEW để kèm role của user
    const rows = await query(
      `SELECT * FROM v_access_log_full ORDER BY created_at DESC LIMIT ?`,
      [limit]
    )
    res.json(rows)
  } catch (e) {
    console.error('[GET /logs]', e.message)
    res.status(500).json({ error: e.message })
  }
})

app.post('/api/logs', async (req, res) => {
  try {
    const { user_id, user_name, method, action, success, fail_reason, latency_ms, ip_address } = req.body
    console.log(`\n[BACKEND - LỊCH SỬ] Nhận thông báo: ${user_name} vừa ra vào bằng ${method || 'Face ID'}. Đang lưu vào MySQL...`);
    await query(
      `INSERT INTO access_logs
         (user_id, user_name, method, action, success, fail_reason, latency_ms, ip_address)
       VALUES (?, ?, ?, ?, ?, ?, ?, ?)`,
      [
        user_id   || null,
        user_name || 'Không xác định',
        method    || 'Face',
        action    || 'Vào',
        success   ? 1 : 0,
        fail_reason   || null,
        latency_ms    || null,
        ip_address    || null,
      ]
    )
    // FR10: Kiểm tra thất bại liên tiếp trong 60 giây → tạo cảnh báo
    if (!success) {
      const recentFails = await query(
        `SELECT COUNT(*) AS cnt FROM access_logs
         WHERE success = 0
           AND created_at >= DATE_SUB(NOW(), INTERVAL 60 SECOND)`
      )
      if (recentFails[0].cnt >= 3) {
        await query(
          `INSERT INTO security_alerts
             (alert_type, severity, message, related_user_id)
           VALUES ('multiple_fail', 'high', ?, ?)`,
          [
            `${recentFails[0].cnt} lần xác thực thất bại trong 60 giây`,
            user_id || null,
          ]
        )
      }
    }
    res.json({ ok: true })
  } catch (e) {
    console.error('[POST /logs]', e.message)
    res.status(500).json({ error: e.message })
  }
})

// ══════════════════════════════════════════════════════════════════
//  DOOR STATE
// ══════════════════════════════════════════════════════════════════
app.get('/api/door/state', async (req, res) => {
  try {
    const rows = await query(
      `SELECT d.locked, d.source, d.changed_at, u.name AS changed_by_name
       FROM door_state d
       LEFT JOIN users u ON d.changed_by = u.id
       ORDER BY d.id DESC LIMIT 1`
    )
    res.json(rows[0] || { locked: 1, source: 'auto' })
  } catch (e) {
    res.status(500).json({ error: e.message })
  }
})

app.post('/api/door/state', async (req, res) => {
  try {
    const { locked, changed_by, source } = req.body
    await query(
      `INSERT INTO door_state (locked, changed_by, source) VALUES (?, ?, ?)`,
      [locked ? 1 : 0, changed_by || null, source || 'dashboard']
    )
    res.json({ ok: true })
  } catch (e) {
    res.status(500).json({ error: e.message })
  }
})

// Lịch sử thay đổi trạng thái cửa
app.get('/api/door/history', async (req, res) => {
  try {
    const limit = Math.min(parseInt(req.query.limit) || 20, 100)
    const rows = await query(
      `SELECT d.id, d.locked, d.source, d.changed_at, u.name AS changed_by_name
       FROM door_state d
       LEFT JOIN users u ON d.changed_by = u.id
       ORDER BY d.id DESC LIMIT ?`,
      [limit]
    )
    res.json(rows)
  } catch (e) {
    res.status(500).json({ error: e.message })
  }
})

// ── Helper: publish lên Adafruit IO feed ──────────────────────────
async function publishToAdafruit(feedKey, value) {
  const username = process.env.ADAFRUIT_USERNAME
  const key      = process.env.ADAFRUIT_KEY
  if (!username || !key) throw new Error('Thiếu ADAFRUIT_USERNAME hoặc ADAFRUIT_KEY trong .env')
  await axios.post(
    `https://io.adafruit.com/api/v2/${username}/feeds/${feedKey}/data`,
    { value: String(value) },
    { headers: { 'X-AIO-Key': key, 'Content-Type': 'application/json' }, timeout: 5000 }
  )
}

// ── POST /api/door/unlock ──────────────────────────────────────────
// HeroCard gọi khi ấn nút 🔓 Mở
app.post('/api/door/unlock', async (req, res) => {
  try {
    console.log('\n🔓 [DOOR] Nhận lệnh MỞ KHÓA từ Dashboard')

    // 1. Publish lên Adafruit → Python nhận qua MQTT → điều khiển hardware
    await publishToAdafruit('yolohome.door-lock', 'UNLOCK')
    console.log('📤 [DOOR] Đã publish UNLOCK → Adafruit yolohome.door-lock')

    // 2. Lưu trạng thái vào DB
    await query(
      `INSERT INTO door_state (locked, source) VALUES (0, 'dashboard')`,
    )

    // 3. Ghi access log
    await query(
      `INSERT INTO access_logs (user_name, method, action, success)
       VALUES ('Dashboard', 'Manual', 'door_unlock', 1)`
    )
    console.log('📝 [DOOR] Đã ghi log: door_unlock')

    res.json({ ok: true, message: 'Đã gửi lệnh mở khóa' })
  } catch (e) {
    console.error('[DOOR UNLOCK] ❌ Lỗi:', e.message)
    res.status(500).json({ error: e.message })
  }
})

// ── POST /api/door/lock ────────────────────────────────────────────
// HeroCard gọi khi ấn nút 🔒 Khóa
app.post('/api/door/lock', async (req, res) => {
  try {
    console.log('\n🔒 [DOOR] Nhận lệnh KHÓA CỬA từ Dashboard')

    // 1. Publish lên Adafruit → Python nhận qua MQTT → điều khiển hardware
    await publishToAdafruit('yolohome.door-lock', 'LOCK')
    console.log('📤 [DOOR] Đã publish LOCK → Adafruit yolohome.door-lock')

    // 2. Lưu trạng thái vào DB
    await query(
      `INSERT INTO door_state (locked, source) VALUES (1, 'dashboard')`,
    )

    // 3. Ghi access log
    await query(
      `INSERT INTO access_logs (user_name, method, action, success)
       VALUES ('Dashboard', 'Manual', 'door_lock', 1)`
    )
    console.log('📝 [DOOR] Đã ghi log: door_lock')

    res.json({ ok: true, message: 'Đã gửi lệnh khóa cửa' })
  } catch (e) {
    console.error('[DOOR LOCK] ❌ Lỗi:', e.message)
    res.status(500).json({ error: e.message })
  }
})

// ══════════════════════════════════════════════════════════════════
//  SENSORS
// ══════════════════════════════════════════════════════════════════
app.get('/api/sensors/latest', async (req, res) => {
  try {
    const rows = await query(
      `SELECT * FROM sensor_readings ORDER BY created_at DESC LIMIT 1`
    )
    res.json(rows[0] || { temp: 24.5, hum: 52, light: 310 })
  } catch (e) {
    res.status(500).json({ error: e.message })
  }
})

// Lịch sử cảm biến (dùng cho chart realtime)
app.get('/api/sensors/history', async (req, res) => {
  try {
    const limit  = Math.min(parseInt(req.query.limit)  || 50,  500)
    const device = req.query.device || null
    const rows = await query(
      `SELECT * FROM sensor_readings
       WHERE (? IS NULL OR device_id = ?)
       ORDER BY created_at DESC LIMIT ?`,
      [device, device, limit]
    )
    res.json(rows.reverse()) // trả về theo thứ tự thời gian tăng dần
  } catch (e) {
    res.status(500).json({ error: e.message })
  }
})

app.post('/api/sensors', async (req, res) => {
  try {
    const { temp, hum, light, device_id } = req.body
    // console.log(`🌡️ [BACKEND - SENSOR] Nhận dữ liệu môi trường mới: ${temp}°C, Độ ẩm: ${hum}%, Ánh sáng: ${light} lux. Đang lưu DB...`);
    await query(
      `INSERT INTO sensor_readings (temp, hum, light, device_id) VALUES (?, ?, ?, ?)`,
      [temp, hum, light, device_id || null]
    )
    res.json({ ok: true })
  } catch (e) {
    res.status(500).json({ error: e.message })
  }
})

// ══════════════════════════════════════════════════════════════════
//  REMOTE CONTROLS
// ══════════════════════════════════════════════════════════════════
app.get('/api/remote', async (req, res) => {
  try {
    const limit = Math.min(parseInt(req.query.limit) || 20, 100)
    const rows = await query(
      `SELECT rc.*, u.name AS user_name
       FROM remote_controls rc
       JOIN users u ON rc.user_id = u.id
       ORDER BY rc.sent_at DESC LIMIT ?`,
      [limit]
    )
    res.json(rows)
  } catch (e) {
    res.status(500).json({ error: e.message })
  }
})

// YOLO:Bit polling — lấy lệnh pending mới nhất
app.get('/api/remote/pending', async (req, res) => {
  try {
    const device = req.query.device || null
    const rows = await query(
      `SELECT * FROM remote_controls
       WHERE status = 'pending'
         AND (? IS NULL OR device_target = ?)
       ORDER BY sent_at ASC LIMIT 1`,
      [device, device]
    )
    res.json(rows[0] || null)
  } catch (e) {
    res.status(500).json({ error: e.message })
  }
})

app.post('/api/remote', async (req, res) => {
  try {
    const { user_id, command, payload, device_target } = req.body
    console.log(`⚡ [BACKEND - ĐIỀU KHIỂN] Nhận lệnh [${command}] từ Web gửi xuống thiết bị [${device_target}].`);
    if (!user_id || !command) return res.status(400).json({ error: 'Thiếu user_id hoặc command' })
    const result = await query(
      `INSERT INTO remote_controls (user_id, command, payload, device_target)
       VALUES (?, ?, ?, ?)`,
      [user_id, command, payload ? JSON.stringify(payload) : null, device_target || null]
    )
    res.status(201).json({ id: result.insertId, ok: true })
  } catch (e) {
    console.error('[POST /remote]', e.message)
    res.status(500).json({ error: e.message })
  }
})

// YOLO:Bit xác nhận đã nhận lệnh
app.patch('/api/remote/:id/ack', async (req, res) => {
  try {
    await query(
      `UPDATE remote_controls SET status='acknowledged', acked_at=NOW() WHERE id=?`,
      [req.params.id]
    )
    res.json({ ok: true })
  } catch (e) {
    res.status(500).json({ error: e.message })
  }
})

// ══════════════════════════════════════════════════════════════════
//  SYSTEM BACKUPS
// ══════════════════════════════════════════════════════════════════
app.get('/api/backups', async (req, res) => {
  try {
    const rows = await query(
      `SELECT b.*, u.name AS triggered_by_name
       FROM system_backups b
       LEFT JOIN users u ON b.triggered_by = u.id
       ORDER BY b.created_at DESC LIMIT 50`
    )
    res.json(rows)
  } catch (e) {
    res.status(500).json({ error: e.message })
  }
})

app.post('/api/backups', async (req, res) => {
  try {
    const { backup_type, file_path, file_size_kb, status, triggered_by, note } = req.body
    const result = await query(
      `INSERT INTO system_backups
         (backup_type, file_path, file_size_kb, status, triggered_by, note)
       VALUES (?, ?, ?, ?, ?, ?)`,
      [
        backup_type  || 'database',
        file_path    || '',
        file_size_kb || null,
        status       || 'running',
        triggered_by || null,
        note         || null,
      ]
    )
    res.status(201).json({ id: result.insertId, ok: true })
  } catch (e) {
    res.status(500).json({ error: e.message })
  }
})

// Cập nhật trạng thái backup (running → success/failed)
app.patch('/api/backups/:id', async (req, res) => {
  try {
    const { status, file_size_kb } = req.body
    await query(
      `UPDATE system_backups
       SET status=?, file_size_kb=?, finished_at=NOW()
       WHERE id=?`,
      [status, file_size_kb || null, req.params.id]
    )
    res.json({ ok: true })
  } catch (e) {
    res.status(500).json({ error: e.message })
  }
})

// ══════════════════════════════════════════════════════════════════
//  SECURITY ALERTS
// ══════════════════════════════════════════════════════════════════
app.get('/api/alerts', async (req, res) => {
  try {
    // Mặc định chỉ lấy chưa giải quyết, ?all=1 lấy tất cả
    const all = req.query.all === '1'
    const rows = await query(
      all
        ? `SELECT * FROM security_alerts ORDER BY triggered_at DESC LIMIT 100`
        : `SELECT * FROM v_unresolved_alerts LIMIT 50`
    )
    res.json(rows)
  } catch (e) {
    res.status(500).json({ error: e.message })
  }
})

app.post('/api/alerts', async (req, res) => {
  try {
    const { alert_type, severity, message, related_log_id, related_user_id } = req.body
    const result = await query(
      `INSERT INTO security_alerts
         (alert_type, severity, message, related_log_id, related_user_id)
       VALUES (?, ?, ?, ?, ?)`,
      [alert_type, severity || 'medium', message, related_log_id || null, related_user_id || null]
    )
    res.status(201).json({ id: result.insertId, ok: true })
  } catch (e) {
    res.status(500).json({ error: e.message })
  }
})

// Đánh dấu đã giải quyết
app.patch('/api/alerts/:id/resolve', async (req, res) => {
  try {
    const { resolved_by } = req.body
    await query(
      `UPDATE security_alerts
       SET resolved=1, resolved_by=?, resolved_at=NOW()
       WHERE id=?`,
      [resolved_by || null, req.params.id]
    )
    res.json({ ok: true })
  } catch (e) {
    res.status(500).json({ error: e.message })
  }
})

// ══════════════════════════════════════════════════════════════════
//  CHART DATA — Weekly stats
// ══════════════════════════════════════════════════════════════════
app.get('/api/chart/weekly', async (req, res) => {
  try {
    const rows = await query('SELECT * FROM v_weekly_auth_stats')
    res.json(rows)
  } catch (e) {
    res.status(500).json({ error: e.message })
  }
})

// ══════════════════════════════════════════════════════════════════
//  AUTH TRIGGER — React UI bấm nút → publish Adafruit → Python detect ngay
// ══════════════════════════════════════════════════════════════════
// ══════════════════════════════════════════════════════════════════
//  AUTH TRIGGER — Nhận lệnh ưu tiên từ React UI và đẩy lên Adafruit
// ══════════════════════════════════════════════════════════════════
app.post('/api/auth/trigger', async (req, res) => {
  try {
    const ADAFRUIT_USERNAME = process.env.ADAFRUIT_USERNAME;
    const ADAFRUIT_KEY      = process.env.ADAFRUIT_KEY;
    const AUTH_FEED         = 'yolohome.auth-trigger'; // Đảm bảo Feed này đã được tạo trên Adafruit

    if (!ADAFRUIT_USERNAME || !ADAFRUIT_KEY) {
      return res.status(500).json({ error: 'Thiếu cấu hình ADAFRUIT trong .env' });
    }

    const timestamp = Date.now();
    console.log(`\n🔍 [AUTH TRIGGER] UI yêu cầu xác thực ưu tiên (ts=${timestamp})`);

    // Bắn tín hiệu lên Adafruit IO
    await axios.post(
      `https://io.adafruit.com/api/v2/${ADAFRUIT_USERNAME}/feeds/${AUTH_FEED}/data`,
      { value: timestamp.toString() },
      {
        headers: { 'X-AIO-Key': ADAFRUIT_KEY, 'Content-Type': 'application/json' },
        timeout: 5000,
      }
    );

    res.json({ success: true, message: 'Đã gửi lệnh ưu tiên cho Camera' });
  } catch (e) {
    console.error('[AUTH TRIGGER] ❌ Lỗi:', e.message);
    res.status(500).json({ error: 'Lỗi kết nối tới Broker' });
  }
});

// ══════════════════════════════════════════════════════════════════
//  START
// ══════════════════════════════════════════════════════════════════
app.listen(PORT, () => {
  console.log(`🏠 YOLO Home API → http://localhost:${PORT}`)
  query('SELECT 1')
    .then(() => console.log('✅ MySQL connected'))
    .catch(e => console.error('❌ MySQL error:', e.message))
})