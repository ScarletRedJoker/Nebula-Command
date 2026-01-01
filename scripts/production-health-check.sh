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
echo "Dashboard Secrets:"
check_secret "SESSION_SECRET" "required"
check_secret "JARVIS_DATABASE_URL" "required"
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
check_secret "DATABASE_URL" "required"
check_secret "YOUTUBE_API_KEY" "optional"
check_secret "TWITCH_CLIENT_ID" "optional"
check_secret "TWITCH_CLIENT_SECRET" "optional"

echo ""
echo "Stream Bot Secrets:"
check_secret "STREAMBOT_DATABASE_URL" "required"
check_secret "SPOTIFY_CLIENT_ID" "optional"
check_secret "SPOTIFY_CLIENT_SECRET" "optional"
check_secret "KICK_CLIENT_ID" "optional"

echo ""

# ============ INFRASTRUCTURE ============
echo -e "${BLUE}=== Infrastructure Status ===${NC}"

# Redis
if command -v redis-cli &> /dev/null || docker ps | grep -q redis; then
    if docker exec redis redis-cli ping 2>/dev/null | grep -q PONG; then
        echo -e "${GREEN}✓ Redis${NC} (running)"
    elif redis-cli ping 2>/dev/null | grep -q PONG; then
        echo -e "${GREEN}✓ Redis${NC} (running)"
    else
        echo -e "${RED}✗ Redis${NC} (not responding)"
    fi
else
    echo -e "${RED}✗ Redis${NC} (not available)"
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

check_health() {
    local name=$1
    local url=$2
    if curl -sf --max-time 5 "$url" > /dev/null 2>&1; then
        echo -e "${GREEN}✓ $name${NC} ($url)"
    else
        echo -e "${RED}✗ $name${NC} ($url - not responding)"
    fi
}

check_health "Dashboard" "http://localhost:5000/api/health"
check_health "Discord Bot" "http://localhost:4000/api/health"
check_health "Stream Bot" "http://localhost:3000/api/health"

echo ""

# ============ EXTERNAL CONNECTIVITY ============
echo -e "${BLUE}=== External Connectivity ===${NC}"

# Plex via Tailscale
if curl -sf --max-time 5 "http://100.110.227.25:32400/identity" > /dev/null 2>&1; then
    echo -e "${GREEN}✓ Plex (Tailscale)${NC}"
else
    echo -e "${RED}✗ Plex (Tailscale)${NC} (100.110.227.25:32400 unreachable)"
fi

# Home Assistant via Tailscale
if curl -sf --max-time 5 "http://100.110.227.25:8123/api/" > /dev/null 2>&1; then
    echo -e "${GREEN}✓ Home Assistant (Tailscale)${NC}"
else
    echo -e "${YELLOW}○ Home Assistant${NC} (100.110.227.25:8123 unreachable)"
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
