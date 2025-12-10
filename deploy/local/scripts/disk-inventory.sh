#!/bin/bash
set -euo pipefail

SCRIPT_DIR="$(cd "$(dirname "${BASH_SOURCE[0]}")" && pwd)"
source "${SCRIPT_DIR}/colors.sh" 2>/dev/null || true

RED='\033[0;31m'
GREEN='\033[0;32m'
YELLOW='\033[1;33m'
BLUE='\033[0;34m'
CYAN='\033[0;36m'
NC='\033[0m'

echo -e "${CYAN}╔══════════════════════════════════════════════════════════════╗${NC}"
echo -e "${CYAN}║           HomeLabHub Disk Inventory                          ║${NC}"
echo -e "${CYAN}╚══════════════════════════════════════════════════════════════╝${NC}"
echo ""

echo -e "${BLUE}=== Block Devices ===${NC}"
lsblk -o NAME,SIZE,TYPE,FSTYPE,MOUNTPOINT,MODEL 2>/dev/null || echo "lsblk not available"
echo ""

echo -e "${BLUE}=== Disk Information by ID ===${NC}"
if [ -d /dev/disk/by-id ]; then
    ls -la /dev/disk/by-id/ 2>/dev/null | grep -E "(ata|scsi|nvme|usb)" | head -20 || echo "No disks found by ID"
else
    echo "No /dev/disk/by-id directory"
fi
echo ""

echo -e "${BLUE}=== SMART-Capable Devices ===${NC}"
for device in /dev/sd? /dev/nvme?n? 2>/dev/null; do
    if [ -b "$device" ]; then
        model=$(smartctl -i "$device" 2>/dev/null | grep -i "model" | head -1 || echo "Unknown")
        health=$(smartctl -H "$device" 2>/dev/null | grep -i "result" || echo "SMART not available")
        echo -e "${GREEN}$device${NC}: $model"
        echo "  Health: $health"
    fi
done 2>/dev/null || echo "No SMART devices found or smartctl not installed"
echo ""

echo -e "${BLUE}=== ZFS Pools ===${NC}"
if command -v zpool &>/dev/null; then
    zpool list 2>/dev/null || echo "No ZFS pools found"
    echo ""
    zpool status 2>/dev/null || true
else
    echo "ZFS not installed"
fi
echo ""

echo -e "${BLUE}=== Mount Points ===${NC}"
df -h --type=ext4 --type=xfs --type=zfs --type=btrfs --type=ntfs --type=vfat 2>/dev/null || df -h 2>/dev/null
echo ""

echo -e "${BLUE}=== NAS Mounts ===${NC}"
mount | grep -E "(nfs|cifs|smb)" || echo "No NAS mounts detected"
echo ""

echo -e "${BLUE}=== RAID Arrays ===${NC}"
if [ -f /proc/mdstat ]; then
    cat /proc/mdstat
else
    echo "No software RAID (mdadm) detected"
fi
echo ""

echo -e "${GREEN}Inventory complete.${NC}"
