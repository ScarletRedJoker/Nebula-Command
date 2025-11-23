#!/bin/bash
set -e

GREEN='\033[0;32m'
YELLOW='\033[1;33m'
RED='\033[0;31m'
NC='\033[0m'

echo "════════════════════════════════════════════════════════════════"
echo "  Deploying All Jarvis AI Fixes"
echo "════════════════════════════════════════════════════════════════"
echo ""

# Check if running from correct directory
if [ ! -f "docker-compose.yml" ]; then
    echo -e "${RED}Error: Must run from HomeLabHub directory${NC}"
    exit 1
fi

echo -e "${GREEN}✓ Deprecated model fixes applied:${NC}"
echo "  - All gpt-3.5-turbo → gpt-4o-mini"
echo "  - All gpt-4-mini → gpt-4o-mini"
echo "  - docker-compose.yml AI_MODEL updated"
echo "  - Stream bot fallback models updated"
echo ""

echo -e "${YELLOW}Pushing changes to GitHub...${NC}"
git add -A
git commit -m "Fix: Replace all deprecated OpenAI models with gpt-4o-mini

- Updated docker-compose.yml AI_MODEL environment variables
- Fixed all Python services to use gpt-4o-mini
- Fixed Stream bot to use gpt-4o-mini fallback
- Updated frontend model selectors
- All 400 errors from deprecated models should be resolved"
git push origin main

echo ""
echo -e "${YELLOW}Pulling latest on production server...${NC}"
echo "Run these commands on your Ubuntu server:"
echo ""
echo "cd /home/evin/contain/HomeLabHub"
echo "git pull origin main"
echo "docker compose up -d homelab-dashboard stream-bot --force-recreate"
echo "sleep 60  # Wait for services to fully initialize"
echo ""
echo -e "${GREEN}Test Jarvis AI at: https://host.evindrake.net/ai-assistant${NC}"
echo ""
