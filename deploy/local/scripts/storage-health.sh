#!/bin/bash
set -euo pipefail

SCRIPT_DIR="$(cd "$(dirname "${BASH_SOURCE[0]}")" && pwd)"

RED='\033[0;31m'
GREEN='\033[0;32m'
YELLOW='\033[1;33m'
BLUE='\033[0;34m'
CYAN='\033[0;36m'
NC='\033[0m'

REALLOCATED_THRESHOLD=${SMART_THRESHOLD_REALLOCATED:-5}
PENDING_THRESHOLD=${SMART_THRESHOLD_PENDING:-1}
TEMP_WARNING=${SMART_TEMP_WARNING:-50}
TEMP_CRITICAL=${SMART_TEMP_CRITICAL:-60}

EXIT_CODE=0

echo -e "${CYAN}╔══════════════════════════════════════════════════════════════╗${NC}"
echo -e "${CYAN}║           HomeLabHub Storage Health Check                    ║${NC}"
echo -e "${CYAN}╚══════════════════════════════════════════════════════════════╝${NC}"
echo ""
echo "Timestamp: $(date -Iseconds)"
echo ""

check_smart() {
    local device=$1
    local name=$2
    
    echo -e "${BLUE}Checking $name ($device)...${NC}"
    
    if ! command -v smartctl &>/dev/null; then
        echo -e "${YELLOW}  smartctl not installed. Install with: sudo apt install smartmontools${NC}"
        return 1
    fi
    
    if ! sudo smartctl -i "$device" &>/dev/null; then
        echo -e "${YELLOW}  SMART not supported or device not accessible${NC}"
        return 1
    fi
    
    health=$(sudo smartctl -H "$device" 2>/dev/null | grep -i "result" | awk -F: '{print $2}' | xargs)
    
    if [[ "$health" == *"PASSED"* ]]; then
        echo -e "  ${GREEN}✓ SMART Health: PASSED${NC}"
    elif [[ "$health" == *"FAILED"* ]]; then
        echo -e "  ${RED}✗ SMART Health: FAILED${NC}"
        EXIT_CODE=1
    else
        echo -e "  ${YELLOW}? SMART Health: $health${NC}"
    fi
    
    attrs=$(sudo smartctl -A "$device" 2>/dev/null)
    
    reallocated=$(echo "$attrs" | grep -i "Reallocated_Sector" | awk '{print $NF}' || echo "0")
    pending=$(echo "$attrs" | grep -i "Current_Pending_Sector" | awk '{print $NF}' || echo "0")
    temp=$(echo "$attrs" | grep -i "Temperature" | head -1 | awk '{for(i=1;i<=NF;i++) if($i ~ /^[0-9]+$/ && $i < 100) print $i}' | head -1 || echo "")
    hours=$(echo "$attrs" | grep -i "Power_On_Hours" | awk '{print $NF}' || echo "")
    
    reallocated=${reallocated:-0}
    pending=${pending:-0}
    
    if [[ "$reallocated" =~ ^[0-9]+$ ]] && [ "$reallocated" -gt "$REALLOCATED_THRESHOLD" ]; then
        echo -e "  ${RED}✗ Reallocated Sectors: $reallocated (threshold: $REALLOCATED_THRESHOLD)${NC}"
        EXIT_CODE=1
    elif [[ "$reallocated" =~ ^[0-9]+$ ]] && [ "$reallocated" -gt 0 ]; then
        echo -e "  ${YELLOW}! Reallocated Sectors: $reallocated${NC}"
    else
        echo -e "  ${GREEN}✓ Reallocated Sectors: $reallocated${NC}"
    fi
    
    if [[ "$pending" =~ ^[0-9]+$ ]] && [ "$pending" -gt "$PENDING_THRESHOLD" ]; then
        echo -e "  ${RED}✗ Pending Sectors: $pending (threshold: $PENDING_THRESHOLD)${NC}"
        EXIT_CODE=1
    elif [[ "$pending" =~ ^[0-9]+$ ]] && [ "$pending" -gt 0 ]; then
        echo -e "  ${YELLOW}! Pending Sectors: $pending${NC}"
    else
        echo -e "  ${GREEN}✓ Pending Sectors: $pending${NC}"
    fi
    
    if [ -n "$temp" ] && [[ "$temp" =~ ^[0-9]+$ ]]; then
        if [ "$temp" -ge "$TEMP_CRITICAL" ]; then
            echo -e "  ${RED}✗ Temperature: ${temp}°C (CRITICAL)${NC}"
            EXIT_CODE=1
        elif [ "$temp" -ge "$TEMP_WARNING" ]; then
            echo -e "  ${YELLOW}! Temperature: ${temp}°C (WARNING)${NC}"
        else
            echo -e "  ${GREEN}✓ Temperature: ${temp}°C${NC}"
        fi
    fi
    
    if [ -n "$hours" ] && [[ "$hours" =~ ^[0-9]+$ ]]; then
        years=$(echo "scale=1; $hours / 8760" | bc 2>/dev/null || echo "?")
        echo -e "  ${CYAN}ℹ Power-On Hours: $hours (~${years} years)${NC}"
    fi
    
    echo ""
}

