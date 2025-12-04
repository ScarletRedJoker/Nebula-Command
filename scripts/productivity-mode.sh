#!/bin/bash
# Productivity Mode - Stop Sunshine and prepare for WinApps/RDP
# This kills Sunshine so RDP can work properly

WINDOWS_VM_IP="${WINDOWS_VM_IP:-192.168.122.250}"
WINDOWS_USER="${WINDOWS_USER:-Evin}"

echo "=== Switching to Productivity Mode ==="
echo "Windows VM: $WINDOWS_VM_IP"

# Try to stop Sunshine via SSH
if ssh -o ConnectTimeout=5 -o StrictHostKeyChecking=no "$WINDOWS_USER@$WINDOWS_VM_IP" "tasklist" 2>/dev/null | grep -q "sunshine"; then
    echo "Stopping Sunshine..."
    ssh "$WINDOWS_USER@$WINDOWS_VM_IP" "taskkill /IM sunshine.exe /F" 2>/dev/null
    echo "Sunshine stopped."
else
    echo "Sunshine not running or SSH not available."
fi

# Re-enable Microsoft Basic Display Adapter for RDP
echo "Re-enabling display adapter for RDP..."
ssh "$WINDOWS_USER@$WINDOWS_VM_IP" "powershell -Command \"Get-PnpDevice | Where-Object { \$_.FriendlyName -eq 'Microsoft Basic Display Adapter' -and \$_.Status -eq 'Error' } | Enable-PnpDevice -Confirm:\$false\"" 2>/dev/null

echo ""
echo "=== Ready for WinApps/RDP ==="
echo "Connect via RDP to: $WINDOWS_VM_IP"
echo ""
echo "For WinApps, your apps should now work normally."
