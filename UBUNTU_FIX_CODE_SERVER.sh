#!/bin/bash
# Fix code-server permissions on Ubuntu

set -e

echo "🔧 Fixing code-server configuration..."

cd /home/evin/contain/HomeLabHub

# 1. Stop code-server
echo "1️⃣ Stopping code-server..."
docker compose -f docker-compose.unified.yml down code-server

# 2. Remove old Docker volume
echo "2️⃣ Removing old Docker volume..."
docker volume rm homelabhub_code_server_data 2>/dev/null || true

# 3. Create local directory with correct permissions
echo "3️⃣ Creating volumes/code-server directory..."
mkdir -p volumes/code-server
mkdir -p config/code-server
chown -R $(id -u):$(id -g) volumes/code-server config/code-server
chmod -R 755 volumes/code-server config/code-server

# 4. Start code-server with new configuration
echo "4️⃣ Starting code-server..."
docker compose -f docker-compose.unified.yml up -d code-server

# 5. Wait and check logs
echo "5️⃣ Waiting 5 seconds and checking logs..."
sleep 5
docker logs code-server 2>&1 | tail -20

echo ""
echo "✅ Code-server fix complete!"
echo "🌐 Access at: https://code.evindrake.net"
echo ""
echo "If still failing, run: docker logs -f code-server"
