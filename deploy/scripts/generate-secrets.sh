#!/bin/bash
set -euo pipefail

SCRIPT_DIR="$(cd "$(dirname "${BASH_SOURCE[0]}")" && pwd)"
DEPLOY_ROOT="$(dirname "$SCRIPT_DIR")"
REPO_ROOT="$(dirname "$DEPLOY_ROOT")"

RED='\033[0;31m'
GREEN='\033[0;32m'
YELLOW='\033[1;33m'
BLUE='\033[0;34m'
CYAN='\033[0;36m'
BOLD='\033[1m'
NC='\033[0m'

VERBOSE=false
DRY_RUN=false
FORCE=false
OUTPUT_FILE=""

log() {
    local level="$1"
    shift
    case "$level" in
        INFO)  echo -e "${GREEN}[✓]${NC} $*" ;;
        WARN)  echo -e "${YELLOW}[⚠]${NC} $*" ;;
        ERROR) echo -e "${RED}[✗]${NC} $*" >&2 ;;
        DEBUG) [[ "$VERBOSE" == "true" ]] && echo -e "${BLUE}[D]${NC} $*" ;;
    esac
}

generate_hex() {
    local length="${1:-32}"
    openssl rand -hex "$length"
}

generate_base64() {
    local length="${1:-32}"
    openssl rand -base64 "$length" | tr -d '/+=' | head -c "$length"
}

generate_password() {
    local length="${1:-24}"
    openssl rand -base64 48 | tr -d '/+=' | head -c "$length"
}

generate_uuid() {
    if command -v uuidgen &>/dev/null; then
        uuidgen | tr '[:upper:]' '[:lower:]'
    else
        cat /proc/sys/kernel/random/uuid 2>/dev/null || \
        python3 -c "import uuid; print(uuid.uuid4())" 2>/dev/null || \
        openssl rand -hex 16 | sed 's/\(..\{8\}\)\(..\{4\}\)\(..\{4\}\)\(..\{4\}\)\(..\{12\}\)/\1-\2-\3-\4-\5/'
    fi
}

check_existing() {
    local var_name="$1"
    local env_file="$2"
    
    if [[ ! -f "$env_file" ]]; then
        return 1
    fi
    
    if grep -q "^${var_name}=.\+" "$env_file" 2>/dev/null; then
        local value=$(grep "^${var_name}=" "$env_file" | cut -d'=' -f2-)
        if [[ -n "$value" && "$value" != "YOUR_"* && "$value" != "GENERATE_ME"* && "$value" != "changeme"* ]]; then
            return 0
        fi
    fi
    return 1
}

update_env() {
    local var_name="$1"
    local value="$2"
    local env_file="$3"
    
    if [[ "$DRY_RUN" == "true" ]]; then
        log INFO "[DRY-RUN] Would set $var_name"
        return 0
    fi
    
    if grep -q "^${var_name}=" "$env_file" 2>/dev/null; then
        if [[ "$(uname)" == "Darwin" ]]; then
            sed -i '' "s|^${var_name}=.*|${var_name}=${value}|" "$env_file"
        else
            sed -i "s|^${var_name}=.*|${var_name}=${value}|" "$env_file"
        fi
    else
        echo "${var_name}=${value}" >> "$env_file"
    fi
}

generate_all_secrets() {
    local env_file="$1"
    
    echo ""
    echo -e "${CYAN}━━━ Generating Secrets ━━━${NC}"
    echo ""
    
    if [[ ! -f "$env_file" ]]; then
        touch "$env_file"
        log INFO "Created $env_file"
    fi
    
    local generated=0
    local skipped=0
    
    declare -A secrets=(
        ["SESSION_SECRET"]="hex:32"
        ["SECRET_KEY"]="hex:32"
        ["POSTGRES_PASSWORD"]="password:32"
        ["JARVIS_DB_PASSWORD"]="password:24"
        ["DISCORD_DB_PASSWORD"]="password:24"
        ["STREAMBOT_DB_PASSWORD"]="password:24"
        ["SERVICE_AUTH_TOKEN"]="hex:48"
        ["N8N_ENCRYPTION_KEY"]="base64:32"
        ["GRAFANA_ADMIN_PASSWORD"]="password:20"
        ["MINIO_ROOT_PASSWORD"]="password:24"
        ["MINIO_ROOT_USER"]="static:minioadmin"
        ["CODE_SERVER_PASSWORD"]="password:16"
        ["DISCORD_SESSION_SECRET"]="hex:32"
        ["STREAMBOT_SESSION_SECRET"]="hex:32"
        ["STREAM_BOT_WEBHOOK_SECRET"]="hex:24"
        ["JWT_SECRET"]="hex:64"
        ["REDIS_PASSWORD"]="password:24"
        ["VNC_PASSWORD"]="password:12"
        ["AUTHELIA_JWT_SECRET"]="hex:64"
        ["AUTHELIA_SESSION_SECRET"]="hex:32"
        ["AUTHELIA_STORAGE_ENCRYPTION_KEY"]="hex:32"
    )
    
    for var_name in "${!secrets[@]}"; do
        local spec="${secrets[$var_name]}"
        local type="${spec%%:*}"
        local param="${spec#*:}"
        
        if [[ "$FORCE" != "true" ]] && check_existing "$var_name" "$env_file"; then
            log DEBUG "Exists: $var_name"
            ((skipped++))
            continue
        fi
        
        local value
        case "$type" in
            hex)      value=$(generate_hex "$param") ;;
            base64)   value=$(generate_base64 "$param") ;;
            password) value=$(generate_password "$param") ;;
            uuid)     value=$(generate_uuid) ;;
            static)   value="$param" ;;
            *)        value=$(generate_hex 32) ;;
        esac
        
        update_env "$var_name" "$value" "$env_file"
        log INFO "Generated: $var_name"
        ((generated++))
    done
    
    echo ""
    echo -e "${CYAN}━━━ Database Users ━━━${NC}"
    echo ""
    
    local db_users=(
        ["JARVIS_DB_USER"]="jarvis_user"
        ["DISCORD_DB_USER"]="discord_bot"
        ["STREAMBOT_DB_USER"]="streambot"
        ["POSTGRES_USER"]="postgres"
    )
    
    for var_name in "${!db_users[@]}"; do
        local default_value="${db_users[$var_name]}"
        
        if ! check_existing "$var_name" "$env_file"; then
            update_env "$var_name" "$default_value" "$env_file"
            log INFO "Set: $var_name=$default_value"
            ((generated++))
        else
            log DEBUG "Exists: $var_name"
            ((skipped++))
        fi
    done
    
    echo ""
    echo -e "${CYAN}━━━ Summary ━━━${NC}"
    echo ""
    log INFO "Generated: $generated secrets"
    log INFO "Skipped (existing): $skipped"
    log INFO "Output: $env_file"
}

