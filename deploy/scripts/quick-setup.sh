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
MAGENTA='\033[0;35m'
BOLD='\033[1m'
NC='\033[0m'

VERBOSE=false
DRY_RUN=false
SKIP_DEPS=false
AUTO_START=true

log() {
    local level="$1"
    shift
    case "$level" in
        INFO)  echo -e "${GREEN}[✓]${NC} $*" ;;
        WARN)  echo -e "${YELLOW}[⚠]${NC} $*" ;;
        ERROR) echo -e "${RED}[✗]${NC} $*" >&2 ;;
        STEP)  echo -e "${CYAN}[→]${NC} $*" ;;
        DEBUG) [[ "$VERBOSE" == "true" ]] && echo -e "${BLUE}[DEBUG]${NC} $*" ;;
    esac
}

print_banner() {
    echo ""
    echo -e "${CYAN}╔══════════════════════════════════════════════════════════════╗${NC}"
    echo -e "${CYAN}║${NC}            ${BOLD}Nebula Command - Quick Setup Wizard${NC}              ${CYAN}║${NC}"
    echo -e "${CYAN}╚══════════════════════════════════════════════════════════════╝${NC}"
    echo ""
}

print_section() {
    echo ""
    echo -e "${MAGENTA}━━━ $1 ━━━${NC}"
}

spinner() {
    local pid=$1
    local message="$2"
    local spin='⠋⠙⠹⠸⠼⠴⠦⠧⠇⠏'
    local i=0
    while kill -0 "$pid" 2>/dev/null; do
        printf "\r${CYAN}[%s]${NC} %s" "${spin:i++%${#spin}:1}" "$message"
        sleep 0.1
    done
    wait "$pid"
    local status=$?
    printf "\r"
    return $status
}

progress_bar() {
    local current=$1
    local total=$2
    local width=40
    local percent=$((current * 100 / total))
    local filled=$((current * width / total))
    local empty=$((width - filled))
    printf "\r  [${GREEN}%${filled}s${NC}%${empty}s] %3d%%" "" "" "$percent" | tr ' ' '█' | sed "s/█\(.*\)█/█\1 /g"
}

detect_environment() {
    print_section "Detecting Environment"
    
    local env_type="unknown"
    local os_type="unknown"
    local details=""
    
    if [[ -n "${REPL_ID:-}" ]] || [[ -d "/home/runner" && -f "/.replit" ]]; then
        env_type="replit"
        os_type="linux"
        details="Replit Cloud Environment"
    elif [[ -f "/etc/lsb-release" ]] && grep -q "Ubuntu" /etc/lsb-release 2>/dev/null; then
        os_type="ubuntu"
        if hostnamectl 2>/dev/null | grep -q "Linode"; then
            env_type="linode"
            details="Linode Cloud Server (Ubuntu)"
        else
            env_type="local"
            details="Local Ubuntu Desktop/Server"
        fi
    elif [[ "$(uname)" == "Darwin" ]]; then
        env_type="macos"
        os_type="macos"
        details="macOS $(sw_vers -productVersion 2>/dev/null || echo '')"
    elif [[ -f "/proc/version" ]] && grep -qi "microsoft" /proc/version 2>/dev/null; then
        env_type="wsl"
        os_type="linux"
        details="Windows Subsystem for Linux"
    elif [[ "$OSTYPE" == "msys" ]] || [[ "$OSTYPE" == "cygwin" ]] || [[ -n "${WINDIR:-}" ]]; then
        env_type="windows"
        os_type="windows"
        details="Windows (Git Bash/MSYS)"
    elif [[ -f "/etc/os-release" ]]; then
        os_type="linux"
        env_type="linux"
        details=$(grep "PRETTY_NAME" /etc/os-release 2>/dev/null | cut -d'"' -f2 || echo "Linux")
    fi
    
    log INFO "Environment: ${BOLD}$env_type${NC}"
    log INFO "OS Type: ${BOLD}$os_type${NC}"
    log INFO "Details: $details"
    
    echo "$env_type"
}

