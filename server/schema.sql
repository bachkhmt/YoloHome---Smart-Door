-- ════════════════════════════════════════════════════════════════════
--  YOLO Home — MySQL Schema  (v3 — final)
--  Workbench: File → Open SQL Script → Execute All (Ctrl+Shift+Enter)
--  Terminal:  mysql -u root -p < server/schema.sql
-- ════════════════════════════════════════════════════════════════════

CREATE DATABASE IF NOT EXISTS yolo_home
  CHARACTER SET utf8mb4
  COLLATE utf8mb4_unicode_ci;

USE yolo_home;

-- Tắt FK tạm thời để DROP không bị lỗi thứ tự
SET FOREIGN_KEY_CHECKS = 0;

DROP VIEW  IF EXISTS v_dashboard_summary;
DROP VIEW  IF EXISTS v_unresolved_alerts;
DROP VIEW  IF EXISTS v_access_log_full;
DROP VIEW  IF EXISTS v_weekly_auth_stats;
DROP TABLE IF EXISTS security_alerts;
DROP TABLE IF EXISTS remote_controls;
DROP TABLE IF EXISTS access_logs;
DROP TABLE IF EXISTS door_state;
DROP TABLE IF EXISTS sensor_readings;
DROP TABLE IF EXISTS system_backups;
DROP TABLE IF EXISTS users;

SET FOREIGN_KEY_CHECKS = 1;

-- ══════════════════════════════════════════════════════════════════
--  1. USERS
-- ══════════════════════════════════════════════════════════════════
CREATE TABLE users (
  id             INT          AUTO_INCREMENT PRIMARY KEY,
  name           VARCHAR(100) NOT NULL,
  role           ENUM('Owner','Family','Guest','Admin') NOT NULL DEFAULT 'Guest',
  seed           VARCHAR(100) NOT NULL COMMENT 'Avatar seed cho DiceBear',
  online         TINYINT(1)   NOT NULL DEFAULT 1  COMMENT '1=active, 0=disabled',
  face_enrolled  TINYINT(1)   NOT NULL DEFAULT 0  COMMENT '1=đã đăng ký khuôn mặt',
  voice_enrolled TINYINT(1)   NOT NULL DEFAULT 0  COMMENT '1=đã đăng ký giọng nói',
  created_at     TIMESTAMP    NOT NULL DEFAULT CURRENT_TIMESTAMP,
  updated_at     TIMESTAMP    NOT NULL DEFAULT CURRENT_TIMESTAMP ON UPDATE CURRENT_TIMESTAMP,
  INDEX idx_role   (role),
  INDEX idx_online (online)
) COMMENT = 'Danh sách người dùng được phép truy cập';

INSERT INTO users (name, role, seed, online, face_enrolled, voice_enrolled) VALUES
  ('Nguyễn Văn An', 'Owner',  'AnOwner',  1, 1, 1),
  ('Trần Thị Bích', 'Family', 'BichFam',  1, 1, 0),
  ('Lê Minh Đức',   'Guest',  'DucGuest', 0, 0, 0),
  ('Admin',         'Admin',  'AdminSys', 1, 0, 0);

-- ══════════════════════════════════════════════════════════════════
--  2. ACCESS_LOGS
-- ══════════════════════════════════════════════════════════════════
CREATE TABLE access_logs (
  id          INT          AUTO_INCREMENT PRIMARY KEY,
  user_id     INT          NULL           COMMENT 'NULL nếu không nhận ra người dùng',
  user_name   VARCHAR(100) NOT NULL DEFAULT 'Không xác định' COMMENT 'Snapshot tên lúc ghi log',
  method      VARCHAR(50)  NOT NULL DEFAULT 'Face' COMMENT 'Face, Voice, Manual, PIN',
  action      VARCHAR(50)  NOT NULL DEFAULT 'Vào',
  success     TINYINT(1)   NOT NULL DEFAULT 0,
  fail_reason VARCHAR(200) NULL,
  latency_ms  SMALLINT UNSIGNED NULL     COMMENT 'Thời gian xác thực (ms)',
  ip_address  VARCHAR(45)  NULL,
  created_at  TIMESTAMP    NOT NULL DEFAULT CURRENT_TIMESTAMP,
  CONSTRAINT fk_log_user
    FOREIGN KEY (user_id) REFERENCES users(id)
    ON DELETE SET NULL ON UPDATE CASCADE,
  INDEX idx_log_user    (user_id),
  INDEX idx_log_success (success),
  INDEX idx_log_created (created_at)
) COMMENT = 'Lịch sử mọi lần xác thực';

