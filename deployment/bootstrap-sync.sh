#!/bin/bash
# Bootstrap script - installs the full sync system
# Run: bash deployment/bootstrap-sync.sh

set -e
cd "$(dirname "$0")/.."
PROJECT_DIR="$(pwd)"

echo "🚀 Installing Replit Auto-Sync System..."

# Create sync-from-replit.sh
cat > deployment/sync-from-replit.sh <<'SYNC_SCRIPT'
#!/bin/bash
set -e
SCRIPT_DIR="$(cd "$(dirname "${BASH_SOURCE[0]}")" && pwd)"
PROJECT_DIR="$(dirname "$SCRIPT_DIR")"
LOG_DIR="$PROJECT_DIR/var/log"
LOG_FILE="$LOG_DIR/replit-sync.log"
mkdir -p "$LOG_DIR"

log() { echo -e "\033[0;32m[$(date +'%Y-%m-%d %H:%M:%S')]\033[0m $1" | tee -a "$LOG_FILE"; }
error() { echo -e "\033[0;31m[$(date +'%Y-%m-%d %H:%M:%S')] ERROR:\033[0m $1" | tee -a "$LOG_FILE"; exit 1; }

cd "$PROJECT_DIR" || { error "Failed to cd to $PROJECT_DIR"; exit 1; }

log "Fetching latest changes..."
git fetch origin main || { error "git fetch failed"; exit 1; }

LOCAL=$(git rev-parse HEAD)
REMOTE=$(git rev-parse origin/main)

if [ "$LOCAL" = "$REMOTE" ]; then
    log "Already up to date"
    exit 0
fi

git merge-base --is-ancestor HEAD origin/main || { error "Branch diverged - manual fix needed"; exit 1; }

PREV_COMMIT="$LOCAL"
log "Syncing to ${REMOTE:0:8}..."
git reset --hard origin/main

CHANGED_FILES=$(git diff --name-only "$PREV_COMMIT" HEAD)

# Determine which services need rebuilding
REBUILD=""
echo "$CHANGED_FILES" | grep -q '^services/dashboard/' && REBUILD="$REBUILD homelab-dashboard"
echo "$CHANGED_FILES" | grep -q '^services/discord-bot/' && REBUILD="$REBUILD discord-bot"
echo "$CHANGED_FILES" | grep -q '^services/stream-bot/' && REBUILD="$REBUILD stream-bot"
echo "$CHANGED_FILES" | grep -q '^services/static-site/' && REBUILD="$REBUILD static-site"
echo "$CHANGED_FILES" | grep -q '^Caddyfile' && REBUILD="$REBUILD caddy"

if [ -n "$REBUILD" ]; then
    log "Rebuilding:$REBUILD"
    for service in $REBUILD; do
        log "  - $service"
        if ! docker-compose -f docker-compose.unified.yml up -d --build --no-deps "$service"; then
            error "Failed to rebuild $service"
        fi
    done
else
    log "No services need rebuilding"
fi

log "✓ Sync complete (${PREV_COMMIT:0:8} → ${REMOTE:0:8})"
SYNC_SCRIPT

# Create manual-sync.sh
cat > deployment/manual-sync.sh <<'MANUAL_SCRIPT'
#!/bin/bash
SCRIPT_DIR="$(cd "$(dirname "${BASH_SOURCE[0]}")" && pwd)"
"$SCRIPT_DIR/sync-from-replit.sh"
MANUAL_SCRIPT

# Create install-auto-sync.sh
cat > deployment/install-auto-sync.sh <<'INSTALL_SCRIPT'
#!/bin/bash
set -e
SCRIPT_DIR="$(cd "$(dirname "${BASH_SOURCE[0]}")" && pwd)"
PROJECT_DIR="$(dirname "$SCRIPT_DIR")"
SYNC_SCRIPT="$PROJECT_DIR/deployment/sync-from-replit.sh"

echo "Installing automatic Replit sync..."
chmod +x "$SYNC_SCRIPT"

sudo tee /etc/systemd/system/replit-sync.service > /dev/null <<EOF
[Unit]
Description=Sync and deploy changes from Replit
After=network.target docker.service

[Service]
Type=oneshot
User=$USER
WorkingDirectory=$PROJECT_DIR
ExecStart=$SYNC_SCRIPT
StandardOutput=journal
StandardError=journal
EOF

sudo tee /etc/systemd/system/replit-sync.timer > /dev/null <<EOF
[Unit]
Description=Auto-sync from Replit every 5 minutes

[Timer]
OnBootSec=2min
OnUnitActiveSec=5min
AccuracySec=1s

[Install]
WantedBy=timers.target
EOF

echo "Enabling systemd timer..."
sudo systemctl daemon-reload
sudo systemctl enable replit-sync.timer
sudo systemctl start replit-sync.timer

mkdir -p "$PROJECT_DIR/var/log" "$PROJECT_DIR/var/state"

echo ""
echo "✅ Auto-sync installed successfully!"
echo ""
echo "The system will now check for Replit changes every 5 minutes and auto-deploy."
echo ""
echo "Useful commands:"
echo "  - Check status:  sudo systemctl status replit-sync.timer"
echo "  - View logs:     journalctl -u replit-sync.service -f"
echo "  - Manual sync:   ./deployment/sync-from-replit.sh"
echo ""
INSTALL_SCRIPT

chmod +x deployment/*.sh

echo ""
echo "✅ Sync scripts created successfully!"
echo ""
echo "To install auto-sync (runs every 5 minutes):"
echo "  cd $PROJECT_DIR && ./deployment/install-auto-sync.sh"
echo ""
echo "To manually sync now:"
echo "  cd $PROJECT_DIR && ./deployment/manual-sync.sh"
echo ""
