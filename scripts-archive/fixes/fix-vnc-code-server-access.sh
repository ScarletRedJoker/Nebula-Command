#!/bin/bash
set -e

echo "=================================================================="
echo " 🔓 Fix VNC & Code-Server Access"
echo "=================================================================="
echo ""

echo "Step 1: Checking Caddyfile VPN restrictions..."

# Check VNC section (around line 122-157)
VNC_VPN_ACTIVE=false
if sed -n '/^vnc.evindrake.net/,/^}/p' Caddyfile | grep -q "^    @vpn_only {"; then
    VNC_VPN_ACTIVE=true
    echo "⚠️  VNC has ACTIVE VPN restrictions"
fi

# Check Code-Server section (around line 157-180)
CODE_VPN_ACTIVE=false
if sed -n '/^code.evindrake.net/,/^}/p' Caddyfile | grep -q "^    @vpn_only {"; then
    CODE_VPN_ACTIVE=true
    echo "⚠️  Code-Server has ACTIVE VPN restrictions"
fi

if [ "$VNC_VPN_ACTIVE" = true ] || [ "$CODE_VPN_ACTIVE" = true ]; then
    echo ""
    echo "❌ ERROR: VPN restrictions are still ACTIVE in Caddyfile!"
    echo ""
    echo "ACTION REQUIRED:"
    echo "  1. Edit Caddyfile manually: nano Caddyfile"
    echo "  2. Find the vnc.evindrake.net and code.evindrake.net sections"
    echo "  3. Comment out (add # before) these lines:"
    echo "     - @vpn_only {"
    echo "     - remote_ip ..."
    echo "     - }"
    echo "     - handle @vpn_only {"
    echo "     - reverse_proxy ..."
    echo "     - }"
    echo "     - handle {"
    echo "     - respond \"VPN Access Required\" 403"
    echo "     - }"
    echo "  4. UNCOMMENT the direct reverse_proxy line"
    echo "  5. Save and exit"
    echo "  6. Run this script again"
    echo ""
    exit 1
fi

echo "✅ VPN restrictions are already commented out"

echo ""
echo "Step 2: Reloading Caddy configuration..."
docker exec caddy caddy reload --config /etc/caddy/Caddyfile || {
    echo "⚠️  Reload failed, trying full restart..."
    docker-compose -f docker-compose.unified.yml restart caddy
}

echo "✅ Caddy reloaded"

echo ""
echo "Step 3: Verifying VNC & Code-Server passwords..."

VNC_PASS=$(grep "^VNC_PASSWORD=" .env | cut -d'=' -f2 || echo "")
CODE_PASS=$(grep "^CODE_SERVER_PASSWORD=" .env | cut -d'=' -f2 || echo "")

if [ -z "$VNC_PASS" ]; then
    echo "❌ ERROR: VNC_PASSWORD not set in .env"
    echo "   Add this line to .env: VNC_PASSWORD=YourSecurePassword123"
    exit 1
fi

if [ -z "$CODE_PASS" ]; then
    echo "❌ ERROR: CODE_SERVER_PASSWORD not set in .env"
    echo "   Add this line to .env: CODE_SERVER_PASSWORD=YourCodeServerPassword456"
    exit 1
fi

echo "✅ Passwords configured"

echo ""
echo "Step 4: Restarting VNC & Code-Server containers..."
docker-compose -f docker-compose.unified.yml restart vnc-desktop code-server

echo ""
echo "Step 5: Waiting for containers to start (10 seconds)..."
sleep 10

echo ""
echo "=================================================================="
echo " ✅ FIX COMPLETE!"
echo "=================================================================="
echo ""
echo "You can now access:"
echo "  🖥️  VNC Desktop: https://vnc.evindrake.net"
echo "      Password: $VNC_PASS"
echo ""
echo "  💻 Code-Server: https://code.evindrake.net"
echo "      Password: [configured in .env]"
echo ""
echo "Both services are accessible with password authentication."
echo "No VPN required!"
