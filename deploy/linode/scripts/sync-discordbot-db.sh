#!/bin/bash
# Discord Bot Database Sync Script
# Run this after deploying to sync schema changes to production
# Usage: ./sync-discordbot-db.sh

set -e

RED='\033[0;31m'
GREEN='\033[0;32m'
YELLOW='\033[1;33m'
NC='\033[0m'

echo "═══ Discord Bot Database Sync ═══"
echo "Syncing schema to production database..."

CONTAINER="homelab-postgres"
DB="discord_bot"
USER="postgres"
ERRORS=0

# Function to run SQL (reports errors but continues)
run_sql() {
    local result
    if result=$(docker exec -i $CONTAINER psql -U $USER -d $DB -c "$1" 2>&1); then
        echo -e "  ${GREEN}✓${NC} $2"
    else
        if echo "$result" | grep -q "already exists"; then
            echo -e "  ${YELLOW}○${NC} $2 (already exists)"
        else
            echo -e "  ${RED}✗${NC} $2: $result"
            ((ERRORS++))
        fi
    fi
}

echo "[1/6] Creating bot_settings table..."
run_sql "CREATE TABLE IF NOT EXISTS bot_settings (
    id SERIAL PRIMARY KEY,
    server_id TEXT NOT NULL UNIQUE,
    bot_name TEXT DEFAULT 'Ticket Bot',
    bot_nickname TEXT,
    bot_prefix TEXT DEFAULT '!',
    welcome_message TEXT DEFAULT 'Thank you for creating a ticket. Our support team will assist you shortly.',
    notifications_enabled BOOLEAN DEFAULT true,
    admin_role_id TEXT,
    support_role_id TEXT,
    auto_close_enabled BOOLEAN DEFAULT false,
    auto_close_hours TEXT DEFAULT '48',
    default_priority TEXT DEFAULT 'normal',
    debug_mode BOOLEAN DEFAULT false,
    log_channel_id TEXT,
    ticket_channel_id TEXT,
    dashboard_url TEXT,
    admin_channel_id TEXT,
    public_log_channel_id TEXT,
    admin_notifications_enabled BOOLEAN DEFAULT true,
    send_copy_to_admin_channel BOOLEAN DEFAULT false,
    thread_integration_enabled BOOLEAN DEFAULT false,
    thread_channel_id TEXT,
    thread_auto_create BOOLEAN DEFAULT true,
    thread_bidirectional_sync BOOLEAN DEFAULT true,
    starboard_channel_id TEXT,
    starboard_threshold INTEGER DEFAULT 3,
    starboard_emoji TEXT DEFAULT '⭐',
    starboard_enabled BOOLEAN DEFAULT false,
    welcome_channel_id TEXT,
    welcome_message_template TEXT DEFAULT 'Welcome to {server}, {user}! You are member #{memberCount}.',
    goodbye_message_template TEXT DEFAULT 'Goodbye {user}, we will miss you!',
    welcome_enabled BOOLEAN DEFAULT false,
    goodbye_enabled BOOLEAN DEFAULT false,
    auto_role_ids TEXT,
    xp_enabled BOOLEAN DEFAULT false,
    level_up_channel_id TEXT,
    level_up_message TEXT DEFAULT 'Congratulations {user}! You have reached level {level}!',
    level_roles TEXT,
    xp_cooldown_seconds INTEGER DEFAULT 60,
    xp_min_amount INTEGER DEFAULT 15,
    xp_max_amount INTEGER DEFAULT 25,
    logging_channel_id TEXT,
    log_message_edits BOOLEAN DEFAULT true,
    log_message_deletes BOOLEAN DEFAULT true,
    log_member_joins BOOLEAN DEFAULT true,
    log_member_leaves BOOLEAN DEFAULT true,
    log_mod_actions BOOLEAN DEFAULT true,
    auto_mod_enabled BOOLEAN DEFAULT false,
    banned_words TEXT,
    link_whitelist TEXT,
    link_filter_enabled BOOLEAN DEFAULT false,
    spam_threshold INTEGER DEFAULT 5,
    spam_time_window INTEGER DEFAULT 5,
    auto_mod_action TEXT DEFAULT 'warn',
    suggestion_channel_id TEXT,
    birthday_channel_id TEXT,
    birthday_role_id TEXT,
    birthday_message TEXT DEFAULT 'Happy Birthday {user}! Hope you have an amazing day!',
    birthday_enabled BOOLEAN DEFAULT false,
    invite_log_channel_id TEXT,
    invite_tracking_enabled BOOLEAN DEFAULT false,
    boost_channel_id TEXT,
    boost_thank_message TEXT DEFAULT 'Thank you {user} for boosting the server! You are amazing!',
    boost_role_id TEXT,
    boost_tracking_enabled BOOLEAN DEFAULT false,
    plex_request_channel_id TEXT,
    plex_admin_role_id TEXT,
    created_at TIMESTAMP DEFAULT NOW(),
    updated_at TIMESTAMP DEFAULT NOW()
);" "bot_settings table"

