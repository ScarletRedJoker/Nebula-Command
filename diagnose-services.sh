#!/bin/bash
# Comprehensive service diagnostic for Ubuntu server

echo "════════════════════════════════════════"
echo "  Service Diagnostic"
echo "════════════════════════════════════════"
echo ""

cd /home/evin/contain/HomeLabHub

echo "[1] Running containers:"
docker ps --format "table {{.Names}}\t{{.Status}}\t{{.State}}" | head -20

echo ""
echo "[2] Service count:"
docker ps -q | wc -l
echo "/15 expected"

echo ""
echo "[3] Services that should be running but aren't:"
docker compose ps -a --format "table {{.Name}}\t{{.Status}}" | grep -E "Exited|Created|Restarting" || echo "✅ None - all services running or starting"

echo ""
echo "[4] Recent errors (if any):"
docker compose logs --tail=20 2>&1 | grep -iE "error|fatal|failed" | head -10 || echo "✅ No recent errors"

echo ""
echo "[5] Discord bot status:"
docker inspect discord-bot --format='{{.State.Status}}' 2>/dev/null || echo "❌ Not found"

echo ""
echo "[6] Stream bot status:"
docker inspect stream-bot --format='{{.State.Status}}' 2>/dev/null || echo "❌ Not found"

echo ""
echo "════════════════════════════════════════"
echo "If services are 'starting' or 'health: starting',"
echo "wait 30-60 seconds and run: ./homelab status"
echo "════════════════════════════════════════"
