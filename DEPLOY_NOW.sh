#!/bin/bash

# Complete deployment script for all critical fixes
# Run this on your Ubuntu server to deploy all fixes

set -e

RED='\033[0;31m'
GREEN='\033[0;32m'
YELLOW='\033[1;33m'
BLUE='\033[0;34m'
NC='\033[0m'

echo -e "${BLUE}╔══════════════════════════════════════════════════╗${NC}"
echo -e "${BLUE}║     DEPLOYING CRITICAL FIXES TO PRODUCTION       ║${NC}"
echo -e "${BLUE}╚══════════════════════════════════════════════════╝${NC}"
echo ""

# Step 1: Pull latest code
echo -e "${BLUE}Step 1: Pulling latest code from GitHub...${NC}"
git pull origin main
echo -e "${GREEN}✓${NC} Code updated"
echo ""

# Step 2: Run database migration
echo -e "${BLUE}Step 2: Running database migration...${NC}"
cd services/dashboard
python3 add_artifact_columns.py
if [ $? -eq 0 ]; then
    echo -e "${GREEN}✓${NC} Migration successful"
else
    echo -e "${RED}✗${NC} Migration failed - check error above"
    exit 1
fi
cd ../..
echo ""

# Step 3: Restart services
echo -e "${BLUE}Step 3: Restarting Docker services...${NC}"
docker-compose restart homelab-dashboard stream-bot
echo -e "${GREEN}✓${NC} Services restarted"
echo ""

# Step 4: Wait for services to be ready
echo -e "${BLUE}Step 4: Waiting for services to start...${NC}"
sleep 10
echo -e "${GREEN}✓${NC} Services should be ready"
echo ""

# Step 5: Run quick verification
echo -e "${BLUE}Step 5: Running quick verification...${NC}"
echo ""

# Check dashboard health
if curl -s --max-time 5 https://host.evindrake.net/health >/dev/null 2>&1; then
    echo -e "${GREEN}✓${NC} Dashboard is responding"
else
    echo -e "${YELLOW}⚠${NC} Dashboard not responding (may need more time)"
fi

# Check stream-bot health
if curl -s --max-time 5 https://stream.rig-city.com/health >/dev/null 2>&1; then
    echo -e "${GREEN}✓${NC} Stream-bot is responding"
else
    echo -e "${YELLOW}⚠${NC} Stream-bot not responding (may need more time)"
fi

# Check discord-bot health
if curl -s --max-time 5 https://bot.rig-city.com/health >/dev/null 2>&1; then
    echo -e "${GREEN}✓${NC} Discord-bot is responding"
else
    echo -e "${YELLOW}⚠${NC} Discord-bot not responding (may need more time)"
fi

echo ""
echo -e "${BLUE}━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━${NC}"
echo -e "${GREEN}🎉 DEPLOYMENT COMPLETE!${NC}"
echo -e "${BLUE}━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━${NC}"
echo ""
echo "Next steps:"
echo "1. Run comprehensive tests:"
echo "   ./FULL_AUTHENTICATED_TEST.sh"
echo "   ./DEEP_INTEGRATION_TEST.sh"
echo ""
echo "2. Verify fixes:"
echo "   - Jarvis AI chat should work"
echo "   - Facts API should return data"
echo "   - Stream-bot can reach dashboard"
echo ""
echo "3. Check logs if needed:"
echo "   ./homelab logs"
echo ""