check_zfs() {
    echo -e "${BLUE}=== ZFS Pool Status ===${NC}"
    
    if ! command -v zpool &>/dev/null; then
        echo -e "${YELLOW}ZFS not installed${NC}"
        return 0
    fi
    
    if ! zpool list &>/dev/null; then
        echo -e "${YELLOW}No ZFS pools found${NC}"
        return 0
    fi
    
    while read -r pool health; do
        case "$health" in
            ONLINE)
                echo -e "  ${GREEN}✓ Pool $pool: $health${NC}"
                ;;
            DEGRADED)
                echo -e "  ${YELLOW}! Pool $pool: $health${NC}"
                EXIT_CODE=1
                ;;
            FAULTED|OFFLINE|UNAVAIL)
                echo -e "  ${RED}✗ Pool $pool: $health${NC}"
                EXIT_CODE=1
                ;;
            *)
                echo -e "  ${YELLOW}? Pool $pool: $health${NC}"
                ;;
        esac
    done < <(zpool list -H -o name,health 2>/dev/null)
    
    echo ""
}

check_disk_space() {
    echo -e "${BLUE}=== Disk Space ===${NC}"
    
    while read -r filesystem size used avail percent mount; do
        usage=${percent%\%}
        if [ "$usage" -ge 95 ]; then
            echo -e "  ${RED}✗ $mount: $percent used ($avail available)${NC}"
            EXIT_CODE=1
        elif [ "$usage" -ge 85 ]; then
            echo -e "  ${YELLOW}! $mount: $percent used ($avail available)${NC}"
        else
            echo -e "  ${GREEN}✓ $mount: $percent used ($avail available)${NC}"
        fi
    done < <(df -h --output=source,size,used,avail,pcent,target 2>/dev/null | tail -n +2 | grep -v "^tmpfs\|^devtmpfs\|^overlay\|^shm")
    
    echo ""
}

for device in /dev/sd? /dev/nvme?n?; do
    if [ -b "$device" 2>/dev/null ]; then
        model=$(sudo smartctl -i "$device" 2>/dev/null | grep -i "Model" | head -1 | awk -F: '{print $2}' | xargs || echo "$device")
        check_smart "$device" "$model"
    fi
done 2>/dev/null

check_zfs
check_disk_space

echo -e "${CYAN}══════════════════════════════════════════════════════════════${NC}"
if [ $EXIT_CODE -eq 0 ]; then
    echo -e "${GREEN}All storage health checks passed!${NC}"
else
    echo -e "${RED}Some storage health checks failed. Review above for details.${NC}"
fi

exit $EXIT_CODE
