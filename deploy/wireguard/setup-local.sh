#!/bin/bash
# WireGuard Setup Script for Local Ubuntu Host (Peer/Client)
# Run this on your local Ubuntu machine

set -e

echo "═══════════════════════════════════════════════════════════════"
echo "  WireGuard Setup - Local Ubuntu Host (Peer)"
echo "═══════════════════════════════════════════════════════════════"

# Configuration
WG_INTERFACE="wg0"
LINODE_PUBLIC_IP="69.164.211.205"
LINODE_WG_PORT="51820"
LINODE_WG_IP="10.200.0.1"
LOCAL_WG_IP="10.200.0.2"
WG_DIR="/etc/wireguard"
KEYS_DIR="$WG_DIR/keys"

# Check if running as root
if [ "$EUID" -ne 0 ]; then
    echo "ERROR: Please run as root (sudo)"
    exit 1
fi

# Check for required inputs
if [ -z "$1" ]; then
    echo ""
    echo "Usage: $0 <LINODE_PUBLIC_KEY> [PRESHARED_KEY]"
    echo ""
    echo "Get these values from the Linode setup script output."
    echo ""
    exit 1
fi

LINODE_PUBLIC_KEY="$1"
PRESHARED_KEY="${2:-}"

# Install WireGuard
echo ""
echo "[1/5] Installing WireGuard..."
apt-get update
apt-get install -y wireguard wireguard-tools

# Create directories
echo ""
echo "[2/5] Creating directories..."
mkdir -p "$KEYS_DIR"
chmod 700 "$WG_DIR"
chmod 700 "$KEYS_DIR"

# Generate keys if they don't exist
echo ""
echo "[3/5] Generating keys..."
if [ ! -f "$KEYS_DIR/local_private.key" ]; then
    wg genkey | tee "$KEYS_DIR/local_private.key" | wg pubkey > "$KEYS_DIR/local_public.key"
    chmod 600 "$KEYS_DIR/local_private.key"
    echo "  Generated new keypair"
else
    echo "  Using existing keypair"
fi

LOCAL_PRIVATE_KEY=$(cat "$KEYS_DIR/local_private.key")
LOCAL_PUBLIC_KEY=$(cat "$KEYS_DIR/local_public.key")

# Create WireGuard config
echo ""
echo "[4/5] Creating WireGuard configuration..."

# Build peer section with optional preshared key
PEER_SECTION="[Peer]
PublicKey = ${LINODE_PUBLIC_KEY}
Endpoint = ${LINODE_PUBLIC_IP}:${LINODE_WG_PORT}
AllowedIPs = ${LINODE_WG_IP}/32, 10.200.0.0/24
PersistentKeepalive = 25"

if [ -n "$PRESHARED_KEY" ]; then
    PEER_SECTION="[Peer]
PublicKey = ${LINODE_PUBLIC_KEY}
PresharedKey = ${PRESHARED_KEY}
Endpoint = ${LINODE_PUBLIC_IP}:${LINODE_WG_PORT}
AllowedIPs = ${LINODE_WG_IP}/32, 10.200.0.0/24
PersistentKeepalive = 25"
fi

cat > "$WG_DIR/$WG_INTERFACE.conf" << EOF
# WireGuard Configuration - Local Ubuntu Peer
# Generated: $(date)

[Interface]
Address = ${LOCAL_WG_IP}/24
PrivateKey = ${LOCAL_PRIVATE_KEY}

# Optional: Enable if you want to route traffic through Linode
# PostUp = ip route add 10.200.0.0/24 dev %i
# PostDown = ip route del 10.200.0.0/24 dev %i

${PEER_SECTION}
EOF

chmod 600 "$WG_DIR/$WG_INTERFACE.conf"

# Summary
echo ""
echo "[5/5] Setup complete!"
echo ""
echo "═══════════════════════════════════════════════════════════════"
echo "  LOCAL HOST WIREGUARD SETUP COMPLETE"
echo "═══════════════════════════════════════════════════════════════"
echo ""
echo "  WireGuard IP:         ${LOCAL_WG_IP}"
echo "  Linode Endpoint:      ${LINODE_PUBLIC_IP}:${LINODE_WG_PORT}"
echo ""
echo "  ┌─────────────────────────────────────────────────────────┐"
echo "  │  LOCAL PUBLIC KEY (add this to Linode wg0.conf):       │"
echo "  ├─────────────────────────────────────────────────────────┤"
echo "  │  ${LOCAL_PUBLIC_KEY}  │"
echo "  └─────────────────────────────────────────────────────────┘"
echo ""
echo "═══════════════════════════════════════════════════════════════"
echo ""
echo "NEXT STEPS:"
echo ""
echo "  1. On LINODE, add this public key to /etc/wireguard/wg0.conf:"
echo "     Edit the [Peer] section and add:"
echo "     PublicKey = ${LOCAL_PUBLIC_KEY}"
echo ""
echo "  2. On LINODE, start WireGuard:"
echo "     sudo systemctl enable wg-quick@wg0"
echo "     sudo systemctl start wg-quick@wg0"
echo ""
echo "  3. On LOCAL (this machine), start WireGuard:"
echo "     sudo systemctl enable wg-quick@wg0"
echo "     sudo systemctl start wg-quick@wg0"
echo ""
echo "  4. Test connectivity:"
echo "     ping 10.200.0.1  (from local)"
echo "     ping 10.200.0.2  (from Linode)"
echo ""
echo "  5. Update Linode Caddyfile to use WireGuard IP:"
echo "     Change LOCAL_TAILSCALE_IP to LOCAL_WIREGUARD_IP=10.200.0.2"
echo ""
