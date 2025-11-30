#!/bin/bash
set -euo pipefail

echo "================================================"
echo "  SSH Key Management Setup"
echo "================================================"
echo ""

SCRIPT_DIR="$(cd "$(dirname "${BASH_SOURCE[0]}")" && pwd)"
CONFIG_DIR="${CONFIG_DIR:-$HOME/.config/homelab}"
SSH_CONFIG="$CONFIG_DIR/ssh.conf"
SSH_DIR="$HOME/.ssh"
KEY_NAME="${SSH_KEY_NAME:-homelab}"
KEY_TYPE="${SSH_KEY_TYPE:-ed25519}"
KEY_BITS="${SSH_KEY_BITS:-4096}"
KEY_COMMENT="${SSH_KEY_COMMENT:-homelab-$(hostname)-$(date +%Y%m%d)}"

print_status() { echo -e "\n\033[1;34m==>\033[0m \033[1m$1\033[0m"; }
print_success() { echo -e "\033[1;32m✓\033[0m $1"; }
print_warning() { echo -e "\033[1;33m⚠\033[0m $1"; }
print_error() { echo -e "\033[1;31m✗\033[0m $1"; }

show_usage() {
    cat << EOF
Usage: $(basename "$0") [OPTIONS] [COMMAND]

Commands:
    generate            Generate a new SSH key pair (default if no command)
    copy HOST           Copy public key to a remote host
    test HOST           Test SSH connection to a remote host
    list                List configured SSH keys
    status              Show SSH key status

Options:
    --key-name NAME     Name for the SSH key (default: homelab)
    --key-type TYPE     Key type: ed25519, rsa, ecdsa (default: ed25519)
    --key-bits BITS     Key bits for RSA (default: 4096)
    --comment COMMENT   Comment for the key
    --user USER         Remote user for copy/test (default: current user)
    --port PORT         SSH port (default: 22)
    --force             Overwrite existing key
    --no-passphrase     Generate key without passphrase
    --help              Show this help message

Environment Variables:
    SSH_KEY_NAME        Name for the SSH key
    SSH_KEY_TYPE        Key type (ed25519, rsa, ecdsa)
    SSH_KEY_BITS        Key bits for RSA keys
    SSH_KEY_COMMENT     Comment for the key
    CONFIG_DIR          Configuration directory

Examples:
    # Generate a new SSH key
    $(basename "$0") generate

    # Generate an RSA key
    $(basename "$0") generate --key-type rsa --key-bits 4096

    # Copy key to remote host
    $(basename "$0") copy 192.168.1.100

    # Copy key with specific user
    $(basename "$0") copy --user admin 192.168.1.100

    # Test connection
    $(basename "$0") test 192.168.1.100

    # Test with Tailscale IP
    $(basename "$0") test 100.x.x.x
EOF
}

REMOTE_USER="${USER:-$(whoami)}"
REMOTE_PORT="22"
FORCE_OVERWRITE="false"
NO_PASSPHRASE="false"
COMMAND=""
TARGET_HOST=""

parse_args() {
    while [[ $# -gt 0 ]]; do
        case $1 in
            generate|copy|test|list|status)
                COMMAND="$1"
                shift
                if [[ $# -gt 0 && ! "$1" =~ ^-- ]]; then
                    TARGET_HOST="$1"
                    shift
                fi
                ;;
            --key-name)
                KEY_NAME="$2"
                shift 2
                ;;
            --key-type)
                KEY_TYPE="$2"
                shift 2
                ;;
            --key-bits)
                KEY_BITS="$2"
                shift 2
                ;;
            --comment)
                KEY_COMMENT="$2"
                shift 2
                ;;
            --user)
                REMOTE_USER="$2"
                shift 2
                ;;
            --port)
                REMOTE_PORT="$2"
                shift 2
                ;;
            --force)
                FORCE_OVERWRITE="true"
                shift
                ;;
            --no-passphrase)
                NO_PASSPHRASE="true"
                shift
                ;;
            --help)
                show_usage
                exit 0
                ;;
            *)
                if [[ -z "$TARGET_HOST" && ! "$1" =~ ^-- ]]; then
                    TARGET_HOST="$1"
                    shift
                else
                    print_error "Unknown option: $1"
                    show_usage
                    exit 1
                fi
                ;;
        esac
    done
    
    if [[ -z "$COMMAND" ]]; then
        COMMAND="generate"
    fi
}

ensure_ssh_dir() {
    if [[ ! -d "$SSH_DIR" ]]; then
        print_status "Creating SSH directory..."
        mkdir -p "$SSH_DIR"
        chmod 700 "$SSH_DIR"
        print_success "Created $SSH_DIR"
    fi
}

ensure_config_dir() {
    if [[ ! -d "$CONFIG_DIR" ]]; then
        mkdir -p "$CONFIG_DIR"
        chmod 700 "$CONFIG_DIR"
    fi
}

get_key_path() {
    echo "$SSH_DIR/id_${KEY_TYPE}_${KEY_NAME}"
}

