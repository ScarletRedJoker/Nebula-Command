#!/bin/bash
# Fix PostgreSQL database passwords for all services
set -e

echo "=========================================="
echo "Fixing Database Passwords"
echo "=========================================="

# Change to project directory
cd "$(dirname "$0")"

# Load environment
if [ -f .env ]; then
    set -a
    source .env
    set +a
else
    echo "ERROR: .env file not found"
    exit 1
fi

# Check required passwords
if [ -z "$JARVIS_DB_PASSWORD" ]; then
    echo "ERROR: JARVIS_DB_PASSWORD not set in .env"
    exit 1
fi

if [ -z "$STREAMBOT_DB_PASSWORD" ]; then
    echo "ERROR: STREAMBOT_DB_PASSWORD not set in .env"  
    exit 1
fi

# Set default for PowerDNS if not defined
if [ -z "$POWERDNS_DB_PASSWORD" ]; then
    echo "WARNING: POWERDNS_DB_PASSWORD not set, using default: BrsPowerDNS123"
    POWERDNS_DB_PASSWORD="BrsPowerDNS123"
    # Add to .env
    echo "" >> .env
    echo "# PowerDNS Database" >> .env
    echo "POWERDNS_DB_PASSWORD=BrsPowerDNS123" >> .env
    echo "PDNS_API_KEY=pdns-api-key-BrsPowerDNS" >> .env
    echo "✓ Added POWERDNS_DB_PASSWORD to .env"
fi

echo ""
echo "Using passwords from .env:"
echo "  - JARVIS_DB_PASSWORD: ${JARVIS_DB_PASSWORD:0:5}***"
echo "  - STREAMBOT_DB_PASSWORD: ${STREAMBOT_DB_PASSWORD:0:5}***"
echo "  - POWERDNS_DB_PASSWORD: ${POWERDNS_DB_PASSWORD:0:5}***"
echo ""

# Execute SQL to fix passwords and create missing databases
echo "Updating database passwords..."

docker exec discord-bot-db psql -v ON_ERROR_STOP=1 -U ticketbot -d ticketbot <<EOSQL
-- Fix jarvis user password
DO \$\$
BEGIN
    IF EXISTS (SELECT FROM pg_catalog.pg_roles WHERE rolname = 'jarvis') THEN
        ALTER ROLE jarvis WITH PASSWORD '${JARVIS_DB_PASSWORD}';
        RAISE NOTICE 'Updated password for user: jarvis';
    ELSE
        CREATE ROLE jarvis WITH LOGIN PASSWORD '${JARVIS_DB_PASSWORD}';
        RAISE NOTICE 'Created user: jarvis';
    END IF;
END
\$\$;

-- Create homelab_jarvis database if not exists
SELECT 'CREATE DATABASE homelab_jarvis OWNER jarvis'
WHERE NOT EXISTS (SELECT FROM pg_database WHERE datname = 'homelab_jarvis')\gexec

-- Create homelab_jarvis_demo database if not exists  
SELECT 'CREATE DATABASE homelab_jarvis_demo OWNER jarvis'
WHERE NOT EXISTS (SELECT FROM pg_database WHERE datname = 'homelab_jarvis_demo')\gexec

-- Grant privileges
GRANT ALL PRIVILEGES ON DATABASE homelab_jarvis TO jarvis;
GRANT ALL PRIVILEGES ON DATABASE homelab_jarvis_demo TO jarvis;

-- Fix streambot user password
DO \$\$
BEGIN
    IF EXISTS (SELECT FROM pg_catalog.pg_roles WHERE rolname = 'streambot') THEN
        ALTER ROLE streambot WITH PASSWORD '${STREAMBOT_DB_PASSWORD}';
        RAISE NOTICE 'Updated password for user: streambot';
    ELSE
        CREATE ROLE streambot WITH LOGIN PASSWORD '${STREAMBOT_DB_PASSWORD}';
        RAISE NOTICE 'Created user: streambot';
    END IF;
END
\$\$;

-- Create streambot database if not exists
SELECT 'CREATE DATABASE streambot OWNER streambot'
WHERE NOT EXISTS (SELECT FROM pg_database WHERE datname = 'streambot')\gexec

GRANT ALL PRIVILEGES ON DATABASE streambot TO streambot;

-- Create powerdns user and database if not exists
DO \$\$
BEGIN
    IF EXISTS (SELECT FROM pg_catalog.pg_roles WHERE rolname = 'powerdns') THEN
        ALTER ROLE powerdns WITH PASSWORD '${POWERDNS_DB_PASSWORD}';
        RAISE NOTICE 'Updated password for user: powerdns';
    ELSE
        CREATE ROLE powerdns WITH LOGIN PASSWORD '${POWERDNS_DB_PASSWORD}';
        RAISE NOTICE 'Created user: powerdns';
    END IF;
END
\$\$;

SELECT 'CREATE DATABASE powerdns OWNER powerdns'
WHERE NOT EXISTS (SELECT FROM pg_database WHERE datname = 'powerdns')\gexec

GRANT ALL PRIVILEGES ON DATABASE powerdns TO powerdns;

EOSQL

if [ $? -eq 0 ]; then
    echo "✓ Database passwords updated successfully!"
else
    echo "ERROR: Failed to update database passwords"
    exit 1
fi

echo ""
echo "=========================================="
echo "Restarting affected services..."
echo "=========================================="

# Restart services that depend on database (in dependency order)
SERVICES_TO_RESTART=(
    "homelab-dashboard"
    "homelab-dashboard-demo"
    "stream-bot"
    "discord-bot"
    "homelab-celery-worker"
    "powerdns"
)

for service in "${SERVICES_TO_RESTART[@]}"; do
    echo "Restarting $service..."
    docker compose -f docker-compose.unified.yml restart "$service" 2>/dev/null || echo "  (service not found, skipping)"
done

echo ""
echo "Waiting for services to start..."
sleep 15

# Show status
echo ""
echo "=========================================="
echo "Service Status:"
echo "=========================================="
docker ps --format "table {{.Names}}\t{{.Status}}" | grep -E "(dashboard|stream-bot|discord-bot|caddy|powerdns|celery)" || true

echo ""
echo "=========================================="
echo "✓ All done! Check the sites now:"
echo "  - https://host.evindrake.net (demo: demo/demo)"
echo "  - https://test.evindrake.net (demo: demo/demo)"
echo "  - https://stream.rig-city.com"
echo "  - https://bot.rig-city.com"
echo "  - https://vnc.evindrake.net"
echo "  - https://game.evindrake.net"
echo "=========================================="
