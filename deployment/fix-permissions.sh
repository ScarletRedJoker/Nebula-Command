#!/bin/bash
# Fix Execute Permissions on All Shell Scripts
# Run this after git sync if scripts lose execute permissions

set -e

echo "Fixing execute permissions on all shell scripts..."

# Root directory scripts
chmod +x *.sh 2>/dev/null || true

# Deployment scripts
chmod +x deployment/*.sh 2>/dev/null || true

# Service scripts
find services -name "*.sh" -type f -exec chmod +x {} \; 2>/dev/null || true

# Scripts directory if it exists
chmod +x scripts/*.sh 2>/dev/null || true

echo "✓ All shell script permissions fixed"
echo ""
echo "You can run this script anytime with:"
echo "  ./deployment/fix-permissions.sh"