INSERT INTO access_logs (user_id, user_name, method, action, success, latency_ms) VALUES
  (1, 'Nguyễn Văn An',   'Face',   'Vào', 1, 142),
  (2, 'Trần Thị Bích',   'Face',   'Vào', 1,  98),
  (NULL, 'Không xác định','Face',  'Thử', 0, 201),
  (3, 'Lê Minh Đức',     'Voice',  'Vào', 1, 115),
  (NULL, 'Không xác định','Voice', 'Thử', 0, 176);

-- ══════════════════════════════════════════════════════════════════
--  3. DOOR_STATE
-- ══════════════════════════════════════════════════════════════════
CREATE TABLE door_state (
  id         INT        AUTO_INCREMENT PRIMARY KEY,
  locked     TINYINT(1) NOT NULL DEFAULT 1 COMMENT '1=khóa, 0=mở',
  changed_by INT        NULL               COMMENT 'user_id thực hiện thay đổi',
  source     ENUM('dashboard','yolobit','auto','schedule') NOT NULL DEFAULT 'dashboard',
  changed_at TIMESTAMP  NOT NULL DEFAULT CURRENT_TIMESTAMP,
  CONSTRAINT fk_door_user
    FOREIGN KEY (changed_by) REFERENCES users(id)
    ON DELETE SET NULL ON UPDATE CASCADE,
  INDEX idx_door_changed (changed_at),
  INDEX idx_door_user    (changed_by)
) COMMENT = 'Lịch sử trạng thái khóa/mở cửa';

INSERT INTO door_state (locked, changed_by, source) VALUES (1, 4, 'auto');

-- ══════════════════════════════════════════════════════════════════
--  4. SENSOR_READINGS
-- ══════════════════════════════════════════════════════════════════
CREATE TABLE sensor_readings (
  id         INT          AUTO_INCREMENT PRIMARY KEY,
  temp       FLOAT        NOT NULL COMMENT 'Nhiệt độ °C',
  hum        FLOAT        NOT NULL COMMENT 'Độ ẩm %',
  light      FLOAT        NOT NULL COMMENT 'Ánh sáng lux',
  device_id  VARCHAR(50)  NULL     COMMENT 'MAC address hoặc tên thiết bị',
  created_at TIMESTAMP    NOT NULL DEFAULT CURRENT_TIMESTAMP,
  INDEX idx_sensor_created (created_at),
  INDEX idx_sensor_device  (device_id)
) COMMENT = 'Dữ liệu cảm biến theo thời gian';

-- ══════════════════════════════════════════════════════════════════
--  5. REMOTE_CONTROLS
-- ══════════════════════════════════════════════════════════════════
CREATE TABLE remote_controls (
  id            INT        AUTO_INCREMENT PRIMARY KEY,
  user_id       INT        NOT NULL COMMENT 'Ai gửi lệnh',
  command       ENUM('unlock','lock','fan_speed','led_color','reboot') NOT NULL,
  payload       JSON       NULL    COMMENT 'VD: {"speed":72} hoặc {"color":"#ec4899"}',
  status        ENUM('pending','sent','acknowledged','failed') NOT NULL DEFAULT 'pending',
  device_target VARCHAR(50) NULL   COMMENT 'MAC hoặc tên thiết bị đích',
  sent_at       TIMESTAMP  NOT NULL DEFAULT CURRENT_TIMESTAMP,
  acked_at      TIMESTAMP  NULL    COMMENT 'Thời điểm YOLO:Bit xác nhận',
  CONSTRAINT fk_remote_user
    FOREIGN KEY (user_id) REFERENCES users(id)
    ON DELETE CASCADE ON UPDATE CASCADE,
  INDEX idx_remote_user   (user_id),
  INDEX idx_remote_status (status),
  INDEX idx_remote_sent   (sent_at)
) COMMENT = 'Lịch sử lệnh điều khiển từ xa';

-- ══════════════════════════════════════════════════════════════════
--  6. SYSTEM_BACKUPS
-- ══════════════════════════════════════════════════════════════════
CREATE TABLE system_backups (
  id           INT          AUTO_INCREMENT PRIMARY KEY,
  backup_type  ENUM('database','config','full') NOT NULL DEFAULT 'database',
  file_path    VARCHAR(500) NOT NULL COMMENT 'Đường dẫn file backup',
  file_size_kb BIGINT UNSIGNED NULL  COMMENT 'Kích thước file (KB)',
  status       ENUM('running','success','failed') NOT NULL DEFAULT 'running',
  triggered_by INT          NULL     COMMENT 'user_id kích hoạt, NULL=tự động',
  note         TEXT         NULL,
  created_at   TIMESTAMP    NOT NULL DEFAULT CURRENT_TIMESTAMP,
  finished_at  TIMESTAMP    NULL     COMMENT 'Thời điểm hoàn tất',
  CONSTRAINT fk_backup_user
    FOREIGN KEY (triggered_by) REFERENCES users(id)
    ON DELETE SET NULL ON UPDATE CASCADE,
  INDEX idx_backup_status  (status),
  INDEX idx_backup_created (created_at)
) COMMENT = 'Lịch sử sao lưu hệ thống';

