#!/bin/bash
# ============================================
# COMPLETE FIX - Make ALL Services Work
# ============================================
set -e

echo "============================================"
echo "FIXING ALL HOMELAB SERVICES"
echo "============================================"
echo ""

cd /home/evin/contain/HomeLabHub

# Step 1: Backup current .env
if [ -f .env ]; then
    echo "[1/6] Backing up current .env..."
    cp .env .env.backup.broken.$(date +%s)
fi

# Step 2: Create clean .env file
echo "[2/6] Creating clean .env file..."
cat > .env << 'CLEANENV'
SERVICE_USER=evin
POSTGRES_PASSWORD=qS4R8Wrl-Spz7-YEmyllIA
WEB_USERNAME=admin
WEB_PASSWORD=Brs=2729
SESSION_SECRET=qS4R8Wrl-Spz7-YEmyllIA
DASHBOARD_API_KEY=eaa143f78c41c87d0dad846419182f93960dc93574d7f33eb77f8f101185d7e7
FLASK_ENV=production
FLASK_DEBUG=false
SECRET_KEY=eaa143f78c41c87d0dad846419182f93960dc93574d7f33eb77f8f101185d7e7
FLASK_HOST=0.0.0.0
FLASK_PORT=5000
ENABLE_SCRIPT_EXECUTION=false
DISCORD_DB_PASSWORD=qS4R8Wrl-Spz7-YEmyllIA
STREAMBOT_DB_PASSWORD=qS4R8Wrl-Spz7-YEmyllIA
JARVIS_DB_PASSWORD=qS4R8Wrl-Spz7-YEmyllIA
DISCORD_DB_USER=ticketbot
STREAMBOT_DB_USER=streambot
JARVIS_DB_USER=jarvis
DISCORD_DATABASE_URL=postgresql://ticketbot:qS4R8Wrl-Spz7-YEmyllIA@homelab-postgres:5432/ticketbot
STREAMBOT_DATABASE_URL=postgresql://streambot:qS4R8Wrl-Spz7-YEmyllIA@homelab-postgres:5432/streambot
JARVIS_DATABASE_URL=postgresql://jarvis:qS4R8Wrl-Spz7-YEmyllIA@homelab-postgres:5432/homelab_jarvis
OPENAI_API_KEY=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
OPENAI_BASE_URL=https://api.openai.com/v1
AI_MODEL=gpt-3.5-turbo
AI_PROVIDER=openai
STREAMBOT_SESSION_SECRET=eaa143f78c41c87d0dad846419182f93960dc93574d7f33eb77f8f101185d7e7
STREAMBOT_PORT=5000
STREAMBOT_NODE_ENV=production
STREAMBOT_OPENAI_API_KEY=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
STREAMBOT_OPENAI_BASE_URL=https://api.openai.com/v1
STREAMBOT_FACT_MODEL=gpt-3.5-turbo
TWITCH_CLIENT_ID=5guyyrv2gjh02yy9l1bxwjvkmb3wai
TWITCH_CLIENT_SECRET=
TWITCH_CHANNEL=
YOUTUBE_CLIENT_ID=
YOUTUBE_CLIENT_SECRET=
YOUTUBE_REDIRECT_URI=https://stream.rig-city.com/api/auth/youtube/callback
SPOTIFY_CLIENT_ID=
SPOTIFY_CLIENT_SECRET=
KICK_CLIENT_ID=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
KICK_CLIENT_SECRET=1f74813218fb6f25147362ebc447987c3b2497f082923e5252eda27071382faa
DISCORD_BOT_TOKEN=
DISCORD_CLIENT_ID=1355875026070667374
DISCORD_CLIENT_SECRET=
DISCORD_APP_ID=1355875026070667374
VITE_DISCORD_CLIENT_ID=1355875026070667374
DISCORD_SESSION_SECRET=eaa143f78c41c87d0dad846419182f93960dc93574d7f33eb77f8f101185d7e7
VITE_CUSTOM_WS_URL=wss://bot.rig-city.com/ws
RESET_DB=false
PLEX_URL=https://plex.evindrake.net
PLEX_TOKEN=
PLEX_CLAIM=
MINIO_ROOT_USER=admin
MINIO_ROOT_PASSWORD=qS4R8Wrl-Spz7-YEmyllIA
MINIO_ENDPOINT=minio:9000
MINIO_USE_SSL=false
MINIO_BUCKET_NAME=homelab-uploads
VNC_PASSWORD=qS4R8Wrl-Spz7-YEmyllIA
VNC_USER=evin
VNC_USER_PASSWORD=Brs=2729
NOVNC_ENABLE=true
NOVNC_URL=vnc.evindrake.net
CODE_SERVER_PASSWORD=qS4R8Wrl-Spz7-YEmyllIA
HOME_ASSISTANT_URL=http://homeassistant:8123
HOME_ASSISTANT_TOKEN=
HOME_ASSISTANT_VERIFY_SSL=False
GOOGLE_TOKEN_CACHE_TTL=300
CALENDAR_POLL_INTERVAL_MINUTES=5
CALENDAR_LEAD_TIME_MINUTES=10
GMAIL_FROM_NAME=Homelab_Dashboard
GMAIL_DEFAULT_RECIPIENT=evindrake11@gmail.com
DRIVE_BACKUP_FOLDER_NAME=Homelab_Backups
DRIVE_BACKUP_RETENTION_DAYS=30
DRIVE_AUTO_BACKUP_ENABLED=false
DRIVE_AUTO_BACKUP_SCHEDULE=0 2 * * *
DISCORD_BOT_URL=https://bot.rig-city.com
N8N_URL=https://n8n.evindrake.net
STATIC_SITE_URL=https://scarletredjoker.com
LETSENCRYPT_EMAIL=evindrake11@gmail.com
CLEANENV

