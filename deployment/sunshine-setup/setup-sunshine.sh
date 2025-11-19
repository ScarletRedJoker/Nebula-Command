#!/bin/bash
#
# Sunshine Game Streaming Setup Script
# Installs and configures Sunshine with NVENC GPU encoding on Ubuntu 25.10
#

set -e

# Colors for output
RED='\033[0;31m'
GREEN='\033[0;32m'
YELLOW='\033[1;33m'
NC='\033[0m' # No Color

echo -e "${GREEN}╔══════════════════════════════════════════════════════════════╗${NC}"
echo -e "${GREEN}║           Sunshine Game Streaming Setup                      ║${NC}"
echo -e "${GREEN}║  Ubuntu 25.10 + NVIDIA RTX 3060 + NVENC Encoding            ║${NC}"
echo -e "${GREEN}╚══════════════════════════════════════════════════════════════╝${NC}"
echo

# Check if running as root
if [ "$EUID" -eq 0 ]; then
    echo -e "${RED}Error: Do not run this script as root. Run as your regular user.${NC}"
    exit 1
fi

# Check for NVIDIA GPU
echo -e "${YELLOW}[1/7] Checking for NVIDIA GPU...${NC}"
if ! lspci | grep -i nvidia > /dev/null; then
    echo -e "${RED}Error: No NVIDIA GPU detected. Sunshine requires NVIDIA GPU for NVENC encoding.${NC}"
    exit 1
fi

GPU_MODEL=$(lspci | grep -i nvidia | grep VGA | cut -d: -f3)
echo -e "${GREEN}✓ Found NVIDIA GPU:${NC} $GPU_MODEL"

# Check NVIDIA driver
echo -e "${YELLOW}[2/7] Checking NVIDIA drivers...${NC}"
if ! nvidia-smi > /dev/null 2>&1; then
    echo -e "${RED}Error: nvidia-smi not found. Install NVIDIA drivers first.${NC}"
    echo "Run: sudo ubuntu-drivers autoinstall"
    exit 1
fi

DRIVER_VERSION=$(nvidia-smi --query-gpu=driver_version --format=csv,noheader | head -n1)
echo -e "${GREEN}✓ NVIDIA driver installed:${NC} $DRIVER_VERSION"

# Check for existing Sunshine installation
echo -e "${YELLOW}[3/9] Checking for existing Sunshine installation...${NC}"
if [ -f "/usr/bin/sunshine" ]; then
    EXISTING_VERSION=$(sunshine --version 2>/dev/null | head -n1 || echo "unknown")
    echo -e "${YELLOW}⚠ Sunshine is already installed:${NC} $EXISTING_VERSION"
    read -p "Do you want to continue and reinstall? (y/N): " -n 1 -r
    echo
    if [[ ! $REPLY =~ ^[Yy]$ ]]; then
        echo -e "${YELLOW}Installation cancelled.${NC}"
        exit 0
    fi
fi

# Backup existing configuration
if [ -f "$HOME/.config/sunshine/sunshine.conf" ]; then
    BACKUP_TIMESTAMP=$(date +%Y%m%d_%H%M%S)
    BACKUP_FILE="$HOME/.config/sunshine/sunshine.conf.backup-$BACKUP_TIMESTAMP"
    echo -e "${YELLOW}⚠ Existing config found. Creating backup...${NC}"
    cp "$HOME/.config/sunshine/sunshine.conf" "$BACKUP_FILE"
    echo -e "${GREEN}✓ Backup created:${NC} $BACKUP_FILE"
    read -p "Do you want to overwrite existing config? (y/N): " -n 1 -r
    echo
    if [[ ! $REPLY =~ ^[Yy]$ ]]; then
        SKIP_CONFIG=true
        echo -e "${YELLOW}Existing config will be preserved.${NC}"
    else
        SKIP_CONFIG=false
    fi
else
    SKIP_CONFIG=false
fi

# Detect Ubuntu version
echo -e "${YELLOW}[4/9] Detecting Ubuntu version...${NC}"
UBUNTU_VERSION=$(lsb_release -rs 2>/dev/null || echo "unknown")
UBUNTU_CODENAME=$(lsb_release -cs 2>/dev/null || echo "unknown")
echo -e "${GREEN}✓ Detected Ubuntu:${NC} $UBUNTU_VERSION ($UBUNTU_CODENAME)"

# Install dependencies
echo -e "${YELLOW}[5/9] Installing dependencies...${NC}"
sudo apt-get update
sudo apt-get install -y \
    libva2 libva-drm2 libva-wayland2 libva-x11-2 \
    libdrm2 libevdev2 libopus0 libpulse0 \
    libnvidia-encode1 libnvidia-decode1 \
    libavcodec59 libavutil57 libswscale6 \
    libboost-filesystem1.74.0 libboost-locale1.74.0 \
    libboost-log1.74.0 libboost-program-options1.74.0 \
    libboost-thread1.74.0 \
    wget curl

