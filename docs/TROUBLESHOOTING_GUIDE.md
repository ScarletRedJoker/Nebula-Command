# 🔧 Troubleshooting Guide

**Common issues and solutions for Nebula Command AI Homelab**

---

## 📑 Table of Contents

1. [Deployment Issues](#deployment-issues)
2. [Database Issues](#database-issues)
3. [Stream Bot Issues](#stream-bot-issues)
4. [Dashboard Issues](#dashboard-issues)
5. [Performance Issues](#performance-issues)
6. [SSL/HTTPS Issues](#ssl-https-issues)
7. [Common Error Messages](#common-error-messages)
8. [Recovery Procedures](#recovery-procedures)
9. [Getting Help](#getting-help)

---

## 🚀 Deployment Issues

### Containers Won't Start

**Symptoms:**
- Services shown as "stopped" in dashboard
- `docker ps` shows fewer than 15 containers
- Container exits immediately after starting

**Diagnosis:**

```bash
# Check container logs
docker logs <container-name>

# Examples:
docker logs homelab-dashboard
docker logs stream-bot
docker logs discord-bot

# Check all stopped containers
docker ps -a --filter "status=exited"
```

**Common Causes & Solutions:**

#### 1. Missing Environment Variables

**Error in logs:**
```
Error: Environment variable DATABASE_URL is required
```

**Solution:**
```bash
# Verify .env file exists
ls -la .env

# Check for missing variables
./homelab-manager.sh
# Select Option 10: View Current Configuration

# Regenerate .env if needed
./homelab-manager.sh
# Select Option 9: Generate/Edit .env File
```

#### 2. Port Conflicts

**Error in logs:**
```
Error: bind: address already in use
```

**Solution:**
```bash
# Check what's using the port
sudo lsof -i :5000
sudo lsof -i :3000

# Kill the process or change port
sudo kill -9 <PID>

# Or update docker-compose.unified.yml with different port
```

#### 3. Insufficient Permissions

**Error in logs:**
```
Permission denied: /data
```

**Solution:**
```bash
# Fix code-server permissions
./homelab-manager.sh
# Select Option 24: Fix Code-Server Permissions

# Or manually:
sudo chown -R $USER:$USER services/code-server/data
chmod 755 services/code-server/data
```

#### 4. Run Diagnostics

```bash
./homelab-manager.sh
# Select Option 12b: Run Full Diagnostics

# Check output for specific issues
```

### Build Fails

**Symptoms:**
- Build process stops with errors
- "failed to solve" Docker errors
- Image build failures

**Diagnosis:**

```bash
# Check build logs
./homelab-manager.sh
# Option 1: Full Deploy (observe output)

# Or build manually with verbose output
docker compose -f docker-compose.unified.yml build --no-cache
```

**Common Causes & Solutions:**

#### 1. Docker Cache Issues

**Error:**
```
failed to solve: failed to compute cache key
```

**Solution:**
```bash
# Clear Docker cache
docker builder prune -af

# Rebuild without cache
./homelab-manager.sh
# Option 3: Rebuild & Deploy (force rebuild)
```

#### 2. Insufficient Disk Space

**Error:**
```
no space left on device
```

**Solution:**
```bash
# Check disk space
df -h

# Clean up Docker
docker system prune -af
docker volume prune -f

# Remove old images
docker image prune -af

# Check space again
df -h
```

#### 3. Network/Internet Issues

**Error:**
```
Get "https://registry-1.docker.io": dial tcp: i/o timeout
```

**Solution:**
```bash
# Test internet connectivity
ping -c 4 8.8.8.8
ping -c 4 registry-1.docker.io

# Check DNS
nslookup registry-1.docker.io

# Restart Docker daemon
sudo systemctl restart docker

# Retry build
./homelab-manager.sh → Option 1
```

#### 4. Dependency Installation Failures

**Error:**
```
npm ERR! network request failed
pip: error: externally-managed-environment
```

**Solution:**
```bash
# For Node.js services: Clear npm cache
docker compose exec stream-bot npm cache clean --force

# For Python services: Already handled in Dockerfile
# (uses virtual environments)

# Rebuild specific service
docker compose build stream-bot --no-cache
```

### Network Issues

**Symptoms:**
- Services can't communicate
- External access not working
- DNS resolution failures

**Diagnosis:**

```bash
# Check Docker networks
docker network ls

# Inspect homelab network
docker network inspect homelab

# Check Caddy configuration
docker logs caddy

# Test network connectivity between containers
docker exec homelab-dashboard ping stream-bot
```

**Common Causes & Solutions:**

#### 1. Docker Network Not Created

**Solution:**
```bash
# Check Docker network
./homelab-manager.sh
# Option 12a: Check Docker Network

# Recreate if needed
docker network create homelab
```

#### 2. Firewall Blocking Ports

**Solution:**
```bash
# Check UFW status
sudo ufw status verbose

# Allow required ports
sudo ufw allow 80/tcp
sudo ufw allow 443/tcp
sudo ufw allow 443/udp
sudo ufw allow 3000/tcp
sudo ufw allow 5000/tcp

# Reload firewall
sudo ufw reload
```

#### 3. DNS Resolution Issues

**Solution:**
```bash
# Test DNS from container
docker exec homelab-dashboard nslookup google.com

# Check /etc/resolv.conf in container
docker exec homelab-dashboard cat /etc/resolv.conf

# Restart Docker to reset DNS
sudo systemctl restart docker
docker compose up -d
```

#### 4. Caddy Reverse Proxy Issues

**Solution:**
```bash
# Check Caddy logs
docker logs caddy

# Validate Caddyfile
./homelab-manager.sh
# Option 13a: Format Caddyfile (validates syntax)

# Restart Caddy
docker restart caddy
```

---

## 🗄️ Database Issues

### Connection Refused

**Symptoms:**
- "connection refused" errors in logs
- Services can't connect to database
- Database queries timeout

**Diagnosis:**

```bash
# Check database status
./homelab-manager.sh
# Option 7: Check Database Status

# Test database connectivity manually
psql "postgresql://user:password@host:5432/database" -c "SELECT 1;"
```

**Common Causes & Solutions:**

#### 1. Incorrect DATABASE_URL Format

**Error:**
```
connection to server at "localhost", port 5432 failed: Connection refused
```

**Solution:**
```bash
# Verify DATABASE_URL format in .env
cat .env | grep DATABASE_URL

# Correct format:
# DATABASE_URL=postgresql://username:password@host:5432/database_name

# For Neon:
# DATABASE_URL=postgresql://user:password@ep-xxx.us-east-2.aws.neon.tech/dbname

# Update .env and restart services
./homelab-manager.sh → Option 2: Quick Restart
```

#### 2. PostgreSQL Service Not Running (if local)

**Solution:**
```bash
# Check PostgreSQL status
sudo systemctl status postgresql

# Start if stopped
sudo systemctl start postgresql

# Enable on boot
sudo systemctl enable postgresql
```

#### 3. Network Connectivity to Remote Database

**Solution:**
```bash
# Test connection from host
ping <database-host>

# Test with psql
psql "postgresql://user:password@host:5432/database" -c "SELECT version();"

# Check firewall allows outbound connections
# Verify database allows connections from your IP
```

#### 4. Database Credentials Incorrect

**Solution:**
```bash
# Verify credentials in database provider console
# (Neon, AWS RDS, etc.)

# Update .env with correct credentials
nano .env

# Restart affected services
docker restart homelab-dashboard
docker restart stream-bot
docker restart discord-bot
```

### Migration Errors

**Symptoms:**
- "relation does not exist" errors
- "column does not exist" errors
- "InFailedSqlTransaction" errors

**Diagnosis:**

```bash
# Check migration status
./homelab-manager.sh
# Option 7: Check Database Status

# View database logs
docker logs homelab-dashboard | grep -i migration
docker logs stream-bot | grep -i migration
```

**Common Causes & Solutions:**

#### 1. Migrations Not Applied

**Error:**
```
relation "marketplace_deployments" does not exist
```

**Solution:**
```bash
# Run database migrations
./homelab-manager.sh
# Option 22: Fix Database Migrations & Rollback Issues

# Or manually for each service:
docker exec homelab-dashboard python -m flask db upgrade
docker exec stream-bot npm run migrate

# Verify migrations applied
./homelab-manager.sh → Option 7
```

#### 2. InFailedSqlTransaction Error

**Error:**
```
current transaction is aborted, commands ignored until end of transaction block
```

**Solution:**
```bash
# This was a known issue, fixed in latest code

# Ensure you have latest code:
git pull

# Rebuild and redeploy:
./homelab-manager.sh → Option 3: Rebuild & Deploy

# Migrations now use proper error handling:
# - CREATE TABLE IF NOT EXISTS
# - ON CONFLICT DO UPDATE for OAuth tokens
```

#### 3. Migration Conflicts

**Error:**
```
duplicate key value violates unique constraint
```

**Solution:**
```bash
# Rollback last migration
docker exec homelab-dashboard python -m flask db downgrade

# Review migration file
cat services/dashboard/migrations/versions/*.py

# Fix migration and reapply
docker exec homelab-dashboard python -m flask db upgrade
```

#### 4. Schema Drift

**Solution:**
```bash
# Generate new migration to sync schema
docker exec homelab-dashboard python -m flask db migrate -m "Fix schema drift"

# Review generated migration
cat services/dashboard/migrations/versions/[latest].py

# Apply migration
docker exec homelab-dashboard python -m flask db upgrade
```

### Database Migration: agent_messages Foreign Key Error

**Error:**
```
psycopg2.errors.DatatypeMismatch: foreign key constraint "agent_messages_from_agent_id_fkey" cannot be implemented
DETAIL: Key columns "from_agent_id" and "id" are of incompatible types: character varying and uuid.
```

**Cause:**
Legacy `agent_messages` table from early development has VARCHAR columns, but production migrations expect UUID.

**Root Cause:**
Production database has old `agent_messages` table:
- `from_agent_id`: VARCHAR (old)
- `to_agent_id`: VARCHAR (old)
- `response_to`: VARCHAR (old)

Migration 014 expects:
- `from_agent_id`: UUID (new)
- `to_agent_id`: UUID (new)
- `response_to`: UUID (new)

When migration runs:
1. Table exists → Guard clause skips DROP/CREATE
2. Tries to add foreign key with UUID
3. PostgreSQL ERROR: VARCHAR != UUID

**Solution:**
```bash
# Use the homelab-manager.sh menu
./homelab-manager.sh
# Select Option 22a: Fix Production Database Schema (VARCHAR → UUID)

# Or run the script directly:
./deployment/scripts/fix-production-database.sh

# After fix completes, run migrations:
docker exec homelab-dashboard python -m alembic upgrade head

# Restart services:
./homelab-manager.sh
# Choose: 2) Quick Restart
```

**Manual Fix (if needed):**
```bash
# Connect to database
psql "postgresql://user:password@host:5432/database"

# Check column types
SELECT column_name, data_type 
FROM information_schema.columns 
WHERE table_name = 'agent_messages' 
  AND column_name IN ('from_agent_id', 'to_agent_id', 'response_to');

# If VARCHAR detected, drop and recreate:
DROP TABLE IF EXISTS agent_messages CASCADE;
DROP TABLE IF EXISTS chat_history CASCADE;

# Exit psql and run migrations
docker exec homelab-dashboard python -m alembic upgrade head
```

**Prevention:**
This is a one-time fix for production databases that existed before UUID migration was added. New deployments will have the correct schema from the start.

**Verification:**
```bash
# Verify migration completed successfully
./homelab-manager.sh
# Option 7: Check Database Status

# Check for any errors in logs
docker logs homelab-dashboard | grep -i "agent_messages"
```

### Performance Issues

**Symptoms:**
- Slow query response times
- Database CPU at 100%
- Connection pool exhausted

**Diagnosis:**

```bash
# Check database metrics (for Neon)
# Visit Neon console → Monitoring

# For local PostgreSQL:
sudo -u postgres psql

# Check active connections
SELECT count(*) FROM pg_stat_activity;

# Find slow queries
SELECT pid, now() - query_start AS duration, query 
FROM pg_stat_activity 
WHERE state = 'active' 
ORDER BY duration DESC;
```

**Solutions:**

#### 1. Optimize Connection Pool

```bash
# Edit .env
nano .env

# Adjust pool settings (example for Python services):
DATABASE_POOL_SIZE=20
DATABASE_MAX_OVERFLOW=10

# Restart services
docker restart homelab-dashboard stream-bot discord-bot
```

#### 2. Add Indexes

```sql
-- Connect to database
psql "postgresql://..."

-- Add indexes for commonly queried columns
CREATE INDEX idx_deployments_user_id ON marketplace_deployments(user_id);
CREATE INDEX idx_oauth_tokens_platform ON oauth_tokens(platform);

-- Analyze tables
ANALYZE marketplace_deployments;
ANALYZE oauth_tokens;
```

#### 3. Clean Old Data

```sql
-- Remove old logs (older than 30 days)
DELETE FROM logs WHERE created_at < NOW() - INTERVAL '30 days';

-- Remove expired OAuth tokens
DELETE FROM oauth_tokens WHERE expires_at < NOW();

-- Vacuum database
VACUUM ANALYZE;
```

#### 4. Monitor Query Performance

```bash
# Enable slow query logging in PostgreSQL
# Edit postgresql.conf:
log_min_duration_statement = 1000  # Log queries > 1 second

# Review slow query log
sudo tail -f /var/log/postgresql/postgresql-*.log
```

---

## 🤖 Stream Bot Issues

### OAuth Failures

**Symptoms:**
- "OAuth failed" error on callback
- Redirect loop during authentication
- "Invalid redirect URI" error

**Diagnosis:**

```bash
# Check Stream Bot logs
docker logs stream-bot

# Look for OAuth-related errors
docker logs stream-bot | grep -i oauth
docker logs stream-bot | grep -i "redirect"
```

**Common Causes & Solutions:**

#### 1. Incorrect Redirect URI

**Error:**
```
Error: redirect_uri_mismatch
The redirect URI provided does not match the ones registered
```

**Solution:**
```bash
# Check redirect URI in .env
cat .env | grep CALLBACK_URL

# Should be:
# TWITCH_SIGNIN_CALLBACK_URL=https://stream.yourdomain.com/api/auth/twitch/callback
# YOUTUBE_SIGNIN_CALLBACK_URL=https://stream.yourdomain.com/api/auth/youtube/callback

# Update OAuth app settings in platform developer console:
# Twitch: https://dev.twitch.tv/console/apps
# YouTube: https://console.cloud.google.com/apis/credentials

# Add exact redirect URI (including https://)
# Restart Stream Bot
docker restart stream-bot
```

#### 2. Invalid Client ID/Secret

**Error:**
```
Error: invalid_client
Client authentication failed
```

**Solution:**
```bash
# Verify credentials in .env
cat .env | grep -E "CLIENT_ID|CLIENT_SECRET"

# Compare with platform developer console
# Regenerate client secret if needed

# Update .env with correct values
nano .env

# Rebuild Stream Bot to pick up new env vars
./homelab-manager.sh → Option 3: Rebuild & Deploy
```

#### 3. Browser Cookie Issues

**Solution:**
```bash
# Clear browser cookies for your domain
# Chrome: Settings → Privacy → Clear browsing data → Cookies

# Try incognito/private browsing mode
# Try different browser

# Check Stream Bot logs during OAuth flow
docker logs -f stream-bot
```

#### 4. OAuth Token Expiry

**Error:**
```
Error: Token expired
```

**Solution:**
```bash
# Stream Bot should auto-refresh tokens
# Check refresh logic in logs
docker logs stream-bot | grep -i "refresh"

# Manually re-authenticate
# Visit Stream Bot → Settings → Platforms
# Click "Disconnect" then "Reconnect"
```

### Bot Won't Connect to Chat

**Symptoms:**
- Bot status shows "offline"
- No chat messages received
- Connection timeout errors

**Diagnosis:**

```bash
# Check bot status
docker logs stream-bot | grep -i "connected"
docker logs stream-bot | grep -i "chat"

# Check network connectivity
docker exec stream-bot ping irc.chat.twitch.tv
```

**Common Causes & Solutions:**

#### 1. OAuth Tokens Not Set

**Solution:**
```bash
# Complete OAuth flow first
# Visit https://stream.yourdomain.com
# Connect each platform (Twitch, YouTube, Kick)

# Verify tokens stored in database
./homelab-manager.sh → Option 7: Check Database Status

# Check Stream Bot logs for token validation
docker logs stream-bot
```

#### 2. Bot Permissions Insufficient

**Solution:**
```
Twitch:
- Ensure bot account has "Editor" role in channel
- Grant moderator permissions if needed
- Check scopes in OAuth app settings

YouTube:
- Verify YouTube Data API v3 enabled
- Check quota limits not exceeded
- Ensure channel ID correct

Kick:
- Verify bot account exists
- Check channel permissions
```

#### 3. Connection Logs Show Errors

**Error:**
```
Error: Login authentication failed
```

**Solution:**
```bash
# Check platform-specific credentials
cat .env | grep -i twitch
cat .env | grep -i youtube

# Test token with platform API
# Twitch:
curl -H "Authorization: Bearer YOUR_TOKEN" \
  https://id.twitch.tv/oauth2/validate

# Reconnect platform
docker restart stream-bot
```

#### 4. Network/Firewall Issues

**Solution:**
```bash
# Allow outbound connections for IRC (Twitch)
sudo ufw allow out 6667/tcp
sudo ufw allow out 443/tcp

# Test connection manually
telnet irc.chat.twitch.tv 6667

# Restart bot
docker restart stream-bot
```

### Commands Not Working

**Symptoms:**
- Bot doesn't respond to commands
- Only some commands work
- Command cooldown not working

**Diagnosis:**

```bash
# Check bot logs when sending command
docker logs -f stream-bot
# (Send command in chat)

# List all commands
curl https://stream.yourdomain.com/api/commands
```

**Common Causes & Solutions:**

#### 1. Command Syntax Wrong

**Solution:**
```bash
# Check command trigger
# Default prefix: !

# Command must match exactly:
# !socials ✓
# Socials ✗
# !Socials ✗ (unless case-insensitive enabled)

# Check command settings in dashboard
# Stream Bot → Commands tab
```

#### 2. Permission Issues

**Solution:**
```
Command permissions:
- Everyone: All viewers
- Subscriber: Subs only
- VIP: VIPs and above
- Moderator: Mods and broadcaster
- Broadcaster: Broadcaster only

Fix:
1. Stream Bot → Commands → Select command
2. Check "Permission" setting
3. Lower permission if too restrictive
4. Save and test
```

#### 3. Cooldown Not Expired

**Solution:**
```bash
# Cooldowns prevent spam
# Global: Affects all users
# Per-user: Individual cooldown

# Check cooldown in command settings
# Reduce if too long

# Test with moderator account (bypasses cooldowns)
```

#### 4. Bot Not in Channel

**Solution:**
```bash
# Verify bot is in Twitch channel
# Visit https://twitch.tv/YOUR_CHANNEL
# Check viewer list for bot username

# If not present:
# Stream Bot → Settings → Platforms
# Reconnect Twitch
# Ensure auto-join enabled

# Check logs
docker logs stream-bot | grep -i "joined channel"
```

### OBS Connection Fails

**Symptoms:**
- "Failed to connect to OBS" error
- OBS controls don't work
- Scenes don't switch

**Diagnosis:**

```bash
# Check OBS WebSocket status
# OBS → Tools → WebSocket Server Settings
# Ensure "Enable WebSocket server" is checked

# Check Stream Bot logs
docker logs stream-bot | grep -i obs
```

**Common Causes & Solutions:**

#### 1. WebSocket Settings Incorrect

**Solution:**
```
OBS Setup:
1. Tools → WebSocket Server Settings
2. Enable WebSocket server
3. Server Port: 4455 (default)
4. Set password: [secure password]
5. Click Apply

Stream Bot Setup:
1. OBS tab → Connection Settings
2. Host: localhost (if same machine) or IP
3. Port: 4455
4. Password: [same as OBS]
5. Click Connect
```

#### 2. OBS WebSocket Plugin Not Installed

**Solution:**
```
For OBS 28+:
- WebSocket built-in, already available

For OBS <28:
1. Download obs-websocket plugin
2. Visit: https://github.com/obsproject/obs-websocket/releases
3. Install plugin
4. Restart OBS
5. Enable in Tools → WebSocket Server Settings
```

#### 3. Firewall Blocking Port 4455

**Solution:**
```bash
# Allow WebSocket port
sudo ufw allow 4455/tcp

# If OBS on different machine:
# Allow from specific IP
sudo ufw allow from <obs-machine-ip> to any port 4455

# Reload firewall
sudo ufw reload
```

#### 4. Encryption Key Mismatch

**Solution:**
```bash
# Check OBS WebSocket encryption settings
# OBS → Tools → WebSocket Server Settings

# If using encryption:
# Generate base64 key
openssl rand -base64 32

# Add to .env
echo "OBS_WEBSOCKET_ENCRYPTION_KEY=<key>" >> .env

# Configure in OBS settings
# Restart Stream Bot
docker restart stream-bot
```

---

## 🎛️ Dashboard Issues

### Login Fails

**Symptoms:**
- "Invalid credentials" error
- Login form doesn't submit
- Session immediately expires

**Diagnosis:**

```bash
# Check dashboard logs
docker logs homelab-dashboard | grep -i "login"
docker logs homelab-dashboard | grep -i "auth"

# Verify Redis running (for sessions)
docker ps | grep redis
```

**Common Causes & Solutions:**

#### 1. Session Configuration Issue

**Solution:**
```bash
# Check Redis is running
docker ps | grep homelab-redis

# If not running:
docker start homelab-redis

# Verify SESSION_SECRET in .env
cat .env | grep SESSION_SECRET

# If missing, generate:
python3 -c 'import secrets; print(secrets.token_hex(32))' >> .env

# Restart dashboard
docker restart homelab-dashboard
```

#### 2. Redis Connection Failed

**Error in logs:**
```
Error: Redis connection refused
```

**Solution:**
```bash
# Check Redis logs
docker logs homelab-redis

# Restart Redis
docker restart homelab-redis

# Test Redis connection
docker exec homelab-redis redis-cli ping
# Should output: PONG

# Restart dashboard
docker restart homelab-dashboard
```

#### 3. Browser Cache Issues

**Solution:**
```
1. Clear browser cache
   - Chrome: Ctrl+Shift+Delete
   - Firefox: Ctrl+Shift+Delete
   
2. Clear cookies for your domain
   
3. Try incognito/private browsing
   
4. Try different browser
```

#### 4. Incorrect Credentials

**Solution:**
```bash
# Check authentication method
# Default uses session-based auth

# For API key auth:
cat .env | grep DASHBOARD_API_KEY

# Reset password (if using database auth)
docker exec homelab-dashboard python reset_password.py
```

### Jarvis AI Not Responding

**Symptoms:**
- Chat sends but no response
- "AI service unavailable" error
- Timeout waiting for response

**Diagnosis:**

```bash
# Check OpenAI API key
cat .env | grep OPENAI_API_KEY

# Test API key
curl https://api.openai.com/v1/models \
  -H "Authorization: Bearer $OPENAI_API_KEY"

# Check dashboard logs
docker logs homelab-dashboard | grep -i jarvis
docker logs homelab-dashboard | grep -i openai
```

**Common Causes & Solutions:**

#### 1. OpenAI API Key Not Set

**Solution:**
```bash
# Check .env for key
cat .env | grep OPENAI_API_KEY

# If missing, add:
nano .env
# Add: OPENAI_API_KEY=sk-proj-...

# Rebuild to pick up new env var
./homelab-manager.sh → Option 3: Rebuild & Deploy
```

#### 2. API Quota Exceeded

**Error:**
```
Error: You exceeded your current quota
```

**Solution:**
```
1. Check OpenAI usage:
   https://platform.openai.com/usage
   
2. Add payment method or upgrade plan
   
3. Wait for quota reset (monthly)
   
4. Use alternative AI provider (if configured)
```

#### 3. Network Connectivity to OpenAI

**Solution:**
```bash
# Test connectivity from container
docker exec homelab-dashboard curl https://api.openai.com/v1/models

# Check firewall allows HTTPS
sudo ufw status

# Test DNS resolution
docker exec homelab-dashboard nslookup api.openai.com

# Restart dashboard
docker restart homelab-dashboard
```

#### 4. AI Service Logs Show Errors

**Solution:**
```bash
# View detailed AI logs
docker logs homelab-dashboard | grep -A 5 "jarvis"

# Common errors:
# "Invalid API key" → Check key format (starts with sk-)
# "Model not found" → Check model name in code
# "Timeout" → Increase timeout or check network

# Test with curl
curl https://api.openai.com/v1/chat/completions \
  -H "Content-Type: application/json" \
  -H "Authorization: Bearer $OPENAI_API_KEY" \
  -d '{
    "model": "gpt-4",
    "messages": [{"role": "user", "content": "Hello"}]
  }'
```

### Marketplace Won't Install Apps

**Symptoms:**
- "Deployment failed" error
- Apps stuck in "deploying" status
- Installation wizard errors

**Diagnosis:**

```bash
# Check Celery worker status
docker ps | grep celery

# Check Celery logs
docker logs homelab-celery-worker

# Check deployment status
docker logs homelab-dashboard | grep -i marketplace
```

**Common Causes & Solutions:**

#### 1. Celery Worker Not Running

**Solution:**
```bash
# Check if Celery container is running
docker ps | grep celery

# If not running, start it
docker start homelab-celery-worker

# Check logs for errors
docker logs homelab-celery-worker

# Restart dashboard and Celery
docker restart homelab-dashboard homelab-celery-worker
```

#### 2. Docker Not Accessible

**Solution:**
```bash
# Verify Docker socket mounted
docker exec homelab-dashboard ls -la /var/run/docker.sock

# Check permissions
ls -la /var/run/docker.sock
# Should be: srw-rw---- 1 root docker

# If permission denied:
sudo chmod 666 /var/run/docker.sock
# Or add user to docker group (preferred):
sudo usermod -aG docker $USER

# Restart dashboard
docker restart homelab-dashboard
```

#### 3. Template Configuration Invalid

**Solution:**
```bash
# Test template validation
curl -X POST https://host.yourdomain.com/api/marketplace/templates/apps/wordpress/validate \
  -H "Content-Type: application/json" \
  -d '{
    "instance_name": "test",
    "domain": "test.example.com"
  }'

# Check for validation errors
# Fix configuration and retry
```

#### 4. Port Conflicts

**Error:**
```
Error: port is already allocated
```

**Solution:**
```bash
# Check which ports are in use
docker ps --format "table {{.Names}}\t{{.Ports}}"

# Marketplace auto-assigns ports if conflict
# Check logs for assigned port
docker logs homelab-dashboard | grep -i "port.*assigned"

# Or manually specify port in deployment
```

### WebSocket Disconnects

**Symptoms:**
- Real-time updates stop working
- "WebSocket disconnected" message
- Frequent reconnections

**Diagnosis:**

```bash
# Check dashboard logs for WebSocket errors
docker logs homelab-dashboard | grep -i websocket

# Check Redis (WebSocket backend)
docker logs homelab-redis

# Browser console (F12) for client-side errors
```

**Common Causes & Solutions:**

#### 1. Network Instability

**Solution:**
```bash
# Check network connectivity
ping -c 10 host.yourdomain.com

# Check for packet loss
# If >5% packet loss, investigate network

# Use wired connection instead of WiFi
# Contact ISP if issues persist
```

#### 2. Redis Connection Lost

**Solution:**
```bash
# Check Redis status
docker ps | grep redis

# Restart Redis
docker restart homelab-redis

# Check Redis persistence
docker exec homelab-redis redis-cli CONFIG GET save

# Restart dashboard
docker restart homelab-dashboard
```

#### 3. Session Timeout

**Solution:**
```bash
# Increase session timeout
nano .env

# Add/update:
SESSION_LIFETIME=3600  # seconds (1 hour)
SESSION_PERMANENT=true

# Restart dashboard
docker restart homelab-dashboard
```

#### 4. Reverse Proxy Timeout

**Solution:**
```bash
# Check Caddy timeout settings
cat Caddyfile

# Add timeout directives if needed:
# reverse_proxy homelab-dashboard:5000 {
#     timeout 90s
# }

# Restart Caddy
docker restart caddy
```

---

## ⚡ Performance Issues

### High CPU Usage

**Symptoms:**
- Server feels slow/unresponsive
- `top` shows high CPU usage
- Containers using excessive CPU

**Diagnosis:**

```bash
# Check overall system CPU
top
htop  # (if installed)

# Check per-container CPU
docker stats

# Or using homelab-manager
./homelab-manager.sh
# Option 12: Health Check & Diagnostics
```

**Common Causes & Solutions:**

#### 1. Runaway Process

**Solution:**
```bash
# Identify high CPU container
docker stats --no-stream | sort -k3 -h

# Check logs for errors/loops
docker logs <high-cpu-container>

# Restart problematic service
docker restart <container-name>

# If persists, check code for infinite loops
```

#### 2. Too Many Workers

**Solution:**
```bash
# Adjust worker count for services

# For Celery:
nano docker-compose.unified.yml
# Find celery worker, adjust:
# command: celery -A app.celery worker --concurrency=2

# For Gunicorn (if used):
# --workers 2

# Restart services
./homelab-manager.sh → Option 2: Quick Restart
```

#### 3. Resource Limits Not Set

**Solution:**
```bash
# Add resource limits to docker-compose.unified.yml
nano docker-compose.unified.yml

# Example:
# services:
#   homelab-dashboard:
#     deploy:
#       resources:
#         limits:
#           cpus: '1.0'
#           memory: 1G

# Restart services
./homelab-manager.sh → Option 2
```

#### 4. Excessive Logging

**Solution:**
```bash
# Reduce log verbosity
nano .env

# Add:
LOG_LEVEL=WARNING  # Instead of DEBUG/INFO

# Restart services
./homelab-manager.sh → Option 2
```

### High Memory Usage

**Symptoms:**
- Out of memory errors
- System swap usage high
- OOM killer terminating processes

**Diagnosis:**

```bash
# Check system memory
free -h

# Check per-container memory
docker stats

# Check for OOM kills
dmesg | grep -i "out of memory"
journalctl -k | grep -i "killed process"
```

**Common Causes & Solutions:**

#### 1. Memory Leaks

**Solution:**
```bash
# Identify high memory container
docker stats --no-stream | sort -k4 -h

# Restart to free memory
docker restart <container-name>

# Monitor over time
watch -n 5 'docker stats --no-stream'

# If memory grows continuously:
# - Review application code for leaks
# - Check for unclosed database connections
# - Monitor object/event listener cleanup
```

#### 2. No Memory Limits Set

**Solution:**
```bash
# Set memory limits in docker-compose.unified.yml
nano docker-compose.unified.yml

# Example:
# services:
#   homelab-dashboard:
#     deploy:
#       resources:
#         limits:
#           memory: 1G
#         reservations:
#           memory: 512M

# Restart
./homelab-manager.sh → Option 2
```

#### 3. Too Many Cached Objects

**Solution:**
```bash
# Clear Redis cache
docker exec homelab-redis redis-cli FLUSHDB

# Optimize database connection pool
nano .env

# Reduce pool size:
DATABASE_POOL_SIZE=10
DATABASE_MAX_OVERFLOW=5

# Restart services
./homelab-manager.sh → Option 2
```

#### 4. Large Log Files

**Solution:**
```bash
# Check log sizes
docker ps -q | xargs -I {} docker inspect --format='{{.Name}} {{.LogPath}}' {}

# Clear logs
sudo truncate -s 0 /var/lib/docker/containers/*/*.log

# Configure log rotation
nano /etc/docker/daemon.json

# Add:
# {
#   "log-driver": "json-file",
#   "log-opts": {
#     "max-size": "10m",
#     "max-file": "3"
#   }
# }

# Restart Docker
sudo systemctl restart docker
```

### Slow Response Times

**Symptoms:**
- Dashboard loads slowly
- API requests timeout
- Page renders take >5 seconds

**Diagnosis:**

```bash
# Check response time
time curl https://host.yourdomain.com

# Check network latency
ping host.yourdomain.com

# Check database query time
docker logs homelab-dashboard | grep "slow query"

# Browser DevTools: Network tab (F12)
```

**Common Causes & Solutions:**

#### 1. Database Slow Queries

**Solution:**
```bash
# See "Database Issues → Performance Issues" section above

# Quick fixes:
# - Add indexes
# - Optimize queries
# - Increase connection pool
# - Use query caching
```

#### 2. Network Latency

**Solution:**
```bash
# Test latency
ping -c 10 host.yourdomain.com

# Trace route
traceroute host.yourdomain.com

# If high latency:
# - Use CDN for static assets
# - Enable compression (already in Caddy)
# - Optimize images
# - Consider server location
```

#### 3. Unoptimized Assets

**Solution:**
```bash
# Compress images
# Minify CSS/JS
# Enable browser caching

# Caddy handles compression automatically
# Check Caddyfile for encode directive

# Add to Caddyfile if missing:
# encode gzip

# Restart Caddy
docker restart caddy
```

#### 4. No Caching

**Solution:**
```bash
# Enable Redis caching
# Already configured in services

# Verify Redis working
docker exec homelab-redis redis-cli INFO

# Check cache hit rate
docker exec homelab-redis redis-cli INFO stats | grep hits

# Increase cache TTL if needed
nano .env
# CACHE_TTL=3600  # 1 hour
```

---

## 🔒 SSL/HTTPS Issues

### Certificate Errors

**Symptoms:**
- "Your connection is not private" warning
- ERR_CERT_AUTHORITY_INVALID
- Certificate expired errors

**Diagnosis:**

```bash
# Check Caddy logs
docker logs caddy | grep -i certificate
docker logs caddy | grep -i "acme"

# Test SSL certificate
openssl s_client -connect host.yourdomain.com:443 -servername host.yourdomain.com

# Check certificate expiry
echo | openssl s_client -connect host.yourdomain.com:443 2>/dev/null | openssl x509 -noout -dates
```

**Common Causes & Solutions:**

#### 1. DNS Not Propagated

**Solution:**
```bash
# Check DNS resolution
nslookup host.yourdomain.com
dig host.yourdomain.com

# Verify A record points to correct IP
# Wait 5-15 minutes for DNS propagation

# Test from different location
# https://www.whatsmydns.net

# Once DNS correct, restart Caddy
docker restart caddy
```

#### 2. Port 80/443 Blocked

**Solution:**
```bash
# Check firewall
sudo ufw status | grep -E "80|443"

# Allow ports
sudo ufw allow 80/tcp
sudo ufw allow 443/tcp
sudo ufw allow 443/udp  # For HTTP/3

# Reload firewall
sudo ufw reload

# Test ports externally
# https://www.yougetsignal.com/tools/open-ports/

# Restart Caddy
docker restart caddy
```

#### 3. Let's Encrypt Rate Limit

**Error in logs:**
```
Error: too many certificates already issued
```

**Solution:**
```
Let's Encrypt limits:
- 50 certificates per domain per week
- 5 duplicate certificates per week

Wait for rate limit window to reset (7 days)

Or use staging environment for testing:
1. Edit Caddyfile
2. Add: acme_ca https://acme-staging-v02.api.letsencrypt.org/directory
3. Test SSL setup
4. Remove line for production
```

#### 4. Invalid Caddyfile Syntax

**Solution:**
```bash
# Format and validate Caddyfile
./homelab-manager.sh
# Option 13a: Format Caddyfile

# Check Caddy logs for errors
docker logs caddy

# Test Caddyfile manually
docker exec caddy caddy validate --config /etc/caddy/Caddyfile

# Fix errors and restart
docker restart caddy
```

### Mixed Content Warnings

**Symptoms:**
- Browser console shows mixed content errors
- Some assets don't load over HTTPS
- Page partially broken

**Diagnosis:**
```bash
# Check browser console (F12)
# Look for: "Mixed Content: The page at 'https://...' was loaded over HTTPS, but requested an insecure resource 'http://...'"

# Check page source for http:// links
curl https://host.yourdomain.com | grep -i 'http://'
```

**Solution:**

```bash
# Ensure all assets use HTTPS or relative URLs

# Update frontend code:
# Change: src="http://example.com/script.js"
# To:     src="https://example.com/script.js"
# Or:     src="//example.com/script.js"

# For internal resources, use relative paths:
# /static/js/app.js instead of http://...

# Add Content-Security-Policy header in Caddy:
nano Caddyfile

# Add under each domain:
# header {
#   Content-Security-Policy "upgrade-insecure-requests"
# }

# Restart Caddy
docker restart caddy
```

---

## 🚨 Common Error Messages

### "relation does not exist"

**Full Error:**
```
psycopg2.errors.UndefinedTable: relation "marketplace_deployments" does not exist
```

**Cause:** Database migrations not applied

**Solution:**
```bash
./homelab-manager.sh
# Option 22: Fix Database Migrations & Rollback Issues

# Or manually:
docker exec homelab-dashboard python -m flask db upgrade
```

### "unknown flag: --filter"

**Full Error:**
```
unknown flag: --filter
```

**Cause:** Old version of homelab-manager.sh

**Solution:**
```bash
# Pull latest code
git pull

# Make executable
chmod +x homelab-manager.sh

# Run again
./homelab-manager.sh
```

### "InFailedSqlTransaction"

**Full Error:**
```
InFailedSqlTransaction: current transaction is aborted
```

**Cause:** Fixed in latest code (OAuth UPSERT logic)

**Solution:**
```bash
# Update code
git pull

# Rebuild and redeploy
./homelab-manager.sh → Option 3: Rebuild & Deploy
```

### "duplicate key constraint"

**Full Error:**
```
duplicate key value violates unique constraint "oauth_tokens_pkey"
```

**Cause:** Fixed in latest code (ON CONFLICT DO UPDATE)

**Solution:**
```bash
# Update code
git pull

# Run migration fix
./homelab-manager.sh → Option 22

# Rebuild
./homelab-manager.sh → Option 3
```

### "connection refused"

**Full Error:**
```
Error: connect ECONNREFUSED 127.0.0.1:5432
```

**Cause:** Service not running or incorrect connection details

**Solution:**
```bash
# Check which service is refusing connection
# Common: Database, Redis

# For database:
./homelab-manager.sh → Option 7: Check Database Status

# For Redis:
docker ps | grep redis
docker restart homelab-redis

# For other services:
docker ps  # Check all running
./homelab-manager.sh → Option 4: Start All Services
```

---

## 🔄 Recovery Procedures

### Complete System Restart

**When to use:** After system crash, power outage, or major issues

```bash
# Stop all services
./homelab-manager.sh
# Option 5: Stop All Services

# Wait for clean shutdown (30 seconds)
sleep 30

# Start all services
./homelab-manager.sh
# Option 4: Start All Services

# Verify health
./homelab-manager.sh
# Option 12: Health Check & Diagnostics
```

### Rollback Deployment

**When to use:** After problematic update/deployment

```bash
# Check Git history
git log --oneline -10

# Identify last working commit
git show <commit-hash>

# Rollback code
git reset --hard <commit-hash>

# Rebuild and deploy
./homelab-manager.sh
# Option 3: Rebuild & Deploy
```

### Database Backup/Restore

**Backup:**
```bash
# For Neon database:
# Use Neon console → Backups → Create backup

# For local PostgreSQL:
docker exec homelab-postgres pg_dumpall -U postgres > backup-$(date +%Y%m%d).sql
```

**Restore:**
```bash
# For Neon:
# Use Neon console → Backups → Restore

# For local PostgreSQL:
cat backup-20251119.sql | docker exec -i homelab-postgres psql -U postgres
```

### Emergency Shutdown

**When to use:** Critical security issue, resource exhaustion

```bash
# Emergency stop all services
./homelab-manager.sh
# Option 3a: Emergency Shutdown

# Or manually:
docker compose -f docker-compose.unified.yml down

# Investigate issue before restarting
```

### Full Troubleshoot Mode

**When to use:** Multiple issues, unclear root cause

```bash
./homelab-manager.sh
# Option 13: Troubleshoot & Maintenance

# Follow prompts for:
# - Format Caddyfile
# - Clear Docker cache
# - Rebuild services
# - Check network
# - View all logs
```

---

## 🆘 Getting Help

### Self-Service Options

**1. Check Service Logs**
```bash
./homelab-manager.sh
# Option 11: View Logs

# Select service and view logs
# Look for ERROR or WARN messages
```

**2. Run Diagnostics**
```bash
./homelab-manager.sh
# Option 12b: Run Full Diagnostics

# Automated checks for:
# - Service status
# - Database connectivity
# - Network configuration
# - Resource usage
# - Common issues
```

**3. Review Documentation**
- [DEPLOYMENT_GUIDE.md](DEPLOYMENT_GUIDE.md) - Setup issues
- [USER_MANUAL.md](USER_MANUAL.md) - Feature usage
- [API_DOCUMENTATION.md](API_DOCUMENTATION.md) - Integration issues
- This guide - Troubleshooting

### Community Support

**GitHub Issues:**
```
1. Search existing issues:
   https://github.com/your-repo/issues
   
2. If not found, create new issue:
   - Title: Brief description
   - Include:
     * OS version
     * Docker version
     * Error logs (last 50 lines)
     * Steps to reproduce
     * Expected vs actual behavior
```

**Discord Community:**
```
1. Join Discord server
2. Post in #support channel
3. Include:
   - Brief description
   - Relevant logs
   - What you've tried
```

### Professional Support

**Email Support:**
```
support@yourdomain.com

Include:
- Description of issue
- Service affected
- Error messages
- Logs (attached)
- Urgency level
```

### Reporting Bugs

**Bug Report Template:**
```
**Description:**
Brief description of the bug

**Steps to Reproduce:**
1. Go to...
2. Click on...
3. See error

**Expected Behavior:**
What should happen

**Actual Behavior:**
What actually happens

**Environment:**
- OS: Ubuntu 25.10
- Docker version: 24.x.x
- Service version: [from git commit hash]

**Logs:**
```
[Paste relevant logs here]
```

**Screenshots:**
[If applicable]
```

---

## 💡 Prevention Tips

### Regular Maintenance

**Weekly:**
- Review service logs for warnings
- Check disk space: `df -h`
- Monitor resource usage
- Verify backups completed

**Monthly:**
- Update system packages: `sudo apt update && sudo apt upgrade`
- Clear old Docker images: `docker image prune`
- Review security logs
- Test backup restoration

**Quarterly:**
- Update Docker images: Rebuild services
- Review and rotate API keys
- Performance audit
- Security audit

### Monitoring Setup

**Set up alerts for:**
- Disk space <10%
- Memory usage >90%
- Service downtime
- Database connection failures
- SSL certificate expiry (30 days)

### Best Practices

✅ Keep `.env` backed up (encrypted)  
✅ Document custom changes  
✅ Test changes in development first  
✅ Monitor logs regularly  
✅ Update services regularly  
✅ Maintain database backups  
✅ Use version control (Git)  
✅ Keep documentation updated  

❌ Don't expose services without authentication  
❌ Don't commit secrets to Git  
❌ Don't skip backups  
❌ Don't ignore warnings in logs  
❌ Don't run as root user  

---

**Last Updated:** November 2025  
**Version:** 2.0  
**Platform:** Nebula Command AI Homelab

**Need more help?** Check other documentation:
- [DEPLOYMENT_GUIDE.md](DEPLOYMENT_GUIDE.md)
- [USER_MANUAL.md](USER_MANUAL.md)
- [API_DOCUMENTATION.md](API_DOCUMENTATION.md)
