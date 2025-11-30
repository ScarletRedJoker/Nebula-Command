#!/bin/bash
# ═══════════════════════════════════════════════════════════════════
# RENDER-ENV - Idempotent Environment Variable Generator
# ═══════════════════════════════════════════════════════════════════
# Creates a .env file from template, preserving existing values and
# only generating secrets when missing. Safe to run multiple times.
#
# Usage:
#   ./deploy/scripts/render-env.sh [options]
#
# Options:
#   --output FILE       Output file (default: .env)
#   --template FILE     Template file (default: .env.example)
#   --force             Regenerate all secrets (creates backup first)
#   --linode-ip IP      Set Linode Tailscale IP
#   --local-ip IP       Set Local host Tailscale IP
#   --domain DOMAIN     Primary domain (default: evindrake.net)
#
# Features:
#   - IDEMPOTENT: Only generates secrets when missing
#   - Creates backup before modifications
#   - Links services via consistent environment variables
#   - Supports multi-server setup with Tailscale IPs
# ═══════════════════════════════════════════════════════════════════

set -euo pipefail

# Colors
RED='\033[0;31m'
GREEN='\033[0;32m'
YELLOW='\033[1;33m'
CYAN='\033[0;36m'
NC='\033[0m'

# Defaults
PROJECT_ROOT="$(cd "$(dirname "${BASH_SOURCE[0]}")/../.." && pwd)"
OUTPUT_FILE="$PROJECT_ROOT/.env"
TEMPLATE_FILE="$PROJECT_ROOT/.env.example"
FORCE_REGENERATE=false
LINODE_IP=""
LOCAL_IP=""
DOMAIN="evindrake.net"

# Parse arguments
while [[ $# -gt 0 ]]; do
    case "$1" in
        --output) OUTPUT_FILE="$2"; shift 2 ;;
        --template) TEMPLATE_FILE="$2"; shift 2 ;;
        --force) FORCE_REGENERATE=true; shift ;;
        --linode-ip) LINODE_IP="$2"; shift 2 ;;
        --local-ip) LOCAL_IP="$2"; shift 2 ;;
        --domain) DOMAIN="$2"; shift 2 ;;
        *) shift ;;
    esac
done

echo -e "${CYAN}═══════════════════════════════════════════════════════════════${NC}"
echo -e "${CYAN}  RENDER-ENV - Idempotent Environment Generator${NC}"
echo -e "${CYAN}═══════════════════════════════════════════════════════════════${NC}"
echo ""

# Check template exists
if [ ! -f "$TEMPLATE_FILE" ]; then
    echo -e "${RED}✗ Template file not found: $TEMPLATE_FILE${NC}"
    exit 1
fi

# Generate secure values
generate_password() {
    openssl rand -base64 24 | tr -d '/+=' | head -c 32
}

generate_hex() {
    local length=${1:-32}
    openssl rand -hex "$length"
}

generate_api_key() {
    echo "hlh_$(generate_hex 24)"
}

# Function to get existing value from .env or return empty
get_existing_value() {
    local var_name="$1"
    if [ -f "$OUTPUT_FILE" ]; then
        grep "^${var_name}=" "$OUTPUT_FILE" 2>/dev/null | cut -d'=' -f2- || echo ""
    else
        echo ""
    fi
}

# Function to set a variable, preserving existing values unless force is set
set_var_if_empty() {
    local var_name="$1"
    local new_value="$2"
    local existing=$(get_existing_value "$var_name")
    
    if [ -n "$existing" ] && [ "$FORCE_REGENERATE" = false ]; then
        echo -e "  ${CYAN}= ${var_name} (preserved existing)${NC}"
        echo "$existing"
    else
        if [ -n "$existing" ]; then
            echo -e "  ${YELLOW}~ ${var_name} (regenerated)${NC}"
        else
            echo -e "  ${GREEN}+ ${var_name} (generated)${NC}"
        fi
        echo "$new_value"
    fi
}

# Create backup if output file exists and we're modifying it
if [ -f "$OUTPUT_FILE" ]; then
    BACKUP_FILE="${OUTPUT_FILE}.backup.$(date +%Y%m%d_%H%M%S)"
    cp "$OUTPUT_FILE" "$BACKUP_FILE"
    echo -e "${YELLOW}⚠ Created backup: $BACKUP_FILE${NC}"
    echo ""
fi

# Start with template
cp "$TEMPLATE_FILE" "$OUTPUT_FILE.tmp"

echo "Processing environment variables..."
echo ""

# Generate or preserve core secrets
POSTGRES_PASSWORD=$(set_var_if_empty "POSTGRES_PASSWORD" "$(generate_password)")
WEB_PASSWORD=$(set_var_if_empty "WEB_PASSWORD" "$(generate_password)")
SESSION_SECRET=$(set_var_if_empty "SESSION_SECRET" "$(generate_hex 32)")
SECRET_KEY=$(set_var_if_empty "SECRET_KEY" "$(generate_hex 32)")
DASHBOARD_API_KEY=$(set_var_if_empty "DASHBOARD_API_KEY" "$(generate_api_key)")
SERVICE_AUTH_TOKEN=$(set_var_if_empty "SERVICE_AUTH_TOKEN" "$(generate_hex 32)")

