#!/bin/bash
set -euo pipefail

# NAS Resilient Mount Setup for ZyXEL NAS326
# Mounts single SMB share "networkshare" via CIFS to /srv/media
# User creates their own subfolders (video, music, photo, etc.)

NAS_IP="${NAS_IP:-192.168.0.198}"
NAS_SHARE="networkshare"
MOUNT_POINT="/srv/media"

RED='\033[0;31m'
GREEN='\033[0;32m'
YELLOW='\033[1;33m'
NC='\033[0m'

log_info() { echo -e "${GREEN}[INFO]${NC} $1"; }
log_warn() { echo -e "${YELLOW}[WARN]${NC} $1"; }
log_error() { echo -e "${RED}[ERROR]${NC} $1"; }

check_root() {
    if [[ $EUID -ne 0 ]]; then
        log_error "This script must be run as root (sudo)"
        exit 1
    fi
}

create_directories() {
    log_info "Creating mount point directory..."
    
    mkdir -p "${MOUNT_POINT}"
    chown 1000:1000 "${MOUNT_POINT}"
    
    log_info "Created mount point at ${MOUNT_POINT}"
}

install_cifs_utils() {
    if ! command -v mount.cifs &> /dev/null; then
        log_info "Installing CIFS utilities..."
        apt-get update && apt-get install -y cifs-utils
    else
        log_info "CIFS utilities already installed"
    fi
}

setup_fstab() {
    log_info "Configuring /etc/fstab for CIFS mount..."
    
    # Backup fstab
    cp /etc/fstab /etc/fstab.backup.$(date +%Y%m%d%H%M%S)
    
    # Remove any existing NAS entries
    sed -i "/${NAS_IP}/d" /etc/fstab
    sed -i '/\/srv\/media.*cifs/d' /etc/fstab
    sed -i '/\/mnt\/nas/d' /etc/fstab
    
    # Add new CIFS mount entry
    echo "//${NAS_IP}/${NAS_SHARE} ${MOUNT_POINT} cifs guest,uid=1000,gid=1000,vers=3.0,_netdev,nofail 0 0" >> /etc/fstab
    
    log_info "Added fstab entry for //${NAS_IP}/${NAS_SHARE} -> ${MOUNT_POINT}"
}

create_systemd_mount() {
    log_info "Creating systemd mount unit for CIFS..."
    
    # Create systemd mount unit (escaped path: srv-media.mount)
    cat > /etc/systemd/system/srv-media.mount << EOF
[Unit]
Description=ZyXEL NAS326 networkshare (CIFS)
After=network-online.target
Wants=network-online.target
DefaultDependencies=no

[Mount]
What=//${NAS_IP}/${NAS_SHARE}
Where=${MOUNT_POINT}
Type=cifs
Options=guest,uid=1000,gid=1000,vers=3.0,_netdev,nofail,soft,timeo=30
TimeoutSec=60

[Install]
WantedBy=multi-user.target
EOF

    # Create automount unit for on-demand mounting
    cat > /etc/systemd/system/srv-media.automount << EOF
[Unit]
Description=ZyXEL NAS326 networkshare Automount
After=network-online.target
ConditionPathExists=${MOUNT_POINT}

[Automount]
Where=${MOUNT_POINT}
TimeoutIdleSec=300
DirectoryMode=0755

[Install]
WantedBy=multi-user.target
EOF

    systemctl daemon-reload
    systemctl enable srv-media.automount
    
    log_info "Systemd mount units created and enabled"
}

