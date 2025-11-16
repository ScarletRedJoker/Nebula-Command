#!/bin/bash
# Fix permissions for all scripts

echo "Fixing file permissions..."

# Make all .sh files executable
find . -name "*.sh" -type f -exec chmod +x {} \;

# Set proper permissions for deployment scripts
chmod +x deploy.sh 2>/dev/null || true
chmod +x homelab-manager.sh 2>/dev/null || true
chmod +x scripts/*.sh 2>/dev/null || true
chmod +x deployment/*.sh 2>/dev/null || true

# Set permissions for data directories
mkdir -p backups logs data 2>/dev/null || true
chmod 755 backups 2>/dev/null || true
chmod 755 logs 2>/dev/null || true
chmod 755 data 2>/dev/null || true

echo "✓ All .sh files are now executable"
echo "✓ Data directories have proper permissions"
echo "Permissions fixed!"
