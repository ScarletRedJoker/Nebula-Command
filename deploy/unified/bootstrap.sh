#!/bin/bash
# Nebula Command - One-Command Node Bootstrap (Linux)
# Detects hardware, configures services, installs dependencies, and starts services

set -e

SCRIPT_DIR="$(cd "$(dirname "${BASH_SOURCE[0]}")" && pwd)"
LIB_DIR="$SCRIPT_DIR/lib"
STATE_DIR="$SCRIPT_DIR/state"
SERVICES_DIR="$SCRIPT_DIR/services"

RED='\033[0;31m'
GREEN='\033[0;32m'
YELLOW='\033[1;33m'
BLUE='\033[0;34m'
NC='\033[0m'

log_info() { echo -e "${BLUE}[INFO]${NC} $1"; }
log_success() { echo -e "${GREEN}[SUCCESS]${NC} $1"; }
log_warn() { echo -e "${YELLOW}[WARN]${NC} $1"; }
log_error() { echo -e "${RED}[ERROR]${NC} $1"; }

DASHBOARD_URL="${DASHBOARD_URL:-}"
INSTALL_OLLAMA="${INSTALL_OLLAMA:-true}"
INSTALL_COMFYUI="${INSTALL_COMFYUI:-auto}"
INSTALL_SD="${INSTALL_SD:-auto}"
DRY_RUN="${DRY_RUN:-false}"

check_root() {
    if [[ $EUID -eq 0 ]]; then
        log_warn "Running as root. Some services may need non-root user."
    fi
}

