#!/bin/bash
set -euo pipefail

SCRIPT_DIR="$(cd "$(dirname "${BASH_SOURCE[0]}")" && pwd)"
DEPLOY_ROOT="$(dirname "$SCRIPT_DIR")"
REPO_ROOT="$(dirname "$DEPLOY_ROOT")"

if [[ -f "$DEPLOY_ROOT/shared/lib/common.sh" ]]; then
    source "$DEPLOY_ROOT/shared/lib/common.sh"
else
    RED='\033[0;31m'
    GREEN='\033[0;32m'
    YELLOW='\033[1;33m'
    BLUE='\033[0;34m'
    CYAN='\033[0;36m'
    BOLD='\033[1m'
    NC='\033[0m'
    
    log() {
        local level="$1"
        shift
        case "$level" in
            INFO)  echo -e "${GREEN}[✓]${NC} $*" ;;
            WARN)  echo -e "${YELLOW}[⚠]${NC} $*" ;;
            ERROR) echo -e "${RED}[✗]${NC} $*" >&2 ;;
            DEBUG) [[ "${VERBOSE:-false}" == "true" ]] && echo -e "${BLUE}[D]${NC} $*" ;;
        esac
    }
    
    section() {
        echo ""
        echo -e "${CYAN}━━━ $1 ━━━${NC}"
    }
fi

TARGETS="auto"
VERBOSE=false
DRY_RUN=false
SKIP_HEALTH=false
FORCE_UPDATE=false
DISCORD_WEBHOOK="${DISCORD_WEBHOOK:-}"
NOTIFY_ON_SUCCESS=true
NOTIFY_ON_FAILURE=true

LINODE_HOST="${LINODE_HOST:-69.164.211.205}"
LINODE_USER="${LINODE_USER:-root}"
WINDOWS_HOST="${WINDOWS_HOST:-100.118.44.102}"
WINDOWS_USER="${WINDOWS_USER:-Evin}"

DEPLOY_LOG="$DEPLOY_ROOT/unified/logs/auto-deploy-$(date +%Y%m%d-%H%M%S).log"

print_banner() {
    echo ""
    echo -e "${CYAN}╔══════════════════════════════════════════════════════════════╗${NC}"
    echo -e "${CYAN}║${NC}         ${BOLD}Nebula Command - Automated Deployment${NC}               ${CYAN}║${NC}"
    echo -e "${CYAN}╚══════════════════════════════════════════════════════════════╝${NC}"
    echo ""
}

send_discord_notification() {
    local status="$1"
    local message="$2"
    local color="$3"
    local details="${4:-}"
    
    if [[ -z "$DISCORD_WEBHOOK" ]]; then
        log DEBUG "No Discord webhook configured"
        return 0
    fi
    
    local timestamp=$(date -u +"%Y-%m-%dT%H:%M:%SZ")
    local hostname=$(hostname 2>/dev/null || echo "unknown")
    
    local embed_json=$(cat << EOF
{
    "embeds": [{
        "title": "🚀 Deployment $status",
        "description": "$message",
        "color": $color,
        "fields": [
            {"name": "Host", "value": "$hostname", "inline": true},
            {"name": "Targets", "value": "$TARGETS", "inline": true}
        ],
        "footer": {"text": "Nebula Command Auto-Deploy"},
        "timestamp": "$timestamp"
    }]
}
EOF
)

    if [[ -n "$details" ]]; then
        embed_json=$(echo "$embed_json" | jq --arg details "$details" '.embeds[0].fields += [{"name": "Details", "value": $details}]')
    fi
    
    if [[ "$DRY_RUN" == "true" ]]; then
        log INFO "[DRY-RUN] Would send Discord notification: $status"
        return 0
    fi
    
    curl -sf -H "Content-Type: application/json" \
         -d "$embed_json" \
         "$DISCORD_WEBHOOK" &>/dev/null || log WARN "Failed to send Discord notification"
}

detect_changes() {
    local target="$1"
    
    case "$target" in
        local)
            if git -C "$REPO_ROOT" diff --quiet HEAD~1 -- deploy/local/ 2>/dev/null; then
                echo "no-changes"
            else
                echo "has-changes"
            fi
            ;;
        linode)
            local remote_hash=$(ssh -o ConnectTimeout=5 "$LINODE_USER@$LINODE_HOST" \
                "cd /opt/homelab/HomeLabHub && git rev-parse HEAD" 2>/dev/null || echo "unknown")
            local local_hash=$(git -C "$REPO_ROOT" rev-parse HEAD 2>/dev/null || echo "local")
            
            if [[ "$remote_hash" == "$local_hash" ]]; then
                echo "no-changes"
            else
                echo "has-changes"
            fi
            ;;
        windows)
            echo "check-required"
            ;;
        *)
            echo "unknown"
            ;;
    esac
}

