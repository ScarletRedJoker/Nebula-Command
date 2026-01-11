#!/bin/bash
# VM Ollama Bridge - Automatically detect and register Ollama on Windows VM
# Integrates with kvm-orchestrator.sh for seamless AI service discovery
#
# Usage:
#   ./vm-ollama-bridge.sh check     - Check if Ollama is running on VM
#   ./vm-ollama-bridge.sh register  - Register VM Ollama for dashboard use
#   ./vm-ollama-bridge.sh status    - Show full AI service status
#   ./vm-ollama-bridge.sh watch     - Continuous monitoring mode

set -euo pipefail

SCRIPT_DIR="$(cd "$(dirname "${BASH_SOURCE[0]}")" && pwd)"
REPO_ROOT="$(dirname "$(dirname "$(dirname "$SCRIPT_DIR")")")"
STATE_DIR="$REPO_ROOT/deploy/shared/state"
STATE_FILE="$STATE_DIR/local-ai.json"
KVM_CONFIG="${KVM_CONFIG:-/etc/kvm-orchestrator.conf}"

OLLAMA_PORT="${OLLAMA_PORT:-11434}"

RED='\033[0;31m'
GREEN='\033[0;32m'
YELLOW='\033[1;33m'
CYAN='\033[0;36m'
NC='\033[0m'

log()     { echo -e "${CYAN}[INFO]${NC} $*"; }
success() { echo -e "${GREEN}[OK]${NC} $*"; }
warn()    { echo -e "${YELLOW}[WARN]${NC} $*"; }
error()   { echo -e "${RED}[ERROR]${NC} $*"; }

load_vm_config() {
    VM_NAME=""
    VM_IP=""
    if [[ -f "$KVM_CONFIG" ]]; then
        source "$KVM_CONFIG"
    fi
    if [[ -z "$VM_IP" ]] && [[ -f ~/.kvm-orchestrator.conf ]]; then
        source ~/.kvm-orchestrator.conf
    fi
}

get_vm_state() {
    if command -v virsh &>/dev/null && [[ -n "${VM_NAME:-}" ]]; then
        virsh domstate "$VM_NAME" 2>/dev/null | head -1 || echo "unknown"
    else
        echo "unknown"
    fi
}

check_ollama() {
    local host="$1"
    local port="${2:-$OLLAMA_PORT}"
    local url="http://${host}:${port}"
    
    local version=""
    local models=""
    local status="offline"
    
    if curl -sf --connect-timeout 3 "${url}/api/version" > /dev/null 2>&1; then
        status="online"
        version=$(curl -sf --connect-timeout 3 "${url}/api/version" 2>/dev/null | grep -o '"version":"[^"]*"' | cut -d'"' -f4 || echo "unknown")
        
        local models_json
        models_json=$(curl -sf --connect-timeout 5 "${url}/api/tags" 2>/dev/null || echo '{"models":[]}')
        models=$(echo "$models_json" | grep -o '"name":"[^"]*"' | cut -d'"' -f4 | tr '\n' ',' | sed 's/,$//' || true)
        models="${models:-}"
    fi
    
    echo "{\"status\":\"$status\",\"version\":\"$version\",\"models\":\"$models\",\"url\":\"$url\"}"
}

check_vm_ollama() {
    load_vm_config
    
    echo -e "${CYAN}━━━ Windows VM Ollama Check ━━━${NC}"
    
    if [[ -z "$VM_IP" ]]; then
        error "No VM IP configured. Run: kvm-orchestrator.sh discover"
        return 1
    fi
    
    local vm_state
    vm_state=$(get_vm_state)
    
    echo "VM Name:  ${VM_NAME:-unknown}"
    echo "VM IP:    $VM_IP"
    echo "VM State: $vm_state"
    echo ""
    
    if [[ "$vm_state" != "running" ]]; then
        warn "VM is not running - Ollama unavailable"
        return 1
    fi
    
    log "Checking Ollama on $VM_IP:$OLLAMA_PORT..."
    
    local result
    result=$(check_ollama "$VM_IP" "$OLLAMA_PORT")
    local status
    status=$(echo "$result" | grep -o '"status":"[^"]*"' | cut -d'"' -f4)
    
    if [[ "$status" == "online" ]]; then
        local version
        version=$(echo "$result" | grep -o '"version":"[^"]*"' | cut -d'"' -f4)
        local models
        models=$(echo "$result" | grep -o '"models":"[^"]*"' | cut -d'"' -f4)
        
        success "Ollama: online (v${version})"
        [[ -n "$models" ]] && echo "  Models: $models"
        return 0
    else
        warn "Ollama: offline"
        echo ""
        echo "To install Ollama on Windows VM:"
        echo "  1. In Windows, open PowerShell as Admin"
        echo "  2. Run: winget install Ollama.Ollama"
        echo "  3. Run: ollama serve"
        echo ""
        echo "Or download from: https://ollama.com/download/windows"
        return 1
    fi
}

