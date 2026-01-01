#!/bin/bash
# Production Health Check Script for Nebula Command
# Run this on your Linode server: bash scripts/production-health-check.sh

set -e
cd /opt/homelab/HomeLabHub 2>/dev/null || cd "$(dirname "$0")/.."

RED='\033[0;31m'
GREEN='\033[0;32m'
YELLOW='\033[1;33m'
BLUE='\033[0;34m'
NC='\033[0m'

echo ""
echo "=================================================="
echo "      NEBULA COMMAND PRODUCTION HEALTH CHECK"
echo "=================================================="
echo ""

# ============ DOCKER CONTAINERS ============
echo -e "${BLUE}=== Docker Containers ===${NC}"
if command -v docker &> /dev/null; then
    docker ps --format "table {{.Names}}\t{{.Status}}\t{{.Ports}}" 2>/dev/null || echo -e "${RED}Docker daemon not running${NC}"
else
    echo -e "${RED}Docker not installed${NC}"
fi
echo ""

# ============ REQUIRED SECRETS CHECK ============
echo -e "${BLUE}=== Environment Variables Check ===${NC}"

# Source .env if it exists
if [ -f deploy/linode/.env ]; then
    source deploy/linode/.env 2>/dev/null
elif [ -f .env ]; then
    source .env 2>/dev/null
fi

check_secret() {
    local name=$1
    local required=$2
    local value="${!name}"
    if [ -n "$value" ]; then
        echo -e "${GREEN}✓ $name${NC} (set)"
    elif [ "$required" = "required" ]; then
        echo -e "${RED}✗ $name${NC} (MISSING - REQUIRED)"
    else
        echo -e "${YELLOW}○ $name${NC} (not set - optional)"
    fi
}

echo ""
echo "Database Configuration (docker-compose constructs URLs from these):"
check_secret "POSTGRES_PASSWORD" "required"
check_secret "JARVIS_DB_PASSWORD" "required"
check_secret "DISCORD_DB_PASSWORD" "required"
check_secret "STREAMBOT_DB_PASSWORD" "required"

echo ""
echo "Dashboard Secrets:"
check_secret "SESSION_SECRET" "required"
check_secret "WEB_USERNAME" "required"
check_secret "WEB_PASSWORD" "required"
check_secret "CLOUDFLARE_API_TOKEN" "optional"
check_secret "OPENAI_API_KEY" "optional"
check_secret "HOME_ASSISTANT_TOKEN" "optional"

echo ""
echo "Discord Bot Secrets:"
check_secret "DISCORD_BOT_TOKEN" "required"
check_secret "DISCORD_APP_ID" "required"
check_secret "DISCORD_CLIENT_ID" "required"
check_secret "DISCORD_CLIENT_SECRET" "required"
check_secret "DISCORD_SESSION_SECRET" "required"
check_secret "YOUTUBE_API_KEY" "optional"
check_secret "TWITCH_CLIENT_ID" "optional"
check_secret "TWITCH_CLIENT_SECRET" "optional"

echo ""
echo "Stream Bot Secrets:"
check_secret "STREAMBOT_SESSION_SECRET" "required"
check_secret "SPOTIFY_CLIENT_ID" "optional"
check_secret "SPOTIFY_CLIENT_SECRET" "optional"
check_secret "KICK_CLIENT_ID" "optional"

echo ""
echo "Tailscale & Connectivity:"
check_secret "TAILSCALE_AUTHKEY" "required"
check_secret "TAILSCALE_LOCAL_HOST" "required"

echo ""

# ============ INFRASTRUCTURE ============
echo -e "${BLUE}=== Infrastructure Status ===${NC}"

# Redis (container name is homelab-redis)
if docker ps --format '{{.Names}}' | grep -q "homelab-redis"; then
    if docker exec homelab-redis redis-cli ping 2>/dev/null | grep -q PONG; then
        echo -e "${GREEN}✓ Redis${NC} (running and responding)"
    else
        echo -e "${RED}✗ Redis${NC} (container running but not responding)"
    fi
else
    echo -e "${RED}✗ Redis${NC} (container not running)"
fi

# Tailscale
if command -v tailscale &> /dev/null; then
    if tailscale status &>/dev/null; then
        echo -e "${GREEN}✓ Tailscale${NC} (connected)"
    else
        echo -e "${RED}✗ Tailscale${NC} (not connected)"
    fi
else
    if docker ps | grep -q tailscale; then
        echo -e "${GREEN}✓ Tailscale${NC} (running in container)"
    else
        echo -e "${YELLOW}○ Tailscale${NC} (not installed)"
    fi
fi

# SSH Keys
if [ -f /root/.ssh/id_rsa ]; then
    echo -e "${GREEN}✓ SSH Key${NC} (/root/.ssh/id_rsa exists)"
else
    echo -e "${YELLOW}○ SSH Key${NC} (not found - fleet management disabled)"
fi

echo ""

# ============ SERVICE HEALTH ENDPOINTS ============
echo -e "${BLUE}=== Service Health Checks ===${NC}"