# Database passwords
DISCORD_DB_PASSWORD=$(set_var_if_empty "DISCORD_DB_PASSWORD" "$(generate_password)")
STREAMBOT_DB_PASSWORD=$(set_var_if_empty "STREAMBOT_DB_PASSWORD" "$(generate_password)")
JARVIS_DB_PASSWORD=$(set_var_if_empty "JARVIS_DB_PASSWORD" "$(generate_password)")

# Session secrets
DISCORD_SESSION_SECRET=$(set_var_if_empty "DISCORD_SESSION_SECRET" "$(generate_hex 32)")
STREAMBOT_SESSION_SECRET=$(set_var_if_empty "STREAMBOT_SESSION_SECRET" "$(generate_hex 32)")

# Code server
CODE_SERVER_PASSWORD=$(set_var_if_empty "CODE_SERVER_PASSWORD" "$(generate_password)")

echo ""

# Function to replace in temp file
replace_in_temp() {
    local var_name="$1"
    local value="$2"
    
    if grep -q "^${var_name}=" "$OUTPUT_FILE.tmp"; then
        sed -i "s|^${var_name}=.*|${var_name}=${value}|" "$OUTPUT_FILE.tmp"
    else
        echo "${var_name}=${value}" >> "$OUTPUT_FILE.tmp"
    fi
}

# Apply all values to temp file
replace_in_temp "POSTGRES_PASSWORD" "$POSTGRES_PASSWORD"
replace_in_temp "WEB_PASSWORD" "$WEB_PASSWORD"
replace_in_temp "SESSION_SECRET" "$SESSION_SECRET"
replace_in_temp "SECRET_KEY" "$SECRET_KEY"
replace_in_temp "DASHBOARD_API_KEY" "$DASHBOARD_API_KEY"
replace_in_temp "SERVICE_AUTH_TOKEN" "$SERVICE_AUTH_TOKEN"
replace_in_temp "DISCORD_DB_PASSWORD" "$DISCORD_DB_PASSWORD"
replace_in_temp "STREAMBOT_DB_PASSWORD" "$STREAMBOT_DB_PASSWORD"
replace_in_temp "JARVIS_DB_PASSWORD" "$JARVIS_DB_PASSWORD"
replace_in_temp "DISCORD_SESSION_SECRET" "$DISCORD_SESSION_SECRET"
replace_in_temp "STREAMBOT_SESSION_SECRET" "$STREAMBOT_SESSION_SECRET"
replace_in_temp "CODE_SERVER_PASSWORD" "$CODE_SERVER_PASSWORD"

# Set Tailscale IPs if provided
if [ -n "$LINODE_IP" ]; then
    replace_in_temp "TAILSCALE_LINODE_HOST" "$LINODE_IP"
fi
if [ -n "$LOCAL_IP" ]; then
    replace_in_temp "TAILSCALE_LOCAL_HOST" "$LOCAL_IP"
fi

# Set domain-based URLs
replace_in_temp "DASHBOARD_URL" "https://host.${DOMAIN}"

# Database URLs
replace_in_temp "DASHBOARD_DATABASE_URL" "postgresql://dashboard:${POSTGRES_PASSWORD}@homelab-postgres:5432/homelab_dashboard"
replace_in_temp "DISCORD_DATABASE_URL" "postgresql://discord:${DISCORD_DB_PASSWORD}@homelab-postgres:5432/homelab_discord"
replace_in_temp "STREAMBOT_DATABASE_URL" "postgresql://streambot:${STREAMBOT_DB_PASSWORD}@homelab-postgres:5432/homelab_streambot"
replace_in_temp "JARVIS_DATABASE_URL" "postgresql://jarvis:${JARVIS_DB_PASSWORD}@homelab-postgres:5432/homelab_jarvis"

# Move temp to final
mv "$OUTPUT_FILE.tmp" "$OUTPUT_FILE"

# Secure file permissions
chmod 600 "$OUTPUT_FILE"

echo -e "${GREEN}✓ Environment file ready: $OUTPUT_FILE${NC}"
echo ""

# Summary
echo -e "${CYAN}═══════════════════════════════════════════════════════════════${NC}"
echo -e "${GREEN}✅ ENVIRONMENT GENERATED${NC}"
echo ""
echo "File: $OUTPUT_FILE"
echo "Backup: ${BACKUP_FILE:-none}"
echo ""
echo -e "${YELLOW}Remember to add API keys that require external accounts:${NC}"
echo "  - DISCORD_BOT_TOKEN"
echo "  - OPENAI_API_KEY"
echo "  - TWITCH_CLIENT_ID / TWITCH_CLIENT_SECRET"
echo "  - CLOUDFLARE_API_TOKEN"
echo ""
echo -e "${CYAN}═══════════════════════════════════════════════════════════════${NC}"
