#!/bin/bash
# System Verification Script - Check before acting
# Verifies mounts, drives, and services before any changes
# Run: ./verify-system.sh

set -euo pipefail

RED='\033[0;31m'
GREEN='\033[0;32m'
YELLOW='\033[1;33m'
BLUE='\033[0;34m'
CYAN='\033[0;36m'
NC='\033[0m'

SCRIPT_DIR="$(cd "$(dirname "${BASH_SOURCE[0]}")" && pwd)"

NAS_IP="${NAS_IP:-192.168.0.198}"

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

check_block_devices() {
    print_section "Block Devices"
    
    echo -e "${CYAN}All attached drives:${NC}"
    lsblk -d -o NAME,SIZE,MODEL,TRAN,STATE 2>/dev/null | grep -vE "^(loop|nbd)" || echo "  (none found)"
    
    echo ""
    echo -e "${CYAN}Drives with partitions:${NC}"
    lsblk -o NAME,SIZE,TYPE,FSTYPE,MOUNTPOINT,LABEL 2>/dev/null | grep -vE "(loop|nbd)" | head -30
}

check_mount_status() {
    print_section "Mount Status"
    
    echo -e "${CYAN}Key mount points:${NC}"
    
    local mounts=(
        "/"
        "/home"
        "/srv/media"
        "/opt"
    )
    
    for mount in "${mounts[@]}"; do
        if mountpoint -q "$mount" 2>/dev/null; then
            local source=$(findmnt -n -o SOURCE "$mount" 2>/dev/null)
            local fstype=$(findmnt -n -o FSTYPE "$mount" 2>/dev/null)
            echo -e "  ${GREEN}✓ $mount${NC} ($fstype from $source)"
        elif [[ -d "$mount" ]]; then
            echo -e "  ${YELLOW}○ $mount${NC} (directory exists, not mounted)"
        else
            echo -e "  ${RED}✗ $mount${NC} (does not exist)"
        fi
    done
}

check_nas_status() {
    print_section "NAS Status (ZyXEL NAS326 at ${NAS_IP})"
    
    # Check fstab for NAS entries
    echo -e "${CYAN}NAS entries in fstab:${NC}"
    grep -E "(cifs|smb)" /etc/fstab 2>/dev/null || echo "  (none configured)"
    
    echo ""
    echo -e "${CYAN}Active CIFS/SMB mounts:${NC}"
    mount | grep -E "cifs" 2>/dev/null || echo "  (none active)"
    
    # Check NAS connectivity
    echo ""
    echo -e "${CYAN}NAS connectivity:${NC}"
    if ping -c 1 -W 2 "$NAS_IP" &>/dev/null; then
        echo -e "  ${GREEN}✓ NAS reachable at $NAS_IP${NC}"
    else
        echo -e "  ${RED}✗ NAS unreachable at $NAS_IP${NC}"
    fi
    
    # Check /srv/media mount point
    echo ""
    echo -e "${CYAN}Media mount point (/srv/media):${NC}"
    if [[ -d "/srv/media" ]]; then
        if mountpoint -q "/srv/media" 2>/dev/null; then
            local count=$(timeout 5 ls -A /srv/media 2>/dev/null | wc -l)
            if [[ $count -gt 0 ]]; then
                echo -e "  ${GREEN}✓ /srv/media is mounted with $count items${NC}"
                echo "  Contents:"
                timeout 5 ls -la /srv/media 2>/dev/null | head -8 | sed 's/^/    /'
            else
                echo -e "  ${YELLOW}○ /srv/media is mounted but empty${NC}"
            fi
        else
            local count=$(ls -A /srv/media 2>/dev/null | wc -l)
            if [[ $count -gt 0 ]]; then
                echo -e "  ${YELLOW}○ /srv/media exists with $count items (not a mount point)${NC}"
            else
                echo -e "  ${YELLOW}○ /srv/media exists but is empty (NAS may be offline)${NC}"
            fi
        fi
    else
        echo -e "  ${RED}✗ /srv/media does not exist${NC}"
    fi
}

