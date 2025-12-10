#!/bin/bash
# Hardened NAS Mount Setup - Never blocks boot, graceful failures
# Run: sudo ./setup-nas-mounts-hardened.sh
#
# This script creates non-blocking NAS mounts that:
# - Never hang the boot process if NAS is offline
# - Use automount for on-demand mounting
# - Have aggressive timeouts to fail fast
# - Support both NFS and SMB with fallback

set -euo pipefail

SCRIPT_DIR="$(cd "$(dirname "${BASH_SOURCE[0]}")" && pwd)"
DEPLOY_DIR="$(dirname "$SCRIPT_DIR")"

RED='\033[0;31m'
GREEN='\033[0;32m'
YELLOW='\033[1;33m'
BLUE='\033[0;34m'
CYAN='\033[0;36m'
NC='\033[0m'

# Configuration
NAS_IP=${NAS_HOST:-}
NAS_USER=${NAS_USER:-guest}
NAS_PASS=${NAS_PASSWORD:-}
MOUNT_BASE="/mnt/nas"
MEDIA_BASE="/media"

# Mount options for non-blocking behavior
NFS_OPTS="nfsvers=4,soft,timeo=30,retrans=2,bg,noauto,x-systemd.automount,x-systemd.device-timeout=10s,x-systemd.mount-timeout=15s,_netdev,nofail"
SMB_OPTS="username=${NAS_USER},password=${NAS_PASS},uid=1000,gid=1000,iocharset=utf8,vers=3.0,soft,noauto,x-systemd.automount,x-systemd.device-timeout=10s,x-systemd.mount-timeout=15s,_netdev,nofail"

print_header() {
    echo ""
    echo -e "${CYAN}╔══════════════════════════════════════════════════════════════╗${NC}"
    echo -e "${CYAN}║  $1${NC}"
    echo -e "${CYAN}╚══════════════════════════════════════════════════════════════╝${NC}"
}

print_section() {
    echo ""
    echo -e "${BLUE}━━━ $1 ━━━${NC}"
}

check_root() {
    if [[ $EUID -ne 0 ]]; then
        echo -e "${RED}This script must be run as root (sudo)${NC}"
        exit 1
    fi
}

load_env() {
    if [[ -f "${DEPLOY_DIR}/.env" ]]; then
        echo -e "${CYAN}Loading environment from ${DEPLOY_DIR}/.env${NC}"
        set -a
        source "${DEPLOY_DIR}/.env"
        set +a
        NAS_IP=${NAS_HOST:-$NAS_IP}
        NAS_USER=${NAS_USER:-guest}
        NAS_PASS=${NAS_PASSWORD:-}
    fi
}

discover_nas() {
    print_section "NAS Discovery"
    
    if [[ -n "$NAS_IP" ]]; then
        echo -e "${GREEN}Using configured NAS: $NAS_IP${NC}"
        return 0
    fi
    
    echo -e "${YELLOW}No NAS_HOST configured. Scanning network...${NC}"
    
    # Get local network
    local gateway=$(ip route | grep default | awk '{print $3}' | head -1)
    local network=$(echo "$gateway" | sed 's/\.[0-9]*$/.0\/24/')
    
    echo "  Scanning $network for NAS devices..."
    
    # Try common NAS ports
    local found=""
    for ip in $(seq 1 254); do
        local target="${gateway%.*}.$ip"
        # Quick ping + port check
        if timeout 0.5 bash -c "echo >/dev/tcp/$target/5000" 2>/dev/null; then
            echo -e "  ${GREEN}Found potential NAS at $target (port 5000 - Synology)${NC}"
            found=$target
            break
        elif timeout 0.5 bash -c "echo >/dev/tcp/$target/445" 2>/dev/null; then
            echo -e "  ${GREEN}Found potential NAS at $target (port 445 - SMB)${NC}"
            found=$target
        elif timeout 0.5 bash -c "echo >/dev/tcp/$target/2049" 2>/dev/null; then
            echo -e "  ${GREEN}Found potential NAS at $target (port 2049 - NFS)${NC}"
            found=$target
        fi
    done 2>/dev/null
    
    if [[ -n "$found" ]]; then
        NAS_IP=$found
        echo -e "${GREEN}Using discovered NAS: $NAS_IP${NC}"
    else
        echo -e "${RED}No NAS found. Please set NAS_HOST in .env${NC}"
        return 1
    fi
}

