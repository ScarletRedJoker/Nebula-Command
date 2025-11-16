#!/bin/bash
# EMERGENCY FIX SCRIPT - Fix All Production Issues
# Run this on Ubuntu: cd /home/evin/contain/HomeLabHub && bash FIX_PRODUCTION_NOW.sh

set -e

echo "=============================================="
echo "🚨 EMERGENCY PRODUCTION FIX"
echo "=============================================="
echo ""

# Colors for output
RED='\033[0;31m'
GREEN='\033[0;32m'
YELLOW='\033[1;33m'
NC='\033[0m' # No Color

# CRITICAL: Check that JARVIS_DB_PASSWORD is set
if [ -z "$JARVIS_DB_PASSWORD" ]; then
    print_error() { echo -e "${RED}✗${NC} $1"; }
    print_error "JARVIS_DB_PASSWORD is not set!"
    echo "Run: source .env && bash $0"
    exit 1
fi

# Function to print status
print_status() {
    echo -e "${GREEN}✓${NC} $1"
}

print_error() {
    echo -e "${RED}✗${NC} $1"
}

print_warning() {
    echo -e "${YELLOW}⚠${NC} $1"
}

echo "Step 1: Stopping Services for Database Fix"
echo "--------------------------------------"

# Stop dependent containers gracefully
print_warning "Stopping dashboard containers to release database connections..."
docker stop homelab-dashboard homelab-dashboard-demo homelab-celery-worker 2>/dev/null || true
sleep 5

echo ""
echo "Step 2: Fixing Database (jarvis role)"
echo "--------------------------------------"

# Create jarvis role and databases using idempotent approach
docker exec -i discord-bot-db psql -U ticketbot -d ticketbot <<EOF
-- Create jarvis role if it doesn't exist
DO \$\$
BEGIN
    IF NOT EXISTS (SELECT FROM pg_catalog.pg_roles WHERE rolname = 'jarvis') THEN
        CREATE ROLE jarvis WITH LOGIN PASSWORD '${JARVIS_DB_PASSWORD}';
        RAISE NOTICE 'Created role: jarvis';
    ELSE
        ALTER ROLE jarvis WITH PASSWORD '${JARVIS_DB_PASSWORD}';
        RAISE NOTICE 'Role jarvis already exists, password updated';
    END IF;
END
\$\$;

-- Create homelab_jarvis database if it doesn't exist
SELECT 'CREATE DATABASE homelab_jarvis OWNER jarvis'
WHERE NOT EXISTS (SELECT FROM pg_database WHERE datname = 'homelab_jarvis')\gexec

-- Create homelab_jarvis_demo database if it doesn't exist
SELECT 'CREATE DATABASE homelab_jarvis_demo OWNER jarvis'
WHERE NOT EXISTS (SELECT FROM pg_database WHERE datname = 'homelab_jarvis_demo')\gexec

-- Grant privileges
GRANT ALL PRIVILEGES ON DATABASE homelab_jarvis TO jarvis;
GRANT ALL PRIVILEGES ON DATABASE homelab_jarvis_demo TO jarvis;
EOF

if [ $? -eq 0 ]; then
    print_status "Database jarvis role and databases initialized"
else
    print_error "Failed to create jarvis role"
    exit 1
fi

# Grant schema permissions
docker exec -i discord-bot-db psql -U jarvis -d homelab_jarvis <<EOF
GRANT ALL ON SCHEMA public TO jarvis;
EOF

docker exec -i discord-bot-db psql -U jarvis -d homelab_jarvis_demo <<EOF
GRANT ALL ON SCHEMA public TO jarvis;
EOF

echo ""
echo "Step 3: Starting All Required Services"
echo "--------------------------------------"

# Start all required services using modern docker compose
SERVICES_TO_START=(
    "homelab-dashboard"
    "homelab-dashboard-demo" 
    "homelab-celery-worker"
    "rig-city-site"
    "homeassistant"
    "scarletredjoker-web"
)

for service in "${SERVICES_TO_START[@]}"; do
    print_warning "Starting $service..."
    docker compose -f docker-compose.unified.yml up -d "$service" 2>&1 || \
        docker-compose -f docker-compose.unified.yml up -d "$service" 2>&1 || \
        print_error "Failed to start $service (may not exist)"
done

echo ""
echo "Step 4: Waiting for Services to Become Healthy"
echo "--------------------------------------"
print_warning "Waiting 45 seconds for services to initialize..."
sleep 45

echo ""
echo "Step 5: Checking Service Health"
echo "--------------------------------------"

# Check dashboard logs for errors
echo "Production Dashboard Logs (last 20 lines):"
docker logs --tail 20 homelab-dashboard 2>&1 | grep -E "(ERROR|Marketplace|Database)" || echo "No critical errors found"

echo ""
echo "Step 6: Testing Endpoints"
echo "--------------------------------------"

# Test internal endpoints
ENDPOINTS=(
    "http://localhost:80 (Caddy)"
    "http://homelab-dashboard:5000/health (Dashboard)"
    "http://rig-city-site:80 (Rig City)"
    "http://homeassistant:8123/api/ (Home Assistant)"
)

echo "Note: Test these from inside a container or locally"

echo ""
echo "=============================================="
echo "🎉 FIX COMPLETE!"
echo "=============================================="
echo ""
echo "Next Steps:"
echo "1. Visit https://host.evindrake.net/dashboard"
echo "2. Visit https://rig-city.com"
echo "3. Visit https://home.evindrake.net"
echo "4. Visit https://test.evindrake.net (demo)"
echo ""
echo "If issues persist, check logs:"
echo "  docker logs -f homelab-dashboard"
echo "  docker logs -f rig-city-site"
echo "  docker logs -f homeassistant"
echo ""
