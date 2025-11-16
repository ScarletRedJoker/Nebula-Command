#!/bin/bash

# The real problem: Database is down, everything depends on it
# This fixes it in the correct order

set -e
cd /home/evin/contain/HomeLabHub
export COMPOSE_PROJECT_NAME=homelabhub

echo "================================"
echo "DATABASE-FIRST REPAIR"
echo "================================"
echo ""

echo "1. Checking database status..."
DB_STATUS=$(docker inspect discord-bot-db --format='{{.State.Status}}' 2>/dev/null || echo "not_found")
DB_HEALTH=$(docker inspect discord-bot-db --format='{{.State.Health.Status}}' 2>/dev/null || echo "none")

echo "   Status: $DB_STATUS"
echo "   Health: $DB_HEALTH"
echo ""

if [ "$DB_STATUS" != "running" ] || [ "$DB_HEALTH" = "unhealthy" ]; then
    echo "2. Database is broken. Checking logs..."
    echo ""
    docker logs discord-bot-db --tail 50
    echo ""
    echo "3. Restarting database..."
    docker compose -f docker-compose.unified.yml restart discord-bot-db
    echo "   Waiting 30 seconds for database to initialize..."
    sleep 30
else
    echo "2. Database looks OK"
    echo ""
fi

echo "4. Restarting dependent services in order..."
echo ""

echo "   → Redis..."
docker compose -f docker-compose.unified.yml restart homelab-redis
sleep 5

echo "   → MinIO..."
docker compose -f docker-compose.unified.yml restart homelab-minio
sleep 5

echo "   → Dashboard (demo)..."
docker compose -f docker-compose.unified.yml restart homelab-dashboard-demo
sleep 5

echo "   → Dashboard (prod)..."
docker compose -f docker-compose.unified.yml restart homelab-dashboard
sleep 5

echo "   → Stream Bot..."
docker compose -f docker-compose.unified.yml restart stream-bot
sleep 5

echo "   → Discord Bot..."
docker compose -f docker-compose.unified.yml restart discord-bot
sleep 5

echo "   → Home Assistant..."
docker compose -f docker-compose.unified.yml restart homeassistant
sleep 5

echo "   → VNC Desktop..."
docker compose -f docker-compose.unified.yml restart vnc-desktop
sleep 5

echo "   → Celery Worker..."
docker compose -f docker-compose.unified.yml restart homelab-celery-worker
sleep 5

echo "   → Caddy..."
docker compose -f docker-compose.unified.yml restart caddy
sleep 10

echo ""
echo "5. Checking final status..."
echo ""
docker ps --format "table {{.Names}}\t{{.Status}}\t{{.Ports}}" | grep -E "caddy|dashboard|stream-bot|discord-bot|homeassistant|vnc-desktop|discord-bot-db"

echo ""
echo "================================"
echo "DONE - Wait 1 minute then test:"
echo "================================"
echo "  test.evindrake.net"
echo "  stream.rig-city.com"
echo "  bot.rig-city.com"
echo "  game.evindrake.net"
echo "  home.evindrake.net"
echo "  vnc.evindrake.net"
echo ""
