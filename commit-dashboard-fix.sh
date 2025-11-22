#!/bin/bash
# Commit and push dashboard fix

echo "Committing dashboard syntax fix..."

git add services/dashboard/services/ai_service.py fix-dashboard.sh
git commit -m "Fix: Remove git merge conflict markers from ai_service.py"
git push origin main

echo ""
echo "✅ Fix pushed to GitHub!"
echo ""
echo "════════════════════════════════════════"
echo "  Next: On your Ubuntu server, run:"
echo "  cd /home/evin/contain/HomeLabHub"
echo "  ./fix-dashboard.sh"
echo "════════════════════════════════════════"