create_watchdog() {
    log_info "Creating NAS mount watchdog..."
    
    cat > /usr/local/bin/nas-watchdog.sh << 'WATCHDOG'
#!/bin/bash
# NAS Mount Watchdog - Detects and recovers stale CIFS mounts

MOUNT_PATH="/srv/media"
LOG_FILE="/var/log/nas-watchdog.log"
DISCORD_WEBHOOK="${STORAGE_ALERT_DISCORD_WEBHOOK:-}"

log() {
    echo "$(date '+%Y-%m-%d %H:%M:%S') $1" >> "$LOG_FILE"
}

send_alert() {
    local message="$1"
    log "ALERT: $message"
    
    if [[ -n "$DISCORD_WEBHOOK" ]]; then
        curl -s -X POST -H "Content-Type: application/json" \
            -d "{\"content\":\"🚨 NAS Alert: $message\"}" \
            "$DISCORD_WEBHOOK" > /dev/null 2>&1
    fi
}

check_mount() {
    # Use timeout to prevent hanging on stale mount
    if timeout 5 stat "$MOUNT_PATH" > /dev/null 2>&1; then
        return 0
    else
        return 1
    fi
}

recover_mount() {
    log "Attempting to recover stale NAS mount..."
    
    # Force lazy unmount to clear stale state
    umount -l "$MOUNT_PATH" 2>/dev/null || true
    
    # Wait briefly
    sleep 2
    
    # Remount via systemd
    systemctl restart srv-media.automount 2>/dev/null || true
    
    # Or try direct mount
    mount -a 2>/dev/null || true
    
    log "Mount recovery attempted"
}

# Main check
if ! check_mount; then
    send_alert "NAS mount stale or offline - recovering"
    recover_mount
fi
WATCHDOG

    chmod +x /usr/local/bin/nas-watchdog.sh
    
    # Create systemd timer for watchdog (runs every 2 minutes)
    cat > /etc/systemd/system/nas-watchdog.service << EOF
[Unit]
Description=NAS Mount Watchdog

[Service]
Type=oneshot
ExecStart=/usr/local/bin/nas-watchdog.sh
EOF

    cat > /etc/systemd/system/nas-watchdog.timer << EOF
[Unit]
Description=Run NAS watchdog every 2 minutes

[Timer]
OnBootSec=60
OnUnitActiveSec=120
AccuracySec=30

[Install]
WantedBy=timers.target
EOF

    systemctl daemon-reload
    systemctl enable nas-watchdog.timer
    systemctl start nas-watchdog.timer
    
    log_info "Watchdog timer installed and started"
}

cleanup_old_mounts() {
    log_info "Cleaning up old NFS mount configurations..."
    
    # Stop and disable old services if they exist
    systemctl stop mnt-nas-all.automount 2>/dev/null || true
    systemctl disable mnt-nas-all.automount 2>/dev/null || true
    systemctl stop srv-media-bind.service 2>/dev/null || true
    systemctl disable srv-media-bind.service 2>/dev/null || true
    
    # Remove old systemd units
    rm -f /etc/systemd/system/mnt-nas-all.mount
    rm -f /etc/systemd/system/mnt-nas-all.automount
    rm -f /etc/systemd/system/srv-media-bind.service
    rm -f /usr/local/bin/nas-bind-mounts.sh
    
    # Unmount old mount points
    umount -l /mnt/nas/all 2>/dev/null || true
    umount -l /mnt/nas/video 2>/dev/null || true
    umount -l /mnt/nas/music 2>/dev/null || true
    umount -l /mnt/nas/photo 2>/dev/null || true
    umount -l /mnt/nas/games 2>/dev/null || true
    
    systemctl daemon-reload
    
    log_info "Old configurations cleaned up"
}

test_mount() {
    log_info "Testing NAS mount..."
    
    # Try to mount
    if mount "${MOUNT_POINT}" 2>/dev/null || mount -a 2>/dev/null; then
        if timeout 10 ls "${MOUNT_POINT}" > /dev/null 2>&1; then
            log_info "NAS mount successful!"
            local count=$(ls -A "${MOUNT_POINT}" 2>/dev/null | wc -l)
            log_info "Found ${count} items in ${MOUNT_POINT}"
            return 0
        fi
    fi
    
    log_warn "NAS not currently available (this is OK - system will work without it)"
    log_warn "The mount will activate when NAS comes online"
    return 0
}

main() {
    log_info "=== ZyXEL NAS326 CIFS Mount Setup ==="
    log_info "NAS IP: ${NAS_IP}"
    log_info "Share: ${NAS_SHARE}"
    log_info "Mount Point: ${MOUNT_POINT}"
    
    check_root
    install_cifs_utils
    cleanup_old_mounts
    create_directories
    setup_fstab
    create_systemd_mount
    create_watchdog
    test_mount
    
    echo ""
    log_info "=== Setup Complete ==="
    echo ""
    echo "Configuration:"
    echo "  NAS: //${NAS_IP}/${NAS_SHARE}"
    echo "  Mount: ${MOUNT_POINT}"
    echo "  Protocol: CIFS/SMB 3.0 (guest access)"
    echo ""
    echo "Mount will auto-activate on access or at boot."
    echo "Create your own folders inside /srv/media (video, music, photo, etc.)"
    echo ""
    echo "Docker containers should use:"
    echo "  /srv/media:/media"
    echo ""
    echo "Plex sees /media inside the container."
    echo "Point libraries to wherever you want inside /media."
}

main "$@"
