#!/bin/bash
# Smart Environment Doctor for Local Ubuntu Deployment
# Intelligently validates, diagnoses, and fixes environment variables
# Run: ./env-doctor.sh [--fix] [--check-only]

set -euo pipefail

SCRIPT_DIR="$(cd "$(dirname "${BASH_SOURCE[0]}")" && pwd)"
DEPLOY_DIR="$(dirname "$SCRIPT_DIR")"
ENV_FILE="${DEPLOY_DIR}/.env"
ENV_EXAMPLE="${DEPLOY_DIR}/.env.example"

RED='\033[0;31m'
GREEN='\033[0;32m'
YELLOW='\033[1;33m'
BLUE='\033[0;34m'
CYAN='\033[0;36m'
MAGENTA='\033[0;35m'
NC='\033[0m'
BOLD='\033[1m'

AUTO_FIX=false
CHECK_ONLY=false
QUIET=false

FIXES_NEEDED=()
FIXES_APPLIED=()
MANUAL_REQUIRED=()
WARNINGS=()
ALL_OK=()

print_header() {
    echo ""
    echo -e "${BLUE}═══════════════════════════════════════════════════════════════${NC}"
    echo -e "${BLUE}  $1${NC}"
    echo -e "${BLUE}═══════════════════════════════════════════════════════════════${NC}"
}

print_section() {
    echo ""
    echo -e "${CYAN}━━━ $1 ━━━${NC}"
}

