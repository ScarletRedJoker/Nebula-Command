#!/bin/bash
set -e

echo "=================================================================="
echo " 🏠 Reset & Reconfigure Home Assistant Integration"
echo "=================================================================="
echo ""

echo "Step 1: Checking current Home Assistant configuration..."
HA_URL=$(grep "^HOME_ASSISTANT_URL=" .env | cut -d'=' -f2 || echo "")
HA_TOKEN=$(grep "^HOME_ASSISTANT_TOKEN=" .env | cut -d'=' -f2 || echo "")

if [ -z "$HA_URL" ]; then
    echo "⚠️  HOME_ASSISTANT_URL not set"
else
    echo "   Current URL: $HA_URL"
fi

if [ -z "$HA_TOKEN" ]; then
    echo "⚠️  HOME_ASSISTANT_TOKEN not set"
else
    echo "   Current Token: ${HA_TOKEN:0:20}..."
fi

echo ""
echo "Step 2: Updating Home Assistant URL to external domain..."

# Update .env file
if grep -q "^HOME_ASSISTANT_URL=" .env; then
    sed -i 's|^HOME_ASSISTANT_URL=.*|HOME_ASSISTANT_URL=https://home.evindrake.net|g' .env
else
    echo "HOME_ASSISTANT_URL=https://home.evindrake.net" >> .env
fi

echo "✅ Updated HOME_ASSISTANT_URL to https://home.evindrake.net"

echo ""
echo "Step 3: Generating new long-lived access token..."
echo ""
echo "⚠️  ACTION REQUIRED:"
echo "   1. Open: https://home.evindrake.net/profile/security"
echo "   2. Scroll to 'Long-Lived Access Tokens'"
echo "   3. Click 'CREATE TOKEN'"
echo "   4. Name: 'Jarvis Dashboard Integration'"
echo "   5. Copy the generated token"
echo ""
read -p "   Paste the new token here: " NEW_TOKEN

if [ -z "$NEW_TOKEN" ]; then
    echo "❌ ERROR: No token provided"
    exit 1
fi

# Update token in .env
if grep -q "^HOME_ASSISTANT_TOKEN=" .env; then
    sed -i "s|^HOME_ASSISTANT_TOKEN=.*|HOME_ASSISTANT_TOKEN=$NEW_TOKEN|g" .env
else
    echo "HOME_ASSISTANT_TOKEN=$NEW_TOKEN" >> .env
fi

echo "✅ Token updated"

echo ""
echo "Step 4: Verifying Home Assistant trusted_proxies configuration..."
HA_CONFIG="config/homeassistant/configuration.yaml"

if [ -f "$HA_CONFIG" ]; then
    if grep -q "172.18.0.0/16" "$HA_CONFIG"; then
        echo "✅ Trusted proxies already configured"
    else
        echo "⚠️  WARNING: Adding Caddy subnet to trusted_proxies..."
        echo "   Please manually add '- 172.18.0.0/16' to trusted_proxies in $HA_CONFIG"
    fi
else
    echo "⚠️  WARNING: Home Assistant configuration file not found"
    echo "   Expected: $HA_CONFIG"
fi

echo ""
echo "Step 5: Restarting services..."
docker-compose -f docker-compose.unified.yml restart homeassistant homelab-dashboard

echo ""
echo "Step 6: Waiting for services to start (30 seconds)..."
sleep 30

echo ""
echo "Step 7: Testing Home Assistant connection..."
curl -s -o /dev/null -w "%{http_code}" https://home.evindrake.net/ || {
    echo "⚠️  WARNING: Home Assistant may not be responding yet"
    echo "   Wait a few more minutes and check https://home.evindrake.net"
}

echo ""
echo "=================================================================="
echo " ✅ HOME ASSISTANT RESET COMPLETE!"
echo "=================================================================="
echo ""
echo "Configuration:"
echo "  URL: https://home.evindrake.net"
echo "  Token: Configured in .env (kept secure)"
echo ""
echo "Next steps:"
echo "  1. Verify: https://home.evindrake.net (should load HA interface)"
echo "  2. Check dashboard: https://host.evindrake.net"
echo "  3. Test Smart Home integration in dashboard"
echo ""
