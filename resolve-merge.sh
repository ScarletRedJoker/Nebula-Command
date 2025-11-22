#!/bin/bash
# Resolve Merge Conflict in Replit Workspace
# The file is already resolved, just need to complete the merge

echo "Resolving merge conflict..."

# Remove git lock if it exists
rm -f .git/index.lock

# Stage the resolved file
git add services/dashboard/services/ai_service.py

# Complete the merge
git commit -m "Resolve merge conflict in ai_service.py - use clean environment-based config"

# Pull to ensure we're in sync
git pull origin main

# Push the resolution
git push origin main

echo "✅ Merge conflict resolved!"