show_secrets() {
    local env_file="$1"
    
    if [[ ! -f "$env_file" ]]; then
        log ERROR "File not found: $env_file"
        return 1
    fi
    
    echo ""
    echo -e "${CYAN}━━━ Current Secrets ━━━${NC}"
    echo ""
    
    local secret_vars=(
        "POSTGRES_PASSWORD"
        "SESSION_SECRET"
        "SECRET_KEY"
        "DISCORD_BOT_TOKEN"
        "OPENAI_API_KEY"
        "CODE_SERVER_PASSWORD"
    )
    
    for var in "${secret_vars[@]}"; do
        local value=$(grep "^${var}=" "$env_file" 2>/dev/null | cut -d'=' -f2-)
        if [[ -n "$value" ]]; then
            local masked="${value:0:4}...${value: -4}"
            printf "  %-30s %s\n" "$var:" "$masked"
        else
            printf "  %-30s ${RED}NOT SET${NC}\n" "$var:"
        fi
    done
}

validate_secrets() {
    local env_file="$1"
    
    if [[ ! -f "$env_file" ]]; then
        log ERROR "File not found: $env_file"
        return 1
    fi
    
    echo ""
    echo -e "${CYAN}━━━ Validating Secrets ━━━${NC}"
    echo ""
    
    local required=(
        "POSTGRES_PASSWORD"
        "SESSION_SECRET"
    )
    
    local errors=0
    
    for var in "${required[@]}"; do
        if check_existing "$var" "$env_file"; then
            log INFO "$var: OK"
        else
            log ERROR "$var: MISSING"
            ((errors++))
        fi
    done
    
    if [[ $errors -gt 0 ]]; then
        log ERROR "Validation failed: $errors missing secrets"
        return 1
    fi
    
    log INFO "All required secrets are set"
    return 0
}

usage() {
    cat << EOF
${BOLD}Nebula Command - Secret Generator${NC}

${CYAN}USAGE:${NC}
    $(basename "$0") [OPTIONS] [ENV_FILE]

${CYAN}COMMANDS:${NC}
    generate    Generate all missing secrets (default)
    show        Show current secrets (masked)
    validate    Validate required secrets exist

${CYAN}OPTIONS:${NC}
    -o, --output FILE   Output to specific file (default: .env)
    -f, --force         Overwrite existing values
    -n, --dry-run       Show what would be done
    -v, --verbose       Enable verbose output
    -h, --help          Show this help

${CYAN}EXAMPLES:${NC}
    $(basename "$0")                          # Generate to .env
    $(basename "$0") -o deploy/linode/.env    # Generate to specific file
    $(basename "$0") --force                  # Regenerate all secrets
    $(basename "$0") show                     # Show current secrets
    $(basename "$0") validate                 # Check required secrets

${CYAN}GENERATED SECRETS:${NC}
    - Database passwords (Postgres, Discord, Streambot)
    - Session secrets (Flask, JWT)
    - API tokens (Service auth, webhooks)
    - Service passwords (Grafana, MinIO, Code Server)

${CYAN}NOTES:${NC}
    - Never overwrites existing values unless --force is used
    - Uses OpenSSL for cryptographically secure generation
    - Supports hex, base64, and password formats
EOF
}

main() {
    local command="generate"
    local env_file="$REPO_ROOT/.env"
    
    while [[ $# -gt 0 ]]; do
        case "$1" in
            generate|show|validate)
                command="$1"
                shift
                ;;
            -o|--output)
                env_file="$2"
                shift 2
                ;;
            -f|--force)
                FORCE=true
                shift
                ;;
            -n|--dry-run)
                DRY_RUN=true
                shift
                ;;
            -v|--verbose)
                VERBOSE=true
                shift
                ;;
            -h|--help)
                usage
                exit 0
                ;;
            *)
                if [[ -z "$OUTPUT_FILE" && ! "$1" =~ ^- ]]; then
                    env_file="$1"
                    shift
                else
                    log ERROR "Unknown option: $1"
                    usage
                    exit 1
                fi
                ;;
        esac
    done
    
    echo ""
    echo -e "${CYAN}╔══════════════════════════════════════════════════════════════╗${NC}"
    echo -e "${CYAN}║${NC}           ${BOLD}Nebula Command - Secret Generator${NC}                 ${CYAN}║${NC}"
    echo -e "${CYAN}╚══════════════════════════════════════════════════════════════╝${NC}"
    
    case "$command" in
        generate)
            generate_all_secrets "$env_file"
            ;;
        show)
            show_secrets "$env_file"
            ;;
        validate)
            validate_secrets "$env_file"
            ;;
    esac
}

main "$@"
