#!/bin/bash
# Stream Bot Database Sync Script
# Run this after deploying to sync schema changes to production
# Usage: ./sync-streambot-db.sh

set -e

echo "═══ Stream Bot Database Sync ═══"
echo "Syncing schema to production database..."

CONTAINER="homelab-postgres"
DB="streambot"
USER="postgres"

# Function to run SQL
run_sql() {
    docker exec -i $CONTAINER psql -U $USER -d $DB -c "$1" 2>/dev/null || true
}

echo "[1/6] Syncing users table..."
run_sql "ALTER TABLE users ADD COLUMN IF NOT EXISTS discord_id VARCHAR(20);"
run_sql "ALTER TABLE users ADD COLUMN IF NOT EXISTS personal_presence_enabled BOOLEAN DEFAULT false NOT NULL;"
run_sql "ALTER TABLE users ADD COLUMN IF NOT EXISTS dismissed_welcome BOOLEAN DEFAULT false NOT NULL;"
run_sql "ALTER TABLE users ADD COLUMN IF NOT EXISTS onboarding_step INTEGER DEFAULT 0 NOT NULL;"

echo "[2/6] Syncing platform_connections table..."
run_sql "ALTER TABLE platform_connections ADD COLUMN IF NOT EXISTS needs_refresh BOOLEAN DEFAULT false NOT NULL;"
run_sql "ALTER TABLE platform_connections ADD COLUMN IF NOT EXISTS channel_id TEXT;"

echo "[3/6] Creating oauth_sessions table..."
run_sql "CREATE TABLE IF NOT EXISTS oauth_sessions (
    id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    state TEXT NOT NULL UNIQUE,
    user_id TEXT NOT NULL,
    platform TEXT NOT NULL,
    code_verifier TEXT,
    metadata JSONB,
    created_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
    expires_at TIMESTAMPTZ NOT NULL,
    used_at TIMESTAMPTZ,
    ip_address TEXT
);"
run_sql "CREATE INDEX IF NOT EXISTS oauth_sessions_state_idx ON oauth_sessions(state);"
run_sql "CREATE INDEX IF NOT EXISTS oauth_sessions_expires_at_idx ON oauth_sessions(expires_at);"
run_sql "CREATE INDEX IF NOT EXISTS oauth_sessions_user_id_idx ON oauth_sessions(user_id);"

echo "[4/6] Creating webhook_queue table..."
run_sql "CREATE TABLE IF NOT EXISTS webhook_queue (
    id VARCHAR PRIMARY KEY DEFAULT gen_random_uuid(),
    user_id VARCHAR NOT NULL,
    platform TEXT NOT NULL,
    payload TEXT NOT NULL,
    attempts INTEGER DEFAULT 0 NOT NULL,
    max_attempts INTEGER DEFAULT 5 NOT NULL,
    last_attempt_at TIMESTAMP,
    next_retry_at TIMESTAMP,
    status TEXT DEFAULT 'pending' NOT NULL,
    error_message TEXT,
    created_at TIMESTAMP DEFAULT NOW() NOT NULL
);"
run_sql "CREATE INDEX IF NOT EXISTS webhook_queue_status_idx ON webhook_queue(status);"
run_sql "CREATE INDEX IF NOT EXISTS webhook_queue_next_retry_idx ON webhook_queue(next_retry_at);"

echo "[5/6] Creating custom_commands table..."
run_sql "CREATE TABLE IF NOT EXISTS custom_commands (
    id VARCHAR PRIMARY KEY DEFAULT gen_random_uuid(),
    user_id VARCHAR NOT NULL REFERENCES users(id) ON DELETE CASCADE,
    name TEXT NOT NULL,
    response TEXT NOT NULL,
    cooldown INTEGER DEFAULT 0 NOT NULL,
    permission TEXT DEFAULT 'everyone' NOT NULL,
    is_active BOOLEAN DEFAULT true NOT NULL,
    usage_count INTEGER DEFAULT 0 NOT NULL,
    last_used_at TIMESTAMP,
    created_at TIMESTAMP DEFAULT NOW() NOT NULL,
    updated_at TIMESTAMP DEFAULT NOW() NOT NULL
);"
run_sql "CREATE UNIQUE INDEX IF NOT EXISTS custom_commands_user_id_name_unique ON custom_commands(user_id, name);"

echo "[6/6] Granting permissions..."
run_sql "GRANT ALL PRIVILEGES ON ALL TABLES IN SCHEMA public TO streambot;"
run_sql "GRANT ALL PRIVILEGES ON ALL SEQUENCES IN SCHEMA public TO streambot;"

echo ""
echo "✓ Database sync complete!"
echo ""
echo "Restart stream-bot to apply changes:"
echo "  docker restart stream-bot"
