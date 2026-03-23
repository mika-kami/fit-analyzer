#!/bin/bash
set -e

GREEN='\033[0;32m'; YELLOW='\033[1;33m'; RED='\033[0;31m'; NC='\033[0m'; BOLD='\033[1m'
ok()  { echo -e "       ${GREEN}OK${NC}"; }
err() { echo -e "  ${RED}[ERROR]${NC} $1"; }

echo ""
echo "  ============================================"
echo -e "   ${BOLD}FIT Analyzer — Starting...${NC}"
echo "  ============================================"
echo ""

cd "$(dirname "$0")"

# ── Find Python 3.8+ ──────────────────────────────────────────────────────────
echo -e "  ${BOLD}[1/4] Checking Python...${NC}"
PYTHON=""
for cmd in python3 python3.12 python3.11 python3.10 python3.9 python3.8 python; do
    if command -v "$cmd" &>/dev/null; then
        VER=$("$cmd" -c "import sys; print(sys.version_info >= (3,8))" 2>/dev/null)
        if [ "$VER" = "True" ]; then
            PYTHON="$cmd"
            break
        fi
    fi
done

if [ -z "$PYTHON" ]; then
    err "Python 3.8+ not found."
    echo "       Install: https://www.python.org/downloads/"
    echo "       Or: brew install python"
    exit 1
fi
echo "       Using: $($PYTHON --version) → $(which $PYTHON)"
ok

# ── Check Node.js ─────────────────────────────────────────────────────────────
echo -e "  ${BOLD}[2/4] Checking Node.js...${NC}"
if ! command -v node &>/dev/null; then
    err "Node.js not found."
    echo "       Install: https://nodejs.org/"
    exit 1
fi
echo "       Using: $(node --version)"
ok

# ── Node dependencies ─────────────────────────────────────────────────────────
echo -e "  ${BOLD}[3/4] Node dependencies...${NC}"
if [ ! -d "node_modules" ]; then
    npm install --silent
fi
ok

# ── Start Garmin bridge (handles its own pip deps) ────────────────────────────
echo -e "  ${BOLD}[4/4] Starting Garmin bridge (port 8765)...${NC}"
"$PYTHON" garmin_server.py &
GARMIN_PID=$!
sleep 2

if ! kill -0 "$GARMIN_PID" 2>/dev/null; then
    err "Garmin bridge failed to start."
    exit 1
fi
ok

cleanup() {
    echo ""
    echo "  Stopping Garmin bridge..."
    kill "$GARMIN_PID" 2>/dev/null || true
    echo "  Done."
}
trap cleanup EXIT INT TERM

(sleep 3 && open "http://localhost:5173" 2>/dev/null || true) &

echo ""
echo "  ============================================"
echo -e "   App:    ${GREEN}http://localhost:5173${NC}"
echo -e "   Garmin: ${GREEN}http://localhost:8765${NC}"
echo ""
echo "   Press Ctrl+C to stop."
echo "  ============================================"
echo ""

npm run dev
