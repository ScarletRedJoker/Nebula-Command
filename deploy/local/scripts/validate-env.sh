#!/bin/bash
# Environment Variable Validation for Local Ubuntu Deployment
# Validates all required and optional variables from .env.example
# Run: ./validate-env.sh

set -euo pipefail

SCRIPT_DIR="$(cd "$(dirname "${BASH_SOURCE[0]}")" && pwd)"
DEPLOY_DIR="$(dirname "$SCRIPT_DIR")"
ENV_FILE="${DEPLOY_DIR}/.env"

RED='\033[0;31m'
GREEN='\033[0;32m'
YELLOW='\033[1;33m'
BLUE='\033[0;34m'
MAGENTA='\033[0;35m'
NC='\033[0m'

print_header() {
    echo ""
    echo -e "${BLUE}═══════════════════════════════════════════════════════════════${NC}"
    echo -e "${BLUE}  $1${NC}"
    echo -e "${BLUE}═══════════════════════════════════════════════════════════════${NC}"
}

print_section() {
    echo ""
    echo -e "${YELLOW}━━━ $1 ━━━${NC}"
}

ERRORS=0
WARNINGS=0

is_placeholder() {
    local value=$1
    [[ -z "$value" ]] && return 0
    [[ "$value" == "your_"* ]] && return 0
    [[ "$value" == "GENERATE_ME"* ]] && return 0
    [[ "$value" == "claim-xxxxxxxxxxxxx" ]] && return 0
    [[ "$value" == "your_home_assistant_long_lived_token" ]] && return 0
    [[ "$value" == "your_plex_claim_token" ]] && return 0
    [[ "$value" == "your_linode_ip" ]] && return 0
    [[ "$value" == "your_sunshine_web_ui_password" ]] && return 0
    [[ "$value" == "your_nas_password" ]] && return 0
    [[ "$value" == "192.168.1.x" ]] && return 0
    return 1
}

mask_value() {
    local value=$1
    if [[ ${#value} -lt 8 ]]; then
        echo "****"
    else
        echo "${value:0:4}****${value: -4}"
    fi
}

check_required() {
    local var_name=$1
    local description=$2
    local value="${!var_name:-}"
    
    if [[ -z "$value" ]] || is_placeholder "$value"; then
        echo -e "  ${RED}[MISSING]${NC} $var_name - $description"
        ERRORS=$((ERRORS + 1))
        return 1
    else
        local masked=$(mask_value "$value")
        echo -e "  ${GREEN}[OK]${NC} $var_name = $masked"
        return 0
    fi
}

check_required_with_format() {
    local var_name=$1
    local description=$2
    local pattern=$3
    local value="${!var_name:-}"
    
    if [[ -z "$value" ]] || is_placeholder "$value"; then
        echo -e "  ${RED}[MISSING]${NC} $var_name - $description"
        ERRORS=$((ERRORS + 1))
        return 1
    elif [[ ! "$value" =~ $pattern ]]; then
        echo -e "  ${RED}[INVALID]${NC} $var_name - Must match format: $pattern"
        ERRORS=$((ERRORS + 1))
        return 1
    else
        local masked=$(mask_value "$value")
        echo -e "  ${GREEN}[OK]${NC} $var_name = $masked"
        return 0
    fi
}

check_optional() {
    local var_name=$1
    local description=$2
    local value="${!var_name:-}"
    
    if [[ -z "$value" ]] || is_placeholder "$value"; then
        echo -e "  ${MAGENTA}[OPTIONAL]${NC} $var_name - $description (not set)"
        WARNINGS=$((WARNINGS + 1))
        return 1
    else
        local masked=$(mask_value "$value")
        echo -e "  ${GREEN}[OK]${NC} $var_name = $masked"
        return 0
    fi
}

check_service_dependency() {
    local var_name=$1
    local service_name=$2
    local description=$3
    local value="${!var_name:-}"
    
    if [[ -z "$value" ]] || is_placeholder "$value"; then
        echo -e "  ${YELLOW}[SERVICE]${NC} $var_name - Required for $service_name ($description)"
        WARNINGS=$((WARNINGS + 1))
        return 1
    else
        local masked=$(mask_value "$value")
        echo -e "  ${GREEN}[OK]${NC} $var_name = $masked"
        return 0
    fi
}

print_header "Local Environment Variable Validation"
echo "  Checking: $ENV_FILE"

if [[ ! -f "$ENV_FILE" ]]; then
    echo -e "\n${RED}[FATAL] .env file not found at $ENV_FILE${NC}"
    echo ""
    echo "  Create one from .env.example:"
    echo "    cp .env.example .env"
    echo ""
    echo "  Or run the environment doctor to set up:"
    echo "    ./scripts/env-doctor.sh --fix"
    echo ""
    exit 1
fi

set -a
source "$ENV_FILE"
set +a

print_section "MinIO Object Storage (REQUIRED)"
check_required "MINIO_ROOT_USER" "MinIO admin username"
check_required "MINIO_ROOT_PASSWORD" "MinIO admin password"

print_section "Plex Media Server (REQUIRED for Plex)"
check_service_dependency "PLEX_TOKEN" "Plex" "Authentication token from plex.tv"
check_required_with_format "PLEX_CLAIM" "Plex claim token (4 minute validity)" "^claim-.*"

print_section "Home Assistant (REQUIRED for Home Assistant)"
check_service_dependency "HOME_ASSISTANT_TOKEN" "Home Assistant" "Long-lived access token"

print_section "VNC Remote Desktop (OPTIONAL)"
check_optional "VNC_PASSWORD" "VNC connection password (min 6 chars)"

print_section "Sunshine GameStream (OPTIONAL)"
check_optional "SUNSHINE_PASS" "Sunshine web UI password"
check_optional "WINDOWS_VM_IP" "Windows VM IP for GameStream"

print_section "WireGuard VPN (OPTIONAL)"
check_optional "WIREGUARD_IP" "This host's WireGuard IP"
check_optional "WIREGUARD_PEER_IP" "Linode WireGuard IP"
check_optional "LINODE_PUBLIC_IP" "Linode server public IP"

print_section "NAS Access (OPTIONAL)"
check_optional "NAS_HOST" "NAS IP address"
check_optional "NAS_USER" "NAS username"
check_optional "NAS_PASSWORD" "NAS password"

print_section "System Configuration"
check_optional "TZ" "Timezone (defaults to America/New_York)"

print_header "Validation Summary"

TOTAL_ISSUES=$((ERRORS + WARNINGS))

if [[ $ERRORS -gt 0 ]]; then
    echo -e "  ${RED}[FAILED]${NC} $ERRORS required/service variable(s) missing"
    echo -e "  ${YELLOW}[INFO]${NC} $WARNINGS optional variable(s) not set"
    echo ""
    echo -e "  ${YELLOW}Some services may not function properly.${NC}"
    echo ""
    echo "  To auto-fix fixable variables:"
    echo "    ./scripts/env-doctor.sh --fix"
    echo ""
    echo "  To edit manually:"
    echo "    nano $ENV_FILE"
    echo ""
    exit 1
else
    echo -e "  ${GREEN}[PASSED]${NC} All required variables are set"
    if [[ $WARNINGS -gt 0 ]]; then
        echo -e "  ${YELLOW}[INFO]${NC} $WARNINGS optional variable(s) not set (some services may have limited functionality)"
    fi
    echo ""
    echo -e "  ${GREEN}Environment validation successful!${NC}"
    exit 0
fi
