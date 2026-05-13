-- ════════════════════════════════════════════════════════════════════
--  YOLO Home — MySQL Schema  (v4 — face-recognizer microservice)
--  Apply: mysql -u root -p < server/schema.sql
-- ════════════════════════════════════════════════════════════════════

CREATE DATABASE IF NOT EXISTS yolo_home
  CHARACTER SET utf8mb4
  COLLATE utf8mb4_unicode_ci;

USE yolo_home;

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
  seed           VARCHAR(100) NOT NULL COMMENT 'DiceBear avatar seed',
  online         TINYINT(1)   NOT NULL DEFAULT 1  COMMENT '1=active, 0=disabled',
  face_enrolled  TINYINT(1)   NOT NULL DEFAULT 0  COMMENT '1=face registered in face-recognizer',
  voice_enrolled TINYINT(1)   NOT NULL DEFAULT 0  COMMENT '1=voice registered',
  created_at     TIMESTAMP    NOT NULL DEFAULT CURRENT_TIMESTAMP,
  updated_at     TIMESTAMP    NOT NULL DEFAULT CURRENT_TIMESTAMP ON UPDATE CURRENT_TIMESTAMP,
  INDEX idx_role   (role),
  INDEX idx_online (online)
) COMMENT = 'Authorized users';

INSERT INTO users (name, role, seed, online, face_enrolled, voice_enrolled) VALUES
  ('Alice Johnson',  'Owner',  'AliceO',   1, 0, 1),
  ('Bob Williams',   'Family', 'BobFam',   1, 0, 0),
  ('Carol Davis',    'Guest',  'CarolG',   0, 0, 0),
  ('Admin',          'Admin',  'AdminSys', 1, 0, 0);

-- ══════════════════════════════════════════════════════════════════
--  2. ACCESS_LOGS
-- ══════════════════════════════════════════════════════════════════
CREATE TABLE access_logs (
  id          INT          AUTO_INCREMENT PRIMARY KEY,
  user_id     INT          NULL           COMMENT 'NULL if user not recognized',
  user_name   VARCHAR(100) NOT NULL DEFAULT 'Unknown' COMMENT 'Name snapshot at log time',
  method      VARCHAR(50)  NOT NULL DEFAULT 'Face' COMMENT 'Face, Voice, Manual, PIN',
  action      VARCHAR(50)  NOT NULL DEFAULT 'Enter',
  success     TINYINT(1)   NOT NULL DEFAULT 0,
  fail_reason VARCHAR(200) NULL,
  latency_ms  SMALLINT UNSIGNED NULL     COMMENT 'Auth latency (ms)',
  ip_address  VARCHAR(45)  NULL,
  created_at  TIMESTAMP    NOT NULL DEFAULT CURRENT_TIMESTAMP,
  CONSTRAINT fk_log_user
    FOREIGN KEY (user_id) REFERENCES users(id)
    ON DELETE SET NULL ON UPDATE CASCADE,
  INDEX idx_log_user    (user_id),
  INDEX idx_log_success (success),
  INDEX idx_log_created (created_at)
) COMMENT = 'Authentication history';

INSERT INTO access_logs (user_id, user_name, method, action, success, latency_ms) VALUES
  (1, 'Alice Johnson',  'Face',  'Enter',    1, 142),
  (2, 'Bob Williams',   'Face',  'Enter',    1,  98),
  (NULL, 'Unknown',     'Face',  'Attempt',  0, 201),
  (3, 'Carol Davis',    'Voice', 'Enter',    1, 115),
  (NULL, 'Unknown',     'Voice', 'Attempt',  0, 176);

-- ══════════════════════════════════════════════════════════════════
--  3. DOOR_STATE
-- ══════════════════════════════════════════════════════════════════
CREATE TABLE door_state (
  id         INT        AUTO_INCREMENT PRIMARY KEY,
  locked     TINYINT(1) NOT NULL DEFAULT 1 COMMENT '1=locked, 0=unlocked',
  changed_by INT        NULL               COMMENT 'user_id that made the change',
  source     ENUM('dashboard','yolobit','auto','schedule') NOT NULL DEFAULT 'dashboard',
  changed_at TIMESTAMP  NOT NULL DEFAULT CURRENT_TIMESTAMP,
  CONSTRAINT fk_door_user
    FOREIGN KEY (changed_by) REFERENCES users(id)
    ON DELETE SET NULL ON UPDATE CASCADE,
  INDEX idx_door_changed (changed_at),
  INDEX idx_door_user    (changed_by)
) COMMENT = 'Door lock/unlock history';

INSERT INTO door_state (locked, changed_by, source) VALUES (1, 4, 'auto');