check_media_paths() {
    print_section "Media Paths for Plex"
    
    echo -e "${CYAN}Checking /srv/media (host) -> /media (container):${NC}"
    
    if [[ -d "/srv/media" ]]; then
        local count=$(timeout 5 ls -A /srv/media 2>/dev/null | wc -l)
        if [[ $count -gt 0 ]]; then
            echo -e "  ${GREEN}✓ /srv/media has $count top-level items${NC}"
            echo ""
            echo -e "${CYAN}User-created subfolders:${NC}"
            for item in /srv/media/*/; do
                if [[ -d "$item" ]]; then
                    local subcount=$(timeout 3 ls -A "$item" 2>/dev/null | wc -l)
                    local name=$(basename "$item")
                    echo -e "    ${GREEN}✓ $name${NC} ($subcount items)"
                fi
            done 2>/dev/null || echo "    (no subfolders or NAS timeout)"
        else
            echo -e "  ${YELLOW}○ /srv/media is empty${NC}"
            echo "    Create your own folders: video, music, photo, etc."
        fi
    else
        echo -e "  ${RED}✗ /srv/media does not exist${NC}"
        echo "    Run: sudo mkdir -p /srv/media && sudo chown 1000:1000 /srv/media"
    fi
}

check_docker_status() {
    print_section "Docker Status"
    
    if ! command -v docker &>/dev/null; then
        echo -e "${YELLOW}Docker not installed${NC}"
        return
    fi
    
    echo -e "${CYAN}Running containers:${NC}"
    docker ps --format "table {{.Names}}\t{{.Status}}\t{{.Ports}}" 2>/dev/null | head -15 || echo "  (cannot list)"
    
    echo ""
    echo -e "${CYAN}Plex container:${NC}"
    if docker ps --format "{{.Names}}" 2>/dev/null | grep -q plex; then
        echo -e "  ${GREEN}✓ Plex is running${NC}"
        echo "  Volume mounts:"
        docker inspect plex --format '{{range .Mounts}}    {{.Source}} -> {{.Destination}}{{"\n"}}{{end}}' 2>/dev/null | head -10
    else
        echo -e "  ${YELLOW}○ Plex is not running${NC}"
    fi
}

check_network() {
    print_section "Network Status"
    
    echo -e "${CYAN}Local IP addresses:${NC}"
    ip -4 addr show | grep inet | grep -v 127.0.0.1 | awk '{print "  " $2 " on " $NF}'
    
    echo ""
    echo -e "${CYAN}Gateway:${NC}"
    local gateway=$(ip route | grep default | awk '{print $3}' | head -1)
    if ping -c 1 -W 1 "$gateway" &>/dev/null; then
        echo -e "  ${GREEN}✓ Gateway reachable at $gateway${NC}"
    else
        echo -e "  ${RED}✗ Gateway unreachable at $gateway${NC}"
    fi
    
    echo ""
    echo -e "${CYAN}Internet:${NC}"
    if ping -c 1 -W 2 8.8.8.8 &>/dev/null; then
        echo -e "  ${GREEN}✓ Internet reachable${NC}"
    else
        echo -e "  ${RED}✗ No internet access${NC}"
    fi
}

check_plex_access() {
    print_section "Plex Server Status"
    
    if curl -s --max-time 5 http://localhost:32400/identity &>/dev/null; then
        echo -e "${GREEN}✓ Plex server is responding on port 32400${NC}"
        curl -s --max-time 5 http://localhost:32400/identity 2>/dev/null | head -3
    else
        echo -e "${YELLOW}○ Plex server not responding on localhost:32400${NC}"
    fi
    
    echo ""
    echo -e "${CYAN}Cloudflare Tunnel status:${NC}"
    if docker ps --format "{{.Names}}" 2>/dev/null | grep -q cloudflared; then
        echo -e "  ${GREEN}✓ Cloudflared container running${NC}"
    else
        echo -e "  ${YELLOW}○ Cloudflared not running${NC}"
    fi
}

check_smart_drives() {
    print_section "Drive Health (Quick)"
    
    if ! command -v smartctl &>/dev/null; then
        echo -e "${YELLOW}smartctl not installed. Run: sudo apt install smartmontools${NC}"
        return
    fi
    
    for device in /dev/sd? /dev/nvme?n?; do
        if [[ -b "$device" ]] 2>/dev/null; then
            local health=$(sudo smartctl -H "$device" 2>/dev/null | grep -i "result" | awk -F: '{print $2}' | xargs)
            local model=$(sudo smartctl -i "$device" 2>/dev/null | grep -i "Model" | head -1 | awk -F: '{print $2}' | xargs)
            
            if [[ "$health" == *"PASSED"* ]]; then
                echo -e "  ${GREEN}✓ $device: $model - PASSED${NC}"
            elif [[ "$health" == *"FAILED"* ]]; then
                echo -e "  ${RED}✗ $device: $model - FAILED${NC}"
            else
                echo -e "  ${YELLOW}? $device: $model - $health${NC}"
            fi
        fi
    done 2>/dev/null
}

show_recommendations() {
    print_header "Recommendations"
    
    echo ""
    echo -e "${CYAN}Based on verification:${NC}"
    echo ""
    
    # Check if NAS is reachable but not mounted
    if ping -c 1 -W 2 "$NAS_IP" &>/dev/null; then
        if ! mountpoint -q /srv/media 2>/dev/null; then
            echo -e "${YELLOW}• NAS is online but not mounted. Try:${NC}"
            echo -e "  sudo mount /srv/media"
            echo ""
        fi
    else
        echo -e "${YELLOW}• NAS at $NAS_IP is not responding.${NC}"
        echo -e "  Check if NAS is powered on and connected to network."
        echo ""
    fi
    
    # Check if mount is configured
    if ! grep -qE "cifs" /etc/fstab 2>/dev/null; then
        echo -e "${YELLOW}• NAS mount not configured in fstab. Run:${NC}"
        echo -e "  sudo ./deploy/local/scripts/setup-nas-resilient.sh"
        echo ""
    fi
    
    # Check Plex
    if ! curl -s --max-time 2 http://localhost:32400/identity &>/dev/null; then
        echo -e "${YELLOW}• Plex not responding. Start with:${NC}"
        echo -e "  docker compose up -d plex"
        echo ""
    fi
    
    # Check media content
    if [[ -d "/srv/media" ]]; then
        local count=$(timeout 3 ls -A /srv/media 2>/dev/null | wc -l)
        if [[ $count -eq 0 ]]; then
            echo -e "${YELLOW}• /srv/media is empty.${NC}"
            echo -e "  Create folders for your media: video, music, photo, etc."
            echo -e "  Plex will see these as /media inside the container."
            echo ""
        fi
    fi
}

main() {
    print_header "System Verification"
    echo "  Timestamp: $(date)"
    echo "  Hostname: $(hostname)"
    
    check_block_devices
    check_mount_status
    check_nas_status
    check_media_paths
    check_network
    check_docker_status
    check_plex_access
    
    if [[ $EUID -eq 0 ]]; then
        check_smart_drives
    else
        echo ""
        echo -e "${YELLOW}Run with sudo for drive health checks${NC}"
    fi
    
    show_recommendations
    
    echo ""
    echo -e "${GREEN}Verification complete.${NC}"
}

main "$@"
