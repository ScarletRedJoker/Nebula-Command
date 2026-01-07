#!/bin/bash
set -e

SCRIPT_DIR="$(cd "$(dirname "${BASH_SOURCE[0]}")" && pwd)"
REPO_ROOT="$(dirname "$SCRIPT_DIR")"
KEY_DIR="$HOME/.ssh"
KEY_NAME="nebula-command"
KEY_PATH="$KEY_DIR/$KEY_NAME"

RED='\033[0;31m'
GREEN='\033[0;32m'
YELLOW='\033[1;33m'
CYAN='\033[0;36m'
NC='\033[0m'

echo -e "${CYAN}━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━${NC}"
echo -e "${CYAN}        Nebula Command SSH Key Exchange           ${NC}"
echo -e "${CYAN}━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━${NC}"
echo ""

print_help() {
    echo "Usage: $0 <command> [options]"
    echo ""
    echo "Commands:"
    echo "  generate          Generate SSH key pair for this server"
    echo "  show-public       Display public key (for manual exchange)"
    echo "  add-remote        Add a remote server's public key"
    echo "  test <host>       Test SSH connection to a remote host"
    echo "  exchange <host>   Full key exchange with remote server"
    echo ""
    echo "Options:"
    echo "  --key-name NAME   Use custom key name (default: nebula-command)"
    echo ""
    echo "Examples:"
    echo "  $0 generate"
    echo "  $0 show-public"
    echo "  $0 add-remote"
    echo "  $0 test linode.example.com"
    echo "  $0 exchange user@remote-server"
}

generate_key() {
    echo -e "${CYAN}[1/3] Checking SSH directory...${NC}"
    mkdir -p "$KEY_DIR"
    chmod 700 "$KEY_DIR"
    
    if [ -f "$KEY_PATH" ]; then
        echo -e "${YELLOW}[WARN]${NC} Key already exists at $KEY_PATH"
        echo -n "  Overwrite? (y/N): "
        read -r confirm
        if [ "$confirm" != "y" ] && [ "$confirm" != "Y" ]; then
            echo "  Keeping existing key."
            return 0
        fi
    fi
    
    echo -e "${CYAN}[2/3] Generating ed25519 key pair...${NC}"
    ssh-keygen -t ed25519 -f "$KEY_PATH" -N "" -C "nebula-command@$(hostname)" -q
    chmod 600 "$KEY_PATH"
    chmod 644 "$KEY_PATH.pub"
    
    echo -e "${CYAN}[3/3] Key generated successfully${NC}"
    echo ""
    echo -e "${GREEN}Private key:${NC} $KEY_PATH"
    echo -e "${GREEN}Public key:${NC}  $KEY_PATH.pub"
    echo ""
    echo -e "${YELLOW}PUBLIC KEY (copy this to remote servers):${NC}"
    echo "━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━"
    cat "$KEY_PATH.pub"
    echo "━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━"
}

show_public() {
    if [ ! -f "$KEY_PATH.pub" ]; then
        echo -e "${RED}[ERROR]${NC} No public key found at $KEY_PATH.pub"
        echo "  Run '$0 generate' first."
        exit 1
    fi
    
    echo -e "${CYAN}Public key for $(hostname):${NC}"
    echo ""
    cat "$KEY_PATH.pub"
    echo ""
}

add_remote() {
    echo -e "${CYAN}Paste the remote server's public key (then press Enter twice):${NC}"
    echo ""
    
    public_key=""
    while IFS= read -r line; do
        [ -z "$line" ] && break
        public_key="$line"
    done
    
    if [ -z "$public_key" ]; then
        echo -e "${RED}[ERROR]${NC} No key provided."
        exit 1
    fi
    
    if ! echo "$public_key" | grep -qE "^ssh-(ed25519|rsa|ecdsa)"; then
        echo -e "${RED}[ERROR]${NC} Invalid SSH public key format."
        exit 1
    fi
    
    auth_keys="$KEY_DIR/authorized_keys"
    
    if [ -f "$auth_keys" ] && grep -qF "$public_key" "$auth_keys"; then
        echo -e "${YELLOW}[SKIP]${NC} Key already in authorized_keys"
        return 0
    fi
    
    echo "$public_key" >> "$auth_keys"
    chmod 600 "$auth_keys"
    
    key_comment=$(echo "$public_key" | awk '{print $3}')
    echo -e "${GREEN}[OK]${NC} Added key: $key_comment"
}

