#!/bin/bash
set -euo pipefail

SCRIPT_DIR="$(cd "$(dirname "${BASH_SOURCE[0]}")" && pwd)"
REPO_ROOT="$(dirname "$SCRIPT_DIR")"
STATE_DIR="$REPO_ROOT/deploy/shared/state"
STATE_FILE="$STATE_DIR/local-ai.json"
CONFIG_FILE="$REPO_ROOT/deploy/shared/config/ai-nodes.json"

RED='\033[0;31m'
GREEN='\033[0;32m'
YELLOW='\033[1;33m'
CYAN='\033[0;36m'
NC='\033[0m'

OLLAMA_PORT="${OLLAMA_PORT:-11434}"
STABLE_DIFFUSION_PORT="${STABLE_DIFFUSION_PORT:-7860}"
COMFYUI_PORT="${COMFYUI_PORT:-8188}"

WINDOWS_VM_TAILSCALE_IP="${WINDOWS_VM_TAILSCALE_IP:-100.118.44.102}"
WINDOWS_VM_NAME="${WINDOWS_VM_NAME:-RDPWindows}"

get_tailscale_ip() {
    if command -v tailscale &> /dev/null; then
        tailscale ip -4 2>/dev/null | head -1 || echo ""
    else
        echo ""
    fi
}

get_local_ip() {
    hostname -I 2>/dev/null | awk '{print $1}' || echo "127.0.0.1"
}

check_ollama() {
    local host="${1:-localhost}"
    local port="${2:-$OLLAMA_PORT}"
    local url="http://${host}:${port}"
    
    local version=""
    local models=""
    local status="offline"
    local gpu_info=""
    
    if curl -sf --connect-timeout 5 "${url}/api/version" > /dev/null 2>&1; then
        status="online"
        version=$(curl -sf --connect-timeout 3 "${url}/api/version" 2>/dev/null | grep -o '"version":"[^"]*"' | cut -d'"' -f4 || echo "unknown")
        
        local models_json
        models_json=$(curl -sf --connect-timeout 5 "${url}/api/tags" 2>/dev/null || echo '{"models":[]}')
        models=$(echo "$models_json" | grep -o '"name":"[^"]*"' | cut -d'"' -f4 | tr '\n' ',' | sed 's/,$//' || true)
        models="${models:-}"
    fi
    
    echo "{\"status\":\"$status\",\"version\":\"$version\",\"models\":\"$models\",\"url\":\"$url\"}"
}

check_stable_diffusion() {
    local host="${1:-localhost}"
    local port="${2:-$STABLE_DIFFUSION_PORT}"
    local url="http://${host}:${port}"
    
    local status="offline"
    
    if curl -sf --connect-timeout 3 "${url}/sdapi/v1/options" > /dev/null 2>&1; then
        status="online"
    elif curl -sf --connect-timeout 3 "${url}/api/v1/txt2img" > /dev/null 2>&1; then
        status="online"
    fi
    
    echo "{\"status\":\"$status\",\"url\":\"$url\"}"
}

check_comfyui() {
    local host="${1:-localhost}"
    local port="${2:-$COMFYUI_PORT}"
    local url="http://${host}:${port}"
    
    local status="offline"
    
    if curl -sf --connect-timeout 3 "${url}/system_stats" > /dev/null 2>&1; then
        status="online"
    fi
    
    echo "{\"status\":\"$status\",\"url\":\"$url\"}"
}

check_windows_vm_ollama() {
    local host="${WINDOWS_VM_TAILSCALE_IP}"
    local port="${OLLAMA_PORT}"
    local url="http://${host}:${port}"
    
    local version=""
    local models=""
    local status="offline"
    local gpu_name=""
    local gpu_vram=""
    
    if curl -sf --connect-timeout 5 "${url}/api/version" > /dev/null 2>&1; then
        status="online"
        version=$(curl -sf --connect-timeout 3 "${url}/api/version" 2>/dev/null | grep -o '"version":"[^"]*"' | cut -d'"' -f4 || echo "unknown")
        
        local models_json
        models_json=$(curl -sf --connect-timeout 5 "${url}/api/tags" 2>/dev/null || echo '{"models":[]}')
        models=$(echo "$models_json" | grep -o '"name":"[^"]*"' | cut -d'"' -f4 | tr '\n' ',' | sed 's/,$//' || true)
        models="${models:-}"
    fi
    
    echo "{\"status\":\"$status\",\"version\":\"$version\",\"models\":\"$models\",\"url\":\"$url\",\"host\":\"$host\",\"vmName\":\"$WINDOWS_VM_NAME\"}"
}

