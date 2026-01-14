#!/bin/bash
set -euo pipefail

RED='\033[0;31m'
GREEN='\033[0;32m'
YELLOW='\033[1;33m'
BLUE='\033[0;34m'
CYAN='\033[0;36m'
MAGENTA='\033[0;35m'
BOLD='\033[1m'
NC='\033[0m'

SCRIPT_DIR="$(cd "$(dirname "${BASH_SOURCE[0]}")" && pwd)"
DEPLOY_ROOT="$(dirname "$SCRIPT_DIR")"

VERBOSE=false
DRY_RUN=false
FORCE=false
SKIP_CONFIG=false
OLLAMA_MODEL="qwen2.5-coder:14b"

log() {
    local level="$1"
    shift
    case "$level" in
        INFO)    echo -e "${GREEN}[✓]${NC} $*" ;;
        WARN)    echo -e "${YELLOW}[⚠]${NC} $*" ;;
        ERROR)   echo -e "${RED}[✗]${NC} $*" >&2 ;;
        STEP)    echo -e "${CYAN}[→]${NC} $*" ;;
        DEBUG)   [[ "$VERBOSE" == "true" ]] && echo -e "${BLUE}[DEBUG]${NC} $*" ;;
        SUCCESS) echo -e "${GREEN}[✓]${NC} $*" ;;
    esac
}

section() {
    echo ""
    echo -e "${MAGENTA}━━━ $1 ━━━${NC}"
    echo ""
}

print_banner() {
    echo ""
    echo -e "${CYAN}╔══════════════════════════════════════════════════════════════╗${NC}"
    echo -e "${CYAN}║${NC}          ${BOLD}OpenCode AI Coding Agent - Installer${NC}               ${CYAN}║${NC}"
    echo -e "${CYAN}╚══════════════════════════════════════════════════════════════╝${NC}"
    echo ""
}

detect_os() {
    local os_type="unknown"
    local os_name=""
    
    if [[ "$OSTYPE" == "linux-gnu"* ]]; then
        os_type="linux"
        if [[ -f "/proc/version" ]] && grep -qi "microsoft" /proc/version 2>/dev/null; then
            os_type="wsl"
            os_name="Windows Subsystem for Linux"
        elif [[ -f "/etc/os-release" ]]; then
            os_name=$(grep "PRETTY_NAME" /etc/os-release 2>/dev/null | cut -d'"' -f2 || echo "Linux")
        else
            os_name="Linux"
        fi
    elif [[ "$OSTYPE" == "darwin"* ]]; then
        os_type="macos"
        os_name="macOS $(sw_vers -productVersion 2>/dev/null || echo '')"
    elif [[ "$OSTYPE" == "msys" ]] || [[ "$OSTYPE" == "cygwin" ]] || [[ -n "${WINDIR:-}" ]]; then
        os_type="windows"
        os_name="Windows (Git Bash/MSYS)"
    elif [[ "$OSTYPE" == "freebsd"* ]]; then
        os_type="freebsd"
        os_name="FreeBSD"
    fi
    
    log INFO "Detected OS: ${BOLD}$os_name${NC} ($os_type)"
    echo "$os_type"
}