check_dependencies() {
    local missing=()
    
    command -v curl &> /dev/null || missing+=("curl")
    command -v jq &> /dev/null || missing+=("jq")
    command -v git &> /dev/null || missing+=("git")
    
    if [[ ${#missing[@]} -gt 0 ]]; then
        log_info "Installing missing dependencies: ${missing[*]}"
        
        if command -v apt-get &> /dev/null; then
            sudo apt-get update -qq
            sudo apt-get install -y -qq "${missing[@]}"
        elif command -v dnf &> /dev/null; then
            sudo dnf install -y -q "${missing[@]}"
        elif command -v yum &> /dev/null; then
            sudo yum install -y -q "${missing[@]}"
        elif command -v pacman &> /dev/null; then
            sudo pacman -Sy --noconfirm "${missing[@]}"
        else
            log_error "Cannot install dependencies. Please install manually: ${missing[*]}"
            exit 1
        fi
    fi
    
    log_success "Dependencies satisfied"
}

detect_hardware() {
    log_info "Detecting hardware..."
    
    local profile_file="$STATE_DIR/hardware-profile.json"
    mkdir -p "$STATE_DIR"
    
    bash "$LIB_DIR/detect.sh" "$profile_file"
    
    if [[ -f "$profile_file" ]]; then
        log_success "Hardware detection complete"
        
        local node_id
        node_id=$(jq -r '.node_id' "$profile_file")
        local ram_mb
        ram_mb=$(jq -r '.ram_mb' "$profile_file")
        local gpu_vendor
        gpu_vendor=$(jq -r '.gpu.vendor' "$profile_file")
        local vram_mb
        vram_mb=$(jq -r '.gpu.vram_mb // 0' "$profile_file")
        
        log_info "Node ID: $node_id"
        log_info "RAM: ${ram_mb}MB"
        log_info "GPU: $gpu_vendor (${vram_mb}MB VRAM)"
        
        echo "$profile_file"
    else
        log_error "Hardware detection failed"
        exit 1
    fi
}

configure_node() {
    local profile_file="$1"
    
    log_info "Generating node configuration..."
    
    bash "$LIB_DIR/configure.sh" "$profile_file" "$STATE_DIR" "$DASHBOARD_URL"
    
    local node_id
    node_id=$(jq -r '.node_id' "$profile_file")
    
    if [[ -f "$STATE_DIR/$node_id/.env" ]]; then
        log_success "Configuration generated"
    else
        log_error "Configuration generation failed"
        exit 1
    fi
}

install_ollama() {
    local profile_file="$1"
    
    if [[ "$INSTALL_OLLAMA" != "true" ]]; then
        log_info "Skipping Ollama installation"
        return
    fi
    
    if command -v ollama &> /dev/null; then
        log_info "Ollama already installed"
        return
    fi
    
    local can_run_llm
    can_run_llm=$(jq -r '.capabilities.can_run_llm' "$profile_file")
    
    if [[ "$can_run_llm" != "true" ]]; then
        log_warn "System does not meet minimum requirements for LLM (8GB RAM)"
        return
    fi
    
    log_info "Installing Ollama..."
    
    if [[ "$DRY_RUN" == "true" ]]; then
        log_info "[DRY RUN] Would install Ollama"
        return
    fi
    
    curl -fsSL https://ollama.ai/install.sh | sh
    
    log_success "Ollama installed"
}

install_comfyui() {
    local profile_file="$1"
    
    if [[ "$INSTALL_COMFYUI" == "false" ]]; then
        log_info "Skipping ComfyUI installation"
        return
    fi
    
    if [[ -d "/opt/ComfyUI" ]] || [[ -d "$HOME/ComfyUI" ]]; then
        log_info "ComfyUI already installed"
        return
    fi
    
    local can_run_comfyui
    can_run_comfyui=$(jq -r '.capabilities.can_run_comfyui' "$profile_file")
    
    if [[ "$INSTALL_COMFYUI" == "auto" ]] && [[ "$can_run_comfyui" != "true" ]]; then
        log_warn "System does not meet requirements for ComfyUI (GPU with 4GB+ VRAM)"
        return
    fi
    
    log_info "Installing ComfyUI..."
    
    if [[ "$DRY_RUN" == "true" ]]; then
        log_info "[DRY RUN] Would install ComfyUI"
        return
    fi
    
    local install_dir="${COMFYUI_DIR:-$HOME/ComfyUI}"
    
    git clone https://github.com/comfyanonymous/ComfyUI.git "$install_dir"
    
    cd "$install_dir"
    
    if command -v python3 &> /dev/null; then
        python3 -m venv venv
        source venv/bin/activate
        pip install -r requirements.txt
        deactivate
    fi
    
    log_success "ComfyUI installed at: $install_dir"
}

setup_systemd_services() {
    local profile_file="$1"
    
    log_info "Setting up systemd services..."
    
    local node_id
    node_id=$(jq -r '.node_id' "$profile_file")
    local node_dir="$STATE_DIR/$node_id"
    
    if [[ "$DRY_RUN" == "true" ]]; then
        log_info "[DRY RUN] Would create systemd services"
        return
    fi
    
    if command -v ollama &> /dev/null; then
        cat > /tmp/ollama.service << 'EOF'
[Unit]
Description=Ollama AI Service
After=network-online.target
Wants=network-online.target

[Service]
Type=simple
ExecStart=/usr/local/bin/ollama serve
Restart=always
RestartSec=3
Environment="OLLAMA_HOST=0.0.0.0:11434"
Environment="OLLAMA_ORIGINS=*"

[Install]
WantedBy=multi-user.target
EOF
        
        sudo mv /tmp/ollama.service /etc/systemd/system/ollama.service
        sudo systemctl daemon-reload
        sudo systemctl enable ollama
        log_success "Ollama systemd service created"
    fi
    
    if [[ -d "$HOME/ComfyUI" ]]; then
        local comfyui_dir="$HOME/ComfyUI"
        local extra_args
        extra_args=$(grep "COMFYUI_EXTRA_ARGS" "$node_dir/comfyui.conf" 2>/dev/null | cut -d'=' -f2 || echo "")
        
        cat > /tmp/comfyui.service << EOF
[Unit]
Description=ComfyUI Image Generation Service
After=network-online.target
Wants=network-online.target

[Service]
Type=simple
WorkingDirectory=$comfyui_dir
ExecStart=$comfyui_dir/venv/bin/python main.py --listen 0.0.0.0 --port 8188 $extra_args
Restart=always
RestartSec=5
User=$USER

[Install]
WantedBy=multi-user.target
EOF
        
        sudo mv /tmp/comfyui.service /etc/systemd/system/comfyui.service
        sudo systemctl daemon-reload
        sudo systemctl enable comfyui
        log_success "ComfyUI systemd service created"
    fi
}

start_services() {
    local profile_file="$1"
    
    log_info "Starting services..."
    
    if [[ "$DRY_RUN" == "true" ]]; then
        log_info "[DRY RUN] Would start services"
        return
    fi
    
    if systemctl is-enabled ollama &> /dev/null; then
        sudo systemctl start ollama
        log_success "Ollama started"
    fi
    
    if systemctl is-enabled comfyui &> /dev/null; then
        sudo systemctl start comfyui
        log_success "ComfyUI started"
    fi
}

register_node() {
    local profile_file="$1"
    
    if [[ -z "$DASHBOARD_URL" ]]; then
        log_info "No DASHBOARD_URL set, skipping node registration"
        return
    fi
    
    log_info "Registering node with dashboard..."
    
    local node_id
    node_id=$(jq -r '.node_id' "$profile_file")
    local payload
    payload=$(cat "$profile_file")
    
    if [[ "$DRY_RUN" == "true" ]]; then
        log_info "[DRY RUN] Would register node: $node_id"
        return
    fi
    
    local response
    response=$(curl -s -X POST \
        -H "Content-Type: application/json" \
        -d "$payload" \
        "${DASHBOARD_URL}/api/nodes/register" 2>/dev/null || echo '{"error":"connection failed"}')
    
    if echo "$response" | jq -e '.success' &> /dev/null; then
        log_success "Node registered: $node_id"
    else
        log_warn "Node registration failed (dashboard may be unreachable)"
    fi
}

print_summary() {
    local profile_file="$1"
    
    local node_id
    node_id=$(jq -r '.node_id' "$profile_file")
    local node_dir="$STATE_DIR/$node_id"
    local primary_ip
    primary_ip=$(jq -r '.network.primary_ip' "$profile_file")
    local tailscale_ip
    tailscale_ip=$(jq -r '.network.tailscale_ip // empty' "$profile_file")
    
    echo ""
    echo "=============================================="
    echo "  Nebula Command Node Bootstrap Complete"
    echo "=============================================="
    echo ""
    echo "Node ID:        $node_id"
    echo "Config Dir:     $node_dir"
    echo "Primary IP:     $primary_ip"
    [[ -n "$tailscale_ip" ]] && echo "Tailscale IP:   $tailscale_ip"
    echo ""
    echo "Services:"
    
    if systemctl is-active ollama &> /dev/null 2>&1; then
        echo "  - Ollama:     http://${tailscale_ip:-$primary_ip}:11434 (running)"
    elif command -v ollama &> /dev/null; then
        echo "  - Ollama:     installed (not running)"
    fi
    
    if systemctl is-active comfyui &> /dev/null 2>&1; then
        echo "  - ComfyUI:    http://${tailscale_ip:-$primary_ip}:8188 (running)"
    elif [[ -d "$HOME/ComfyUI" ]]; then
        echo "  - ComfyUI:    installed (not running)"
    fi
    
    echo ""
    echo "To add to dashboard, set environment variable:"
    echo "  WINDOWS_VM_TAILSCALE_IP=${tailscale_ip:-$primary_ip}"
    echo ""
}

main() {
    echo ""
    echo "================================================"
    echo "  Nebula Command - Automated Node Bootstrap"
    echo "================================================"
    echo ""
    
    check_root
    check_dependencies
    
    local profile_file
    profile_file=$(detect_hardware)
    
    configure_node "$profile_file"
    
    install_ollama "$profile_file"
    install_comfyui "$profile_file"
    
    setup_systemd_services "$profile_file"
    start_services "$profile_file"
    
    register_node "$profile_file"
    
    print_summary "$profile_file"
}

while [[ $# -gt 0 ]]; do
    case $1 in
        --dashboard-url)
            DASHBOARD_URL="$2"
            shift 2
            ;;
        --no-ollama)
            INSTALL_OLLAMA="false"
            shift
            ;;
        --no-comfyui)
            INSTALL_COMFYUI="false"
            shift
            ;;
        --force-comfyui)
            INSTALL_COMFYUI="true"
            shift
            ;;
        --dry-run)
            DRY_RUN="true"
            shift
            ;;
        --help)
            echo "Usage: $0 [options]"
            echo ""
            echo "Options:"
            echo "  --dashboard-url URL   Dashboard URL for node registration"
            echo "  --no-ollama           Skip Ollama installation"
            echo "  --no-comfyui          Skip ComfyUI installation"
            echo "  --force-comfyui       Install ComfyUI even without GPU"
            echo "  --dry-run             Show what would be done without making changes"
            echo "  --help                Show this help message"
            exit 0
            ;;
        *)
            log_error "Unknown option: $1"
            exit 1
            ;;
    esac
done

main
