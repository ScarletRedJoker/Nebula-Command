#!/bin/bash
# Moonlight Wrapper - Automatically switches to gaming mode before launching Moonlight
# Usage: ./moonlight-wrapper.sh [moonlight-args]
# 
# Desktop Entry: Create ~/.local/share/applications/moonlight-gaming.desktop

SCRIPT_DIR="$(cd "$(dirname "${BASH_SOURCE[0]}")" && pwd)"
WINDOWS_VM_IP="${WINDOWS_VM_IP:-192.168.122.250}"

echo "Preparing Gaming Mode..."

# Switch to gaming mode
"$SCRIPT_DIR/gaming-mode.sh"

# Wait a moment for Sunshine to start
sleep 3

# Launch Moonlight
echo "Launching Moonlight..."
if command -v moonlight-qt &> /dev/null; then
    moonlight-qt "$@"
elif command -v moonlight &> /dev/null; then
    moonlight "$@"
elif [ -f /usr/bin/flatpak ]; then
    flatpak run com.moonlight_stream.Moonlight "$@"
else
    echo "Moonlight not found. Please install it:"
    echo "  sudo apt install moonlight-qt"
    echo "  # or"
    echo "  flatpak install flathub com.moonlight_stream.Moonlight"
    exit 1
fi
