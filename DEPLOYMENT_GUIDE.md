# Database Architecture Deployment Guide

## Overview
This guide covers the deployment of the new industry-standard PostgreSQL architecture for HomeLabHub, including:
- PostgreSQL container refactoring (homelab-postgres with standard `postgres` superuser)
- Database provisioner service for automatic database management
- Secure database management API
- Zero-downtime migration from legacy architecture

---

## Pre-Deployment Checklist

### 1. Backup Current Data
**CRITICAL**: Always backup before any infrastructure changes:

```bash
# Create backup directory
mkdir -p ~/homelab_backups/$(date +%Y%m%d_%H%M%S)
cd ~/homelab_backups/$(date +%Y%m%d_%H%M%S)

# Backup all databases
docker exec discord-bot-db pg_dumpall -U ticketbot > all_databases_backup.sql

# Verify backup
ls -lh all_databases_backup.sql
```

### 2. Verify Environment Variables
Ensure these are set in your `.env` file:

```bash
# PostgreSQL Configuration
POSTGRES_PASSWORD=<your_strong_password>
POSTGRES_HOST=homelab-postgres

# Dashboard API Key for database management
DASHBOARD_API_KEY=<your_api_key>

# Service Database Passwords
DISCORD_DB_PASSWORD=<discord_bot_password>
STREAMBOT_DB_PASSWORD=<streambot_password>
JARVIS_DB_PASSWORD=<jarvis_password>
```

### 3. Review Current State
```bash
# Check running containers
docker compose ps

# Check current databases
docker exec discord-bot-db psql -U ticketbot -c "\l"
```

---

## Deployment Process

### Option 1: Automated Deployment (Recommended)

The `deploy_database_architecture.sh` script is production-safe with:
- ✅ True idempotency (checks actual system state)
- ✅ Zero-downtime migration (services auto-reconnect)
- ✅ Automated backups before destructive operations
- ✅ Comprehensive verification
- ✅ Rollback capability

**Run the deployment:**

```bash
cd /path/to/homelab
./deploy_database_architecture.sh
```

The script will:
1. Create timestamped backups in `/tmp/db_backups/`
2. Drop incompatible agent tables (if they exist)
3. Migrate container from `discord-bot-db` to `homelab-postgres`
4. Update dashboard with database management features
5. Verify all services are healthy
6. Test database provisioner API

**If anything fails**, the script provides specific rollback commands.

---

### Option 2: Manual Step-by-Step Deployment

If you prefer manual control:

#### Step 1: Fix Migration Issue

Drop incompatible agent tables:

```bash
# Connect to database
docker exec -it discord-bot-db psql -U ticketbot -d homelab_jarvis

# Drop tables
DROP TABLE IF EXISTS agent_messages CASCADE;
DROP TABLE IF EXISTS chat_history CASCADE;
DROP TABLE IF EXISTS agent_conversations CASCADE;
DROP TABLE IF EXISTS agent_tasks CASCADE;
DROP TABLE IF EXISTS agents CASCADE;

# Verify
\dt

# Exit
\q
```

#### Step 2: Update Docker Compose

Your `docker-compose.unified.yml` already has the new architecture configured:
- Container name: `homelab-postgres` (was `discord-bot-db`)
- Superuser: `postgres` (was `ticketbot`)
- Network alias: `discord-bot-db` for backward compatibility

Pull latest changes and rebuild:

```bash
git pull origin main
docker compose build --no-cache homelab-dashboard
```

#### Step 3: Migrate PostgreSQL Container

**IMPORTANT**: This uses network aliases for zero-downtime:

```bash
# Start new homelab-postgres container
docker compose up -d homelab-postgres

# Wait for it to be healthy
docker compose ps homelab-postgres

# Verify services can connect via alias
docker compose logs homelab-dashboard | grep -i "database\|postgres"

# Once verified, stop old container
docker compose stop discord-bot-db
docker rm discord-bot-db
```

#### Step 4: Start All Services

```bash
docker compose up -d

# Check all services are healthy
docker compose ps
```

---

## Post-Deployment Verification

### 1. Check Container Status

```bash
# Verify homelab-postgres is running
docker ps | grep homelab-postgres

# Check container health
docker compose ps homelab-postgres
```

### 2. Verify Databases

```bash
# List all databases
docker exec homelab-postgres psql -U postgres -c "\l"

# Check migration completed
docker exec homelab-postgres psql -U jarvis -d homelab_jarvis -c "
  SELECT table_name, column_name, data_type 
  FROM information_schema.columns 
  WHERE table_name = 'agents' AND column_name = 'id';
"
# Should show: agents | id | uuid (not integer)
```

### 3. Test Database Provisioner API

```bash
# List databases
curl -H "X-API-Key: $DASHBOARD_API_KEY" \
  http://localhost:5000/api/databases/

# Create test database
curl -X POST \
  -H "X-API-Key: $DASHBOARD_API_KEY" \
  -H "Content-Type: application/json" \
  -d '{"database_name": "test_db"}' \
  http://localhost:5000/api/databases/

# Verify it was created
docker exec homelab-postgres psql -U postgres -c "\l" | grep test_db

# Clean up test database
curl -X DELETE \
  -H "X-API-Key: $DASHBOARD_API_KEY" \
  "http://localhost:5000/api/databases/test_db"
```

### 4. Check Service Logs

```bash
# Dashboard logs
docker compose logs -f homelab-dashboard

# Look for:
# - "Database provisioner initialized"
# - "✓ Database blueprint registered"
# - Migration success messages
```

