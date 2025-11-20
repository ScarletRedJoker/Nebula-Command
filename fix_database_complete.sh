#!/bin/bash

# Complete fix for agent tables migration issue
# This script:
# 1. Drops the problematic tables using the correct user
# 2. Rebuilds the dashboard container with the fixed migration code
# 3. Runs migrations
# 4. Restarts all services

set -e  # Exit on any error

echo "🔧 Complete fix for agent tables migration issue..."
echo ""

# Step 1: Drop tables using the jarvis user (not postgres)
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
    echo "❌ Failed to drop tables. Trying with ticketbot superuser..."
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

# Step 2: Rebuild the dashboard container to get the fixed migration code
echo "📝 Step 2: Rebuilding dashboard container with fixed migration code..."
docker compose build --no-cache homelab-dashboard

echo ""
echo "📝 Step 3: Stopping services..."
docker compose stop homelab-dashboard homelab-celery-worker

echo ""
echo "📝 Step 4: Starting dashboard and running migrations..."
docker compose up -d homelab-dashboard homelab-celery-worker

echo ""
echo "📝 Step 5: Waiting for migrations to complete..."
sleep 5

# Check migration logs
echo ""
echo "📋 Migration logs:"
docker logs homelab-dashboard 2>&1 | grep -A 5 "alembic" | tail -20

echo ""
echo "✅ Fix complete!"
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
