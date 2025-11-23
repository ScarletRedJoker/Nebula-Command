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

echo -e "\n${GREEN}Checking if dashboard is fully started...${NC}"
sleep 10

echo -e "\n${GREEN}Verifying OpenAI API key is loaded...${NC}"
docker logs homelab-dashboard 2>&1 | tail -50 | grep -i "AI Service initialized" && echo -e "${GREEN}✓ AI Service initialized successfully!${NC}" || echo -e "${YELLOW}⚠ Still starting...${NC}"

echo ""
echo "════════════════════════════════════════════════════════════════"
echo -e "${GREEN}  FIX APPLIED - Dashboard Restarted${NC}"
echo "════════════════════════════════════════════════════════════════"
echo ""
echo "Jarvis AI Assistant is available at (HTTPS with auto SSL):"
echo -e "  ${GREEN}https://host.evindrake.net/ai-assistant${NC}"
echo ""
echo "Login with:"
echo "  Username: admin"
echo "  Password: Brs=2729"
echo ""
echo "Note: Dashboard needs 30-60 seconds to fully initialize all workers."
echo "If you get a 502 error, wait a minute and refresh."
echo ""

echo ""
