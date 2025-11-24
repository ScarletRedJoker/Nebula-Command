#!/bin/bash

# Fix critical issues found in deep integration tests

RED='\033[0;31m'
GREEN='\033[0;32m'
YELLOW='\033[1;33m'
BLUE='\033[0;34m'
NC='\033[0m'

echo -e "${BLUE}╔══════════════════════════════════════════════════╗${NC}"
echo -e "${BLUE}║          CRITICAL ISSUE DIAGNOSIS & FIX          ║${NC}"
echo -e "${BLUE}╚══════════════════════════════════════════════════╝${NC}"
echo ""

section() {
    echo ""
    echo -e "${BLUE}━━━ $1 ━━━${NC}"
}

# Issue 1: Stream-Bot Network Connectivity
section "Issue 1: Stream-Bot → Dashboard Network Connectivity"
echo "Testing DNS resolution..."

DNS_TEST=$(docker exec stream-bot getent hosts homelab-dashboard 2>/dev/null)
if [ $? -eq 0 ]; then
    IP=$(echo "$DNS_TEST" | awk '{print $1}')
    echo -e "${GREEN}✓${NC} DNS works: homelab-dashboard → $IP"
else
    echo -e "${RED}✗${NC} DNS resolution failed"
    echo "Stream-bot cannot resolve homelab-dashboard hostname"
    exit 1
fi

echo ""
echo "Testing HTTP connectivity via hostname..."
HTTP_HOSTNAME=$(docker exec stream-bot curl -s --max-time 3 http://homelab-dashboard:5001/health 2>&1)
if [ $? -eq 0 ]; then
    echo -e "${GREEN}✓${NC} HTTP via hostname works"
else
    echo -e "${RED}✗${NC} HTTP via hostname FAILED"
    echo "Response: $HTTP_HOSTNAME"
fi

echo ""
echo "Testing HTTP connectivity via IP address..."
HTTP_IP=$(docker exec stream-bot curl -s --max-time 3 http://$IP:5001/health 2>&1)
if [ $? -eq 0 ]; then
    echo -e "${GREEN}✓${NC} HTTP via IP works"
    echo "Response:"
    echo "$HTTP_IP" | jq . 2>/dev/null || echo "$HTTP_IP"
else
    echo -e "${RED}✗${NC} HTTP via IP FAILED"
    echo "Response: $HTTP_IP"
fi

echo ""
echo "Checking dashboard port binding..."
docker port homelab-dashboard

echo ""
echo "Checking if dashboard is listening on port 5001..."
docker exec homelab-dashboard netstat -tlnp 2>/dev/null | grep 5001 || \
    echo -e "${YELLOW}⚠${NC} netstat not available in container"

echo ""
echo "Checking dashboard environment variables..."
docker exec homelab-dashboard env | grep -E "PORT|HOST|BIND" || \
    echo -e "${YELLOW}⚠${NC} No PORT/HOST/BIND env vars found"

echo ""
echo "Checking dashboard process..."
docker exec homelab-dashboard ps aux | grep -E "gunicorn|flask|python"

section "Issue 2: Dashboard Port Configuration"
echo "Checking docker-compose.yml port configuration..."
grep -A5 "homelab-dashboard:" docker-compose.yml | grep -E "ports|expose"

echo ""
echo "Recommended fix for dashboard connectivity:"
echo ""
echo -e "${YELLOW}1. Dashboard should bind to 0.0.0.0:5001 (not 127.0.0.1)${NC}"
echo -e "${YELLOW}2. Docker-compose should expose port 5001 internally${NC}"
echo -e "${YELLOW}3. Check dashboard startup command in docker-compose.yml${NC}"

section "Issue 3: Database Schema - Artifact Type Column"
echo "Checking if artifacts table has artifact_type column..."

ARTIFACT_SCHEMA=$(docker exec homelab-postgres psql -U homelab -d homelab_dashboard -c "\d artifacts" 2>&1)
if echo "$ARTIFACT_SCHEMA" | grep -q "artifact_type"; then
    echo -e "${GREEN}✓${NC} artifact_type column exists"
else
    echo -e "${RED}✗${NC} artifact_type column MISSING"
    echo ""
    echo "Current artifacts table schema:"
    echo "$ARTIFACT_SCHEMA"
    echo ""
    echo -e "${YELLOW}Recommended: Add migration to create artifact_type column${NC}"
fi

section "Issue 4: CSRF Protection for API Endpoints"
echo "Checking CSRF configuration..."

if grep -q "CSRFProtect" services/dashboard/app.py; then
    echo -e "${GREEN}✓${NC} CSRF protection enabled globally"
    echo ""
    echo -e "${YELLOW}Note: API endpoints that accept POST need CSRF exemption${NC}"
    echo -e "${YELLOW}      or clients must pass CSRF tokens${NC}"
else
    echo -e "${YELLOW}⚠${NC} CSRF protection status unclear"
fi

section "Summary of Findings"
echo ""
echo "Critical Issues:"
echo "  1. Stream-Bot cannot reach Dashboard via HTTP"
echo "     - DNS resolution: OK"
echo "     - HTTP connectivity: FAILED"
echo "     - Likely cause: Dashboard not binding to 0.0.0.0 or wrong port"
echo ""
echo "  2. Artifact model missing 'artifact_type' column"
echo "     - facts_routes.py expects this column"
echo "     - Database migration needed"
echo ""
echo "  3. CSRF tokens required for POST API requests"
echo "     - AI chat, facts generation failing with CSRF error"
echo "     - Need to exempt API routes or implement token passing"
echo ""

section "Recommended Actions"
echo ""
echo "1. Fix dashboard binding:"
echo "   - Check services/dashboard/Dockerfile CMD"
echo "   - Ensure gunicorn binds to 0.0.0.0:5001"
echo "   - Restart containers: docker-compose restart homelab-dashboard"
echo ""
echo "2. Add artifact_type column:"
echo "   - Create migration: alembic revision -m 'add_artifact_type'"
echo "   - Add column: artifact_type VARCHAR(50)"
echo "   - Run migration: alembic upgrade head"
echo ""
echo "3. Exempt API routes from CSRF:"
echo "   - Add @csrf.exempt decorator to API blueprint"
echo "   - Or configure CSRFProtect to skip /api/* routes"
echo ""
