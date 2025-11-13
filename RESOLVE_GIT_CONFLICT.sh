#!/bin/bash

set -e

echo "============================================"
echo "  Git Conflict Resolution + Deployment"
echo "============================================"
echo ""

# Colors
RED='\033[0;31m'
GREEN='\033[0;32m'
YELLOW='\033[1;33m'
BLUE='\033[0;34m'
NC='\033[0m'

cd /home/evin/contain/HomeLabHub || {
    echo -e "${RED}ERROR: Project directory not found${NC}"
    exit 1
}

echo -e "${YELLOW}Current situation:${NC}"
echo "  - Local changes to: docker-compose.unified.yml"
echo "  - Untracked files conflict with incoming changes"
echo ""
echo "Solution: Stash local changes, pull updates, then re-apply"
echo ""

read -p "Continue? (y/n) " -n 1 -r
echo ""
if [[ ! $REPLY =~ ^[Yy]$ ]]; then
    echo "Aborted."
    exit 1
fi

echo -e "${BLUE}Step 1: Backing up your local changes...${NC}"
git stash push -u -m "Backup before sync - $(date +%Y%m%d_%H%M%S)"

if [ $? -eq 0 ]; then
    echo -e "${GREEN}✓ Local changes backed up${NC}"
else
    echo -e "${RED}✗ Failed to backup changes${NC}"
    exit 1
fi
echo ""

echo -e "${BLUE}Step 2: Pulling latest code from GitHub...${NC}"
git pull origin main

if [ $? -eq 0 ]; then
    echo -e "${GREEN}✓ Code synced successfully${NC}"
else
    echo -e "${RED}✗ Failed to pull code${NC}"
    echo "Restoring your backup..."
    git stash pop
    exit 1
fi
echo ""

echo -e "${BLUE}Step 3: Checking your stashed changes...${NC}"
echo "Your local changes are saved in git stash."
echo ""
echo "What would you like to do?"
echo "  1) Keep GitHub version (discard my local changes)"
echo "  2) Re-apply my local changes on top of GitHub version"
echo "  3) Keep backup for manual merge later"
echo ""
read -p "Choose (1/2/3): " choice

case $choice in
    1)
        echo -e "${YELLOW}Keeping GitHub version, discarding local changes${NC}"
        git stash drop
        echo -e "${GREEN}✓ Local changes discarded${NC}"
        ;;
    2)
        echo -e "${YELLOW}Re-applying your local changes...${NC}"
        git stash pop
        if [ $? -eq 0 ]; then
            echo -e "${GREEN}✓ Local changes re-applied${NC}"
            echo ""
            echo -e "${YELLOW}NOTE: You may have merge conflicts to resolve manually${NC}"
            echo "Check: git status"
        else
            echo -e "${RED}✗ Merge conflicts detected${NC}"
            echo "Please resolve manually, then run:"
            echo "  git add <resolved-files>"
            echo "  git stash drop"
        fi
        ;;
    3)
        echo -e "${GREEN}✓ Backup kept in git stash${NC}"
        echo "To view later: git stash list"
        echo "To apply later: git stash pop"
        ;;
    *)
        echo -e "${YELLOW}Invalid choice, keeping backup in stash${NC}"
        ;;
esac
echo ""

echo -e "${BLUE}Step 4: Checking environment variables...${NC}"
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
    read -p "Press Enter to edit .env now, or Ctrl+C to skip..."
    nano .env
fi

echo -e "${GREEN}✓ Environment variables checked${NC}"
echo ""

echo -e "${BLUE}Step 5: Deploying all services...${NC}"
echo ""

echo "Restarting Caddy (apply cache fix)..."
docker compose -f docker-compose.unified.yml restart caddy
echo -e "${GREEN}✓ Caddy restarted${NC}"
echo ""

echo "Rebuilding VNC Desktop (this takes 10-15 minutes)..."
docker stop vnc-desktop 2>/dev/null || true
docker rm vnc-desktop 2>/dev/null || true
docker compose -f docker-compose.unified.yml build --no-cache vnc-desktop
docker compose -f docker-compose.unified.yml up -d vnc-desktop
echo -e "${GREEN}✓ VNC Desktop rebuilt and started${NC}"
echo ""

echo "Restarting Dashboard..."
docker compose -f docker-compose.unified.yml restart homelab-dashboard
echo -e "${GREEN}✓ Dashboard restarted${NC}"
echo ""

echo -e "${BLUE}Step 6: Verifying services...${NC}"
sleep 5
docker compose -f docker-compose.unified.yml ps
echo ""

echo "============================================"
echo -e "${GREEN}  Deployment Complete!${NC}"
echo "============================================"
echo ""
echo "Next steps:"
echo "  1. Clear browser cache (F12 → Right-click refresh → Empty Cache)"
echo ""
echo "  2. Test these URLs:"
echo "     https://host.evindrake.net/dashboard (Mission Control)"
echo "     https://host.evindrake.net/system (System Diagnostics)"
echo "     https://game.evindrake.net (Game Streaming)"
echo "     https://vnc.evindrake.net (VNC Desktop with VLC + Steam)"
echo ""
echo "  3. In VNC Desktop:"
echo "     - Double-click VLC icon on desktop"
echo "     - Check Games menu for Steam"
echo ""
echo "Documentation:"
echo "  - QUICK_DEPLOY.md (deployment guide)"
echo "  - URGENT_FIXES.md (troubleshooting)"
echo "  - docs/WINAPPS_STREAMING.md (Adobe streaming)"
echo "  - services/vnc-desktop/FIX_VLC.md (VLC help)"
echo ""
echo "============================================"
