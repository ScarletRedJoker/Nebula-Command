#!/bin/bash
# ============================================
# FIX COMPOSE CONFLICTS AND START SERVICES
# ============================================

set -e

GREEN='\033[0;32m'
RED='\033[0;31m'
CYAN='\033[0;36m'
NC='\033[0m'

echo -e "${CYAN}╔════════════════════════════════════════════════════════╗${NC}"
echo -e "${CYAN}║          FIXING COMPOSE AND STARTING SERVICES          ║${NC}"
echo -e "${CYAN}╚════════════════════════════════════════════════════════╝${NC}"
echo ""

cd /home/evin/contain/HomeLabHub

echo -e "${CYAN}[1/4] Stopping All Containers${NC}"
docker compose down 2>/dev/null || true
echo "✓ Stopped"
echo ""

echo -e "${CYAN}[2/4] Pulling Compose Fixes${NC}"
git pull origin main
echo "✓ Pulled latest fixes"
echo ""

echo -e "${CYAN}[3/4] Starting Services with Fixed Compose${NC}"
docker compose up -d
echo "✓ Starting services..."
echo ""

echo -e "${CYAN}[4/4] Waiting for Services to Start (30 seconds)${NC}"
sleep 30

RUNNING=$(docker ps --format "{{.Names}}" | wc -l)
echo ""
echo -e "${GREEN}✓ $RUNNING containers now running${NC}"
echo ""

echo "Services:"
docker ps --format "table {{.Names}}\t{{.Status}}" | head -20

echo ""
echo -e "${GREEN}╔════════════════════════════════════════════════════════╗${NC}"
echo -e "${GREEN}║               SERVICES STARTED SUCCESSFULLY!            ║${NC}"
echo -e "${GREEN}╚════════════════════════════════════════════════════════╝${NC}"
echo ""
echo "Now you can:"
echo "  ./homelab logs homelab-dashboard    # View logs"
echo "  ./homelab health                    # Check health"
echo "  ./homelab status                    # See what's running"
echo ""