echo "[2/6] Syncing stream_tracked_users table..."
run_sql "ALTER TABLE stream_tracked_users ADD COLUMN IF NOT EXISTS platform_usernames JSONB DEFAULT '{}'::jsonb;" "platform_usernames column"
run_sql "ALTER TABLE stream_tracked_users ADD COLUMN IF NOT EXISTS connected_platforms TEXT[] DEFAULT ARRAY[]::TEXT[];" "connected_platforms column"
run_sql "ALTER TABLE stream_tracked_users ADD COLUMN IF NOT EXISTS last_notified_at TIMESTAMP;" "last_notified_at column"

echo "[3/6] Syncing stream_notification_settings table..."
run_sql "ALTER TABLE stream_notification_settings ADD COLUMN IF NOT EXISTS notify_all_members BOOLEAN DEFAULT false NOT NULL;" "notify_all_members column"
run_sql "ALTER TABLE stream_notification_settings ADD COLUMN IF NOT EXISTS game_filter TEXT;" "game_filter column"
run_sql "ALTER TABLE stream_notification_settings ADD COLUMN IF NOT EXISTS cooldown_minutes INTEGER DEFAULT 60 NOT NULL;" "cooldown_minutes column"
run_sql "ALTER TABLE stream_notification_settings ADD COLUMN IF NOT EXISTS streaming_role_id TEXT;" "streaming_role_id column"
run_sql "ALTER TABLE stream_notification_settings ADD COLUMN IF NOT EXISTS required_role_id TEXT;" "required_role_id column"

echo "[4/6] Creating stream_notification_log table..."
run_sql "CREATE TABLE IF NOT EXISTS stream_notification_log (
    id SERIAL PRIMARY KEY,
    server_id TEXT NOT NULL,
    discord_user_id TEXT NOT NULL,
    platform TEXT NOT NULL,
    stream_id TEXT,
    notified_at TIMESTAMP DEFAULT NOW() NOT NULL,
    source TEXT NOT NULL
);" "stream_notification_log table"
run_sql "CREATE INDEX IF NOT EXISTS idx_notification_log_lookup ON stream_notification_log(server_id, discord_user_id, stream_id);" "notification_log index"

echo "[5/6] Creating thread_mappings table..."
run_sql "CREATE TABLE IF NOT EXISTS thread_mappings (
    id SERIAL PRIMARY KEY,
    thread_id TEXT NOT NULL UNIQUE,
    ticket_id INTEGER NOT NULL,
    server_id TEXT NOT NULL,
    channel_id TEXT,
    created_at TIMESTAMP DEFAULT NOW()
);" "thread_mappings table"

echo "[6/6] Granting permissions..."
# Skip grants if discord_bot role doesn't exist (services connect as main user)
if docker exec -i $CONTAINER psql -U $USER -d $DB -c "SELECT 1 FROM pg_roles WHERE rolname='discord_bot'" 2>/dev/null | grep -q "1"; then
    run_sql "GRANT ALL PRIVILEGES ON ALL TABLES IN SCHEMA public TO discord_bot;" "table permissions"
    run_sql "GRANT ALL PRIVILEGES ON ALL SEQUENCES IN SCHEMA public TO discord_bot;" "sequence permissions"
else
    echo -e "  ${YELLOW}○${NC} Skipping grants (discord_bot role not configured - services use main user)"
fi

echo ""
echo "═══ Verification ═══"
for table in tickets bot_settings stream_tracked_users stream_notification_settings stream_notification_log thread_mappings; do
    if docker exec -i $CONTAINER psql -U $USER -d $DB -c "\\dt $table" 2>/dev/null | grep -q $table; then
        echo -e "  ${GREEN}✓${NC} $table exists"
    else
        echo -e "  ${RED}✗${NC} $table MISSING"
        ((ERRORS++))
    fi
done

echo ""
if [ $ERRORS -gt 0 ]; then
    echo -e "${RED}✗ Sync completed with $ERRORS errors${NC}"
    echo "Check the output above for details."
    exit 1
else
    echo -e "${GREEN}✓ Database sync complete!${NC}"
fi
echo ""
echo "Restart discord-bot to apply changes:"
echo "  docker restart discord-bot"
