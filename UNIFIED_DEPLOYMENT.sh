#!/bin/bash

# ╔════════════════════════════════════════════════════════════════╗
# ║     UNIFIED HOMELAB DEPLOYMENT WITH HEALING & VERIFICATION    ║
# ╚════════════════════════════════════════════════════════════════╝

set -e  # Exit on error

# Colors for output
RED='\033[0;31m'
GREEN='\033[0;32m'
YELLOW='\033[1;33m'
BLUE='\033[0;34m'
NC='\033[0m' # No Color

# Source environment variables
if [ -f .env ]; then
    set -a
    source .env
    set +a
    echo -e "${GREEN}✓ Environment variables loaded${NC}"
else
    echo -e "${RED}❌ .env file not found!${NC}"
    exit 1
fi

# ============================================
# Phase 1: Pre-Deployment Cleanup
# ============================================
echo -e "\n${BLUE}━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━${NC}"
echo -e "${BLUE}  Phase 1: Pre-Deployment Cleanup${NC}"
echo -e "${BLUE}━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━${NC}\n"

echo "1. Stopping all running containers..."
docker compose down --remove-orphans 2>/dev/null || true

echo "2. Removing orphaned volumes..."
docker volume prune -f 2>/dev/null || true

echo "3. Cleaning up old images..."
docker image prune -f 2>/dev/null || true

echo "4. Ensuring network cleanup..."
docker network prune -f 2>/dev/null || true

echo -e "${GREEN}✓ Cleanup complete${NC}\n"

# ============================================
# Phase 2: Build Services (Ordered by Priority)
# ============================================
echo -e "${BLUE}━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━${NC}"
echo -e "${BLUE}  Phase 2: Building Services${NC}"
echo -e "${BLUE}━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━${NC}\n"

# Build in dependency order
echo "Building core infrastructure..."
docker compose build --no-cache \
    homelab-postgres \
    homelab-redis \
    homelab-minio

echo "Building application services..."
docker compose build --no-cache \
    homelab-dashboard \
    homelab-celery-worker \
    discord-bot \
    stream-bot

echo "Building proxy and UI services..."
docker compose build --no-cache \
    caddy \
    vnc-desktop \
    code-server

echo "Building web services..."
docker compose build --no-cache \
    rig-city-site \
    scarletredjoker-web \
    plex-server \
    n8n \
    homeassistant

echo -e "${GREEN}✓ All services built${NC}\n"

# ============================================
# Phase 3: Start Services in Proper Order
# ============================================
echo -e "${BLUE}━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━${NC}"
echo -e "${BLUE}  Phase 3: Starting Services (Ordered)${NC}"
echo -e "${BLUE}━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━${NC}\n"

echo "1. Starting core infrastructure..."
docker compose up -d homelab-postgres homelab-redis homelab-minio

echo "   Waiting for PostgreSQL to be ready..."
until docker exec homelab-postgres pg_isready -U postgres 2>/dev/null; do
    echo -n "."
    sleep 2
done
echo -e "\n   ${GREEN}✓ PostgreSQL ready${NC}"

echo "   Waiting for Redis..."
until docker exec homelab-redis redis-cli ping 2>/dev/null | grep -q PONG; do
    echo -n "."
    sleep 1
done
echo -e "\n   ${GREEN}✓ Redis ready${NC}"

echo "   Waiting for MinIO..."
until docker exec homelab-minio curl -f http://localhost:9000/minio/health/live 2>/dev/null; do
    echo -n "."
    sleep 2
done
echo -e "\n   ${GREEN}✓ MinIO ready${NC}"

echo -e "\n2. Starting application services..."
docker compose up -d homelab-dashboard homelab-celery-worker

echo "   Waiting for dashboard..."
until docker exec homelab-dashboard curl -f http://localhost:5000/health 2>/dev/null; do
    echo -n "."
    sleep 2
done
echo -e "\n   ${GREEN}✓ Dashboard ready${NC}"

echo -e "\n3. Starting bot services..."
docker compose up -d discord-bot stream-bot

echo -e "\n4. Starting proxy service..."
docker compose up -d caddy

echo -e "\n5. Starting remaining services..."
docker compose up -d

echo -e "\n${GREEN}✓ All services started${NC}\n"

# ============================================
# Phase 4: Health Checks & Verification
# ============================================
echo -e "${BLUE}━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━${NC}"
echo -e "${BLUE}  Phase 4: Health Verification${NC}"
echo -e "${BLUE}━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━${NC}\n"

# Function to check container health
check_service() {
    local service=$1
    local display_name=$2
    
    if docker ps --format "{{.Names}}" | grep -q "^${service}$"; then
        local status=$(docker inspect --format='{{.State.Health.Status}}' $service 2>/dev/null || echo "no-health-check")
        local running=$(docker inspect --format='{{.State.Running}}' $service 2>/dev/null)
        
        if [ "$running" = "true" ]; then
            if [ "$status" = "healthy" ] || [ "$status" = "no-health-check" ]; then
                echo -e "${display_name}: ${GREEN}✓ Running${NC}"
                return 0
            else
                echo -e "${display_name}: ${YELLOW}⚠ Starting (${status})${NC}"
                return 1
            fi
        else
            echo -e "${display_name}: ${RED}✗ Not Running${NC}"
            return 1
        fi
    else
        echo -e "${display_name}: ${RED}✗ Not Found${NC}"
        return 1
    fi
}

