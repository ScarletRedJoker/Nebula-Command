#!/bin/bash

###############################################################################
# NebulaCommand Comprehensive Rebuild and Deploy Script
###############################################################################
# This script performs a complete rebuild of all Docker images and deploys
# all services with proper dependency installation.
#
# Usage:
#   ./scripts/rebuild-and-deploy.sh [options]
#
# Options:
#   --no-cache    Force rebuild without using Docker cache
#   --services    Rebuild specific services only (e.g., --services dashboard discord-bot)
#   --help        Show this help message
#
###############################################################################

set -e  # Exit on error

# Colors for output
RED='\033[0;31m'
GREEN='\033[0;32m'
YELLOW='\033[1;33m'
BLUE='\033[0;34m'
NC='\033[0m' # No Color

# Symbols
CHECK="✓"
CROSS="✗"
INFO="ℹ"
WARN="⚠"

# Default values
NO_CACHE=""
SPECIFIC_SERVICES=""
DOCKER_COMPOSE_FILE="docker-compose.unified.yml"

###############################################################################
# Helper Functions
###############################################################################

print_header() {
    echo ""
    echo -e "${BLUE}━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━${NC}"
    echo -e "${BLUE}  $1${NC}"
    echo -e "${BLUE}━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━${NC}"
}

print_success() {
    echo -e "${GREEN}${CHECK} $1${NC}"
}

print_error() {
    echo -e "${RED}${CROSS} $1${NC}"
}

print_warning() {
    echo -e "${YELLOW}${WARN} $1${NC}"
}

print_info() {
    echo -e "${BLUE}${INFO} $1${NC}"
}

###############################################################################
# Parse Arguments
###############################################################################

while [[ $# -gt 0 ]]; do
    case $1 in
        --no-cache)
            NO_CACHE="--no-cache"
            shift
            ;;
        --services)
            shift
            SPECIFIC_SERVICES="$@"
            break
            ;;
        --help)
            head -n 20 "$0" | tail -n +3
            exit 0
            ;;
        *)
            print_error "Unknown option: $1"
            exit 1
            ;;
    esac
done

###############################################################################
# Pre-flight Checks
###############################################################################

print_header "Pre-flight Checks"

# Check if running from project root
if [[ ! -f "$DOCKER_COMPOSE_FILE" ]]; then
    print_error "Must run from project root directory (contains $DOCKER_COMPOSE_FILE)"
    exit 1
fi
print_success "Running from project root"

# Check if .env file exists
if [[ ! -f .env ]]; then
    print_warning ".env file not found"
    print_info "Run scripts/setup-ubuntu-env.sh first to validate environment"
    read -p "Continue anyway? (y/N) " -n 1 -r
    echo
    if [[ ! $REPLY =~ ^[Yy]$ ]]; then
        exit 1
    fi
else
    print_success ".env file exists"
fi

# Check Docker
if ! command -v docker &> /dev/null; then
    print_error "Docker is not installed"
    exit 1
fi
print_success "Docker is installed"

# Check Docker Compose
if ! docker compose version &> /dev/null; then
    print_error "Docker Compose is not installed or outdated"
    exit 1
fi
print_success "Docker Compose is installed"

###############################################################################
# Stop Running Services
###############################################################################

print_header "Stopping Running Services"

print_info "Stopping all running containers..."
if docker compose -f "$DOCKER_COMPOSE_FILE" down 2>/dev/null; then
    print_success "Services stopped"
else
    print_warning "No services were running or error occurred"
fi

###############################################################################
# Rebuild Docker Images
###############################################################################

print_header "Rebuilding Docker Images"

if [[ -n "$SPECIFIC_SERVICES" ]]; then
    print_info "Rebuilding specific services: $SPECIFIC_SERVICES"
    for service in $SPECIFIC_SERVICES; do
        print_info "Building $service..."
        if docker compose -f "$DOCKER_COMPOSE_FILE" build $NO_CACHE "$service"; then
            print_success "$service built successfully"
        else
            print_error "$service build failed"
            exit 1
        fi
    done
else
    print_info "Rebuilding all services with custom Dockerfiles..."
    
    # Services that need rebuilding (have custom Dockerfiles)
    SERVICES_TO_BUILD=(
        "homelab-dashboard"
        "discord-bot"
        "stream-bot"
    )
    
    for service in "${SERVICES_TO_BUILD[@]}"; do
        print_info "Building $service..."
        if docker compose -f "$DOCKER_COMPOSE_FILE" build $NO_CACHE "$service"; then
            print_success "$service built successfully"
        else
            print_error "$service build failed"
            exit 1
        fi
    done
fi

###############################################################################
# Start Services
###############################################################################

print_header "Starting Services"

print_info "Starting all services..."

# Use the existing deploy.sh script if available
if [[ -f deploy.sh ]]; then
    print_info "Using deploy.sh for orchestrated startup..."
    if ./deploy.sh start; then
        print_success "All services started successfully"
    else
        print_error "Service startup failed"
        print_info "Check logs: docker compose -f $DOCKER_COMPOSE_FILE logs"
        exit 1
    fi
else
    # Fallback to direct docker compose
    print_info "Starting with docker compose..."
    if docker compose -f "$DOCKER_COMPOSE_FILE" up -d; then
        print_success "Services started"
    else
        print_error "Failed to start services"
        exit 1
    fi
fi

###############################################################################
# Health Checks
###############################################################################

print_header "Running Health Checks"

print_info "Waiting for services to become healthy (60s timeout)..."
sleep 10

# Check dashboard
if docker ps | grep -q "homelab-dashboard.*healthy"; then
    print_success "Dashboard is healthy"
else
    print_warning "Dashboard might not be healthy yet"
fi

# Check discord-bot
if docker ps | grep -q "discord-bot"; then
    if docker logs discord-bot 2>&1 | grep -q "error\|Error\|ERROR" | tail -n 20; then
        print_warning "Discord bot has errors in logs"
    else
        print_success "Discord bot appears to be running"
    fi
else
    print_error "Discord bot is not running"
fi

# Check stream-bot
if docker ps | grep -q "stream-bot"; then
    if docker logs stream-bot 2>&1 | grep -q "error\|Error\|ERROR" | tail -n 20; then
        print_warning "Stream bot has errors in logs"
    else
        print_success "Stream bot appears to be running"
    fi
else
    print_error "Stream bot is not running"
fi

###############################################################################
# Summary
###############################################################################

print_header "Deployment Summary"

echo ""
print_success "Rebuild and deployment complete!"
echo ""
print_info "Next steps:"
echo "  1. Check service health: docker compose -f $DOCKER_COMPOSE_FILE ps"
echo "  2. View logs: docker compose -f $DOCKER_COMPOSE_FILE logs -f [service-name]"
echo "  3. Run diagnostics: ./scripts/diagnose-ubuntu-crashloop.sh"
echo ""
print_info "Service URLs (if configured in Caddyfile):"
echo "  • Dashboard: https://host.evindrake.net"
echo "  • Discord Bot Dashboard: https://bot.rig-city.com"
echo "  • Stream Bot Dashboard: https://stream.rig-city.com"
echo "  • Static Site: https://scarletredjoker.com"
echo ""