test_connection() {
    local host="$1"
    
    if [ -z "$host" ]; then
        echo -e "${RED}[ERROR]${NC} Usage: $0 test <host>"
        exit 1
    fi
    
    echo -e "${CYAN}Testing SSH connection to $host...${NC}"
    echo "  (timeout: 5 seconds)"
    
    local ssh_opts="-o ConnectTimeout=5 -o StrictHostKeyChecking=accept-new -o BatchMode=yes"
    
    if [ ! -f "$KEY_PATH" ]; then
        echo -e "${YELLOW}[WARN]${NC} Using default SSH key (no $KEY_PATH found)"
        if timeout 10 ssh $ssh_opts "$host" "echo 'Connection successful'" 2>/dev/null; then
            echo -e "${GREEN}[OK]${NC} SSH connection works!"
        else
            echo -e "${RED}[FAIL]${NC} Could not connect to $host"
            echo ""
            echo "Troubleshooting:"
            echo "  1. Check if SSH port 22 is open: nc -zv $host 22"
            echo "  2. For local server via public IP, ensure router forwards port 22"
            echo "  3. Use Tailscale IP instead for internal connections"
            exit 1
        fi
    else
        if timeout 10 ssh -i "$KEY_PATH" $ssh_opts "$host" "echo 'Connection successful'" 2>/dev/null; then
            echo -e "${GREEN}[OK]${NC} SSH connection works with nebula-command key!"
        else
            echo -e "${RED}[FAIL]${NC} Could not connect to $host with nebula-command key"
            echo ""
            echo "Troubleshooting:"
            echo "  1. Check if SSH port 22 is open: nc -zv $host 22"
            echo "  2. Verify the public key is in ~/.ssh/authorized_keys on $host"
            echo "  3. Use Tailscale IP instead for internal connections"
            exit 1
        fi
    fi
}

