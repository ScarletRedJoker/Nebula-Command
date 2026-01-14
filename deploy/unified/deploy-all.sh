#!/bin/bash
# Nebula Command - Unified Deployment Orchestrator
# Deploy to Local Ubuntu, Windows VM, and Linode from a single control plane

set -euo pipefail

SCRIPT_DIR="$(cd "$(dirname "${BASH_SOURCE[0]}")" && pwd)"
DEPLOY_ROOT="$(dirname "$SCRIPT_DIR")"
REPO_ROOT="$(dirname "$DEPLOY_ROOT")"

# Source shared utilities
source "$DEPLOY_ROOT/shared/lib/common.sh"

# Default configuration
TARGETS="local,linode"  # Windows requires manual setup due to auth
PARALLEL=false
SKIP_HEALTH=false
VERBOSE=false
DRY_RUN=false
AUTO_WAKE=false
ENABLE_ROLLBACK=false
NOTIFY=false
ROLLBACK_ON_FAILURE=false

# Node configuration
LINODE_HOST="${LINODE_HOST:-69.164.211.205}"
LINODE_USER="${LINODE_USER:-root}"
WINDOWS_HOST="${WINDOWS_HOST:-100.118.44.102}"
WINDOWS_USER="${WINDOWS_USER:-Evin}"
WINDOWS_MAC="${WINDOWS_MAC:-}"
LOCAL_USER="${LOCAL_USER:-$(whoami)}"
DISCORD_WEBHOOK="${DISCORD_WEBHOOK:-}"

# Rollback state
declare -A ROLLBACK_COMMITS

# Print usage
usage() {
    cat << EOF
${BOLD}Nebula Command - Unified Deployment Orchestrator${NC}

${CYAN}USAGE:${NC}
    $(basename "$0") [OPTIONS] [COMMAND]

${CYAN}COMMANDS:${NC}
    deploy      Deploy to specified targets (default)
    status      Show status of all nodes
    health      Run health checks on all nodes
    sync        Sync code to all nodes without deploying
    rollback    Rollback to previous deployment state
    wake        Wake up offline VMs (Windows)

${CYAN}OPTIONS:${NC}
    -t, --targets TARGETS   Comma-separated targets: local,linode,windows (default: local,linode)
    -p, --parallel          Run deployments in parallel
    -s, --skip-health       Skip post-deployment health checks
    -w, --auto-wake         Auto-wake Windows VM if offline (WoL)
    -r, --rollback          Enable rollback on deployment failure
    --notify                Send Discord notification on completion
    -v, --verbose           Verbose output
    -n, --dry-run           Show what would be done without executing
    -h, --help              Show this help

${CYAN}EXAMPLES:${NC}
    $(basename "$0")                        # Deploy to local and linode
    $(basename "$0") -t local               # Deploy only to local
    $(basename "$0") -t linode,windows -w   # Deploy with auto-wake
    $(basename "$0") status                 # Show status of all nodes
    $(basename "$0") -p --notify            # Parallel with notifications
    $(basename "$0") rollback linode        # Rollback linode deployment

${CYAN}ENVIRONMENT VARIABLES:${NC}
    DISCORD_WEBHOOK     Discord webhook URL for notifications
    WINDOWS_MAC         MAC address for Wake-on-LAN
    LINODE_HOST         Linode server IP
    WINDOWS_HOST        Windows VM IP (Tailscale)

${CYAN}NOTES:${NC}
    - Windows deployment requires SSH setup (key-based auth)
    - Run from Local Ubuntu (the control plane)
    - Requires Tailscale for Windows VM connectivity
    - Set WINDOWS_MAC for Wake-on-LAN functionality
EOF
}

