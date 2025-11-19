# Deployment Readiness Checklist

This checklist ensures all services are properly configured and ready for production deployment.

## ✅ Pre-Deployment Checklist

### 1. Database Configuration

#### PostgreSQL Database Setup
- [ ] PostgreSQL 16 is installed and running
- [ ] Three databases are created: `ticketbot`, `streambot`, `homelab_jarvis`
- [ ] Database users are created with proper permissions:
  - `ticketbot` user for Discord bot database
  - `streambot` user for Stream bot database
  - `jarvis` user for Dashboard/Jarvis database
- [ ] Database connection strings are tested and working

**Required Environment Variables:**
```bash
# Discord Bot Database
DATABASE_URL=postgresql://ticketbot:<DISCORD_DB_PASSWORD>@discord-bot-db:5432/ticketbot

# Stream Bot Database
DATABASE_URL=postgresql://streambot:<STREAMBOT_DB_PASSWORD>@discord-bot-db:5432/streambot

# Dashboard/Jarvis Database
JARVIS_DATABASE_URL=postgresql://jarvis:<JARVIS_DB_PASSWORD>@discord-bot-db:5432/homelab_jarvis
```

**Verification:**
```bash
# Test Discord bot database
psql "postgresql://ticketbot:<password>@discord-bot-db:5432/ticketbot" -c "SELECT version();"

# Test Stream bot database
psql "postgresql://streambot:<password>@discord-bot-db:5432/streambot" -c "SELECT version();"

# Test Jarvis database
psql "postgresql://jarvis:<password>@discord-bot-db:5432/homelab_jarvis" -c "SELECT version();"
```

---

### 2. Redis Configuration

- [ ] Redis 7 is installed and running
- [ ] Redis connection is tested
- [ ] Redis persistence (AOF) is enabled

**Required Environment Variables:**
```bash
REDIS_URL=redis://redis:6379/0
```

**Verification:**
```bash
redis-cli -h redis ping
# Should return: PONG
```

---

### 3. MinIO Object Storage

- [ ] MinIO is installed and running
- [ ] MinIO console is accessible (port 9001)
- [ ] MinIO API is accessible (port 9000)
- [ ] Root credentials are set

**Required Environment Variables:**
```bash
MINIO_ROOT_USER=admin
MINIO_ROOT_PASSWORD=<strong_password_here>
MINIO_ENDPOINT=minio:9000
```

**Verification:**
```bash
# Test MinIO health
curl -f http://minio:9000/minio/health/live
```

---

### 4. Discord Bot Configuration

#### Required Environment Variables

**Discord API Credentials:**
```bash
DISCORD_BOT_TOKEN=<your_bot_token>
DISCORD_CLIENT_ID=<your_client_id>
DISCORD_CLIENT_SECRET=<your_client_secret>
DISCORD_APP_ID=<your_app_id>
DISCORD_CALLBACK_URL=https://bot.rig-city.com/auth/discord/callback
```

**Twitch API (for Stream Notifications):**
```bash
TWITCH_CLIENT_ID=<your_twitch_client_id>
TWITCH_CLIENT_SECRET=<your_twitch_client_secret>
```

**Database & Session:**
```bash
DATABASE_URL=postgresql://ticketbot:<password>@discord-bot-db:5432/ticketbot
SESSION_SECRET=<generate_with_openssl_rand_hex_32>
```

#### Verification Checklist
- [ ] Bot token is valid and not revoked
- [ ] Bot has been invited to your Discord server with proper permissions
- [ ] Bot permissions include:
  - Manage Channels
  - Manage Threads
  - Send Messages
  - Create Public Threads
  - Manage Messages
  - Read Message History
- [ ] Discord OAuth callback URL is whitelisted in Discord Developer Portal
- [ ] Bot can connect to Discord API (check logs for "Discord bot ready")

---

### 5. Stream Bot Configuration

#### Required Environment Variables

**Database:**
```bash
DATABASE_URL=postgresql://streambot:<password>@discord-bot-db:5432/streambot
SESSION_SECRET=<generate_with_openssl_rand_hex_32>
```

