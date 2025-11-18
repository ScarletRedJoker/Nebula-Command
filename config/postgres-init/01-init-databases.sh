#!/bin/bash
set -e

echo "=================================================="
echo "Initializing Multiple Databases for Homelab"
echo "Using least-privilege app user for all services"
echo "=================================================="

# Create a non-superuser role for all applications
echo "Creating homelab_app user (non-superuser)..."
psql -v ON_ERROR_STOP=1 --username "$POSTGRES_USER" --dbname "$POSTGRES_DB" <<-EOSQL
    -- Create non-superuser app role if not exists
    DO \$\$
    BEGIN
        IF NOT EXISTS (SELECT FROM pg_catalog.pg_roles WHERE rolname = 'homelab_app') THEN
            CREATE ROLE homelab_app WITH LOGIN PASSWORD '$DISCORD_DB_PASSWORD';
        ELSE
            ALTER ROLE homelab_app WITH PASSWORD '$DISCORD_DB_PASSWORD';
        END IF;
    END
    \$\$;
EOSQL

echo "✓ homelab_app user created (non-superuser)"

# Function to create database and grant full privileges to homelab_app
create_database() {
    local db_name=$1
    
    echo "Creating database: $db_name (owned by homelab_app)"
    
    psql -v ON_ERROR_STOP=1 --username "$POSTGRES_USER" --dbname "$POSTGRES_DB" <<-EOSQL
        -- Create database if not exists (owned by homelab_app)
        SELECT 'CREATE DATABASE $db_name OWNER homelab_app'
        WHERE NOT EXISTS (SELECT FROM pg_database WHERE datname = '$db_name')\gexec
        
        -- Grant all privileges to homelab_app
        GRANT ALL PRIVILEGES ON DATABASE $db_name TO homelab_app;
EOSQL

    # Transfer database ownership to homelab_app
    echo "Transferring database ownership to homelab_app..."
    psql -v ON_ERROR_STOP=1 --username "$POSTGRES_USER" --dbname "$POSTGRES_DB" <<-EOSQL
        -- Transfer database ownership
        ALTER DATABASE $db_name OWNER TO homelab_app;
EOSQL

    # Connect to the new database and grant schema/table privileges
    echo "Granting schema and table privileges to homelab_app on $db_name..."
    psql -v ON_ERROR_STOP=1 --username "$POSTGRES_USER" --dbname "$db_name" <<-EOSQL
        -- Grant all privileges on the public schema
        GRANT ALL ON SCHEMA public TO homelab_app;
        
        -- Grant all privileges on all existing tables
        GRANT ALL PRIVILEGES ON ALL TABLES IN SCHEMA public TO homelab_app;
        
        -- Grant all privileges on all existing sequences
        GRANT ALL PRIVILEGES ON ALL SEQUENCES IN SCHEMA public TO homelab_app;
        
        -- Grant all privileges on all existing functions
        GRANT ALL PRIVILEGES ON ALL FUNCTIONS IN SCHEMA public TO homelab_app;
        
        -- Set default privileges for future objects
        ALTER DEFAULT PRIVILEGES IN SCHEMA public GRANT ALL ON TABLES TO homelab_app;
        ALTER DEFAULT PRIVILEGES IN SCHEMA public GRANT ALL ON SEQUENCES TO homelab_app;
        ALTER DEFAULT PRIVILEGES IN SCHEMA public GRANT ALL ON FUNCTIONS TO homelab_app;
        
        -- Reassign objects owned by legacy users (if they exist)
        DO \$\$
        BEGIN
            -- Transfer from streambot if role exists
            IF EXISTS (SELECT FROM pg_catalog.pg_roles WHERE rolname = 'streambot') THEN
                REASSIGN OWNED BY streambot TO homelab_app;
                RAISE NOTICE 'Transferred objects from streambot to homelab_app';
            END IF;
            
            -- Transfer from jarvis if role exists
            IF EXISTS (SELECT FROM pg_catalog.pg_roles WHERE rolname = 'jarvis') THEN
                REASSIGN OWNED BY jarvis TO homelab_app;
                RAISE NOTICE 'Transferred objects from jarvis to homelab_app';
            END IF;
        END \$\$;
EOSQL

    echo "✓ Database $db_name created and privileges granted successfully"
}

# Create Stream Bot database (owned by homelab_app)
create_database "streambot"

# Create Jarvis Dashboard database (owned by homelab_app)
create_database "homelab_jarvis"

echo "=================================================="
echo "✓ All databases initialized successfully"
echo "  • ticketbot (discord bot database, owned by ticketbot superuser)"
echo "  • streambot (stream bot database, owned by homelab_app)"  
echo "  • homelab_jarvis (dashboard database, owned by homelab_app)"
echo ""
echo "  Application user: homelab_app (non-superuser, least privilege)"
echo "  Superuser: ticketbot (private to database container)"
echo "=================================================="
