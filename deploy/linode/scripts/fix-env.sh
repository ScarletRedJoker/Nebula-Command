#!/bin/bash
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
NC='\033[0m'

show_usage() {
    cat << EOF
${CYAN}═══ Homelab Env Fix Tool ═══${NC}

${YELLOW}Usage:${NC}
  $0                           # Check mode - show what's missing
  $0 --fix                     # Interactive mode - prompt for missing values
  $0 --set KEY=value           # Set a specific value
  $0 --set KEY1=val1 KEY2=val2 # Set multiple values at once
  $0 --generate-passwords      # Auto-generate all missing passwords/secrets

${YELLOW}Examples:${NC}
  $0 --set TAILSCALE_AUTHKEY=tskey-auth-xxxxx
  $0 --set OPENAI_API_KEY=sk-xxxxx CLOUDFLARE_API_TOKEN=xxxxx
  $0 --generate-passwords --set TAILSCALE_AUTHKEY=tskey-auth-xxxxx

${YELLOW}Required Environment Variables:${NC}
  TAILSCALE_AUTHKEY       - Get from https://login.tailscale.com/admin/settings/keys
  OPENAI_API_KEY          - Get from https://platform.openai.com/api-keys  
  CLOUDFLARE_API_TOKEN    - Get from https://dash.cloudflare.com/profile/api-tokens
  DISCORD_BOT_TOKEN       - Get from https://discord.com/developers/applications
  TWITCH_CLIENT_ID/SECRET - Get from https://dev.twitch.tv/console/apps

EOF
}

REQUIRED_VARS=(
    "TAILSCALE_AUTHKEY|Tailscale auth key for local connectivity"
    "POSTGRES_PASSWORD|PostgreSQL root password"
    "DISCORD_DB_PASSWORD|Discord bot database password"
    "STREAMBOT_DB_PASSWORD|Stream bot database password"
    "JARVIS_DB_PASSWORD|Jarvis AI database password"
    "SERVICE_AUTH_TOKEN|Inter-service API token"
    "SESSION_SECRET|Flask session secret"
    "SECRET_KEY|Flask CSRF secret"
    "OPENAI_API_KEY|OpenAI API key"
    "DISCORD_BOT_TOKEN|Discord bot token"
    "DISCORD_CLIENT_ID|Discord application client ID"
    "DISCORD_CLIENT_SECRET|Discord application client secret"
    "DISCORD_SESSION_SECRET|Discord OAuth session secret"
    "TWITCH_CLIENT_ID|Twitch application client ID"
    "TWITCH_CLIENT_SECRET|Twitch application client secret"
    "STREAMBOT_SESSION_SECRET|Stream bot session secret"
    "CODE_SERVER_PASSWORD|Code-server web password"
    "GRAFANA_ADMIN_PASSWORD|Grafana admin password"
    "CLOUDFLARE_API_TOKEN|Cloudflare DNS API token"
    "STREAM_BOT_WEBHOOK_SECRET|Stream bot webhook secret"
)

OPTIONAL_VARS=(
    "YOUTUBE_CLIENT_ID|YouTube OAuth client ID"
    "YOUTUBE_CLIENT_SECRET|YouTube OAuth client secret"
    "SPOTIFY_CLIENT_ID|Spotify application client ID"
    "SPOTIFY_CLIENT_SECRET|Spotify application secret"
    "KICK_CLIENT_ID|Kick client ID"
    "KICK_CLIENT_SECRET|Kick client secret"
    "PLEX_TOKEN|Plex authentication token"
    "HOME_ASSISTANT_TOKEN|Home Assistant access token"
    "WEB_PASSWORD|Dashboard web login password"
)