# Parse arguments
parse_args() {
    local command="deploy"
    
    while [[ $# -gt 0 ]]; do
        case "$1" in
            -t|--targets)
                TARGETS="$2"
                shift 2
                ;;
            -p|--parallel)
                PARALLEL=true
                shift
                ;;
            -s|--skip-health)
                SKIP_HEALTH=true
                shift
                ;;
            -w|--auto-wake)
                AUTO_WAKE=true
                shift
                ;;
            -r|--rollback)
                ROLLBACK_ON_FAILURE=true
                shift
                ;;
            --notify)
                NOTIFY=true
                shift
                ;;
            -v|--verbose)
                VERBOSE=true
                export DEBUG=1
                shift
                ;;
            -n|--dry-run)
                DRY_RUN=true
                shift
                ;;
            -h|--help)
                usage
                exit 0
                ;;
            deploy|status|health|sync|rollback|wake)
                command="$1"
                shift
                ;;
            *)
                echo -e "${RED}Unknown option: $1${NC}"
                usage
                exit 1
                ;;
        esac
    done
    
    echo "$command"
}

# Send Discord notification
send_notification() {
    local status="$1"
    local message="$2"
    local color="${3:-3447003}"
    
    if [[ "$NOTIFY" != "true" || -z "$DISCORD_WEBHOOK" ]]; then
        return 0
    fi
    
    local timestamp=$(date -u +"%Y-%m-%dT%H:%M:%SZ")
    local hostname=$(hostname 2>/dev/null || echo "unknown")
    
    local payload=$(cat << EOF
{
    "embeds": [{
        "title": "🚀 Deployment $status",
        "description": "$message",
        "color": $color,
        "fields": [
            {"name": "Host", "value": "$hostname", "inline": true},
            {"name": "Targets", "value": "$TARGETS", "inline": true}
        ],
        "footer": {"text": "Nebula Command"},
        "timestamp": "$timestamp"
    }]
}
EOF
)
    
    if [[ "$DRY_RUN" == "true" ]]; then
        log INFO "[DRY-RUN] Would send notification: $status"
        return 0
    fi
    
    curl -sf -H "Content-Type: application/json" -d "$payload" "$DISCORD_WEBHOOK" &>/dev/null || \
        log WARN "Failed to send Discord notification"
}

# Wake Windows VM via Wake-on-LAN
wake_windows_vm() {
    section "Waking Windows VM"
    
    if [[ -z "$WINDOWS_MAC" ]]; then
        log WARN "WINDOWS_MAC not set - cannot send Wake-on-LAN packet"
        log INFO "Set WINDOWS_MAC environment variable to enable WoL"
        return 1
    fi
    
    if check_tailscale_host "$WINDOWS_HOST"; then
        log INFO "Windows VM is already online"
        return 0
    fi
    
    log INFO "Sending Wake-on-LAN packet to $WINDOWS_MAC..."
    
    if [[ "$DRY_RUN" == "true" ]]; then
        log INFO "[DRY-RUN] Would send WoL packet"
        return 0
    fi
    
    if has_command wakeonlan; then
        wakeonlan "$WINDOWS_MAC" || true
    elif has_command wol; then
        wol "$WINDOWS_MAC" || true
    elif has_command etherwake; then
        sudo etherwake "$WINDOWS_MAC" || true
    else
        log WARN "No WoL tool found (install wakeonlan package)"
        return 1
    fi
    
    log INFO "Waiting for Windows VM to come online (up to 120s)..."
    local waited=0
    while [[ $waited -lt 120 ]]; do
        sleep 10
        waited=$((waited + 10))
        if check_tailscale_host "$WINDOWS_HOST"; then
            log INFO "$(status_icon online) Windows VM is now online after ${waited}s"
            return 0
        fi
        log DEBUG "Still waiting... ${waited}s"
    done
    
    log ERROR "Windows VM did not come online within 120s"
    return 1
}

# Save rollback state before deployment
save_rollback_state() {
    local target="$1"
    
    case "$target" in
        local)
            ROLLBACK_COMMITS["local"]=$(git -C "$REPO_ROOT" rev-parse HEAD 2>/dev/null || echo "")
            ;;
        linode)
            ROLLBACK_COMMITS["linode"]=$(ssh -o ConnectTimeout=5 "$LINODE_USER@$LINODE_HOST" \
                "cd /opt/homelab/HomeLabHub && git rev-parse HEAD" 2>/dev/null || echo "")
            ;;
        windows)
            ROLLBACK_COMMITS["windows"]=$(ssh -o ConnectTimeout=5 "$WINDOWS_USER@$WINDOWS_HOST" \
                "cd C:\\NebulaCommand && git rev-parse HEAD" 2>/dev/null || echo "")
            ;;
    esac
    
    log DEBUG "Saved rollback state for $target: ${ROLLBACK_COMMITS[$target]:-unknown}"
}

