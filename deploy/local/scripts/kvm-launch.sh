#!/bin/bash
set -euo pipefail

SCRIPT_DIR="$(cd "$(dirname "${BASH_SOURCE[0]}")" && pwd)"
ORCHESTRATOR="$SCRIPT_DIR/kvm-orchestrator.sh"
STATE_FILE="/var/lib/kvm-orchestrator/state.json"
LOG_FILE="/var/log/kvm-orchestrator.log"

log() { echo "[$(date '+%H:%M:%S')] $*" | tee -a "$LOG_FILE" 2>/dev/null || echo "[$(date '+%H:%M:%S')] $*"; }
error() { log "ERROR: $*"; notify-send -u critical "KVM Error" "$*" 2>/dev/null || true; }
success() { log "SUCCESS: $*"; notify-send -u normal "KVM" "$*" 2>/dev/null || true; }

ensure_state_dir() {
    sudo mkdir -p "$(dirname "$STATE_FILE")" 2>/dev/null || true
}

save_state() {
    local mode="$1"
    ensure_state_dir
    echo "{\"mode\": \"$mode\", \"timestamp\": \"$(date -Iseconds)\"}" | sudo tee "$STATE_FILE" >/dev/null 2>&1 || true
}

get_current_mode() {
    if [[ -f "$STATE_FILE" ]]; then
        grep -oP '"mode":\s*"\K[^"]+' "$STATE_FILE" 2>/dev/null || echo "unknown"
    else
        echo "unknown"
    fi
}

wait_for_vm() {
    local timeout=60
    local elapsed=0
    log "Waiting for VM to be ready..."
    
    while [[ $elapsed -lt $timeout ]]; do
        if "$ORCHESTRATOR" status 2>/dev/null | grep -q "running"; then
            return 0
        fi
        sleep 2
        elapsed=$((elapsed + 2))
    done
    return 1
}

wait_for_agent() {
    local timeout=90
    local elapsed=0
    local vm_ip
    
    vm_ip=$("$ORCHESTRATOR" status 2>/dev/null | grep -oP 'VM IP:\s*\K[0-9.]+' || echo "")
    [[ -z "$vm_ip" ]] && return 1
    
    log "Waiting for Windows agent at $vm_ip:8765..."
    
    while [[ $elapsed -lt $timeout ]]; do
        if curl -sf --connect-timeout 2 "http://$vm_ip:8765/status" >/dev/null 2>&1; then
            return 0
        fi
        sleep 3
        elapsed=$((elapsed + 3))
    done
    return 1
}

launch_gaming() {
    log "=== Launching Gaming Mode ==="
    
    local current_mode
    current_mode=$(get_current_mode)
    
    if ! "$ORCHESTRATOR" status 2>/dev/null | grep -q "running"; then
        log "Starting VM..."
        "$ORCHESTRATOR" start || { error "Failed to start VM"; return 1; }
        wait_for_vm || { error "VM failed to start"; return 1; }
    fi
    
    if [[ "$current_mode" != "gaming" ]]; then
        log "Switching to gaming mode..."
        "$ORCHESTRATOR" gaming || log "Mode switch returned non-zero (may be OK)"
        save_state "gaming"
    else
        log "Already in gaming mode"
    fi
    
    success "Gaming mode ready - connect with Moonlight"
    
    if command -v moonlight &>/dev/null; then
        log "Launching Moonlight..."
        moonlight &
    else
        log "Moonlight not installed - connect manually"
    fi
}

launch_desktop() {
    log "=== Launching Desktop Mode ==="
    
    local current_mode
    current_mode=$(get_current_mode)
    
    if ! "$ORCHESTRATOR" status 2>/dev/null | grep -q "running"; then
        log "Starting VM..."
        "$ORCHESTRATOR" start || { error "Failed to start VM"; return 1; }
        wait_for_vm || { error "VM failed to start"; return 1; }
    fi
    
    if [[ "$current_mode" != "desktop" ]]; then
        log "Switching to desktop mode..."
        "$ORCHESTRATOR" desktop || log "Mode switch returned non-zero (may be OK)"
        save_state "desktop"
    else
        log "Already in desktop mode"
    fi
    
    local vm_ip
    vm_ip=$("$ORCHESTRATOR" status 2>/dev/null | grep -oP 'VM IP:\s*\K[0-9.]+' || echo "192.168.122.10")
    
    success "Desktop mode ready - connecting via RDP"
    
    if command -v xfreerdp &>/dev/null; then
        log "Launching FreeRDP..."
        xfreerdp /v:$vm_ip /u:evin /dynamic-resolution /gfx:AVC420 /sound /microphone &
    elif command -v remmina &>/dev/null; then
        log "Launching Remmina..."
        remmina -c rdp://$vm_ip &
    else
        log "No RDP client found - install xfreerdp or remmina"
    fi
}

launch_console() {
    log "=== Launching Recovery Console ==="
    
    if ! "$ORCHESTRATOR" status 2>/dev/null | grep -q "running"; then
        log "Starting VM..."
        "$ORCHESTRATOR" start || { error "Failed to start VM"; return 1; }
        wait_for_vm || { error "VM failed to start"; return 1; }
    fi
    
    "$ORCHESTRATOR" console
    success "Console opened"
}

show_usage() {
    cat << 'EOF'
KVM Launcher - One-click Windows VM access

Usage: kvm-launch.sh <mode>

Modes:
  gaming    Start VM in gaming mode, connect via Moonlight
  desktop   Start VM in desktop mode, connect via RDP
  console   Open SPICE recovery console

Examples:
  kvm-launch.sh gaming    # Click and play!
  kvm-launch.sh desktop   # Click and work!
EOF
}

main() {
    local mode="${1:-}"
    
    case "$mode" in
        gaming|game|g)
            launch_gaming
            ;;
        desktop|rdp|d)
            launch_desktop
            ;;
        console|c|recovery)
            launch_console
            ;;
        status|s)
            "$ORCHESTRATOR" status
            ;;
        *)
            show_usage
            exit 1
            ;;
    esac
}

main "$@"