check_dependencies() {
    print_section "Checking Dependencies"
    
    local deps=("git" "curl" "jq")
    local missing=()
    
    for dep in "${deps[@]}"; do
        if command -v "$dep" &>/dev/null; then
            log INFO "$dep: installed"
        else
            log WARN "$dep: missing"
            missing+=("$dep")
        fi
    done
    
    if command -v docker &>/dev/null; then
        local docker_ver=$(docker --version | cut -d' ' -f3 | tr -d ',')
        log INFO "docker: $docker_ver"
    else
        log WARN "docker: missing"
        missing+=("docker")
    fi
    
    if command -v docker-compose &>/dev/null || docker compose version &>/dev/null 2>&1; then
        log INFO "docker-compose: installed"
    else
        log WARN "docker-compose: missing"
        missing+=("docker-compose")
    fi
    
    if command -v node &>/dev/null; then
        local node_ver=$(node --version 2>/dev/null)
        log INFO "node: $node_ver"
    else
        log WARN "node: missing"
        missing+=("node")
    fi
    
    if [[ ${#missing[@]} -gt 0 ]]; then
        echo ""
        log WARN "Missing dependencies: ${missing[*]}"
        return 1
    fi
    
    log INFO "All dependencies satisfied"
    return 0
}

install_dependencies() {
    local env_type="$1"
    print_section "Installing Dependencies"
    
    case "$env_type" in
        ubuntu|local|linode)
            log STEP "Updating package lists..."
            if [[ "$DRY_RUN" != "true" ]]; then
                sudo apt-get update -qq
            fi
            
            log STEP "Installing essential packages..."
            if [[ "$DRY_RUN" != "true" ]]; then
                sudo apt-get install -y -qq git curl jq openssl ca-certificates gnupg lsb-release
            fi
            
            if ! command -v docker &>/dev/null; then
                log STEP "Installing Docker..."
                if [[ "$DRY_RUN" != "true" ]]; then
                    curl -fsSL https://get.docker.com | sh
                    sudo usermod -aG docker "$USER"
                fi
            fi
            
            if ! command -v node &>/dev/null; then
                log STEP "Installing Node.js..."
                if [[ "$DRY_RUN" != "true" ]]; then
                    curl -fsSL https://deb.nodesource.com/setup_20.x | sudo -E bash -
                    sudo apt-get install -y nodejs
                fi
            fi
            ;;
        replit)
            log INFO "Running on Replit - dependencies managed by environment"
            ;;
        macos)
            if ! command -v brew &>/dev/null; then
                log ERROR "Homebrew not found. Install from https://brew.sh"
                return 1
            fi
            log STEP "Installing via Homebrew..."
            if [[ "$DRY_RUN" != "true" ]]; then
                brew install git curl jq openssl node
                brew install --cask docker
            fi
            ;;
        *)
            log WARN "Unknown environment - please install dependencies manually"
            return 1
            ;;
    esac
    
    log INFO "Dependencies installed successfully"
}

generate_secrets() {
    print_section "Generating Secrets"
    
    if [[ -x "$SCRIPT_DIR/generate-secrets.sh" ]]; then
        log STEP "Using generate-secrets.sh..."
        if [[ "$DRY_RUN" != "true" ]]; then
            "$SCRIPT_DIR/generate-secrets.sh" "$@"
        else
            log INFO "[DRY-RUN] Would run generate-secrets.sh"
        fi
    else
        log STEP "Generating secrets inline..."
        generate_secrets_inline "$@"
    fi
}

generate_secrets_inline() {
    local env_file="${1:-$REPO_ROOT/.env}"
    
    if [[ ! -f "$env_file" ]]; then
        touch "$env_file"
    fi
    
    local secrets=(
        "SESSION_SECRET"
        "SECRET_KEY"
        "POSTGRES_PASSWORD"
        "JARVIS_DB_PASSWORD"
        "DISCORD_DB_PASSWORD"
        "STREAMBOT_DB_PASSWORD"
        "SERVICE_AUTH_TOKEN"
        "N8N_ENCRYPTION_KEY"
        "GRAFANA_ADMIN_PASSWORD"
        "MINIO_ROOT_PASSWORD"
        "CODE_SERVER_PASSWORD"
    )
    
    for secret in "${secrets[@]}"; do
        if ! grep -q "^${secret}=" "$env_file" 2>/dev/null || grep -q "^${secret}=$" "$env_file" 2>/dev/null; then
            local value=$(openssl rand -hex 32)
            if grep -q "^${secret}=" "$env_file" 2>/dev/null; then
                sed -i "s|^${secret}=.*|${secret}=${value}|" "$env_file" 2>/dev/null || \
                sed -i '' "s|^${secret}=.*|${secret}=${value}|" "$env_file"
            else
                echo "${secret}=${value}" >> "$env_file"
            fi
            log INFO "Generated: $secret"
        else
            log DEBUG "Exists: $secret"
        fi
    done
}