check_nas_reachable() {
    print_section "NAS Connectivity Check"
    
    if ping -c 1 -W 2 "$NAS_IP" &>/dev/null; then
        echo -e "${GREEN}✓ NAS is reachable at $NAS_IP${NC}"
        return 0
    else
        echo -e "${YELLOW}! NAS is currently offline at $NAS_IP${NC}"
        echo -e "${CYAN}  Mounts will be configured but won't activate until NAS is online${NC}"
        return 1
    fi
}

detect_protocol() {
    print_section "Protocol Detection"
    
    local has_nfs=false
    local has_smb=false
    
    if timeout 2 bash -c "echo >/dev/tcp/$NAS_IP/2049" 2>/dev/null; then
        has_nfs=true
        echo -e "${GREEN}✓ NFS available (port 2049)${NC}"
    fi
    
    if timeout 2 bash -c "echo >/dev/tcp/$NAS_IP/445" 2>/dev/null; then
        has_smb=true
        echo -e "${GREEN}✓ SMB available (port 445)${NC}"
    fi
    
    if $has_nfs; then
        echo "nfs"
    elif $has_smb; then
        echo "smb"
    else
        echo "none"
    fi
}

install_deps() {
    print_section "Installing Dependencies"
    
    local missing=()
    
    if ! dpkg -l | grep -q nfs-common; then
        missing+=("nfs-common")
    fi
    
    if ! dpkg -l | grep -q cifs-utils; then
        missing+=("cifs-utils")
    fi
    
    if [[ ${#missing[@]} -gt 0 ]]; then
        echo -e "${YELLOW}Installing: ${missing[*]}${NC}"
        apt-get update -qq
        apt-get install -y -qq "${missing[@]}"
    else
        echo -e "${GREEN}✓ All dependencies installed${NC}"
    fi
}

backup_fstab() {
    local backup="/etc/fstab.backup.$(date +%Y%m%d_%H%M%S)"
    cp /etc/fstab "$backup"
    echo -e "${CYAN}Backed up fstab to $backup${NC}"
}

create_mount_points() {
    print_section "Creating Mount Points"
    
    local dirs=(
        "${MOUNT_BASE}/networkshare"
        "${MEDIA_BASE}/movies"
        "${MEDIA_BASE}/shows"
        "${MEDIA_BASE}/music"
        "${MEDIA_BASE}/photo"
    )
    
    for dir in "${dirs[@]}"; do
        if [[ ! -d "$dir" ]]; then
            mkdir -p "$dir"
            echo -e "  ${GREEN}Created $dir${NC}"
        else
            echo -e "  ${CYAN}Exists: $dir${NC}"
        fi
    done
    
    # Set ownership
    chown -R 1000:1000 "${MOUNT_BASE}" "${MEDIA_BASE}" 2>/dev/null || true
}

configure_nfs_mounts() {
    print_section "Configuring NFS Mounts (Non-Blocking)"
    
    local share="${NAS_IP}:/volume1/networkshare"
    local mount_point="${MOUNT_BASE}/networkshare"
    
    # Remove old entries
    sed -i "\|${mount_point}|d" /etc/fstab
    
    # Add new non-blocking entry
    echo "# NAS Mount - Auto-mount on access, never blocks boot" >> /etc/fstab
    echo "${share} ${mount_point} nfs ${NFS_OPTS} 0 0" >> /etc/fstab
    
    echo -e "${GREEN}✓ Added NFS mount with non-blocking options${NC}"
    echo -e "  ${CYAN}Options: ${NFS_OPTS}${NC}"
}

configure_smb_mounts() {
    print_section "Configuring SMB Mounts (Non-Blocking)"
    
    local share="//${NAS_IP}/networkshare"
    local mount_point="${MOUNT_BASE}/networkshare"
    
    # Create credentials file securely
    local creds_file="/etc/nas-credentials"
    cat > "$creds_file" << EOF
username=${NAS_USER}
password=${NAS_PASS}
EOF
    chmod 600 "$creds_file"
    
    # SMB options with credentials file
    local smb_opts="credentials=${creds_file},uid=1000,gid=1000,iocharset=utf8,vers=3.0,soft,noauto,x-systemd.automount,x-systemd.device-timeout=10s,x-systemd.mount-timeout=15s,_netdev,nofail"
    
    # Remove old entries
    sed -i "\|${mount_point}|d" /etc/fstab
    
    # Add new non-blocking entry
    echo "# NAS Mount - Auto-mount on access, never blocks boot" >> /etc/fstab
    echo "${share} ${mount_point} cifs ${smb_opts} 0 0" >> /etc/fstab
    
    echo -e "${GREEN}✓ Added SMB mount with non-blocking options${NC}"
    echo -e "  ${CYAN}Credentials stored in ${creds_file}${NC}"
}

create_media_symlinks() {
    print_section "Creating Media Symlinks"
    
    local nas_base="${MOUNT_BASE}/networkshare"
    
    # Create symlinks from /media to NAS
    local links=(
        "${MEDIA_BASE}/movies:${nas_base}/movies"
        "${MEDIA_BASE}/shows:${nas_base}/shows"  
        "${MEDIA_BASE}/music:${nas_base}/music"
        "${MEDIA_BASE}/photo:${nas_base}/photo"
    )
    
    for link_spec in "${links[@]}"; do
        local link="${link_spec%%:*}"
        local target="${link_spec#*:}"
        
        # Remove existing directory/link
        if [[ -L "$link" ]]; then
            rm "$link"
        elif [[ -d "$link" ]] && [[ -z "$(ls -A "$link" 2>/dev/null)" ]]; then
            rmdir "$link"
        fi
        
        # Create symlink
        ln -sf "$target" "$link"
        echo -e "  ${GREEN}$link -> $target${NC}"
    done
}

reload_mounts() {
    print_section "Reloading Mount Configuration"
    
    systemctl daemon-reload
    
    # Try to mount (will use automount if NAS offline)
    mount -a 2>/dev/null || true
    
    echo -e "${GREEN}✓ Mount configuration reloaded${NC}"
}

verify_mounts() {
    print_section "Mount Verification"
    
    echo -e "${CYAN}Current NAS mounts:${NC}"
    mount | grep -E "(${MOUNT_BASE}|${MEDIA_BASE})" || echo "  (none active)"
    
    echo ""
    echo -e "${CYAN}Automount units:${NC}"
    systemctl list-units --type=automount 2>/dev/null | grep -E "(nas|media)" || echo "  (checking...)"
    
    # Test access (will trigger automount)
    if [[ -d "${MOUNT_BASE}/networkshare" ]]; then
        if ls "${MOUNT_BASE}/networkshare" &>/dev/null; then
            echo -e "${GREEN}✓ NAS accessible at ${MOUNT_BASE}/networkshare${NC}"
        else
            echo -e "${YELLOW}! NAS configured but not currently accessible${NC}"
        fi
    fi
}

show_summary() {
    print_header "Configuration Summary"
    
    echo ""
    echo -e "${GREEN}Mounts are configured with these safety features:${NC}"
    echo "  • noauto - Not mounted at boot"
    echo "  • x-systemd.automount - Mounts on first access"
    echo "  • x-systemd.device-timeout=10s - Fast timeout"
    echo "  • x-systemd.mount-timeout=15s - Mount operation timeout"
    echo "  • soft - NFS fails gracefully instead of hanging"
    echo "  • nofail - Boot continues even if mount fails"
    echo "  • _netdev - Waits for network before trying"
    echo ""
    echo -e "${CYAN}Your system will NEVER hang on boot due to NAS being offline.${NC}"
    echo ""
    echo -e "${YELLOW}To test:${NC}"
    echo "  1. Power off NAS"
    echo "  2. Reboot this machine"
    echo "  3. System should boot in < 30 seconds"
    echo "  4. Power on NAS"
    echo "  5. Access /media/movies to trigger automount"
}

main() {
    print_header "Hardened NAS Mount Setup"
    
    check_root
    load_env
    
    if ! discover_nas; then
        echo -e "${RED}Cannot proceed without NAS configuration.${NC}"
        echo -e "Set NAS_HOST in ${DEPLOY_DIR}/.env"
        exit 1
    fi
    
    install_deps
    backup_fstab
    create_mount_points
    
    local protocol=$(detect_protocol)
    check_nas_reachable || true  # Continue even if offline
    
    case "$protocol" in
        nfs)
            configure_nfs_mounts
            ;;
        smb)
            configure_smb_mounts
            ;;
        *)
            echo -e "${YELLOW}Could not detect NAS protocol. Configuring for SMB...${NC}"
            configure_smb_mounts
            ;;
    esac
    
    create_media_symlinks
    reload_mounts
    verify_mounts
    show_summary
    
    echo ""
    echo -e "${GREEN}Setup complete!${NC}"
}

main "$@"
