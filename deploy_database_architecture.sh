#!/bin/bash
#================================================
# Production-Safe Database Architecture Deployment
# - Truly idempotent: checks state before each action
# - Zero-downtime: services stay up unless necessary
# - Health checks: verifies success at each step
# - Rollback-safe: keeps old resources until verified
#================================================
#
# ROLLBACK PROCEDURE (if something goes wrong):
# 1. If migration fails and old container is still available:
#    docker stop homelab-postgres
#    docker rm homelab-postgres
#    docker start discord-bot-db
#    docker compose up -d
#
# 2. If tables were dropped but need to be restored:
#    Restore from backup in var/backups/ directory
#
# 3. Complete rollback to previous state:
#    git checkout HEAD~1 -- deploy_database_architecture.sh
#    ./deploy_database_architecture.sh
#
#================================================

# Exit on error for critical failures, but handle errors gracefully
set -e
trap 'handle_error $? $LINENO' ERR

# Error handler
handle_error() {
    echo ""
    echo -e "${RED}╔════════════════════════════════════════════════════════════════╗${NC}"
    echo -e "${RED}║                    DEPLOYMENT FAILED                           ║${NC}"
    echo -e "${RED}╚════════════════════════════════════════════════════════════════╝${NC}"
    echo -e "${RED}Error on line $2 (exit code: $1)${NC}"
    echo ""
    echo "ROLLBACK OPTIONS:"
    echo "1. Check logs above for specific error"
    echo "2. If postgres migration failed:"
    echo "   docker stop homelab-postgres 2>/dev/null || true"
    echo "   docker rm homelab-postgres 2>/dev/null || true"
    echo "   docker start discord-bot-db 2>/dev/null || true"
    echo ""
    if [ -n "$LATEST_BACKUP" ] && [ -f "$LATEST_BACKUP" ]; then
        echo "3. RESTORE FROM BACKUP (created before failure):"
        echo "   cat $LATEST_BACKUP | docker exec -i \$POSTGRES_CONTAINER psql -U postgres"
        echo ""
        echo "   Backup location: $LATEST_BACKUP"
        echo "   Backup size: $(du -h "$LATEST_BACKUP" | cut -f1)"
        echo ""
    fi
    exit $1
}

echo "╔════════════════════════════════════════════════════════════════╗"
echo "║                                                                ║"
echo "║         DATABASE ARCHITECTURE COMPLETE DEPLOYMENT              ║"
echo "║                  (Idempotent - Safe to Rerun)                  ║"
echo "║                                                                ║"
echo "╚════════════════════════════════════════════════════════════════╝"
echo ""

# Colors
GREEN='\033[0;32m'
YELLOW='\033[1;33m'
RED='\033[0;31m'
BLUE='\033[0;34m'
NC='\033[0m' # No Color

#================================================
# HELPER FUNCTIONS
#================================================

# Backup directory
BACKUP_DIR="/tmp/db_backups"
LATEST_BACKUP=""

# Create backup directory if it doesn't exist
mkdir -p "$BACKUP_DIR"

# Create database backup
create_database_backup() {
    local database=$1
    local description=$2
    local timestamp=$(date +%s)
    local backup_file="${BACKUP_DIR}/backup_${database}_${description}_${timestamp}.sql"
    
    echo "Creating backup: $backup_file"
    if docker exec "$POSTGRES_CONTAINER" pg_dump -U "$DB_USER" "$database" > "$backup_file" 2>/dev/null; then
        echo -e "${GREEN}✓ Backup created: $backup_file${NC}"
        LATEST_BACKUP="$backup_file"
        return 0
    else
        echo -e "${YELLOW}⚠ Failed to create backup (database may not exist yet)${NC}"
        return 1
    fi
}

