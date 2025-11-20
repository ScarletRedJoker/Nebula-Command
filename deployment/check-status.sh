#!/bin/bash
# Quick status check
set -euo pipefail

GREEN='\033[0;32m'
RED='\033[0;31m'
YELLOW='\033[1;33m'
BOLD='\033[1m'
NC='\033[0m'

echo ""
echo "╔══════════════════════════════════════════════════════════════╗"
echo "║     📊 QUICK STATUS CHECK                                 ║"
echo "╚══════════════════════════════════════════════════════════════╝"
echo ""

echo -e "${BOLD}Container Status:${NC}"
docker ps -a --format "table {{.Names}}\t{{.Status}}" | grep -E "homelab-|discord-bot|stream-bot|caddy|Names"

echo ""
echo -e "${BOLD}Service URLs to Test:${NC}"
echo "  Dashboard: https://host.evindrake.net"
echo "  Stream Bot: https://stream.rig-city.com"  
echo "  Discord Bot: https://bot.rig-city.com"

echo ""
echo -e "${BOLD}Quick Log Check (last 5 lines each):${NC}"
echo "━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━"

echo ""
echo -e "${YELLOW}stream-bot:${NC}"
docker logs stream-bot --tail 5 2>&1 | grep -v "^$" || echo "Not running or no recent logs"

echo ""
echo -e "${YELLOW}discord-bot:${NC}"
docker logs discord-bot --tail 5 2>&1 | grep -v "^$" || echo "Not running or no recent logs"

echo ""
echo -e "${YELLOW}homelab-dashboard:${NC}"
docker logs homelab-dashboard --tail 5 2>&1 | grep -v "^$" || echo "Not running or no recent logs"

echo ""
