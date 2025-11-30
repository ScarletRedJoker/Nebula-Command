#!/bin/bash
set -euo pipefail

echo "================================================"
echo "  Tailscale VPN Mesh Setup"
echo "================================================"
echo ""

SCRIPT_DIR="$(cd "$(dirname "${BASH_SOURCE[0]}")" && pwd)"
CONFIG_DIR="${CONFIG_DIR:-$HOME/.config/homelab}"
TAILSCALE_CONFIG="$CONFIG_DIR/tailscale.conf"

AUTHKEY="${TAILSCALE_AUTHKEY:-}"
EXIT_NODE="${TAILSCALE_EXIT_NODE:-false}"
ADVERTISE_EXIT_NODE="${TAILSCALE_ADVERTISE_EXIT_NODE:-false}"
ACCEPT_DNS="${TAILSCALE_ACCEPT_DNS:-true}"
ACCEPT_ROUTES="${TAILSCALE_ACCEPT_ROUTES:-true}"
HOSTNAME="${TAILSCALE_HOSTNAME:-}"
TIMEOUT="${TAILSCALE_TIMEOUT:-60}"

print_status() { echo -e "\n\033[1;34m==>\033[0m \033[1m$1\033[0m"; }
print_success() { echo -e "\033[1;32m✓\033[0m $1"; }
print_warning() { echo -e "\033[1;33m⚠\033[0m $1"; }
print_error() { echo -e "\033[1;31m✗\033[0m $1"; }

show_usage() {
    cat << EOF
Usage: $(basename "$0") [OPTIONS]

Options:
    --authkey KEY         Tailscale auth key for automatic authentication
    --hostname NAME       Set the Tailscale hostname for this machine
    --exit-node           Use an exit node (requires exit node IP via --exit-node-ip)
    --exit-node-ip IP     IP of the exit node to use
    --advertise-exit      Advertise this machine as an exit node
    --accept-dns          Accept DNS settings from Tailscale (default: true)
    --no-accept-dns       Don't accept DNS settings from Tailscale
    --accept-routes       Accept routes from other Tailscale nodes (default: true)
    --no-accept-routes    Don't accept routes from other nodes
    --timeout SECONDS     Timeout for waiting for connection (default: 60)
    --status              Show current Tailscale status and exit
    --help                Show this help message

Environment Variables:
    TAILSCALE_AUTHKEY             Auth key for automatic authentication
    TAILSCALE_HOSTNAME            Hostname to use
    TAILSCALE_EXIT_NODE           Set to "true" to use exit node
    TAILSCALE_ADVERTISE_EXIT_NODE Set to "true" to advertise as exit node
    TAILSCALE_ACCEPT_DNS          Accept DNS settings (default: true)
    TAILSCALE_ACCEPT_ROUTES       Accept routes (default: true)
    TAILSCALE_TIMEOUT             Connection timeout in seconds

Examples:
    # Interactive authentication
    $(basename "$0")

    # Automatic authentication with authkey
    $(basename "$0") --authkey tskey-auth-xxxxx

    # Set up as exit node
    $(basename "$0") --authkey tskey-auth-xxxxx --advertise-exit

    # Connect using an exit node
    $(basename "$0") --exit-node-ip 100.x.x.x
EOF
}

parse_args() {
    while [[ $# -gt 0 ]]; do
        case $1 in
            --authkey)
                AUTHKEY="$2"
                shift 2
                ;;
            --hostname)
                HOSTNAME="$2"
                shift 2
                ;;
            --exit-node)
                EXIT_NODE="true"
                shift
                ;;
            --exit-node-ip)
                EXIT_NODE_IP="$2"
                EXIT_NODE="true"
                shift 2
                ;;
            --advertise-exit)
                ADVERTISE_EXIT_NODE="true"
                shift
                ;;
            --accept-dns)
                ACCEPT_DNS="true"
                shift
                ;;
            --no-accept-dns)
                ACCEPT_DNS="false"
                shift
                ;;
            --accept-routes)
                ACCEPT_ROUTES="true"
                shift
                ;;
            --no-accept-routes)
                ACCEPT_ROUTES="false"
                shift
                ;;
            --timeout)
                TIMEOUT="$2"
                shift 2
                ;;
            --status)
                show_status
                exit 0
                ;;
            --help)
                show_usage
                exit 0
                ;;
            *)
                print_error "Unknown option: $1"
                show_usage
                exit 1
                ;;
        esac
    done
}

check_root() {
    if [[ $EUID -ne 0 ]]; then
        print_warning "Some operations may require root privileges"
        SUDO="sudo"
    else
        SUDO=""
    fi
}

is_tailscale_installed() {
    command -v tailscale &> /dev/null
}

get_tailscale_version() {
    tailscale version 2>/dev/null | head -n1 || echo "unknown"
}