check_prerequisites() {
    section "Checking Prerequisites"
    
    local missing=()
    
    if command -v node &>/dev/null; then
        local node_ver=$(node --version 2>/dev/null)
        log INFO "Node.js: $node_ver"
    else
        log WARN "Node.js: not found"
        missing+=("nodejs")
    fi
    
    if command -v npm &>/dev/null; then
        local npm_ver=$(npm --version 2>/dev/null)
        log INFO "npm: $npm_ver"
    else
        log WARN "npm: not found"
        missing+=("npm")
    fi
    
    if command -v curl &>/dev/null; then
        log INFO "curl: available"
    else
        log WARN "curl: not found"
        missing+=("curl")
    fi
    
    if command -v git &>/dev/null; then
        log INFO "git: available"
    else
        log DEBUG "git: not found (optional)"
    fi
    
    if command -v ollama &>/dev/null; then
        local ollama_ver=$(ollama --version 2>/dev/null | head -1)
        log INFO "Ollama: $ollama_ver"
    else
        log WARN "Ollama: not found (local AI will not work)"
    fi
    
    if [[ ${#missing[@]} -gt 0 ]]; then
        log WARN "Missing prerequisites: ${missing[*]}"
        log INFO "Will attempt installation anyway..."
    fi
    
    return 0
}

install_nodejs_if_needed() {
    if command -v node &>/dev/null && command -v npm &>/dev/null; then
        return 0
    fi
    
    section "Installing Node.js"
    
    local os_type=$(detect_os)
    
    if [[ "$DRY_RUN" == "true" ]]; then
        log INFO "[DRY-RUN] Would install Node.js"
        return 0
    fi
    
    case "$os_type" in
        linux|wsl)
            if command -v apt-get &>/dev/null; then
                log STEP "Installing Node.js via apt..."
                curl -fsSL https://deb.nodesource.com/setup_20.x | sudo -E bash - || true
                sudo apt-get install -y nodejs || {
                    log ERROR "Failed to install Node.js via apt"
                    return 1
                }
            elif command -v dnf &>/dev/null; then
                log STEP "Installing Node.js via dnf..."
                sudo dnf install -y nodejs npm || {
                    log ERROR "Failed to install Node.js via dnf"
                    return 1
                }
            elif command -v yum &>/dev/null; then
                log STEP "Installing Node.js via yum..."
                curl -fsSL https://rpm.nodesource.com/setup_20.x | sudo bash - || true
                sudo yum install -y nodejs || {
                    log ERROR "Failed to install Node.js via yum"
                    return 1
                }
            elif command -v pacman &>/dev/null; then
                log STEP "Installing Node.js via pacman..."
                sudo pacman -Sy --noconfirm nodejs npm || {
                    log ERROR "Failed to install Node.js via pacman"
                    return 1
                }
            else
                log ERROR "No supported package manager found"
                log INFO "Please install Node.js manually from: https://nodejs.org"
                return 1
            fi
            ;;
        macos)
            if command -v brew &>/dev/null; then
                log STEP "Installing Node.js via Homebrew..."
                brew install node || {
                    log ERROR "Failed to install Node.js via Homebrew"
                    return 1
                }
            else
                log ERROR "Homebrew not found"
                log INFO "Install Homebrew from: https://brew.sh"
                log INFO "Or install Node.js from: https://nodejs.org"
                return 1
            fi
            ;;
        windows)
            log ERROR "Please install Node.js manually on Windows"
            log INFO "Download from: https://nodejs.org"
            return 1
            ;;
        *)
            log ERROR "Unsupported OS for automatic Node.js installation"
            log INFO "Please install Node.js manually from: https://nodejs.org"
            return 1
            ;;
    esac
    
    if command -v node &>/dev/null; then
        log SUCCESS "Node.js installed: $(node --version)"
        return 0
    else
        log ERROR "Node.js installation failed"
        return 1
    fi
}

install_opencode() {
    section "Installing OpenCode"
    
    if command -v opencode &>/dev/null && [[ "$FORCE" != "true" ]]; then
        local version=$(opencode --version 2>/dev/null || echo "unknown")
        log SUCCESS "OpenCode already installed: $version"
        return 0
    fi
    
    if [[ "$DRY_RUN" == "true" ]]; then
        log INFO "[DRY-RUN] Would install OpenCode"
        return 0
    fi
    
    local install_method=""
    
    if command -v npm &>/dev/null; then
        log STEP "Installing OpenCode via npm..."
        
        if npm install -g opencode-ai 2>/dev/null; then
            install_method="npm"
            log SUCCESS "OpenCode installed via npm"
        else
            log WARN "npm global install failed, trying with sudo..."
            if sudo npm install -g opencode-ai 2>/dev/null; then
                install_method="npm"
                log SUCCESS "OpenCode installed via npm (with sudo)"
            else
                log WARN "npm install failed"
            fi
        fi
    fi
    
    if [[ -z "$install_method" ]] && command -v curl &>/dev/null; then
        log STEP "Installing OpenCode via curl..."
        
        if curl -fsSL https://opencode.ai/install 2>/dev/null | bash; then
            install_method="curl"
            log SUCCESS "OpenCode installed via curl"
        else
            log WARN "curl installer failed"
        fi
    fi
    
    if [[ -z "$install_method" ]]; then
        log ERROR "Failed to install OpenCode"
        log INFO "Please install manually:"
        log INFO "  npm install -g opencode-ai"
        log INFO "  OR"
        log INFO "  curl -fsSL https://opencode.ai/install | bash"
        return 1
    fi
    
    return 0
}