# Perform rollback for a target
perform_rollback() {
    local target="$1"
    local commit="${ROLLBACK_COMMITS[$target]:-}"
    
    if [[ -z "$commit" ]]; then
        log WARN "No rollback state saved for $target"
        return 1
    fi
    
    section "Rolling back $target to $commit"
    
    if [[ "$DRY_RUN" == "true" ]]; then
        log INFO "[DRY-RUN] Would rollback $target to $commit"
        return 0
    fi
    
    case "$target" in
        local)
            cd "$REPO_ROOT"
            git checkout "$commit" -- . 2>/dev/null || git reset --hard "$commit"
            "$DEPLOY_ROOT/local/deploy.sh" -v || return 1
            ;;
        linode)
            ssh "$LINODE_USER@$LINODE_HOST" \
                "cd /opt/homelab/HomeLabHub && git checkout $commit -- . && ./deploy/linode/deploy.sh -v" || return 1
            ;;
        windows)
            ssh "$WINDOWS_USER@$WINDOWS_HOST" \
                "cd C:\\NebulaCommand && git checkout $commit -- ." 2>/dev/null || return 1
            ;;
    esac
    
    log INFO "$(status_icon online) Rollback completed for $target"
    update_state "$target" "rolled-back" "Reverted to $commit"
}

# Print banner
print_banner() {
    echo ""
    echo -e "${CYAN}╔══════════════════════════════════════════════════════════════╗${NC}"
    echo -e "${CYAN}║${NC}     ${BOLD}Nebula Command - Unified Deployment Orchestrator${NC}        ${CYAN}║${NC}"
    echo -e "${CYAN}╚══════════════════════════════════════════════════════════════╝${NC}"
    echo ""
}

# Check prerequisites
check_prerequisites() {
    section "Preflight Checks"
    
    local errors=0
    
    # Check required commands
    for cmd in ssh curl jq git; do
        if has_command "$cmd"; then
            log INFO "$(status_icon online) $cmd available"
        else
            log ERROR "$(status_icon offline) $cmd not found"
            errors=$((errors + 1))
        fi
    done
    
    # Check Tailscale for Windows connectivity
    if [[ "$TARGETS" == *"windows"* ]]; then
        if check_tailscale_host "$WINDOWS_HOST"; then
            log INFO "$(status_icon online) Windows VM reachable ($WINDOWS_HOST)"
        else
            log WARN "$(status_icon offline) Windows VM not reachable - check Tailscale"
            errors=$((errors + 1))
        fi
    fi
    
    # Check Linode connectivity
    if [[ "$TARGETS" == *"linode"* ]]; then
        if ssh -o ConnectTimeout=5 -o BatchMode=yes "$LINODE_USER@$LINODE_HOST" "echo ok" &>/dev/null; then
            log INFO "$(status_icon online) Linode reachable ($LINODE_HOST)"
        else
            log WARN "$(status_icon offline) Linode SSH not configured or unreachable"
        fi
    fi
    
    if [[ $errors -gt 0 ]]; then
        log ERROR "Preflight checks failed with $errors errors"
        return 1
    fi
    
    log INFO "All preflight checks passed"
    return 0
}

