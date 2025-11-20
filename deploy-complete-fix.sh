#!/bin/bash
set -e

echo "════════════════════════════════════════════════════════"
echo "  COMPREHENSIVE FIX - Jarvis AI + Stream-bot + VNC"
echo "════════════════════════════════════════════════════════"
echo ""

cd /home/evin/contain/HomeLabHub

# Pull latest changes
echo "[1/4] Pulling latest code from GitHub..."
git pull origin main

# Restart affected services with new environment variables
echo ""
echo "[2/4] Restarting services with new configuration..."
docker compose up -d homelab-dashboard homelab-celery-worker stream-bot vnc-desktop

# Wait for services to stabilize
echo ""
echo "[3/4] Waiting 30 seconds for services to initialize..."
sleep 30

# Check status
echo ""
echo "[4/4] Checking service status..."
echo ""
docker ps --format "table {{.Names}}\t{{.Status}}" | grep -E "dashboard|celery|stream|vnc"

echo ""
echo "════════════════════════════════════════════════════════"
echo "  VERIFICATION TESTS"
echo "════════════════════════════════════════════════════════"

# Test Jarvis AI availability
echo ""
echo "[TEST 1] Jarvis AI Environment:"
docker exec homelab-dashboard env | grep -E "AI_PROVIDER|AI_MODEL|OPENAI_API_KEY" | sed 's/sk-proj.*$/sk-proj-***REDACTED***/g'
docker exec homelab-celery-worker env | grep -E "AI_PROVIDER|AI_MODEL" || echo "⚠ Celery env check failed"

# Test Stream-bot fact model
echo ""
echo "[TEST 2] Stream-bot AI Configuration:"
docker exec stream-bot env | grep -E "STREAMBOT_FACT_MODEL|OPENAI_API_KEY|YOUTUBE" | sed 's/sk-proj.*$/sk-proj-***REDACTED***/g'

# Test VNC noVNC enablement
echo ""
echo "[TEST 3] VNC Web Client Configuration:"
docker exec vnc-desktop env | grep -E "NOVNC_ENABLE|ENABLE_WEB_CLIENT"

# Test connectivity
echo ""
echo "[TEST 4] Service Connectivity from Caddy:"
docker exec caddy wget -q -O- http://homelab-dashboard:5000 | grep -o "<title>.*</title>" || echo "❌ Dashboard unreachable"
docker exec caddy wget -q -O- http://stream-bot:5000 | grep -o "<title>.*</title>" || echo "❌ Stream-bot unreachable"
docker exec caddy wget -q -O- http://vnc-desktop:6080 2>&1 | head -5 | grep -E "200 OK|vnc.html|noVNC" && echo "✅ VNC web client responding" || echo "❌ VNC still not accessible"

echo ""
echo "════════════════════════════════════════════════════════"
echo "✅ DEPLOYMENT COMPLETE!"
echo "════════════════════════════════════════════════════════"
echo ""
echo "🧪 TEST YOUR FEATURES NOW:"
echo ""
echo "1. JARVIS AI:"
echo "   → Open: https://host.evindrake.net"
echo "   → Click 'AI Assistant (JARVIS)' in sidebar"
echo "   → Type 'Hello Jarvis' and press Send"
echo "   → Should get OpenAI response (no more 408 error)"
echo ""
echo "2. STREAM-BOT FACT PREVIEW:"
echo "   → Open: https://stream.rig-city.com/trigger"
echo "   → Select 'Twitch' platform"  
echo "   → Click 'Generate Preview'"
echo "   → Should show AI-generated Snapple fact"
echo ""
echo "3. STREAM-BOT YOUTUBE:"
echo "   → Open: https://stream.rig-city.com"
echo "   → Click 'Sign in with YouTube'"
echo "   → Should redirect to Google OAuth (not fail)"
echo ""
echo "4. VNC REMOTE DESKTOP:"
echo "   → Open: https://vnc.evindrake.net"
echo "   → Should show noVNC web interface (no more 502)"
echo "   → Enter VNC password to connect"
echo ""
echo "════════════════════════════════════════════════════════"
