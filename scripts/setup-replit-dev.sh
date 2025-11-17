#!/bin/bash
# One-time setup for Replit development environment

echo "🔧 Setting up Replit development tools..."

# Make scripts executable
chmod +x scripts/validate-for-ubuntu.sh
chmod +x scripts/validation/*.py
chmod +x cli/replit_dev_console.py
chmod +x .githooks/pre-push

# Set up git hooks
git config core.hooksPath .githooks

echo "✅ Setup complete!"
echo ""
echo "Quick start:"
echo "  1) Run validation: ./scripts/validate-for-ubuntu.sh"
echo "  2) Interactive console: python3 cli/replit_dev_console.py"
echo "  3) Git will auto-validate before push"