key_exists() {
    local key_path
    key_path=$(get_key_path)
    [[ -f "$key_path" ]]
}

generate_key() {
    print_status "Generating SSH key pair..."
    
    ensure_ssh_dir
    ensure_config_dir
    
    local key_path
    key_path=$(get_key_path)
    
    if key_exists; then
        if [[ "$FORCE_OVERWRITE" == "true" ]]; then
            print_warning "Overwriting existing key: $key_path"
            rm -f "$key_path" "${key_path}.pub"
        else
            print_success "SSH key already exists: $key_path"
            print_warning "Use --force to overwrite"
            show_key_info "$key_path"
            return 0
        fi
    fi
    
    local keygen_args=()
    keygen_args+=("-t" "$KEY_TYPE")
    keygen_args+=("-f" "$key_path")
    keygen_args+=("-C" "$KEY_COMMENT")
    
    if [[ "$KEY_TYPE" == "rsa" ]]; then
        keygen_args+=("-b" "$KEY_BITS")
    fi
    
    if [[ "$NO_PASSPHRASE" == "true" ]]; then
        keygen_args+=("-N" "")
        print_warning "Generating key without passphrase (less secure)"
    fi
    
    ssh-keygen "${keygen_args[@]}"
    
    chmod 600 "$key_path"
    chmod 644 "${key_path}.pub"
    
    print_success "SSH key pair generated:"
    echo "  Private key: $key_path"
    echo "  Public key:  ${key_path}.pub"
    
    save_config "$key_path"
    show_key_info "$key_path"
}

show_key_info() {
    local key_path="$1"
    
    echo ""
    echo "Public Key:"
    echo "----------------------------------------"
    cat "${key_path}.pub"
    echo "----------------------------------------"
    echo ""
    
    local fingerprint
    fingerprint=$(ssh-keygen -lf "${key_path}.pub" 2>/dev/null || echo "unknown")
    echo "Fingerprint: $fingerprint"
}

copy_key() {
    if [[ -z "$TARGET_HOST" ]]; then
        print_error "No target host specified"
        echo "Usage: $(basename "$0") copy [--user USER] HOST"
        exit 1
    fi
    
    local key_path
    key_path=$(get_key_path)
    
    if ! key_exists; then
        print_error "SSH key does not exist: $key_path"
        print_warning "Run '$(basename "$0") generate' first"
        exit 1
    fi
    
    print_status "Copying public key to $REMOTE_USER@$TARGET_HOST..."
    
    if command -v ssh-copy-id &> /dev/null; then
        ssh-copy-id -i "${key_path}.pub" -p "$REMOTE_PORT" "$REMOTE_USER@$TARGET_HOST"
    else
        print_status "ssh-copy-id not available, using manual method..."
        local pub_key
        pub_key=$(cat "${key_path}.pub")
        
        ssh -p "$REMOTE_PORT" "$REMOTE_USER@$TARGET_HOST" "mkdir -p ~/.ssh && chmod 700 ~/.ssh && echo '$pub_key' >> ~/.ssh/authorized_keys && chmod 600 ~/.ssh/authorized_keys"
    fi
    
    if [[ $? -eq 0 ]]; then
        print_success "Public key copied to $TARGET_HOST"
        
        update_known_hosts "$TARGET_HOST"
        
        save_host_config "$TARGET_HOST"
    else
        print_error "Failed to copy public key"
        exit 1
    fi
}

update_known_hosts() {
    local host="$1"
    
    print_status "Updating known_hosts..."
    
    ssh-keyscan -p "$REMOTE_PORT" -H "$host" >> "$SSH_DIR/known_hosts" 2>/dev/null || true
    
    print_success "Added $host to known_hosts"
}

test_connection() {
    if [[ -z "$TARGET_HOST" ]]; then
        print_error "No target host specified"
        echo "Usage: $(basename "$0") test [--user USER] HOST"
        exit 1
    fi
    
    local key_path
    key_path=$(get_key_path)
    
    print_status "Testing SSH connection to $REMOTE_USER@$TARGET_HOST..."
    
    local ssh_args=()
    ssh_args+=("-o" "BatchMode=yes")
    ssh_args+=("-o" "ConnectTimeout=10")
    ssh_args+=("-o" "StrictHostKeyChecking=accept-new")
    ssh_args+=("-p" "$REMOTE_PORT")
    
    if key_exists; then
        ssh_args+=("-i" "$key_path")
    fi
    
    if ssh "${ssh_args[@]}" "$REMOTE_USER@$TARGET_HOST" "echo 'SSH connection successful'" 2>/dev/null; then
        print_success "SSH connection to $TARGET_HOST successful"
        
        echo ""
        echo "Remote system info:"
        ssh "${ssh_args[@]}" "$REMOTE_USER@$TARGET_HOST" "uname -a" 2>/dev/null || true
        
        return 0
    else
        print_error "SSH connection to $TARGET_HOST failed"
        
        echo ""
        echo "Troubleshooting:"
        echo "  1. Ensure the public key is copied: $(basename "$0") copy $TARGET_HOST"
        echo "  2. Check if SSH service is running on $TARGET_HOST"
        echo "  3. Verify firewall allows port $REMOTE_PORT"
        echo "  4. Check if the user '$REMOTE_USER' exists on $TARGET_HOST"
        
        return 1
    fi
}

