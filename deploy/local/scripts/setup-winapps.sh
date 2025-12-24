#!/bin/bash
# WinApps Setup Script
# Copies config and tests RDP connection

set -e

SCRIPT_DIR="$(cd "$(dirname "${BASH_SOURCE[0]}")" && pwd)"
WINAPPS_CONF="$SCRIPT_DIR/../winapps/winapps.conf"

echo "=== WinApps Setup ==="

# Create config directory
mkdir -p ~/.config/winapps

# Copy config
if [ -f "$WINAPPS_CONF" ]; then
    cp "$WINAPPS_CONF" ~/.config/winapps/winapps.conf
    echo "Copied winapps.conf to ~/.config/winapps/"
else
    echo "ERROR: winapps.conf not found at $WINAPPS_CONF"
    exit 1
fi

# Test RDP connection
VM_IP="192.168.122.250"
echo ""
echo "Testing RDP connection to $VM_IP..."

if nc -z -w 5 "$VM_IP" 3389 2>/dev/null; then
    echo "SUCCESS: RDP port 3389 is open"
else
    echo "WARNING: RDP port 3389 is not responding"
    echo "Make sure Windows Remote Desktop is enabled"
fi

echo ""
echo "=== Setup Complete ==="
echo ""
echo "To test WinApps, run:"
echo "  winapps windows"
echo ""
echo "Or connect via RDP directly:"
echo "  xfreerdp3 /v:192.168.122.250 /u:Evin /p:\$RDP_PASSWORD /f"
