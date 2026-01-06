#!/bin/bash
set -euo pipefail

SCRIPT_DIR="$(cd "$(dirname "${BASH_SOURCE[0]}")" && pwd)"
SHARED_DIR="$(dirname "$SCRIPT_DIR")/shared"

source "$SHARED_DIR/env-lib.sh"

cd "$SCRIPT_DIR"

VERBOSE=false
for arg in "$@"; do
    case $arg in
        -v|--verbose) VERBOSE=true ;;
    esac
done

show_help() {
    echo "Nebula Command - Local Ubuntu Deployment"
    echo ""
    echo "Usage: ./deploy.sh [options] [command]"
    echo ""
    echo "Options:"
    echo "  -v, --verbose  Show full output (default: compact)"
    echo ""
    echo "Commands:"
    echo "  (none)       Full deployment (setup + deploy)"
    echo "  setup        Interactive environment setup only"
    echo "  check        Check environment health"
    echo "  up           Start services only"
    echo "  down         Stop services"
    echo "  logs         View service logs (docker compose logs)"
    echo "  deploy-logs  View saved deploy logs"
    echo "  nas          Mount NAS storage"
    echo "  dns-sync     Sync Cloudflare DNS records"
    echo "  install      Install systemd service for auto-start on boot"
    echo "  uninstall    Remove systemd service"
    echo "  authelia     Generate Authelia password hash"
    echo "  help         Show this help"
    echo ""
    echo "Environment:"
    echo "  KEEP_BUILD_LOGS=true  Keep deploy logs even on success"
    echo ""
}

do_git_pull() {
    echo -e "${CYAN}[1/5] Pulling latest code...${NC}"
    local repo_root
    repo_root="$(dirname "$(dirname "$SCRIPT_DIR")")"
    cd "$repo_root"
    
    if [ "$VERBOSE" = true ]; then
        git pull origin main
    else
        echo -n "  Fetching updates... "
        if git pull origin main > /dev/null 2>&1; then
            echo -e "${GREEN}done${NC}"
        else
            echo -e "${YELLOW}check manually${NC}"
        fi
    fi
    
    cd "$SCRIPT_DIR"
    echo -e "${GREEN}✓ Code updated${NC}"
    echo ""
}

ensure_ssh_keys() {
    echo -e "${CYAN}━━━ SSH Keys ━━━${NC}"
    
    local ssh_dir="${HOME}/.ssh"
    local key_path="${ssh_dir}/homelab"
    
    if [ -f "$key_path" ] && [ -f "${key_path}.pub" ]; then
        echo -e "${GREEN}[OK]${NC} SSH key exists: $key_path"
        return 0
    fi
    
    echo -e "${YELLOW}[SETUP]${NC} No SSH key found, generating..."
    mkdir -p "$ssh_dir"
    chmod 700 "$ssh_dir"
    
    ssh-keygen -t ed25519 -f "$key_path" -N "" -C "homelab-$(hostname)-$(date +%Y%m%d)" -q
    
    if [ -f "$key_path" ]; then
        chmod 600 "$key_path"
        chmod 644 "${key_path}.pub"
        echo -e "${GREEN}[OK]${NC} SSH key generated: $key_path"
        echo ""
        echo -e "${YELLOW}Public key (add to remote servers' ~/.ssh/authorized_keys):${NC}"
        echo "━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━"
        cat "${key_path}.pub"
        echo "━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━"
        echo ""
    else
        echo -e "${RED}[ERROR]${NC} Failed to generate SSH key"
        return 1
    fi
}

