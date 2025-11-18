#!/bin/bash
# Fix VNC Desktop and Code-Server Issues
# This script fixes:
# 1. code-server permission issues (EACCES errors)
# 2. VNC desktop x11vnc password file location
# 3. VNC desktop container user permissions

set -e

RED='\033[0;31m'
GREEN='\033[0;32m'
YELLOW='\033[1;33m'
BLUE='\033[0;34m'
NC='\033[0m'

echo -e "${BLUE}╔══════════════════════════════════════════════════════════════╗${NC}"
echo -e "${BLUE}║                                                              ║${NC}"
echo -e "${BLUE}║        🔧 Fixing VNC Desktop & Code-Server Issues 🔧        ║${NC}"
echo -e "${BLUE}║                                                              ║${NC}"
echo -e "${BLUE}╚══════════════════════════════════════════════════════════════╝${NC}"
echo ""

cd /home/evin/contain/HomeLabHub

# Step 1: Fix code-server volume permissions
echo -e "${YELLOW}[1/4] Fixing code-server volume permissions...${NC}"
VOLUME_PATH=$(docker volume inspect code_server_data --format '{{ .Mountpoint }}' 2>/dev/null || echo "")
if [ -n "$VOLUME_PATH" ]; then
    echo "  Volume path: $VOLUME_PATH"
    echo "  Setting ownership to 1000:1000..."
    sudo chown -R 1000:1000 "$VOLUME_PATH"
    echo -e "${GREEN}✓ Code-server permissions fixed${NC}"
else
    echo -e "${YELLOW}⚠ Code-server volume not found, will be created on restart${NC}"
fi

# Step 2: Stop VNC and code-server
echo ""
echo -e "${YELLOW}[2/4] Stopping VNC Desktop and code-server...${NC}"
docker-compose -f docker-compose.unified.yml stop vnc-desktop code-server || true
echo -e "${GREEN}✓ Services stopped${NC}"

# Step 3: Rebuild VNC Desktop (fixes password file issue)
echo ""
echo -e "${YELLOW}[3/4] Rebuilding VNC Desktop...${NC}"
echo -e "${BLUE}ℹ This fixes the VNC password storage location issue${NC}"
docker-compose -f docker-compose.unified.yml build --no-cache vnc-desktop
echo -e "${GREEN}✓ VNC Desktop rebuilt${NC}"

# Step 4: Start services
echo ""
echo -e "${YELLOW}[4/4] Starting services...${NC}"
docker-compose -f docker-compose.unified.yml up -d vnc-desktop code-server
echo -e "${GREEN}✓ Services started${NC}"

# Wait for services to initialize
echo ""
echo -e "${BLUE}⏳ Waiting 20 seconds for services to initialize...${NC}"
sleep 20

# Verification
echo ""
echo -e "${BLUE}╔══════════════════════════════════════════════════════════════╗${NC}"
echo -e "${BLUE}║               ✓ VERIFICATION RESULTS                         ║${NC}"
echo -e "${BLUE}╚══════════════════════════════════════════════════════════════╝${NC}"
echo ""

echo -e "${YELLOW}Code-server status:${NC}"
if docker logs code-server --tail 10 2>&1 | grep -qi "EACCES"; then
    echo -e "${RED}✗ Code-server still has permission errors${NC}"
    echo -e "${YELLOW}  Showing last 5 log lines:${NC}"
    docker logs code-server --tail 5
else
    if docker logs code-server --tail 10 2>&1 | grep -qi "HTTP server listening"; then
        echo -e "${GREEN}✓ Code-server is running properly${NC}"
    else
        echo -e "${YELLOW}⚠ Code-server status unclear - check logs:${NC}"
        docker logs code-server --tail 5
    fi
fi

echo ""
echo -e "${YELLOW}VNC Desktop status:${NC}"
if docker logs vnc-desktop --tail 20 2>&1 | grep -qi "x11vnc.*RUNNING"; then
    echo -e "${GREEN}✓ VNC x11vnc is running${NC}"
else
    echo -e "${RED}✗ VNC x11vnc may have issues - checking logs:${NC}"
    docker logs vnc-desktop --tail 10 | grep -i "x11vnc\|vnc\|error" || docker logs vnc-desktop --tail 10
fi

echo ""
if docker logs vnc-desktop 2>&1 | grep -qi "/.password2"; then
    echo -e "${YELLOW}⚠ VNC password file still in root location (/.password2)${NC}"
    echo -e "${YELLOW}  This may cause login issues. If problems persist, check VNC_PASSWORD env var.${NC}"
else
    echo -e "${GREEN}✓ VNC password file location appears correct${NC}"
fi

echo ""
echo -e "${BLUE}╔══════════════════════════════════════════════════════════════╗${NC}"
echo -e "${BLUE}║               🌐 ACCESS YOUR SERVICES                        ║${NC}"
echo -e "${BLUE}╚══════════════════════════════════════════════════════════════╝${NC}"
echo ""
echo -e "${GREEN}✓ VNC Desktop:${NC}    https://vnc.evindrake.net"
echo -e "${GREEN}✓ Code Server:${NC}    https://code.evindrake.net"
echo ""
echo -e "${BLUE}═══════════════════════════════════════════════════════════════${NC}"
echo -e "${GREEN}✅ FIX COMPLETE - Services should be working now!${NC}"
echo -e "${BLUE}═══════════════════════════════════════════════════════════════${NC}"
echo ""
echo -e "${YELLOW}Troubleshooting:${NC}"
echo -e "  • If code-server still has errors, check volume ownership:"
echo -e "    sudo ls -la \$(docker volume inspect code_server_data --format '{{ .Mountpoint }}')"
echo -e ""
echo -e "  • If VNC login fails, verify VNC_PASSWORD is set in .env file"
echo -e "    and rebuild: docker-compose -f docker-compose.unified.yml up -d --build vnc-desktop"
echo ""
