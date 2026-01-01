#!/bin/bash
# Daily cleanup script for disk space management
# Add to crontab: 0 3 * * * /opt/homelab/HomeLabHub/deploy/local/scripts/daily-cleanup.sh

set -e

LOG_FILE="/var/log/homelab-cleanup.log"
DAYS_TO_KEEP_LOGS=7
DAYS_TO_KEEP_DOWNLOADS=30

log() {
    echo "[$(date '+%Y-%m-%d %H:%M:%S')] $1" | tee -a "$LOG_FILE"
}

log "=== Starting daily cleanup ==="

# Docker cleanup - remove unused images, containers, networks, build cache
log "Cleaning Docker..."
docker system prune -af --volumes 2>/dev/null || true
DOCKER_FREED=$(docker system df --format "{{.Reclaimable}}" 2>/dev/null | head -1 || echo "unknown")
log "Docker cleanup complete. Reclaimable space was: $DOCKER_FREED"

# Clean old container logs (Docker logs can get huge)
log "Truncating large container logs..."
find /var/lib/docker/containers -name "*.log" -size +100M -exec truncate -s 50M {} \; 2>/dev/null || true

# Clean systemd journal logs older than 7 days
log "Cleaning journal logs..."
journalctl --vacuum-time=${DAYS_TO_KEEP_LOGS}d 2>/dev/null || true

# Clean old log files in /var/log
log "Cleaning old log files..."
find /var/log -name "*.gz" -mtime +${DAYS_TO_KEEP_LOGS} -delete 2>/dev/null || true
find /var/log -name "*.old" -mtime +${DAYS_TO_KEEP_LOGS} -delete 2>/dev/null || true
find /var/log -name "*.[0-9]" -mtime +${DAYS_TO_KEEP_LOGS} -delete 2>/dev/null || true

# Clean apt cache
log "Cleaning apt cache..."
apt-get clean 2>/dev/null || true
apt-get autoremove -y 2>/dev/null || true

# Clean temp files
log "Cleaning temp files..."
find /tmp -type f -mtime +1 -delete 2>/dev/null || true
find /var/tmp -type f -mtime +7 -delete 2>/dev/null || true

# Clean completed torrent downloads older than 30 days (optional - comment out if unwanted)
if [ -d "/srv/media/downloads" ]; then
    log "Cleaning old downloads (>${DAYS_TO_KEEP_DOWNLOADS} days)..."
    find /srv/media/downloads -type f -mtime +${DAYS_TO_KEEP_DOWNLOADS} -delete 2>/dev/null || true
    find /srv/media/downloads -type d -empty -delete 2>/dev/null || true
fi

# Report disk usage
log "Current disk usage:"
df -h / /srv/media 2>/dev/null | tee -a "$LOG_FILE" || df -h / | tee -a "$LOG_FILE"

log "=== Cleanup complete ==="

# Keep cleanup log small
tail -1000 "$LOG_FILE" > "$LOG_FILE.tmp" && mv "$LOG_FILE.tmp" "$LOG_FILE" 2>/dev/null || true