ensure_authelia_secrets() {
    echo -e "${CYAN}━━━ Authelia Secrets ━━━${NC}"
    
    # Generate secrets in .env if not present
    local env_file="$SCRIPT_DIR/.env"
    
    if ! grep -q "AUTHELIA_JWT_SECRET=" "$env_file" 2>/dev/null || grep -q "AUTHELIA_JWT_SECRET=$" "$env_file" 2>/dev/null; then
        local jwt_secret=$(openssl rand -hex 32)
        echo "AUTHELIA_JWT_SECRET=$jwt_secret" >> "$env_file"
        echo -e "${GREEN}[OK]${NC} Generated AUTHELIA_JWT_SECRET"
    fi
    
    if ! grep -q "AUTHELIA_SESSION_SECRET=" "$env_file" 2>/dev/null || grep -q "AUTHELIA_SESSION_SECRET=$" "$env_file" 2>/dev/null; then
        local session_secret=$(openssl rand -hex 32)
        echo "AUTHELIA_SESSION_SECRET=$session_secret" >> "$env_file"
        echo -e "${GREEN}[OK]${NC} Generated AUTHELIA_SESSION_SECRET"
    fi
    
    if ! grep -q "AUTHELIA_STORAGE_KEY=" "$env_file" 2>/dev/null || grep -q "AUTHELIA_STORAGE_KEY=$" "$env_file" 2>/dev/null; then
        local storage_key=$(openssl rand -hex 32)
        echo "AUTHELIA_STORAGE_KEY=$storage_key" >> "$env_file"
        echo -e "${GREEN}[OK]${NC} Generated AUTHELIA_STORAGE_KEY"
    fi
    
    echo -e "${GREEN}[OK]${NC} Authelia secrets configured via environment variables"
}

do_env_setup() {
    echo -e "${CYAN}[2/5] Environment setup...${NC}"
    
    [ ! -f ".env" ] && touch ".env"
    
    normalize_env_file ".env"
    
    echo -e "${CYAN}━━━ Internal Secrets ━━━${NC}"
    ensure_internal_secrets ".env"
    
    ensure_ssh_keys
    ensure_authelia_secrets
    
    echo -e "${GREEN}✓ Environment ready${NC}"
    echo ""
}

check_nas() {
    echo -e "${CYAN}━━━ NAS Storage ━━━${NC}"
    
    local media_paths=("/srv/media" "/mnt/nas/all" "/mnt/media")
    local found_mount=""
    
    for path in "${media_paths[@]}"; do
        if [ -d "$path" ] && [ "$(ls -A "$path" 2>/dev/null)" ]; then
            found_mount="$path"
            break
        fi
    done
    
    if [ -n "$found_mount" ]; then
        echo -e "${GREEN}[OK]${NC} Media storage found at $found_mount"
    else
        echo -e "${YELLOW}[SKIP]${NC} No media storage detected"
        echo "       Checked: ${media_paths[*]}"
        echo "       Plex will start but may not have media files"
    fi
    echo ""
}

do_dns_sync() {
    echo -e "${CYAN}[3/5] Syncing DNS records...${NC}"
    
    if [ -z "${CLOUDFLARE_API_TOKEN:-}" ]; then
        echo -e "${YELLOW}[SKIP]${NC} CLOUDFLARE_API_TOKEN not set, skipping DNS sync"
        echo "       Set in .env to enable automatic DNS management"
        return 0
    fi
    
    if [ -z "${DOMAIN:-}" ] || [ "${DOMAIN:-}" = "example.com" ]; then
        echo -e "${YELLOW}[SKIP]${NC} DOMAIN not set or still example.com"
        return 0
    fi
    
    local sync_script="$(dirname "$(dirname "$SCRIPT_DIR")")/scripts/cloudflare-sync.js"
    if [ -f "$sync_script" ]; then
        echo -n "  Syncing DNS records for $DOMAIN... "
        if node "$sync_script" 2>&1 | tail -1; then
            echo -e "${GREEN}done${NC}"
        else
            echo -e "${YELLOW}check manually${NC}"
        fi
    else
        echo -e "${YELLOW}[SKIP]${NC} cloudflare-sync.js not found"
    fi
    
    echo -e "${GREEN}✓ DNS configured${NC}"
    echo ""
}

