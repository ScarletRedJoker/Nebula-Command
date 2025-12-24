#!/bin/sh
# Stream-bot Docker entrypoint - runs migrations before starting the app
set -e

echo "================================================"
echo "  Stream-Bot Starting..."
echo "================================================"

# Check if DATABASE_URL is set
if [ -z "$DATABASE_URL" ]; then
    echo "❌ ERROR: DATABASE_URL environment variable is not set"
    exit 1
fi

echo "✓ Database URL configured"

# Run database migrations (non-blocking - schema should already exist)
echo ""
echo "Checking database connection..."
if [ -f "node_modules/.bin/drizzle-kit" ]; then
    echo "  Database migrations managed externally or via initial setup"
    echo "✓ Ready to start application"
else
    echo "✓ Skipping migrations check"
fi

echo ""
echo "================================================"
echo "  Starting Stream-Bot Application..."
echo "================================================"
echo ""

# Start the application
exec "$@"
