#!/bin/bash

# =============================================================================
# Site Restoration Script
# Fixes: game.evindrake.net, test.evindrake.net, rig-city.com
# =============================================================================

set -e

echo "=========================================="
echo "  SITE RESTORATION IN PROGRESS"
echo "=========================================="
echo ""

# Colors for output
RED='\033[0;31m'
GREEN='\033[0;32m'
YELLOW='\033[1;33m'
NC='\033[0m' # No Color

# Change to project directory
cd /home/evin/contain/HomeLabHub || { echo -e "${RED}✗ Cannot find HomeLabHub directory${NC}"; exit 1; }

# Set compose project name for production
export COMPOSE_PROJECT_NAME=homelabhub

# Detect Caddy container name
CADDY_CONTAINER=$(docker ps --filter "name=caddy" --format "{{.Names}}" | head -1)
if [ -z "$CADDY_CONTAINER" ]; then
    echo -e "${RED}✗ Cannot find Caddy container${NC}"
    exit 1
fi
echo "Using Caddy container: $CADDY_CONTAINER"

echo ""
echo -e "${YELLOW}1. Validating Caddyfile...${NC}"
if docker exec "$CADDY_CONTAINER" caddy validate --config /etc/caddy/Caddyfile 2>&1; then
    echo -e "${GREEN}✓ Caddyfile is valid${NC}"
else
    echo -e "${RED}✗ Caddyfile has errors - please check configuration${NC}"
    exit 1
fi

echo ""
echo -e "${YELLOW}2. Reloading Caddy with updated configuration...${NC}"
if docker exec "$CADDY_CONTAINER" caddy reload --config /etc/caddy/Caddyfile 2>&1; then
    echo -e "${GREEN}✓ Caddy reloaded successfully${NC}"
else
    echo -e "${RED}✗ Caddy reload failed${NC}"
    exit 1
fi

echo ""
echo -e "${YELLOW}3. Checking container status...${NC}"

# Check if rig-city-site is running
if docker ps | grep -q "rig-city-site"; then
    echo -e "${GREEN}✓ rig-city-site container is running${NC}"
else
    echo -e "${YELLOW}⚠ rig-city-site not running, starting it...${NC}"
    docker compose -f docker-compose.unified.yml up -d rig-city-site
    sleep 5
    if docker ps | grep -q "rig-city-site"; then
        echo -e "${GREEN}✓ rig-city-site started successfully${NC}"
    else
        echo -e "${RED}✗ Failed to start rig-city-site${NC}"
    fi
fi

# Check homelab-dashboard
if docker ps | grep -q "homelab-dashboard[^-]"; then
    echo -e "${GREEN}✓ homelab-dashboard container is running${NC}"
else
    echo -e "${YELLOW}⚠ homelab-dashboard not running, starting it...${NC}"
    docker compose -f docker-compose.unified.yml up -d homelab-dashboard
    sleep 10
fi

# Check homelab-dashboard-demo
if docker ps | grep -q "homelab-dashboard-demo"; then
    echo -e "${GREEN}✓ homelab-dashboard-demo container is running${NC}"
else
    echo -e "${YELLOW}⚠ homelab-dashboard-demo not running, starting it...${NC}"
    docker compose -f docker-compose.unified.yml up -d homelab-dashboard-demo
    sleep 10
fi

echo ""
echo -e "${YELLOW}4. Restarting dashboard containers to apply fixes...${NC}"
docker compose -f docker-compose.unified.yml restart homelab-dashboard homelab-dashboard-demo

echo ""
echo -e "${YELLOW}5. Waiting for services to be ready...${NC}"
sleep 15

echo ""
echo "=========================================="
echo "  TESTING SITES"
echo "=========================================="
echo ""

# Test game.evindrake.net
echo -e "${YELLOW}Testing game.evindrake.net...${NC}"
GAME_STATUS=$(curl -sL -o /tmp/game_test.html -w "%{http_code}" https://game.evindrake.net)
if [ "$GAME_STATUS" = "200" ]; then
    if grep -qi "Moonlight\|Game\|Streaming" /tmp/game_test.html 2>/dev/null; then
        echo -e "${GREEN}✓ game.evindrake.net is working - Shows Moonlight page (HTTP 200)${NC}"
    else
        echo -e "${YELLOW}⚠ game.evindrake.net returned HTTP 200 but content may be wrong${NC}"
        echo "  Check: https://game.evindrake.net"
    fi
else
    echo -e "${RED}✗ game.evindrake.net returned HTTP $GAME_STATUS${NC}"
fi

# Test test.evindrake.net
echo -e "${YELLOW}Testing test.evindrake.net (demo site)...${NC}"
TEST_STATUS=$(curl -sI -o /dev/null -w "%{http_code}" https://test.evindrake.net)
if [ "$TEST_STATUS" = "200" ] || [ "$TEST_STATUS" = "302" ]; then
    echo -e "${GREEN}✓ test.evindrake.net is accessible (HTTP $TEST_STATUS)${NC}"
    echo "  Demo credentials: demo / demo"
else
    echo -e "${RED}✗ test.evindrake.net returned HTTP $TEST_STATUS${NC}"
fi

# Test rig-city.com
echo -e "${YELLOW}Testing rig-city.com...${NC}"
RIG_STATUS=$(curl -sL -o /tmp/rig_test.html -w "%{http_code}" https://rig-city.com)
if [ "$RIG_STATUS" = "200" ]; then
    if grep -qi "RIG CITY\|Discord" /tmp/rig_test.html 2>/dev/null; then
        echo -e "${GREEN}✓ rig-city.com is working - Shows Rig City site (HTTP 200)${NC}"
    else
        echo -e "${YELLOW}⚠ rig-city.com returned HTTP 200 but content may be wrong${NC}"
    fi
else
    echo -e "${RED}✗ rig-city.com returned HTTP $RIG_STATUS${NC}"
fi

# Test host.evindrake.net/dashboard
echo -e "${YELLOW}Testing host.evindrake.net (production dashboard)...${NC}"
HOST_STATUS=$(curl -sI -o /dev/null -w "%{http_code}" https://host.evindrake.net/dashboard)
if [ "$HOST_STATUS" = "200" ] || [ "$HOST_STATUS" = "302" ]; then
    echo -e "${GREEN}✓ host.evindrake.net is accessible (HTTP $HOST_STATUS)${NC}"
    echo "  Production credentials: evin / homelab"
else
    echo -e "${RED}✗ host.evindrake.net returned HTTP $HOST_STATUS${NC}"
fi

echo ""
echo "=========================================="
echo "  SUMMARY"
echo "=========================================="
echo ""
echo "Sites to check in browser:"
echo ""
echo "  🎮 game.evindrake.net       - Moonlight Gaming Page (NO LOGIN)"
echo "  🧪 test.evindrake.net       - Demo Dashboard (demo/demo)"
echo "  🏙️  rig-city.com             - Community Site"
echo "  🏠 host.evindrake.net       - Production Dashboard (evin/homelab)"
echo ""
echo "If issues persist:"
echo "  1. Check browser cache (Ctrl+Shift+R to hard refresh)"
echo "  2. Check logs: docker compose -f docker-compose.unified.yml logs -f"
echo "  3. Check Caddy logs: docker exec caddy cat /var/log/caddy/access.log"
echo ""
echo -e "${GREEN}✓ Deployment complete!${NC}"