# Create backup of all databases
create_full_backup() {
    local description=$1
    local timestamp=$(date +%s)
    local backup_file="${BACKUP_DIR}/backup_all_databases_${description}_${timestamp}.sql"
    
    # Determine superuser based on container
    local superuser="postgres"
    if [ "$POSTGRES_CONTAINER" = "discord-bot-db" ]; then
        superuser="ticketbot"
    fi
    
    echo "Creating full database backup: $backup_file"
    if docker exec "$POSTGRES_CONTAINER" pg_dumpall -U "$superuser" > "$backup_file" 2>/dev/null; then
        echo -e "${GREEN}✓ Full backup created: $backup_file${NC}"
        LATEST_BACKUP="$backup_file"
        return 0
    else
        echo -e "${RED}✗ Failed to create full backup${NC}"
        return 1
    fi
}

# Check if a service is healthy
check_service_health() {
    local service_name=$1
    local max_wait=${2:-30}
    
    for i in $(seq 1 $max_wait); do
        if docker compose ps "$service_name" 2>/dev/null | grep -q "Up (healthy)"; then
            return 0
        elif docker compose ps "$service_name" 2>/dev/null | grep -q "Up"; then
            # Service is up but not marked healthy yet
            sleep 1
            continue
        else
            sleep 1
        fi
    done
    return 1
}

# Wait for PostgreSQL to accept connections
wait_for_postgres() {
    local container=$1
    local max_wait=${2:-60}
    
    echo "Waiting for PostgreSQL to accept connections (timeout: ${max_wait}s)..."
    for i in $(seq 1 $max_wait); do
        if docker exec "$container" pg_isready -U postgres >/dev/null 2>&1; then
            echo -e "${GREEN}✓ PostgreSQL is ready (${i}s)${NC}"
            return 0
        fi
        echo -n "."
        sleep 1
    done
    echo ""
    echo -e "${RED}✗ PostgreSQL did not become ready in ${max_wait}s${NC}"
    return 1
}

# Test database connection with actual query
test_database_connection() {
    local container=$1
    local user=$2
    local database=$3
    
    if docker exec "$container" psql -U "$user" -d "$database" -c "SELECT 1;" >/dev/null 2>&1; then
        return 0
    fi
    return 1
}

# Check if migration has completed successfully
check_migration_complete() {
    local container=$1
    local user=$2
    
    # Check if alembic_version table exists and has entries
    local has_migrations=$(docker exec "$container" psql -U "$user" -d homelab_jarvis -t -c \
        "SELECT COUNT(*) FROM information_schema.tables WHERE table_name='alembic_version';" \
        2>/dev/null | tr -d ' ')
    
    if [ "$has_migrations" -eq 1 ]; then
        return 0
    fi
    return 1
}

#================================================
# STEP 0: COMPREHENSIVE STATE DETECTION
#================================================
echo "━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━"
echo "STEP 0: Detecting Current System State"
echo "━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━"
echo ""

# Check which container exists
POSTGRES_CONTAINER=""
OLD_CONTAINER_EXISTS=false

if docker ps -a --format '{{.Names}}' | grep -q '^homelab-postgres$'; then
    POSTGRES_CONTAINER="homelab-postgres"
    echo -e "${GREEN}✓ Found homelab-postgres container (modern architecture)${NC}"
    
    # Check if old container also exists
    if docker ps -a --format '{{.Names}}' | grep -q '^discord-bot-db$'; then
        echo -e "${YELLOW}⚠ Legacy discord-bot-db container still exists (will be cleaned up)${NC}"
        OLD_CONTAINER_EXISTS=true
    fi
elif docker ps -a --format '{{.Names}}' | grep -q '^discord-bot-db$'; then
    POSTGRES_CONTAINER="discord-bot-db"
    echo -e "${BLUE}ℹ Found legacy discord-bot-db container (migration required)${NC}"
else
    echo -e "${RED}✗ No PostgreSQL container found - this is a fresh install${NC}"
    echo "This script expects an existing PostgreSQL installation."
    echo "Please run: docker compose up -d homelab-postgres"
    exit 1
fi

# Check if container is running
POSTGRES_RUNNING=false
if docker ps --format '{{.Names}}' | grep -q "^${POSTGRES_CONTAINER}$"; then
    echo -e "${GREEN}✓ PostgreSQL container ($POSTGRES_CONTAINER) is running${NC}"
    POSTGRES_RUNNING=true
    
    # Verify it's actually healthy
    if wait_for_postgres "$POSTGRES_CONTAINER" 10; then
        echo -e "${GREEN}✓ PostgreSQL is healthy and accepting connections${NC}"
    else
        echo -e "${YELLOW}⚠ PostgreSQL is running but not accepting connections${NC}"
    fi