chmod 600 .env
echo "✅ Clean .env created and secured"

# Step 3: Test the new .env file
echo ""
echo "[3/6] Testing .env file..."
set -a
source .env
set +a
echo "✅ .env file loads without errors"

# Step 4: Wait for PostgreSQL and create database users
echo ""
echo "[4/6] Setting up database users..."

# Wait for PostgreSQL
until docker exec homelab-postgres pg_isready -U postgres &>/dev/null; do
    echo "Waiting for PostgreSQL..."
    sleep 2
done

# Create databases
for db in ticketbot streambot homelab_jarvis; do
    docker exec homelab-postgres psql -U postgres -tc "SELECT 1 FROM pg_database WHERE datname = '$db'" | grep -q 1 || \
    docker exec homelab-postgres psql -U postgres -c "CREATE DATABASE $db;"
done

# Create users with passwords and grant permissions
docker exec homelab-postgres psql -U postgres <<EOF
DO \$\$
BEGIN
    IF NOT EXISTS (SELECT FROM pg_catalog.pg_roles WHERE rolname = 'ticketbot') THEN
        CREATE USER ticketbot WITH PASSWORD 'qS4R8Wrl-Spz7-YEmyllIA';
    END IF;
    IF NOT EXISTS (SELECT FROM pg_catalog.pg_roles WHERE rolname = 'streambot') THEN
        CREATE USER streambot WITH PASSWORD 'qS4R8Wrl-Spz7-YEmyllIA';
    END IF;
    IF NOT EXISTS (SELECT FROM pg_catalog.pg_roles WHERE rolname = 'jarvis') THEN
        CREATE USER jarvis WITH PASSWORD 'qS4R8Wrl-Spz7-YEmyllIA';
    END IF;
END
\$\$;

GRANT ALL PRIVILEGES ON DATABASE ticketbot TO ticketbot;
GRANT ALL PRIVILEGES ON DATABASE streambot TO streambot;
GRANT ALL PRIVILEGES ON DATABASE homelab_jarvis TO jarvis;
ALTER DATABASE ticketbot OWNER TO ticketbot;
ALTER DATABASE streambot OWNER TO streambot;
ALTER DATABASE homelab_jarvis OWNER TO jarvis;
EOF

echo "✅ Database users created and configured"

# Step 5: Restart all services
echo ""
echo "[5/6] Restarting all services..."
./homelab fix

# Step 6: Wait and check status
echo ""
echo "[6/6] Waiting for services to stabilize..."
sleep 15

echo ""
echo "============================================"
echo "SERVICE STATUS"
echo "============================================"
./homelab status

echo ""
echo "============================================"
echo "CHECKING CRITICAL SERVICES"
echo "============================================"

# Check dashboard
echo ""
echo "Dashboard logs (last 10 lines):"
docker logs homelab-dashboard --tail 10 2>&1 | tail -10

# Check stream-bot
echo ""
echo "Stream-bot logs (last 10 lines):"
docker logs stream-bot --tail 10 2>&1 | tail -10

echo ""
echo "============================================"
echo "DEPLOYMENT COMPLETE!"
echo "============================================"
echo ""
echo "✅ Access your services:"
echo "   Dashboard: https://host.evindrake.net (admin / Brs=2729)"
echo "   VNC:       https://vnc.evindrake.net"
echo "   Code:      https://code.evindrake.net"
echo "   Stream:    https://stream.rig-city.com"
echo ""
echo "📝 Next steps (optional):"
echo "   - Add Discord bot token to .env for Discord bot"
echo "   - Add Plex token to .env for Plex integration"
echo "   - Rotate OpenAI API key after verifying everything works"
echo ""
