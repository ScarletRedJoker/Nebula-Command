#!/bin/bash
# CLEAN DEPLOY - No more discord-bot-db alias confusion
set -euo pipefail

RED='\033[0;31m'
GREEN='\033[0;32m'
YELLOW='\033[1;33m'
BOLD='\033[1m'
NC='\033[0m'

echo ""
echo "╔══════════════════════════════════════════════════════════════╗"
echo "║                                                              ║"
echo "║        🚀 CLEAN DEPLOY - homelab-postgres ONLY 🚀         ║"
echo "║                                                              ║"
echo "║  No more discord-bot-db confusion!                          ║"
echo "║                                                              ║"
echo "╚══════════════════════════════════════════════════════════════╝"
echo ""

# Load environment
if [ ! -f ".env" ]; then
    echo -e "${RED}ERROR: .env file not found${NC}"
    exit 1
fi
source .env

echo -e "${BOLD}Phase 1: Remove old discord-bot-db container${NC}"
echo "━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━"
docker stop discord-bot-db 2>/dev/null && echo "  ✓ Stopped" || echo "  • Not running"
docker rm -f discord-bot-db 2>/dev/null && echo "  ✓ Removed" || echo "  • Not found"
echo ""

echo -e "${BOLD}Phase 2: Full shutdown with volume cleanup${NC}"
echo "━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━"
docker compose -f docker-compose.unified.yml down --volumes --remove-orphans --timeout 30 2>&1 | grep -v "not found" || true
echo "  ✓ Shutdown complete"
echo ""

echo -e "${BOLD}Phase 3: Remove ALL postgres volumes${NC}"
echo "━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━"
for vol in $(docker volume ls -q | grep -E "postgres" 2>/dev/null || true); do
    echo "  Removing: $vol"
    docker volume rm -f "$vol" 2>/dev/null || true
done
echo "  ✓ All postgres volumes removed"
echo ""

echo -e "${BOLD}Phase 4: Start homelab-postgres${NC}"
echo "━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━"
docker compose -f docker-compose.unified.yml up -d homelab-postgres

echo "Waiting for PostgreSQL..."
for i in {1..15}; do
    sleep 3
    if docker exec homelab-postgres psql -U postgres -c "SELECT 1;" >/dev/null 2>&1; then
        echo -e "${GREEN}✓ PostgreSQL ready${NC}"
        break
    fi
    if docker logs homelab-postgres 2>&1 | tail -3 | grep -q "PANIC\|FATAL"; then
        echo -e "${RED}ERROR: PostgreSQL crashed${NC}"
        docker logs homelab-postgres --tail 20
        exit 1
    fi
    echo "  Attempt $i/15..."
done
echo ""

echo -e "${BOLD}Phase 5: Create databases${NC}"
echo "━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━"
for DB in ticketbot streambot homelab_jarvis; do
    echo -n "  $DB... "
    docker exec homelab-postgres psql -U postgres -c "CREATE DATABASE $DB;" 2>&1 | grep -q "already exists" && echo -e "${YELLOW}exists${NC}" || echo -e "${GREEN}✓${NC}"
done
echo ""

echo -e "${BOLD}Phase 6: Start all services${NC}"
echo "━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━"
docker compose -f docker-compose.unified.yml up -d --remove-orphans
echo ""

echo "Waiting 30s for services..."
sleep 30
echo ""

echo -e "${BOLD}Phase 7: Verification${NC}"
echo "━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━"
RUNNING=$(docker ps --filter "name=homelab-|discord-bot|stream-bot|caddy|plex|n8n|vnc|code-server|homeassistant|rig-city|scarletredjoker" | tail -n +2 | wc -l)

docker ps --format "table {{.Names}}\t{{.Status}}" | head -20

echo ""
echo -e "${BOLD}Running: $RUNNING/15${NC}"
echo ""

if [ $RUNNING -eq 15 ]; then
    echo "╔══════════════════════════════════════════════════════════════╗"
    echo "║        ✅ SUCCESS - ALL 15 SERVICES RUNNING              ║"
    echo "╚══════════════════════════════════════════════════════════════╝"
    echo ""
    echo -e "${GREEN}${BOLD}Using homelab-postgres (no more discord-bot-db!)${NC}"
    echo ""
    echo "URLs:"
    echo "  • Dashboard:  https://host.evindrake.net"
    echo "  • Stream Bot: https://stream.rig-city.com"
    echo "  • Discord:    https://bot.rig-city.com"
    echo "  • VNC:        https://vnc.evindrake.net"
else
    echo "⚠ Only $RUNNING/15 running"
    echo ""
    for svc in homelab-dashboard discord-bot stream-bot homelab-celery-worker; do
        if ! docker ps | grep -q "$svc"; then
            echo ""
            echo "$svc logs:"
            docker logs $svc --tail 20 2>&1 || true
        fi
    done
fi
echo ""