echo -e "${GREEN}✓ Dependencies installed${NC}"

# Download and install Sunshine
echo -e "${YELLOW}[6/9] Downloading and installing Sunshine...${NC}"
SUNSHINE_VERSION="v0.23.1"

# Determine which package to download based on Ubuntu version
if [[ "$UBUNTU_VERSION" == "22.04" ]]; then
    SUNSHINE_URL="https://github.com/LizardByte/Sunshine/releases/download/${SUNSHINE_VERSION}/sunshine-ubuntu-22.04-amd64.deb"
    echo -e "${GREEN}Using Ubuntu 22.04 package${NC}"
elif [[ "$UBUNTU_VERSION" == "24.04" ]] || [[ "$UBUNTU_VERSION" > "24.04" ]]; then
    SUNSHINE_URL="https://github.com/LizardByte/Sunshine/releases/download/${SUNSHINE_VERSION}/sunshine-ubuntu-24.04-amd64.deb"
    echo -e "${GREEN}Using Ubuntu 24.04+ package${NC}"
else
    echo -e "${YELLOW}⚠ Ubuntu $UBUNTU_VERSION not directly supported${NC}"
    echo -e "${YELLOW}Attempting to use Ubuntu 22.04 package (may require manual build)${NC}"
    SUNSHINE_URL="https://github.com/LizardByte/Sunshine/releases/download/${SUNSHINE_VERSION}/sunshine-ubuntu-22.04-amd64.deb"
fi

cd /tmp
if wget -O sunshine.deb "$SUNSHINE_URL" 2>/dev/null; then
    sudo dpkg -i sunshine.deb || sudo apt-get install -f -y
    echo -e "${GREEN}✓ Sunshine installed${NC}"
else
    echo -e "${RED}✗ Failed to download Sunshine package${NC}"
    echo -e "${YELLOW}You may need to build from source for your Ubuntu version${NC}"
    echo -e "${YELLOW}Visit: https://github.com/LizardByte/Sunshine${NC}"
    exit 1
fi

# Configure Sunshine for NVENC
echo -e "${YELLOW}[7/9] Configuring NVENC encoding...${NC}"

if [ "$SKIP_CONFIG" = false ]; then
    mkdir -p ~/.config/sunshine

    # Detect GPU generation for optimal settings
    GPU_NAME=$(nvidia-smi --query-gpu=name --format=csv,noheader)
    
    # Set GPU-specific NVENC preset and bitrate
    if [[ "$GPU_NAME" == *"RTX 40"* ]]; then
        NV_PRESET="p7"
        DEFAULT_BITRATE="50000"
        echo -e "${GREEN}Optimizing for RTX 40-series (p7, 50 Mbps)${NC}"
    elif [[ "$GPU_NAME" == *"RTX 30"* ]]; then
        NV_PRESET="p6"
        DEFAULT_BITRATE="30000"
        echo -e "${GREEN}Optimizing for RTX 30-series (p6, 30 Mbps)${NC}"
    elif [[ "$GPU_NAME" == *"RTX 20"* ]] || [[ "$GPU_NAME" == *"GTX 16"* ]]; then
        NV_PRESET="p5"
        DEFAULT_BITRATE="25000"
        echo -e "${GREEN}Optimizing for RTX 20/GTX 16-series (p5, 25 Mbps)${NC}"
    elif [[ "$GPU_NAME" == *"GTX 10"* ]]; then
        NV_PRESET="p4"
        DEFAULT_BITRATE="20000"
        echo -e "${GREEN}Optimizing for GTX 10-series (p4, 20 Mbps)${NC}"
    else
        NV_PRESET="p4"
        DEFAULT_BITRATE="20000"
        echo -e "${YELLOW}Using conservative settings for $GPU_NAME (p4, 20 Mbps)${NC}"
    fi

    cat > ~/.config/sunshine/sunshine.conf <<EOF
# Sunshine Configuration
# Generated by setup-sunshine.sh for $GPU_NAME

# Encoder settings - NVENC optimized for detected GPU
encoder = nvenc
nv_preset = $NV_PRESET
nv_rc = cbr            # Constant bitrate for stable streaming
nv_coder = cabac       # Better compression

# Video settings
channels = 2           # Stereo audio
fps = {10,30,60,90,120}
resolutions = [
    352x240,
    480x360,
    858x480,
    1280x720,
    1920x1080,
    2560x1440,
    3840x2160
]

