#!/bin/bash
# WireGuard Setup Script for Linode (Hub/Server)
# Run this on the Linode cloud server

set -e

echo "═══════════════════════════════════════════════════════════════"
echo "  WireGuard Setup - Linode Cloud Server (Hub)"
echo "═══════════════════════════════════════════════════════════════"

# Configuration
WG_INTERFACE="wg0"
WG_PORT="51820"
WG_NETWORK="10.200.0.0/24"
LINODE_WG_IP="10.200.0.1"
LOCAL_WG_IP="10.200.0.2"
WG_DIR="/etc/wireguard"
KEYS_DIR="$WG_DIR/keys"

# Check if running as root
if [ "$EUID" -ne 0 ]; then
    echo "ERROR: Please run as root (sudo)"
    exit 1
fi

# Install WireGuard
echo ""
echo "[1/6] Installing WireGuard..."
apt-get update
apt-get install -y wireguard wireguard-tools

# Create directories
echo ""
echo "[2/6] Creating directories..."
mkdir -p "$KEYS_DIR"
chmod 700 "$WG_DIR"
chmod 700 "$KEYS_DIR"

# Generate keys if they don't exist
echo ""
echo "[3/6] Generating keys..."
if [ ! -f "$KEYS_DIR/linode_private.key" ]; then
    wg genkey | tee "$KEYS_DIR/linode_private.key" | wg pubkey > "$KEYS_DIR/linode_public.key"
    chmod 600 "$KEYS_DIR/linode_private.key"
    echo "  Generated new keypair"
else
    echo "  Using existing keypair"
fi

LINODE_PRIVATE_KEY=$(cat "$KEYS_DIR/linode_private.key")
LINODE_PUBLIC_KEY=$(cat "$KEYS_DIR/linode_public.key")

# Generate pre-shared key for additional security
if [ ! -f "$KEYS_DIR/preshared.key" ]; then
    wg genpsk > "$KEYS_DIR/preshared.key"
    chmod 600 "$KEYS_DIR/preshared.key"
fi
PRESHARED_KEY=$(cat "$KEYS_DIR/preshared.key")

# Create WireGuard config
echo ""
echo "[4/6] Creating WireGuard configuration..."

cat > "$WG_DIR/$WG_INTERFACE.conf" << EOF
# WireGuard Configuration - Linode Hub
# Generated: $(date)

[Interface]
Address = ${LINODE_WG_IP}/24
ListenPort = ${WG_PORT}
PrivateKey = ${LINODE_PRIVATE_KEY}

# Enable IP forwarding
PostUp = sysctl -w net.ipv4.ip_forward=1
PostUp = iptables -A FORWARD -i %i -j ACCEPT
PostUp = iptables -A FORWARD -o %i -j ACCEPT
PostUp = iptables -t nat -A POSTROUTING -o eth0 -j MASQUERADE

PostDown = iptables -D FORWARD -i %i -j ACCEPT
PostDown = iptables -D FORWARD -o %i -j ACCEPT
PostDown = iptables -t nat -D POSTROUTING -o eth0 -j MASQUERADE

# Local Ubuntu Host Peer
# NOTE: Add the local host's public key after running setup-local.sh
[Peer]
# PublicKey = <LOCAL_HOST_PUBLIC_KEY>
# PresharedKey = ${PRESHARED_KEY}
AllowedIPs = ${LOCAL_WG_IP}/32
# PersistentKeepalive = 25
EOF

chmod 600 "$WG_DIR/$WG_INTERFACE.conf"

# Open firewall
echo ""
echo "[5/6] Configuring firewall..."
if command -v ufw &> /dev/null; then
    ufw allow ${WG_PORT}/udp
    ufw reload
    echo "  UFW: Opened UDP port ${WG_PORT}"
else
    # Use iptables directly
    iptables -A INPUT -p udp --dport ${WG_PORT} -j ACCEPT
    echo "  iptables: Opened UDP port ${WG_PORT}"
fi

# Enable IP forwarding
echo "net.ipv4.ip_forward=1" > /etc/sysctl.d/99-wireguard.conf
sysctl -p /etc/sysctl.d/99-wireguard.conf

# Summary
echo ""
echo "[6/6] Setup complete!"
echo ""
echo "═══════════════════════════════════════════════════════════════"
echo "  LINODE WIREGUARD SETUP COMPLETE"
echo "═══════════════════════════════════════════════════════════════"
echo ""
echo "  Linode Public IP:     69.164.211.205"
echo "  WireGuard IP:         ${LINODE_WG_IP}"
echo "  WireGuard Port:       ${WG_PORT}"
echo ""
echo "  ┌─────────────────────────────────────────────────────────┐"
echo "  │  LINODE PUBLIC KEY (copy this for local host setup):   │"
echo "  ├─────────────────────────────────────────────────────────┤"
echo "  │  ${LINODE_PUBLIC_KEY}  │"
echo "  └─────────────────────────────────────────────────────────┘"
echo ""
echo "  Pre-shared Key (for local host):"
echo "  ${PRESHARED_KEY}"
echo ""
echo "═══════════════════════════════════════════════════════════════"
echo ""
echo "NEXT STEPS:"
echo "  1. Copy the PUBLIC KEY above"
echo "  2. On your LOCAL Ubuntu host, run:"
echo "     sudo ./deploy/wireguard/setup-local.sh"
echo "  3. After local setup, add the local public key to:"
echo "     /etc/wireguard/wg0.conf"
echo "  4. Start WireGuard: sudo systemctl start wg-quick@wg0"
echo ""