-- ══════════════════════════════════════════════════════════════════
--  4. SENSOR_READINGS
-- ══════════════════════════════════════════════════════════════════
CREATE TABLE sensor_readings (
  id         INT          AUTO_INCREMENT PRIMARY KEY,
  temp       FLOAT        NOT NULL COMMENT 'Temperature °C',
  hum        FLOAT        NOT NULL COMMENT 'Humidity %',
  light      FLOAT        NOT NULL COMMENT 'Ambient light lux',
  device_id  VARCHAR(50)  NULL     COMMENT 'MAC address or device name',
  created_at TIMESTAMP    NOT NULL DEFAULT CURRENT_TIMESTAMP,
  INDEX idx_sensor_created (created_at),
  INDEX idx_sensor_device  (device_id)
) COMMENT = 'Sensor data over time';

-- ══════════════════════════════════════════════════════════════════
--  5. REMOTE_CONTROLS
-- ══════════════════════════════════════════════════════════════════
CREATE TABLE remote_controls (
  id            INT        AUTO_INCREMENT PRIMARY KEY,
  user_id       INT        NOT NULL COMMENT 'Who sent the command',
  command       ENUM('unlock','lock','fan_speed','led_color','reboot') NOT NULL,
  payload       JSON       NULL    COMMENT 'e.g. {"speed":72} or {"color":"#ec4899"}',
  status        ENUM('pending','sent','acknowledged','failed') NOT NULL DEFAULT 'pending',
  device_target VARCHAR(50) NULL   COMMENT 'Target device MAC or name',
  sent_at       TIMESTAMP  NOT NULL DEFAULT CURRENT_TIMESTAMP,
  acked_at      TIMESTAMP  NULL    COMMENT 'When YOLO:Bit acknowledged',
  CONSTRAINT fk_remote_user
    FOREIGN KEY (user_id) REFERENCES users(id)
    ON DELETE CASCADE ON UPDATE CASCADE,
  INDEX idx_remote_user   (user_id),
  INDEX idx_remote_status (status),
  INDEX idx_remote_sent   (sent_at)
) COMMENT = 'Remote command history';

-- ══════════════════════════════════════════════════════════════════
--  6. SYSTEM_BACKUPS
-- ══════════════════════════════════════════════════════════════════
CREATE TABLE system_backups (
  id           INT          AUTO_INCREMENT PRIMARY KEY,
  backup_type  ENUM('database','config','full') NOT NULL DEFAULT 'database',
  file_path    VARCHAR(500) NOT NULL COMMENT 'Backup file path',
  file_size_kb BIGINT UNSIGNED NULL  COMMENT 'File size (KB)',
  status       ENUM('running','success','failed') NOT NULL DEFAULT 'running',
  triggered_by INT          NULL     COMMENT 'user_id that triggered, NULL=auto',
  note         TEXT         NULL,
  created_at   TIMESTAMP    NOT NULL DEFAULT CURRENT_TIMESTAMP,
  finished_at  TIMESTAMP    NULL     COMMENT 'Completion time',
  CONSTRAINT fk_backup_user
    FOREIGN KEY (triggered_by) REFERENCES users(id)
    ON DELETE SET NULL ON UPDATE CASCADE,
  INDEX idx_backup_status  (status),
  INDEX idx_backup_created (created_at)
) COMMENT = 'System backup history';

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
  related_log_id  INT          NULL COMMENT 'Access log that triggered the alert',
  related_user_id INT          NULL COMMENT 'Related user if known',
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
) COMMENT = 'Security alerts and anomalous events';

-- ══════════════════════════════════════════════════════════════════
--  VIEWS
-- ══════════════════════════════════════════════════════════════════

-- Weekly auth stats — 7-day rolling
CREATE OR REPLACE VIEW v_weekly_auth_stats AS
SELECT
  log_date,
  ELT(DAYOFWEEK(log_date), 'Sun','Mon','Tue','Wed','Thu','Fri','Sat') AS day_name,
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

-- Access log with user details
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

-- Unresolved alerts, ordered by severity
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

-- Dashboard summary — single row
CREATE OR REPLACE VIEW v_dashboard_summary AS
SELECT
  (SELECT locked     FROM door_state    ORDER BY id DESC LIMIT 1) AS door_locked,
  (SELECT COUNT(*)   FROM users         WHERE online = 1)          AS active_users,
  (SELECT COUNT(*)   FROM access_logs   WHERE DATE(created_at) = CURDATE()) AS today_total,
  (SELECT SUM(success=1) FROM access_logs WHERE DATE(created_at) = CURDATE()) AS today_success,
  (SELECT SUM(success=0) FROM access_logs WHERE DATE(created_at) = CURDATE()) AS today_fail,
  (SELECT COUNT(*)   FROM security_alerts WHERE resolved = 0)      AS open_alerts;