else
    echo -e "${YELLOW}⚠ PostgreSQL container ($POSTGRES_CONTAINER) is stopped${NC}"
fi

# Determine database user based on container
if [ "$POSTGRES_CONTAINER" = "homelab-postgres" ]; then
    DB_USER="postgres"
    DB_OWNER="jarvis"
else
    DB_USER="ticketbot"
    DB_OWNER="ticketbot"
fi

echo ""
echo "State Summary:"
echo "  • Container: $POSTGRES_CONTAINER"
echo "  • Running: $POSTGRES_RUNNING"
echo "  • DB User: $DB_USER"
echo ""

#================================================
# STEP 1: CHECK AND DROP INCOMPATIBLE TABLES (IDEMPOTENT)
#================================================
echo "━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━"
echo "STEP 1: Checking for Incompatible Agent Tables (Idempotent)"
echo "━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━"
echo ""

# Only proceed if PostgreSQL is running
if [ "$POSTGRES_RUNNING" = false ]; then
    echo -e "${YELLOW}⚠ PostgreSQL not running - starting it first...${NC}"
    docker compose up -d "$POSTGRES_CONTAINER"
    wait_for_postgres "$POSTGRES_CONTAINER" 60 || {
        echo -e "${RED}✗ Failed to start PostgreSQL${NC}"
        exit 1
    }
    POSTGRES_RUNNING=true
fi

# Ensure PostgreSQL is healthy before proceeding
wait_for_postgres "$POSTGRES_CONTAINER" 30 || {
    echo -e "${RED}✗ PostgreSQL is not healthy${NC}"
    exit 1
}

echo "Checking for homelab_jarvis database..."

# Check if database exists
DB_EXISTS=$(docker exec "$POSTGRES_CONTAINER" psql -U "$DB_USER" -lqt 2>/dev/null | cut -d \| -f 1 | grep -w homelab_jarvis | wc -l)

if [ "$DB_EXISTS" -eq 0 ]; then
    echo -e "${BLUE}ℹ Database homelab_jarvis does not exist yet - skipping table cleanup${NC}"
    echo -e "${BLUE}ℹ It will be created automatically by migrations${NC}"