-- ══════════════════════════════════════════════════════════════════
--  7. SECURITY_ALERTS
-- ══════════════════════════════════════════════════════════════════
CREATE TABLE security_alerts (
  id              INT          AUTO_INCREMENT PRIMARY KEY,
  alert_type      ENUM(
    'multiple_fail',
    'unknown_face',
    'door_forced',
    'offline_breach',
    'system_error'
  ) NOT NULL,
  severity        ENUM('low','medium','high','critical') NOT NULL DEFAULT 'medium',
  message         VARCHAR(500) NOT NULL,
  related_log_id  INT          NULL COMMENT 'access_log gây ra cảnh báo',
  related_user_id INT          NULL COMMENT 'Người dùng liên quan nếu biết',
  resolved        TINYINT(1)   NOT NULL DEFAULT 0,
  resolved_by     INT          NULL,
  resolved_at     TIMESTAMP    NULL,
  triggered_at    TIMESTAMP    NOT NULL DEFAULT CURRENT_TIMESTAMP,
  CONSTRAINT fk_alert_log
    FOREIGN KEY (related_log_id) REFERENCES access_logs(id)
    ON DELETE SET NULL ON UPDATE CASCADE,
  CONSTRAINT fk_alert_user
    FOREIGN KEY (related_user_id) REFERENCES users(id)
    ON DELETE SET NULL ON UPDATE CASCADE,
  CONSTRAINT fk_alert_resolver
    FOREIGN KEY (resolved_by) REFERENCES users(id)
    ON DELETE SET NULL ON UPDATE CASCADE,
  INDEX idx_alert_type      (alert_type),
  INDEX idx_alert_severity  (severity),
  INDEX idx_alert_resolved  (resolved),
  INDEX idx_alert_triggered (triggered_at)
) COMMENT = 'Cảnh báo bảo mật và sự kiện bất thường';

-- ══════════════════════════════════════════════════════════════════
--  VIEWS
-- ══════════════════════════════════════════════════════════════════

-- Thống kê xác thực 7 ngày — dùng subquery tránh lỗi only_full_group_by
CREATE OR REPLACE VIEW v_weekly_auth_stats AS
SELECT
  log_date,
  ELT(DAYOFWEEK(log_date), 'CN','T2','T3','T4','T5','T6','T7') AS day_name,
  total,
  success_count,
  fail_count,
  avg_latency_ms
FROM (
  SELECT
    DATE(created_at)          AS log_date,
    COUNT(*)                  AS total,
    SUM(success = 1)          AS success_count,
    SUM(success = 0)          AS fail_count,
    ROUND(AVG(latency_ms), 0) AS avg_latency_ms
  FROM access_logs
  WHERE created_at >= DATE_SUB(CURDATE(), INTERVAL 7 DAY)
  GROUP BY DATE(created_at)
) AS grouped
ORDER BY log_date;

-- Lịch sử truy cập kèm thông tin người dùng
CREATE OR REPLACE VIEW v_access_log_full AS
SELECT
  al.id,
  al.user_name,
  al.method,
  al.action,
  al.success,
  al.fail_reason,
  al.latency_ms,
  al.ip_address,
  al.created_at,
  u.role   AS user_role,
  u.online AS user_active
FROM access_logs al
LEFT JOIN users u ON al.user_id = u.id;

-- Cảnh báo chưa giải quyết, ưu tiên theo mức độ nghiêm trọng
CREATE OR REPLACE VIEW v_unresolved_alerts AS
SELECT
  sa.id,
  sa.alert_type,
  sa.severity,
  sa.message,
  sa.triggered_at,
  u.name AS related_user_name
FROM security_alerts sa
LEFT JOIN users u ON sa.related_user_id = u.id
WHERE sa.resolved = 0
ORDER BY
  FIELD(sa.severity, 'critical','high','medium','low'),
  sa.triggered_at DESC;

-- Tổng quan dashboard — 1 dòng duy nhất
CREATE OR REPLACE VIEW v_dashboard_summary AS
SELECT
  (SELECT locked     FROM door_state    ORDER BY id DESC LIMIT 1) AS door_locked,
  (SELECT COUNT(*)   FROM users         WHERE online = 1)          AS active_users,
  (SELECT COUNT(*)   FROM access_logs   WHERE DATE(created_at) = CURDATE()) AS today_total,
  (SELECT SUM(success=1) FROM access_logs WHERE DATE(created_at) = CURDATE()) AS today_success,
  (SELECT SUM(success=0) FROM access_logs WHERE DATE(created_at) = CURDATE()) AS today_fail,
  (SELECT COUNT(*)   FROM security_alerts WHERE resolved = 0)      AS open_alerts;