#!/bin/bash
################################################################################
# Ubuntu Production Deployment Diagnostics
#
# This script diagnoses common deployment issues on the Ubuntu production server
# and provides clear fix instructions.
#
# Usage: ./scripts/diagnose-ubuntu-deploy.sh
################################################################################

set -e

RED='\033[0;31m'
GREEN='\033[0;32m'
YELLOW='\033[1;33m'
BLUE='\033[0;34m'
BOLD='\033[1m'
NC='\033[0m'

SCRIPT_DIR="$(cd "$(dirname "${BASH_SOURCE[0]}")" && pwd)"
PROJECT_DIR="$(dirname "$SCRIPT_DIR")"

echo -e "${BOLD}${BLUE}━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━${NC}"
echo -e "${BOLD}  Ubuntu Production Deployment Diagnostics${NC}"
echo -e "${BOLD}${BLUE}━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━${NC}"
echo ""

ERRORS=0
WARNINGS=0

# ===== CHECK 1: Docker Installed =====
echo -e "${BOLD}[1/8] Checking Docker installation...${NC}"
if command -v docker &> /dev/null; then
    DOCKER_VERSION=$(docker --version 2>&1)
    echo -e "${GREEN}✓${NC} Docker is installed: ${DOCKER_VERSION}"
else
    echo -e "${RED}✗${NC} Docker is NOT installed"
    echo ""
    echo -e "${YELLOW}FIX:${NC} Install Docker with:"
    echo "  curl -fsSL https://get.docker.com -o get-docker.sh"
    echo "  sudo sh get-docker.sh"
    echo "  sudo usermod -aG docker \$USER"
    echo "  newgrp docker"
    ERRORS=$((ERRORS + 1))
fi
echo ""

# ===== CHECK 2: Docker Running =====
echo -e "${BOLD}[2/8] Checking Docker daemon...${NC}"
if docker info &> /dev/null; then
    echo -e "${GREEN}✓${NC} Docker daemon is running"
else
    echo -e "${RED}✗${NC} Docker daemon is NOT running or not accessible"
    echo ""
    echo -e "${YELLOW}FIX:${NC} Start Docker with:"
    echo "  sudo systemctl start docker"
    echo "  sudo systemctl enable docker"
    echo ""
    echo -e "${YELLOW}OR if permission denied:${NC}"
    echo "  sudo usermod -aG docker \$USER"
    echo "  newgrp docker"
    echo "  # Then log out and log back in"
    ERRORS=$((ERRORS + 1))
fi
echo ""

# ===== CHECK 3: Docker Compose =====
echo -e "${BOLD}[3/8] Checking Docker Compose...${NC}"
if docker compose version &> /dev/null 2>&1; then
    COMPOSE_VERSION=$(docker compose version 2>&1)
    echo -e "${GREEN}✓${NC} Docker Compose v2: ${COMPOSE_VERSION}"
elif command -v docker-compose &> /dev/null; then
    COMPOSE_VERSION=$(docker-compose --version 2>&1)
    echo -e "${GREEN}✓${NC} Docker Compose v1: ${COMPOSE_VERSION}"
    echo -e "${YELLOW}⚠${NC} Consider upgrading to Docker Compose v2 (plugin)"
    WARNINGS=$((WARNINGS + 1))
else
    echo -e "${RED}✗${NC} Docker Compose is NOT installed"
    echo ""
    echo -e "${YELLOW}FIX:${NC} Install Docker Compose plugin:"
    echo "  sudo apt-get update"
    echo "  sudo apt-get install docker-compose-plugin"
    ERRORS=$((ERRORS + 1))
fi
echo ""

# ===== CHECK 4: Project Directory =====
echo -e "${BOLD}[4/8] Checking project directory...${NC}"
cd "$PROJECT_DIR" || exit 1
if [ -f "docker-compose.unified.yml" ]; then
    echo -e "${GREEN}✓${NC} docker-compose.unified.yml found"
else
    echo -e "${RED}✗${NC} docker-compose.unified.yml NOT found"
    echo -e "${YELLOW}⚠${NC} You may be in the wrong directory"
    echo "  Current: $PROJECT_DIR"
    echo "  Expected: /home/evin/contain/HomeLabHub"
    ERRORS=$((ERRORS + 1))
fi
echo ""