configure_opencode() {
    section "Configuring OpenCode"
    
    if [[ "$SKIP_CONFIG" == "true" ]]; then
        log INFO "Skipping configuration (--skip-config)"
        return 0
    fi
    
    if [[ "$DRY_RUN" == "true" ]]; then
        log INFO "[DRY-RUN] Would create OpenCode configuration"
        return 0
    fi
    
    local config_dir="$HOME/.config/opencode"
    local config_file="$config_dir/config.json"
    
    mkdir -p "$config_dir"
    
    if [[ -f "$config_file" ]] && [[ "$FORCE" != "true" ]]; then
        log INFO "Configuration already exists: $config_file"
        log DEBUG "Use --force to overwrite"
        return 0
    fi
    
    if [[ -f "$DEPLOY_ROOT/shared/opencode-config.json" ]]; then
        cp "$DEPLOY_ROOT/shared/opencode-config.json" "$config_file"
        log INFO "Copied shared configuration from deploy/shared/opencode-config.json"
    else
        log STEP "Creating default configuration..."
        
        cat > "$config_file" << EOF
{
  "provider": "ollama",
  "model": "$OLLAMA_MODEL",
  "baseUrl": "http://localhost:11434",
  "lsp": {
    "enabled": true,
    "typescript": true,
    "python": true
  },
  "fallback": {
    "enabled": true,
    "provider": "openai"
  },
  "keybindings": {
    "submit": "enter",
    "newline": "shift+enter"
  },
  "editor": {
    "theme": "auto",
    "fontSize": 14
  },
  "context": {
    "maxFiles": 50,
    "maxTokens": 100000
  }
}
EOF
        log INFO "Created configuration: $config_file"
    fi
    
    log SUCCESS "OpenCode configured for local Ollama with model: $OLLAMA_MODEL"
    
    return 0
}

pull_ollama_model() {
    section "Pulling Ollama Model"
    
    if ! command -v ollama &>/dev/null; then
        log WARN "Ollama not installed - skipping model pull"
        log INFO "Install Ollama from: https://ollama.ai"
        return 0
    fi
    
    if [[ "$DRY_RUN" == "true" ]]; then
        log INFO "[DRY-RUN] Would pull Ollama model: $OLLAMA_MODEL"
        return 0
    fi
    
    if ollama list 2>/dev/null | grep -q "$OLLAMA_MODEL"; then
        log INFO "Model already available: $OLLAMA_MODEL"
        return 0
    fi
    
    log STEP "Pulling model: $OLLAMA_MODEL (this may take a while)..."
    
    if ollama pull "$OLLAMA_MODEL"; then
        log SUCCESS "Model pulled: $OLLAMA_MODEL"
    else
        log WARN "Failed to pull model - you can try manually: ollama pull $OLLAMA_MODEL"
    fi
    
    return 0
}

verify_installation() {
    section "Verifying Installation"
    
    local success=true
    
    if command -v opencode &>/dev/null; then
        local version=$(opencode --version 2>/dev/null || echo "installed")
        log SUCCESS "OpenCode: $version"
    else
        log WARN "OpenCode not in PATH"
        log INFO "You may need to restart your terminal"
        success=false
    fi
    
    local config_file="$HOME/.config/opencode/config.json"
    if [[ -f "$config_file" ]]; then
        log SUCCESS "Configuration: $config_file"
    else
        log WARN "Configuration file not found"
        success=false
    fi
    
    if command -v ollama &>/dev/null; then
        if ollama list 2>/dev/null | grep -q "$OLLAMA_MODEL"; then
            log SUCCESS "Ollama model: $OLLAMA_MODEL ready"
        else
            log WARN "Ollama model not yet pulled"
        fi
    else
        log WARN "Ollama not installed - local AI unavailable"
    fi
    
    if [[ "$success" == "true" ]]; then
        return 0
    else
        return 1
    fi
}

