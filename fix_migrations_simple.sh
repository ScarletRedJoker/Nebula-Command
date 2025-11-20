#!/bin/bash

# Simple fix for agent tables migration issue
# Connects directly to PostgreSQL database to drop tables

echo "🔧 Fixing agent tables migration issue..."
echo ""

# Drop tables directly via psql in the database container
echo "📝 Dropping old agent tables via psql..."
docker exec discord-bot-db psql -U postgres -d homelab_jarvis -c "
    DROP TABLE IF EXISTS agent_messages CASCADE;
    DROP TABLE IF EXISTS chat_history CASCADE;
    DROP TABLE IF EXISTS agent_conversations CASCADE;
    DROP TABLE IF EXISTS agent_tasks CASCADE;
    DROP TABLE IF EXISTS agents CASCADE;
"

if [ $? -eq 0 ]; then
    echo "✓ All agent tables dropped successfully"
    echo ""
    echo "📝 Running migrations..."
    docker exec homelab-dashboard python -m alembic upgrade head
    
    if [ $? -eq 0 ]; then
        echo ""
        echo "✅ Migration completed successfully!"
        echo ""
        echo "📝 Restarting services..."
        docker compose restart
        echo ""
        echo "🎉 All done! Your agent tables are now properly configured with UUID types."
    else
        echo ""
        echo "❌ Migration failed. Please check the error messages above."
        exit 1
    fi
else
    echo "❌ Failed to drop tables"
    exit 1
fi
