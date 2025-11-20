#!/bin/bash
# ════════════════════════════════════════════════════════════
# FINAL DATABASE USER FIX - Create All Users & Permissions
# ════════════════════════════════════════════════════════════

set -e

PROJECT_ROOT="/home/evin/contain/HomeLabHub"
cd "$PROJECT_ROOT"

# Load .env
set -a
source .env 2>/dev/null || { echo "ERROR: Cannot load .env"; exit 1; }
set +a

echo "══════════════════════════════════════════════════════"
echo "  CREATING ALL DATABASE USERS & PERMISSIONS"
echo "══════════════════════════════════════════════════════"
echo ""

# Wait for PostgreSQL
echo "Waiting for PostgreSQL..."
until docker exec homelab-postgres pg_isready -U postgres &>/dev/null; do
    sleep 1
done
echo "✓ PostgreSQL ready"
echo ""

# Create databases
echo "[1/4] Creating databases..."
for db in ticketbot streambot homelab_jarvis; do
    EXISTS=$(docker exec homelab-postgres psql -U postgres -tAc "SELECT 1 FROM pg_database WHERE datname='$db'")
    if [ "$EXISTS" != "1" ]; then
        echo "  Creating: $db"
        docker exec homelab-postgres psql -U postgres -c "CREATE DATABASE $db;"
    else
        echo "  ✓ Exists: $db"
    fi
done
echo ""

# Create users
echo "[2/4] Creating database users..."

# Stream Bot User
echo "  Creating user: streambot"
docker exec homelab-postgres psql -U postgres <<EOF
DO \$\$
BEGIN
    IF NOT EXISTS (SELECT FROM pg_user WHERE usename = 'streambot') THEN
        CREATE USER streambot WITH PASSWORD '$STREAMBOT_DB_PASSWORD';
    ELSE
        ALTER USER streambot WITH PASSWORD '$STREAMBOT_DB_PASSWORD';
    END IF;
END \$\$;
EOF

# Discord Bot User
echo "  Creating user: ticketbot"
docker exec homelab-postgres psql -U postgres <<EOF
DO \$\$
BEGIN
    IF NOT EXISTS (SELECT FROM pg_user WHERE usename = 'ticketbot') THEN
        CREATE USER ticketbot WITH PASSWORD '$DISCORD_DB_PASSWORD';
    ELSE
        ALTER USER ticketbot WITH PASSWORD '$DISCORD_DB_PASSWORD';
    END IF;
END \$\$;
EOF

# Jarvis User
echo "  Creating user: jarvis"
docker exec homelab-postgres psql -U postgres <<EOF
DO \$\$
BEGIN
    IF NOT EXISTS (SELECT FROM pg_user WHERE usename = 'jarvis') THEN
        CREATE USER jarvis WITH PASSWORD '$JARVIS_DB_PASSWORD';
    ELSE
        ALTER USER jarvis WITH PASSWORD '$JARVIS_DB_PASSWORD';
    END IF;
END \$\$;
EOF

echo ""

# Grant permissions
echo "[3/4] Granting all permissions..."

# Stream Bot
echo "  Granting permissions to streambot on streambot database"
docker exec homelab-postgres psql -U postgres -d streambot <<EOF
GRANT ALL PRIVILEGES ON DATABASE streambot TO streambot;
GRANT ALL ON SCHEMA public TO streambot;
GRANT ALL ON ALL TABLES IN SCHEMA public TO streambot;
GRANT ALL ON ALL SEQUENCES IN SCHEMA public TO streambot;
GRANT ALL ON ALL FUNCTIONS IN SCHEMA public TO streambot;
ALTER DEFAULT PRIVILEGES IN SCHEMA public GRANT ALL ON TABLES TO streambot;
ALTER DEFAULT PRIVILEGES IN SCHEMA public GRANT ALL ON SEQUENCES TO streambot;
ALTER DEFAULT PRIVILEGES IN SCHEMA public GRANT ALL ON FUNCTIONS TO streambot;
EOF

# Discord Bot
echo "  Granting permissions to ticketbot on ticketbot database"
docker exec homelab-postgres psql -U postgres -d ticketbot <<EOF
GRANT ALL PRIVILEGES ON DATABASE ticketbot TO ticketbot;
GRANT ALL ON SCHEMA public TO ticketbot;
GRANT ALL ON ALL TABLES IN SCHEMA public TO ticketbot;
GRANT ALL ON ALL SEQUENCES IN SCHEMA public TO ticketbot;
GRANT ALL ON ALL FUNCTIONS IN SCHEMA public TO ticketbot;
ALTER DEFAULT PRIVILEGES IN SCHEMA public GRANT ALL ON TABLES TO ticketbot;
ALTER DEFAULT PRIVILEGES IN SCHEMA public GRANT ALL ON SEQUENCES TO ticketbot;
ALTER DEFAULT PRIVILEGES IN SCHEMA public GRANT ALL ON FUNCTIONS TO ticketbot;
EOF

# Jarvis
echo "  Granting permissions to jarvis on homelab_jarvis database"
docker exec homelab-postgres psql -U postgres -d homelab_jarvis <<EOF
GRANT ALL PRIVILEGES ON DATABASE homelab_jarvis TO jarvis;
GRANT ALL ON SCHEMA public TO jarvis;
GRANT ALL ON ALL TABLES IN SCHEMA public TO jarvis;
GRANT ALL ON ALL SEQUENCES IN SCHEMA public TO jarvis;
GRANT ALL ON ALL FUNCTIONS IN SCHEMA public TO jarvis;
ALTER DEFAULT PRIVILEGES IN SCHEMA public GRANT ALL ON TABLES TO jarvis;
ALTER DEFAULT PRIVILEGES IN SCHEMA public GRANT ALL ON SEQUENCES TO jarvis;
ALTER DEFAULT PRIVILEGES IN SCHEMA public GRANT ALL ON FUNCTIONS TO jarvis;
EOF

echo ""

# Verify
echo "[4/4] Verifying users..."
docker exec homelab-postgres psql -U postgres -c "\du" | grep -E "streambot|ticketbot|jarvis"
echo ""

echo "══════════════════════════════════════════════════════"
echo "✅ ALL DATABASE USERS CREATED SUCCESSFULLY!"
echo "══════════════════════════════════════════════════════"
echo ""
echo "Users created:"
echo "  - streambot (for stream-bot service)"
echo "  - ticketbot (for discord-bot service)"  
echo "  - jarvis (for homelab-dashboard service)"
echo ""
echo "Next: Restart services to connect with new credentials"