is_tailscale_running() {
    $SUDO tailscale status &> /dev/null
    return $?
}

is_tailscale_connected() {
    local status
    status=$($SUDO tailscale status --json 2>/dev/null | grep -o '"BackendState":"[^"]*"' | cut -d'"' -f4)
    [[ "$status" == "Running" ]]
}

install_tailscale() {
    print_status "Checking Tailscale installation..."
    
    if is_tailscale_installed; then
        local version
        version=$(get_tailscale_version)
        print_success "Tailscale already installed (version: $version)"
        
        if ! systemctl is-active --quiet tailscaled 2>/dev/null; then
            print_status "Starting tailscaled service..."
            $SUDO systemctl enable tailscaled 2>/dev/null || true
            $SUDO systemctl start tailscaled 2>/dev/null || true
        fi
        return 0
    fi
    
    print_status "Installing Tailscale..."
    
    if [[ -f /etc/os-release ]]; then
        . /etc/os-release
        case "$ID" in
            ubuntu|debian)
                print_status "Detected Debian/Ubuntu..."
                ;;
            fedora|centos|rhel)
                print_status "Detected Fedora/CentOS/RHEL..."
                ;;
            arch)
                print_status "Detected Arch Linux..."
                ;;
        esac
    fi
    
    curl -fsSL https://tailscale.com/install.sh | $SUDO sh
    
    if is_tailscale_installed; then
        print_success "Tailscale installed successfully"
        $SUDO systemctl enable tailscaled 2>/dev/null || true
        $SUDO systemctl start tailscaled 2>/dev/null || true
    else
        print_error "Tailscale installation failed"
        exit 1
    fi
}

build_tailscale_args() {
    local args=()
    
    if [[ "$ACCEPT_ROUTES" == "true" ]]; then
        args+=("--accept-routes")
    fi
    
    if [[ "$ACCEPT_DNS" == "true" ]]; then
        args+=("--accept-dns")
    else
        args+=("--accept-dns=false")
    fi
    
    if [[ -n "$HOSTNAME" ]]; then
        args+=("--hostname=$HOSTNAME")
    fi
    
    if [[ "$ADVERTISE_EXIT_NODE" == "true" ]]; then
        args+=("--advertise-exit-node")
    fi
    
    if [[ "$EXIT_NODE" == "true" && -n "${EXIT_NODE_IP:-}" ]]; then
        args+=("--exit-node=$EXIT_NODE_IP")
    fi
    
    if [[ -n "$AUTHKEY" ]]; then
        args+=("--authkey=$AUTHKEY")
    fi
    
    echo "${args[@]}"
}

authenticate() {
    print_status "Authenticating with Tailscale..."
    
    if is_tailscale_connected; then
        local current_ip
        current_ip=$($SUDO tailscale ip -4 2>/dev/null || echo "unknown")
        print_success "Already authenticated and connected: $current_ip"
        return 0
    fi
    
    local args
    args=$(build_tailscale_args)
    
    if [[ -n "$AUTHKEY" ]]; then
        print_status "Using authkey for automatic authentication..."
        $SUDO tailscale up $args
    else
        print_warning "Opening browser for authentication..."
        print_warning "If running headless, use --authkey option"
        $SUDO tailscale up $args
    fi
}

wait_for_connection() {
    print_status "Waiting for Tailscale connection (timeout: ${TIMEOUT}s)..."
    
    local elapsed=0
    local interval=2
    
    while [[ $elapsed -lt $TIMEOUT ]]; do
        if is_tailscale_connected; then
            local ip
            ip=$($SUDO tailscale ip -4 2>/dev/null || echo "unknown")
            print_success "Connected! Tailscale IP: $ip"
            return 0
        fi
        
        sleep $interval
        elapsed=$((elapsed + interval))
        echo -n "."
    done
    
    echo ""
    print_error "Timeout waiting for Tailscale connection"
    return 1
}

setup_dns() {
    print_status "Configuring DNS..."
    
    if [[ "$ACCEPT_DNS" == "true" ]]; then
        print_success "DNS configuration will be managed by Tailscale"
        
        local dns_status
        dns_status=$($SUDO tailscale status --json 2>/dev/null | grep -o '"DNS":{[^}]*}' || echo "")
        if [[ -n "$dns_status" ]]; then
            print_success "DNS status: Active"
        fi
    else
        print_warning "DNS management by Tailscale is disabled"
    fi
    
    if $SUDO tailscale status --json 2>/dev/null | grep -q '"MagicDNSSuffix"'; then
        local suffix
        suffix=$($SUDO tailscale status --json 2>/dev/null | grep -o '"MagicDNSSuffix":"[^"]*"' | cut -d'"' -f4)
        if [[ -n "$suffix" ]]; then
            print_success "MagicDNS suffix: $suffix"
        fi
    fi
}

