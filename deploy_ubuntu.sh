#!/bin/bash

# ╔════════════════════════════════════════════════════════════════╗
# ║     QUICK UBUNTU DEPLOYMENT WITH JARVIS FIX                   ║
# ╚════════════════════════════════════════════════════════════════╝

echo "╔════════════════════════════════════════════════════════════════╗"
echo "║     UBUNTU HOMELAB DEPLOYMENT                                 ║"
echo "╚════════════════════════════════════════════════════════════════╝"
echo ""

# Configuration
PROJECT_DIR="/home/evin/contain/HomeLabHub"
cd "$PROJECT_DIR" || exit 1

# Load environment variables to suppress warnings
if [ -f .env ]; then
    set -a
    source .env
    set +a
    echo "✓ Environment loaded"
fi

echo "━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━"
echo "  Step 1: Pull Latest Code (with Jarvis Fix)"
echo "━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━"
git pull origin main || echo "⚠ Git pull failed, continuing with local code..."

echo ""
echo "━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━"
echo "  Step 2: Clean Shutdown"
echo "━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━"
docker compose down --remove-orphans

echo ""
echo "━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━"
echo "  Step 3: Rebuild Services (with fixes)"
echo "━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━"

# Only rebuild the services that need updates
docker compose build \
    homelab-dashboard \
    discord-bot \
    stream-bot \
    caddy \
    vnc-desktop

echo ""
echo "━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━"
echo "  Step 4: Start Services in Order"
echo "━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━"

# Start core services first
echo "Starting databases..."
docker compose up -d homelab-postgres homelab-redis homelab-minio

# Wait for PostgreSQL
echo -n "Waiting for PostgreSQL..."
until docker exec homelab-postgres pg_isready -U postgres 2>/dev/null; do
    echo -n "."
    sleep 2
done
echo " ✓"

# Start application services
echo "Starting applications..."
docker compose up -d homelab-dashboard homelab-celery-worker discord-bot stream-bot

# Start everything else
echo "Starting remaining services..."
docker compose up -d

echo ""
echo "━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━"
echo "  Step 5: Quick Health Check"
echo "━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━"

# Test Jarvis AI specifically
echo -n "Testing Jarvis AI: "
docker exec homelab-dashboard python -c "
import os, requests
api_key = os.environ.get('OPENAI_API_KEY', '')
if api_key:
    resp = requests.post('https://api.openai.com/v1/chat/completions',
        headers={'Authorization': f'Bearer {api_key}', 'Content-Type': 'application/json'},
        json={'model': 'gpt-3.5-turbo', 'messages': [{'role': 'user', 'content': 'test'}], 'max_tokens': 5},
        timeout=5)
    print('✓ WORKING!' if resp.status_code == 200 else f'✗ Error {resp.status_code}')
else:
    print('✗ No API Key')
" 2>/dev/null || echo "✗ Service not ready yet"

# Quick status check
echo ""
echo "Container Status:"
docker compose ps --format "table {{.Service}}\t{{.Status}}" | head -20

echo ""
echo "━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━"
echo "  ✅ Deployment Complete!"
echo "━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━"
echo ""
echo "Test your services:"
echo "  • Jarvis AI: https://host.evindrake.net (should work without 40% error)"
echo "  • VNC: https://vnc.evindrake.net"
echo "  • Discord Bot: Check if online in your server"
echo ""
echo "If any issues, check logs with:"
echo "  docker compose logs [service-name]"