**OpenAI API:**
```bash
OPENAI_API_KEY=<your_openai_api_key>
OPENAI_BASE_URL=https://api.openai.com/v1
```

**Twitch OAuth:**
```bash
TWITCH_CLIENT_ID=<your_twitch_client_id>
TWITCH_CLIENT_SECRET=<your_twitch_client_secret>
TWITCH_SIGNIN_CALLBACK_URL=https://stream.rig-city.com/api/auth/twitch/callback
TWITCH_REDIRECT_URI=https://stream.rig-city.com/auth/twitch/callback
```

**YouTube OAuth:**
```bash
YOUTUBE_CLIENT_ID=<your_google_client_id>
YOUTUBE_CLIENT_SECRET=<your_google_client_secret>
YOUTUBE_SIGNIN_CALLBACK_URL=https://stream.rig-city.com/api/auth/youtube/callback
YOUTUBE_REDIRECT_URI=https://stream.rig-city.com/auth/youtube/callback
```

**Kick OAuth (Optional):**
```bash
KICK_CLIENT_ID=<your_kick_client_id>
KICK_CLIENT_SECRET=<your_kick_client_secret>
KICK_SIGNIN_CALLBACK_URL=https://stream.rig-city.com/api/auth/kick/callback
```

**Spotify (Optional):**
```bash
SPOTIFY_CLIENT_ID=<your_spotify_client_id>
SPOTIFY_CLIENT_SECRET=<your_spotify_client_secret>
```

#### Verification Checklist
- [ ] OpenAI API key is valid and has credits
- [ ] Twitch OAuth application is created and callback URL is whitelisted
- [ ] YouTube OAuth application is created and callback URL is whitelisted
- [ ] All OAuth callback URLs match the deployed domain
- [ ] Token encryption key is set (automatically generated from session secret)

---

### 6. Dashboard/Jarvis Configuration

#### Required Environment Variables

**Flask Settings:**
```bash
FLASK_ENV=production
PYTHONUNBUFFERED=1
DASHBOARD_API_KEY=<generate_with_python_secrets_token_urlsafe_32>
```

**Database:**
```bash
JARVIS_DATABASE_URL=postgresql://jarvis:<password>@discord-bot-db:5432/homelab_jarvis
```

**Redis:**
```bash
REDIS_URL=redis://redis:6379/0
```

**MinIO:**
```bash
MINIO_ENDPOINT=minio:9000
MINIO_ROOT_USER=admin
MINIO_ROOT_PASSWORD=<minio_password>
```

**Home Assistant (Optional):**
```bash
HOME_ASSISTANT_URL=http://homeassistant:8123
HOME_ASSISTANT_TOKEN=<long_lived_access_token>
HOME_ASSISTANT_VERIFY_SSL=False
```

**OpenAI (for Jarvis AI):**
```bash
OPENAI_API_KEY=<your_openai_api_key>
```

#### Verification Checklist
- [ ] Dashboard can connect to all services (Docker, Database, Redis, MinIO)
- [ ] Celery worker is running and processing tasks
- [ ] Jarvis autonomous features are enabled (if desired)
- [ ] Dashboard API key is set for secure external access
- [ ] Docker socket is mounted read-only for security

---

### 7. Security Configuration

#### Session Secrets
Generate secure session secrets for each service:

```bash
# Discord Bot Session Secret
openssl rand -hex 32

# Stream Bot Session Secret
openssl rand -hex 32

# Dashboard API Key
python -c 'import secrets; print(secrets.token_urlsafe(32))'
```

#### Database Passwords
Generate strong database passwords:

```bash
# Generate passwords
openssl rand -base64 32

# Set in .env file
DISCORD_DB_PASSWORD=<generated_password>
STREAMBOT_DB_PASSWORD=<generated_password>
JARVIS_DB_PASSWORD=<generated_password>
```

#### Security Checklist
- [ ] All session secrets are cryptographically random (≥32 bytes)
- [ ] All database passwords are strong (≥24 characters)
- [ ] MinIO root password is strong
- [ ] No secrets are committed to version control
- [ ] `.env` file is in `.gitignore`
- [ ] Production secrets are different from development
- [ ] Docker socket is mounted read-only where possible

