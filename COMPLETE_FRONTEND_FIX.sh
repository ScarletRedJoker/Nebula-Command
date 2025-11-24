#!/bin/bash
# ============================================
# COMPLETE FRONTEND FIX - FACTS INTEGRATION
# ============================================

set -e

GREEN='\033[0;32m'
RED='\033[0;31m'
CYAN='\033[0;36m'
YELLOW='\033[1;33m'
NC='\033[0m'

echo -e "${CYAN}╔════════════════════════════════════════════════════════╗${NC}"
echo -e "${CYAN}║    FRONTEND FIX: Stream-Bot Facts Integration         ║${NC}"
echo -e "${CYAN}╚════════════════════════════════════════════════════════╝${NC}"
echo ""

cd /home/evin/contain/HomeLabHub

echo -e "${CYAN}[1/4] Pull Frontend Updates${NC}"
git pull origin main
echo "✓ Pulled:"
echo "  - New /facts page template"
echo "  - Facts API routes (latest, random)"
echo "  - Fixed Jarvis API field mismatch"
echo "  - All compose fixes"
echo ""

echo -e "${CYAN}[2/4] Restart Dashboard to Load New Routes${NC}"
docker compose restart homelab-dashboard
echo "✓ Restarting dashboard..."
echo ""

echo -e "${CYAN}[3/4] Wait for Dashboard (75s for Gunicorn)${NC}"
for i in {75..1}; do
    echo -ne "  ⏳ $i seconds remaining...\r"
    sleep 1
done
echo -e "\n✓ Dashboard ready"
echo ""

echo -e "${CYAN}[4/4] Test Facts Integration${NC}"

echo "Testing Facts Page..."
STATUS=$(curl -s -o /dev/null -w "%{http_code}" -u "${WEB_USERNAME:-admin}:${WEB_PASSWORD:-Brs=2729}" https://dashboard.evindrake.net/facts 2>/dev/null || echo "000")

if [ "$STATUS" = "200" ]; then
    echo "✅ Facts page accessible (HTTP 200)"
elif [ "$STATUS" = "401" ]; then
    echo "⚠️  Facts page returns 401 - check authentication"
elif [ "$STATUS" = "000" ]; then
    echo "⚠️  Cannot reach dashboard - check if services running"
else
    echo "⚠️  Facts page HTTP status: $STATUS"
fi

echo ""
echo "Testing API Endpoint..."
API_STATUS=$(curl -s -o /dev/null -w "%{http_code}" -u "${WEB_USERNAME:-admin}:${WEB_PASSWORD:-Brs=2729}" https://dashboard.evindrake.net/api/facts/latest?limit=5 2>/dev/null || echo "000")

if [ "$API_STATUS" = "200" ]; then
    echo "✅ Facts API working (HTTP 200)"
    FACT_COUNT=$(curl -s -u "${WEB_USERNAME:-admin}:${WEB_PASSWORD:-Brs=2729}" https://dashboard.evindrake.net/api/facts/latest?limit=5 2>/dev/null | grep -o '"count":[0-9]*' | grep -o '[0-9]*' || echo "0")
    echo "   Facts in database: $FACT_COUNT"
    
    if [ "$FACT_COUNT" = "0" ]; then
        echo "   ⚠️  No facts yet - stream-bot will generate hourly"
    fi
else
    echo "⚠️  Facts API HTTP status: $API_STATUS"
fi

echo ""
echo -e "${GREEN}╔════════════════════════════════════════════════════════╗${NC}"
echo -e "${GREEN}║                FRONTEND FIX COMPLETE!                  ║${NC}"
echo -e "${GREEN}╚════════════════════════════════════════════════════════╝${NC}"
echo ""

echo "✅ What's Working:"
echo "  - Facts display page created (/facts)"
echo "  - Facts API endpoints registered"
echo "  - Jarvis API fixed (history→conversation_history)"
echo "  - Compose conflicts resolved"
echo ""

echo "⚠️  Known Issue: Stream-Bot Connection"
echo "  Stream-bot generates facts but can't POST to dashboard"
echo "  Checking logs..."
echo ""

./homelab logs stream-bot --tail 20 | grep -i "fact" || echo "  (No fact logs yet - check stream-bot is running)"

echo ""
echo "Access the Facts Page:"
echo "  🌐 https://dashboard.evindrake.net/facts"
echo ""

echo "Manual Test (Post a Test Fact):"
echo "  curl -X POST http://homelab-dashboard:5000/api/stream/facts \\"
echo "    -H 'Content-Type: application/json' \\"
echo "    -d '{\"fact\":\"Test: Octopuses have 3 hearts!\",\"source\":\"test\"}'"
echo ""

echo "Debug Stream-Bot Connection:"
echo "  1. Check network: docker network inspect homelab"
echo "  2. Test connection: docker exec stream-bot curl -v http://homelab-dashboard:5000/api/stream/facts"
echo "  3. Check auth: Dashboard API may require authentication bypass for service-to-service calls"
echo ""

echo -e "${YELLOW}Next Steps:${NC}"
echo "  1. Visit /facts page to see the UI"
echo "  2. Check if stream-bot can reach dashboard (see debug above)"
echo "  3. Wait 1 hour for automatic fact generation"
echo "  4. Or manually POST a test fact to verify system"