# Deploy to Local Ubuntu
deploy_local() {
    section "Deploying to Local Ubuntu"
    update_state "local" "deploying" "Started deployment"
    
    local start_time=$(date +%s)
    
    if [[ "$DRY_RUN" == "true" ]]; then
        log INFO "[DRY-RUN] Would run: $DEPLOY_ROOT/local/deploy.sh"
        update_state "local" "dry-run" "Dry run completed"
        return 0
    fi
    
    # Save rollback state
    if [[ "$ROLLBACK_ON_FAILURE" == "true" ]]; then
        save_rollback_state "local"
    fi
    
    cd "$REPO_ROOT"
    
    if "$DEPLOY_ROOT/local/deploy.sh" -v; then
        local duration=$(($(date +%s) - start_time))
        log INFO "$(status_icon online) Local deployment completed in $(format_duration $duration)"
        update_state "local" "success" "Deployed successfully"
        return 0
    else
        log ERROR "$(status_icon offline) Local deployment failed"
        update_state "local" "failed" "Deployment failed"
        
        # Attempt rollback if enabled
        if [[ "$ROLLBACK_ON_FAILURE" == "true" ]]; then
            log WARN "Attempting automatic rollback..."
            perform_rollback "local" || log ERROR "Rollback also failed"
        fi
        return 1
    fi
}

# Deploy to Linode
deploy_linode() {
    section "Deploying to Linode"
    update_state "linode" "deploying" "Started deployment"
    
    local start_time=$(date +%s)
    
    if [[ "$DRY_RUN" == "true" ]]; then
        log INFO "[DRY-RUN] Would SSH to $LINODE_HOST and run deploy.sh"
        update_state "linode" "dry-run" "Dry run completed"
        return 0
    fi
    
    # Save rollback state
    if [[ "$ROLLBACK_ON_FAILURE" == "true" ]]; then
        save_rollback_state "linode"
    fi
    
    log INFO "Connecting to Linode ($LINODE_HOST)..."
    
    if ssh "$LINODE_USER@$LINODE_HOST" \
        "cd /opt/homelab/HomeLabHub && git pull origin main && ./deploy/linode/deploy.sh -v"; then
        local duration=$(($(date +%s) - start_time))
        log INFO "$(status_icon online) Linode deployment completed in $(format_duration $duration)"
        update_state "linode" "success" "Deployed successfully"
        return 0
    else
        log ERROR "$(status_icon offline) Linode deployment failed"
        update_state "linode" "failed" "Deployment failed"
        
        # Attempt rollback if enabled
        if [[ "$ROLLBACK_ON_FAILURE" == "true" ]]; then
            log WARN "Attempting automatic rollback..."
            perform_rollback "linode" || log ERROR "Rollback also failed"
        fi
        return 1
    fi
}

