#!/bin/bash
set -euo pipefail

# Colors for output
RED='\033[0;31m'
GREEN='\033[0;32m'
YELLOW='\033[1;33m'
BLUE='\033[0;34m'
NC='\033[0m'

# Configuration
BRANCH="${1:-main}"
COMMIT_MSG="${2:-Auto-sync from Replit}"

echo -e "${BLUE}═══════════════════════════════════════════════════${NC}"
echo -e "${BLUE}   Replit → GitHub Sync Script${NC}"
echo -e "${BLUE}═══════════════════════════════════════════════════${NC}"
echo ""

# Function to print status messages
status() {
    echo -e "${BLUE}[INFO]${NC} $1"
}

success() {
    echo -e "${GREEN}[SUCCESS]${NC} $1"
}

warning() {
    echo -e "${YELLOW}[WARNING]${NC} $1"
}

error() {
    echo -e "${RED}[ERROR]${NC} $1"
}

# Check if we're in a git repository
if [ ! -d .git ]; then
    error "Not a git repository. Please run this script from the project root."
    exit 1
fi

# Step 1: Remove stale lock file if it exists
status "Checking for stale git lock files..."
if [ -f .git/index.lock ]; then
    warning "Found stale .git/index.lock file. Removing..."
    rm -f .git/index.lock
    success "Removed stale lock file"
else
    success "No stale lock files found"
fi

# Step 2: Clean working tree
status "Cleaning working tree with git reset..."
git reset --hard HEAD
success "Working tree reset complete"

# Step 3: Remove untracked files (respecting .gitignore)
status "Removing untracked files..."
git clean -fd
success "Untracked files removed"

# Step 4: Fetch latest changes from remote
status "Fetching latest changes from remote..."
if git fetch origin "$BRANCH" 2>/dev/null; then
    success "Fetched latest changes"
else
    warning "Failed to fetch from remote (may be offline or first push)"
fi

# Step 5: Check for changes to commit
status "Checking for changes to commit..."
if git diff-index --quiet HEAD --; then
    warning "No changes to commit"
    
    # Check if we're behind remote
    LOCAL=$(git rev-parse HEAD)
    REMOTE=$(git rev-parse origin/$BRANCH 2>/dev/null || echo "$LOCAL")
    
    if [ "$LOCAL" = "$REMOTE" ]; then
        success "Repository is up to date with remote"
        exit 0
    else
        warning "Local and remote are out of sync but no local changes"
        status "Attempting to pull..."
        if git pull origin "$BRANCH"; then
            success "Pulled latest changes from remote"
            exit 0
        else
            error "Failed to pull changes. Manual intervention required."
            exit 1
        fi
    fi
fi

# Step 6: Stage all changes
status "Staging all changes..."
git add -A
success "Changes staged"

# Step 7: Commit changes
status "Committing changes..."
if git commit -m "$COMMIT_MSG" -m "$(date '+%Y-%m-%d %H:%M:%S')"; then
    success "Changes committed"
else
    error "Failed to commit changes"
    exit 1
fi

# Step 8: Push to remote
status "Pushing to GitHub ($BRANCH)..."
if git push origin "$BRANCH"; then
    success "Successfully pushed to GitHub!"
    echo ""
    echo -e "${GREEN}═══════════════════════════════════════════════════${NC}"
    echo -e "${GREEN}   ✓ Sync Complete!${NC}"
    echo -e "${GREEN}═══════════════════════════════════════════════════${NC}"
    echo ""
    echo "Next steps on Ubuntu server:"
    echo "  1. cd /home/evin/contain/HomeLabHub"
    echo "  2. git pull origin $BRANCH"
    echo "  3. docker-compose -f docker-compose.unified.yml up -d"
    echo ""
    exit 0
else
    error "Failed to push to GitHub"
    echo ""
    echo -e "${YELLOW}═══════════════════════════════════════════════════${NC}"
    echo -e "${YELLOW}   Troubleshooting Steps${NC}"
    echo -e "${YELLOW}═══════════════════════════════════════════════════${NC}"
    echo ""
    echo "Common issues and solutions:"
    echo ""
    echo "1. Authentication failure:"
    echo "   - Ensure your GitHub credentials are configured"
    echo "   - Run: git config --list | grep user"
    echo "   - Check: git remote -v"
    echo ""
    echo "2. Branch diverged:"
    echo "   - Run: git pull --rebase origin $BRANCH"
    echo "   - Then: git push origin $BRANCH"
    echo ""
    echo "3. Network timeout:"
    echo "   - Check internet connection"
    echo "   - Retry the push: git push origin $BRANCH"
    echo ""
    echo "4. Large files or rate limiting:"
    echo "   - Check file sizes: git ls-files | xargs ls -lh | sort -k5 -hr | head -20"
    echo "   - Consider using Git LFS for large files"
    echo ""
    echo "Manual push command:"
    echo "  git push origin $BRANCH --verbose"
    echo ""
    exit 1
fi