auto_detect_targets() {
    section "Auto-Detecting Deployment Targets"
    
    local targets=()
    
    log INFO "Checking local environment..."
    if command -v docker &>/dev/null && docker ps &>/dev/null; then
        local change_status=$(detect_changes "local")
        if [[ "$FORCE_UPDATE" == "true" || "$change_status" == "has-changes" ]]; then
            targets+=("local")
            log INFO "Local: included (changes detected)"
        else
            log INFO "Local: skipped (no changes)"
        fi
    fi
    
    log INFO "Checking Linode connectivity..."
    if ssh -o ConnectTimeout=5 -o BatchMode=yes "$LINODE_USER@$LINODE_HOST" "echo ok" &>/dev/null; then
        local change_status=$(detect_changes "linode")
        if [[ "$FORCE_UPDATE" == "true" || "$change_status" == "has-changes" ]]; then
            targets+=("linode")
            log INFO "Linode: included (changes detected)"
        else
            log INFO "Linode: skipped (up to date)"
        fi
    else
        log WARN "Linode: not reachable"
    fi
    
    log INFO "Checking Windows VM..."
    if ping -c 1 -W 2 "$WINDOWS_HOST" &>/dev/null; then
        targets+=("windows")
        log INFO "Windows: included (reachable)"
    else
        log INFO "Windows: skipped (offline)"
    fi
    
    if [[ ${#targets[@]} -eq 0 ]]; then
        log WARN "No targets need deployment"
        echo ""
    else
        echo "${targets[*]}"
    fi
}

deploy_target() {
    local target="$1"
    local start_time=$(date +%s)
    
    log INFO "Deploying to $target..."
    
    if [[ "$DRY_RUN" == "true" ]]; then
        log INFO "[DRY-RUN] Would deploy to $target"
        return 0
    fi
    
    local status=0
    
    case "$target" in
        local)
            if [[ -x "$DEPLOY_ROOT/local/deploy.sh" ]]; then
                "$DEPLOY_ROOT/local/deploy.sh" -v 2>&1 | tee -a "$DEPLOY_LOG" || status=1
            else
                log WARN "Local deploy script not found"
                status=1
            fi
            ;;
        linode)
            ssh "$LINODE_USER@$LINODE_HOST" \
                "cd /opt/homelab/HomeLabHub && git pull origin main && ./deploy/linode/deploy.sh -v" \
                2>&1 | tee -a "$DEPLOY_LOG" || status=1
            ;;
        windows)
            if ssh -o ConnectTimeout=10 "$WINDOWS_USER@$WINDOWS_HOST" \
                "cd C:\\NebulaCommand && git pull origin main" &>/dev/null; then
                log INFO "Code synced to Windows"
                
                if curl -sf --max-time 5 "http://$WINDOWS_HOST:11434/api/tags" &>/dev/null; then
                    log INFO "Ollama is running"
                else
                    log WARN "Ollama not responding - may need manual start"
                    ssh "$WINDOWS_USER@$WINDOWS_HOST" \
                        "powershell -Command \"Start-Process ollama -ArgumentList 'serve' -WindowStyle Hidden\"" \
                        2>/dev/null || true
                fi
            else
                log WARN "Could not sync to Windows"
                status=1
            fi
            ;;
    esac
    
    local duration=$(($(date +%s) - start_time))
    
    if [[ $status -eq 0 ]]; then
        log INFO "$target: completed in ${duration}s"
    else
        log ERROR "$target: failed after ${duration}s"
    fi
    
    return $status
}

run_health_checks() {
    section "Post-Deployment Health Checks"
    
    local all_healthy=true
    local health_details=""
    
    if [[ "$TARGETS" == *"local"* || "$TARGETS" == "auto" ]]; then
        log INFO "Checking local services..."
        if curl -sf --max-time 5 "http://localhost:5000" &>/dev/null; then
            log INFO "  Dashboard: healthy"
            health_details+="Local Dashboard: ✓\n"
        else
            log WARN "  Dashboard: not responding"
            health_details+="Local Dashboard: ✗\n"
            all_healthy=false
        fi
    fi
    
    if [[ "$TARGETS" == *"linode"* ]]; then
        log INFO "Checking Linode services..."
        if curl -sf --max-time 10 "https://dashboard.evindrake.net" &>/dev/null; then
            log INFO "  Dashboard: healthy"
            health_details+="Linode Dashboard: ✓\n"
        else
            log WARN "  Dashboard: not responding"
            health_details+="Linode Dashboard: ✗\n"
            all_healthy=false
        fi
    fi
    
    if [[ "$TARGETS" == *"windows"* ]]; then
        log INFO "Checking Windows AI services..."
        if curl -sf --max-time 5 "http://$WINDOWS_HOST:11434/api/tags" &>/dev/null; then
            log INFO "  Ollama: healthy"
            health_details+="Windows Ollama: ✓\n"
        else
            log WARN "  Ollama: not responding"
            health_details+="Windows Ollama: ✗\n"
        fi
    fi
    
    echo "$health_details"
    
    if [[ "$all_healthy" == "true" ]]; then
        return 0
    else
        return 1
    fi
}

