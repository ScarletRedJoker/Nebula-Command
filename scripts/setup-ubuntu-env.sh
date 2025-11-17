#!/bin/bash

# ══════════════════════════════════════════════════════════════════════
# NebulaCommand Environment Variable Validation & Setup Tool
# ══════════════════════════════════════════════════════════════════════
# Purpose: Validate all required environment variables before deployment
# Exit Codes: 0 = All required vars present, 1 = Missing variables
# ══════════════════════════════════════════════════════════════════════

set -euo pipefail

# Colors
readonly RED='\033[0;31m'
readonly GREEN='\033[0;32m'
readonly YELLOW='\033[1;33m'
readonly BLUE='\033[0;34m'
readonly CYAN='\033[0;36m'
readonly BOLD='\033[1m'
readonly NC='\033[0m'

# Symbols
readonly CHECK="✅"
readonly CROSS="❌"
readonly WARNING="⚠️"
readonly INFO="ℹ️"
readonly ROCKET="🚀"
readonly STOP="🛑"

# Script directory
SCRIPT_DIR="$(cd "$(dirname "${BASH_SOURCE[0]}")" && pwd)"
PROJECT_ROOT="$(dirname "$SCRIPT_DIR")"
ENV_FILE="${PROJECT_ROOT}/.env"
ENV_EXAMPLE="${PROJECT_ROOT}/.env.example"

# Counters
TOTAL_VARS=0
CONFIGURED_VARS=0
MISSING_VARS=0
OPTIONAL_MISSING=0

# Arrays to track missing variables
declare -a MISSING_CRITICAL=()
declare -a MISSING_OPTIONAL=()
declare -a MISSING_AUTO_GEN=()

# ══════════════════════════════════════════════════════════════════════
# Helper Functions
# ══════════════════════════════════════════════════════════════════════

print_header() {
    echo ""
    echo "╔══════════════════════════════════════════════════════════════╗"
    echo "║    NebulaCommand Environment Variable Validation            ║"
    echo "╚══════════════════════════════════════════════════════════════╝"
    echo ""
}

print_section() {
    local section_name=$1
    echo ""
    echo -e "${CYAN}━━━ ${section_name} ━━━${NC}"
}

# Load .env file and source it for checking
load_env() {
    if [ -f "$ENV_FILE" ]; then
        set -a
        source "$ENV_FILE"
        set +a
        return 0
    else
        return 1
    fi
}

# Check if a variable is set and non-empty
check_var() {
    local var_name=$1
    local var_value="${!var_name:-}"
    
    if [ -n "$var_value" ]; then
        return 0
    else
        return 1
    fi
}

# Validate a required variable
validate_required() {
    local var_name=$1
    local description=$2
    local instruction=$3
    
    ((TOTAL_VARS++))
    
    if check_var "$var_name"; then
        echo -e "${GREEN}${CHECK} ${var_name}${NC}"
        ((CONFIGURED_VARS++))
    else
        echo -e "${RED}${CROSS} ${var_name}${NC} ${YELLOW}(MISSING - ${description})${NC}"
        ((MISSING_VARS++))
        MISSING_CRITICAL+=("${var_name}|${description}|${instruction}")
    fi
}

# Validate an optional variable
validate_optional() {
    local var_name=$1
    local description=$2
    local instruction=$3
    
    ((TOTAL_VARS++))
    
    if check_var "$var_name"; then
        echo -e "${GREEN}${CHECK} ${var_name}${NC}"
        ((CONFIGURED_VARS++))
    else
        echo -e "${YELLOW}${WARNING} ${var_name}${NC} ${BLUE}(OPTIONAL - ${description})${NC}"
        ((OPTIONAL_MISSING++))
        MISSING_OPTIONAL+=("${var_name}|${description}|${instruction}")
    fi
}

# Validate an auto-generatable variable
validate_auto_gen() {
    local var_name=$1
    local description=$2
    local command=$3
    
    ((TOTAL_VARS++))
    
    if check_var "$var_name"; then
        echo -e "${GREEN}${CHECK} ${var_name}${NC}"
        ((CONFIGURED_VARS++))
    else
        echo -e "${RED}${CROSS} ${var_name}${NC} ${YELLOW}(MISSING - ${description})${NC}"
        ((MISSING_VARS++))
        MISSING_AUTO_GEN+=("${var_name}|${description}|${command}")
    fi
}