register_vm_ollama() {
    load_vm_config
    
    echo -e "${CYAN}━━━ Registering Windows VM Ollama ━━━${NC}"
    
    mkdir -p "$STATE_DIR"
    
    local hostname
    hostname=$(hostname)
    local timestamp
    timestamp=$(date -u +%Y-%m-%dT%H:%M:%SZ)
    local vm_state
    vm_state=$(get_vm_state)
    
    local ollama_status="offline"
    local ollama_version=""
    local ollama_models=""
    local ollama_url=""
    local source="none"
    
    if [[ "$vm_state" == "running" ]] && [[ -n "$VM_IP" ]]; then
        log "Checking Ollama on Windows VM ($VM_IP)..."
        
        local result
        result=$(check_ollama "$VM_IP" "$OLLAMA_PORT")
        ollama_status=$(echo "$result" | grep -o '"status":"[^"]*"' | cut -d'"' -f4)
        
        if [[ "$ollama_status" == "online" ]]; then
            ollama_version=$(echo "$result" | grep -o '"version":"[^"]*"' | cut -d'"' -f4)
            ollama_models=$(echo "$result" | grep -o '"models":"[^"]*"' | cut -d'"' -f4)
            ollama_url="http://${VM_IP}:${OLLAMA_PORT}"
            source="windows-vm"
            success "Ollama found on Windows VM"
            [[ -n "$ollama_models" ]] && echo "  Models: $ollama_models"
        else
            warn "Ollama not running on Windows VM"
        fi
    else
        log "Windows VM not running, checking localhost..."
        
        local result
        result=$(check_ollama "localhost" "$OLLAMA_PORT")
        ollama_status=$(echo "$result" | grep -o '"status":"[^"]*"' | cut -d'"' -f4)
        
        if [[ "$ollama_status" == "online" ]]; then
            ollama_version=$(echo "$result" | grep -o '"version":"[^"]*"' | cut -d'"' -f4)
            ollama_models=$(echo "$result" | grep -o '"models":"[^"]*"' | cut -d'"' -f4)
            ollama_url="http://localhost:${OLLAMA_PORT}"
            source="linux-host"
            success "Ollama found on Linux host"
        else
            warn "No Ollama service found"
        fi
    fi
    
    local tailscale_ip=""
    if command -v tailscale &>/dev/null; then
        tailscale_ip=$(tailscale ip -4 2>/dev/null | head -1 || echo "")
    fi
    
    local external_url=""
    if [[ "$ollama_status" == "online" ]] && [[ -n "$tailscale_ip" ]]; then
        if [[ "$source" == "windows-vm" ]]; then
            external_url="http://${tailscale_ip}:${OLLAMA_PORT}"
        else
            external_url="http://${tailscale_ip}:${OLLAMA_PORT}"
        fi
    fi
    
    local tailscale_json="null"
    [[ -n "$tailscale_ip" ]] && tailscale_json="\"$tailscale_ip\""
    
    local vm_name_json="null"
    [[ -n "$VM_NAME" ]] && vm_name_json="\"$VM_NAME\""
    
    local vm_ip_json="null"
    [[ -n "$VM_IP" ]] && vm_ip_json="\"$VM_IP\""
    
    local ollama_url_json="null"
    [[ -n "$ollama_url" ]] && ollama_url_json="\"$ollama_url\""
    
    local external_url_json="null"
    [[ -n "$external_url" ]] && external_url_json="\"$external_url\""
    
    local ollama_version_json="null"
    [[ -n "$ollama_version" ]] && ollama_version_json="\"$ollama_version\""
    
    local ollama_models_json="null"
    [[ -n "$ollama_models" ]] && ollama_models_json="\"$ollama_models\""
    
    cat > "$STATE_FILE" << EOF
{
  "hostname": "$hostname",
  "tailscaleIp": $tailscale_json,
  "vmName": $vm_name_json,
  "vmIp": $vm_ip_json,
  "vmState": "$vm_state",
  "registeredAt": "$timestamp",
  "services": {
    "ollama": {
      "status": "$ollama_status",
      "source": "$source",
      "localUrl": $ollama_url_json,
      "externalUrl": $external_url_json,
      "version": $ollama_version_json,
      "models": $ollama_models_json
    },
    "stableDiffusion": {
      "status": "offline",
      "url": null
    },
    "comfyui": {
      "status": "offline",
      "url": null
    }
  }
}
EOF
    
    echo ""
    success "State saved to: $STATE_FILE"
    
    if [[ "$ollama_status" == "online" ]] && [[ -n "$external_url" ]]; then
        echo ""
        echo -e "${CYAN}Environment variable for Linode .env:${NC}"
        echo "OLLAMA_URL=$external_url"
        echo ""
        echo "Note: Traffic flows: Linode → Tailscale → Local Server → Windows VM"
    fi
}