run_deployment() {
    local start_time=$(date +%s)
    local failed_targets=()
    
    mkdir -p "$(dirname "$DEPLOY_LOG")"
    
    if [[ "$TARGETS" == "auto" ]]; then
        TARGETS=$(auto_detect_targets)
        
        if [[ -z "$TARGETS" ]]; then
            log INFO "No deployments needed - everything is up to date"
            send_discord_notification "Skipped" "No changes detected" 8421504
            return 0
        fi
    fi
    
    log INFO "Deployment targets: $TARGETS"
    
    send_discord_notification "Started" "Deploying to: $TARGETS" 3447003
    
    IFS=' ,' read -ra target_list <<< "$TARGETS"
    
    for target in "${target_list[@]}"; do
        if ! deploy_target "$target"; then
            failed_targets+=("$target")
        fi
    done
    
    local health_details=""
    if [[ "$SKIP_HEALTH" != "true" ]]; then
        health_details=$(run_health_checks) || true
    fi
    
    local duration=$(($(date +%s) - start_time))
    local duration_fmt="${duration}s"
    [[ $duration -ge 60 ]] && duration_fmt="$((duration / 60))m $((duration % 60))s"
    
    section "Deployment Summary"
    
    if [[ ${#failed_targets[@]} -eq 0 ]]; then
        log INFO "All deployments completed successfully in $duration_fmt"
        
        if [[ "$NOTIFY_ON_SUCCESS" == "true" ]]; then
            send_discord_notification "Success" "All targets deployed successfully in $duration_fmt" 3066993 "$health_details"
        fi
        
        return 0
    else
        log ERROR "Failed targets: ${failed_targets[*]}"
        
        if [[ "$NOTIFY_ON_FAILURE" == "true" ]]; then
            send_discord_notification "Failed" "Failed targets: ${failed_targets[*]}" 15158332 "$health_details"
        fi
        
        return 1
    fi
}

usage() {
    cat << EOF
${BOLD}Nebula Command - Automated Deployment${NC}

${CYAN}USAGE:${NC}
    $(basename "$0") [OPTIONS]

${CYAN}OPTIONS:${NC}
    -t, --targets TARGETS   Comma-separated targets: local,linode,windows,auto (default: auto)
    -f, --force             Deploy even if no changes detected
    -s, --skip-health       Skip post-deployment health checks
    -w, --webhook URL       Discord webhook URL for notifications
    --no-notify             Disable all notifications
    -n, --dry-run           Show what would be done without executing
    -v, --verbose           Enable verbose output
    -h, --help              Show this help

${CYAN}EXAMPLES:${NC}
    $(basename "$0")                        # Auto-detect and deploy changes
    $(basename "$0") -t local,linode        # Deploy to specific targets
    $(basename "$0") -f                     # Force deploy everything
    $(basename "$0") -w "https://..."       # Deploy with Discord notifications

${CYAN}AUTO-DETECTION:${NC}
    When using 'auto' target (default), the script:
    1. Checks git history for changes in relevant directories
    2. Compares remote vs local commit hashes
    3. Only deploys targets that have changes
    4. Skips targets that are up-to-date

${CYAN}NOTIFICATIONS:${NC}
    Set DISCORD_WEBHOOK environment variable or use -w flag
    Notifications include: deployment status, duration, health check results

${CYAN}ENVIRONMENT VARIABLES:${NC}
    DISCORD_WEBHOOK     Discord webhook URL for notifications
    LINODE_HOST         Linode server IP (default: 69.164.211.205)
    LINODE_USER         Linode SSH user (default: root)
    WINDOWS_HOST        Windows VM IP (default: 100.118.44.102)
    WINDOWS_USER        Windows SSH user (default: Evin)
EOF
}

main() {
    while [[ $# -gt 0 ]]; do
        case "$1" in
            -t|--targets)
                TARGETS="$2"
                shift 2
                ;;
            -f|--force)
                FORCE_UPDATE=true
                shift
                ;;
            -s|--skip-health)
                SKIP_HEALTH=true
                shift
                ;;
            -w|--webhook)
                DISCORD_WEBHOOK="$2"
                shift 2
                ;;
            --no-notify)
                NOTIFY_ON_SUCCESS=false
                NOTIFY_ON_FAILURE=false
                shift
                ;;
            -n|--dry-run)
                DRY_RUN=true
                shift
                ;;
            -v|--verbose)
                VERBOSE=true
                export DEBUG=1
                shift
                ;;
            -h|--help)
                usage
                exit 0
                ;;
            *)
                log ERROR "Unknown option: $1"
                usage
                exit 1
                ;;
        esac
    done
    
    print_banner
    
    [[ "$DRY_RUN" == "true" ]] && log WARN "DRY-RUN MODE - No changes will be made"
    [[ "$FORCE_UPDATE" == "true" ]] && log INFO "FORCE MODE - Deploying regardless of changes"
    
    run_deployment
}

main "$@"
