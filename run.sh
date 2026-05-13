#!/usr/bin/env bash
# ═══════════════════════════════════════════════════════════════════
#  YoloHome + Face‑Recognizer — zero‑config launcher
#
#  First time on ANY machine:
#      just setup       (clones face-recognizer, starts MySQL, applies schema, starts both servers)
#  Every time after:
#      just run         (starts MySQL + both servers)
#      just db          (MySQL only)
#      Ctrl+C           (stop servers; MySQL stays up for next run)
#
#  Requirements it checks for you:
#      docker, node, uv, curl
#  Optional:
#      just  (or use: bash run.sh setup)
# ═══════════════════════════════════════════════════════════════════
set -euo pipefail

SCRIPT_DIR="$(cd "$(dirname "${BASH_SOURCE[0]}")" && pwd)"
FACE_RECOGNIZER_DIR="${FACE_RECOGNIZER_DIR:-$SCRIPT_DIR/../face-recognizer}"

# ── Config (override via env vars) ─────────────────────────────────
MYSQL_CONTAINER="${MYSQL_CONTAINER:-yolohome-mysql}"
MYSQL_PORT="${MYSQL_PORT:-3306}"
MYSQL_USER="${MYSQL_USER:-yolo}"
MYSQL_PASS="${MYSQL_PASS:-yolo}"
MYSQL_DB="${MYSQL_DB:-yolo_home}"
FACE_PORT="${FACE_PORT:-8000}"
NODE_PORT="${NODE_PORT:-3001}"

PIDS=()

cleanup() {
  echo ""
  echo "🛑 Stopping servers..."
  for pid in "${PIDS[@]}"; do
    kill "$pid" 2>/dev/null || true
  done
  wait 2>/dev/null || true
  echo "✅ Stopped.  MySQL container '$MYSQL_CONTAINER' is still running."
  echo "   docker stop $MYSQL_CONTAINER   # when you're done"
  exit 0
}
trap cleanup SIGINT SIGTERM

# ── Helpers ──────────────────────────────────────────────────────
red()    { echo -e "\033[31m$*\033[0m"; }
green()  { echo -e "\033[32m$*\033[0m"; }
yellow() { echo -e "\033[33m$*\033[0m"; }

require() {
  command -v "$1" >/dev/null 2>&1 || {
    red "❌ Missing: $1 — install it first"
    case "$1" in
      docker)   echo "   https://docs.docker.com/get-docker/" ;;
      uv)       echo "   curl -LsSf https://astral.sh/uv/install.sh | sh" ;;
      node)     echo "   https://nodejs.org  or  brew install node" ;;
      curl)     echo "   already on macOS;  apt install curl on Linux" ;;
    esac
    exit 1
  }
}

wait_for() {
  local url="$1" label="$2" retries="${3:-45}"
  echo -n "   Waiting for $label "
  for _ in $(seq 1 "$retries"); do
    if curl -sf "$url" >/dev/null 2>&1; then
      green "✓ ready"
      return 0
    fi
    echo -n "."
    sleep 1
  done
  echo ""
  red "   ❌ $label failed to start.  Check logs above."
  return 1
}

# ── Prerequisite checks ──────────────────────────────────────────
check_prereqs() {
  require docker
  require node
  require uv
  require curl

  # Install Node deps if missing
  if [ ! -d "$SCRIPT_DIR/server/node_modules" ]; then
    echo "📦 Installing Node dependencies..."
    (cd "$SCRIPT_DIR/server" && npm install)
  fi
}

