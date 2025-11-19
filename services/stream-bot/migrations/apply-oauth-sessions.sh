#!/bin/bash
set -e

echo "════════════════════════════════════════════════════════════════"
echo "  📊 Applying Stream Bot OAuth Sessions Migration"
echo "════════════════════════════════════════════════════════════════"
echo ""

# Check if PostgreSQL is running
if ! docker ps | grep -q discord-bot-db; then
    echo "❌ ERROR: discord-bot-db container is not running"
    echo "   Please start the container first"
    exit 1
fi

# Get script directory
SCRIPT_DIR="$(cd "$(dirname "${BASH_SOURCE[0]}")" && pwd)"
MIGRATION_FILE="$SCRIPT_DIR/0005_add_oauth_sessions.sql"

# Check if migration file exists
if [ ! -f "$MIGRATION_FILE" ]; then
    echo "❌ ERROR: Migration file not found: $MIGRATION_FILE"
    exit 1
fi

echo "Step 1: Checking if oauth_sessions table already exists..."
TABLE_EXISTS=$(docker exec discord-bot-db psql -U postgres -d streambot -tAc \
    "SELECT EXISTS (SELECT FROM pg_tables WHERE schemaname = 'public' AND tablename = 'oauth_sessions');")

if [ "$TABLE_EXISTS" = "t" ]; then
    echo "✅ oauth_sessions table already exists - skipping migration"
    echo ""
    echo "Table info:"
    docker exec discord-bot-db psql -U postgres -d streambot -c \
        "SELECT tablename, schemaname, hasindexes, hastriggers FROM pg_tables WHERE tablename = 'oauth_sessions';"
    exit 0
fi

echo "⏳ oauth_sessions table not found - applying migration..."
echo ""

echo "Step 2: Applying migration 0005_add_oauth_sessions.sql..."
docker exec -i discord-bot-db psql -U postgres -d streambot < "$MIGRATION_FILE"

echo ""
echo "Step 3: Verifying migration..."
docker exec discord-bot-db psql -U postgres -d streambot -c \
    "SELECT tablename, schemaname, hasindexes, hastriggers FROM pg_tables WHERE tablename = 'oauth_sessions';"

echo ""
echo "Step 4: Counting rows..."
docker exec discord-bot-db psql -U postgres -d streambot -tAc \
    "SELECT COUNT(*) || ' rows' as oauth_sessions_count FROM oauth_sessions;"

echo ""
echo "════════════════════════════════════════════════════════════════"
echo "  ✅ MIGRATION COMPLETE!"
echo "════════════════════════════════════════════════════════════════"
echo ""
echo "Next steps:"
echo "  1. Restart stream-bot service:"
echo "     docker-compose -f docker-compose.unified.yml restart stream-bot"
echo "  2. Check logs for oauth_sessions errors (should be gone):"
echo "     docker logs stream-bot --tail 50"
echo ""