---

### 8. Network & Domain Configuration

#### Domain Setup
- [ ] DNS records are configured for all domains:
  - `host.evindrake.net` → Dashboard
  - `bot.rig-city.com` → Discord Bot
  - `stream.rig-city.com` → Stream Bot
  - `plex.evindrake.net` → Plex Server
  - `n8n.evindrake.net` → n8n Automation
  - `code.evindrake.net` → Code-Server
  - `vnc.evindrake.net` → VNC Desktop
  - `scarletredjoker.com` → Static Website

#### SSL Certificates
- [ ] Caddy is running and issuing Let's Encrypt certificates
- [ ] All domains have valid SSL certificates
- [ ] Certificate auto-renewal is working

#### Port Forwarding
- [ ] Port 80 (HTTP) forwarded to server
- [ ] Port 443 (HTTPS) forwarded to server
- [ ] Plex ports forwarded (if using Plex)

---

### 9. Service Health Checks

#### Health Check Endpoints

**Dashboard:**
```bash
curl -f https://host.evindrake.net/health
# Should return: {"status": "healthy"}
```

**Discord Bot:**
```bash
curl -f https://bot.rig-city.com/health
# Should return: {"status": "ok"}
```

**Stream Bot:**
```bash
curl -f https://stream.rig-city.com/health
# Should return: {"status": "healthy"}
```

#### Service Status Checklist
- [ ] All Docker containers are running (`docker ps`)
- [ ] All services pass health checks
- [ ] No critical errors in logs (`docker logs <container>`)
- [ ] Database migrations have completed successfully
- [ ] Redis is connected and accepting commands
- [ ] MinIO is accessible and healthy

---

### 10. Monitoring & Logging

#### Log Collection
- [ ] All services are writing logs to mounted volumes
- [ ] Log rotation is configured (to prevent disk space issues)
- [ ] Critical errors are being surfaced/alerted

#### Monitoring Setup
- [ ] Service uptime monitoring is configured
- [ ] Database connection pool monitoring
- [ ] Disk space monitoring
- [ ] Memory usage monitoring
- [ ] CPU usage monitoring

---

## 🚀 Production Deployment Steps

### Step 1: Environment Setup
1. Copy `.env.example` to `.env`
2. Fill in all required environment variables
3. Verify all secrets are set correctly

### Step 2: Database Provisioning
1. Start PostgreSQL container:
   ```bash
   docker-compose up -d discord-bot-db
   ```
2. Verify databases are created:
   ```bash
   docker exec -it discord-bot-db psql -U ticketbot -c "\l"
   ```
3. Run database migrations for each service

### Step 3: Infrastructure Services
1. Start Redis:
   ```bash
   docker-compose up -d redis
   ```
2. Start MinIO:
   ```bash
   docker-compose up -d minio
   ```
3. Verify both services are healthy

### Step 4: Application Services
1. Start Dashboard + Celery Worker:
   ```bash
   docker-compose up -d homelab-dashboard homelab-celery-worker
   ```
2. Start Discord Bot:
   ```bash
   docker-compose up -d discord-bot
   ```
3. Start Stream Bot:
   ```bash
   docker-compose up -d stream-bot
   ```
4. Monitor logs for startup errors:
   ```bash
   docker-compose logs -f
   ```

### Step 5: Reverse Proxy
1. Start Caddy:
   ```bash
   docker-compose up -d caddy
   ```
2. Monitor Caddy logs for SSL certificate issuance:
   ```bash
   docker logs -f caddy
   ```
3. Verify all domains are accessible via HTTPS

### Step 6: Verification
1. Run health checks on all services
2. Test key functionality:
   - Discord bot responds to commands
   - Stream bot OAuth flows work
   - Dashboard loads and can connect to Docker
3. Check for any errors in logs

---

## 🔧 Troubleshooting Common Issues

### Issue: Database Connection Failures