# Deploy to Windows VM
deploy_windows() {
    section "Deploying to Windows VM"
    update_state "windows" "deploying" "Started deployment"
    
    local start_time=$(date +%s)
    
    if [[ "$DRY_RUN" == "true" ]]; then
        log INFO "[DRY-RUN] Would SSH to $WINDOWS_HOST and run setup script"
        update_state "windows" "dry-run" "Dry run completed"
        return 0
    fi
    
    # Check Windows connectivity first
    if ! check_tailscale_host "$WINDOWS_HOST"; then
        if [[ "$AUTO_WAKE" == "true" ]]; then
            log WARN "Windows VM offline - attempting Wake-on-LAN..."
            if ! wake_windows_vm; then
                log ERROR "$(status_icon offline) Could not wake Windows VM"
                update_state "windows" "failed" "VM not reachable and WoL failed"
                return 1
            fi
        else
            log ERROR "$(status_icon offline) Windows VM not reachable via Tailscale"
            log INFO "Use -w/--auto-wake to enable Wake-on-LAN"
            update_state "windows" "failed" "VM not reachable"
            return 1
        fi
    fi
    
    # Save rollback state
    if [[ "$ROLLBACK_ON_FAILURE" == "true" ]]; then
        save_rollback_state "windows"
    fi
    
    log INFO "Connecting to Windows VM ($WINDOWS_HOST)..."
    
    # Try to pull latest code on Windows
    if ssh -o ConnectTimeout=10 "$WINDOWS_USER@$WINDOWS_HOST" \
        "cd C:\\NebulaCommand && git pull origin main" 2>/dev/null; then
        log INFO "$(status_icon online) Code synced on Windows"
    else
        log WARN "Could not sync code - may need manual git pull"
    fi
    
    # Run the AI stack startup script via Nebula Agent or PowerShell
    local agent_available=false
    if check_http_health "http://$WINDOWS_HOST:9765/health" 2>/dev/null; then
        agent_available=true
        log INFO "Nebula Agent is available - using for deployment"
        
        # Trigger AI stack start via agent
        curl -sf -X POST "http://$WINDOWS_HOST:9765/api/ai/start" 2>/dev/null || true
    else
        log INFO "Nebula Agent not available - using SSH"
        
        # Try to start AI services via PowerShell
        ssh -o ConnectTimeout=10 "$WINDOWS_USER@$WINDOWS_HOST" \
            "powershell -ExecutionPolicy Bypass -File C:\\NebulaCommand\\deploy\\windows\\scripts\\Start-NebulaAiStack.ps1 start" 2>/dev/null || true
    fi
    
    # Wait for services to start
    sleep 5
    
    # Check Ollama status
    if check_ollama_health "$WINDOWS_HOST"; then
        local models=$(check_ollama_health "$WINDOWS_HOST")
        log INFO "$(status_icon online) Ollama running with models: $models"
    else
        log WARN "$(status_icon offline) Ollama not responding"
        # Try to start Ollama
        ssh "$WINDOWS_USER@$WINDOWS_HOST" \
            "powershell -Command \"Start-Process ollama -ArgumentList 'serve' -WindowStyle Hidden\"" 2>/dev/null || true
    fi
    
    # Check Stable Diffusion
    if check_http_health "http://$WINDOWS_HOST:7860" 2>/dev/null; then
        log INFO "$(status_icon online) Stable Diffusion running"
    else
        log INFO "$(status_icon offline) Stable Diffusion not running (optional)"
    fi
    
    # Check ComfyUI
    if check_http_health "http://$WINDOWS_HOST:8188" 2>/dev/null; then
        log INFO "$(status_icon online) ComfyUI running"
    else
        log INFO "$(status_icon offline) ComfyUI not running (optional)"
    fi
    
    local duration=$(($(date +%s) - start_time))
    log INFO "Windows deployment completed in $(format_duration $duration)"
    update_state "windows" "success" "AI services deployed"
    return 0
}

# Show status of all nodes
show_status() {
    print_banner
    section "Node Status"
    
    echo ""
    printf "  %-20s %-15s %-30s\n" "NODE" "STATUS" "DETAILS"
    printf "  %-20s %-15s %-30s\n" "────────────────────" "───────────────" "──────────────────────────────"
    
    # Local Ubuntu
    local local_status="unknown"
    local local_details=""
    if docker ps &>/dev/null; then
        local running=$(docker ps --format '{{.Names}}' | wc -l)
        local_status="online"
        local_details="$running containers running"
    else
        local_status="offline"
        local_details="Docker not responding"
    fi
    printf "  %-20s %-15s %-30s\n" "Local Ubuntu" "$(status_icon $local_status) $local_status" "$local_details"
    
    # Linode
    local linode_status="unknown"
    local linode_details=""
    if ssh -o ConnectTimeout=5 -o BatchMode=yes "$LINODE_USER@$LINODE_HOST" "docker ps" &>/dev/null; then
        local running=$(ssh "$LINODE_USER@$LINODE_HOST" "docker ps --format '{{.Names}}' | wc -l" 2>/dev/null)
        linode_status="online"
        linode_details="$running containers running"
    else
        linode_status="offline"
        linode_details="SSH unreachable"
    fi
    printf "  %-20s %-15s %-30s\n" "Linode" "$(status_icon $linode_status) $linode_status" "$linode_details"
    
    # Windows VM
    local windows_status="unknown"
    local windows_details=""
    if check_tailscale_host "$WINDOWS_HOST"; then
        if models=$(check_ollama_health "$WINDOWS_HOST" 2>/dev/null); then
            windows_status="online"
            windows_details="Ollama: $models"
        else
            windows_status="partial"
            windows_details="Reachable, Ollama offline"
        fi
    else
        windows_status="offline"
        windows_details="Not reachable via Tailscale"
    fi
    printf "  %-20s %-15s %-30s\n" "Windows VM" "$(status_icon $windows_status) $windows_status" "$windows_details"
    
    echo ""
    
    # Show last deployment state
    local state_file="$STATE_DIR/deploy-status.json"
    if [[ -f "$state_file" ]]; then
        section "Last Deployment Status"
        jq -r 'to_entries[] | "  \(.key): \(.value.status) - \(.value.updated)"' "$state_file" 2>/dev/null || true
    fi
}

