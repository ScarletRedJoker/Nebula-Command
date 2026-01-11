#!/bin/bash
# Setup Ollama port forwarding from Linux host to Windows VM
# Allows Linode (via Tailscale) to access Ollama on Windows VM
#
# Traffic flow: Linode → Tailscale → Linux:11434 → Windows VM:11434

set -euo pipefail

SCRIPT_DIR="$(cd "$(dirname "${BASH_SOURCE[0]}")" && pwd)"
KVM_CONFIG="${KVM_CONFIG:-/etc/kvm-orchestrator.conf}"
OLLAMA_PORT="${OLLAMA_PORT:-11434}"

RED='\033[0;31m'
GREEN='\033[0;32m'
YELLOW='\033[1;33m'
CYAN='\033[0;36m'
NC='\033[0m'

load_vm_config() {
    VM_NAME=""
    VM_IP=""
    if [[ -f "$KVM_CONFIG" ]]; then
        source "$KVM_CONFIG"
    fi
    if [[ -z "$VM_IP" ]] && [[ -f ~/.kvm-orchestrator.conf ]]; then
        source ~/.kvm-orchestrator.conf
    fi
}

setup_forwarding() {
    load_vm_config
    
    echo -e "${CYAN}━━━ Ollama Port Forwarding Setup ━━━${NC}"
    
    if [[ -z "$VM_IP" ]]; then
        echo -e "${RED}[ERROR]${NC} No VM IP configured. Run: kvm-orchestrator.sh discover"
        exit 1
    fi
    
    echo "Windows VM IP: $VM_IP"
    echo "Ollama Port:   $OLLAMA_PORT"
    echo ""
    
    sudo sysctl -w net.ipv4.ip_forward=1 >/dev/null 2>&1
    echo -e "${GREEN}[OK]${NC} IP forwarding enabled"
    
    sudo iptables -t nat -C PREROUTING -p tcp --dport "$OLLAMA_PORT" -j DNAT --to-destination "${VM_IP}:${OLLAMA_PORT}" 2>/dev/null || \
        sudo iptables -t nat -A PREROUTING -p tcp --dport "$OLLAMA_PORT" -j DNAT --to-destination "${VM_IP}:${OLLAMA_PORT}"
    echo -e "${GREEN}[OK]${NC} PREROUTING rule added"
    
    sudo iptables -t nat -C POSTROUTING -d "$VM_IP" -p tcp --dport "$OLLAMA_PORT" -j MASQUERADE 2>/dev/null || \
        sudo iptables -t nat -A POSTROUTING -d "$VM_IP" -p tcp --dport "$OLLAMA_PORT" -j MASQUERADE
    echo -e "${GREEN}[OK]${NC} POSTROUTING rule added"
    
    local tailscale_ip=""
    if command -v tailscale &>/dev/null; then
        tailscale_ip=$(tailscale ip -4 2>/dev/null | head -1 || echo "")
    fi
    
    echo ""
    echo -e "${GREEN}━━━ Forwarding Active ━━━${NC}"
    echo ""
    echo "Local access:     http://localhost:$OLLAMA_PORT"
    echo "LAN access:       http://$(hostname -I | awk '{print $1}'):$OLLAMA_PORT"
    if [[ -n "$tailscale_ip" ]]; then
        echo "Tailscale access: http://${tailscale_ip}:$OLLAMA_PORT"
        echo ""
        echo -e "${CYAN}Add to Linode .env:${NC}"
        echo "OLLAMA_URL=http://${tailscale_ip}:$OLLAMA_PORT"
    fi
}

remove_forwarding() {
    load_vm_config
    
    echo -e "${CYAN}━━━ Removing Ollama Port Forwarding ━━━${NC}"
    
    if [[ -z "$VM_IP" ]]; then
        echo -e "${YELLOW}[WARN]${NC} No VM IP configured, cleaning up all Ollama rules..."
        sudo iptables -t nat -S | grep -E ":$OLLAMA_PORT" | while read -r rule; do
            rule_clean=$(echo "$rule" | sed 's/^-A /-D /')
            sudo iptables -t nat $rule_clean 2>/dev/null || true
        done
        echo -e "${GREEN}[OK]${NC} Rules cleaned"
        return
    fi
    
    sudo iptables -t nat -D PREROUTING -p tcp --dport "$OLLAMA_PORT" -j DNAT --to-destination "${VM_IP}:${OLLAMA_PORT}" 2>/dev/null || true
    sudo iptables -t nat -D POSTROUTING -d "$VM_IP" -p tcp --dport "$OLLAMA_PORT" -j MASQUERADE 2>/dev/null || true
    
    echo -e "${GREEN}[OK]${NC} Forwarding rules removed"
}

show_status() {
    load_vm_config
    
    echo -e "${CYAN}━━━ Ollama Forwarding Status ━━━${NC}"
    echo ""
    echo "VM IP: ${VM_IP:-not configured}"
    echo "Port:  $OLLAMA_PORT"
    echo ""
    echo "NAT Rules:"
    sudo iptables -t nat -L PREROUTING -n | grep -E "$OLLAMA_PORT|Chain" || echo "  (none)"
    echo ""
    sudo iptables -t nat -L POSTROUTING -n | grep -E "${VM_IP:-xxx}|Chain" || echo "  (none)"
}

case "${1:-setup}" in
    setup|s)
        setup_forwarding
        ;;
    remove|r)
        remove_forwarding
        ;;
    status)
        show_status
        ;;
    *)
        echo "Usage: $0 {setup|remove|status}"
        exit 1
        ;;
esac
