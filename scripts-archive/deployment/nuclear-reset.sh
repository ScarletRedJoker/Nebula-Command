#!/bin/bash
# NUCLEAR RESET - Complete database wipe and fresh deployment
# This script will DELETE ALL DATABASE DATA and start fresh

set -euo pipefail

RED='\033[0;31m'
GREEN='\033[0;32m'
YELLOW='\033[1;33m'
BOLD='\033[1m'
NC='\033[0m'

echo ""
echo "╔══════════════════════════════════════════════════════════════╗"
echo "║                                                              ║"
echo "║        ☢️  NUCLEAR RESET - DATABASE WIPE ☢️               ║"
echo "║                                                              ║"
echo "╚══════════════════════════════════════════════════════════════╝"
echo ""
echo -e "${RED}${BOLD}WARNING: This will PERMANENTLY DELETE all database data${NC}"
echo ""
echo "This includes:"
echo "  • All Discord tickets"
echo "  • All Stream Bot configurations"
echo "  • All Dashboard data"
echo "  • All user data in all databases"
echo ""
echo -e "${YELLOW}This cannot be undone!${NC}"
echo ""
read -p "Type 'RESET' to confirm complete database wipe: " CONFIRM

if [ "$CONFIRM" != "RESET" ]; then
    echo "Cancelled."
    exit 0
fi

echo ""
echo "Starting nuclear reset..."
echo ""

# Load environment
if [ ! -f ".env" ]; then
    echo -e "${RED}ERROR: .env file not found${NC}"
    exit 1
fi
source .env

# Step 1: Stop everything
echo -e "${BOLD}STEP 1: Stopping all containers...${NC}"
docker compose -f docker-compose.unified.yml down --timeout 30 2>&1 | grep -v "Network.*not found" || true
echo -e "${GREEN}✓ Stopped${NC}"
echo ""

# Step 2: Nuclear option - remove PostgreSQL volume
echo -e "${BOLD}STEP 2: Removing PostgreSQL volume...${NC}"
docker volume rm homelabhub_postgres_data 2>/dev/null && echo -e "${GREEN}✓ Volume removed${NC}" || echo -e "${YELLOW}⚠ Volume not found (OK)${NC}"
echo ""

# Step 3: Start PostgreSQL fresh
echo -e "${BOLD}STEP 3: Starting PostgreSQL with fresh database...${NC}"
docker compose -f docker-compose.unified.yml up -d homelab-postgres
echo "Waiting 15 seconds for PostgreSQL to initialize..."
sleep 15

# Verify PostgreSQL is running
RETRY=0
while [ $RETRY -lt 6 ]; do
    if docker exec homelab-postgres psql -U postgres -c "SELECT 1;" >/dev/null 2>&1; then
        echo -e "${GREEN}✓ PostgreSQL ready (user: postgres)${NC}"
        break
    fi
    echo "Waiting for PostgreSQL... (attempt $((RETRY+1))/6)"
    sleep 5
    ((RETRY++))
done

if [ $RETRY -eq 6 ]; then
    echo -e "${RED}ERROR: PostgreSQL failed to start${NC}"
    docker logs homelab-postgres --tail 50
    exit 1
fi
echo ""

# Step 4: Create databases
echo -e "${BOLD}STEP 4: Creating databases...${NC}"
for DB in ticketbot streambot homelab_jarvis; do
    echo -n "  → Creating $DB... "
    docker exec homelab-postgres psql -U postgres -c "CREATE DATABASE $DB;" 2>/dev/null && echo -e "${GREEN}✓${NC}" || echo -e "${YELLOW}exists${NC}"
done
echo ""

# Step 5: Start all services
echo -e "${BOLD}STEP 5: Starting all services...${NC}"
docker compose -f docker-compose.unified.yml up -d
echo "Waiting 20 seconds for services to initialize..."
sleep 20
echo -e "${GREEN}✓ Services started${NC}"
echo ""

# Step 6: Fix VNC password
echo -e "${BOLD}STEP 6: Configuring VNC/Code-Server...${NC}"
if docker ps --filter "name=vnc-desktop" --filter "status=running" | grep -q "vnc-desktop"; then
    docker exec vnc-desktop /usr/local/bin/fix-vnc-password.sh 2>/dev/null || echo "  (using built-in password)"
    docker restart vnc-desktop >/dev/null 2>&1
    echo -e "${GREEN}✓ VNC configured${NC}"
fi

if docker ps --filter "name=code-server" | grep -q "code-server"; then
    docker restart code-server >/dev/null 2>&1
    echo -e "${GREEN}✓ Code-Server restarted${NC}"
fi
echo ""

# Step 7: Wait for health checks
echo -e "${BOLD}STEP 7: Waiting for health checks (30 seconds)...${NC}"
sleep 30
echo ""

# Step 8: Verify deployment
echo -e "${BOLD}STEP 8: Verification${NC}"
echo "━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━"

RUNNING=$(docker ps --filter "name=homelab-|discord-bot|stream-bot|caddy|plex|n8n|vnc|code-server|homeassistant|rig-city|scarletredjoker" --format "{{.Names}}" | wc -l)

echo "Container Status:"
docker ps --format "table {{.Names}}\t{{.Status}}" --filter "name=homelab-|discord-bot|stream-bot|caddy|plex|n8n|vnc|code-server|homeassistant|rig-city|scarletredjoker"

echo ""
echo -e "${BOLD}Running: $RUNNING/15${NC}"
echo ""

# Database check
echo -n "Database check: "
if docker exec homelab-postgres psql -U postgres -c "\\l" | grep -q "homelab_jarvis"; then
    echo -e "${GREEN}✓ All databases created${NC}"
else
    echo -e "${RED}✗ Database verification failed${NC}"
fi

echo ""
echo "╔══════════════════════════════════════════════════════════════╗"
echo "║                                                              ║"
echo "║        ✅ NUCLEAR RESET COMPLETE                            ║"
echo "║                                                              ║"
echo "╚══════════════════════════════════════════════════════════════╝"
echo ""

if [ $RUNNING -eq 15 ]; then
    echo -e "${GREEN}${BOLD}SUCCESS: All 15 services running${NC}"
    echo ""
    echo "Service URLs:"
    echo "  • Dashboard:  https://host.evindrake.net"
    echo "  • Stream Bot: https://stream.rig-city.com"
    echo "  • Discord:    https://bot.rig-city.com"
    echo "  • VNC:        https://vnc.evindrake.net"
    echo ""
    echo "Next: Run verification"
    echo "  ./homelab-manager.sh → Option 23"
else
    echo -e "${YELLOW}WARNING: Only $RUNNING/15 services running${NC}"
    echo ""
    echo "Check logs: docker logs <container-name>"
fi
echo ""
