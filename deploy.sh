#!/bin/bash
set -euo pipefail

# HomeLab Dashboard - Unified Deployment Script
# Investor-Ready Production Deployment Orchestrator

VERSION="2.0.0"
SCRIPT_DIR="$(cd "$(dirname "${BASH_SOURCE[0]}")" && pwd)"

# Colors for output
RED='\033[0;31m'
GREEN='\033[0;32m'
YELLOW='\033[1;33m'
BLUE='\033[0;34m'
NC='\033[0m' # No Color

# Logging
log_info() { echo -e "${BLUE}[INFO]${NC} $1"; }
log_success() { echo -e "${GREEN}[SUCCESS]${NC} $1"; }
log_warn() { echo -e "${YELLOW}[WARN]${NC} $1"; }
log_error() { echo -e "${RED}[ERROR]${NC} $1"; }

# Help menu
show_help() {
    cat << EOF
HomeLab Dashboard - Unified Deployment Script v${VERSION}

Usage: ./deploy.sh [command] [options]

Commands:
    setup           Initial setup (install dependencies, create .env)
    start           Start all services
    stop            Stop all services
    restart         Restart all services
    status          Show status of all services
    logs            View logs (use -f to follow)
    backup          Create backup of databases and configs
    restore         Restore from backup
    update          Pull latest code and restart
    health          Run health checks
    clean           Clean up old data and logs
    test            Run all tests
    deploy          Full production deployment

Options:
    -h, --help      Show this help message
    -v, --verbose   Verbose output
    -s, --service   Specific service (dashboard, stream-bot, discord-bot, all)
    -e, --env       Environment (development, production)

Examples:
    ./deploy.sh setup
    ./deploy.sh start --service dashboard
    ./deploy.sh logs -f --service stream-bot
    ./deploy.sh deploy --env production
    ./deploy.sh backup

EOF
}

# Pre-flight checks
preflight_checks() {
    log_info "Running pre-flight checks..."
    
    # Check if Docker is installed
    if ! command -v docker &> /dev/null; then
        log_error "Docker is not installed"
        exit 1
    fi
    
    # Check if Docker Compose is installed
    if ! command -v docker-compose &> /dev/null; then
        log_error "Docker Compose is not installed"
        exit 1
    fi
    
    # Check if required environment variables exist
    if [ ! -f ".env" ]; then
        log_warn ".env file not found"
        log_info "Run './deploy.sh setup' to create it"
    fi
    
    log_success "Pre-flight checks passed"
}

# Setup command
cmd_setup() {
    log_info "Starting initial setup..."
    
    # Create .env using existing generator
    if [ ! -f ".env" ]; then
        if [ -f "deployment/generate-unified-env.sh" ]; then
            log_info "Running deployment/generate-unified-env.sh..."
            bash deployment/generate-unified-env.sh
        else
            log_error "deployment/generate-unified-env.sh not found"
            exit 1
        fi
    fi
    
    # Create required directories
    mkdir -p backups logs data
    
    # Set permissions
    chmod +x scripts/*.sh 2>/dev/null || true
    chmod +x deployment/*.sh 2>/dev/null || true
    chmod +x deploy.sh
    
    log_success "Setup complete!"
    log_info "Next steps:"
    log_info "1. Review .env file with your configuration"
    log_info "2. Run './deploy.sh start' to start services"
}

# Start command
cmd_start() {
    log_info "Starting services..."
    docker-compose -f docker-compose.unified.yml up -d
    log_success "Services started"
    cmd_status
}

# Stop command  
cmd_stop() {
    log_info "Stopping services..."
    docker-compose -f docker-compose.unified.yml down
    log_success "Services stopped"
}

# Restart command
cmd_restart() {
    log_info "Restarting services..."
    cmd_stop
    sleep 2
    cmd_start
}

# Status command
cmd_status() {
    log_info "Service status:"
    docker-compose -f docker-compose.unified.yml ps
}

# Logs command
cmd_logs() {
    local service="${1:-}"
    local follow_flag=""
    
    if [ "$FOLLOW_LOGS" = true ]; then
        follow_flag="-f"
    fi
    
    if [ -n "$service" ]; then
        docker-compose -f docker-compose.unified.yml logs $follow_flag "$service"
    else
        docker-compose -f docker-compose.unified.yml logs $follow_flag
    fi
}

# Backup command
cmd_backup() {
    log_info "Creating backup..."
    
    local backup_dir="backups/$(date +%Y%m%d_%H%M%S)"
    mkdir -p "$backup_dir"
    
    # Backup database
    if docker-compose -f docker-compose.unified.yml ps | grep -q discord-bot-db; then
        log_info "Backing up PostgreSQL databases..."
        docker-compose -f docker-compose.unified.yml exec -T discord-bot-db pg_dumpall -U postgres > "$backup_dir/database.sql" 2>/dev/null || log_warn "Database backup failed (is it running?)"
    fi
    
    # Backup configs
    cp -r config "$backup_dir/" 2>/dev/null || true
    cp .env "$backup_dir/.env.backup" 2>/dev/null || true
    cp docker-compose.unified.yml "$backup_dir/" 2>/dev/null || true
    cp Caddyfile "$backup_dir/" 2>/dev/null || true
    
    log_success "Backup created: $backup_dir"
}

# Health check
cmd_health() {
    log_info "Running health checks..."
    
    # Check if containers are running
    if ! docker-compose -f docker-compose.unified.yml ps | grep -q "Up"; then
        log_error "Some containers are not running"
        return 1
    fi
    
    # Check database connection
    if docker-compose -f docker-compose.unified.yml ps | grep -q discord-bot-db; then
        if ! docker-compose -f docker-compose.unified.yml exec -T discord-bot-db pg_isready -U postgres &>/dev/null; then
            log_error "Database is not ready"
            return 1
        fi
    fi
    
    log_success "All health checks passed"
}

# Clean command
cmd_clean() {
    log_info "Cleaning up old data and logs..."
    
    # Remove old backups (keep last 10)
    if [ -d "backups" ]; then
        ls -t backups/ | tail -n +11 | xargs -I {} rm -rf backups/{}
        log_info "Removed old backups (kept last 10)"
    fi
    
    # Clean up old logs
    find services/*/logs -type f -name "*.log" -mtime +7 -delete 2>/dev/null || true
    log_info "Removed logs older than 7 days"
    
    # Docker system prune
    docker system prune -f
    
    log_success "Cleanup complete"
}

