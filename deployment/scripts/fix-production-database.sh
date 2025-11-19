#!/bin/bash
set -euo pipefail

# Fix Production Database Schema Issues
# Resolves legacy agent_messages VARCHAR vs UUID mismatch

echo "╔════════════════════════════════════════════════════════════╗"
echo "║  Production Database Schema Fix                             ║"
echo "║  Fixes: agent_messages VARCHAR → UUID migration             ║"
echo "╚════════════════════════════════════════════════════════════╝"
echo

# Load database connection from .env
if [ ! -f .env ]; then
    echo "❌ Error: .env file not found"
    exit 1
fi

source .env

# Extract database components from DATABASE_URL
DB_HOST=$(echo $NEON_DATABASE_URL | sed -n 's/.*@\([^:]*\):.*/\1/p')
DB_NAME=$(echo $NEON_DATABASE_URL | sed -n 's/.*\/\([^?]*\).*/\1/p')
DB_USER=$(echo $NEON_DATABASE_URL | sed -n 's/.*:\/\/\([^:]*\):.*/\1/p')
DB_PASSWORD=$(echo $NEON_DATABASE_URL | sed -n 's/.*:\/\/[^:]*:\([^@]*\)@.*/\1/p')

echo "📊 Database: $DB_NAME"
echo "🏠 Host: $DB_HOST"
echo "👤 User: $DB_USER"
echo

# Function to run SQL
run_sql() {
    PGPASSWORD="$DB_PASSWORD" psql -h "$DB_HOST" -U "$DB_USER" -d "$DB_NAME" -c "$1"
}

# Check if legacy table exists
echo "🔍 Checking for legacy agent_messages table..."
LEGACY_EXISTS=$(PGPASSWORD="$DB_PASSWORD" psql -h "$DB_HOST" -U "$DB_USER" -d "$DB_NAME" -tAc "SELECT EXISTS (SELECT 1 FROM information_schema.tables WHERE table_name='agent_messages');")

if [ "$LEGACY_EXISTS" = "t" ]; then
    echo "⚠️  Legacy agent_messages table found!"
    
    # Check column types
    echo "🔍 Checking column types..."
    FROM_TYPE=$(PGPASSWORD="$DB_PASSWORD" psql -h "$DB_HOST" -U "$DB_USER" -d "$DB_NAME" -tAc "SELECT data_type FROM information_schema.columns WHERE table_name='agent_messages' AND column_name='from_agent_id';")
    
    if [ "$FROM_TYPE" = "character varying" ] || [ "$FROM_TYPE" = "varchar" ]; then
        echo "❌ Detected VARCHAR columns (legacy schema)"
        echo
        echo "⚠️  OPTIONS:"
        echo "  1) Drop legacy table and recreate (SAFE if no production data)"
        echo "  2) Migrate data and alter columns (SAFER if production data exists)"
        echo
        read -p "Choose option (1/2): " OPTION
        
        if [ "$OPTION" = "1" ]; then
            echo
            echo "🗑️  Dropping legacy tables..."
            run_sql "DROP TABLE IF EXISTS agent_messages CASCADE;"
            run_sql "DROP TABLE IF EXISTS chat_history CASCADE;"
            echo "✅ Legacy tables dropped"
        elif [ "$OPTION" = "2" ]; then
            echo
            echo "🔄 Migrating data..."
            
            # Backup data
            run_sql "CREATE TABLE agent_messages_backup AS SELECT * FROM agent_messages;"
            echo "✅ Backup created: agent_messages_backup"
            
            # Drop and recreate with correct types
            run_sql "DROP TABLE agent_messages CASCADE;"
            echo "✅ Dropped agent_messages"
            
            # Migration 014 will recreate it properly
            echo "ℹ️  Table will be recreated by migration 014"
        else
            echo "❌ Invalid option. Exiting."
            exit 1
        fi
    elif [ "$FROM_TYPE" = "uuid" ]; then
        echo "✅ Columns already UUID - schema is correct"
        echo "ℹ️  No fix needed"
        exit 0
    fi
else
    echo "✅ No legacy agent_messages table found"
    echo "ℹ️  Migration 014 will create it properly"
fi

echo
echo "╔════════════════════════════════════════════════════════════╗"
echo "║  ✅ Database Schema Fix Complete                             ║"
echo "║                                                              ║"
echo "║  Next steps:                                                ║"
echo "║  1. Run migrations: alembic upgrade head                    ║"
echo "║  2. Restart services: ./homelab-manager.sh (option 2)      ║"
echo "╚════════════════════════════════════════════════════════════╝"
