#!/bin/bash

# Quick Fix for Jarvis AI - Adds OPENAI_API_KEY to dashboard container

GREEN='\033[0;32m'
YELLOW='\033[1;33m'
NC='\033[0m'

echo "════════════════════════════════════════════════════════════════"
echo "  Quick Fix: Jarvis AI OpenAI Integration"
echo "════════════════════════════════════════════════════════════════"
echo ""

# Check if running from correct directory
if [ ! -f "docker-compose.yml" ]; then
    echo "Error: Must run from HomeLabHub directory"
    exit 1
fi

echo -e "${YELLOW}Pulling latest changes...${NC}"
git pull origin main

echo -e "\n${YELLOW}Restarting dashboard with OpenAI API key...${NC}"
docker compose up -d homelab-dashboard --force-recreate

echo -e "\n${YELLOW}Waiting for dashboard to initialize (15 seconds)...${NC}"
sleep 15

echo -e "\n${GREEN}Testing Jarvis AI...${NC}"
API_TEST=$(curl -s -o /dev/null -w "%{http_code}" http://localhost:8080/api/ai/status 2>/dev/null)

if [ "$API_TEST" = "200" ] || [ "$API_TEST" = "302" ]; then
    echo -e "${GREEN}✓ Jarvis AI endpoint is responding!${NC}"
    echo ""
    echo "════════════════════════════════════════════════════════════════"
    echo -e "${GREEN}  FIX APPLIED SUCCESSFULLY!${NC}"
    echo "════════════════════════════════════════════════════════════════"
    echo ""
    echo "Jarvis AI Assistant is now available at:"
    echo "  http://host.evindrake.net:8080/ai-assistant"
    echo ""
    echo "Login with:"
    echo "  Username: admin"
    echo "  Password: Brs=2729"
    echo ""
else
    echo -e "${YELLOW}⚠ Dashboard responded with HTTP $API_TEST${NC}"
    echo "Checking logs..."
    docker logs --tail 20 homelab-dashboard | grep -i "openai\|error" || true
fi

echo ""