log_ok() {
    local var_name=$1
    local value=$2
    local masked
    if [[ ${#value} -lt 8 ]]; then
        masked="****"
    else
        masked="${value:0:4}****${value: -4}"
    fi
    echo -e "  ${GREEN}[OK]${NC} ${var_name} = ${masked}"
    ALL_OK+=("$var_name")
}

log_fixable() {
    local var_name=$1
    local issue=$2
    echo -e "  ${YELLOW}[FIXABLE]${NC} ${var_name} - ${issue}"
    FIXES_NEEDED+=("$var_name")
}

log_manual() {
    local var_name=$1
    local instruction=$2
    echo -e "  ${RED}[MANUAL]${NC} ${var_name} - ${instruction}"
    MANUAL_REQUIRED+=("$var_name:$instruction")
}

log_optional() {
    local var_name=$1
    local description=$2
    echo -e "  ${MAGENTA}[OPTIONAL]${NC} ${var_name} - ${description} (not set)"
    WARNINGS+=("$var_name")
}

log_fixed() {
    local var_name=$1
    echo -e "  ${GREEN}[FIXED]${NC} ${var_name} - auto-generated"
    FIXES_APPLIED+=("$var_name")
}

generate_password() {
    local length=${1:-24}
    if command -v openssl &>/dev/null; then
        openssl rand -base64 $((length * 3 / 4)) 2>/dev/null | tr -d '\n' | head -c "$length"
    else
        # Fallback to /dev/urandom if openssl not available
        tr -dc 'A-Za-z0-9!@#$%^&*' < /dev/urandom 2>/dev/null | head -c "$length" || \
        cat /dev/urandom | LC_ALL=C tr -dc 'A-Za-z0-9' | head -c "$length"
    fi
}

generate_short_password() {
    local length=${1:-8}
    if command -v openssl &>/dev/null; then
        openssl rand -base64 12 2>/dev/null | tr -d '/+=' | head -c "$length"
    else
        # Fallback to /dev/urandom if openssl not available
        tr -dc 'A-Za-z0-9' < /dev/urandom 2>/dev/null | head -c "$length" || \
        cat /dev/urandom | LC_ALL=C tr -dc 'A-Za-z0-9' | head -c "$length"
    fi
}

get_var_value() {
    local var_name=$1
    grep "^${var_name}=" "$ENV_FILE" 2>/dev/null | cut -d'=' -f2- | sed 's/^"//' | sed 's/"$//' || echo ""
}

set_var_value() {
    local var_name=$1
    local value=$2
    
    if grep -q "^${var_name}=" "$ENV_FILE" 2>/dev/null; then
        sed -i "s|^${var_name}=.*|${var_name}=${value}|" "$ENV_FILE"
    else
        echo "${var_name}=${value}" >> "$ENV_FILE"
    fi
}

is_valid_value() {
    local value=$1
    local var_name=${2:-}
    
    [[ -z "$value" ]] && return 1
    
    [[ "$value" == "your_"* ]] && return 1
    [[ "$value" == "GENERATE_ME"* ]] && return 1
    [[ "$value" == "claim-xxxxxxxxxxxxx" ]] && return 1
    [[ "$value" == "your_home_assistant_long_lived_token" ]] && return 1
    [[ "$value" == "your_plex_claim_token" ]] && return 1
    [[ "$value" == "your_linode_ip" ]] && return 1
    [[ "$value" == "your_sunshine_web_ui_password" ]] && return 1
    [[ "$value" == "your_nas_password" ]] && return 1
    [[ "$value" == "192.168.1.x" ]] && return 1
    
    return 0
}

check_and_fix_minio_user() {
    local value=$(get_var_value "MINIO_ROOT_USER")
    
    if is_valid_value "$value"; then
        log_ok "MINIO_ROOT_USER" "$value"
        return 0
    fi
    
    if [[ "$AUTO_FIX" == "true" ]]; then
        set_var_value "MINIO_ROOT_USER" "minioadmin"
        log_fixed "MINIO_ROOT_USER"
    else
        log_fixable "MINIO_ROOT_USER" "Empty or placeholder (can auto-generate)"
    fi
}

check_and_fix_minio_password() {
    local value=$(get_var_value "MINIO_ROOT_PASSWORD")
    
    if is_valid_value "$value" "MINIO_ROOT_PASSWORD"; then
        log_ok "MINIO_ROOT_PASSWORD" "$value"
        return 0
    fi
    
    if [[ "$AUTO_FIX" == "true" ]]; then
        local new_pass=$(generate_password 24)
        set_var_value "MINIO_ROOT_PASSWORD" "$new_pass"
        log_fixed "MINIO_ROOT_PASSWORD"
    else
        log_fixable "MINIO_ROOT_PASSWORD" "Empty or placeholder (can auto-generate secure password)"
    fi
}

check_plex_token() {
    local value=$(get_var_value "PLEX_TOKEN")
    
    if is_valid_value "$value"; then
        log_ok "PLEX_TOKEN" "$value"
        return 0
    fi
    
    log_manual "PLEX_TOKEN" "Get from: https://www.plex.tv/claim/ -> X-Plex-Token in URL"
}

check_plex_claim() {
    local value=$(get_var_value "PLEX_CLAIM")
    
    if is_valid_value "$value"; then
        if [[ "$value" == claim-* ]]; then
            log_ok "PLEX_CLAIM" "$value"
        else
            log_manual "PLEX_CLAIM" "Must start with 'claim-'. Get from: https://www.plex.tv/claim/"
        fi
        return 0
    fi
    
    log_manual "PLEX_CLAIM" "Get claim token from: https://www.plex.tv/claim/"
}

check_home_assistant_token() {
    local value=$(get_var_value "HOME_ASSISTANT_TOKEN")
    
    if is_valid_value "$value"; then
        log_ok "HOME_ASSISTANT_TOKEN" "$value"
        return 0
    fi
    
    log_manual "HOME_ASSISTANT_TOKEN" "Generate in Home Assistant: Profile -> Long-Lived Access Tokens -> Create Token"
}

check_and_fix_vnc_password() {
    local value=$(get_var_value "VNC_PASSWORD")
    
    if is_valid_value "$value" && [[ ${#value} -ge 6 ]]; then
        log_ok "VNC_PASSWORD" "$value"
        return 0
    fi
    
    if [[ "$AUTO_FIX" == "true" ]]; then
        local new_pass=$(generate_short_password 8)
        set_var_value "VNC_PASSWORD" "$new_pass"
        log_fixed "VNC_PASSWORD"
    else
        log_fixable "VNC_PASSWORD" "Empty or too short (can auto-generate 8-char password)"
    fi
}

check_and_fix_sunshine_pass() {
    local value=$(get_var_value "SUNSHINE_PASS")
    
    if is_valid_value "$value"; then
        log_ok "SUNSHINE_PASS" "$value"
        return 0
    fi
    
    if [[ "$AUTO_FIX" == "true" ]]; then
        local new_pass=$(generate_password 16)
        set_var_value "SUNSHINE_PASS" "$new_pass"
        log_fixed "SUNSHINE_PASS"
    else
        log_fixable "SUNSHINE_PASS" "Empty or placeholder (can auto-generate)"
    fi
}

check_wireguard_ip() {
    local value=$(get_var_value "WIREGUARD_IP")
    
    if is_valid_value "$value"; then
        log_ok "WIREGUARD_IP" "$value"
        return 0
    fi
    
    log_optional "WIREGUARD_IP" "WireGuard IP for VPN tunnel"
}

check_wireguard_peer_ip() {
    local value=$(get_var_value "WIREGUARD_PEER_IP")
    
    if is_valid_value "$value"; then
        log_ok "WIREGUARD_PEER_IP" "$value"
        return 0
    fi
    
    log_optional "WIREGUARD_PEER_IP" "Linode WireGuard IP"
}

check_linode_public_ip() {
    local value=$(get_var_value "LINODE_PUBLIC_IP")
    
    if is_valid_value "$value"; then
        log_ok "LINODE_PUBLIC_IP" "$value"
        return 0
    fi
    
    log_optional "LINODE_PUBLIC_IP" "Linode server public IP"
}

check_windows_vm_ip() {
    local value=$(get_var_value "WINDOWS_VM_IP")
    
    if is_valid_value "$value"; then
        log_ok "WINDOWS_VM_IP" "$value"
        return 0
    fi
    
    log_optional "WINDOWS_VM_IP" "Windows VM IP for Sunshine GameStream"
}

check_nas_host() {
    local value=$(get_var_value "NAS_HOST")
    
    if is_valid_value "$value"; then
        log_ok "NAS_HOST" "$value"
        return 0
    fi
    
    log_optional "NAS_HOST" "NAS IP address for media storage"
}

check_nas_user() {
    local value=$(get_var_value "NAS_USER")
    
    if is_valid_value "$value"; then
        log_ok "NAS_USER" "$value"
        return 0
    fi
    
    log_optional "NAS_USER" "NAS username for mounting"
}

check_nas_password() {
    local value=$(get_var_value "NAS_PASSWORD")
    
    if is_valid_value "$value"; then
        log_ok "NAS_PASSWORD" "$value"
        return 0
    fi
    
    log_optional "NAS_PASSWORD" "NAS password for mounting"
}

check_cloudflare_tunnel_token() {
    local token=$(get_var_value "CLOUDFLARE_TUNNEL_TOKEN")
    local tunnel_id=$(get_var_value "CLOUDFLARE_TUNNEL_ID")
    
    if is_valid_value "$token"; then
        log_ok "CLOUDFLARE_TUNNEL_TOKEN" "$token"
        return 0
    fi
    
    if is_valid_value "$tunnel_id"; then
        if [[ -f "${DEPLOY_DIR}/config/cloudflared/credentials.json" ]]; then
            log_ok "CLOUDFLARE_TUNNEL_ID" "$tunnel_id (using credentials file)"
            return 0
        else
            log_manual "CLOUDFLARE_TUNNEL_ID" "Set, but missing credentials.json. Copy from ~/.cloudflared/${tunnel_id}.json"
            return 1
        fi
    fi
    
    log_optional "CLOUDFLARE_TUNNEL_TOKEN" "Cloudflare Tunnel for external access (see docs/deploy/CLOUDFLARE_TUNNEL.md)"
}

check_storage_discord_webhook() {
    local value=$(get_var_value "STORAGE_ALERT_DISCORD_WEBHOOK")
    
    if is_valid_value "$value"; then
        if [[ "$value" == https://discord.com/api/webhooks/* ]] || [[ "$value" == https://discordapp.com/api/webhooks/* ]]; then
            log_ok "STORAGE_ALERT_DISCORD_WEBHOOK" "$value"
        else
            log_manual "STORAGE_ALERT_DISCORD_WEBHOOK" "Invalid webhook URL format"
        fi
        return 0
    fi
    
    log_optional "STORAGE_ALERT_DISCORD_WEBHOOK" "Discord alerts for storage health issues"
}

check_zfs_enabled() {
    local value=$(get_var_value "ZFS_ENABLED")
    
    if [[ "$value" == "true" ]] || [[ "$value" == "false" ]]; then
        log_ok "ZFS_ENABLED" "$value"
        return 0
    fi
    
    if [[ "$AUTO_FIX" == "true" ]]; then
        set_var_value "ZFS_ENABLED" "false"
        log_fixed "ZFS_ENABLED"
    else
        log_fixable "ZFS_ENABLED" "Not set (defaulting to false)"
    fi
}

check_timezone() {
    local value=$(get_var_value "TZ")
    
    if is_valid_value "$value"; then
        log_ok "TZ" "$value"
        return 0
    fi
    
    if [[ "$AUTO_FIX" == "true" ]]; then
        set_var_value "TZ" "America/New_York"
        log_fixed "TZ"
    else
        log_fixable "TZ" "Empty (defaulting to America/New_York)"
    fi
}

ensure_env_file() {
    if [[ ! -f "$ENV_FILE" ]]; then
        if [[ -f "$ENV_EXAMPLE" ]]; then
            echo -e "${YELLOW}Creating .env from .env.example...${NC}"
            cp "$ENV_EXAMPLE" "$ENV_FILE"
        else
            echo -e "${YELLOW}Creating empty .env file...${NC}"
            touch "$ENV_FILE"
        fi
    fi
}

prompt_fix() {
    if [[ "$CHECK_ONLY" == "true" ]]; then
        return 1
    fi
    
    if [[ "$AUTO_FIX" == "true" ]]; then
        return 0
    fi
    
    echo ""
    echo -e "${YELLOW}Would you like to auto-fix the ${#FIXES_NEEDED[@]} fixable variable(s)? [y/N]${NC}"
    read -r response
    if [[ "$response" =~ ^[Yy]$ ]]; then
        return 0
    fi
    return 1
}

run_diagnosis() {
    print_header "Environment Doctor - Local Deployment"
    echo "  Checking: $ENV_FILE"
    
    ensure_env_file
    
    print_section "MinIO Object Storage"
    check_and_fix_minio_user
    check_and_fix_minio_password
    
    print_section "Plex Media Server"
    check_plex_token
    check_plex_claim
    
    print_section "Home Assistant"
    check_home_assistant_token
    
    print_section "VNC Remote Desktop"
    check_and_fix_vnc_password
    
    print_section "Sunshine GameStream"
    check_and_fix_sunshine_pass
    check_windows_vm_ip
    
    print_section "WireGuard VPN (Optional)"
    check_wireguard_ip
    check_wireguard_peer_ip
    check_linode_public_ip
    
    print_section "NAS Access (Optional)"
    check_nas_host
    check_nas_user
    check_nas_password
    
    print_section "Cloudflare Tunnel (Recommended)"
    check_cloudflare_tunnel_token
    
    print_section "Storage Monitoring (Optional)"
    check_zfs_enabled
    check_storage_discord_webhook
    
    print_section "System"
    check_timezone
}

print_summary() {
    print_header "Diagnosis Summary"
    
    echo ""
    echo -e "  ${GREEN}Valid:${NC}    ${#ALL_OK[@]} variable(s)"
    echo -e "  ${YELLOW}Fixable:${NC}  ${#FIXES_NEEDED[@]} variable(s)"
    echo -e "  ${RED}Manual:${NC}   ${#MANUAL_REQUIRED[@]} variable(s)"
    echo -e "  ${MAGENTA}Optional:${NC} ${#WARNINGS[@]} variable(s) not set"
    
    if [[ ${#FIXES_APPLIED[@]} -gt 0 ]]; then
        echo ""
        echo -e "  ${GREEN}Auto-fixed:${NC} ${FIXES_APPLIED[*]}"
    fi
    
    if [[ ${#MANUAL_REQUIRED[@]} -gt 0 ]]; then
        echo ""
        echo -e "${BOLD}Manual Actions Required:${NC}"
        echo ""
        for item in "${MANUAL_REQUIRED[@]}"; do
            local var_name="${item%%:*}"
            local instruction="${item#*:}"
            echo -e "  ${RED}•${NC} ${BOLD}${var_name}${NC}"
            echo -e "    ${instruction}"
            echo ""
        done
    fi
    
    if [[ ${#FIXES_NEEDED[@]} -gt 0 ]] && [[ "$AUTO_FIX" != "true" ]] && [[ "$CHECK_ONLY" != "true" ]]; then
        echo ""
        echo -e "${YELLOW}To auto-fix all fixable variables, run:${NC}"
        echo "  $0 --fix"
    fi
}

show_help() {
    echo "Environment Doctor for Local Ubuntu Deployment"
    echo ""
    echo "Usage: $0 [OPTIONS]"
    echo ""
    echo "Options:"
    echo "  --fix         Auto-fix all fixable variables (generate passwords, etc.)"
    echo "  --check-only  Only check, don't prompt for fixes"
    echo "  --quiet       Minimal output (exit code only)"
    echo "  --help        Show this help message"
    echo ""
    echo "Exit codes:"
    echo "  0 = All required variables are valid"
    echo "  1 = Manual action required for some variables"
    echo "  2 = Fixable issues found (use --fix to resolve)"
}

main() {
    for arg in "$@"; do
        case $arg in
            --fix)
                AUTO_FIX=true
                ;;
            --check-only)
                CHECK_ONLY=true
                ;;
            --quiet)
                QUIET=true
                ;;
            --help|-h)
                show_help
                exit 0
                ;;
            *)
                echo "Unknown option: $arg"
                show_help
                exit 1
                ;;
        esac
    done
    
    run_diagnosis
    
    if [[ ${#FIXES_NEEDED[@]} -gt 0 ]] && [[ "$AUTO_FIX" != "true" ]] && [[ "$CHECK_ONLY" != "true" ]]; then
        if prompt_fix; then
            echo ""
            echo -e "${CYAN}Applying fixes...${NC}"
            AUTO_FIX=true
            FIXES_NEEDED=()
            FIXES_APPLIED=()
            ALL_OK=()
            MANUAL_REQUIRED=()
            WARNINGS=()
            run_diagnosis
        fi
    fi
    
    print_summary
    
    if [[ ${#MANUAL_REQUIRED[@]} -gt 0 ]]; then
        exit 1
    elif [[ ${#FIXES_NEEDED[@]} -gt 0 ]]; then
        exit 2
    else
        echo ""
        echo -e "  ${GREEN}Environment is ready for local deployment!${NC}"
        exit 0
    fi
}

main "$@"