save_config() {
    print_status "Saving configuration..."
    
    mkdir -p "$CONFIG_DIR"
    
    cat > "$TAILSCALE_CONFIG" << EOF
# Tailscale Configuration
# Generated on $(date)

TAILSCALE_IP=$($SUDO tailscale ip -4 2>/dev/null || echo "")
TAILSCALE_IP6=$($SUDO tailscale ip -6 2>/dev/null || echo "")
TAILSCALE_HOSTNAME=$($SUDO tailscale status --self --json 2>/dev/null | grep -o '"HostName":"[^"]*"' | cut -d'"' -f4 || echo "")
TAILSCALE_ACCEPT_DNS=$ACCEPT_DNS
TAILSCALE_ACCEPT_ROUTES=$ACCEPT_ROUTES
TAILSCALE_EXIT_NODE=$EXIT_NODE
TAILSCALE_ADVERTISE_EXIT_NODE=$ADVERTISE_EXIT_NODE
EOF
    
    print_success "Configuration saved to $TAILSCALE_CONFIG"
}

show_status() {
    print_status "Current Tailscale Status"
    echo ""
    
    if ! is_tailscale_installed; then
        print_error "Tailscale is not installed"
        return 1
    fi
    
    echo "Version: $(get_tailscale_version)"
    echo ""
    
    if is_tailscale_connected; then
        print_success "Status: Connected"
    else
        print_warning "Status: Not connected"
    fi
    
    echo ""
    $SUDO tailscale status 2>/dev/null || print_warning "Could not get peer status"
    echo ""
    
    echo "Your Tailscale IPs:"
    echo "  IPv4: $($SUDO tailscale ip -4 2>/dev/null || echo 'Not available')"
    echo "  IPv6: $($SUDO tailscale ip -6 2>/dev/null || echo 'Not available')"
    echo ""
    
    local magicdns
    magicdns=$($SUDO tailscale status --json 2>/dev/null | grep -o '"MagicDNSSuffix":"[^"]*"' | cut -d'"' -f4 || echo "")
    if [[ -n "$magicdns" ]]; then
        echo "MagicDNS Suffix: $magicdns"
    fi
}

show_acl_config() {
    echo ""
    echo "================================================"
    echo "  Recommended Tailscale ACL Configuration"
    echo "================================================"
    echo ""
    echo "Add this to your Tailscale admin console ACLs:"
    echo ""
    cat << 'ACL'
{
  "acls": [
    // Homelab hosts can access each other
    {"action": "accept", "src": ["tag:homelab"], "dst": ["tag:homelab:*"]},
    
    // Allow specific ports between homelab nodes
    {"action": "accept", "src": ["tag:homelab"], "dst": ["tag:homelab:22"]},    // SSH
    {"action": "accept", "src": ["tag:homelab"], "dst": ["tag:homelab:5432"]},  // PostgreSQL
    {"action": "accept", "src": ["tag:homelab"], "dst": ["tag:homelab:6379"]},  // Redis
    {"action": "accept", "src": ["tag:homelab"], "dst": ["tag:homelab:8123"]},  // Home Assistant
    {"action": "accept", "src": ["tag:homelab"], "dst": ["tag:homelab:32400"]}, // Plex
    {"action": "accept", "src": ["tag:homelab"], "dst": ["tag:homelab:9000"]},  // MinIO
  ],
  
  "tagOwners": {
    "tag:homelab": ["autogroup:admin"]
  },
  
  "ssh": [
    {
      "action": "accept",
      "src": ["tag:homelab"],
      "dst": ["tag:homelab"],
      "users": ["autogroup:nonroot", "root"]
    }
  ]
}
ACL
    echo ""
}

print_summary() {
    echo ""
    echo "================================================"
    echo "  Tailscale Setup Complete!"
    echo "================================================"
    echo ""
    echo "Your Tailscale IP: $($SUDO tailscale ip -4 2>/dev/null || echo 'Not available')"
    echo ""
    echo "Next steps:"
    echo "  1. Run this script on other homelab hosts"
    echo "  2. Note down the Tailscale IPs for each machine"
    echo "  3. Update .env files with Tailscale IPs"
    echo "  4. Tag all machines as 'homelab' in Tailscale admin"
    echo "  5. Apply the ACL configuration shown above"
    echo ""
    
    if [[ -f "$TAILSCALE_CONFIG" ]]; then
        echo "Configuration saved to: $TAILSCALE_CONFIG"
        echo ""
    fi
}

main() {
    parse_args "$@"
    check_root
    
    install_tailscale
    authenticate
    
    if ! wait_for_connection; then
        print_error "Failed to establish Tailscale connection"
        exit 1
    fi
    
    setup_dns
    save_config
    show_status
    show_acl_config
    print_summary
}

main "$@"
