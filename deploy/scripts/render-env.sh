#!/bin/bash
# ═══════════════════════════════════════════════════════════════════
# RENDER-ENV - Generate environment variables from template
# ═══════════════════════════════════════════════════════════════════
# Creates a complete .env file with auto-generated secrets and
# deterministic linking between services.
#
# Usage:
#   ./deploy/scripts/render-env.sh [options]
#
# Options:
#   --output FILE       Output file (default: .env)
#   --template FILE     Template file (default: .env.example)
#   --role cloud|local  Deployment role
#   --linode-ip IP      Linode Tailscale IP
#   --local-ip IP       Local host Tailscale IP
#   --domain DOMAIN     Primary domain (default: evindrake.net)
#
# Features:
#   - Auto-generates all secrets (passwords, tokens, keys)
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
ROLE=""
LINODE_IP=""
LOCAL_IP=""
DOMAIN="evindrake.net"

# Parse arguments
while [[ $# -gt 0 ]]; do
    case "$1" in
        --output) OUTPUT_FILE="$2"; shift 2 ;;
        --template) TEMPLATE_FILE="$2"; shift 2 ;;
        --role) ROLE="$2"; shift 2 ;;
        --linode-ip) LINODE_IP="$2"; shift 2 ;;
        --local-ip) LOCAL_IP="$2"; shift 2 ;;
        --domain) DOMAIN="$2"; shift 2 ;;
        *) shift ;;
    esac
done

echo -e "${CYAN}═══════════════════════════════════════════════════════════════${NC}"
echo -e "${CYAN}  RENDER-ENV - Environment Variable Generator${NC}"
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

echo "Generating secrets..."

# Core secrets
POSTGRES_PASSWORD=$(generate_password)
WEB_PASSWORD=$(generate_password)
SESSION_SECRET=$(generate_hex 32)
SECRET_KEY=$(generate_hex 32)
DASHBOARD_API_KEY=$(generate_api_key)
SERVICE_AUTH_TOKEN=$(generate_hex 32)

# Database passwords
DISCORD_DB_PASSWORD=$(generate_password)
STREAMBOT_DB_PASSWORD=$(generate_password)
JARVIS_DB_PASSWORD=$(generate_password)

# Session secrets
DISCORD_SESSION_SECRET=$(generate_hex 32)
STREAMBOT_SESSION_SECRET=$(generate_hex 32)

# Code server
CODE_SERVER_PASSWORD=$(generate_password)

echo -e "${GREEN}✓ Secrets generated${NC}"

# Create output file from template
echo "Creating environment file..."
cp "$TEMPLATE_FILE" "$OUTPUT_FILE"

# Function to replace placeholder
replace_var() {
    local var_name="$1"
    local value="$2"
    
    if grep -q "^${var_name}=" "$OUTPUT_FILE"; then
        # Use | as delimiter to avoid issues with special chars
        sed -i "s|^${var_name}=.*|${var_name}=${value}|" "$OUTPUT_FILE"
    else
        echo "${var_name}=${value}" >> "$OUTPUT_FILE"
    fi
}

# Replace generated values
replace_var "POSTGRES_PASSWORD" "$POSTGRES_PASSWORD"
replace_var "WEB_PASSWORD" "$WEB_PASSWORD"
replace_var "SESSION_SECRET" "$SESSION_SECRET"
replace_var "SECRET_KEY" "$SECRET_KEY"
replace_var "DASHBOARD_API_KEY" "$DASHBOARD_API_KEY"
replace_var "SERVICE_AUTH_TOKEN" "$SERVICE_AUTH_TOKEN"
replace_var "DISCORD_DB_PASSWORD" "$DISCORD_DB_PASSWORD"
replace_var "STREAMBOT_DB_PASSWORD" "$STREAMBOT_DB_PASSWORD"
replace_var "JARVIS_DB_PASSWORD" "$JARVIS_DB_PASSWORD"
replace_var "DISCORD_SESSION_SECRET" "$DISCORD_SESSION_SECRET"
replace_var "STREAMBOT_SESSION_SECRET" "$STREAMBOT_SESSION_SECRET"
replace_var "CODE_SERVER_PASSWORD" "$CODE_SERVER_PASSWORD"

# Set Tailscale IPs if provided
if [ -n "$LINODE_IP" ]; then
    replace_var "TAILSCALE_LINODE_HOST" "$LINODE_IP"
fi
if [ -n "$LOCAL_IP" ]; then
    replace_var "TAILSCALE_LOCAL_HOST" "$LOCAL_IP"
fi

# Set domain-based URLs
replace_var "DASHBOARD_URL" "https://host.${DOMAIN}"
replace_var "DISCORD_BOT_URL" "https://bot.rig-city.com"
replace_var "STREAM_BOT_URL" "https://stream.rig-city.com"

# Database URLs (for services that need full connection strings)
replace_var "DASHBOARD_DATABASE_URL" "postgresql://dashboard:${POSTGRES_PASSWORD}@homelab-postgres:5432/homelab_dashboard"
replace_var "DISCORD_DATABASE_URL" "postgresql://discord:${DISCORD_DB_PASSWORD}@homelab-postgres:5432/homelab_discord"
replace_var "STREAMBOT_DATABASE_URL" "postgresql://streambot:${STREAMBOT_DB_PASSWORD}@homelab-postgres:5432/homelab_streambot"
replace_var "JARVIS_DATABASE_URL" "postgresql://jarvis:${JARVIS_DB_PASSWORD}@homelab-postgres:5432/homelab_jarvis"

# Secure file permissions
chmod 600 "$OUTPUT_FILE"

echo -e "${GREEN}✓ Environment file created: $OUTPUT_FILE${NC}"
echo ""

# Summary
echo -e "${CYAN}═══════════════════════════════════════════════════════════════${NC}"
echo -e "${GREEN}✅ ENVIRONMENT GENERATED${NC}"
echo ""
echo "Generated secrets (save these securely!):"
echo ""
echo "  POSTGRES_PASSWORD:      $POSTGRES_PASSWORD"
echo "  WEB_PASSWORD:           $WEB_PASSWORD"
echo "  DASHBOARD_API_KEY:      $DASHBOARD_API_KEY"
echo "  CODE_SERVER_PASSWORD:   $CODE_SERVER_PASSWORD"
echo ""
echo -e "${YELLOW}⚠ You still need to add:${NC}"
echo "  - DISCORD_BOT_TOKEN (from Discord Developer Portal)"
echo "  - DISCORD_CLIENT_ID and DISCORD_CLIENT_SECRET"
echo "  - OPENAI_API_KEY (from OpenAI Platform)"
echo "  - TWITCH_CLIENT_ID and TWITCH_CLIENT_SECRET (if using Stream Bot)"
echo "  - CLOUDFLARE_API_TOKEN (if using DNS Management)"
echo ""
echo "Edit $OUTPUT_FILE to add these values."
echo -e "${CYAN}═══════════════════════════════════════════════════════════════${NC}"
