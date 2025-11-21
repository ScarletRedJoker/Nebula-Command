#!/bin/bash
# ============================================
# ONE-SHOT DEPLOYMENT - Make Everything Work
# ============================================
# Run this on Ubuntu server: bash DEPLOY_NOW.sh
# ============================================

set -e

echo "============================================"
echo "DEPLOYING HOMELAB - MAKING EVERYTHING WORK"
echo "============================================"
echo ""

cd /home/evin/contain/HomeLabHub

# Backup existing .env if it exists
if [ -f .env ]; then
    echo "📦 Backing up existing .env..."
    cp .env .env.backup.$(date +%s)
fi

# Create the complete .env file
echo "📝 Creating complete .env file..."
cat > .env << 'ENVEOF'
# ============================================
# HomeLabHub Production Environment
# Ubuntu Server: host.evindrake.net
# ============================================

# ============================================
# CORE CONFIGURATION
# ============================================
SERVICE_USER=evin
POSTGRES_PASSWORD=qS4R8Wrl-Spz7-YEmyllIA
WEB_USERNAME=admin
WEB_PASSWORD=Brs=2729
SESSION_SECRET=qS4R8Wrl-Spz7-YEmyllIA
DASHBOARD_API_KEY=eaa143f78c41c87d0dad846419182f93960dc93574d7f33eb77f8f101185d7e7

# Flask Configuration
FLASK_ENV=production
FLASK_DEBUG=false
SECRET_KEY=eaa143f78c41c87d0dad846419182f93960dc93574d7f33eb77f8f101185d7e7
FLASK_HOST=0.0.0.0
FLASK_PORT=5000
ENABLE_SCRIPT_EXECUTION=false

# ============================================
# DATABASE PASSWORDS
# ============================================
DISCORD_DB_PASSWORD=qS4R8Wrl-Spz7-YEmyllIA
STREAMBOT_DB_PASSWORD=qS4R8Wrl-Spz7-YEmyllIA
JARVIS_DB_PASSWORD=qS4R8Wrl-Spz7-YEmyllIA

# Database URLs (FULLY RESOLVED - NO ${VAR}!)
DISCORD_DATABASE_URL=postgresql://ticketbot:qS4R8Wrl-Spz7-YEmyllIA@homelab-postgres:5432/ticketbot
STREAMBOT_DATABASE_URL=postgresql://streambot:qS4R8Wrl-Spz7-YEmyllIA@homelab-postgres:5432/streambot
JARVIS_DATABASE_URL=postgresql://jarvis:qS4R8Wrl-Spz7-YEmyllIA@homelab-postgres:5432/homelab_jarvis

# ============================================
# AI CONFIGURATION
# ============================================
OPENAI_API_KEY=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
OPENAI_BASE_URL=https://api.openai.com/v1
AI_MODEL=gpt-3.5-turbo
AI_PROVIDER=openai

# ============================================
# STREAM BOT
# ============================================
STREAMBOT_SESSION_SECRET=eaa143f78c41c87d0dad846419182f93960dc93574d7f33eb77f8f101185d7e7
STREAMBOT_PORT=5000
STREAMBOT_NODE_ENV=production
STREAMBOT_OPENAI_API_KEY=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
STREAMBOT_OPENAI_BASE_URL=https://api.openai.com/v1
STREAMBOT_FACT_MODEL=gpt-3.5-turbo

# Twitch
TWITCH_CLIENT_ID=5guyyrv2gjh02yy9l1bxwjvkmb3wai
TWITCH_CLIENT_SECRET=
TWITCH_CHANNEL=

# YouTube
YOUTUBE_CLIENT_ID=
YOUTUBE_CLIENT_SECRET=
YOUTUBE_REDIRECT_URI=https://stream.rig-city.com/api/auth/youtube/callback

# Spotify
SPOTIFY_CLIENT_ID=
SPOTIFY_CLIENT_SECRET=

# Kick
KICK_CLIENT_ID=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
KICK_CLIENT_SECRET=1f74813218fb6f25147362ebc447987c3b2497f082923e5252eda27071382faa