# ===== CHECK 5: Git Repository Status =====
echo -e "${BOLD}[5/8] Checking git repository...${NC}"
if [ -d ".git" ]; then
    echo -e "${GREEN}✓${NC} Git repository found"
    
    # Check for uncommitted changes
    if git diff --quiet && git diff --cached --quiet; then
        echo -e "${GREEN}✓${NC} No uncommitted changes"
    else
        echo -e "${YELLOW}⚠${NC} Working directory has uncommitted changes:"
        echo ""
        git status --short
        echo ""
        echo -e "${YELLOW}FIX:${NC} Either commit or stash your changes:"
        echo "  # Option 1: Stash changes"
        echo "  git stash save 'pre-deployment-backup'"
        echo ""
        echo "  # Option 2: Commit changes"
        echo "  git add -A"
        echo "  git commit -m 'Production changes before deployment'"
        echo ""
        echo "  # Option 3: Discard changes (DANGEROUS)"
        echo "  git reset --hard HEAD"
        WARNINGS=$((WARNINGS + 1))
    fi
    
    # Check for unpushed commits
    if git rev-parse --abbrev-ref --symbolic-full-name @{u} &> /dev/null; then
        UNPUSHED=$(git log @{u}..HEAD --oneline | wc -l)
        if [ "$UNPUSHED" -gt 0 ]; then
            echo -e "${YELLOW}⚠${NC} You have $UNPUSHED unpushed commit(s)"
            WARNINGS=$((WARNINGS + 1))
        fi
    fi
else
    echo -e "${RED}✗${NC} Not a git repository"
    echo -e "${YELLOW}FIX:${NC} Initialize git or clone from correct location"
    ERRORS=$((ERRORS + 1))
fi
echo ""

# ===== CHECK 6: Required Files =====
echo -e "${BOLD}[6/8] Checking required files...${NC}"
REQUIRED_FILES=(
    "docker-compose.unified.yml"
    "Caddyfile"
    "scripts/homelab-orchestrator.sh"
    "deployment/lib-common.sh"
)

for file in "${REQUIRED_FILES[@]}"; do
    if [ -f "$file" ] || [ -d "$file" ]; then
        echo -e "${GREEN}✓${NC} $file"
    else
        echo -e "${RED}✗${NC} $file NOT FOUND"
        ERRORS=$((ERRORS + 1))
    fi
done
echo ""

# ===== CHECK 7: Environment Variables =====
echo -e "${BOLD}[7/8] Checking environment variables...${NC}"
OPTIONAL_VARS=(
    "DATABASE_URL"
    "HOME_ASSISTANT_URL"
    "HOME_ASSISTANT_TOKEN"
    "OPENAI_API_KEY"
)

for var in "${OPTIONAL_VARS[@]}"; do
    if [ -n "${!var}" ]; then
        echo -e "${GREEN}✓${NC} $var is set"
    else
        echo -e "${YELLOW}⚠${NC} $var is not set (optional)"
    fi
done
echo ""

# ===== CHECK 8: Port Availability =====
echo -e "${BOLD}[8/8] Checking critical ports...${NC}"
PORTS=(80 443 5432 6379 5000)

for port in "${PORTS[@]}"; do
    if lsof -Pi :$port -sTCP:LISTEN -t &> /dev/null; then
        echo -e "${GREEN}✓${NC} Port $port is in use (likely by existing service)"
    else
        echo -e "${YELLOW}⚠${NC} Port $port is free (services will bind to it)"
    fi
done
echo ""

# ===== SUMMARY =====
echo -e "${BOLD}${BLUE}━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━${NC}"
echo -e "${BOLD}  Diagnostic Summary${NC}"
echo -e "${BOLD}${BLUE}━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━${NC}"
echo ""

if [ $ERRORS -eq 0 ] && [ $WARNINGS -eq 0 ]; then
    echo -e "${GREEN}${BOLD}✓ ALL CHECKS PASSED!${NC}"
    echo ""
    echo "Your system is ready for deployment."
    echo ""
    echo "Next steps:"
    echo "  1. Pull latest code: git pull origin main"
    echo "  2. Deploy: ./scripts/homelab-orchestrator.sh --deploy"
    echo ""
elif [ $ERRORS -eq 0 ]; then
    echo -e "${YELLOW}${BOLD}⚠ $WARNINGS WARNING(S) FOUND${NC}"
    echo ""
    echo "System is functional but has warnings."
    echo "Review the warnings above and fix if needed."
    echo ""
    echo "You can proceed with deployment:"
    echo "  ./scripts/homelab-orchestrator.sh --deploy"
    echo ""
else
    echo -e "${RED}${BOLD}✗ $ERRORS ERROR(S) FOUND${NC}"
    if [ $WARNINGS -gt 0 ]; then
        echo -e "${YELLOW}⚠ $WARNINGS WARNING(S) FOUND${NC}"
    fi
    echo ""
    echo -e "${RED}System is NOT ready for deployment.${NC}"
    echo "Please fix the errors above before deploying."
    echo ""
    exit 1
fi

echo -e "${BOLD}${BLUE}━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━${NC}"