add_to_path() {
    if command -v opencode &>/dev/null; then
        return 0
    fi
    
    local npm_prefix=$(npm config get prefix 2>/dev/null || echo "")
    
    if [[ -n "$npm_prefix" ]] && [[ -x "$npm_prefix/bin/opencode" ]]; then
        log INFO "OpenCode found at: $npm_prefix/bin/opencode"
        
        local shell_rc=""
        if [[ -f "$HOME/.bashrc" ]]; then
            shell_rc="$HOME/.bashrc"
        elif [[ -f "$HOME/.zshrc" ]]; then
            shell_rc="$HOME/.zshrc"
        elif [[ -f "$HOME/.profile" ]]; then
            shell_rc="$HOME/.profile"
        fi
        
        if [[ -n "$shell_rc" ]]; then
            if ! grep -q "npm.*bin" "$shell_rc" 2>/dev/null; then
                echo "export PATH=\"\$PATH:$npm_prefix/bin\"" >> "$shell_rc"
                log INFO "Added npm bin to PATH in $shell_rc"
                log INFO "Run: source $shell_rc"
            fi
        fi
    fi
}

usage() {
    cat << EOF
${BOLD}OpenCode AI Coding Agent - Installer${NC}

${CYAN}USAGE:${NC}
    $(basename "$0") [OPTIONS]

${CYAN}OPTIONS:${NC}
    -m, --model MODEL   Ollama model to use (default: qwen2.5-coder:14b)
    --skip-config       Don't create/update configuration
    --skip-model        Don't pull Ollama model
    -f, --force         Force reinstall/reconfigure
    -n, --dry-run       Show what would be done without executing
    -v, --verbose       Enable verbose output
    -h, --help          Show this help

${CYAN}EXAMPLES:${NC}
    $(basename "$0")                          # Full install with defaults
    $(basename "$0") -m deepseek-coder:6.7b   # Use different model
    $(basename "$0") --skip-model             # Skip model download
    $(basename "$0") --force                  # Force reinstall

${CYAN}SUPPORTED PLATFORMS:${NC}
    - Linux (Ubuntu, Debian, Fedora, Arch, etc.)
    - macOS (via Homebrew)
    - Windows Subsystem for Linux (WSL)
    - Windows (Git Bash/MSYS - partial support)

${CYAN}WHAT THIS SCRIPT DOES:${NC}
    1. Checks prerequisites (Node.js, npm, curl)
    2. Installs Node.js if not present (Linux/macOS)
    3. Installs OpenCode via npm or curl
    4. Creates configuration for local Ollama
    5. Optionally pulls the Ollama model
    6. Verifies the installation

${CYAN}AFTER INSTALLATION:${NC}
    Run 'opencode' in any project directory to start coding with AI.
    Make sure Ollama is running: ollama serve
EOF
}

main() {
    local skip_model=false
    
    while [[ $# -gt 0 ]]; do
        case "$1" in
            -m|--model)
                OLLAMA_MODEL="$2"
                shift 2
                ;;
            --skip-config)
                SKIP_CONFIG=true
                shift
                ;;
            --skip-model)
                skip_model=true
                shift
                ;;
            -f|--force)
                FORCE=true
                shift
                ;;
            -n|--dry-run)
                DRY_RUN=true
                shift
                ;;
            -v|--verbose)
                VERBOSE=true
                shift
                ;;
            -h|--help)
                usage
                exit 0
                ;;
            *)
                log ERROR "Unknown option: $1"
                usage
                exit 1
                ;;
        esac
    done
    
    print_banner
    
    [[ "$DRY_RUN" == "true" ]] && log WARN "DRY-RUN MODE - No changes will be made"
    
    local os_type=$(detect_os)
    
    check_prerequisites
    
    install_nodejs_if_needed || {
        log ERROR "Failed to install Node.js"
        exit 1
    }
    
    install_opencode || {
        log ERROR "Failed to install OpenCode"
        exit 1
    }
    
    configure_opencode
    
    if [[ "$skip_model" != "true" ]]; then
        pull_ollama_model
    fi
    
    add_to_path
    
    verify_installation
    
    section "Installation Complete"
    echo ""
    echo -e "${GREEN}${BOLD}✓ OpenCode installation completed!${NC}"
    echo ""
    echo "Next steps:"
    echo "  1. Make sure Ollama is running:  ${CYAN}ollama serve${NC}"
    echo "  2. Start OpenCode in any project: ${CYAN}opencode${NC}"
    echo ""
    
    if ! command -v opencode &>/dev/null; then
        echo -e "${YELLOW}Note: Restart your terminal for PATH changes to take effect.${NC}"
        echo ""
    fi
}

main "$@"
