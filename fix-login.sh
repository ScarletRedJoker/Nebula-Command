#!/bin/bash
# Fix login issues - removes duplicates and rebuilds container cleanly

set -e

echo "=========================================="
echo "NebulaCommand Dashboard Login Fix"
echo "=========================================="

cd /home/evin/contain/HomeLabHub

echo ""
echo "Step 1: Fixing duplicate credentials in .env..."
# Remove duplicate WEB_USERNAME and WEB_PASSWORD entries
# Keep only the first occurrence
awk '!seen[$0]++' .env > .env.tmp && mv .env.tmp .env

echo "Current credentials:"
grep "^WEB_" .env

echo ""
echo "Step 2: Stopping dashboard container..."
docker compose -f docker-compose.unified.yml stop homelab-dashboard

echo ""
echo "Step 3: Removing old container and image..."
docker compose -f docker-compose.unified.yml rm -f homelab-dashboard
docker rmi homelabhub-homelab-dashboard 2>/dev/null || true

echo ""
echo "Step 4: Rebuilding container with no cache..."
docker compose -f docker-compose.unified.yml build --no-cache homelab-dashboard

echo ""
echo "Step 5: Starting dashboard..."
docker compose -f docker-compose.unified.yml up -d homelab-dashboard

echo ""
echo "Step 6: Waiting for container to be healthy (60 seconds)..."
sleep 60

echo ""
echo "Step 7: Checking container logs..."
docker logs homelab-dashboard --tail=30

echo ""
echo "=========================================="
echo "Fix complete! Try logging in with:"
echo "  Username: evin"
echo "  Password: Brs=2729"
echo "=========================================="