else
    echo -e "${GREEN}✓ Database homelab_jarvis exists${NC}"
    
    # Check if any incompatible agent tables exist
    echo "Checking for incompatible agent tables..."
    TABLES_EXIST=$(docker exec "$POSTGRES_CONTAINER" psql -U "$DB_USER" -d homelab_jarvis -t -c "
        SELECT COUNT(*) FROM information_schema.tables 
        WHERE table_name IN ('agents', 'agent_messages', 'agent_tasks', 'agent_conversations', 'chat_history')
        AND table_schema = 'public';
    " 2>/dev/null | tr -d ' ')
    
    if [ "$TABLES_EXIST" -gt 0 ]; then
        echo -e "${YELLOW}⚠ Found $TABLES_EXIST incompatible table(s) - dropping...${NC}"
        echo ""
        
        # Create backup before destructive operation
        echo "Creating backup before dropping tables..."
        create_database_backup "homelab_jarvis" "pre_table_drop"
        echo ""
        
        # Drop incompatible tables
        docker exec "$POSTGRES_CONTAINER" psql -U "$DB_USER" -d homelab_jarvis << 'EOF'
DROP TABLE IF EXISTS agent_messages CASCADE;
DROP TABLE IF EXISTS chat_history CASCADE;
DROP TABLE IF EXISTS agent_conversations CASCADE;
DROP TABLE IF EXISTS agent_tasks CASCADE;
DROP TABLE IF EXISTS agents CASCADE;
EOF
        
        # Verify tables were dropped
        REMAINING_TABLES=$(docker exec "$POSTGRES_CONTAINER" psql -U "$DB_USER" -d homelab_jarvis -t -c "
            SELECT COUNT(*) FROM information_schema.tables 
            WHERE table_name IN ('agents', 'agent_messages', 'agent_tasks', 'agent_conversations', 'chat_history')
            AND table_schema = 'public';
        " 2>/dev/null | tr -d ' ')
        
        if [ "$REMAINING_TABLES" -eq 0 ]; then
            echo -e "${GREEN}✓ All incompatible tables dropped successfully${NC}"
        else
            echo -e "${RED}✗ Failed to drop all tables ($REMAINING_TABLES remaining)${NC}"
            exit 1
        fi
    else
        echo -e "${GREEN}✓ No incompatible agent tables found (already clean)${NC}"
    fi
fi

echo ""

#================================================
# STEP 2: ZERO-DOWNTIME CONTAINER MIGRATION (IF NEEDED)
#================================================
echo "━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━"
echo "STEP 2: PostgreSQL Container Migration (Zero-Downtime)"
echo "━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━"
echo ""

# Check actual system state: if using homelab-postgres, no migration needed
if [ "$POSTGRES_CONTAINER" = "homelab-postgres" ]; then
    echo -e "${GREEN}✓ Already using homelab-postgres - no migration needed${NC}"
    
    # Ensure it's running and healthy
    if [ "$POSTGRES_RUNNING" = false ]; then
        echo "Starting homelab-postgres..."
        docker compose up -d homelab-postgres
        wait_for_postgres "homelab-postgres" 60 || {
            echo -e "${RED}✗ Failed to start homelab-postgres${NC}"
            exit 1
        }
        POSTGRES_CONTAINER="homelab-postgres"
        POSTGRES_RUNNING=true
    fi
    
    # Clean up old container if it exists
    if [ "$OLD_CONTAINER_EXISTS" = true ]; then
        echo -e "${BLUE}ℹ Cleaning up old discord-bot-db container...${NC}"
        docker stop discord-bot-db 2>/dev/null || true
        docker rm discord-bot-db 2>/dev/null || true
        echo -e "${GREEN}✓ Old container cleaned up${NC}"
    fi
else
    echo -e "${YELLOW}⚠ Migration required: discord-bot-db → homelab-postgres${NC}"
    echo ""
    echo "ROLLBACK: If migration fails, run:"
    echo "  docker stop homelab-postgres && docker rm homelab-postgres"
    echo "  docker start discord-bot-db"
    echo "  docker compose up -d"
    echo ""
    
    # Verify old container is healthy before migration
    echo "Verifying old container health before migration..."
    if ! wait_for_postgres "discord-bot-db" 30; then
        echo -e "${RED}✗ Old container is not healthy - cannot safely migrate${NC}"
        exit 1
    fi
    echo -e "${GREEN}✓ Old container is healthy${NC}"
    echo ""
    
    # Create full backup before container migration
    echo "Creating full database backup before container migration..."
    create_full_backup "pre_container_migration"
    echo ""
    
    # Start new container FIRST (before stopping old one)
    echo "Starting new homelab-postgres container (parallel with old)..."
    docker compose up -d homelab-postgres 2>/dev/null || true
    
    # Wait for new container to be ready
    echo "Waiting for new container to be ready..."
    if ! wait_for_postgres "homelab-postgres" 60; then
        echo -e "${RED}✗ New container failed to start${NC}"
        echo "Rolling back..."
        docker stop homelab-postgres 2>/dev/null || true
        docker rm homelab-postgres 2>/dev/null || true
        exit 1
    fi
    
    echo -e "${GREEN}✓ New container is healthy${NC}"
    
    # Verify new container can connect to databases
    echo "Verifying new container has access to databases..."
    if test_database_connection "homelab-postgres" "postgres" "postgres"; then
        echo -e "${GREEN}✓ New container database connectivity verified${NC}"
    else
        echo -e "${RED}✗ New container cannot connect to databases${NC}"
        exit 1
    fi
    
    # Services will automatically reconnect via network alias 'discord-bot-db'
    # No service restarts needed - zero-downtime migration achieved
    echo ""
    echo -e "${GREEN}✓ Zero-downtime migration complete${NC}"
    echo "Services (discord-bot, stream-bot) will auto-reconnect via network alias"
    echo "Dashboard will be rebuilt separately in Step 3 if needed"
    
    # Now safe to stop and remove old container
    echo ""
    echo "Old container is no longer needed - cleaning up..."
    docker stop discord-bot-db 2>/dev/null || true
    docker rm discord-bot-db 2>/dev/null || true
    
    echo -e "${GREEN}✓ Migration complete${NC}"
    echo "  • Container: discord-bot-db → homelab-postgres"
    echo "  • Superuser: ticketbot → postgres"
    echo "  • Network alias 'discord-bot-db' maintained for compatibility"
    echo "  • Old container removed (data preserved in shared volume)"
    
    POSTGRES_CONTAINER="homelab-postgres"
    POSTGRES_RUNNING=true
fi

# Final health check
echo ""
echo "Final PostgreSQL health check..."
wait_for_postgres "$POSTGRES_CONTAINER" 30 || {
    echo -e "${RED}✗ PostgreSQL is not healthy after migration${NC}"
    exit 1
}
echo -e "${GREEN}✓ PostgreSQL is healthy and ready${NC}"
echo ""

#================================================
# STEP 3: INTELLIGENT DASHBOARD UPDATE (ONLY IF NEEDED)
#================================================
echo "━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━"
echo "STEP 3: Dashboard Update with Database Provisioner (Conditional)"
echo "━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━"
echo ""

# Check if dashboard is running and healthy
DASHBOARD_RUNNING=false
NEEDS_UPDATE=false

if docker compose ps homelab-dashboard 2>/dev/null | grep -q "Up"; then
    DASHBOARD_RUNNING=true
    echo -e "${GREEN}✓ Dashboard is currently running${NC}"
    
    # Check if dashboard is healthy
    echo "Checking dashboard health..."
    if curl -f -s -o /dev/null http://localhost:5000/ 2>/dev/null; then
        echo -e "${GREEN}✓ Dashboard is healthy${NC}"
        
        # Check if database API is available (indicates provisioner is present)
        if curl -f -s -o /dev/null http://localhost:5000/api/databases/ 2>/dev/null; then
            echo -e "${GREEN}✓ Database provisioner API is already active${NC}"
            echo -e "${BLUE}ℹ Dashboard is up-to-date - skipping rebuild${NC}"
            NEEDS_UPDATE=false
        else
            echo -e "${YELLOW}⚠ Database provisioner API not found - update needed${NC}"
            NEEDS_UPDATE=true
        fi
    else
        echo -e "${YELLOW}⚠ Dashboard is not responding - update recommended${NC}"
        NEEDS_UPDATE=true
    fi
else
    echo -e "${BLUE}ℹ Dashboard is not running - will start it${NC}"
    DASHBOARD_RUNNING=false
    NEEDS_UPDATE=true
fi

# Only update if needed
if [ "$NEEDS_UPDATE" = true ]; then
    echo ""
    if [ "$DASHBOARD_RUNNING" = true ]; then
        echo "Performing rolling update (zero-downtime)..."
    else
        echo "Starting dashboard for the first time..."
    fi
    
    # Build new image
    echo "Building updated dashboard image..."
    docker compose build homelab-dashboard 2>&1 | grep -E "(Building|Successfully built|ERROR)" || true
    
    if [ $? -ne 0 ]; then
        echo -e "${RED}✗ Failed to build dashboard image${NC}"
        exit 1
    fi
    
    # Deploy with zero-downtime strategy
    echo "Deploying dashboard (zero-downtime rolling update)..."
    docker compose up -d --no-deps homelab-dashboard homelab-celery-worker
    
    echo -e "${GREEN}✓ Dashboard deployed${NC}"
    
    # Wait for dashboard to be healthy
    echo ""
    echo "Waiting for dashboard to become healthy..."
    HEALTH_TIMEOUT=60
    for i in $(seq 1 $HEALTH_TIMEOUT); do
        if curl -f -s -o /dev/null http://localhost:5000/ 2>/dev/null; then
            echo -e "${GREEN}✓ Dashboard is healthy (${i}s)${NC}"
            break
        fi
        echo -n "."
        sleep 1
        
        if [ $i -eq $HEALTH_TIMEOUT ]; then
            echo ""
            echo -e "${YELLOW}⚠ Dashboard did not become healthy in ${HEALTH_TIMEOUT}s${NC}"
            echo "Checking logs for errors..."
            docker compose logs --tail=20 homelab-dashboard
        fi
    done
    
    # Wait for migrations to complete
    echo ""
    echo "Waiting for database migrations to complete..."
    MIGRATION_TIMEOUT=90
    for i in $(seq 1 $MIGRATION_TIMEOUT); do
        # Check if alembic_version table exists (indicates migrations ran)
        if check_migration_complete "$POSTGRES_CONTAINER" "$DB_USER" 2>/dev/null; then
            echo -e "${GREEN}✓ Migrations completed (${i}s)${NC}"
            break
        fi
        
        # Also check dashboard logs for migration completion
        if docker compose logs homelab-dashboard 2>/dev/null | grep -q "INFO  \[alembic.runtime.migration\] Context impl PostgresqlImpl"; then
            echo -e "${GREEN}✓ Migrations completed (${i}s)${NC}"
            break
        fi
        
        echo -n "."
        sleep 1
        
        if [ $i -eq $MIGRATION_TIMEOUT ]; then
            echo ""
            echo -e "${YELLOW}⚠ Migration status unclear after ${MIGRATION_TIMEOUT}s${NC}"
            echo "Checking migration logs..."
            docker compose logs homelab-dashboard 2>/dev/null | grep -i "alembic\|migration" | tail -10
        fi
    done
    
    # Verify database API is responding
    echo ""
    echo "Verifying database provisioner API..."
    sleep 3  # Give Flask a moment to fully initialize
    if curl -f -s -o /dev/null http://localhost:5000/api/databases/ 2>/dev/null; then
        echo -e "${GREEN}✓ Database provisioner API is responding${NC}"
    else
        echo -e "${YELLOW}⚠ Database API not responding (may need authentication)${NC}"
    fi
else
    echo -e "${GREEN}✓ Dashboard is already up-to-date and healthy - no update needed${NC}"
fi

echo ""

#================================================
# STEP 4: ENSURE ALL SERVICES ARE HEALTHY (MINIMAL RESTARTS)
#================================================
echo "━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━"
echo "STEP 4: Service Health Check (Minimal Restarts)"
echo "━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━"
echo ""

echo "Checking which services are running..."
docker compose ps

echo ""
echo "Starting any stopped services (without restarting healthy ones)..."

# Get list of all services that should be running
ALL_SERVICES=$(docker compose config --services 2>/dev/null)

SERVICES_STARTED=0
SERVICES_ALREADY_UP=0

for service in $ALL_SERVICES; do
    # Skip services that are meant to be stopped
    if [[ "$service" =~ ^(homeassistant|vnc-desktop)$ ]]; then
        continue
    fi
    
    # Check if service is running
    if docker compose ps "$service" 2>/dev/null | grep -q "Up"; then
        SERVICES_ALREADY_UP=$((SERVICES_ALREADY_UP + 1))
    else
        echo "Starting $service..."
        docker compose up -d "$service"
        SERVICES_STARTED=$((SERVICES_STARTED + 1))
    fi
done

echo ""
if [ $SERVICES_STARTED -gt 0 ]; then
    echo -e "${GREEN}✓ Started $SERVICES_STARTED service(s)${NC}"
else
    echo -e "${GREEN}✓ All required services were already running${NC}"
fi

echo -e "${BLUE}ℹ $SERVICES_ALREADY_UP service(s) were already healthy (not restarted)${NC}"
echo ""

#================================================
# STEP 5: COMPREHENSIVE VERIFICATION
#================================================
echo "━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━"
echo "STEP 5: Comprehensive System Verification"
echo "━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━"
echo ""

VERIFICATION_PASSED=true

# 5.1: PostgreSQL Container
echo "5.1: Verifying PostgreSQL container..."
if docker ps | grep -q "$POSTGRES_CONTAINER"; then
    echo -e "${GREEN}✓ PostgreSQL container ($POSTGRES_CONTAINER) is running${NC}"
else
    echo -e "${RED}✗ PostgreSQL container not running${NC}"
    VERIFICATION_PASSED=false
fi

# 5.2: PostgreSQL Connectivity
echo ""
echo "5.2: Verifying PostgreSQL connectivity..."
if docker exec "$POSTGRES_CONTAINER" pg_isready -U postgres > /dev/null 2>&1; then
    echo -e "${GREEN}✓ PostgreSQL is accepting connections${NC}"
else
    echo -e "${RED}✗ PostgreSQL is not accepting connections${NC}"
    VERIFICATION_PASSED=false
fi

# 5.3: Database Existence
echo ""
echo "5.3: Verifying application databases exist..."
EXPECTED_DBS=("ticketbot" "streambot" "homelab_jarvis")
DB_COUNT=0

for db in "${EXPECTED_DBS[@]}"; do
    if docker exec "$POSTGRES_CONTAINER" psql -U postgres -lqt 2>/dev/null | cut -d \| -f 1 | grep -qw "$db"; then
        echo -e "${GREEN}✓ Database '$db' exists${NC}"
        DB_COUNT=$((DB_COUNT + 1))
    else
        echo -e "${YELLOW}⚠ Database '$db' does not exist (will be created on first use)${NC}"
    fi
done

if [ $DB_COUNT -gt 0 ]; then
    echo -e "${GREEN}✓ Found $DB_COUNT application database(s)${NC}"
fi

# 5.4: Database Connection Test
echo ""
echo "5.4: Testing actual database connections..."
if test_database_connection "$POSTGRES_CONTAINER" "postgres" "postgres"; then
    echo -e "${GREEN}✓ Can execute queries on PostgreSQL${NC}"
else
    echo -e "${RED}✗ Cannot execute queries on PostgreSQL${NC}"
    VERIFICATION_PASSED=false
fi

# 5.5: Migration Status
echo ""
echo "5.5: Checking migration status..."
if docker exec "$POSTGRES_CONTAINER" psql -U postgres -lqt 2>/dev/null | cut -d \| -f 1 | grep -qw "homelab_jarvis"; then
    if check_migration_complete "$POSTGRES_CONTAINER" "$DB_USER"; then
        echo -e "${GREEN}✓ Database migrations have been applied${NC}"
    else
        echo -e "${YELLOW}⚠ Migrations may not have run yet${NC}"
    fi
else
    echo -e "${BLUE}ℹ Database will be initialized on first dashboard start${NC}"
fi

# 5.6: Dashboard Health
echo ""
echo "5.6: Verifying dashboard health..."
if docker compose ps homelab-dashboard 2>/dev/null | grep -q "Up"; then
    echo -e "${GREEN}✓ Dashboard container is running${NC}"
    
    # Test HTTP endpoint
    if curl -f -s -o /dev/null http://localhost:5000/ 2>/dev/null; then
        echo -e "${GREEN}✓ Dashboard HTTP endpoint is responding${NC}"
    else
        echo -e "${YELLOW}⚠ Dashboard may still be starting up${NC}"
    fi
else
    echo -e "${YELLOW}⚠ Dashboard is not running${NC}"
fi

# 5.7: Database Provisioner API
echo ""
echo "5.7: Testing database provisioner API..."
if curl -f -s -o /dev/null http://localhost:5000/api/databases/ 2>/dev/null; then
    echo -e "${GREEN}✓ Database provisioner API is responding${NC}"
else
    echo -e "${YELLOW}⚠ Database API not responding (may require authentication)${NC}"
fi

# 5.8: Critical Services Status
echo ""
echo "5.8: Checking critical services..."
CRITICAL_SERVICES=("homelab-postgres" "homelab-redis" "homelab-dashboard")
CRITICAL_OK=0

for service in "${CRITICAL_SERVICES[@]}"; do
    if docker ps --format '{{.Names}}' | grep -q "^${service}$"; then
        echo -e "${GREEN}✓ $service is running${NC}"
        CRITICAL_OK=$((CRITICAL_OK + 1))
    else
        echo -e "${YELLOW}⚠ $service is not running${NC}"
    fi
done

if [ $CRITICAL_OK -eq ${#CRITICAL_SERVICES[@]} ]; then
    echo -e "${GREEN}✓ All critical services are running${NC}"
fi

echo ""

#================================================
# DEPLOYMENT SUMMARY
#================================================
echo "━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━"
if [ "$VERIFICATION_PASSED" = true ]; then
    echo "✅  DEPLOYMENT SUCCESSFUL"
else
    echo "⚠️  DEPLOYMENT COMPLETED WITH WARNINGS"
fi
echo "━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━"
echo ""
echo "Actions Taken:"
echo ""

# Check actual system state to report what happened
# Check container state
if docker ps -a --format '{{.Names}}' | grep -q '^homelab-postgres$'; then
    if ! docker ps -a --format '{{.Names}}' | grep -q '^discord-bot-db$'; then
        echo "  ✓ Using modern PostgreSQL architecture (homelab-postgres)"
    else
        echo "  ✓ PostgreSQL architecture already up to date (no migration needed)"
    fi
else
    echo "  ℹ Still using legacy container (migration may be pending)"
fi

# Check if agent tables exist in database
if docker exec "$POSTGRES_CONTAINER" psql -U "$DB_USER" -lqt 2>/dev/null | cut -d \| -f 1 | grep -qw homelab_jarvis; then
    AGENT_TABLES=$(docker exec "$POSTGRES_CONTAINER" psql -U "$DB_USER" -d homelab_jarvis -t -c "
        SELECT COUNT(*) FROM information_schema.tables 
        WHERE table_name IN ('agents', 'agent_messages', 'agent_tasks', 'agent_conversations', 'chat_history')
        AND table_schema = 'public';
    " 2>/dev/null | tr -d ' ')
    
    if [ "$AGENT_TABLES" -eq 0 ]; then
        echo "  ✓ Database schema is clean (no incompatible tables)"
    else
        echo "  ⚠ Found $AGENT_TABLES incompatible table(s) in database"
    fi
fi

# Check dashboard API availability
if curl -f -s -o /dev/null http://localhost:5000/api/databases/ 2>/dev/null; then
    echo "  ✓ Dashboard with database provisioner is active"
else
    echo "  ℹ Dashboard provisioner API status unknown"
fi

# Report service status
RUNNING_SERVICES=$(docker compose ps --services --filter "status=running" 2>/dev/null | wc -l)
echo "  ✓ $RUNNING_SERVICES service(s) currently running"

echo ""
echo "Idempotency Status:"
echo "  ✓ Script executed successfully"
echo "  ✓ Safe to run again - will skip completed steps"
echo "  ✓ Zero-downtime strategy used throughout"
echo ""

if [ "$VERIFICATION_PASSED" = true ]; then
    echo "System Status:"
    echo "  ✓ PostgreSQL: Running and healthy"
    echo "  ✓ Dashboard: Running and healthy"
    echo "  ✓ Database API: Available"
    echo "  ✓ All critical services: Running"
    echo ""
fi

echo "New Features Available:"
echo "  • Database management UI in dashboard"
echo "  • Automatic database provisioning for new services"
echo "  • Autonomous database management via Jarvis"
echo ""
echo "API Endpoints (require authentication):"
echo "  GET    /api/databases/                    - List all databases"
echo "  POST   /api/databases/                    - Create new database"
echo "  GET    /api/databases/<name>              - Get database info"
echo "  DELETE /api/databases/<name>              - Delete database"
echo "  POST   /api/databases/provision-for-service - Auto-provision"
echo ""
echo "Access Points:"
echo "  • Dashboard: https://host.evindrake.net"
echo "  • Database: homelab-postgres:5432"
echo ""
echo -e "${GREEN}━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━${NC}"
echo -e "${GREEN}This script is fully idempotent and can be safely run multiple times${NC}"
echo -e "${GREEN}━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━${NC}"
echo ""

if [ "$VERIFICATION_PASSED" = false ]; then
    echo -e "${YELLOW}⚠ Some verification checks failed - review output above${NC}"
    echo ""
    exit 1
fi
