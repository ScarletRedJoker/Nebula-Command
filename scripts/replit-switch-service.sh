#!/bin/bash

echo "╔══════════════════════════════════════════════════════════╗"
echo "║         REPLIT MULTI-SERVICE SWITCHER                    ║"
echo "╔══════════════════════════════════════════════════════════╗"
echo ""
echo "Available Services:"
echo ""
echo "1) Dashboard (Port 5000)"
echo "   - Control Center, Smart Home, AI Foundry, Marketplace"
echo "   - URL: https://\${REPLIT_DEV_DOMAIN}/"
echo ""
echo "2) Stream Bot (Port 3000)"
echo "   - Twitch/YouTube/Kick bot management"
echo "   - URL: https://\${REPLIT_DEV_DOMAIN}:3000/"
echo ""
echo "3) Discord Bot (Port 3001)"
echo "   - Ticket system and server management"
echo "   - URL: https://\${REPLIT_DEV_DOMAIN}:3001/"
echo "   - ⚠️  Requires DISCORD_BOT_TOKEN in Secrets"
echo ""
echo "4) All Services (Dashboard + Stream Bot + Discord Bot)"
echo "   - Run all three simultaneously"
echo ""
echo "5) Health Check (Check status of all services)"
echo ""
echo "══════════════════════════════════════════════════════════"
echo ""
read -p "Select service to run (1-5): " choice

case $choice in
  1)
    echo "🚀 Starting Dashboard on port 5000..."
    cd services/dashboard && DEMO_MODE=true python main.py
    ;;
  2)
    echo "🚀 Starting Stream Bot on port 3000..."
    cd services/stream-bot && PORT=3000 npm run dev
    ;;
  3)
    echo "🚀 Starting Discord Bot on port 3001..."
    cd services/discord-bot && PORT=3001 npm run dev
    ;;
  4)
    echo "🚀 Starting ALL services..."
    echo "Use Replit 'Run' button instead (runs all services in parallel)"
    ;;
  5)
    echo "🏥 Running health check..."
    ./scripts/replit-health-check.sh
    ;;
  *)
    echo "❌ Invalid selection"
    exit 1
    ;;
esac
