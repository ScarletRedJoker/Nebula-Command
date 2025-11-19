#!/bin/bash
# Quick Fix Deployment Script
# This will cleanly stop old containers and start fresh

set -e

echo "======================================"
echo "  🔧 Quick Fix Deployment"
echo "======================================"
echo ""

# Step 1: Stop and remove ALL containers (including old ollama)
echo "Step 1: Stopping and removing all containers..."
docker compose -f docker-compose.unified.yml down --remove-orphans
echo "✅ All containers stopped and removed"
echo ""

# Step 2: Remove the old ollama container if it still exists
echo "Step 2: Removing orphaned ollama container..."
docker rm -f ollama 2>/dev/null || echo "  → Ollama container already removed"
echo ""

# Step 3: Clean up any dangling volumes (optional)
echo "Step 3: Cleaning up..."
docker system prune -f
echo "✅ Cleanup complete"
echo ""

# Step 4: Start services with new configuration
echo "Step 4: Starting services with updated configuration..."
docker compose -f docker-compose.unified.yml up -d
echo "✅ All services started"
echo ""

# Step 5: Wait for services to initialize
echo "Step 5: Waiting for services to initialize (30 seconds)..."
sleep 30
echo ""

# Step 6: Show status
echo "Step 6: Current status:"
docker ps --format "table {{.Names}}\t{{.Status}}"
echo ""

echo "======================================"
echo "  ✅ Deployment Complete!"
echo "======================================"
echo ""
echo "Services should now be accessible:"
echo "  • Dashboard: https://host.evindrake.net"
echo "  • Stream Bot: https://stream.rig-city.com"
echo "  • Home Assistant: https://home.evindrake.net"
echo ""
echo "Run './homelab-manager.sh' and select option 12 for health check"
