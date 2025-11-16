#!/bin/bash
# ONE-SHOT FIX FOR ALL SITES

cd /home/evin/contain/HomeLabHub

echo "=== STOPPING HOME ASSISTANT (BROKEN, NOT NEEDED) ==="
docker stop homeassistant 2>/dev/null
docker update --restart=no homeassistant 2>/dev/null
echo "✓ Disabled"

echo ""
echo "=== WAITING FOR REPLIT SYNC (15 seconds) ==="
sleep 15

echo ""
echo "=== RELOADING CADDY WITH FIXED CONFIG ==="
docker exec caddy caddy reload --config /etc/caddy/Caddyfile
echo "✓ Caddy reloaded"

echo ""
echo "=== RESTARTING DASHBOARDS WITH CSRF FIX ==="
docker compose -f docker-compose.unified.yml restart homelab-dashboard homelab-dashboard-demo
echo "✓ Dashboards restarted"

sleep 10

echo ""
echo "=== TESTING SITES ==="
echo "1. game.evindrake.net (Moonlight):"
curl -sL https://game.evindrake.net 2>&1 | grep -i "moonlight\|gaming\|connect" | head -2 || echo "   ERROR: Site not loading"

echo ""
echo "2. test.evindrake.net (Demo login):"
curl -sI https://test.evindrake.net 2>&1 | grep "HTTP\|Location" | head -2

echo ""
echo "3. host.evindrake.net/dashboard (Production):"
curl -sI https://host.evindrake.net/dashboard 2>&1 | grep HTTP | head -1

echo ""
echo "=== DONE! TEST IN BROWSER: ==="
echo "✓ https://game.evindrake.net (Moonlight gaming page)"
echo "✓ https://test.evindrake.net (Login: demo/demo)"
echo "✓ https://host.evindrake.net/dashboard (Login: evin/homelab)"