# Run health checks
run_health_checks() {
    section "Health Checks"
    
    local all_healthy=true
    
    # Local services
    log INFO "Checking Local Ubuntu services..."
    for service in "http://localhost:9091/api/health" "http://localhost:8123/" "http://localhost:32400/identity"; do
        if check_http_health "$service"; then
            log INFO "  $(status_icon online) $service"
        else
            log WARN "  $(status_icon offline) $service"
            all_healthy=false
        fi
    done
    
    # Linode services
    if [[ "$TARGETS" == *"linode"* ]]; then
        log INFO "Checking Linode services..."
        if check_http_health "https://dashboard.evindrake.net"; then
            log INFO "  $(status_icon online) Dashboard"
        else
            log WARN "  $(status_icon offline) Dashboard"
            all_healthy=false
        fi
    fi
    
    # Windows AI services
    if [[ "$TARGETS" == *"windows"* ]]; then
        log INFO "Checking Windows AI services..."
        if check_ollama_health "$WINDOWS_HOST" &>/dev/null; then
            log INFO "  $(status_icon online) Ollama"
        else
            log WARN "  $(status_icon offline) Ollama"
        fi
        
        if check_http_health "http://$WINDOWS_HOST:7860" 2>/dev/null; then
            log INFO "  $(status_icon online) Stable Diffusion"
        else
            log INFO "  $(status_icon offline) Stable Diffusion (optional)"
        fi
    fi
    
    if [[ "$all_healthy" == "true" ]]; then
        log INFO "All critical services healthy!"
        return 0
    else
        log WARN "Some services may need attention"
        return 1
    fi
}

