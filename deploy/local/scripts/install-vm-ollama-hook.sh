#!/bin/bash
# Install libvirt hook for automatic Ollama registration
# When Windows VM starts/stops, automatically update AI service state

set -euo pipefail

SCRIPT_DIR="$(cd "$(dirname "${BASH_SOURCE[0]}")" && pwd)"
HOOK_DIR="/etc/libvirt/hooks"
HOOK_FILE="$HOOK_DIR/qemu"

RED='\033[0;31m'
GREEN='\033[0;32m'
YELLOW='\033[1;33m'
CYAN='\033[0;36m'
NC='\033[0m'

echo -e "${CYAN}━━━ Installing VM Ollama Hook ━━━${NC}"

if [[ $EUID -ne 0 ]]; then
    echo -e "${YELLOW}[WARN]${NC} Not running as root. Using sudo..."
    exec sudo "$0" "$@"
fi

mkdir -p "$HOOK_DIR"

BRIDGE_SCRIPT="$SCRIPT_DIR/vm-ollama-bridge.sh"
if [[ ! -f "$BRIDGE_SCRIPT" ]]; then
    echo -e "${RED}[ERROR]${NC} vm-ollama-bridge.sh not found at: $BRIDGE_SCRIPT"
    exit 1
fi

if [[ -f "$HOOK_FILE" ]]; then
    if grep -q "vm-ollama-bridge" "$HOOK_FILE"; then
        echo -e "${GREEN}[OK]${NC} Hook already installed"
        exit 0
    fi
    
    echo -e "${YELLOW}[WARN]${NC} Existing qemu hook found. Backing up..."
    cp "$HOOK_FILE" "$HOOK_FILE.backup.$(date +%Y%m%d%H%M%S)"
    
    cat >> "$HOOK_FILE" << EOF

# Ollama Bridge Hook - Auto-register AI services
if [[ "\$2" == "started" ]] || [[ "\$2" == "stopped" ]]; then
    logger -t libvirt-hook "VM \$1 \$2 - updating Ollama registration"
    sleep 5  # Wait for VM networking
    nohup "$BRIDGE_SCRIPT" register > /tmp/vm-ollama-hook.log 2>&1 &
fi
EOF
else
    cat > "$HOOK_FILE" << EOF
#!/bin/bash
# Libvirt QEMU hook for VM events
# Arguments: \$1=VM_NAME \$2=OPERATION \$3=SUB-OPERATION

VM_NAME="\$1"
OPERATION="\$2"

# Ollama Bridge Hook - Auto-register AI services
if [[ "\$OPERATION" == "started" ]] || [[ "\$OPERATION" == "stopped" ]]; then
    logger -t libvirt-hook "VM \$VM_NAME \$OPERATION - updating Ollama registration"
    sleep 5  # Wait for VM networking
    nohup "$BRIDGE_SCRIPT" register > /tmp/vm-ollama-hook.log 2>&1 &
fi
EOF
fi

chmod +x "$HOOK_FILE"

echo -e "${GREEN}[OK]${NC} Hook installed at: $HOOK_FILE"
echo ""
echo "The hook will automatically run when VMs start or stop."
echo "Check logs with: tail -f /tmp/vm-ollama-hook.log"
echo ""
echo "To test manually:"
echo "  $BRIDGE_SCRIPT register"
