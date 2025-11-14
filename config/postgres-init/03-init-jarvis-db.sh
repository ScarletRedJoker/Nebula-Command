#!/bin/bash
set -e

echo "=================================================="
echo "Initializing Homelab Jarvis Database"
echo "=================================================="

# Create Jarvis database for the Homelab Dashboard
if [ -n "$JARVIS_DB_PASSWORD" ]; then
    echo "Creating homelab_jarvis database and user (if not exists)..."
    
    psql -v ON_ERROR_STOP=1 --username "$POSTGRES_USER" --dbname "$POSTGRES_DB" <<-EOSQL
        -- Create user if not exists
        DO \$\$
        BEGIN
            IF NOT EXISTS (SELECT FROM pg_catalog.pg_roles WHERE rolname = 'jarvis') THEN
                CREATE ROLE jarvis WITH LOGIN PASSWORD '$JARVIS_DB_PASSWORD';
                RAISE NOTICE 'Created user: jarvis';
            ELSE
                -- Update password in case it changed
                ALTER ROLE jarvis WITH PASSWORD '$JARVIS_DB_PASSWORD';
                RAISE NOTICE 'User jarvis already exists, password updated';
            END IF;
        END
        \$\$;
        
        -- Create database if not exists
        SELECT 'CREATE DATABASE homelab_jarvis OWNER jarvis'
        WHERE NOT EXISTS (SELECT FROM pg_database WHERE datname = 'homelab_jarvis')\gexec
        
        -- Grant all privileges
        GRANT ALL PRIVILEGES ON DATABASE homelab_jarvis TO jarvis;
EOSQL

    echo "✓ Homelab Jarvis database ready"
else
    echo "⚠ WARNING: JARVIS_DB_PASSWORD not set, skipping homelab_jarvis database"
fi

echo "=================================================="