### 5. Access Dashboard UI

Navigate to: `https://host.evindrake.net/databases`

You should see the database management interface with:
- List of all databases
- Create database button
- Database templates (PostgreSQL, MySQL, etc.)
- Management actions (backup, delete, info)

---

## New Features Available

### 1. Database Management API

**Endpoints:**

```
GET    /api/databases                      - List all databases
POST   /api/databases                      - Create new database
GET    /api/databases/<name>               - Get database info
DELETE /api/databases/<name>               - Delete database
POST   /api/databases/provision-for-service - Auto-provision for service
```

**Authentication**: Requires either:
- Web session (logged into dashboard)
- API key via `X-API-Key` header

### 2. Automatic Database Provisioning

When deploying new marketplace apps, Jarvis can automatically create databases:

```python
# Example: Deploy new service with database
from services.database_provisioner import get_provisioner

provisioner = get_provisioner()
result = provisioner.create_database(
    db_name='myapp_db',
    db_user='myapp',
    # Password auto-generated
)

print(result['connection_url'])
# postgresql://myapp:secure_password@homelab-postgres:5432/myapp_db
```

### 3. Jarvis Database Management

Jarvis can now:
- Create databases for new services automatically
- Monitor database health
- Perform automated backups
- Restore from backups
- Clean up unused databases

---

## Rollback Procedure

### If Deployment Fails During Migration

The deployment script creates automatic backups in `/tmp/db_backups/`. To rollback:

```bash
# Find latest backup
ls -lht /tmp/db_backups/ | head -5

# Restore from backup (example)
BACKUP_FILE=/tmp/db_backups/homelab_jarvis_pre_table_drop_1732123456.sql

docker exec -i homelab-postgres psql -U postgres -d homelab_jarvis < $BACKUP_FILE

# Or restore all databases
FULL_BACKUP=/tmp/db_backups/full_backup_pre_container_migration_1732123456.sql
docker exec -i homelab-postgres psql -U postgres < $FULL_BACKUP
```

### If Container Migration Fails

```bash
# Stop new container
docker compose stop homelab-postgres

# Start old container
docker start discord-bot-db

# Verify services reconnect
docker compose ps

# Investigate logs
docker compose logs homelab-dashboard
```

---

## Troubleshooting

### Issue: "permission denied for database" errors

**Solution**: The new superuser is `postgres`, not `ticketbot`. Update any hardcoded references:

```bash
# Wrong:
psql -U ticketbot ...

# Correct:
psql -U postgres ...
```

### Issue: Services can't connect to database

**Check network alias**:

```bash
# Verify alias exists
docker inspect homelab-postgres | grep -A 5 "Aliases"

# Should show: "discord-bot-db"
```

If missing, restart the container:

```bash
docker compose down homelab-postgres
docker compose up -d homelab-postgres
```

### Issue: Migration shows "agents table already exists"

**This is normal** if you're re-running migrations. The table was recreated with correct UUID types.

To verify:

```bash
docker exec homelab-postgres psql -U jarvis -d homelab_jarvis -c "
  SELECT column_name, data_type 
  FROM information_schema.columns 
  WHERE table_name = 'agents' AND column_name = 'id';
"
```

Should show `uuid`, not `integer`.

### Issue: Database API returns 401 Unauthorized

**Check authentication**:

1. Web UI: Make sure you're logged into the dashboard
2. API calls: Include `X-API-Key` header:

```bash
curl -H "X-API-Key: your_api_key_here" \
  http://localhost:5000/api/databases/
```

Verify `DASHBOARD_API_KEY` is set in `.env`.

---

## Architecture Summary

### Before (Legacy)
- Container: `discord-bot-db`
- Superuser: `ticketbot` (non-standard)
- Manual database creation only
- Service-specific postgres user

### After (Industry-Standard)
- Container: `homelab-postgres`
- Superuser: `postgres` (standard)
- Automated database provisioning via API
- Backward compatibility via network alias `discord-bot-db`
- Database management UI in dashboard
- Jarvis AI autonomous database management

---

## Next Steps After Deployment

1. **Test Marketplace Deployments**
   - Try deploying a new app from marketplace
   - Verify Jarvis automatically creates required database
   - Check database appears in dashboard UI

2. **Configure Backups**
   - Set up automated daily backups
   - Store backups to MinIO or external storage
   - Test restore procedure

3. **Monitor Performance**
   - Check PostgreSQL logs: `docker compose logs -f homelab-postgres`
   - Monitor database sizes in dashboard
   - Set up alerts for connection limits

4. **Documentation**
   - Update any service-specific docs that reference old container name
   - Document database credentials in secure password manager
   - Share API endpoints with team members

---

## Support

If you encounter issues:

1. Check logs: `docker compose logs homelab-dashboard homelab-postgres`
2. Review backups: `ls -lh /tmp/db_backups/`
3. Verify environment variables: `docker compose config | grep POSTGRES`
4. Test connections: `docker exec homelab-postgres pg_isready -U postgres`

For rollback assistance, refer to the automated backup files created during deployment.

---

## Summary

This deployment provides:
- ✅ Industry-standard PostgreSQL architecture
- ✅ Secure database management API
- ✅ Automatic database provisioning for new services
- ✅ Zero-downtime migration capability
- ✅ Comprehensive backup and rollback support
- ✅ Dashboard UI for database management
- ✅ Jarvis AI autonomous database operations

Access your database management dashboard at: `https://host.evindrake.net/databases`
