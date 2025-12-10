#!/bin/bash
# Drive Diagnostic Script - Safe, non-destructive drive analysis
# Usage: sudo ./diagnose-drive.sh [device]
# Example: sudo ./diagnose-drive.sh /dev/sda

set -euo pipefail

RED='\033[0;31m'
GREEN='\033[0;32m'
YELLOW='\033[1;33m'
BLUE='\033[0;34m'
CYAN='\033[0;36m'
NC='\033[0m'

DEVICE=${1:-}
LOG_DIR="/var/log/homelab"
TIMESTAMP=$(date +%Y%m%d_%H%M%S)

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

install_deps() {
    local missing=()
    
    command -v smartctl &>/dev/null || missing+=("smartmontools")
    command -v hdparm &>/dev/null || missing+=("hdparm")
    
    if [[ ${#missing[@]} -gt 0 ]]; then
        echo -e "${YELLOW}Installing required tools: ${missing[*]}${NC}"
        apt-get update -qq
        apt-get install -y -qq "${missing[@]}"
    fi
}

list_drives() {
    print_header "Available Drives"
    echo ""
    echo -e "${YELLOW}Select a drive to diagnose:${NC}"
    echo ""
    
    lsblk -d -o NAME,SIZE,MODEL,TRAN,STATE 2>/dev/null | grep -E "^(NAME|sd|nvme|hd)"
    
    echo ""
    echo -e "Usage: ${GREEN}sudo $0 /dev/sdX${NC}"
    echo ""
    echo -e "${YELLOW}WARNING: Only diagnose drives you understand. Never run on system drive without backup.${NC}"
}

validate_device() {
    if [[ ! -b "$DEVICE" ]]; then
        echo -e "${RED}Error: $DEVICE is not a valid block device${NC}"
        list_drives
        exit 1
    fi
    
    # Check if it's the system drive
    local root_dev=$(findmnt -n -o SOURCE / | sed 's/[0-9]*$//')
    if [[ "$DEVICE" == "$root_dev" ]]; then
        echo -e "${RED}WARNING: $DEVICE appears to be your system drive!${NC}"
        echo -e "${YELLOW}Are you absolutely sure you want to diagnose it? [y/N]${NC}"
        read -r response
        if [[ ! "$response" =~ ^[Yy]$ ]]; then
            echo "Aborted."
            exit 1
        fi
    fi
}

check_smart_support() {
    print_section "SMART Support Check"
    
    local smart_info=$(smartctl -i "$DEVICE" 2>&1)
    
    if echo "$smart_info" | grep -q "SMART support is: Available"; then
        echo -e "${GREEN}✓ SMART is available on this drive${NC}"
        
        if echo "$smart_info" | grep -q "SMART support is: Enabled"; then
            echo -e "${GREEN}✓ SMART is enabled${NC}"
        else
            echo -e "${YELLOW}! SMART is available but not enabled${NC}"
            echo -e "  Enabling SMART..."
            smartctl -s on "$DEVICE" 2>/dev/null || true
        fi
        return 0
    else
        echo -e "${YELLOW}! SMART not supported on this device${NC}"
        return 1
    fi
}

get_drive_info() {
    print_section "Drive Information"
    
    smartctl -i "$DEVICE" 2>/dev/null | grep -E "(Model|Serial|Capacity|Rotation|Form Factor|SATA|Device)" | head -10
    
    echo ""
    hdparm -I "$DEVICE" 2>/dev/null | grep -E "(Model|Serial|size|speed)" | head -5 || true
}

check_smart_health() {
    print_section "SMART Health Assessment"
    
    local health=$(smartctl -H "$DEVICE" 2>&1)
    
    if echo "$health" | grep -q "PASSED"; then
        echo -e "${GREEN}✓ SMART Health Status: PASSED${NC}"
    elif echo "$health" | grep -q "FAILED"; then
        echo -e "${RED}✗ SMART Health Status: FAILED - DRIVE MAY BE FAILING${NC}"
        echo -e "${RED}  BACKUP DATA IMMEDIATELY IF POSSIBLE${NC}"
    else
        echo -e "${YELLOW}? SMART Health Status: Unknown${NC}"
        echo "$health"
    fi
}

check_smart_attributes() {
    print_section "Critical SMART Attributes"
    
    local attrs=$(smartctl -A "$DEVICE" 2>/dev/null)
    
    echo "$attrs" | head -7
    echo ""
    
    # Check critical attributes
    local reallocated=$(echo "$attrs" | grep -i "Reallocated_Sector" | awk '{print $NF}')
    local pending=$(echo "$attrs" | grep -i "Current_Pending_Sector" | awk '{print $NF}')
    local uncorrectable=$(echo "$attrs" | grep -i "Offline_Uncorrectable" | awk '{print $NF}')
    local crc_errors=$(echo "$attrs" | grep -i "UDMA_CRC_Error" | awk '{print $NF}')
    local temp=$(echo "$attrs" | grep -i "Temperature" | head -1 | awk '{for(i=1;i<=NF;i++) if($i ~ /^[0-9]+$/ && $i < 100) print $i}' | head -1)
    local hours=$(echo "$attrs" | grep -i "Power_On_Hours" | awk '{print $NF}')
    
    echo -e "${CYAN}Key Metrics:${NC}"
    
    # Reallocated sectors
    if [[ -n "$reallocated" ]] && [[ "$reallocated" =~ ^[0-9]+$ ]]; then
        if [[ "$reallocated" -eq 0 ]]; then
            echo -e "  ${GREEN}✓ Reallocated Sectors: $reallocated${NC}"
        elif [[ "$reallocated" -lt 10 ]]; then
            echo -e "  ${YELLOW}! Reallocated Sectors: $reallocated (monitor closely)${NC}"
        else
            echo -e "  ${RED}✗ Reallocated Sectors: $reallocated (HIGH - drive degrading)${NC}"
        fi
    fi
    
    # Pending sectors
    if [[ -n "$pending" ]] && [[ "$pending" =~ ^[0-9]+$ ]]; then
        if [[ "$pending" -eq 0 ]]; then
            echo -e "  ${GREEN}✓ Pending Sectors: $pending${NC}"
        else
            echo -e "  ${RED}✗ Pending Sectors: $pending (sectors waiting to be remapped)${NC}"
        fi
    fi
    
    # Uncorrectable
    if [[ -n "$uncorrectable" ]] && [[ "$uncorrectable" =~ ^[0-9]+$ ]]; then
        if [[ "$uncorrectable" -eq 0 ]]; then
            echo -e "  ${GREEN}✓ Uncorrectable Sectors: $uncorrectable${NC}"
        else
            echo -e "  ${RED}✗ Uncorrectable Sectors: $uncorrectable (data loss possible)${NC}"
        fi
    fi
    
    # CRC errors
    if [[ -n "$crc_errors" ]] && [[ "$crc_errors" =~ ^[0-9]+$ ]]; then
        if [[ "$crc_errors" -eq 0 ]]; then
            echo -e "  ${GREEN}✓ CRC Errors: $crc_errors${NC}"
        else
            echo -e "  ${YELLOW}! CRC Errors: $crc_errors (check cable/connection)${NC}"
        fi
    fi
    
    # Temperature
    if [[ -n "$temp" ]]; then
        if [[ "$temp" -lt 45 ]]; then
            echo -e "  ${GREEN}✓ Temperature: ${temp}°C${NC}"
        elif [[ "$temp" -lt 55 ]]; then
            echo -e "  ${YELLOW}! Temperature: ${temp}°C (warm)${NC}"
        else
            echo -e "  ${RED}✗ Temperature: ${temp}°C (HOT - improve cooling)${NC}"
        fi
    fi
    
    # Power-on hours
    if [[ -n "$hours" ]] && [[ "$hours" =~ ^[0-9]+$ ]]; then
        local years=$(echo "scale=1; $hours / 8760" | bc 2>/dev/null || echo "?")
        echo -e "  ${CYAN}ℹ Power-On Hours: $hours (~${years} years)${NC}"
        
        if [[ "$hours" -gt 43800 ]]; then  # 5 years
            echo -e "    ${YELLOW}(Drive is aging - consider proactive replacement)${NC}"
        fi
    fi
}

check_error_log() {
    print_section "SMART Error Log"
    
    local errors=$(smartctl -l error "$DEVICE" 2>/dev/null)
    
    if echo "$errors" | grep -q "No Errors Logged"; then
        echo -e "${GREEN}✓ No errors logged${NC}"
    else
        echo -e "${YELLOW}Recent errors found:${NC}"
        echo "$errors" | tail -20
    fi
}

check_self_test_log() {
    print_section "Self-Test History"
    
    local tests=$(smartctl -l selftest "$DEVICE" 2>/dev/null)
    
    if echo "$tests" | grep -q "No self-tests"; then
        echo -e "${YELLOW}No self-tests have been run${NC}"
    else
        echo "$tests" | head -15
    fi
}

run_short_test() {
    print_section "Running Short Self-Test"
    
    echo -e "${YELLOW}Starting short self-test (takes 1-2 minutes)...${NC}"
    
    smartctl -t short "$DEVICE" 2>/dev/null
    
    echo ""
    echo -e "${CYAN}Test started. Check results with:${NC}"
    echo -e "  ${GREEN}sudo smartctl -l selftest $DEVICE${NC}"
    echo ""
    echo -e "Or wait and re-run this script."
}

check_kernel_errors() {
    print_section "Kernel I/O Errors (dmesg)"
    
    local device_name=$(basename "$DEVICE")
    local errors=$(dmesg 2>/dev/null | grep -i "$device_name" | grep -iE "(error|fail|reset|timeout)" | tail -10)
    
    if [[ -n "$errors" ]]; then
        echo -e "${YELLOW}Recent kernel messages for $device_name:${NC}"
        echo "$errors"
    else
        echo -e "${GREEN}✓ No recent I/O errors in kernel log${NC}"
    fi
}

offer_badblocks() {
    print_section "Surface Scan (Optional)"
    
    echo -e "${YELLOW}Would you like to run a non-destructive surface scan?${NC}"
    echo -e "This will read every sector to check for bad blocks."
    echo -e "${RED}WARNING: This can take HOURS for large drives.${NC}"
    echo ""
    
    local size_gb=$(lsblk -b -d -o SIZE "$DEVICE" 2>/dev/null | tail -1)
    size_gb=$((size_gb / 1024 / 1024 / 1024))
    
    echo -e "Drive size: ${size_gb}GB"
    echo -e "Estimated time: $((size_gb / 60)) - $((size_gb / 30)) minutes"
    echo ""
    
    echo -e "Run badblocks scan? [y/N]"
    read -r response
    
    if [[ "$response" =~ ^[Yy]$ ]]; then
        echo -e "${CYAN}Starting read-only surface scan...${NC}"
        echo -e "Press Ctrl+C to cancel at any time."
        echo ""
        
        badblocks -sv "$DEVICE" 2>&1 | tee "${LOG_DIR}/badblocks_${device_name}_${TIMESTAMP}.log"
    else
        echo "Skipped."
    fi
}

generate_report() {
    print_section "Generating Report"
    
    mkdir -p "$LOG_DIR"
    local report_file="${LOG_DIR}/drive_report_$(basename $DEVICE)_${TIMESTAMP}.txt"
    
    {
        echo "Drive Diagnostic Report"
        echo "Generated: $(date)"
        echo "Device: $DEVICE"
        echo "========================================"
        echo ""
        smartctl -x "$DEVICE" 2>/dev/null
    } > "$report_file"
    
    echo -e "${GREEN}Full SMART report saved to: $report_file${NC}"
}

show_recommendations() {
    print_header "Recommendations"
    
    echo ""
    echo -e "${CYAN}Based on the analysis:${NC}"
    echo ""
    
    local health=$(smartctl -H "$DEVICE" 2>&1)
    local attrs=$(smartctl -A "$DEVICE" 2>/dev/null)
    local reallocated=$(echo "$attrs" | grep -i "Reallocated_Sector" | awk '{print $NF}')
    local pending=$(echo "$attrs" | grep -i "Current_Pending_Sector" | awk '{print $NF}')
    
    reallocated=${reallocated:-0}
    pending=${pending:-0}
    
    if echo "$health" | grep -q "FAILED"; then
        echo -e "${RED}1. CRITICAL: Drive is failing. Do not use for important data.${NC}"
        echo -e "${RED}2. If there's any data you need, attempt recovery NOW.${NC}"
        echo -e "${RED}3. Replace the drive as soon as possible.${NC}"
    elif [[ "$reallocated" -gt 50 ]] || [[ "$pending" -gt 5 ]]; then
        echo -e "${YELLOW}1. Drive is degrading significantly.${NC}"
        echo -e "${YELLOW}2. Back up any important data.${NC}"
        echo -e "${YELLOW}3. Consider replacement within 1-3 months.${NC}"
        echo -e "${YELLOW}4. Do not use for critical data.${NC}"
    elif [[ "$reallocated" -gt 0 ]] || [[ "$pending" -gt 0 ]]; then
        echo -e "${YELLOW}1. Drive shows early signs of wear.${NC}"
        echo -e "${YELLOW}2. Monitor regularly with: sudo smartctl -A $DEVICE${NC}"
        echo -e "${YELLOW}3. May be usable for non-critical storage (media, cache).${NC}"
        echo -e "${YELLOW}4. Run extended self-test: sudo smartctl -t long $DEVICE${NC}"
    else
        echo -e "${GREEN}1. Drive appears healthy.${NC}"
        echo -e "${GREEN}2. Run extended self-test to be thorough: sudo smartctl -t long $DEVICE${NC}"
        echo -e "${GREEN}3. Consider reformatting if starting fresh.${NC}"
    fi
    
    echo ""
    echo -e "${CYAN}To attempt recovery/repair:${NC}"
    echo "  1. Run extended test: sudo smartctl -t long $DEVICE"
    echo "  2. Check filesystem: sudo fsck -n $DEVICE  (read-only check)"
    echo "  3. If reformatting: sudo mkfs.ext4 $DEVICE"
    echo ""
}

main() {
    check_root
    install_deps
    
    if [[ -z "$DEVICE" ]]; then
        list_drives
        exit 0
    fi
    
    validate_device
    
    print_header "Drive Diagnostics: $DEVICE"
    echo "  Timestamp: $(date)"
    echo "  Log directory: $LOG_DIR"
    
    get_drive_info
    
    if check_smart_support; then
        check_smart_health
        check_smart_attributes
        check_error_log
        check_self_test_log
        check_kernel_errors
        generate_report
        show_recommendations
        
        echo ""
        echo -e "${YELLOW}Would you like to run a short self-test now? [y/N]${NC}"
        read -r response
        if [[ "$response" =~ ^[Yy]$ ]]; then
            run_short_test
        fi
    else
        echo -e "${YELLOW}Skipping SMART tests (not supported)${NC}"
        check_kernel_errors
    fi
    
    echo ""
    echo -e "${GREEN}Diagnostics complete.${NC}"
}

main "$@"
