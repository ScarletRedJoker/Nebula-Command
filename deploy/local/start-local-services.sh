#!/bin/bash
# Start Local Ubuntu Services
# Run from: /opt/homelab/HomeLabHub/deploy/local

set -euo pipefail

SCRIPT_DIR="$(cd "$(dirname "${BASH_SOURCE[0]}")" && pwd)"

RED='\033[0;31m'
GREEN='\033[0;32m'
YELLOW='\033[1;33m'
BLUE='\033[0;34m'
CYAN='\033[0;36m'
NC='\033[0m'

print_header() {
    echo ""
    echo -e "${BLUE}═══════════════════════════════════════════════════════════════${NC}"
    echo -e "${BLUE}  $1${NC}"
    echo -e "${BLUE}═══════════════════════════════════════════════════════════════${NC}"
}

print_section() {
    echo ""
    echo -e "${CYAN}━━━ $1 ━━━${NC}"
}

log_ok() { echo -e "  ${GREEN}[OK]${NC} $*"; }
log_wait() { echo -e "  ${YELLOW}[WAIT]${NC} $*"; }
log_warn() { echo -e "  ${YELLOW}[WARN]${NC} $*"; }
log_error() { echo -e "  ${RED}[ERROR]${NC} $*"; }
log_info() { echo -e "  ${CYAN}[INFO]${NC} $*"; }

cd "$SCRIPT_DIR"

print_header "Starting Local Homelab Services"

print_section "Pre-flight Checks"

if [ -x "${SCRIPT_DIR}/scripts/env-doctor.sh" ]; then
    echo "Running environment doctor..."
    if ! "${SCRIPT_DIR}/scripts/env-doctor.sh" --check-only; then
        echo ""
        log_warn "Environment issues detected."
        echo ""
        echo "  To auto-fix fixable issues:"
        echo "    ./scripts/env-doctor.sh --fix"
        echo ""
        echo "  To continue anyway, set: FORCE_START=1"
        echo ""
        if [[ "${FORCE_START:-}" != "1" ]]; then
            read -p "  Continue anyway? [y/N] " -n 1 -r
            echo ""
            if [[ ! $REPLY =~ ^[Yy]$ ]]; then
                exit 1
            fi
        fi
    fi
else
    if [ ! -f ".env" ]; then
        log_info "Creating .env from template..."
        cp .env.example .env
        log_warn ".env created from template - please configure it"
        echo ""
        echo "  Run: ./scripts/env-doctor.sh --fix"
        exit 1
    fi
fi

print_section "NAS Mount Check"

NAS_MOUNT_PATH="/mnt/nas/networkshare"
NAS_ALL_PATH="/mnt/nas/all"

if mountpoint -q "$NAS_ALL_PATH" 2>/dev/null; then
    log_ok "NAS is mounted at $NAS_ALL_PATH"
    
    if [ -L "$NAS_MOUNT_PATH" ]; then
        log_ok "Docker compatibility symlink exists: $NAS_MOUNT_PATH"
    else
        log_warn "Missing symlink: $NAS_MOUNT_PATH -> $NAS_ALL_PATH"
        echo "       Run: sudo ${SCRIPT_DIR}/scripts/setup-nas-mounts.sh"
    fi
    
    for folder in video music photo games; do
        if [ -d "${NAS_MOUNT_PATH}/${folder}" ] || [ -d "${NAS_ALL_PATH}/${folder}" ]; then
            log_ok "Media folder available: ${folder}"
        else
            log_warn "Media folder missing: ${folder}"
        fi
    done
else
    log_warn "NAS not mounted"
    echo "       To set up NAS media for Plex:"
    echo "       sudo ${SCRIPT_DIR}/scripts/setup-nas-mounts.sh"
    echo ""
    echo "       Plex will start but media libraries will be empty."
fi

print_section "Docker Compose"

echo "Pulling latest images..."
if docker compose pull 2>&1; then
    log_ok "Images pulled successfully"
else
    log_warn "Some images may not have pulled correctly (continuing anyway)"
fi

echo ""
echo "Starting services..."
if ! docker compose up -d 2>&1; then
    log_error "Failed to start services"
    exit 1
fi

echo ""
echo "Waiting for services to initialize (15s)..."
sleep 15

print_section "Service Health Checks"

check_http_service() {
    local name=$1
    local url=$2
    local port=$3
    
    if curl -sf "$url" > /dev/null 2>&1; then
        log_ok "$name is running on port $port"
        return 0
    else
        log_wait "$name is still starting..."
        return 1
    fi
}

check_http_service "Plex" "http://localhost:32400/identity" "32400"
check_http_service "MinIO API" "http://localhost:9000/minio/health/live" "9000"
check_http_service "Home Assistant" "http://localhost:8123/" "8123"

NOVNC_PORT="${NOVNC_PORT:-6080}"
if docker compose ps novnc 2>/dev/null | grep -q "running"; then
    check_http_service "noVNC" "http://localhost:${NOVNC_PORT}/" "$NOVNC_PORT" || true
fi

if docker compose ps sunshine 2>/dev/null | grep -q "running"; then
    log_info "Sunshine GameStream container running (use Moonlight client to connect)"
fi

print_section "Container Status"
docker compose ps --format "table {{.Name}}\t{{.Status}}\t{{.Ports}}" 2>/dev/null || docker compose ps

print_header "Access URLs"
echo ""
echo "  Local Access:"
echo "    Plex:           http://localhost:32400/web"
echo "    MinIO Console:  http://localhost:9001"
echo "    Home Assistant: http://localhost:8123"

if docker compose ps novnc 2>/dev/null | grep -q "running"; then
    echo "    noVNC Desktop:  http://localhost:${NOVNC_PORT}"
fi

echo ""
echo "  Via WireGuard from Linode:"
echo "    Plex:           http://10.200.0.2:32400"
echo "    MinIO:          http://10.200.0.2:9000"
echo "    Home Assistant: http://10.200.0.2:8123"

print_header "NAS Media Paths (for Plex libraries)"
echo ""

if mountpoint -q "$NAS_ALL_PATH" 2>/dev/null; then
    echo "  In Plex container, use these paths:"
    echo "    Video:  /nas/video"
    echo "    Music:  /nas/music"
    echo "    Photos: /nas/photo"
    echo "    Games:  /nas/games"
    echo ""
    echo "  On host system:"
    echo "    Video:  ${NAS_MOUNT_PATH}/video"
    echo "    Music:  ${NAS_MOUNT_PATH}/music"
    echo "    Photos: ${NAS_MOUNT_PATH}/photo"
    echo "    Games:  ${NAS_MOUNT_PATH}/games"
else
    echo "  [NAS not mounted]"
    echo ""
    echo "  To mount NAS:"
    echo "    sudo ./scripts/setup-nas-mounts.sh"
fi

echo ""
log_ok "Local services startup complete!"
echo ""
