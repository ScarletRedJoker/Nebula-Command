#!/bin/bash
# Cleanup and Sync Script for Ubuntu Server
# This resolves git conflicts and removes duplicate .env examples

set -e

echo "═══════════════════════════════════════"
echo "  Homelab Cleanup & Sync"
echo "═══════════════════════════════════════"

# Step 1: Stash local changes
echo ""
echo "[1/5] Stashing local changes..."
git stash push -m "Pre-cleanup stash $(date +%Y%m%d_%H%M%S)"

# Step 2: Pull latest from main
echo ""
echo "[2/5] Pulling latest changes..."
git pull origin main

# Step 3: Remove duplicate .env examples (keep only .env.example)
echo ""
echo "[3/5] Removing duplicate .env example files..."
rm -f .env.production.clean .env.production.ready .env.template .env.unified.example
echo "✅ Removed: .env.production.clean, .env.production.ready, .env.template, .env.unified.example"
echo "✅ Kept: .env.example (comprehensive template)"

# Step 4: Remove backup .env files
echo ""
echo "[4/5] Removing backup .env files..."
rm -f ".env (Copy)" .env.backup* comprehensive-env-fix.sh fix-db-complete.sh fix-streambot-env.sh homelab-logs.txt stream-bot-logs.txt
echo "✅ Cleaned up backup files"

# Step 5: Try to reapply stashed changes (if any conflicts, we'll handle manually)
echo ""
echo "[5/5] Checking stashed changes..."
if git stash list | grep -q "Pre-cleanup stash"; then
    echo "Found stashed changes. Attempting to reapply..."
    if git stash pop; then
        echo "✅ Stashed changes reapplied successfully"
    else
        echo "⚠️  Conflict detected. Your changes are still in the stash."
        echo "   Run 'git stash show -p' to see what was stashed"
        echo "   The new ai_service.py from Replit is already correct, so you can drop the stash:"
        echo "   git stash drop"
    fi
else
    echo "✅ No stashed changes to reapply"
fi

echo ""
echo "═══════════════════════════════════════"
echo "  Cleanup Complete!"
echo "═══════════════════════════════════════"
echo ""
echo "Next steps:"
echo "  1. Review changes: git status"
echo "  2. Commit cleanup: git add -A && git commit -m 'Clean up duplicate .env examples and backup files'"
echo "  3. Push to GitHub: git push origin main"
echo "  4. Restart services: ./homelab fix"
echo ""