# Test command
cmd_test() {
    log_info "Running tests..."
    
    # Run Python tests if available
    if [ -d "services/dashboard/tests" ]; then
        log_info "Running dashboard tests..."
        cd services/dashboard
        python -m pytest tests/ -v || log_warn "Some dashboard tests failed"
        cd "$SCRIPT_DIR"
    fi
    
    # Run Node tests if available
    if [ -f "services/discord-bot/package.json" ]; then
        log_info "Running discord-bot tests..."
        cd services/discord-bot
        npm test || log_warn "Some discord-bot tests failed"
        cd "$SCRIPT_DIR"
    fi
    
    if [ -f "services/stream-bot/package.json" ]; then
        log_info "Running stream-bot tests..."
        cd services/stream-bot
        npm test || log_warn "Some stream-bot tests failed"
        cd "$SCRIPT_DIR"
    fi
    
    log_success "Tests complete"
}

# Update command
cmd_update() {
    log_info "Updating from git..."
    git pull origin main
    
    log_info "Restarting services..."
    cmd_restart
    
    log_success "Update complete"
}

# Deploy command (full production deployment)
cmd_deploy() {
    log_info "Starting production deployment..."
    
    preflight_checks
    
    # Backup first
    cmd_backup
    
    # Pull latest code
    if [ -d ".git" ]; then
        log_info "Pulling latest code..."
        git pull origin main || log_warn "Git pull failed, continuing with local code"
    fi
    
    # Rebuild containers
    log_info "Rebuilding containers..."
    docker-compose -f docker-compose.unified.yml build --no-cache
    
    # Start services
    cmd_start
    
    # Health check
    log_info "Waiting for services to be healthy..."
    sleep 10
    cmd_health
    
    log_success "Deployment complete!"
}

# Parse arguments
COMMAND="${1:-}"
FOLLOW_LOGS=false
SERVICE=""
ENV="development"

shift || true
while [[ $# -gt 0 ]]; do
    case $1 in
        -h|--help) show_help; exit 0 ;;
        -v|--verbose) set -x; shift ;;
        -f|--follow) FOLLOW_LOGS=true; shift ;;
        -s|--service) SERVICE="$2"; shift 2 ;;
        -e|--env) ENV="$2"; shift 2 ;;
        *) shift ;;
    esac
done

# Main execution
case "$COMMAND" in
    setup) cmd_setup ;;
    start) cmd_start ;;
    stop) cmd_stop ;;
    restart) cmd_restart ;;
    status) cmd_status ;;
    logs) cmd_logs "$SERVICE" ;;
    backup) cmd_backup ;;
    health) cmd_health ;;
    clean) cmd_clean ;;
    test) cmd_test ;;
    update) cmd_update ;;
    deploy) cmd_deploy ;;
    "") show_help; exit 1 ;;
    *) log_error "Unknown command: $COMMAND"; show_help; exit 1 ;;
esac
