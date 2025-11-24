#!/bin/bash
# Quick debug - what's actually running?

echo "=== Docker Containers ==="
docker ps --format "table {{.Names}}\t{{.Status}}\t{{.Ports}}" | grep -E "homelab-dashboard|stream-bot|discord-bot|postgres|redis|caddy"

echo ""
echo "=== Dashboard Container Logs (last 30 lines) ==="
docker logs homelab-dashboard --tail 30 2>&1 || echo "Dashboard container not running!"

echo ""
echo "=== Port 5000 Check ==="
lsof -i :5000 2>/dev/null || netstat -tlnp | grep :5000 || echo "Nothing on port 5000"

echo ""
echo "=== Port 8080 Check ==="
lsof -i :8080 2>/dev/null || netstat -tlnp | grep :8080 || echo "Nothing on port 8080"

echo ""
echo "=== Localhost Dashboard Test ==="
curl -s -o /dev/null -w "HTTP Status: %{http_code}\n" http://localhost:5000/health 2>&1

echo ""
echo "=== Dashboard Container Inspect ==="
docker inspect homelab-dashboard --format '{{.State.Status}} - {{.State.Health.Status}}' 2>&1 || echo "Container doesn't exist"

echo ""
echo "=== Recent Compose Errors ==="
docker compose logs homelab-dashboard --tail 20 2>&1 | grep -i "error\|fail\|exception" || echo "No obvious errors in recent logs"
