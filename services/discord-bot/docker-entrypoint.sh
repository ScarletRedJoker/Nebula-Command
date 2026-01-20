#!/bin/bash
set -e

echo "================================================"
echo "  Discord Bot Starting..."
echo "================================================"
echo ""

# Check critical environment variables
echo "Checking required environment variables..."
STARTUP_ERRORS=0

# Check DATABASE_URL
if [ -z "$DATABASE_URL" ] && [ -z "$DISCORD_DATABASE_URL" ]; then
    echo "❌ ERROR: DATABASE_URL or DISCORD_DATABASE_URL not set"
    STARTUP_ERRORS=$((STARTUP_ERRORS + 1))
else
    echo "✓ Database URL configured"
fi

# Check DISCORD_TOKEN
if [ -z "$DISCORD_TOKEN" ]; then
    echo "❌ ERROR: DISCORD_TOKEN not set"
    STARTUP_ERRORS=$((STARTUP_ERRORS + 1))
else
    echo "✓ DISCORD_TOKEN configured"
fi

# Check SESSION_SECRET
if [ -z "$SESSION_SECRET" ]; then
    echo "⚠️ WARNING: SESSION_SECRET not set (using default)"
else
    echo "✓ SESSION_SECRET configured"
fi

# Check LOCAL_AI_ONLY mode
if [ "$LOCAL_AI_ONLY" = "true" ] || [ "$LOCAL_AI_ONLY" = "1" ]; then
    echo "✓ LOCAL_AI_ONLY mode enabled"
    
    # Check Ollama URL
    OLLAMA_URL=${OLLAMA_URL:-${LOCAL_AI_URL:-http://localhost:11434}}
    echo "  Ollama URL: $OLLAMA_URL"
    
    # Check if Ollama is reachable
    if command -v curl &> /dev/null; then
        if curl -s --connect-timeout 5 "${OLLAMA_URL}/api/tags" > /dev/null 2>&1; then
            echo "  ✓ Ollama is accessible"
        else
            echo "  ⚠️ WARNING: Ollama is not accessible at $OLLAMA_URL"
            echo "    AI features will be unavailable until Ollama is running"
        fi
    fi
else
    echo "○ LOCAL_AI_ONLY mode disabled"
fi

# Exit early if critical secrets are missing
if [ "$STARTUP_ERRORS" -gt 0 ]; then
    echo ""
    echo "━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━"
    echo "FATAL: $STARTUP_ERRORS required secrets missing!"
    echo "Check configuration in deploy/linode/.env"
    echo "━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━"
    exit 1
fi

echo ""
echo "Waiting for PostgreSQL to be ready..."

# Extract PostgreSQL host from DATABASE_URL if available
# DATABASE_URL format: postgresql://user:password@hostname:5432/database
DATABASE_URL_TO_USE=${DISCORD_DATABASE_URL:-$DATABASE_URL}
if [ -n "$DATABASE_URL_TO_USE" ]; then
  POSTGRES_HOST=$(echo "$DATABASE_URL_TO_USE" | sed -n 's/.*@\([^:]*\):.*/\1/p')
  echo "Extracted PostgreSQL host from DATABASE_URL: $POSTGRES_HOST"
else
  POSTGRES_HOST=${POSTGRES_HOST:-postgres}
  echo "Using default PostgreSQL host: $POSTGRES_HOST"
fi

# Simple connection test using nc (netcat) or timeout
echo "Checking PostgreSQL connection at $POSTGRES_HOST:5432..."
for i in {1..30}; do
  if timeout 1 bash -c "echo > /dev/tcp/$POSTGRES_HOST/5432" 2>/dev/null; then
    echo "PostgreSQL port is accessible!"
    # Give it a couple more seconds to fully initialize
    sleep 3
    break
  fi
  
  if [ $i -eq 30 ]; then
    echo "Failed to connect to PostgreSQL after 30 attempts"
    exit 1
  fi
  
  echo "Waiting for PostgreSQL... attempt $i/30"
  sleep 2
done

echo "PostgreSQL is ready!"

# Check if database reset is requested
if [ "$RESET_DB" = "true" ]; then
  echo "⚠️  RESET_DB=true detected - Dropping all tables..."
  
  # Drop all tables using Drizzle drop command
  npx drizzle-kit drop --force || echo "Warning: Database drop failed, tables may not exist yet"
  
  echo "✅ Database reset complete!"
fi

# Run database migrations/push schema
echo "Initializing database schema..."
if [ "$NODE_ENV" = "production" ]; then
  # In production, use drizzle-kit push to sync schema
  npx drizzle-kit push --force || echo "Warning: Database schema sync had issues, continuing anyway..."
else
  npm run db:push || echo "Warning: Database schema sync had issues, continuing anyway..."
fi

echo "Database initialization complete!"

echo ""
echo "================================================"
echo "  Starting Discord Bot Application..."
echo "================================================"
echo ""

# Set up signal handlers for graceful shutdown
trap 'echo "Received SIGTERM, shutting down gracefully..."; exit 0' SIGTERM
trap 'echo "Received SIGINT, shutting down gracefully..."; exit 0' SIGINT

# Start the application
exec "$@"
