#!/bin/bash
# Complete WireGuard setup helper - adds peer key to Linode config
# Run this on Linode after getting the local host's public key

set -e

if [ "$EUID" -ne 0 ]; then
    echo "ERROR: Please run as root (sudo)"
    exit 1
fi

if [ -z "$1" ]; then
    echo ""
    echo "Usage: $0 <LOCAL_HOST_PUBLIC_KEY>"
    echo ""
    echo "This script adds the local host's public key to the Linode WireGuard config"
    echo "and starts the WireGuard service."
    echo ""
    exit 1
fi

LOCAL_PUBLIC_KEY="$1"
WG_CONF="/etc/wireguard/wg0.conf"
PRESHARED_KEY=$(cat /etc/wireguard/keys/preshared.key 2>/dev/null || echo "")

echo "═══════════════════════════════════════════════════════════════"
echo "  Completing WireGuard Setup on Linode"
echo "═══════════════════════════════════════════════════════════════"

# Backup existing config
cp "$WG_CONF" "${WG_CONF}.bak"

# Update the peer section with the actual public key
echo ""
echo "[1/3] Updating WireGuard configuration with peer key..."

# Create the proper peer section
PEER_SECTION="[Peer]
PublicKey = ${LOCAL_PUBLIC_KEY}
AllowedIPs = 10.200.0.2/32
PersistentKeepalive = 25"

if [ -n "$PRESHARED_KEY" ]; then
    PEER_SECTION="[Peer]
PublicKey = ${LOCAL_PUBLIC_KEY}
PresharedKey = ${PRESHARED_KEY}
AllowedIPs = 10.200.0.2/32
PersistentKeepalive = 25"
fi

# Rewrite the config file with proper peer section
cat > "$WG_CONF" << EOF
# WireGuard Configuration - Linode Hub
# Generated: $(date)
# Peer key added: $(date)

[Interface]
Address = 10.200.0.1/24
ListenPort = 51820
PrivateKey = $(cat /etc/wireguard/keys/linode_private.key)

PostUp = sysctl -w net.ipv4.ip_forward=1
PostUp = iptables -A FORWARD -i %i -j ACCEPT
PostUp = iptables -A FORWARD -o %i -j ACCEPT
PostUp = iptables -t nat -A POSTROUTING -o eth0 -j MASQUERADE

PostDown = iptables -D FORWARD -i %i -j ACCEPT
PostDown = iptables -D FORWARD -o %i -j ACCEPT
PostDown = iptables -t nat -D POSTROUTING -o eth0 -j MASQUERADE

# Local Ubuntu Host Peer
${PEER_SECTION}
EOF

chmod 600 "$WG_CONF"

echo "  Configuration updated"

# Enable and start WireGuard
echo ""
echo "[2/3] Starting WireGuard service..."
systemctl enable wg-quick@wg0
systemctl restart wg-quick@wg0

# Check status
echo ""
echo "[3/3] Checking WireGuard status..."
sleep 2
wg show

echo ""
echo "═══════════════════════════════════════════════════════════════"
echo "  WIREGUARD SETUP COMPLETE!"
echo "═══════════════════════════════════════════════════════════════"
echo ""
echo "  Test connectivity from Linode:"
echo "    ping -c 3 10.200.0.2"
echo ""
echo "  If ping works, update .env to use WireGuard IP:"
echo "    LOCAL_WIREGUARD_IP=10.200.0.2"
echo ""
echo "  Then update Caddyfile and restart Caddy."
echo ""