configure_env_interactive() {
    local env_type="$1"
    print_section "Interactive Configuration"
    
    local env_file="$REPO_ROOT/.env"
    
    if [[ -f "$REPO_ROOT/.env.example" && ! -f "$env_file" ]]; then
        cp "$REPO_ROOT/.env.example" "$env_file"
        log INFO "Created .env from .env.example"
    elif [[ ! -f "$env_file" ]]; then
        touch "$env_file"
    fi
    
    echo ""
    echo -e "${CYAN}Configure required API keys and tokens:${NC}"
    echo "Press Enter to skip if you don't have a value yet."
    echo ""
    
    prompt_env_var() {
        local var_name="$1"
        local description="$2"
        local is_secret="${3:-false}"
        
        local existing=""
        if grep -q "^${var_name}=" "$env_file" 2>/dev/null; then
            existing=$(grep "^${var_name}=" "$env_file" | cut -d'=' -f2-)
        fi
        
        if [[ -n "$existing" && "$existing" != "YOUR_"* && "$existing" != "GENERATE_ME"* ]]; then
            log DEBUG "$var_name already configured"
            return
        fi
        
        echo -e "  ${YELLOW}$description${NC}"
        if [[ "$is_secret" == "true" ]]; then
            echo -n "  $var_name: "
            read -s value
            echo ""
        else
            echo -n "  $var_name: "
            read value
        fi
        
        if [[ -n "$value" ]]; then
            if grep -q "^${var_name}=" "$env_file" 2>/dev/null; then
                sed -i "s|^${var_name}=.*|${var_name}=${value}|" "$env_file" 2>/dev/null || \
                sed -i '' "s|^${var_name}=.*|${var_name}=${value}|" "$env_file"
            else
                echo "${var_name}=${value}" >> "$env_file"
            fi
            log INFO "Saved: $var_name"
        fi
    }
    
    echo -e "${BOLD}OpenAI (for AI features):${NC}"
    prompt_env_var "OPENAI_API_KEY" "Get from: https://platform.openai.com/api-keys" true
    
    echo ""
    echo -e "${BOLD}Discord Bot:${NC}"
    prompt_env_var "DISCORD_BOT_TOKEN" "Get from: https://discord.com/developers/applications" true
    prompt_env_var "DISCORD_CLIENT_ID" "Discord Application ID"
    prompt_env_var "DISCORD_CLIENT_SECRET" "Discord OAuth2 Secret" true
    
    echo ""
    echo -e "${BOLD}Twitch (for Stream Bot):${NC}"
    prompt_env_var "TWITCH_CLIENT_ID" "Get from: https://dev.twitch.tv/console/apps"
    prompt_env_var "TWITCH_CLIENT_SECRET" "Twitch OAuth2 Secret" true
    
    if [[ "$env_type" == "linode" || "$env_type" == "local" ]]; then
        echo ""
        echo -e "${BOLD}Cloudflare (for DNS):${NC}"
        prompt_env_var "CLOUDFLARE_API_TOKEN" "Get from: https://dash.cloudflare.com/profile/api-tokens" true
    fi
    
    if [[ "$env_type" == "local" ]]; then
        echo ""
        echo -e "${BOLD}Local Services:${NC}"
        prompt_env_var "PLEX_TOKEN" "Plex authentication token" true
        prompt_env_var "HOME_ASSISTANT_TOKEN" "Home Assistant long-lived access token" true
    fi
    
    log INFO "Configuration saved to $env_file"
}

start_services() {
    local env_type="$1"
    print_section "Starting Services"
    
    if [[ "$DRY_RUN" == "true" ]]; then
        log INFO "[DRY-RUN] Would start services for $env_type"
        return 0
    fi
    
    case "$env_type" in
        linode)
            log STEP "Starting Linode services..."
            if [[ -f "$DEPLOY_ROOT/linode/docker-compose.yml" ]]; then
                cd "$DEPLOY_ROOT/linode"
                docker compose up -d
            fi
            ;;
        local)
            log STEP "Starting local services..."
            if [[ -f "$DEPLOY_ROOT/local/docker-compose.yml" ]]; then
                cd "$DEPLOY_ROOT/local"
                docker compose up -d
            fi
            ;;
        replit)
            log STEP "Services managed by Replit workflows"
            ;;
        *)
            log WARN "Service startup not configured for $env_type"
            ;;
    esac
    
    log INFO "Services started"
}