# Main deployment orchestration
run_deploy() {
    print_banner
    
    local start_time=$(date +%s)
    local failed_targets=()
    
    # Parse targets
    IFS=',' read -ra target_list <<< "$TARGETS"
    
    log INFO "Deployment targets: ${target_list[*]}"
    [[ "$PARALLEL" == "true" ]] && log INFO "Parallel mode: enabled"
    [[ "$DRY_RUN" == "true" ]] && log INFO "Dry run mode: enabled"
    
    # Preflight
    check_prerequisites || exit 1
    
    # Sequential deployment (safer, recommended)
    if [[ "$PARALLEL" == "false" ]]; then
        for target in "${target_list[@]}"; do
            case "$target" in
                local)
                    deploy_local || failed_targets+=("local")
                    ;;
                linode)
                    deploy_linode || failed_targets+=("linode")
                    ;;
                windows)
                    deploy_windows || failed_targets+=("windows")
                    ;;
                *)
                    log WARN "Unknown target: $target"
                    ;;
            esac
        done
    else
        # Parallel deployment (faster but harder to debug)
        local pids=()
        
        for target in "${target_list[@]}"; do
            case "$target" in
                local)
                    deploy_local &
                    pids+=($!)
                    ;;
                linode)
                    deploy_linode &
                    pids+=($!)
                    ;;
                windows)
                    deploy_windows &
                    pids+=($!)
                    ;;
            esac
        done
        
        # Wait for all deployments
        for pid in "${pids[@]}"; do
            wait "$pid" || failed_targets+=("pid-$pid")
        done
    fi
    
    # Health checks
    if [[ "$SKIP_HEALTH" == "false" && "$DRY_RUN" == "false" ]]; then
        echo ""
        run_health_checks || true
    fi
    
    # Summary
    local duration=$(($(date +%s) - start_time))
    
    section "Deployment Summary"
    echo ""
    log INFO "Total time: $(format_duration $duration)"
    
    if [[ ${#failed_targets[@]} -eq 0 ]]; then
        echo -e "${GREEN}${BOLD}✓ All deployments completed successfully!${NC}"
        send_notification "Success" "All targets deployed in $(format_duration $duration)" 3066993
        return 0
    else
        echo -e "${RED}${BOLD}✗ Failed targets: ${failed_targets[*]}${NC}"
        send_notification "Failed" "Failed targets: ${failed_targets[*]}" 15158332
        return 1
    fi
}

# Sync code to all nodes
run_sync() {
    print_banner
    section "Syncing Code to All Nodes"
    
    # Sync to Linode
    if [[ "$TARGETS" == *"linode"* ]]; then
        log INFO "Syncing to Linode..."
        if ssh "$LINODE_USER@$LINODE_HOST" "cd /opt/homelab/HomeLabHub && git pull origin main"; then
            log INFO "$(status_icon online) Linode synced"
        else
            log ERROR "$(status_icon offline) Linode sync failed"
        fi
    fi
    
    # Sync to Windows
    if [[ "$TARGETS" == *"windows"* ]]; then
        log INFO "Syncing to Windows..."
        if ssh "$WINDOWS_USER@$WINDOWS_HOST" "cd C:\\NebulaCommand && git pull origin main" 2>/dev/null; then
            log INFO "$(status_icon online) Windows synced"
        else
            log WARN "$(status_icon offline) Windows sync failed - may need manual pull"
        fi
    fi
    
    # Local is always up to date (we're running from here)
    if [[ "$TARGETS" == *"local"* ]]; then
        log INFO "$(status_icon online) Local is already at latest"
    fi
}

# Run manual rollback command
run_rollback() {
    print_banner
    section "Manual Rollback"
    
    # Get target from remaining args or prompt
    local target="${1:-}"
    
    if [[ -z "$target" ]]; then
        log ERROR "Usage: $(basename "$0") rollback <target>"
        log INFO "Available targets: local, linode, windows"
        return 1
    fi
    
    # Load previous state
    local state_file="$STATE_DIR/deploy-status.json"
    if [[ ! -f "$state_file" ]]; then
        log ERROR "No deployment state found"
        return 1
    fi
    
    local prev_commit=""
    case "$target" in
        local)
            prev_commit=$(git -C "$REPO_ROOT" log --format=%H -n 2 | tail -1)
            ;;
        linode)
            prev_commit=$(ssh "$LINODE_USER@$LINODE_HOST" \
                "cd /opt/homelab/HomeLabHub && git log --format=%H -n 2 | tail -1" 2>/dev/null)
            ;;
        windows)
            prev_commit=$(ssh "$WINDOWS_USER@$WINDOWS_HOST" \
                "cd C:\\NebulaCommand && git log --format=%%H -n 2 | tail -1" 2>/dev/null)
            ;;
        *)
            log ERROR "Unknown target: $target"
            return 1
            ;;
    esac
    
    if [[ -z "$prev_commit" ]]; then
        log ERROR "Could not determine previous commit for $target"
        return 1
    fi
    
    log INFO "Rolling back $target to: $prev_commit"
    
    ROLLBACK_COMMITS["$target"]="$prev_commit"
    perform_rollback "$target"
    
    send_notification "Rollback" "Rolled back $target to $prev_commit" 16776960
}

# Run wake command
run_wake() {
    print_banner
    section "Wake VMs"
    
    if [[ "$TARGETS" == *"windows"* ]] || [[ "$TARGETS" == "local,linode" ]]; then
        wake_windows_vm
    else
        log INFO "No VMs to wake (add 'windows' to targets)"
    fi
}

# Main
main() {
    local command=$(parse_args "$@")
    
    case "$command" in
        deploy)
            run_deploy
            ;;
        status)
            show_status
            ;;
        health)
            run_health_checks
            ;;
        sync)
            run_sync
            ;;
        rollback)
            run_rollback "$@"
            ;;
        wake)
            run_wake
            ;;
        *)
            usage
            exit 1
            ;;
    esac
}

main "$@"
