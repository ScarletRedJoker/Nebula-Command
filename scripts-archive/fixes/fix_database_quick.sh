#!/bin/bash

# Quick fix for agent tables migration issue (no rebuild required)
# This script:
# 1. Drops the problematic tables
# 2. Copies the fixed migration file into the running container
# 3. Runs migrations

set -e  # Exit on any error

echo "🔧 Quick fix for agent tables migration issue..."
echo ""

# Step 1: Drop tables using the jarvis user
echo "📝 Step 1: Dropping old agent tables..."
docker exec discord-bot-db psql -U jarvis -d homelab_jarvis << 'EOF'
DROP TABLE IF EXISTS agent_messages CASCADE;
DROP TABLE IF EXISTS chat_history CASCADE;
DROP TABLE IF EXISTS agent_conversations CASCADE;
DROP TABLE IF EXISTS agent_tasks CASCADE;
DROP TABLE IF EXISTS agents CASCADE;
\echo 'All agent tables dropped successfully'
EOF

if [ $? -ne 0 ]; then
    echo "⚠️  Failed with jarvis user, trying ticketbot superuser..."
    docker exec discord-bot-db psql -U ticketbot -d homelab_jarvis << 'EOF'
DROP TABLE IF EXISTS agent_messages CASCADE;
DROP TABLE IF EXISTS chat_history CASCADE;
DROP TABLE IF EXISTS agent_conversations CASCADE;
DROP TABLE IF EXISTS agent_tasks CASCADE;
DROP TABLE IF EXISTS agents CASCADE;
\echo 'All agent tables dropped successfully'
EOF
fi

echo "✓ Tables dropped successfully"
echo ""

# Step 2: Copy the fixed migration file into the container
echo "📝 Step 2: Updating migration file in container..."
docker cp services/dashboard/alembic/versions/014_create_agents_table.py \
    homelab-dashboard:/app/alembic/versions/014_create_agents_table.py

echo "✓ Migration file updated"
echo ""

# Step 3: Run migrations
echo "📝 Step 3: Running migrations..."
docker exec homelab-dashboard python -m alembic upgrade head

if [ $? -eq 0 ]; then
    echo ""
    echo "✅ Migration completed successfully!"
    echo ""
    echo "🔍 Verifying tables were created with correct types..."
    docker exec discord-bot-db psql -U jarvis -d homelab_jarvis -c "
SELECT 
    table_name, 
    column_name, 
    data_type 
FROM information_schema.columns 
WHERE table_name IN ('agents', 'agent_messages', 'agent_tasks', 'agent_conversations')
    AND column_name LIKE '%id%'
ORDER BY table_name, column_name;
"
    echo ""
    echo "🎉 All done! If you see UUID types above, the migration succeeded!"
else
    echo ""
    echo "❌ Migration failed. Try running fix_database_complete.sh instead."
    exit 1
fi
