#!/bin/bash
#
# Diagnostic script for stream.rig-city.com and www.rig-city.com 502 errors
# Run this on your Ubuntu server to identify the problem
#

echo "╔═══════════════════════════════════════════════════╗"
echo "║  🔍 Site Diagnostics - Rig City Domains      ║"
echo "╚═══════════════════════════════════════════════════╝"
echo ""

cd /home/evin/contain/HomeLabHub

echo "━━━ Step 1: Container Health Status ━━━"
echo ""
docker ps --format "table {{.Names}}\t{{.Status}}" | grep -E "(stream-bot|rig-city-site|caddy|NAMES)"
echo ""

echo "━━━ Step 2: Stream Bot Logs (Last 30 lines) ━━━"
echo ""
docker logs stream-bot --tail 30 2>&1
echo ""

echo "━━━ Step 3: Rig City Site Logs (Last 30 lines) ━━━"
echo ""
docker logs rig-city-site --tail 30 2>&1
echo ""

echo "━━━ Step 4: Test Internal Connectivity ━━━"
echo ""
echo "[Testing stream-bot on port 5000]"
docker exec caddy wget --spider -q http://stream-bot:5000/health && echo "✓ stream-bot:5000 is reachable" || echo "✗ stream-bot:5000 is NOT reachable"
echo ""
echo "[Testing rig-city-site on port 80]"
docker exec caddy wget --spider -q http://rig-city-site:80/ && echo "✓ rig-city-site:80 is reachable" || echo "✗ rig-city-site:80 is NOT reachable"
echo ""

echo "━━━ Step 5: Check Actual Listening Ports ━━━"
echo ""
echo "[stream-bot internal ports]"
docker exec stream-bot netstat -tlnp 2>/dev/null | grep LISTEN || docker exec stream-bot ss -tlnp 2>/dev/null | grep LISTEN || echo "⚠️  netstat/ss not available in container"
echo ""
echo "[rig-city-site internal ports]"
docker exec rig-city-site netstat -tlnp 2>/dev/null | grep LISTEN || docker exec rig-city-site ss -tlnp 2>/dev/null | grep LISTEN || echo "⚠️  netstat/ss not available in container"
echo ""

echo "━━━ Step 6: Caddy Configuration Check ━━━"
echo ""
echo "[Caddy upstream health]"
docker exec caddy wget -qO- http://localhost:2019/config/ 2>/dev/null | grep -E "(stream-bot|rig-city-site)" || echo "⚠️  Could not query Caddy API"
echo ""

echo "━━━ Step 7: SSL Certificate Status ━━━"
echo ""
curl -sI https://stream.rig-city.com 2>&1 | head -5
echo ""
curl -sI https://rig-city.com 2>&1 | head -5
echo ""

echo "╔═══════════════════════════════════════════════════╗"
echo "║  📋 Summary                                   ║"
echo "╚═══════════════════════════════════════════════════╝"
echo ""
echo "If you see '✗ NOT reachable', the container is not responding on the expected port."
echo "Check the container logs above for errors."
echo ""
echo "Common issues:"
echo "  1. Container started but crashed immediately (check logs)"
echo "  2. Missing environment variables (DATABASE_URL, SESSION_SECRET, API keys)"
echo "  3. Database connection failure"
echo "  4. Port mismatch (container listening on wrong port)"
echo ""