full_exchange() {
    local remote="$1"
    
    if [ -z "$remote" ]; then
        echo -e "${RED}[ERROR]${NC} Usage: $0 exchange user@remote-server"
        echo ""
        echo "For cross-server exchange, use Tailscale IPs:"
        echo "  From Linode:  $0 exchange evin@100.x.x.x  (local Tailscale IP)"
        echo "  From Local:   $0 exchange root@100.x.x.x (Linode Tailscale IP)"
        echo ""
        echo "Get Tailscale IPs with: tailscale ip -4"
        exit 1
    fi
    
    local ssh_opts="-o ConnectTimeout=10 -o StrictHostKeyChecking=accept-new"
    
    echo -e "${CYAN}[1/4] Ensuring local key exists...${NC}"
    if [ ! -f "$KEY_PATH" ]; then
        generate_key
    else
        echo "  Key exists at $KEY_PATH"
    fi
    
    echo ""
    echo -e "${CYAN}[2/4] Testing connection to remote server...${NC}"
    if ! timeout 15 ssh $ssh_opts "$remote" "echo 'Connected'" 2>/dev/null; then
        echo -e "${RED}[FAIL]${NC} Cannot connect to $remote"
        echo ""
        echo "Troubleshooting:"
        echo "  1. Use Tailscale IP instead of public IP for cross-server SSH"
        echo "  2. Get Tailscale IP: tailscale ip -4"
        echo "  3. Check firewall: sudo ufw status"
        exit 1
    fi
    echo -e "${GREEN}[OK]${NC} Connection successful"
    
    echo ""
    echo -e "${CYAN}[3/4] Copying public key to remote server...${NC}"
    if timeout 30 ssh-copy-id -i "$KEY_PATH.pub" $ssh_opts "$remote" 2>/dev/null; then
        echo -e "${GREEN}[OK]${NC} Public key copied to $remote"
    else
        echo -e "${YELLOW}[INFO]${NC} ssh-copy-id failed, trying manual method..."
        cat "$KEY_PATH.pub" | timeout 30 ssh $ssh_opts "$remote" "mkdir -p ~/.ssh && chmod 700 ~/.ssh && cat >> ~/.ssh/authorized_keys && chmod 600 ~/.ssh/authorized_keys" && {
            echo -e "${GREEN}[OK]${NC} Public key copied to $remote"
        } || {
            echo -e "${RED}[FAIL]${NC} Could not copy key to $remote"
            exit 1
        }
    fi
    
    echo ""
    echo -e "${CYAN}[4/4] Getting remote server's public key...${NC}"
    remote_key=$(timeout 15 ssh -i "$KEY_PATH" $ssh_opts "$remote" "cat ~/.ssh/$KEY_NAME.pub 2>/dev/null || cat ~/.ssh/id_ed25519.pub 2>/dev/null || cat ~/.ssh/id_rsa.pub 2>/dev/null" 2>/dev/null) || {
        echo -e "${YELLOW}[INFO]${NC} No key found on remote. Generating one..."
        timeout 30 ssh -i "$KEY_PATH" $ssh_opts "$remote" "ssh-keygen -t ed25519 -f ~/.ssh/$KEY_NAME -N '' -q" || true
        remote_key=$(timeout 15 ssh -i "$KEY_PATH" $ssh_opts "$remote" "cat ~/.ssh/$KEY_NAME.pub" 2>/dev/null)
    }
    
    if [ -n "$remote_key" ]; then
        auth_keys="$KEY_DIR/authorized_keys"
        if grep -qF "$remote_key" "$auth_keys" 2>/dev/null; then
            echo -e "${YELLOW}[SKIP]${NC} Remote key already in authorized_keys"
        else
            echo "$remote_key" >> "$auth_keys"
            chmod 600 "$auth_keys"
            echo -e "${GREEN}[OK]${NC} Remote key added"
        fi
    else
        echo -e "${YELLOW}[WARN]${NC} Could not get remote key, one-way exchange only"
    fi
    
    echo ""
    echo -e "${GREEN}━━━ Key Exchange Complete ━━━${NC}"
    echo "  Local → Remote: ✓ (can SSH to $remote)"
    if [ -n "$remote_key" ]; then
        echo "  Remote → Local: ✓ (can SSH from $remote)"
    else
        echo "  Remote → Local: ⚠ (run this script on remote to complete)"
    fi
    echo ""
    echo "Test with:"
    echo "  ssh -i $KEY_PATH $remote"
}

update_ssh_config() {
    local config_file="$KEY_DIR/config"
    
    echo -e "${CYAN}Updating SSH config for Nebula Command...${NC}"
    
    if grep -q "# Nebula Command" "$config_file" 2>/dev/null; then
        echo -e "${YELLOW}[SKIP]${NC} Nebula Command config already exists"
        return 0
    fi
    
    cat >> "$config_file" << 'EOF'

# Nebula Command - Cross-server SSH
Host nebula-linode
    HostName 69.164.211.205
    User root
    IdentityFile ~/.ssh/nebula-command
    StrictHostKeyChecking accept-new

Host nebula-local
    HostName 74.76.34.7
    User evin
    IdentityFile ~/.ssh/nebula-command
    StrictHostKeyChecking accept-new
EOF

    chmod 600 "$config_file"
    echo -e "${GREEN}[OK]${NC} SSH config updated"
    echo ""
    echo "You can now connect with:"
    echo "  ssh nebula-linode"
    echo "  ssh nebula-local"
}

case "${1:-}" in
    generate)
        generate_key
        ;;
    show-public)
        show_public
        ;;
    add-remote)
        add_remote
        ;;
    test)
        test_connection "$2"
        ;;
    exchange)
        full_exchange "$2"
        ;;
    config)
        update_ssh_config
        ;;
    help|--help|-h)
        print_help
        ;;
    *)
        print_help
        exit 1
        ;;
esac