list_keys() {
    print_status "Configured SSH Keys"
    echo ""
    
    if [[ ! -d "$SSH_DIR" ]]; then
        print_warning "No SSH directory found"
        return
    fi
    
    local found=false
    
    for key in "$SSH_DIR"/id_*; do
        if [[ -f "$key" && ! "$key" =~ \.pub$ ]]; then
            found=true
            local key_name
            key_name=$(basename "$key")
            
            if [[ -f "${key}.pub" ]]; then
                local fingerprint
                fingerprint=$(ssh-keygen -lf "${key}.pub" 2>/dev/null | awk '{print $2}')
                local comment
                comment=$(ssh-keygen -lf "${key}.pub" 2>/dev/null | awk '{$1=$2=""; print $0}' | xargs)
                
                echo "Key: $key_name"
                echo "  Path:        $key"
                echo "  Fingerprint: $fingerprint"
                echo "  Comment:     $comment"
                echo ""
            fi
        fi
    done
    
    if [[ "$found" == "false" ]]; then
        print_warning "No SSH keys found"
        echo "Run '$(basename "$0") generate' to create a new key"
    fi
}

show_status() {
    print_status "SSH Key Status"
    echo ""
    
    local key_path
    key_path=$(get_key_path)
    
    if key_exists; then
        print_success "Primary key exists: $key_path"
        show_key_info "$key_path"
    else
        print_warning "Primary key not found: $key_path"
        echo "Run '$(basename "$0") generate' to create it"
    fi
    
    echo ""
    echo "SSH Agent Status:"
    if [[ -n "${SSH_AUTH_SOCK:-}" ]]; then
        local loaded_keys
        loaded_keys=$(ssh-add -l 2>/dev/null | wc -l)
        print_success "SSH agent running, $loaded_keys key(s) loaded"
    else
        print_warning "SSH agent not running or not configured"
    fi
    
    echo ""
    echo "Known Hosts:"
    if [[ -f "$SSH_DIR/known_hosts" ]]; then
        local host_count
        host_count=$(wc -l < "$SSH_DIR/known_hosts")
        print_success "$host_count host(s) in known_hosts"
    else
        print_warning "No known_hosts file"
    fi
    
    if [[ -f "$SSH_CONFIG" ]]; then
        echo ""
        echo "Homelab SSH Configuration:"
        cat "$SSH_CONFIG"
    fi
}

save_config() {
    local key_path="$1"
    
    ensure_config_dir
    
    cat > "$SSH_CONFIG" << EOF
# SSH Configuration for Homelab
# Generated on $(date)

SSH_KEY_PATH=$key_path
SSH_KEY_TYPE=$KEY_TYPE
SSH_KEY_NAME=$KEY_NAME
SSH_KEY_COMMENT=$KEY_COMMENT
EOF
    
    print_success "Configuration saved to $SSH_CONFIG"
}

save_host_config() {
    local host="$1"
    local host_config_file="$CONFIG_DIR/hosts.conf"
    
    ensure_config_dir
    
    if [[ -f "$host_config_file" ]]; then
        if ! grep -q "^$host=" "$host_config_file" 2>/dev/null; then
            echo "$host=$REMOTE_USER:$REMOTE_PORT" >> "$host_config_file"
        fi
    else
        echo "# Homelab SSH Hosts" > "$host_config_file"
        echo "# Format: HOST=USER:PORT" >> "$host_config_file"
        echo "$host=$REMOTE_USER:$REMOTE_PORT" >> "$host_config_file"
    fi
    
    print_success "Host $host saved to configuration"
}

add_to_ssh_config() {
    local host="$1"
    local alias="${2:-$host}"
    local key_path
    key_path=$(get_key_path)
    
    local ssh_config_file="$SSH_DIR/config"
    
    if [[ -f "$ssh_config_file" ]] && grep -q "Host $alias" "$ssh_config_file"; then
        print_warning "Host alias '$alias' already exists in SSH config"
        return
    fi
    
    cat >> "$ssh_config_file" << EOF

# Homelab: $alias
Host $alias
    HostName $host
    User $REMOTE_USER
    Port $REMOTE_PORT
    IdentityFile $key_path
    IdentitiesOnly yes
EOF
    
    chmod 600 "$ssh_config_file"
    print_success "Added host alias '$alias' to SSH config"
}

main() {
    parse_args "$@"
    
    case "$COMMAND" in
        generate)
            generate_key
            ;;
        copy)
            copy_key
            ;;
        test)
            test_connection
            ;;
        list)
            list_keys
            ;;
        status)
            show_status
            ;;
        *)
            print_error "Unknown command: $COMMAND"
            show_usage
            exit 1
            ;;
    esac
}

main "$@"