# ══════════════════════════════════════════════════════════════════════
# Main Validation Logic
# ══════════════════════════════════════════════════════════════════════

main() {
    print_header
    
    # Check if .env file exists
    if [ -f "$ENV_FILE" ]; then
        echo -e "${GREEN}${CHECK} .env file found${NC}"
        load_env
    else
        echo -e "${RED}${CROSS} .env file not found${NC}"
        echo ""
        echo -e "${YELLOW}${WARNING} No .env file detected!${NC}"
        echo ""
        
        if [ -f "$ENV_EXAMPLE" ]; then
            echo "Would you like to create .env from .env.example? (y/n)"
            read -r response
            if [[ "$response" =~ ^[Yy]$ ]]; then
                cp "$ENV_EXAMPLE" "$ENV_FILE"
                echo -e "${GREEN}${CHECK} Created .env from .env.example${NC}"
                echo -e "${BLUE}${INFO} Please edit .env and fill in your values, then run this script again.${NC}"
                exit 1
            else
                echo -e "${RED}${STOP} Cannot proceed without .env file${NC}"
                exit 1
            fi
        else
            echo -e "${RED}${STOP} .env.example not found. Cannot create template.${NC}"
            exit 1
        fi
    fi
    
    # ━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━
    # Dashboard Variables
    # ━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━
    
    print_section "Dashboard Variables"
    
    validate_required "WEB_USERNAME" \
        "Dashboard login username" \
        "Set your admin username (e.g., admin, evin)"
    
    validate_required "WEB_PASSWORD" \
        "Dashboard login password" \
        "Set a strong password for dashboard access"
    
    validate_auto_gen "DASHBOARD_API_KEY" \
        "Dashboard API key" \
        "python3 -c 'import secrets; print(secrets.token_urlsafe(32))'"
    
    validate_auto_gen "SESSION_SECRET" \
        "Session encryption secret" \
        "python3 -c 'import secrets; print(secrets.token_hex(64))'"
    
    validate_required "OPENAI_API_KEY" \
        "OpenAI API key for AI features" \
        "Get from: https://platform.openai.com/api-keys"
    
    # Database URLs (constructed from passwords)
    validate_auto_gen "JARVIS_DB_PASSWORD" \
        "Jarvis database password" \
        "python3 -c 'import secrets; print(secrets.token_urlsafe(16))'"
    
    # Redis URL (typically auto-configured in Docker)
    if ! check_var "REDIS_URL"; then
        echo -e "${BLUE}${INFO} REDIS_URL${NC} ${YELLOW}(Will be auto-configured to redis://redis:6379/0)${NC}"
    else
        echo -e "${GREEN}${CHECK} REDIS_URL${NC}"
        ((CONFIGURED_VARS++))
    fi
    ((TOTAL_VARS++))
    
    # ━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━
    # Discord Bot Variables
    # ━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━
    
    print_section "Discord Bot Variables"
    
    validate_required "DISCORD_BOT_TOKEN" \
        "Discord bot token" \
        "Get from: https://discord.com/developers/applications → Bot → Token"
    
    validate_required "DISCORD_CLIENT_ID" \
        "Discord application client ID" \
        "Get from: https://discord.com/developers/applications → General Information"
    
    validate_required "DISCORD_CLIENT_SECRET" \
        "Discord application client secret" \
        "Get from: https://discord.com/developers/applications → OAuth2"
    
    validate_required "DISCORD_APP_ID" \
        "Discord application ID (required for bot login)" \
        "Get from: https://discord.com/developers/applications → General Information → Application ID"
    
    validate_auto_gen "DISCORD_DB_PASSWORD" \
        "Discord database password" \
        "python3 -c 'import secrets; print(secrets.token_urlsafe(16))'"
    
    validate_auto_gen "DISCORD_SESSION_SECRET" \
        "Discord session secret" \
        "python3 -c 'import secrets; print(secrets.token_hex(32))'"
    
    # ━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━
    # Stream Bot Variables
    # ━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━
    
    print_section "Stream Bot Variables"
    
    validate_auto_gen "STREAMBOT_DB_PASSWORD" \
        "Stream Bot database password" \
        "python3 -c 'import secrets; print(secrets.token_urlsafe(16))'"
    
    validate_auto_gen "STREAMBOT_SESSION_SECRET" \
        "Stream Bot session secret" \
        "python3 -c 'import secrets; print(secrets.token_hex(32))'"
    
    # Twitch (Required for streaming features)
    validate_optional "TWITCH_CLIENT_ID" \
        "Twitch integration" \
        "Get from: https://dev.twitch.tv/console/apps → Register application"
    
    validate_optional "TWITCH_CLIENT_SECRET" \
        "Twitch integration" \
        "Get from: https://dev.twitch.tv/console/apps → Manage → New Secret"
    
    # Kick (Optional)
    validate_optional "KICK_CLIENT_ID" \
        "Kick streaming platform integration" \
        "Get from Kick developer portal (if available)"
    
    validate_optional "KICK_CLIENT_SECRET" \
        "Kick streaming platform integration" \
        "Get from Kick developer portal (if available)"
    
    # YouTube (Optional)
    validate_optional "YOUTUBE_CLIENT_ID" \
        "YouTube livestream integration" \
        "Get from: https://console.cloud.google.com/apis/credentials → Create OAuth 2.0 Client ID"
    
    validate_optional "YOUTUBE_CLIENT_SECRET" \
        "YouTube livestream integration" \
        "Get from: https://console.cloud.google.com/apis/credentials"
    
    # ━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━
    # Infrastructure & DNS Variables
    # ━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━
    
    print_section "Infrastructure Variables"
    
    validate_optional "ZONEEDIT_USERNAME" \
        "ZoneEdit dynamic DNS username" \
        "Get from: https://zoneedit.com → Dynamic DNS"
    
    validate_optional "ZONEEDIT_PASSWORD" \
        "ZoneEdit dynamic DNS password" \
        "Get from: https://zoneedit.com → Dynamic DNS"
    
    # ━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━
    # Additional Critical Infrastructure
    # ━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━
    
    print_section "Additional Infrastructure"
    
    validate_auto_gen "MINIO_ROOT_PASSWORD" \
        "MinIO object storage password" \
        "python3 -c 'import secrets; print(secrets.token_urlsafe(24))'"
    
    validate_optional "VNC_PASSWORD" \
        "VNC viewer password" \
        "Auto-generate with: python3 -c 'import secrets; print(secrets.token_urlsafe(16))'"
    
    validate_optional "VNC_USER_PASSWORD" \
        "VNC desktop user password" \
        "Auto-generate with: python3 -c 'import secrets; print(secrets.token_urlsafe(16))'"
    
    validate_optional "PLEX_CLAIM" \
        "Plex server claim token (expires in 4 minutes!)" \
        "Get from: https://www.plex.tv/claim/"
    
    # ━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━
    # Print Summary
    # ━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━
    
    print_section "Summary"
    
    echo ""
    echo -e "${BOLD}Total Variables:${NC} ${TOTAL_VARS}"
    echo -e "${GREEN}${CHECK} Configured:${NC} ${CONFIGURED_VARS}"
    echo -e "${RED}${CROSS} Missing Critical:${NC} ${MISSING_VARS}"
    echo -e "${YELLOW}${WARNING} Missing Optional:${NC} ${OPTIONAL_MISSING}"
    echo ""
    
    # ━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━
    # Print Missing Variables with Instructions
    # ━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━
    
    if [ ${MISSING_VARS} -gt 0 ]; then
        echo -e "${RED}${STOP} DEPLOYMENT BLOCKED - Fix missing variables before deploying!${NC}"
        echo ""
        echo "━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━"
        echo -e "${BOLD}Missing Critical Variables:${NC}"
        echo "━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━"
        echo ""
        
        local index=1
        
        # Auto-generatable variables first
        if [ ${#MISSING_AUTO_GEN[@]} -gt 0 ]; then
            echo -e "${CYAN}${BOLD}Auto-Generatable Secrets:${NC}"
            echo -e "${BLUE}Run these commands to generate secure values:${NC}"
            echo ""
            
            for entry in "${MISSING_AUTO_GEN[@]}"; do
                IFS='|' read -r var_name description command <<< "$entry"
                echo -e "${YELLOW}${index}.${NC} ${BOLD}${var_name}${NC} - ${description}"
                echo -e "   ${CYAN}${command}${NC}"
                echo ""
                ((index++))
            done
            
            echo -e "${GREEN}Quick-fix: Generate all at once:${NC}"
            echo "cat >> .env << EOF"
            for entry in "${MISSING_AUTO_GEN[@]}"; do
                IFS='|' read -r var_name description command <<< "$entry"
                echo "${var_name}=\$(${command})"
            done
            echo "EOF"
            echo ""
        fi
        
        # Manual configuration required
        if [ ${#MISSING_CRITICAL[@]} -gt ${#MISSING_AUTO_GEN[@]} ]; then
            echo -e "${CYAN}${BOLD}Manual Configuration Required:${NC}"
            echo ""
            
            for entry in "${MISSING_CRITICAL[@]}"; do
                IFS='|' read -r var_name description instruction <<< "$entry"
                
                # Skip if already in auto-gen list
                local is_auto_gen=false
                for auto_entry in "${MISSING_AUTO_GEN[@]}"; do
                    if [[ "$auto_entry" == "${var_name}|"* ]]; then
                        is_auto_gen=true
                        break
                    fi
                done
                
                if [ "$is_auto_gen" = false ]; then
                    echo -e "${YELLOW}${index}.${NC} ${BOLD}${var_name}${NC} - ${description}"
                    echo -e "   ${BLUE}${instruction}${NC}"
                    echo ""
                    ((index++))
                fi
            done
        fi
        
        echo "━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━"
    fi
    
    # Print optional missing variables
    if [ ${OPTIONAL_MISSING} -gt 0 ]; then
        echo ""
        echo -e "${YELLOW}${WARNING} Optional Features Not Configured:${NC}"
        echo ""
        
        for entry in "${MISSING_OPTIONAL[@]}"; do
            IFS='|' read -r var_name description instruction <<< "$entry"
            echo -e "  • ${BOLD}${var_name}${NC} - ${description}"
            echo -e "    ${BLUE}${instruction}${NC}"
        done
        
        echo ""
        echo -e "${BLUE}${INFO} These are optional. Services will start without them, but some features may be disabled.${NC}"
    fi
    
    # ━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━
    # Exit with appropriate code
    # ━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━
    
    echo ""
    
    if [ ${MISSING_VARS} -eq 0 ]; then
        echo "╔══════════════════════════════════════════════════════════════╗"
        echo "║                                                              ║"
        echo -e "║  ${GREEN}${ROCKET} ${BOLD}VALIDATION PASSED!${NC} All critical variables configured.  ║"
        echo "║                                                              ║"
        echo "╚══════════════════════════════════════════════════════════════╝"
        echo ""
        echo -e "${GREEN}${CHECK} Ready to deploy!${NC}"
        echo ""
        echo "Next steps:"
        echo "  • Review configuration: cat .env"
        echo "  • Start services: docker-compose up -d"
        echo "  • Check logs: docker-compose logs -f"
        echo ""
        exit 0
    else
        echo "╔══════════════════════════════════════════════════════════════╗"
        echo "║                                                              ║"
        echo -e "║  ${RED}${STOP} VALIDATION FAILED${NC} - Missing ${MISSING_VARS} critical variable(s)     ║"
        echo "║                                                              ║"
        echo "╚══════════════════════════════════════════════════════════════╝"
        echo ""
        echo -e "${RED}${CROSS} Cannot deploy until all critical variables are set.${NC}"
        echo ""
        echo "Fix the issues above, then run this script again:"
        echo "  bash scripts/setup-ubuntu-env.sh"
        echo ""
        exit 1
    fi
}

# ══════════════════════════════════════════════════════════════════════
# Script Entry Point
# ══════════════════════════════════════════════════════════════════════

main "$@"