show_status() {
    load_vm_config
    
    echo -e "${CYAN}━━━ AI Services Status ━━━${NC}"
    
    echo ""
    echo "Windows VM:"
    echo "  Name:  ${VM_NAME:-not configured}"
    echo "  IP:    ${VM_IP:-not detected}"
    echo "  State: $(get_vm_state)"
    
    echo ""
    echo "Ollama:"
    
    if [[ -n "$VM_IP" ]] && [[ "$(get_vm_state)" == "running" ]]; then
        local result
        result=$(check_ollama "$VM_IP" "$OLLAMA_PORT")
        local status
        status=$(echo "$result" | grep -o '"status":"[^"]*"' | cut -d'"' -f4)
        
        if [[ "$status" == "online" ]]; then
            success "  Windows VM ($VM_IP): online"
        else
            warn "  Windows VM ($VM_IP): offline"
        fi
    else
        echo "  Windows VM: not running"
    fi
    
    local localhost_result
    localhost_result=$(check_ollama "localhost" "$OLLAMA_PORT")
    local localhost_status
    localhost_status=$(echo "$localhost_result" | grep -o '"status":"[^"]*"' | cut -d'"' -f4)
    
    if [[ "$localhost_status" == "online" ]]; then
        success "  Linux Host (localhost): online"
    else
        warn "  Linux Host (localhost): offline"
    fi
    
    echo ""
    if [[ -f "$STATE_FILE" ]]; then
        echo "Last Registration:"
        grep -E '"registeredAt"|"source"|"status"' "$STATE_FILE" | head -5 | sed 's/^/  /'
    else
        echo "No state file found. Run: $0 register"
    fi
}

watch_mode() {
    echo -e "${CYAN}━━━ Watching AI Services (Ctrl+C to stop) ━━━${NC}"
    
    while true; do
        clear
        register_vm_ollama
        echo ""
        echo "Refreshing in 30 seconds..."
        sleep 30
    done
}

show_help() {
    cat << 'EOF'
VM Ollama Bridge - Windows VM AI Service Integration

Usage: vm-ollama-bridge.sh <command>

Commands:
  check     Check if Ollama is running on Windows VM
  register  Detect and register Ollama service for dashboard
  status    Show full AI service status
  watch     Continuous monitoring mode (updates every 30s)
  help      Show this help message

This script automatically detects Ollama running on your Windows VM
and registers it for use by the dashboard and Linode services.

Traffic flow:
  Dashboard (Linode) → Tailscale → Local Server → Windows VM (Ollama)

Prerequisites:
  1. Windows VM with Ollama installed (winget install Ollama.Ollama)
  2. Ollama running with: ollama serve
  3. KVM orchestrator configured: kvm-orchestrator.sh discover

Examples:
  # Check if Windows VM has Ollama running
  ./vm-ollama-bridge.sh check

  # Register for dashboard use
  ./vm-ollama-bridge.sh register

  # Add to Linode .env
  OLLAMA_URL=$(jq -r '.services.ollama.externalUrl' /path/to/local-ai.json)

EOF
}

case "${1:-help}" in
    check|c)
        check_vm_ollama
        ;;
    register|r)
        register_vm_ollama
        ;;
    status|s)
        show_status
        ;;
    watch|w)
        watch_mode
        ;;
    help|--help|-h)
        show_help
        ;;
    *)
        error "Unknown command: $1"
        show_help
        exit 1
        ;;
esac
