#!/bin/bash
# Centralized Secrets Manager for Nebula Homelab
# Encrypts and syncs secrets across environments using Age encryption

set -e

SECRETS_DIR="${HOME}/.homelab-secrets"
SECRETS_FILE="${SECRETS_DIR}/secrets.enc"
AGE_KEY="${SECRETS_DIR}/age-key.txt"
PROJECT_ROOT="$(cd "$(dirname "${BASH_SOURCE[0]}")/.." && pwd)"

RED='\033[0;31m'
GREEN='\033[0;32m'
YELLOW='\033[1;33m'
CYAN='\033[0;36m'
NC='\033[0m'

log_info() { echo -e "${CYAN}[INFO]${NC} $*"; }
log_success() { echo -e "${GREEN}[OK]${NC} $*"; }
log_warn() { echo -e "${YELLOW}[WARN]${NC} $*"; }
log_error() { echo -e "${RED}[ERROR]${NC} $*"; }

check_age_installed() {
    if ! command -v age &> /dev/null; then
        log_error "Age encryption tool not installed"
        echo ""
        echo "Install with:"
        echo "  Ubuntu/Debian: sudo apt install age"
        echo "  macOS:         brew install age"
        echo "  Manual:        https://github.com/FiloSottile/age/releases"
        exit 1
    fi
}

init() {
    log_info "Initializing secrets management..."
    
    check_age_installed
    
    mkdir -p "$SECRETS_DIR"
    chmod 700 "$SECRETS_DIR"
    
    if [ -f "$AGE_KEY" ]; then
        log_warn "Age key already exists at: $AGE_KEY"
        read -p "Overwrite? [y/N]: " response
        if [[ ! "$response" =~ ^[Yy]$ ]]; then
            log_info "Keeping existing key"
            return 0
        fi
    fi
    
    log_info "Generating new Age encryption key..."
    age-keygen -o "$AGE_KEY" 2>&1
    chmod 600 "$AGE_KEY"
    
    echo ""
    log_success "Encryption key created!"
    echo ""
    echo "╔══════════════════════════════════════════════════════════════╗"
    echo "║  IMPORTANT: BACKUP YOUR ENCRYPTION KEY!                      ║"
    echo "║  If lost, encrypted secrets cannot be recovered.             ║"
    echo "╠══════════════════════════════════════════════════════════════╣"
    echo "║  Key location: $AGE_KEY"
    echo "╚══════════════════════════════════════════════════════════════╝"
    echo ""
    
    local pubkey=$(grep "public key" "$AGE_KEY" | awk '{print $NF}')
    log_info "Public key: $pubkey"
}

encrypt() {
    local input_file="${1:-${PROJECT_ROOT}/.env}"
    
    check_age_installed
    
    if [ ! -f "$AGE_KEY" ]; then
        log_error "No encryption key found. Run: $0 init"
        exit 1
    fi
    
    if [ ! -f "$input_file" ]; then
        log_error "Input file not found: $input_file"
        exit 1
    fi
    
    local pubkey=$(grep "public key" "$AGE_KEY" | awk '{print $NF}')
    
    log_info "Encrypting: $input_file"
    age -r "$pubkey" -o "$SECRETS_FILE" "$input_file"
    chmod 600 "$SECRETS_FILE"
    
    log_success "Encrypted secrets saved to: $SECRETS_FILE"
    
    local secret_count=$(grep -c "=" "$input_file" 2>/dev/null || echo "0")
    log_info "Encrypted $secret_count secret(s)"
}

decrypt() {
    local output_file="${1:-${PROJECT_ROOT}/.env}"
    
    check_age_installed
    
    if [ ! -f "$AGE_KEY" ]; then
        log_error "No decryption key found. Copy key to: $AGE_KEY"
        exit 1
    fi
    
    if [ ! -f "$SECRETS_FILE" ]; then
        log_error "No encrypted secrets found at: $SECRETS_FILE"
        log_info "First encrypt your .env file: $0 encrypt"
        exit 1
    fi
    
    if [ -f "$output_file" ]; then
        log_warn "Output file exists: $output_file"
        read -p "Overwrite? [y/N]: " response
        if [[ ! "$response" =~ ^[Yy]$ ]]; then
            log_info "Aborted"
            exit 0
        fi
    fi
    
    log_info "Decrypting to: $output_file"
    age -d -i "$AGE_KEY" -o "$output_file" "$SECRETS_FILE"
    chmod 600 "$output_file"
    
    log_success "Secrets decrypted successfully!"
    
    local secret_count=$(grep -c "=" "$output_file" 2>/dev/null || echo "0")
    log_info "Decrypted $secret_count secret(s)"
}

sync_to_server() {
    local server="$1"
    local dest_path="${2:-/opt/homelab/HomeLabHub}"
    
    if [ -z "$server" ]; then
        log_error "Server not specified"
        echo "Usage: $0 sync <user@host> [destination_path]"
        exit 1
    fi
    
    if [ ! -f "$SECRETS_FILE" ]; then
        log_error "No encrypted secrets found. Run: $0 encrypt"
        exit 1
    fi
    
    log_info "Syncing secrets to: $server"
    
    scp "$SECRETS_FILE" "${server}:${dest_path}/.secrets.enc"
    scp "$0" "${server}:${dest_path}/scripts/secrets-manager.sh"
    
    log_info "Decrypting on remote server..."
    ssh "$server" "cd $dest_path && chmod +x scripts/secrets-manager.sh && ./scripts/secrets-manager.sh decrypt"
    
    log_success "Secrets synced to $server"
}