do_deploy() {
    echo -e "${CYAN}[4/5] Deploying services...${NC}"
    
    local log_dir="$SCRIPT_DIR/logs"
    mkdir -p "$log_dir"
    local log_file="$log_dir/deploy_$(date +%Y%m%d_%H%M%S).log"
    local deploy_result=0
    
    # Create required directories
    mkdir -p /srv/media/community 2>/dev/null || sudo mkdir -p /srv/media/community
    sudo chown 1000:1000 /srv/media/community 2>/dev/null || true
    
    if [ "$VERBOSE" = true ]; then
        echo "Deploy log: $log_file"
        echo ""
        {
            echo "=== Docker Pull ===" 
            docker compose pull
            echo ""
            echo "=== Docker Up ==="
            docker compose down --remove-orphans 2>/dev/null || true
            docker compose up -d
        } 2>&1 | tee "$log_file" || deploy_result=$?
    else
        echo -n "  Pulling images... "
        if docker compose pull > "$log_file" 2>&1; then
            echo -e "${GREEN}done${NC}"
        else
            deploy_result=$?
            echo -e "${RED}failed${NC}"
        fi
        
        if [ $deploy_result -eq 0 ]; then
            echo -n "  Stopping old containers... "
            docker compose down --remove-orphans >> "$log_file" 2>&1 || true
            echo -e "${GREEN}done${NC}"
            
            echo -n "  Starting services... "
            if docker compose up -d >> "$log_file" 2>&1; then
                echo -e "${GREEN}done${NC}"
            else
                deploy_result=$?
                echo -e "${RED}failed${NC}"
            fi
        fi
    fi
    
    if [ $deploy_result -eq 0 ]; then
        echo -e "${GREEN}✓ Services started${NC}"
        if [ "${KEEP_BUILD_LOGS:-}" != "true" ]; then
            rm -f "$log_file"
        fi
    else
        echo ""
        echo -e "${RED}✗ Deploy failed!${NC}"
        echo -e "${YELLOW}Full log saved to: $log_file${NC}"
        echo ""
        echo "Last 30 lines:"
        tail -30 "$log_file"
        echo ""
        echo "To retry with verbose: ./deploy.sh -v"
        exit 1
    fi
    echo ""
}

do_post_deploy() {
    echo -e "${CYAN}[5/5] Health checks...${NC}"
    sleep 20
    
    echo ""
    echo -e "${CYAN}━━━ Service Status ━━━${NC}"
    docker compose ps
    
    echo ""
    echo -e "${CYAN}━━━ Health Checks ━━━${NC}"
    
    check_health() {
        local name=$1
        local url=$2
        if curl -sf "$url" > /dev/null 2>&1; then
            echo -e "  ${GREEN}✓${NC} $name"
        else
            echo -e "  ${YELLOW}⏳${NC} $name (starting...)"
        fi
    }
    
    check_health "Plex" "http://localhost:32400/identity"
    check_health "Jellyfin" "http://localhost:8096/health"
    check_health "MinIO" "http://localhost:9000/minio/health/live"
    check_health "Home Assistant" "http://localhost:8123/"
    check_health "Authelia" "http://localhost:9091/api/health"
    
    local domain="${DOMAIN:-example.com}"
    
    echo ""
    echo -e "${GREEN}═══ Local Deployment Complete ═══${NC}"
    echo ""
    echo "Public URLs (after DNS propagation):"
    echo "  Dashboard:      https://dashboard.$domain"
    echo "  Plex:           https://plex.$domain"
    echo "  Jellyfin:       https://jellyfin.$domain"
    echo "  Home Assistant: https://home.$domain"
    echo "  Auth Portal:    https://auth.$domain"
    echo ""
    echo "Protected URLs (require Authelia login):"
    echo "  Torrents:       https://torrent.$domain"
    echo "  VNC Desktop:    https://vnc.$domain"
    echo "  SSH Terminal:   https://ssh.$domain"
    echo "  VM Manager:     https://vms.$domain"
    echo "  Game Stream:    https://gamestream.$domain"
    echo "  Storage:        https://storage.$domain"
    echo ""
    echo "Commands:"
    echo "  Logs:       docker compose logs -f [service]"
    echo "  Status:     docker compose ps"
    echo "  Restart:    docker compose restart [service]"
    echo "  Auto-start: ./deploy.sh install"
}