**Symptoms:** Services fail to start with "connection refused" errors

**Solutions:**
1. Verify PostgreSQL container is running:
   ```bash
   docker ps | grep discord-bot-db
   ```
2. Check database health:
   ```bash
   docker exec discord-bot-db pg_isready
   ```
3. Verify connection string format:
   ```bash
   postgresql://username:password@host:5432/database
   ```
4. Check database logs:
   ```bash
   docker logs discord-bot-db
   ```

### Issue: OAuth Callbacks Failing

**Symptoms:** OAuth redirects to error pages or "invalid redirect URI"

**Solutions:**
1. Verify callback URLs match exactly in:
   - `.env` file
   - OAuth provider dashboard (Discord, Twitch, Google)
2. Ensure HTTPS is used (not HTTP) in production
3. Check for trailing slashes in URLs (should not have them)

### Issue: Redis Connection Refused

**Symptoms:** Dashboard or services can't connect to Redis

**Solutions:**
1. Verify Redis is running:
   ```bash
   docker ps | grep redis
   ```
2. Test Redis connection:
   ```bash
   docker exec redis redis-cli ping
   ```
3. Check Redis network:
   ```bash
   docker network inspect homelab
   ```

### Issue: MinIO Access Denied

**Symptoms:** Dashboard can't upload files to MinIO

**Solutions:**
1. Verify MinIO credentials in `.env`
2. Test MinIO health:
   ```bash
   curl http://minio:9000/minio/health/live
   ```
3. Check MinIO console at http://localhost:9001
4. Verify bucket creation and permissions

---

## 📊 Performance Optimization

### Database Connection Pooling

**Discord Bot (Drizzle ORM):**
```typescript
// Recommended pool size: 10-20
max: 10,
idleTimeoutMillis: 30000,
```

**Stream Bot (Drizzle ORM):**
```typescript
// Recommended pool size: 20-40 (higher due to multi-tenant)
max: 20,
idleTimeoutMillis: 30000,
```

**Dashboard (SQLAlchemy):**
```python
# Recommended pool size: 10-20
SQLALCHEMY_POOL_SIZE = 10
SQLALCHEMY_MAX_OVERFLOW = 20
SQLALCHEMY_POOL_TIMEOUT = 30
SQLALCHEMY_POOL_RECYCLE = 3600
```

### Redis Connection Management

```python
# Dashboard Redis configuration
REDIS_POOL_SIZE = 10
REDIS_SOCKET_TIMEOUT = 5
REDIS_SOCKET_CONNECT_TIMEOUT = 5
```

### Celery Worker Concurrency

```bash
# Adjust based on CPU cores
# Recommended: num_cores * 2
celery -A celery_app.celery_app worker --concurrency=4
```

---

## 🔒 Security Best Practices

### 1. Secrets Management
- ✅ Use environment variables for all secrets
- ✅ Never commit secrets to git
- ✅ Rotate secrets periodically (every 90 days)
- ✅ Use different secrets for development/production

### 2. Network Security
- ✅ Firewall configured to only allow ports 80, 443
- ✅ Internal services not exposed to internet
- ✅ Docker networks isolated (no bridge mode for sensitive services)

### 3. Access Control
- ✅ Minimal Docker socket permissions (read-only where possible)
- ✅ Database users have minimal required permissions
- ✅ OAuth scopes are minimal (principle of least privilege)

### 4. Monitoring
- ✅ Failed login attempts are logged
- ✅ Unusual OAuth activity is flagged
- ✅ Database connection failures are alerted

---

## ✅ Deployment Sign-Off

**Before marking this deployment as complete, verify:**

- [ ] All services are running and healthy
- [ ] All health checks pass
- [ ] All environment variables are set correctly
- [ ] All secrets are secure and documented
- [ ] Database migrations completed successfully
- [ ] SSL certificates issued for all domains
- [ ] Monitoring and logging configured
- [ ] Backup strategy in place
- [ ] Incident response plan documented
- [ ] Team trained on deployment procedures

**Deployment Completed By:** _________________

**Date:** _________________

**Notes:**
