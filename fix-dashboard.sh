#!/bin/bash
# Fix Dashboard Syntax Error on Ubuntu Server

set -e

echo "════════════════════════════════════════"
echo "  Fixing Dashboard Syntax Error"
echo "════════════════════════════════════════"
echo ""

cd /home/evin/contain/HomeLabHub

echo "[1/3] Pulling latest fix from GitHub..."
git pull origin main

echo ""
echo "[2/3] Rebuilding dashboard and celery worker without cache..."
docker compose --project-directory /home/evin/contain/HomeLabHub \
    --env-file /home/evin/contain/HomeLabHub/.env \
    build --no-cache homelab-dashboard homelab-celery-worker

echo ""
echo "[3/3] Restarting services..."
docker compose --project-directory /home/evin/contain/HomeLabHub \
    --env-file /home/evin/contain/HomeLabHub/.env \
    up -d --force-recreate homelab-dashboard homelab-celery-worker

echo ""
echo "Waiting 15 seconds for services to stabilize..."
sleep 15

echo ""
echo "════════════════════════════════════════"
echo "  Checking Status"
echo "════════════════════════════════════════"
./homelab status

echo ""
echo "If all 15/15 services are running, you're good to go!"
echo "If not, check logs: ./homelab logs homelab-dashboard"
