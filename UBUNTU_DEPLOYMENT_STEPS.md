# Ubuntu Server Deployment Steps

## Quick Start (Your Server)

On your Ubuntu 25.10 server at `host.evindrake.net`:

```bash
cd /home/evin/contain/HomeLabHub

# 1. Pull latest fixes
git pull origin main

# 2. Run diagnostics
./diagnose-startup.sh

# 3. If diagnostics pass, bootstrap
./bootstrap-homelab.sh
```

## Common Issue: Database URL Configuration

### Symptom
Bootstrap fails with:
```
Testing Dashboard... ✗ (HTTP 000000)
⚠️ DEPLOYMENT FAILED - INITIATING ROLLBACK
```

### Most Likely Cause
Your `.env` file has:
```bash
JARVIS_DB_PASSWORD=your_actual_password
JARVIS_DATABASE_URL=postgresql://jarvis:JARVIS_DB_PASSWORD@homelab-postgres:5432/homelab_jarvis
```

The connection string still says "JARVIS_DB_PASSWORD" (placeholder text) instead of your actual password!

### The Fix (Automatic)
**Good news:** The dashboard now auto-fixes this!

Just make sure `JARVIS_DB_PASSWORD` is set in your `.env`:
```bash
JARVIS_DB_PASSWORD=your_actual_password
```

The dashboard will:
1. ✅ Detect the placeholder in JARVIS_DATABASE_URL
2. ✅ Auto-build the correct URL using your actual password
3. ✅ Connect successfully

### Verification
Run the diagnostic:
```bash
./diagnose-startup.sh
```

Look for:
```
Checking Database URL Configuration:
✗ JARVIS_DATABASE_URL contains placeholder text!
  Good news: JARVIS_DB_PASSWORD is set
  The dashboard will auto-fix this on startup!
```

## What Should Happen

### Successful Bootstrap Output:
```
[8/8] Validating Service Functionality
  Testing Dashboard... ✓ (HTTP 200)
  Testing PostgreSQL... ✓
  Testing Redis... ✓

════════════════════════════════════════════════════════════════
  ✅ DEPLOYMENT SUCCESSFUL
════════════════════════════════════════════════════════════════

Dashboard: http://host.evindrake.net:8080
```

### Services Running:
```bash
docker ps --format "table {{.Names}}\t{{.Status}}"
```

You should see 14 containers running:
- homelab-dashboard
- homelab-postgres
- homelab-redis
- homelab-minio
- homelab-celery-worker
- discord-bot
- stream-bot
- caddy
- n8n
- vnc-desktop
- code-server
- homeassistant
- rig-city-site
- scarletredjoker-web

## Checking Dashboard Logs

If the dashboard is running but not accessible:

```bash
# View last 50 lines
docker logs --tail 50 homelab-dashboard

# Follow logs in real-time
docker logs -f homelab-dashboard
```

Look for these success indicators:
```
✓ Auto-fixed database URL using JARVIS_DB_PASSWORD
✓ Database migrations completed successfully
✓ Database health check passed
✓ Redis connection successful
```

## Environment Variables Checklist

Required for dashboard to start:
- [x] WEB_USERNAME (e.g., "admin")
- [x] WEB_PASSWORD (e.g., "Brs=2729")
- [x] SESSION_SECRET (64-char hex)
- [x] DASHBOARD_API_KEY (64-char hex)
- [x] JARVIS_DB_PASSWORD (any secure password)

Optional but recommended:
- [ ] OPENAI_API_KEY (for AI features)
- [ ] HOME_ASSISTANT_TOKEN (for smart home)
- [ ] PLEX_TOKEN (for media management)

## Troubleshooting Commands

```bash
# Check if PostgreSQL is ready
docker exec homelab-postgres pg_isready -U postgres

# Check if Redis is responsive
docker exec homelab-redis redis-cli ping

# Test dashboard health endpoint
curl -s http://localhost:8080/health | jq

# View all container statuses
docker compose ps

# Restart specific service
docker restart homelab-dashboard

# View database logs
docker logs homelab-postgres

# Check disk space
df -h

# Check memory
free -h
```

## Full Reset (Nuclear Option)

If everything is broken:

```bash
# Stop and remove everything
docker compose down -v

# Remove old images
docker image prune -a -f

# Fresh bootstrap
./bootstrap-homelab.sh
```

⚠️ **WARNING:** This will delete all data. Only use if you have backups!

## Access URLs (After Successful Deployment)

Once bootstrap succeeds, your services are available at:

- **Dashboard**: https://host.evindrake.net:8080
- **Discord Bot**: https://bot.rig-city.com
- **Stream Bot**: https://stream.rig-city.com
- **n8n Automation**: https://n8n.evindrake.net
- **Plex**: https://plex.evindrake.net
- **VNC Desktop**: https://vnc.evindrake.net
- **Home Assistant**: https://home.evindrake.net
- **Portfolio**: https://scarletredjoker.com

## Getting Help

If issues persist:

1. Run: `./diagnose-startup.sh > diagnostics.txt`
2. Run: `docker logs homelab-dashboard >> diagnostics.txt 2>&1`
3. Share `diagnostics.txt` for analysis

## Latest Fixes Applied

- ✅ Database URL auto-building from password components
- ✅ Placeholder detection and auto-fix
- ✅ Enhanced diagnostic script
- ✅ Navigation expansion (5 new features)
- ✅ Authentication standardization (9 route files)