# Default quality (optimized for $GPU_NAME)
bitrate = $DEFAULT_BITRATE
min_threads = 2        # Encoding threads

# Network settings
port = 47989
origin_web_ui_allowed = pc

# Audio
audio_sink = auto

# Logging
min_log_level = info
log_path = /tmp/sunshine.log
EOF

    echo -e "${GREEN}✓ NVENC configuration created for $GPU_NAME${NC}"
else
    echo -e "${YELLOW}⚠ Skipping config generation (preserving existing config)${NC}"
fi

# Add firewall rules
echo -e "${YELLOW}[8/9] Configuring firewall...${NC}"

if command -v ufw > /dev/null; then
    sudo ufw allow 47984:47990/tcp comment "Sunshine TCP"
    sudo ufw allow 47998:48010/udp comment "Sunshine UDP"
    echo -e "${GREEN}✓ Firewall rules added (UFW)${NC}"
elif command -v firewall-cmd > /dev/null; then
    sudo firewall-cmd --permanent --add-port=47984-47990/tcp
    sudo firewall-cmd --permanent --add-port=47998-48010/udp
    sudo firewall-cmd --reload
    echo -e "${GREEN}✓ Firewall rules added (firewalld)${NC}"
else
    echo -e "${YELLOW}⚠ No firewall detected. Manually open ports 47984-47990 (TCP) and 47998-48010 (UDP)${NC}"
fi

# Install systemd service
echo -e "${YELLOW}[9/9] Installing systemd service...${NC}"

sudo mkdir -p /etc/systemd/system

# Get current user
CURRENT_USER=$(whoami)

sudo tee /etc/systemd/system/sunshine@.service > /dev/null <<'EOF'
[Unit]
Description=Sunshine Game Streaming Server
Documentation=https://docs.lizardbyte.dev/projects/sunshine
After=network.target

[Service]
Type=simple
User=%i
Group=%i
ExecStart=/usr/bin/sunshine
Restart=on-failure
RestartSec=5s

# Security hardening
PrivateTmp=true
ProtectSystem=full
ProtectHome=true
ReadWritePaths=/home/%i/.config/sunshine /tmp
NoNewPrivileges=true
LimitNOFILE=8192

# Allow access to GPU devices
DeviceAllow=/dev/dri rw
DeviceAllow=/dev/nvidia0 rw
DeviceAllow=/dev/nvidiactl rw
DeviceAllow=/dev/nvidia-modeset rw

# Environment
Environment="HOME=/home/%i"
Environment="XDG_RUNTIME_DIR=/run/user/%U"

# Required for GPU acceleration
SupplementaryGroups=video render

[Install]
WantedBy=multi-user.target
EOF

sudo systemctl daemon-reload
sudo systemctl enable sunshine@$CURRENT_USER
sudo systemctl start sunshine@$CURRENT_USER

echo -e "${GREEN}✓ Sunshine service installed and started${NC}"

# Get local IP
LOCAL_IP=$(hostname -I | awk '{print $1}')

# Summary
echo
echo -e "${GREEN}╔══════════════════════════════════════════════════════════════╗${NC}"
echo -e "${GREEN}║                 Installation Complete!                       ║${NC}"
echo -e "${GREEN}╚══════════════════════════════════════════════════════════════╝${NC}"
echo
echo -e "${GREEN}Sunshine is now running with NVENC encoding!${NC}"
echo
echo -e "Web UI:       ${YELLOW}https://$LOCAL_IP:47990${NC}"
echo -e "Stream Port:  ${YELLOW}$LOCAL_IP${NC}"
echo
echo -e "${YELLOW}Next Steps:${NC}"
echo -e "1. Open Sunshine Web UI: https://$LOCAL_IP:47990"
echo -e "2. Complete initial setup wizard"
echo -e "3. Add games/applications"
echo -e "4. Download Moonlight client: https://moonlight-stream.org"
echo -e "5. Connect Moonlight to $LOCAL_IP"
echo
echo -e "${YELLOW}Service Commands:${NC}"
echo -e "  Start:   ${GREEN}sudo systemctl start sunshine@$CURRENT_USER${NC}"
echo -e "  Stop:    ${GREEN}sudo systemctl stop sunshine@$CURRENT_USER${NC}"
echo -e "  Status:  ${GREEN}sudo systemctl status sunshine@$CURRENT_USER${NC}"
echo -e "  Logs:    ${GREEN}journalctl -u sunshine@$CURRENT_USER -f${NC}"
echo
echo -e "${YELLOW}Verify NVENC:${NC}"
echo -e "  Check logs for 'Using encoder: nvenc'"
echo -e "  journalctl -u sunshine@$CURRENT_USER | grep encoder"
echo
echo -e "${GREEN}Happy Streaming! 🎮${NC}"
