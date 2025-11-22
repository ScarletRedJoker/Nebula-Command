#!/bin/bash
# Fix Ubuntu Homelab Services After Cleanup
# This resolves docker-compose.yml and rebuilds containers

set -e

echo "════════════════════════════════════════"
echo "  Fixing Homelab Services"
echo "════════════════════════════════════════"

cd /home/evin/contain/HomeLabHub

# Step 1: Pull latest changes
echo ""
echo "[1/3] Pulling latest fixes from GitHub..."
git pull origin main

# Step 2: Rebuild with --no-cache to fix Config import and password issues
echo ""
echo "[2/3] Rebuilding services without cache..."
docker compose --project-directory /home/evin/contain/HomeLabHub \
    --env-file /home/evin/contain/HomeLabHub/.env \
    build --no-cache homelab-dashboard homelab-celery-worker discord-bot stream-bot

# Step 3: Restart all services
echo ""
echo "[3/3] Restarting all services..."
docker compose --project-directory /home/evin/contain/HomeLabHub \
    --env-file /home/evin/contain/HomeLabHub/.env \
    up -d --force-recreate

echo ""
echo "════════════════════════════════════════"
echo "  ✅ Services Fixed!"
echo "════════════════════════════════════════"
echo ""
echo "Checking status..."
./homelab status