# ============================================
# DISCORD BOT
# ============================================
DISCORD_BOT_TOKEN=
DISCORD_CLIENT_ID=1355875026070667374
DISCORD_CLIENT_SECRET=
DISCORD_APP_ID=1355875026070667374
VITE_DISCORD_CLIENT_ID=1355875026070667374
DISCORD_SESSION_SECRET=eaa143f78c41c87d0dad846419182f93960dc93574d7f33eb77f8f101185d7e7
VITE_CUSTOM_WS_URL=wss://bot.rig-city.com/ws
RESET_DB=false
DISCORD_DB_USER=ticketbot_user

# ============================================
# PLEX MEDIA SERVER
# ============================================
PLEX_URL=https://plex.evindrake.net
PLEX_TOKEN=
PLEX_CLAIM=

# ============================================
# MINIO OBJECT STORAGE
# ============================================
MINIO_ROOT_USER=admin
MINIO_ROOT_PASSWORD=qS4R8Wrl-Spz7-YEmyllIA
MINIO_ENDPOINT=minio:9000
MINIO_USE_SSL=false
MINIO_BUCKET_NAME=homelab-uploads

# ============================================
# VNC REMOTE DESKTOP
# ============================================
VNC_PASSWORD=qS4R8Wrl-Spz7-YEmyllIA
VNC_USER=evin
VNC_USER_PASSWORD=Brs=2729
NOVNC_ENABLE=true
NOVNC_URL=vnc.evindrake.net

# ============================================
# CODE SERVER
# ============================================
CODE_SERVER_PASSWORD=qS4R8Wrl-Spz7-YEmyllIA

# ============================================
# HOME ASSISTANT
# ============================================
HOME_ASSISTANT_URL=http://homeassistant:8123
HOME_ASSISTANT_TOKEN=
HOME_ASSISTANT_VERIFY_SSL=False

# ============================================
# GOOGLE SERVICES
# ============================================
GOOGLE_TOKEN_CACHE_TTL=300
CALENDAR_POLL_INTERVAL_MINUTES=5
CALENDAR_LEAD_TIME_MINUTES=10
GMAIL_FROM_NAME=Homelab Dashboard
GMAIL_DEFAULT_RECIPIENT=evindrake11@gmail.com
DRIVE_BACKUP_FOLDER_NAME=Homelab Backups
DRIVE_BACKUP_RETENTION_DAYS=30
DRIVE_AUTO_BACKUP_ENABLED=false
DRIVE_AUTO_BACKUP_SCHEDULE=0 2 * * *

# ============================================
# SERVICE URLS
# ============================================
DISCORD_BOT_URL=https://bot.rig-city.com
N8N_URL=https://n8n.evindrake.net
STATIC_SITE_URL=https://scarletredjoker.com
LETSENCRYPT_EMAIL=evindrake11@gmail.com
ENVEOF

echo "✅ .env file created"

# Secure the file
chmod 600 .env
echo "🔒 Secured .env file (chmod 600)"

# Test the configuration
echo ""
echo "🧪 Testing configuration..."
./deployment/test-all-features.sh

# Deploy
echo ""
echo "🚀 Starting all services..."
./homelab fix

echo ""
echo "============================================"
echo "DEPLOYMENT COMPLETE"
echo "============================================"
echo ""
echo "📊 Service Status:"
./homelab status

echo ""
echo "============================================"
echo "NEXT STEPS:"
echo "============================================"
echo "1. Check dashboard: https://host.evindrake.net"
echo "   - Login: admin / Brs=2729"
echo "   - Test Jarvis AI chat"
echo ""
echo "2. Add Discord Bot Token (if needed):"
echo "   - Get from: https://discord.com/developers/applications/1355875026070667374/bot"
echo "   - Add to .env: DISCORD_BOT_TOKEN=your_token_here"
echo "   - Restart: ./homelab restart discord-bot"
echo ""
echo "3. Add Plex Token (if needed):"
echo "   - Get from Plex Settings > Account"
echo "   - Add to .env: PLEX_TOKEN=your_token_here"
echo "   - Restart: ./homelab restart homelab-dashboard"
echo ""
echo "4. Check logs if anything fails:"
echo "   ./homelab logs"
echo ""
echo "5. ROTATE OPENAI KEY (after everything works):"
echo "   - https://platform.openai.com/api-keys"
echo "============================================"