register_services() {
    echo -e "${CYAN}━━━ Local AI Service Registration ━━━${NC}"
    
    mkdir -p "$STATE_DIR"
    mkdir -p "$(dirname "$CONFIG_FILE")" 2>/dev/null || true
    chmod 750 "$STATE_DIR" 2>/dev/null || true
    
    local tailscale_ip=$(get_tailscale_ip)
    local local_ip=$(get_local_ip)
    local hostname=$(hostname)
    local timestamp=$(date -u +%Y-%m-%dT%H:%M:%SZ)
    
    echo "Hostname: $hostname"
    echo "Local IP: $local_ip"
    echo "Tailscale IP: ${tailscale_ip:-not connected}"
    echo ""
    
    if [ -z "$tailscale_ip" ]; then
        echo -e "${YELLOW}[WARN]${NC} Tailscale not connected - waiting 10s for connection..."
        sleep 10
        tailscale_ip=$(get_tailscale_ip)
        if [ -z "$tailscale_ip" ]; then
            echo -e "${YELLOW}[WARN]${NC} Tailscale still not connected. Using local IP."
            echo "       Remote servers won't be able to reach these services."
        else
            echo -e "${GREEN}[OK]${NC} Tailscale connected: $tailscale_ip"
        fi
    fi
    
    local preferred_ip="${tailscale_ip:-$local_ip}"
    
    echo -e "${CYAN}━━━ Checking Ubuntu Host Services ━━━${NC}"
    echo "Checking services on $preferred_ip..."
    
    local ollama_result=$(check_ollama "$preferred_ip" "$OLLAMA_PORT")
    local ollama_status=$(echo "$ollama_result" | grep -o '"status":"[^"]*"' | cut -d'"' -f4)
    local ollama_version=$(echo "$ollama_result" | grep -o '"version":"[^"]*"' | cut -d'"' -f4)
    local ollama_models=$(echo "$ollama_result" | grep -o '"models":"[^"]*"' | cut -d'"' -f4)
    
    if [ "$ollama_status" = "online" ]; then
        echo -e "  ${GREEN}●${NC} Ollama (Ubuntu): online (v${ollama_version})"
        [ -n "$ollama_models" ] && echo "    Models: $ollama_models"
    else
        echo -e "  ${RED}○${NC} Ollama (Ubuntu): offline"
    fi
    
    local sd_result=$(check_stable_diffusion "$preferred_ip" "$STABLE_DIFFUSION_PORT")
    local sd_status=$(echo "$sd_result" | grep -o '"status":"[^"]*"' | cut -d'"' -f4)
    
    if [ "$sd_status" = "online" ]; then
        echo -e "  ${GREEN}●${NC} Stable Diffusion: online"
    else
        echo -e "  ${RED}○${NC} Stable Diffusion: offline"
    fi
    
    local comfy_result=$(check_comfyui "$preferred_ip" "$COMFYUI_PORT")
    local comfy_status=$(echo "$comfy_result" | grep -o '"status":"[^"]*"' | cut -d'"' -f4)
    
    if [ "$comfy_status" = "online" ]; then
        echo -e "  ${GREEN}●${NC} ComfyUI: online"
    else
        echo -e "  ${RED}○${NC} ComfyUI: offline"
    fi
    
    echo ""
    echo -e "${CYAN}━━━ Checking Windows VM (GPU Passthrough) ━━━${NC}"
    echo "Windows VM: ${WINDOWS_VM_NAME} @ ${WINDOWS_VM_TAILSCALE_IP}"
    
    local win_ollama_result=$(check_windows_vm_ollama)
    local win_ollama_status=$(echo "$win_ollama_result" | grep -o '"status":"[^"]*"' | cut -d'"' -f4)
    local win_ollama_version=$(echo "$win_ollama_result" | grep -o '"version":"[^"]*"' | cut -d'"' -f4)
    local win_ollama_models=$(echo "$win_ollama_result" | grep -o '"models":"[^"]*"' | cut -d'"' -f4)
    
    if [ "$win_ollama_status" = "online" ]; then
        echo -e "  ${GREEN}●${NC} Ollama (Windows/NVIDIA GPU): online (v${win_ollama_version})"
        [ -n "$win_ollama_models" ] && echo "    Models: $win_ollama_models"
        echo -e "    ${GREEN}GPU:${NC} NVIDIA RTX 3060 (12GB VRAM) via KVM passthrough"
    else
        echo -e "  ${RED}○${NC} Ollama (Windows VM): offline"
        echo -e "    ${YELLOW}Hint:${NC} Start the Windows VM and run 'ollama serve'"
    fi
    
    local primary_ollama_url=""
    local primary_ollama_status="offline"
    local primary_ollama_source=""
    
    if [ "$win_ollama_status" = "online" ]; then
        primary_ollama_url="http://${WINDOWS_VM_TAILSCALE_IP}:${OLLAMA_PORT}"
        primary_ollama_status="online"
        primary_ollama_source="windows-vm"
    elif [ "$ollama_status" = "online" ]; then
        primary_ollama_url="http://${preferred_ip}:${OLLAMA_PORT}"
        primary_ollama_status="online"
        primary_ollama_source="ubuntu-host"
    fi
    
    cat > "$STATE_FILE" << EOF
{
  "hostname": "$hostname",
  "localIp": "$local_ip",
  "tailscaleIp": "${tailscale_ip:-null}",
  "preferredIp": "$preferred_ip",
  "registeredAt": "$timestamp",
  "primaryOllama": {
    "status": "$primary_ollama_status",
    "url": "$primary_ollama_url",
    "source": "$primary_ollama_source"
  },
  "services": {
    "ollama": {
      "status": "$ollama_status",
      "url": "http://${preferred_ip}:${OLLAMA_PORT}",
      "version": "$ollama_version",
      "models": "$ollama_models",
      "location": "ubuntu-host"
    },
    "stableDiffusion": {
      "status": "$sd_status",
      "url": "http://${preferred_ip}:${STABLE_DIFFUSION_PORT}"
    },
    "comfyui": {
      "status": "$comfy_status",
      "url": "http://${preferred_ip}:${COMFYUI_PORT}"
    }
  },
  "windowsVm": {
    "name": "$WINDOWS_VM_NAME",
    "tailscaleIp": "$WINDOWS_VM_TAILSCALE_IP",
    "gpu": {
      "model": "NVIDIA GeForce RTX 3060",
      "vram": "12GB",
      "passthrough": "kvm"
    },
    "services": {
      "ollama": {
        "status": "$win_ollama_status",
        "url": "http://${WINDOWS_VM_TAILSCALE_IP}:${OLLAMA_PORT}",
        "version": "$win_ollama_version",
        "models": "$win_ollama_models"
      }
    }
  }
}
EOF
    
    echo ""
    echo -e "${GREEN}✓${NC} State saved to: $STATE_FILE"
    
    echo ""
    echo -e "${CYAN}━━━ Recommended Environment Variables ━━━${NC}"
    
    if [ "$win_ollama_status" = "online" ]; then
        echo -e "${GREEN}# Windows VM Ollama (GPU-accelerated - RECOMMENDED)${NC}"
        echo "OLLAMA_URL=http://${WINDOWS_VM_TAILSCALE_IP}:${OLLAMA_PORT}"
    elif [ "$ollama_status" = "online" ]; then
        echo -e "${YELLOW}# Ubuntu Host Ollama (CPU only)${NC}"
        echo "OLLAMA_URL=http://${tailscale_ip}:${OLLAMA_PORT}"
    else
        echo -e "${RED}# No Ollama available - start Windows VM or install Ollama${NC}"
    fi
    
    [ "$sd_status" = "online" ] && echo "STABLE_DIFFUSION_URL=http://${tailscale_ip}:${STABLE_DIFFUSION_PORT}"
    [ "$comfy_status" = "online" ] && echo "COMFYUI_URL=http://${tailscale_ip}:${COMFYUI_PORT}"
}

show_status() {
    if [ -f "$STATE_FILE" ]; then
        echo -e "${CYAN}━━━ Local AI State ━━━${NC}"
        cat "$STATE_FILE"
    else
        echo "No state file found. Run: $0 register"
    fi
}

case "${1:-register}" in
    register)
        register_services
        ;;
    status)
        show_status
        ;;
    check-ollama)
        host="${2:-localhost}"
        check_ollama "$host" "$OLLAMA_PORT"
        ;;
    check-windows)
        check_windows_vm_ollama
        ;;
    *)
        echo "Usage: $0 {register|status|check-ollama [host]|check-windows}"
        exit 1
        ;;
esac