GENERATABLE_SECRETS=(
    "POSTGRES_PASSWORD"
    "DISCORD_DB_PASSWORD"
    "STREAMBOT_DB_PASSWORD"
    "JARVIS_DB_PASSWORD"
    "SERVICE_AUTH_TOKEN"
    "SESSION_SECRET"
    "SECRET_KEY"
    "DISCORD_SESSION_SECRET"
    "STREAMBOT_SESSION_SECRET"
    "CODE_SERVER_PASSWORD"
    "GRAFANA_ADMIN_PASSWORD"
    "STREAM_BOT_WEBHOOK_SECRET"
    "WEB_PASSWORD"
)

create_env_if_missing() {
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

get_env_value() {
    local key=$1
    if [[ -f "$ENV_FILE" ]]; then
        grep -E "^${key}=" "$ENV_FILE" 2>/dev/null | cut -d'=' -f2- | sed 's/^"//' | sed 's/"$//' || true
    fi
}

set_env_value() {
    local key=$1
    local value=$2
    
    create_env_if_missing
    
    if grep -qE "^${key}=" "$ENV_FILE" 2>/dev/null; then
        if [[ "$(uname)" == "Darwin" ]]; then
            sed -i '' "s|^${key}=.*|${key}=${value}|" "$ENV_FILE"
        else
            sed -i "s|^${key}=.*|${key}=${value}|" "$ENV_FILE"
        fi
        echo -e "  ${GREEN}[UPDATED]${NC} $key"
    else
        echo "${key}=${value}" >> "$ENV_FILE"
        echo -e "  ${GREEN}[ADDED]${NC} $key"
    fi
}

generate_secret() {
    openssl rand -hex 32
}

check_vars() {
    local missing_required=0
    local missing_optional=0
    
    echo -e "\n${BLUE}═══ Checking Environment Variables ═══${NC}"
    echo -e "  File: $ENV_FILE\n"
    
    if [[ ! -f "$ENV_FILE" ]]; then
        echo -e "${RED}[ERROR] .env file not found!${NC}"
        echo -e "  Run: $0 --fix"
        return 1
    fi
    
    source "$ENV_FILE"
    
    echo -e "${CYAN}━━━ Required Variables ━━━${NC}"
    for entry in "${REQUIRED_VARS[@]}"; do
        IFS='|' read -r var_name description <<< "$entry"
        local value="${!var_name:-}"
        
        if [[ -z "$value" || "$value" == *"xxxxx"* || "$value" == "sk-" ]]; then
            echo -e "  ${RED}[MISSING]${NC} $var_name - $description"
            missing_required=$((missing_required + 1))
        else
            local masked
            if [[ ${#value} -gt 12 ]]; then
                masked="${value:0:6}...${value: -4}"
            elif [[ ${#value} -gt 6 ]]; then
                masked="${value:0:3}****"
            else
                masked="****"
            fi
            echo -e "  ${GREEN}[OK]${NC} $var_name = $masked"
        fi
    done
    
    echo -e "\n${CYAN}━━━ Optional Variables ━━━${NC}"
    for entry in "${OPTIONAL_VARS[@]}"; do
        IFS='|' read -r var_name description <<< "$entry"
        local value="${!var_name:-}"
        
        if [[ -z "$value" ]]; then
            echo -e "  ${YELLOW}[OPTIONAL]${NC} $var_name - $description"
            missing_optional=$((missing_optional + 1))
        else
            local masked
            if [[ ${#value} -gt 12 ]]; then
                masked="${value:0:6}...${value: -4}"
            else
                masked="****"
            fi
            echo -e "  ${GREEN}[OK]${NC} $var_name = $masked"
        fi
    done
    
    echo ""
    if [[ $missing_required -gt 0 ]]; then
        echo -e "${RED}[RESULT] $missing_required required variable(s) missing!${NC}"
        echo -e "  Fix with: $0 --fix"
        echo -e "  Or set individually: $0 --set KEY=value"
        return 1
    else
        echo -e "${GREEN}[RESULT] All required variables are set!${NC}"
        if [[ $missing_optional -gt 0 ]]; then
            echo -e "${YELLOW}  ($missing_optional optional variables not set)${NC}"
        fi
        return 0
    fi
}

fix_interactive() {
    echo -e "\n${BLUE}═══ Interactive Env Fix ═══${NC}\n"
    
    create_env_if_missing
    source "$ENV_FILE" 2>/dev/null || true
    
    local fixed=0
    
    for entry in "${REQUIRED_VARS[@]}"; do
        IFS='|' read -r var_name description <<< "$entry"
        local value="${!var_name:-}"
        
        if [[ -z "$value" || "$value" == *"xxxxx"* || "$value" == "sk-" ]]; then
            local is_generatable=false
            for gen_var in "${GENERATABLE_SECRETS[@]}"; do
                if [[ "$var_name" == "$gen_var" ]]; then
                    is_generatable=true
                    break
                fi
            done
            
            if $is_generatable; then
                echo -e "${YELLOW}$var_name${NC} - $description"
                echo -n "  [G]enerate random, [E]nter value, [S]kip? "
                read -r choice
                case $choice in
                    [Gg])
                        local new_value
                        new_value=$(generate_secret)
                        set_env_value "$var_name" "$new_value"
                        fixed=$((fixed + 1))
                        ;;
                    [Ee])
                        echo -n "  Enter value: "
                        read -r new_value
                        if [[ -n "$new_value" ]]; then
                            set_env_value "$var_name" "$new_value"
                            fixed=$((fixed + 1))
                        fi
                        ;;
                esac
            else
                echo -e "${YELLOW}$var_name${NC} - $description"
                echo -n "  Enter value (or press Enter to skip): "
                read -r new_value
                if [[ -n "$new_value" ]]; then
                    set_env_value "$var_name" "$new_value"
                    fixed=$((fixed + 1))
                fi
            fi
            echo ""
        fi
    done
    
    echo -e "\n${GREEN}Fixed $fixed variable(s)${NC}"
    echo -e "Run check: $0"
}

generate_passwords() {
    echo -e "\n${BLUE}═══ Auto-Generating Passwords ═══${NC}\n"
    
    create_env_if_missing
    source "$ENV_FILE" 2>/dev/null || true
    
    local generated=0
    
    for var_name in "${GENERATABLE_SECRETS[@]}"; do
        local value="${!var_name:-}"
        
        if [[ -z "$value" || "$value" == *"xxxxx"* ]]; then
            local new_value
            new_value=$(generate_secret)
            set_env_value "$var_name" "$new_value"
            generated=$((generated + 1))
        fi
    done
    
    echo -e "\n${GREEN}Generated $generated password(s)${NC}"
}

set_values() {
    echo -e "\n${BLUE}═══ Setting Values ═══${NC}\n"
    
    create_env_if_missing
    
    for arg in "$@"; do
        if [[ "$arg" == *"="* ]]; then
            local key="${arg%%=*}"
            local value="${arg#*=}"
            set_env_value "$key" "$value"
        fi
    done
}

MODE="check"
SET_ARGS=()

while [[ $# -gt 0 ]]; do
    case $1 in
        -h|--help)
            show_usage
            exit 0
            ;;
        --fix)
            MODE="fix"
            shift
            ;;
        --generate-passwords)
            MODE="generate"
            shift
            ;;
        --set)
            shift
            while [[ $# -gt 0 && "$1" != --* ]]; do
                SET_ARGS+=("$1")
                shift
            done
            if [[ ${#SET_ARGS[@]} -gt 0 ]]; then
                MODE="set"
            fi
            ;;
        *)
            if [[ "$1" == *"="* ]]; then
                SET_ARGS+=("$1")
                MODE="set"
            fi
            shift
            ;;
    esac
done

case $MODE in
    check)
        check_vars
        ;;
    fix)
        fix_interactive
        ;;
    generate)
        generate_passwords
        check_vars
        ;;
    set)
        set_values "${SET_ARGS[@]}"
        check_vars
        ;;
esac
