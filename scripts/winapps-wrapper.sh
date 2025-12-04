#!/bin/bash
# WinApps Wrapper - Automatically switches to productivity mode before launching WinApps
# Usage: ./winapps-wrapper.sh <app-name> [args]
#
# This ensures Sunshine is stopped and RDP is ready before launching Windows apps

SCRIPT_DIR="$(cd "$(dirname "${BASH_SOURCE[0]}")" && pwd)"
APP_NAME="${1:-explorer}"
shift

echo "Preparing Productivity Mode..."

# Switch to productivity mode (stops Sunshine, enables RDP adapter)
"$SCRIPT_DIR/productivity-mode.sh"

# Small delay to ensure mode switch is complete
sleep 1

# Launch the WinApps application
echo "Launching WinApps: $APP_NAME"
if command -v winapps &> /dev/null; then
    winapps "$APP_NAME" "$@"
elif [ -f ~/.local/bin/winapps ]; then
    ~/.local/bin/winapps "$APP_NAME" "$@"
else
    echo "WinApps not found. Falling back to direct RDP..."
    # Direct RDP fallback
    WINDOWS_VM_IP="${WINDOWS_VM_IP:-192.168.122.250}"
    if command -v xfreerdp &> /dev/null; then
        xfreerdp /v:$WINDOWS_VM_IP /u:Evin /dynamic-resolution +clipboard
    elif command -v remmina &> /dev/null; then
        remmina -c rdp://$WINDOWS_VM_IP
    else
        echo "No RDP client found. Install xfreerdp or remmina."
        exit 1
    fi
fi