# ── MySQL via Docker ─────────────────────────────────────────────
ensure_mysql() {
  # Create .env from template if missing
  if [ ! -f "$SCRIPT_DIR/.env" ]; then
    if [ -f "$SCRIPT_DIR/.env.example" ]; then
      cp "$SCRIPT_DIR/.env.example" "$SCRIPT_DIR/.env"
      green "📝 Created .env from .env.example"
    else
      cat > "$SCRIPT_DIR/.env" <<EOF
DB_HOST=localhost
DB_PORT=$MYSQL_PORT
DB_USER=$MYSQL_USER
DB_PASS=$MYSQL_PASS
DB_NAME=$MYSQL_DB
EOF
      green "📝 Created .env with defaults"
    fi
  fi

  # Already running?
  if docker ps --format '{{.Names}}' 2>/dev/null | grep -qx "$MYSQL_CONTAINER"; then
    yellow "⏭  MySQL already running (container $MYSQL_CONTAINER)"
    return 0
  fi

  echo "🔷 Starting MySQL via Docker..."

  # Remove dead container from a previous run
  docker rm -f "$MYSQL_CONTAINER" 2>/dev/null || true

  docker run -d \
    --name "$MYSQL_CONTAINER" \
    -e MYSQL_ROOT_PASSWORD="$MYSQL_PASS" \
    -e MYSQL_DATABASE="$MYSQL_DB" \
    -e MYSQL_USER="$MYSQL_USER" \
    -e MYSQL_PASSWORD="$MYSQL_PASS" \
    -p "$MYSQL_PORT:3306" \
    mysql:8 \
    --character-set-server=utf8mb4 --collation-server=utf8mb4_unicode_ci

  # Wait for MySQL to accept connections
  echo -n "   Waiting for MySQL "
  for _ in $(seq 1 45); do
    if docker exec "$MYSQL_CONTAINER" mysqladmin ping -u root -p"$MYSQL_PASS" --silent 2>/dev/null; then
      green "✓ ready"
      break
    fi
    echo -n "."
    sleep 2
  done

  # Apply schema
  echo "   Applying schema..."
  docker exec -i "$MYSQL_CONTAINER" mysql -u root -p"$MYSQL_PASS" "$MYSQL_DB" < "$SCRIPT_DIR/server/schema.sql"
  green "   ✅ Schema applied"
}

# ── Face‑Recognizer ──────────────────────────────────────────────
start_face_recognizer() {
  if [ ! -d "$FACE_RECOGNIZER_DIR" ]; then
    yellow "📥 Cloning face-recognizer (first time)..."
    git clone https://github.com/khenm/face-recognizer.git "$FACE_RECOGNIZER_DIR"
    green "   ✅ Cloned"
  fi

  # Install Python deps if missing
  if [ ! -d "$FACE_RECOGNIZER_DIR/.venv" ]; then
    echo "📦 Installing face-recognizer Python dependencies..."
    (cd "$FACE_RECOGNIZER_DIR" && uv sync)
  fi

  echo "🔷 Starting face‑recognizer (port $FACE_PORT)..."
  cd "$FACE_RECOGNIZER_DIR"
  uv run python scripts/serve.py +server.port="$FACE_PORT" &
  PIDS+=($!)
  wait_for "http://localhost:$FACE_PORT/health" "face‑recognizer"
}

# ── YoloHome Node Server ─────────────────────────────────────────
start_node_server() {
  echo "🔷 Starting YoloHome Node server (port $NODE_PORT)..."
  cd "$SCRIPT_DIR/server"
  node index.js &
  PIDS+=($!)
  wait_for "http://localhost:$NODE_PORT/api/users" "YoloHome server"
}

# ── Main ─────────────────────────────────────────────────────────
ACTION="${1:-run}"
case "$ACTION" in
  setup|run)
    check_prereqs
    ensure_mysql
    start_face_recognizer
    start_node_server
    ;;
  db)
    check_prereqs
    ensure_mysql
    green "✅ MySQL ready on localhost:$MYSQL_PORT"
    exit 0
    ;;
  *)
    echo "Usage: bash run.sh [setup|run|db]"
    echo ""
    echo "  setup   first time — install deps, start MySQL, apply schema, start servers"
    echo "  run     start MySQL + both servers (deps must be installed)"
    echo "  db      MySQL only"
    exit 1
    ;;
esac

# ── Summary ───────────────────────────────────────────────────────
echo ""
echo "════════════════════════════════════════════════════════"
echo "  MySQL            →  localhost:$MYSQL_PORT  ($MYSQL_DB)"
echo "  Face‑Recognizer  →  http://localhost:$FACE_PORT"
echo "  YoloHome Server  →  http://localhost:$NODE_PORT"
echo "  Frontend         →  cd frontend && npm run dev"
echo ""
echo "  Ctrl+C stops servers.  MySQL stays up."
echo "  docker stop $MYSQL_CONTAINER   # to stop MySQL"
echo "════════════════════════════════════════════════════════"

wait
