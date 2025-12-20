#!/bin/bash
# Install KVM launcher shortcuts on Linux desktop

set -euo pipefail

SCRIPT_DIR="$(cd "$(dirname "${BASH_SOURCE[0]}")" && pwd)"
DESKTOP_DIR="$SCRIPT_DIR/../desktop"
DEST_DIR="$HOME/.local/share/applications"
LAUNCH_SCRIPT="$SCRIPT_DIR/kvm-launch.sh"

echo "Installing KVM launcher shortcuts..."
echo "  Script location: $SCRIPT_DIR"

# Create destination directory
mkdir -p "$DEST_DIR"

# Make launcher executable
chmod +x "$SCRIPT_DIR/kvm-launch.sh"
chmod +x "$SCRIPT_DIR/kvm-orchestrator.sh"

# Generate desktop files with correct paths (instead of hardcoded /opt/homelab/...)
for mode in gaming desktop console; do
    local_file="$DEST_DIR/kvm-$mode.desktop"
    
    case "$mode" in
        gaming)
            name="Windows Gaming (Moonlight)"
            comment="Start Windows VM in gaming mode and connect via Moonlight"
            icon="applications-games"
            categories="Game;"
            ;;
        desktop)
            name="Windows Desktop (RDP)"
            comment="Start Windows VM in desktop mode and connect via RDP"
            icon="preferences-desktop-remote-desktop"
            categories="System;"
            ;;
        console)
            name="Windows Console (Recovery)"
            comment="Open SPICE console for recovery access"
            icon="utilities-terminal"
            categories="System;"
            ;;
    esac
    
    cat > "$local_file" << EOF
[Desktop Entry]
Name=$name
Comment=$comment
Exec=$LAUNCH_SCRIPT $mode
Icon=$icon
Terminal=false
Type=Application
Categories=$categories
EOF
    chmod +x "$local_file"
    echo "  Installed: kvm-$mode.desktop (Exec=$LAUNCH_SCRIPT $mode)"
done

# Create state directory
sudo mkdir -p /var/lib/kvm-orchestrator
sudo chown "$USER:$USER" /var/lib/kvm-orchestrator 2>/dev/null || true

# Update desktop database
if command -v update-desktop-database &>/dev/null; then
    update-desktop-database "$DEST_DIR" 2>/dev/null || true
fi

echo ""
echo "Installation complete!"
echo ""
echo "You should now see these in your application menu:"
echo "  - Windows Gaming (Moonlight)"
echo "  - Windows Desktop (RDP)"
echo "  - Windows Console (Recovery)"
echo ""
echo "Or run directly:"
echo "  $SCRIPT_DIR/kvm-launch.sh gaming"
echo "  $SCRIPT_DIR/kvm-launch.sh desktop"
echo "  $SCRIPT_DIR/kvm-launch.sh console"
