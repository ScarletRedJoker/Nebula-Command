#!/bin/bash
set -euo pipefail

log_ok() { echo -e "\033[0;32m[OK]\033[0m $*"; }
log_warn() { echo -e "\033[0;33m[MISSING]\033[0m $*"; }
log_error() { echo -e "\033[0;31m[ERROR]\033[0m $*"; }
log_info() { echo -e "\033[0;34m[INFO]\033[0m $*"; }

ENVIRONMENT="${1:-all}"
ERRORS=0

echo "═══════════════════════════════════════════════════════════════"
echo "  Environment Doctor - Configuration Validator"
echo "═══════════════════════════════════════════════════════════════"
echo ""

check_var() {
    local var_name="$1"
    local required="${2:-true}"
    local description="${3:-}"
    
    if [[ -n "${!var_name:-}" ]]; then
        log_ok "$var_name is set"
        return 0
    elif [[ "$required" == "true" ]]; then
        log_warn "$var_name is not set"
        [[ -n "$description" ]] && echo "        → $description"
        ((ERRORS++)) || true
        return 1
    else
        log_info "$var_name is optional (not set)"
        return 0
    fi
}

check_file() {
    local file_path="$1"
    local description="${2:-}"
    
    if [[ -f "$file_path" ]]; then
        log_ok "File exists: $file_path"
        return 0
    else
        log_warn "File missing: $file_path"
        [[ -n "$description" ]] && echo "        → $description"
        ((ERRORS++)) || true
        return 1
    fi
}

check_command() {
    local cmd="$1"
    if command -v "$cmd" &>/dev/null; then
        log_ok "Command available: $cmd"
        return 0
    else
        log_warn "Command not found: $cmd"
        ((ERRORS++)) || true
        return 1
    fi
}

check_replit() {
    echo ""
    echo "━━━ Replit Environment ━━━"
    echo ""
    
    check_var "DATABASE_URL" true "PostgreSQL connection string"
    check_var "SESSION_SECRET" true "Flask session secret"
    check_var "OPENAI_API_KEY" false "OpenAI API key for Jarvis AI"
    check_var "DISCORD_BOT_TOKEN" true "Discord bot authentication"
    check_var "DISCORD_CLIENT_ID" true "Discord OAuth client ID"
    check_var "DISCORD_CLIENT_SECRET" true "Discord OAuth client secret"
    check_var "TWITCH_CLIENT_ID" false "Twitch API client ID"
    check_var "TWITCH_CLIENT_SECRET" false "Twitch API client secret"
    check_var "SPOTIFY_CLIENT_ID" false "Spotify API client ID"
    check_var "SPOTIFY_CLIENT_SECRET" false "Spotify API client secret"
    check_var "YOUTUBE_API_KEY" false "YouTube Data API key"
    check_var "GITHUB_TOKEN" false "GitHub API token for deployments"
}

check_local() {
    echo ""
    echo "━━━ Local Ubuntu Environment ━━━"
    echo ""
    
    check_command "docker"
    check_command "docker-compose" || check_command "docker"
    check_command "virsh"
    check_command "showmount"
    
    echo ""
    echo "NAS Configuration:"
    check_var "NAS_HOSTNAME" false "NAS hostname (default: NAS326.local)"
    
    if mountpoint -q /mnt/nas/all 2>/dev/null; then
        log_ok "NAS mounted at /mnt/nas/all"
    else
        log_warn "NAS not mounted at /mnt/nas/all"
        echo "        → Run: sudo ./deploy/local/scripts/setup-nas-mounts.sh"
    fi
    
    echo ""
    echo "Docker Services:"
    for container in plex homelab-minio homeassistant caddy-local; do
        if docker ps --format '{{.Names}}' | grep -q "^${container}$"; then
            log_ok "Container running: $container"
        else
            log_warn "Container not running: $container"
        fi
    done
    
    echo ""
    echo "Local .env files:"
    check_file "deploy/local/.env" "Copy from deploy/local/.env.example"
    check_file "services/plex/.env" "Optional: PLEX_CLAIM_TOKEN"
}

check_vm() {
    echo ""
    echo "━━━ Windows VM (Sunshine) Environment ━━━"
    echo ""
    
    check_command "virsh"
    
    local vm_name="${VM_NAME:-RDPWindows}"
    local vm_status
    vm_status=$(virsh domstate "$vm_name" 2>/dev/null || echo "not found")
    
    if [[ "$vm_status" == "running" ]]; then
        log_ok "VM '$vm_name' is running"
    elif [[ "$vm_status" == "shut off" ]]; then
        log_warn "VM '$vm_name' is shut off"
        echo "        → Run: ./deploy/local/scripts/start-sunshine-vm.sh"
    else
        log_warn "VM '$vm_name' not found"
        echo "        → Create Windows 11 VM with GPU passthrough"
    fi
    
    local vm_ip="${VM_IP:-192.168.122.250}"
    if timeout 2 nc -zv "$vm_ip" 47989 2>&1 | grep -q "succeeded"; then
        log_ok "Sunshine responding on $vm_ip:47989"
    else
        log_warn "Sunshine not responding on $vm_ip:47989"
    fi
    
    echo ""
    echo "WireGuard Tunnel:"
    if ip link show wg0 &>/dev/null; then
        log_ok "WireGuard interface wg0 is up"
        if ping -c 1 -W 2 10.200.0.1 &>/dev/null; then
            log_ok "Linode reachable via WireGuard (10.200.0.1)"
        else
            log_warn "Linode not reachable via WireGuard"
        fi
    else
        log_warn "WireGuard interface wg0 not found"
    fi
}

check_cloud() {
    echo ""
    echo "━━━ Cloud (Linode) Environment ━━━"
    echo ""
    
    echo "Required secrets (check on Linode server):"
    echo "  - DATABASE_URL"
    echo "  - SESSION_SECRET"
    echo "  - DISCORD_BOT_TOKEN"
    echo "  - DISCORD_CLIENT_ID"
    echo "  - DISCORD_CLIENT_SECRET"
    echo ""
    
    check_file "deploy/linode/.env.example" "Template for Linode deployment"
    check_file "deploy/scripts/bootstrap.sh" "Cloud bootstrap script"
    
    echo ""
    echo "GitHub Actions:"
    check_var "GITHUB_TOKEN" false "For triggering deployments"
    
    if [[ -f ".github/workflows/deploy.yml" ]]; then
        log_ok "GitHub Actions workflow exists"
    else
        log_warn "GitHub Actions workflow missing"
    fi
}

show_summary() {
    echo ""
    echo "═══════════════════════════════════════════════════════════════"
    if [[ $ERRORS -eq 0 ]]; then
        echo -e "  \033[0;32mAll checks passed!\033[0m"
    else
        echo -e "  \033[0;33m$ERRORS issue(s) found\033[0m"
    fi
    echo "═══════════════════════════════════════════════════════════════"
    echo ""
}

case "$ENVIRONMENT" in
    replit)
        check_replit
        ;;
    local)
        check_local
        ;;
    vm|sunshine)
        check_vm
        ;;
    cloud|linode)
        check_cloud
        ;;
    all|*)
        check_replit
        check_local
        check_vm
        check_cloud
        ;;
esac

show_summary
exit $ERRORS