run_health_checks() {
    print_section "Health Checks"
    
    if [[ -x "$SCRIPT_DIR/health-check.sh" ]]; then
        "$SCRIPT_DIR/health-check.sh" --quick 2>/dev/null || true
    else
        log INFO "Checking basic connectivity..."
        
        if command -v docker &>/dev/null; then
            local running=$(docker ps -q 2>/dev/null | wc -l)
            log INFO "Docker containers running: $running"
        fi
        
        if curl -sf --max-time 5 "http://localhost:5000" &>/dev/null; then
            log INFO "Dashboard: responding"
        else
            log WARN "Dashboard: not responding (may need more time)"
        fi
    fi
}

usage() {
    cat << EOF
${BOLD}Nebula Command - Quick Setup Wizard${NC}

${CYAN}USAGE:${NC}
    $(basename "$0") [OPTIONS]

${CYAN}OPTIONS:${NC}
    -e, --env TYPE      Force environment type (replit, linode, local, ubuntu)
    -s, --skip-deps     Skip dependency installation
    -n, --dry-run       Show what would be done without executing
    --no-start          Don't start services after setup
    -v, --verbose       Enable verbose output
    -h, --help          Show this help

${CYAN}EXAMPLES:${NC}
    $(basename "$0")                    # Auto-detect and setup
    $(basename "$0") -e linode          # Force Linode setup
    $(basename "$0") --dry-run          # Preview setup steps
    $(basename "$0") --skip-deps        # Skip installing dependencies

${CYAN}ENVIRONMENT DETECTION:${NC}
    The wizard auto-detects:
    - Replit Cloud Environment
    - Linode Cloud Server
    - Local Ubuntu Desktop
    - macOS
    - Windows (WSL/Git Bash)

${CYAN}FEATURES:${NC}
    - Auto-generates all required secrets
    - Interactive API key configuration
    - Installs missing dependencies
    - Starts services after setup
    - Runs health checks
EOF
}

main() {
    local forced_env=""
    
    while [[ $# -gt 0 ]]; do
        case "$1" in
            -e|--env)
                forced_env="$2"
                shift 2
                ;;
            -s|--skip-deps)
                SKIP_DEPS=true
                shift
                ;;
            -n|--dry-run)
                DRY_RUN=true
                shift
                ;;
            --no-start)
                AUTO_START=false
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
                log ERROR "Unknown option: $1"
                usage
                exit 1
                ;;
        esac
    done
    
    print_banner
    
    [[ "$DRY_RUN" == "true" ]] && log WARN "DRY-RUN MODE - No changes will be made"
    
    local env_type
    if [[ -n "$forced_env" ]]; then
        env_type="$forced_env"
        log INFO "Using forced environment: $env_type"
    else
        env_type=$(detect_environment)
    fi
    
    if [[ "$SKIP_DEPS" != "true" ]]; then
        if ! check_dependencies; then
            echo ""
            read -p "Install missing dependencies? [Y/n] " -n 1 -r
            echo ""
            if [[ ! $REPLY =~ ^[Nn]$ ]]; then
                install_dependencies "$env_type"
            fi
        fi
    fi
    
    generate_secrets "$REPO_ROOT/.env"
    
    configure_env_interactive "$env_type"
    
    if [[ "$AUTO_START" == "true" ]]; then
        start_services "$env_type"
        
        echo ""
        sleep 3
        run_health_checks
    fi
    
    print_section "Setup Complete"
    echo ""
    echo -e "${GREEN}${BOLD}✓ Quick setup completed successfully!${NC}"
    echo ""
    echo "Next steps:"
    echo "  1. Review your .env file: ${CYAN}cat .env${NC}"
    echo "  2. Check service status:  ${CYAN}docker ps${NC}"
    echo "  3. View logs:             ${CYAN}docker compose logs -f${NC}"
    echo ""
    
    if [[ "$env_type" == "replit" ]]; then
        echo "For Replit, run workflows from the Workflows panel."
    fi
}

main "$@"
