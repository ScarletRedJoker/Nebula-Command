#!/bin/bash

set -e

echo "============================================"
echo "  HomeLabHub - Complete Deployment"
echo "  Sync from Replit + Deploy All Fixes"
echo "============================================"
echo ""

# Colors for output
RED='\033[0;31m'
GREEN='\033[0;32m'
YELLOW='\033[1;33m'
BLUE='\033[0;34m'
NC='\033[0m' # No Color

# Change to project directory
cd /home/evin/contain/HomeLabHub || {
    echo -e "${RED}ERROR: Project directory not found${NC}"
    exit 1
}

echo -e "${BLUE}Step 1: Syncing latest code from Replit/GitHub...${NC}"
git fetch origin
git pull origin main

if [ $? -eq 0 ]; then
    echo -e "${GREEN}✓ Code synced successfully${NC}"
else
    echo -e "${RED}✗ Failed to sync code${NC}"
    exit 1
fi
echo ""

echo -e "${BLUE}Step 2: Checking environment variables...${NC}"
if [ ! -f .env ]; then
    echo -e "${YELLOW}WARNING: .env file not found!${NC}"
    echo "Creating .env from template..."
    cp .env.example .env 2>/dev/null || touch .env
fi

# Check for required credentials
if ! grep -q "WEB_USERNAME=" .env || ! grep -q "WEB_PASSWORD=" .env; then
    echo -e "${YELLOW}WARNING: Dashboard credentials not set!${NC}"
    echo ""
    echo "The dashboard requires WEB_USERNAME and WEB_PASSWORD."
    echo "Please add them to your .env file:"
    echo ""
    echo "WEB_USERNAME=your_username"
    echo "WEB_PASSWORD=your_secure_password"
    echo ""
    read -p "Press Enter to edit .env now, or Ctrl+C to cancel..."
    nano .env
fi

echo -e "${GREEN}✓ Environment variables checked${NC}"
echo ""

echo -e "${BLUE}Step 3: Restarting Caddy (apply cache fix)...${NC}"
docker compose -f docker-compose.unified.yml restart caddy

if [ $? -eq 0 ]; then
    echo -e "${GREEN}✓ Caddy restarted with no-cache headers${NC}"
else
    echo -e "${YELLOW}⚠ Caddy restart had issues (check logs)${NC}"
fi
echo ""

echo -e "${BLUE}Step 4: Rebuilding VNC Desktop (VLC + Steam + 30+ apps)...${NC}"
echo "This will take 10-15 minutes..."

# Stop and remove existing VNC container
docker stop vnc-desktop 2>/dev/null || true
docker rm vnc-desktop 2>/dev/null || true

# Rebuild with all fixes
docker compose -f docker-compose.unified.yml build --no-cache vnc-desktop

if [ $? -eq 0 ]; then
    echo -e "${GREEN}✓ VNC Desktop rebuilt successfully${NC}"
else
    echo -e "${RED}✗ VNC Desktop build failed${NC}"
    exit 1
fi

# Start VNC desktop
docker compose -f docker-compose.unified.yml up -d vnc-desktop

if [ $? -eq 0 ]; then
    echo -e "${GREEN}✓ VNC Desktop started${NC}"
else
    echo -e "${RED}✗ Failed to start VNC Desktop${NC}"
    exit 1
fi
echo ""

echo -e "${BLUE}Step 5: Restarting Dashboard (apply security fixes)...${NC}"
docker compose -f docker-compose.unified.yml restart homelab-dashboard

if [ $? -eq 0 ]; then
    echo -e "${GREEN}✓ Dashboard restarted${NC}"
else
    echo -e "${YELLOW}⚠ Dashboard restart had issues (check logs)${NC}"
fi
echo ""

echo -e "${BLUE}Step 6: Verifying all services...${NC}"
sleep 5  # Give services time to start

# Check service status
echo "Checking service health..."
docker compose -f docker-compose.unified.yml ps

echo ""
echo -e "${BLUE}Step 7: Running health checks...${NC}"

# Test dashboard
if curl -f -s http://localhost:5000/dashboard > /dev/null; then
    echo -e "${GREEN}✓ Dashboard responding${NC}"
else
    echo -e "${YELLOW}⚠ Dashboard not responding (may be starting)${NC}"
fi

# Test VNC
if curl -f -s http://localhost:6079 > /dev/null; then
    echo -e "${GREEN}✓ VNC Desktop responding${NC}"
else
    echo -e "${YELLOW}⚠ VNC Desktop not responding (may be building)${NC}"
fi

# Test Caddy
if curl -f -s http://localhost:2019/metrics > /dev/null; then
    echo -e "${GREEN}✓ Caddy responding${NC}"
else
    echo -e "${YELLOW}⚠ Caddy not responding${NC}"
fi

echo ""
echo "============================================"
echo -e "${GREEN}  Deployment Complete!${NC}"
echo "============================================"
echo ""
echo "What was deployed:"
echo "  ✓ Caching fix (Caddyfile headers)"
echo "  ✓ VLC fix (hardware acceleration disabled)"
echo "  ✓ Steam installation (Games menu)"
echo "  ✓ 30+ new apps (OBS, Audacity, GIMP, etc.)"
echo "  ✓ Security fix (mandatory dashboard credentials)"
echo ""
echo "Next steps:"
echo "  1. Visit https://host.evindrake.net"
echo "     - Login with your .env credentials"
echo "     - Dashboard and System pages should be DIFFERENT now"
echo ""
echo "  2. Visit https://game.evindrake.net"
echo "     - Should show game streaming connection guide"
echo ""
echo "  3. Visit https://vnc.evindrake.net"
echo "     - Check Desktop for VLC icon"
echo "     - Check Games menu for Steam"
echo "     - Try opening VLC - should work!"
echo ""
echo "  4. IMPORTANT: Clear browser cache!"
echo "     - F12 → Right-click refresh → 'Empty Cache and Hard Reload'"
echo ""
echo "Troubleshooting:"
echo "  - View logs: docker logs <service-name> --tail 50"
echo "  - Check all services: docker compose -f docker-compose.unified.yml ps"
echo "  - See URGENT_FIXES.md for detailed troubleshooting"
echo ""
echo "Documentation created:"
echo "  - URGENT_FIXES.md (deployment & troubleshooting)"
echo "  - docs/WINAPPS_STREAMING.md (Adobe Creative Cloud streaming)"
echo "  - services/vnc-desktop/FIX_VLC.md (VLC troubleshooting)"
echo "  - docs/IMPROVEMENT_PLAN.md (future enhancements)"
echo ""
echo "============================================"
