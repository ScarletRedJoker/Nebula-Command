#!/bin/bash
# ============================================
# DEPLOY AND TEST NEW FEATURES
# Run this on the Ubuntu server
# ============================================

set -e

RED='\033[0;31m'
GREEN='\033[0;32m'
YELLOW='\033[1;33m'
CYAN='\033[0;36m'
NC='\033[0m'

echo -e "${CYAN}"
echo "╔════════════════════════════════════════════════════════════════╗"
echo "║          HOMELAB - DEPLOY & TEST NEW FEATURES                ║"
echo "╚════════════════════════════════════════════════════════════════╝"
echo -e "${NC}"

PROJECT_ROOT="/home/evin/contain/HomeLabHub"
cd "$PROJECT_ROOT"

# Test counter
TESTS_PASSED=0
TESTS_FAILED=0

test_feature() {
    local name=$1
    local command=$2
    
    echo -n "Testing $name... "
    if eval "$command" > /dev/null 2>&1; then
        echo -e "${GREEN}✓${NC}"
        ((TESTS_PASSED++))
        return 0
    else
        echo -e "${RED}✗${NC}"
        ((TESTS_FAILED++))
        return 1
    fi
}

echo -e "\n${CYAN}[1/6] Pulling Latest Code${NC}"
git pull origin main

echo -e "\n${CYAN}[2/6] Fixing ./homelab logs Command${NC}"
# The compose.all.yml paths were fixed, test it
./homelab logs homelab-dashboard --tail 5 || echo "Logs command needs compose restart"

echo -e "\n${CYAN}[3/6] Installing Automated Backups${NC}"
if [ -f "./scripts/install-backup-cron.sh" ]; then
    ./scripts/install-backup-cron.sh
    echo -e "${GREEN}✓ Backup cron job installed${NC}"
else
    echo -e "${YELLOW}⚠ Backup script not found, skipping${NC}"
fi

echo -e "\n${CYAN}[4/6] Testing New Features${NC}"
echo ""

# Test 1: Prometheus alerts file exists
test_feature "Prometheus alerts" "[ -f config/prometheus/alerts.yml ]"

# Test 2: Marketplace templates exist
test_feature "Marketplace templates" "[ -d services/marketplace/templates ] && [ $(ls -1 services/marketplace/templates/*.yml 2>/dev/null | wc -l) -ge 5 ]"

# Test 3: Backup script exists and is executable
test_feature "Backup automation" "[ -x scripts/automated-backup.sh ]"

# Test 4: DNS sync script exists
test_feature "DNS auto-sync" "[ -x scripts/dns-auto-sync.sh ]"

# Test 5: API documentation exists
test_feature "API documentation" "[ -f services/dashboard/static/swagger.json ]"

# Test 6: JWT token UI template exists
test_feature "Token UI template" "[ -f services/dashboard/templates/api_tokens.html ]"

# Test 7: Bootstrap script has fixed validation
test_feature "Bootstrap validation fix" "grep -q 'Container running (Gunicorn may still be initializing)' bootstrap-homelab.sh"

echo -e "\n${CYAN}[5/6] Verifying Services${NC}"
echo ""

# Check running containers
RUNNING=$(docker ps --format "{{.Names}}" | wc -l)
echo "Running containers: $RUNNING"

# Check specific services
for service in homelab-dashboard homelab-postgres homelab-redis discord-bot stream-bot; do
    if docker ps | grep -q "$service"; then
        echo -e "  ${GREEN}✓${NC} $service"
        ((TESTS_PASSED++))
    else
        echo -e "  ${RED}✗${NC} $service"
        ((TESTS_FAILED++))
    fi
done

echo -e "\n${CYAN}[6/6] Running Quick Tests${NC}"
echo ""

# Test marketplace listing
echo -n "Marketplace app count: "
if [ -d services/marketplace/templates ]; then
    APP_COUNT=$(ls -1 services/marketplace/templates/*.yml 2>/dev/null | wc -l)
    echo -e "${GREEN}$APP_COUNT apps available${NC}"
    ((TESTS_PASSED++))
else
    echo -e "${RED}0 apps${NC}"
    ((TESTS_FAILED++))
fi

# Test backup script can run (dry run)
echo -n "Backup script syntax: "
if bash -n scripts/automated-backup.sh 2>/dev/null; then
    echo -e "${GREEN}✓ Valid${NC}"
    ((TESTS_PASSED++))
else
    echo -e "${RED}✗ Syntax errors${NC}"
    ((TESTS_FAILED++))
fi

# Summary
echo -e "\n${CYAN}═══════════════════════════════════════════════════════════════${NC}"
echo -e "                    TEST SUMMARY"
echo -e "${CYAN}═══════════════════════════════════════════════════════════════${NC}"
echo -e "Passed: ${GREEN}$TESTS_PASSED${NC}"
echo -e "Failed: ${RED}$TESTS_FAILED${NC}"

if [ $TESTS_FAILED -eq 0 ]; then
    echo -e "\n${GREEN}🎉 ALL TESTS PASSED! System is ready!${NC}"
    echo ""
    echo "Next steps:"
    echo "  1. Deploy a marketplace app: ./homelab marketplace deploy uptime-kuma"
    echo "  2. View API docs: https://dashboard.evindrake.net/api-docs"
    echo "  3. Generate API token: https://dashboard.evindrake.net/api-tokens"
    echo "  4. Start DNS auto-sync: nohup ./scripts/dns-auto-sync.sh &"
    echo ""
    exit 0
else
    echo -e "\n${YELLOW}⚠ Some tests failed - review above${NC}"
    exit 1
fi