# Check all services
failed_services=0

check_service "homelab-postgres" "PostgreSQL Database" || ((failed_services++))
check_service "homelab-redis" "Redis Cache" || ((failed_services++))
check_service "homelab-minio" "MinIO Storage" || ((failed_services++))
check_service "homelab-dashboard" "Dashboard" || ((failed_services++))
check_service "homelab-celery-worker" "Celery Worker" || ((failed_services++))
check_service "discord-bot" "Discord Bot" || ((failed_services++))
check_service "stream-bot" "Stream Bot" || ((failed_services++))
check_service "caddy" "Caddy Proxy" || ((failed_services++))
check_service "vnc-desktop" "VNC Desktop" || ((failed_services++))
check_service "code-server" "Code Server" || ((failed_services++))
check_service "plex-server" "Plex Server" || ((failed_services++))
check_service "n8n" "N8N Automation" || ((failed_services++))
check_service "homeassistant" "Home Assistant" || ((failed_services++))
check_service "rig-city-site" "Rig City Site" || ((failed_services++))
check_service "scarletredjoker-web" "ScarletRedJoker Site" || ((failed_services++))

# ============================================
# Phase 5: Service-Specific Verification
# ============================================
echo -e "\n${BLUE}━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━${NC}"
echo -e "${BLUE}  Phase 5: Service-Specific Tests${NC}"
echo -e "${BLUE}━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━${NC}\n"

# Test Jarvis AI (OpenAI integration)
echo -n "Jarvis AI (OpenAI): "
if docker exec homelab-dashboard python -c "
import os, requests
api_key = os.environ.get('OPENAI_API_KEY', '')
if api_key:
    resp = requests.post('https://api.openai.com/v1/chat/completions',
        headers={'Authorization': f'Bearer {api_key}', 'Content-Type': 'application/json'},
        json={'model': 'gpt-3.5-turbo', 'messages': [{'role': 'user', 'content': 'test'}], 'max_tokens': 5})
    exit(0 if resp.status_code == 200 else 1)
else:
    exit(1)
" 2>/dev/null; then
    echo -e "${GREEN}✓ Working${NC}"
else
    echo -e "${YELLOW}⚠ Check API Key${NC}"
fi

# Test Database Connectivity
echo -n "Database Connectivity: "
if docker exec homelab-postgres psql -U postgres -c "SELECT 1" >/dev/null 2>&1; then
    echo -e "${GREEN}✓ Connected${NC}"
else
    echo -e "${RED}✗ Failed${NC}"
fi

# Test Redis
echo -n "Redis Cache: "
if docker exec homelab-redis redis-cli ping 2>/dev/null | grep -q PONG; then
    echo -e "${GREEN}✓ Responding${NC}"
else
    echo -e "${RED}✗ Not Responding${NC}"
fi

# ============================================
# Phase 6: Self-Healing Actions
# ============================================
if [ $failed_services -gt 0 ]; then
    echo -e "\n${YELLOW}━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━${NC}"
    echo -e "${YELLOW}  Phase 6: Self-Healing (${failed_services} issues detected)${NC}"
    echo -e "${YELLOW}━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━${NC}\n"
    
    echo "Attempting to heal failed services..."
    
    # Restart failed services
    docker compose restart
    
    echo "Waiting 10 seconds for services to stabilize..."
    sleep 10
    
    # Re-check after healing
    echo -e "\n${BLUE}Re-checking services after healing...${NC}"
    docker compose ps --format "table {{.Service}}\t{{.Status}}"
fi

# ============================================
# Final Summary
# ============================================
echo -e "\n${BLUE}━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━${NC}"
echo -e "${BLUE}  Deployment Complete!${NC}"
echo -e "${BLUE}━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━${NC}\n"

echo "Service URLs:"
echo "  🌐 Dashboard: https://host.evindrake.net"
echo "  🤖 Discord Bot: https://bot.rig-city.com"
echo "  📺 Stream Bot: https://stream.rig-city.com"
echo "  🖥️ VNC Desktop: https://vnc.evindrake.net"
echo "  💻 Code Server: https://code.evindrake.net"
echo "  🎬 Plex: https://plex.evindrake.net"
echo "  🔄 N8N: https://n8n.evindrake.net"
echo "  🏠 Home Assistant: https://home.evindrake.net"
echo ""

if [ $failed_services -eq 0 ]; then
    echo -e "${GREEN}✅ All services deployed successfully!${NC}"
else
    echo -e "${YELLOW}⚠️ Deployment completed with ${failed_services} warnings. Check logs for details.${NC}"
    echo "   Run: docker compose logs [service-name]"
fi