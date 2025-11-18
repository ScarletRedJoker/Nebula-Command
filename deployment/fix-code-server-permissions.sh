#!/bin/bash
# Fix code-server volume permissions for UID/GID 1000

set -e

echo "Fixing code-server volume permissions..."

# Get the volume mount point
VOLUME_PATH=$(docker volume inspect code_server_data --format '{{ .Mountpoint }}' 2>/dev/null || echo "")

if [ -z "$VOLUME_PATH" ]; then
    echo "✗ Volume 'code_server_data' not found. Creating it..."
    docker volume create code_server_data
    VOLUME_PATH=$(docker volume inspect code_server_data --format '{{ .Mountpoint }}')
fi

echo "Volume path: $VOLUME_PATH"

# Fix ownership to match code-server user (1000:1000)
echo "Setting ownership to 1000:1000..."
sudo chown -R 1000:1000 "$VOLUME_PATH"

echo "✓ Permissions fixed!"
echo ""
echo "Now restart code-server:"
echo "  docker-compose -f docker-compose.unified.yml restart code-server"