do_install_systemd() {
    echo -e "${CYAN}═══ Installing Systemd Service ═══${NC}"
    
    local service_file="$SCRIPT_DIR/nebula-stack.service"
    local target_path="/etc/systemd/system/nebula-stack.service"
    
    if [ ! -f "$service_file" ]; then
        echo -e "${RED}[ERROR]${NC} nebula-stack.service not found"
        exit 1
    fi
    
    echo "Installing systemd service..."
    sudo cp "$service_file" "$target_path"
    sudo systemctl daemon-reload
    sudo systemctl enable nebula-stack.service
    
    echo -e "${GREEN}✓ Systemd service installed${NC}"
    echo ""
    echo "The stack will now automatically start on boot!"
    echo ""
    echo "Commands:"
    echo "  Start:   sudo systemctl start nebula-stack"
    echo "  Stop:    sudo systemctl stop nebula-stack"
    echo "  Status:  sudo systemctl status nebula-stack"
    echo "  Logs:    sudo journalctl -u nebula-stack -f"
}

do_uninstall_systemd() {
    echo -e "${CYAN}═══ Removing Systemd Service ═══${NC}"
    
    sudo systemctl stop nebula-stack.service 2>/dev/null || true
    sudo systemctl disable nebula-stack.service 2>/dev/null || true
    sudo rm -f /etc/systemd/system/nebula-stack.service
    sudo systemctl daemon-reload
    
    echo -e "${GREEN}✓ Systemd service removed${NC}"
}

do_authelia_hash() {
    echo -e "${CYAN}═══ Generate Authelia Password Hash ═══${NC}"
    echo ""
    echo "Enter the password to hash:"
    read -rs password
    echo ""
    
    docker run --rm authelia/authelia:latest authelia crypto hash generate argon2 --password "$password"
    echo ""
    echo "Copy the hash above into services/authelia/users_database.yml"
}

case "${1:-}" in
    help|--help|-h)
        show_help
        ;;
    setup)
        echo -e "${CYAN}═══ Nebula Command - Environment Setup ═══${NC}"
        interactive_setup ".env"
        ;;
    check)
        env_doctor ".env" "check"
        check_nas
        ;;
    up)
        echo -e "${CYAN}═══ Nebula Command - Start Services ═══${NC}"
        do_deploy
        ;;
    down)
        echo -e "${CYAN}═══ Nebula Command - Stop Services ═══${NC}"
        docker compose down
        echo -e "${GREEN}✓ Services stopped${NC}"
        ;;
    logs)
        docker compose logs -f "${2:-}"
        ;;
    deploy-logs)
        log_dir="$SCRIPT_DIR/logs"
        if [ -d "$log_dir" ] && [ "$(ls -A "$log_dir" 2>/dev/null)" ]; then
            echo -e "${CYAN}═══ Deploy Logs ═══${NC}"
            ls -lt "$log_dir"/*.log 2>/dev/null | head -10
            echo ""
            latest=$(ls -t "$log_dir"/*.log 2>/dev/null | head -1)
            if [ -n "$latest" ]; then
                echo "Latest log: $latest"
                echo ""
                read -r -p "View latest log? (Y/n) " view_log
                if [[ ! "$view_log" =~ ^[Nn]$ ]]; then
                    less "$latest"
                fi
            fi
        else
            echo "No deploy logs found. Logs are saved when deploys fail."
            echo "To keep logs on success: KEEP_BUILD_LOGS=true ./deploy.sh"
        fi
        ;;
    nas)
        echo -e "${CYAN}═══ Nebula Command - Mount NAS ═══${NC}"
        sudo ./scripts/setup-nas-mounts.sh
        ;;
    dns-sync)
        source .env 2>/dev/null || true
        do_dns_sync
        ;;
    install)
        do_install_systemd
        ;;
    uninstall)
        do_uninstall_systemd
        ;;
    authelia)
        do_authelia_hash
        ;;
    *)
        echo -e "${CYAN}═══ Nebula Command - Local Ubuntu Deployment ═══${NC}"
        echo "Directory: $SCRIPT_DIR"
        echo ""
        
        # Load environment first
        set -a
        source .env 2>/dev/null || true
        set +a
        
        do_git_pull
        do_env_setup
        
        # Reload environment after secrets are generated
        set -a
        source .env 2>/dev/null || true
        set +a
        
        check_nas
        do_dns_sync
        do_deploy
        do_post_deploy
        ;;
esac