# Check health via Docker exec (services not exposed on localhost)
check_docker_health() {
    local name=$1
    local container=$2
    local port=$3
    
    # First check if container is running
    if ! docker ps --format '{{.Names}}' | grep -q "^${container}$"; then
        echo -e "${RED}✗ $name${NC} (container not running)"
        return
    fi
    
    # Check container health status
    local health=$(docker inspect --format='{{.State.Health.Status}}' "$container" 2>/dev/null || echo "unknown")
    if [ "$health" = "healthy" ]; then
        echo -e "${GREEN}✓ $name${NC} (container: $container - $health)"
    elif [ "$health" = "starting" ]; then
        echo -e "${YELLOW}○ $name${NC} (container: $container - starting up)"
    else
        echo -e "${RED}✗ $name${NC} (container: $container - $health)"
    fi
}

check_docker_health "Dashboard" "homelab-dashboard" "5000"
check_docker_health "Discord Bot" "discord-bot" "4000"
check_docker_health "Stream Bot" "stream-bot" "5000"

# Also verify Dashboard API responds (it has curl)
echo ""
echo "API Response Test (Dashboard only - has curl):"
if docker exec homelab-dashboard curl -sf --max-time 5 http://localhost:5000/api/health 2>/dev/null | grep -q '"status"'; then
    echo -e "${GREEN}✓ Dashboard API${NC} (responds with health JSON)"
else
    echo -e "${YELLOW}○ Dashboard API${NC} (curl test failed, but container may be healthy)"
fi

echo ""

# ============ EXTERNAL CONNECTIVITY ============
echo -e "${BLUE}=== External Connectivity ===${NC}"

# Use TAILSCALE_LOCAL_HOST from env (default: 100.110.227.25)
TS_HOST="${TAILSCALE_LOCAL_HOST:-100.110.227.25}"

# Plex via Tailscale
if curl -sf --max-time 5 "http://${TS_HOST}:32400/identity" > /dev/null 2>&1; then
    echo -e "${GREEN}✓ Plex (Tailscale)${NC} (${TS_HOST}:32400)"
else
    echo -e "${RED}✗ Plex (Tailscale)${NC} (${TS_HOST}:32400 unreachable)"
    echo -e "  ${YELLOW}Check: Is Plex running on local Ubuntu? Is Tailscale connected?${NC}"
fi

# Home Assistant via Tailscale
if curl -sf --max-time 5 "http://${TS_HOST}:8123/api/" > /dev/null 2>&1; then
    echo -e "${GREEN}✓ Home Assistant (Tailscale)${NC} (${TS_HOST}:8123)"
else
    echo -e "${YELLOW}○ Home Assistant${NC} (${TS_HOST}:8123 unreachable)"
fi

# MinIO via Tailscale
if curl -sf --max-time 5 "http://${TS_HOST}:9000/minio/health/live" > /dev/null 2>&1; then
    echo -e "${GREEN}✓ MinIO (Tailscale)${NC} (${TS_HOST}:9000)"
else
    echo -e "${YELLOW}○ MinIO${NC} (${TS_HOST}:9000 unreachable - explains degraded status)"
fi

# Twitch API
if [ -n "$TWITCH_CLIENT_ID" ]; then
    echo -e "${GREEN}✓ Twitch API${NC} (credentials configured)"
else
    echo -e "${YELLOW}○ Twitch API${NC} (no credentials - stream detection disabled)"
fi

# YouTube API
if [ -n "$YOUTUBE_API_KEY" ]; then
    echo -e "${GREEN}✓ YouTube API${NC} (key configured)"
else
    echo -e "${YELLOW}○ YouTube API${NC} (no key - YouTube detection disabled)"
fi

echo ""

# ============ CONTAINER LOGS (ERRORS) ============
echo -e "${BLUE}=== Recent Errors (last 10 lines each) ===${NC}"

for container in homelab-dashboard homelab-discord-bot homelab-stream-bot; do
    if docker ps --format '{{.Names}}' | grep -q "^${container}$"; then
        errors=$(docker logs --tail 50 "$container" 2>&1 | grep -iE "(error|fatal|exception|failed)" | tail -5)
        if [ -n "$errors" ]; then
            echo -e "${YELLOW}$container:${NC}"
            echo "$errors" | head -5
            echo ""
        fi
    fi
done

echo ""

# ============ FEATURE STATUS SUMMARY ============
echo -e "${BLUE}=== Feature Status Summary ===${NC}"
echo ""
echo "Core Features:"
echo "  - Web Dashboard Login: Requires WEB_USERNAME, WEB_PASSWORD"
echo "  - Jarvis AI Chat: Requires OPENAI_API_KEY"
echo "  - DNS Management: Requires CLOUDFLARE_API_TOKEN"
echo "  - Container Management: Requires Docker running"
echo ""
echo "Discord Bot Features:"
echo "  - Bot Commands: Requires DISCORD_BOT_TOKEN"
echo "  - Twitch Notifications: Requires TWITCH_CLIENT_ID + SECRET"
echo "  - YouTube Notifications: Requires YOUTUBE_API_KEY"
echo "  - Plex 'Now Playing': Requires Tailscale + Plex reachable"
echo ""
echo "Stream Bot Features:"
echo "  - Twitch Posting: Requires TWITCH_CLIENT_ID + SECRET"
echo "  - YouTube Posting: Requires YOUTUBE_CLIENT_ID + SECRET"
echo "  - Spotify Overlay: Requires SPOTIFY_CLIENT_ID + SECRET"
echo ""
echo "=================================================="
echo "       Health check complete!"
echo "=================================================="
