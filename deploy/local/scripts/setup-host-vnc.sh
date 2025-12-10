#!/bin/bash
set -euo pipefail

# Setup x11vnc + noVNC for Ubuntu Host Desktop Access
# This gives you web-based remote access to your actual Ubuntu desktop

RED='\033[0;31m'
GREEN='\033[0;32m'
YELLOW='\033[1;33m'
NC='\033[0m'

log_info() { echo -e "${GREEN}[INFO]${NC} $1"; }
log_warn() { echo -e "${YELLOW}[WARN]${NC} $1"; }
log_error() { echo -e "${RED}[ERROR]${NC} $1"; }

VNC_PORT="${VNC_PORT:-5900}"
NOVNC_PORT="${NOVNC_PORT:-6080}"
VNC_PASSWORD="${VNC_PASSWORD:-}"

check_root() {
    if [[ $EUID -ne 0 ]]; then
        log_error "This script must be run as root (sudo)"
        exit 1
    fi
}

install_packages() {
    log_info "Installing x11vnc and noVNC..."
    apt-get update
    apt-get install -y x11vnc novnc python3-websockify
}

setup_vnc_password() {
    if [[ -z "$VNC_PASSWORD" ]]; then
        log_warn "No VNC_PASSWORD set in environment"
        log_info "Set VNC_PASSWORD in your .env file for security"
        log_info "Continuing without password (insecure for remote access)"
        return
    fi
    
    log_info "Setting VNC password..."
    mkdir -p /home/${SUDO_USER:-evin}/.vnc
    x11vnc -storepasswd "$VNC_PASSWORD" /home/${SUDO_USER:-evin}/.vnc/passwd
    chown -R ${SUDO_USER:-evin}:${SUDO_USER:-evin} /home/${SUDO_USER:-evin}/.vnc
}

create_x11vnc_service() {
    log_info "Creating x11vnc systemd service..."
    
    cat > /etc/systemd/system/x11vnc.service << EOF
[Unit]
Description=x11vnc - VNC Server for Host Desktop
After=graphical.target
Wants=graphical.target

[Service]
Type=simple
User=${SUDO_USER:-evin}
Environment=DISPLAY=:0
ExecStart=/usr/bin/x11vnc -display :0 -forever -shared -noxdamage -rfbport ${VNC_PORT} -rfbauth /home/${SUDO_USER:-evin}/.vnc/passwd -o /var/log/x11vnc.log
Restart=on-failure
RestartSec=5

[Install]
WantedBy=multi-user.target
EOF

    # If no password file, run without auth (local only)
    if [[ ! -f /home/${SUDO_USER:-evin}/.vnc/passwd ]]; then
        sed -i 's/-rfbauth [^ ]*//' /etc/systemd/system/x11vnc.service
    fi

    systemctl daemon-reload
    systemctl enable x11vnc
}

create_novnc_service() {
    log_info "Creating noVNC web service..."
    
    cat > /etc/systemd/system/novnc.service << EOF
[Unit]
Description=noVNC - Web-based VNC Client
After=x11vnc.service
Wants=x11vnc.service

[Service]
Type=simple
User=${SUDO_USER:-evin}
ExecStart=/usr/bin/websockify --web=/usr/share/novnc ${NOVNC_PORT} localhost:${VNC_PORT}
Restart=on-failure
RestartSec=5

[Install]
WantedBy=multi-user.target
EOF

    systemctl daemon-reload
    systemctl enable novnc
}

start_services() {
    log_info "Starting VNC services..."
    systemctl start x11vnc || log_warn "x11vnc failed to start (may need active display)"
    systemctl start novnc || log_warn "noVNC failed to start"
}

show_status() {
    echo ""
    log_info "=== Setup Complete ==="
    echo ""
    echo "Services:"
    echo "  x11vnc: $(systemctl is-active x11vnc 2>/dev/null || echo 'inactive')"
    echo "  noVNC:  $(systemctl is-active novnc 2>/dev/null || echo 'inactive')"
    echo ""
    echo "Access your Ubuntu desktop at:"
    echo "  Local:     http://localhost:${NOVNC_PORT}/vnc.html"
    echo "  Tailscale: http://100.110.227.25:${NOVNC_PORT}/vnc.html"
    echo "  VNC:       vnc://localhost:${VNC_PORT}"
    echo ""
    echo "Note: x11vnc requires an active graphical session (login screen or desktop)"
    echo ""
    echo "Commands:"
    echo "  sudo systemctl start x11vnc novnc    # Start services"
    echo "  sudo systemctl stop x11vnc novnc     # Stop services"
    echo "  sudo systemctl status x11vnc novnc   # Check status"
}

main() {
    log_info "=== Ubuntu Host Desktop VNC Setup ==="
    
    check_root
    install_packages
    setup_vnc_password
    create_x11vnc_service
    create_novnc_service
    start_services
    show_status
}

main "$@"