sync_key_to_server() {
    local server="$1"
    
    if [ -z "$server" ]; then
        log_error "Server not specified"
        echo "Usage: $0 sync-key <user@host>"
        exit 1
    fi
    
    if [ ! -f "$AGE_KEY" ]; then
        log_error "No encryption key found. Run: $0 init"
        exit 1
    fi
    
    log_warn "You are about to copy your encryption key to a remote server!"
    log_warn "Only do this for trusted servers you control."
    read -p "Continue? [y/N]: " response
    if [[ ! "$response" =~ ^[Yy]$ ]]; then
        log_info "Aborted"
        exit 0
    fi
    
    log_info "Copying encryption key to: $server"
    ssh "$server" "mkdir -p ~/.homelab-secrets && chmod 700 ~/.homelab-secrets"
    scp "$AGE_KEY" "${server}:~/.homelab-secrets/age-key.txt"
    ssh "$server" "chmod 600 ~/.homelab-secrets/age-key.txt"
    
    log_success "Encryption key synced to $server"
}

view_secrets() {
    local env_file="${PROJECT_ROOT}/.env"
    
    if [ ! -f "$env_file" ]; then
        log_error "No .env file found at: $env_file"
        exit 1
    fi
    
    echo ""
    echo "Current secrets (keys only, values hidden):"
    echo "════════════════════════════════════════════"
    grep -v "^#" "$env_file" | grep "=" | cut -d'=' -f1 | sort
    echo "════════════════════════════════════════════"
    
    local count=$(grep -c "=" "$env_file" 2>/dev/null || echo "0")
    log_info "Total: $count secret(s)"
}

rotate() {
    local key_name="$1"
    
    if [ -z "$key_name" ]; then
        log_error "Key name not specified"
        echo "Usage: $0 rotate <KEY_NAME>"
        exit 1
    fi
    
    local env_file="${PROJECT_ROOT}/.env"
    
    if ! grep -q "^${key_name}=" "$env_file"; then
        log_error "Key not found: $key_name"
        exit 1
    fi
    
    log_info "Generating new value for: $key_name"
    local new_value=$(openssl rand -base64 32 | tr -d '\n')
    
    sed -i "s|^${key_name}=.*|${key_name}=${new_value}|" "$env_file"
    
    log_success "Rotated: $key_name"
    log_warn "Remember to re-encrypt and sync: $0 encrypt && $0 sync <server>"
}

status() {
    echo ""
    echo "═══════════════════════════════════════════════════════════════"
    echo "  Secrets Manager Status"
    echo "═══════════════════════════════════════════════════════════════"
    echo ""
    
    if [ -f "$AGE_KEY" ]; then
        log_success "Encryption key: $AGE_KEY"
        local pubkey=$(grep "public key" "$AGE_KEY" 2>/dev/null | awk '{print $NF}')
        echo "         Public key: ${pubkey:0:20}..."
    else
        log_warn "Encryption key: Not initialized"
    fi
    
    if [ -f "$SECRETS_FILE" ]; then
        log_success "Encrypted secrets: $SECRETS_FILE"
        local size=$(ls -lh "$SECRETS_FILE" | awk '{print $5}')
        local modified=$(stat -c %y "$SECRETS_FILE" 2>/dev/null | cut -d' ' -f1)
        echo "         Size: $size, Last modified: $modified"
    else
        log_warn "Encrypted secrets: Not found"
    fi
    
    local env_file="${PROJECT_ROOT}/.env"
    if [ -f "$env_file" ]; then
        log_success "Local .env: $env_file"
        local count=$(grep -c "=" "$env_file" 2>/dev/null || echo "0")
        echo "         Contains: $count secret(s)"
    else
        log_warn "Local .env: Not found"
    fi
    
    echo ""
}

show_help() {
    echo "Nebula Homelab Secrets Manager"
    echo ""
    echo "Usage: $0 <command> [options]"
    echo ""
    echo "Commands:"
    echo "  init              Initialize encryption key (first time setup)"
    echo "  encrypt [file]    Encrypt .env file (default: .env)"
    echo "  decrypt [file]    Decrypt to .env file (default: .env)"
    echo "  sync <host> [path] Sync encrypted secrets to remote server"
    echo "  sync-key <host>   Sync encryption key to remote server"
    echo "  view              View secret keys (not values)"
    echo "  rotate <key>      Generate new value for a secret"
    echo "  status            Show secrets management status"
    echo "  help              Show this help message"
    echo ""
    echo "Examples:"
    echo "  $0 init                                    # First time setup"
    echo "  $0 encrypt                                 # Encrypt current .env"
    echo "  $0 decrypt                                 # Decrypt to .env"
    echo "  $0 sync evin@host.evindrake.net            # Sync to production"
    echo "  $0 rotate JWT_SECRET_KEY                   # Rotate a secret"
    echo ""
}

case "${1:-help}" in
    init) init ;;
    encrypt) encrypt "$2" ;;
    decrypt) decrypt "$2" ;;
    sync) sync_to_server "$2" "$3" ;;
    sync-key) sync_key_to_server "$2" ;;
    view) view_secrets ;;
    rotate) rotate "$2" ;;
    status) status ;;
    help|--help|-h) show_help ;;
    *)
        log_error "Unknown command: $1"
        show_help
        exit 1
        ;;
esac
