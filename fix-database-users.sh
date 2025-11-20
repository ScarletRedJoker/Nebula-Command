#!/bin/bash
# ════════════════════════════════════════════════════════════
# Fix Database Authentication for All Services
# ════════════════════════════════════════════════════════════

set -e

PROJECT_ROOT="/home/evin/contain/HomeLabHub"
cd "$PROJECT_ROOT"

# Load environment variables
if [ ! -f .env ]; then
    echo "❌ ERROR: .env file not found"
    exit 1
fi

# Export all .env variables
set -a
source .env
set +a

echo "══════════════════════════════════════════════════════"
echo "  DATABASE USER CREATION & PERMISSIONS FIX"
echo "══════════════════════════════════════════════════════"
echo ""

# Wait for PostgreSQL to be ready
echo "[1/4] Waiting for PostgreSQL..."
until docker exec homelab-postgres pg_isready -U postgres &>/dev/null; do
    echo "  Waiting for PostgreSQL to be ready..."
    sleep 2
done
echo "✓ PostgreSQL is ready"
echo ""

# Create databases if they don't exist
echo "[2/4] Creating databases..."
for db in ticketbot streambot homelab_jarvis; do
    if ! docker exec homelab-postgres psql -U postgres -lqt 2>/dev/null | cut -d \| -f 1 | grep -qw "$db"; then
        echo "  Creating database: $db"
        docker exec homelab-postgres psql -U postgres -c "CREATE DATABASE $db;"
    else
        echo "  ✓ Database exists: $db"
    fi
done
echo ""

# Create users and grant permissions
echo "[3/4] Creating database users and granting permissions..."

# Discord Bot User
if [ -n "$DISCORD_DB_USER" ] && [ -n "$DISCORD_DB_PASSWORD" ]; then
    echo "  Setting up user: $DISCORD_DB_USER for database: ticketbot"
    docker exec homelab-postgres psql -U postgres <<EOF
DO \$\$
BEGIN
    IF NOT EXISTS (SELECT FROM pg_user WHERE usename = '$DISCORD_DB_USER') THEN
        CREATE USER $DISCORD_DB_USER WITH PASSWORD '$DISCORD_DB_PASSWORD';
    ELSE
        ALTER USER $DISCORD_DB_USER WITH PASSWORD '$DISCORD_DB_PASSWORD';
    END IF;
END
\$\$;

GRANT ALL PRIVILEGES ON DATABASE ticketbot TO $DISCORD_DB_USER;
\c ticketbot
GRANT ALL PRIVILEGES ON SCHEMA public TO $DISCORD_DB_USER;
GRANT ALL PRIVILEGES ON ALL TABLES IN SCHEMA public TO $DISCORD_DB_USER;
GRANT ALL PRIVILEGES ON ALL SEQUENCES IN SCHEMA public TO $DISCORD_DB_USER;
ALTER DEFAULT PRIVILEGES IN SCHEMA public GRANT ALL PRIVILEGES ON TABLES TO $DISCORD_DB_USER;
ALTER DEFAULT PRIVILEGES IN SCHEMA public GRANT ALL PRIVILEGES ON SEQUENCES TO $DISCORD_DB_USER;
EOF
    echo "  ✓ User $DISCORD_DB_USER configured for ticketbot"
else
    echo "  ⚠ Skipping Discord bot user (missing credentials)"
fi

# Stream Bot User
if [ -n "$STREAMBOT_DB_USER" ] && [ -n "$STREAMBOT_DB_PASSWORD" ]; then
    echo "  Setting up user: $STREAMBOT_DB_USER for database: streambot"
    docker exec homelab-postgres psql -U postgres <<EOF
DO \$\$
BEGIN
    IF NOT EXISTS (SELECT FROM pg_user WHERE usename = '$STREAMBOT_DB_USER') THEN
        CREATE USER $STREAMBOT_DB_USER WITH PASSWORD '$STREAMBOT_DB_PASSWORD';
    ELSE
        ALTER USER $STREAMBOT_DB_USER WITH PASSWORD '$STREAMBOT_DB_PASSWORD';
    END IF;
END
\$\$;

GRANT ALL PRIVILEGES ON DATABASE streambot TO $STREAMBOT_DB_USER;
\c streambot
GRANT ALL PRIVILEGES ON SCHEMA public TO $STREAMBOT_DB_USER;
GRANT ALL PRIVILEGES ON ALL TABLES IN SCHEMA public TO $STREAMBOT_DB_USER;
GRANT ALL PRIVILEGES ON ALL SEQUENCES IN SCHEMA public TO $STREAMBOT_DB_USER;
ALTER DEFAULT PRIVILEGES IN SCHEMA public GRANT ALL PRIVILEGES ON TABLES TO $STREAMBOT_DB_USER;
ALTER DEFAULT PRIVILEGES IN SCHEMA public GRANT ALL PRIVILEGES ON SEQUENCES TO $STREAMBOT_DB_USER;
EOF
    echo "  ✓ User $STREAMBOT_DB_USER configured for streambot"
else
    echo "  ⚠ Skipping Stream bot user (missing credentials)"
fi

# Jarvis/Dashboard User
if [ -n "$JARVIS_DB_USER" ] && [ -n "$JARVIS_DB_PASSWORD" ]; then
    echo "  Setting up user: $JARVIS_DB_USER for database: homelab_jarvis"
    docker exec homelab-postgres psql -U postgres <<EOF
DO \$\$
BEGIN
    IF NOT EXISTS (SELECT FROM pg_user WHERE usename = '$JARVIS_DB_USER') THEN
        CREATE USER $JARVIS_DB_USER WITH PASSWORD '$JARVIS_DB_PASSWORD';
    ELSE
        ALTER USER $JARVIS_DB_USER WITH PASSWORD '$JARVIS_DB_PASSWORD';
    END IF;
END
\$\$;

GRANT ALL PRIVILEGES ON DATABASE homelab_jarvis TO $JARVIS_DB_USER;
\c homelab_jarvis
GRANT ALL PRIVILEGES ON SCHEMA public TO $JARVIS_DB_USER;
GRANT ALL PRIVILEGES ON ALL TABLES IN SCHEMA public TO $JARVIS_DB_USER;
GRANT ALL PRIVILEGES ON ALL SEQUENCES IN SCHEMA public TO $JARVIS_DB_USER;
ALTER DEFAULT PRIVILEGES IN SCHEMA public GRANT ALL PRIVILEGES ON TABLES TO $JARVIS_DB_USER;
ALTER DEFAULT PRIVILEGES IN SCHEMA public GRANT ALL PRIVILEGES ON SEQUENCES TO $JARVIS_DB_USER;
EOF
    echo "  ✓ User $JARVIS_DB_USER configured for homelab_jarvis"
else
    echo "  ⚠ Skipping Jarvis user (missing credentials)"
fi

echo ""

# Verify users
echo "[4/4] Verifying database users..."
docker exec homelab-postgres psql -U postgres -c "\du" | grep -E "ticketbot|streambot|jarvis|postgres" || true
echo ""

echo "══════════════════════════════════════════════════════"
echo "✅ Database users configured successfully!"
echo "══════════════════════════════════════════════════════"
echo ""
echo "Now restart the services:"
echo "  cd /home/evin/contain/HomeLabHub"
echo "  docker compose restart discord-bot stream-bot homelab-dashboard homelab-celery-worker"
echo ""
