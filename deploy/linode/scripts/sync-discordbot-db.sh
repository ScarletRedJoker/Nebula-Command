#!/bin/bash
# Discord Bot Database Sync Script
# Run this after deploying to sync schema changes to production
# Usage: ./sync-discordbot-db.sh

set -e

echo "═══ Discord Bot Database Sync ═══"
echo "Syncing schema to production database..."

CONTAINER="homelab-postgres"
DB="discord_bot"
USER="postgres"

# Function to run SQL
run_sql() {
    docker exec -i $CONTAINER psql -U $USER -d $DB -c "$1" 2>/dev/null || true
}

echo "[1/5] Syncing stream_tracked_users table..."
run_sql "ALTER TABLE stream_tracked_users ADD COLUMN IF NOT EXISTS platform_usernames JSONB DEFAULT '{}'::jsonb;"
run_sql "ALTER TABLE stream_tracked_users ADD COLUMN IF NOT EXISTS connected_platforms TEXT[] DEFAULT ARRAY[]::TEXT[];"
run_sql "ALTER TABLE stream_tracked_users ADD COLUMN IF NOT EXISTS last_notified_at TIMESTAMP;"

echo "[2/5] Syncing stream_notification_settings table..."
run_sql "ALTER TABLE stream_notification_settings ADD COLUMN IF NOT EXISTS notify_all_members BOOLEAN DEFAULT false NOT NULL;"
run_sql "ALTER TABLE stream_notification_settings ADD COLUMN IF NOT EXISTS game_filter TEXT;"
run_sql "ALTER TABLE stream_notification_settings ADD COLUMN IF NOT EXISTS cooldown_minutes INTEGER DEFAULT 60 NOT NULL;"
run_sql "ALTER TABLE stream_notification_settings ADD COLUMN IF NOT EXISTS streaming_role_id TEXT;"
run_sql "ALTER TABLE stream_notification_settings ADD COLUMN IF NOT EXISTS required_role_id TEXT;"

echo "[3/5] Creating stream_notification_log table..."
run_sql "CREATE TABLE IF NOT EXISTS stream_notification_log (
    id SERIAL PRIMARY KEY,
    server_id TEXT NOT NULL,
    discord_user_id TEXT NOT NULL,
    platform TEXT NOT NULL,
    stream_id TEXT,
    notified_at TIMESTAMP DEFAULT NOW() NOT NULL,
    source TEXT NOT NULL
);"
run_sql "CREATE INDEX IF NOT EXISTS idx_notification_log_lookup ON stream_notification_log(server_id, discord_user_id, stream_id);"

echo "[4/5] Creating thread_mappings table..."
run_sql "CREATE TABLE IF NOT EXISTS thread_mappings (
    id SERIAL PRIMARY KEY,
    thread_id TEXT NOT NULL UNIQUE,
    ticket_id INTEGER NOT NULL,
    server_id TEXT NOT NULL,
    channel_id TEXT,
    created_at TIMESTAMP DEFAULT NOW()
);"

echo "[5/5] Granting permissions..."
run_sql "GRANT ALL PRIVILEGES ON ALL TABLES IN SCHEMA public TO discord_bot;"
run_sql "GRANT ALL PRIVILEGES ON ALL SEQUENCES IN SCHEMA public TO discord_bot;"

echo ""
echo "✓ Database sync complete!"
echo ""
echo "Restart discord-bot to apply changes:"
echo "  docker restart discord-bot"
