# 🚀 Ubuntu 20.10 Startup & Troubleshooting Guide

**Last Updated:** November 20, 2025  
**Target Environment:** Ubuntu 20.10 Server

---

## 📋 Table of Contents

1. [Quick Start](#quick-start)
2. [Prerequisites](#prerequisites)
3. [Common Issues & Solutions](#common-issues--solutions)
4. [Using the Management Interface](#using-the-management-interface)
5. [Deployment Scripts](#deployment-scripts)
6. [Service-Specific Guides](#service-specific-guides)
7. [Advanced Troubleshooting](#advanced-troubleshooting)

---

## Quick Start

### First Time Setup

```bash
# 1. Navigate to project directory
cd ~/contain/HomeLabHub

# 2. Ensure all scripts are executable
chmod +x homelab-manager.sh deploy_database_architecture.sh
chmod +x deployment/*.sh

# 3. IMPORTANT: After installing Docker and adding your user to docker group,
#    you MUST log out and log back in, OR run this command:
newgrp docker

# 4. Verify docker group membership is active
docker ps
# If you get "permission denied", you need to log out/in or run: newgrp docker

# 5. Launch the unified management interface
./homelab-manager.sh
```

**⚠️ Important Note:** After adding your user to the docker group (done in Prerequisites), you must either:
- **Option 1 (Recommended):** Log out and log back in to Ubuntu
- **Option 2 (Quick):** Run `newgrp docker` in your current terminal

Without this step, you'll get "permission denied" errors when running docker commands.

### Quick Commands

```bash
# Start all services
./homelab-manager.sh
# Then select: 4) Start All Services

# Check service status
docker ps

# View logs for a specific service
docker logs <service-name> --tail 50

# Restart a specific service
docker compose restart <service-name>
```

---

## Prerequisites

### Required Software

Ensure these are installed on your Ubuntu 20.10 system:

```bash
# Update package lists
sudo apt update

# Install git
sudo apt install -y git

# Install Docker (official repository method for Ubuntu 20.10)
# Remove old versions if any
sudo apt remove -y docker docker-engine docker.io containerd runc || true

# Install prerequisites
sudo apt install -y ca-certificates curl gnupg lsb-release

# Add Docker's official GPG key
sudo mkdir -p /etc/apt/keyrings
curl -fsSL https://download.docker.com/linux/ubuntu/gpg | sudo gpg --dearmor -o /etc/apt/keyrings/docker.gpg

# Set up Docker repository (using focal for Ubuntu 20.10)
echo \
  "deb [arch=$(dpkg --print-architecture) signed-by=/etc/apt/keyrings/docker.gpg] https://download.docker.com/linux/ubuntu \
  focal stable" | sudo tee /etc/apt/sources.list.d/docker.list > /dev/null

# Update apt and install Docker with Compose plugin
sudo apt update
sudo apt install -y docker-ce docker-ce-cli containerd.io docker-buildx-plugin docker-compose-plugin

# Add user to docker group (avoid sudo for docker commands)
sudo usermod -aG docker $USER
newgrp docker

# Verify installations
docker --version
docker compose version  # Note: This is the plugin, not docker-compose
git --version
```

**Important:** This installs the Docker Compose **plugin** (`docker compose` with a space), not the legacy `docker-compose` binary. All scripts in this project use the plugin syntax.

### Required Files

The following files must exist in your project directory:

- ✅ `docker-compose.yml` (symlink to docker-compose.unified.yml)
- ✅ `docker-compose.unified.yml` (main compose configuration)
- ✅ `homelab-manager.sh` (management interface)
- ✅ `.env` (environment variables)

**Verify the symlink:**
```bash
cd ~/contain/HomeLabHub
ls -la docker-compose.yml

# Expected output:
# lrwxrwxrwx 1 user user 26 Nov 20 05:58 docker-compose.yml -> docker-compose.unified.yml
```

If the symlink is missing or broken, it will cause "no configuration file provided" errors. See [Issue 1](#issue-1-no-configuration-file-provided-not-found) for the fix.

---

## Common Issues & Solutions

### Issue 1: "no configuration file provided: not found"

**Symptom:**
```
no configuration file provided: not found
```

**Cause:** Docker Compose can't find `docker-compose.yml`

**Solution:**
```bash
cd ~/contain/HomeLabHub

# Check if symlink exists
ls -la docker-compose.yml

# If missing, create symlink
ln -sf docker-compose.unified.yml docker-compose.yml

# Verify
ls -la docker-compose.yml
# Should show: docker-compose.yml -> docker-compose.unified.yml
```

---

### Issue 2: "Failed to create full backup"

**Symptom:**
```
✗ Failed to create full backup
Error on line 379 (exit code: 1)
```

**Cause:** Backup script using wrong PostgreSQL user for legacy container

**Solution:**
The deployment script has been updated to automatically detect and use the correct superuser:
- Legacy container (`discord-bot-db`): uses `ticketbot`
- New container (`homelab-postgres`): uses `postgres`

Simply re-run the deployment script:
```bash
./deploy_database_architecture.sh
```

---

### Issue 3: "404 Not Found" for API Endpoints

**Symptom:**
```bash
curl http://localhost:5000/api/databases/
# Returns: 404 Not Found
```

**Cause:** Dashboard not running or database routes not loaded

**Solution:**
```bash
# Rebuild and restart dashboard
docker compose build --no-cache homelab-dashboard
docker compose up -d homelab-dashboard

# Wait 30 seconds for startup
sleep 30

# Test again
curl http://localhost:5000/api/databases/
# Should return: {"error":"Unauthorized",...} (this is expected without auth)
```

---

### Issue 4: Permission Denied Errors

**Symptom:**
```
docker: permission denied while trying to connect to the Docker daemon socket
```

**Solution:**
```bash
# Add user to docker group
sudo usermod -aG docker $USER

# Activate the changes (or logout/login)
newgrp docker

# Verify
docker ps
```

---

### Issue 5: Port Already in Use

**Symptom:**
```
Error starting userland proxy: listen tcp 0.0.0.0:5000: bind: address already in use
```

**Solution:**
```bash
# Find what's using the port
sudo netstat -tulpn | grep :5000

# Stop the conflicting service
docker compose stop <conflicting-service>

# Or kill the process
sudo kill -9 <PID>

# Restart your service
docker compose up -d
```

---

### Issue 6: Container Keeps Restarting

**Symptom:**
```bash
docker ps
# Shows: Restarting (1) X seconds ago
```

**Solution:**
```bash
# Check container logs
docker logs <container-name> --tail 100

# Common fixes:
# 1. Environment variables missing
cat .env | grep <VARIABLE_NAME>

# 2. Database not ready
docker compose up -d homelab-postgres
sleep 10
docker compose restart <service-name>

# 3. Rebuild container
docker compose build --no-cache <service-name>
docker compose up -d <service-name>
```

---

## Using the Management Interface

The `homelab-manager.sh` script provides a unified interface for all operations:

### Main Menu Options

```
🚀 Deployment:
  1) Full Deploy          - Build and start all services from scratch
  2) Quick Restart        - Restart services without rebuilding
  3) Rebuild & Deploy     - Force rebuild and restart
  3a) Graceful Shutdown   - Stop all services safely

🎮 Service Control:
  4) Start All Services   - Start all stopped services
  5) Stop All Services    - Stop all running services
  6) Restart Service      - Restart a specific service

📊 Database:
  7) Check Database Status - View database health and connections

🔌 Integrations:
  20) Check Integration Status
  21) View Integration Setup Guide

🔧 Database Maintenance:
  22) Fix Stuck Migrations
  22a) Fix Database Schema (VARCHAR → UUID)

✅ Verification:
  23) Run Full Deployment Verification - Comprehensive health check

🔍 Troubleshooting:
  11) View Service Logs      - Tail logs for any service
  12) Health Check           - Check all service health
  12a) Check Network Status  - Verify Docker networks
  12b) Lifecycle Diagnostics - Auto-fix common issues
  13) Full Troubleshoot Mode - Comprehensive diagnostics
```

### Recommended Workflow

**For First-Time Setup:**
```
./homelab-manager.sh
→ Select: 1) Full Deploy
→ Wait for completion (~5-10 minutes)
→ Select: 23) Run Full Deployment Verification
```

**For Daily Operations:**
```
./homelab-manager.sh
→ Select: 2) Quick Restart  (restart without rebuild)
```

**When Things Break:**
```
./homelab-manager.sh
→ Select: 12b) Run Lifecycle Diagnostics & Auto-Fix
→ If still broken: 13) Full Troubleshoot Mode
```

---

## Deployment Scripts

### Main Deployment Scripts

#### 1. `homelab-manager.sh` - Unified Management Interface
**Purpose:** Interactive menu for all operations  
**When to use:** Day-to-day operations, troubleshooting  
**Usage:**
```bash
./homelab-manager.sh
```

#### 2. `deploy_database_architecture.sh` - Database Migration
**Purpose:** Migrate from legacy to modern PostgreSQL architecture  
**When to use:** First-time setup or database architecture updates  
**Features:**
- ✅ Idempotent (safe to re-run)
- ✅ Automatic backups before changes
- ✅ Zero-downtime migration
- ✅ Comprehensive verification
**Usage:**
```bash
./deploy_database_architecture.sh
```

#### 3. `deployment/linear-deploy.sh` - Full Deployment
**Purpose:** Complete system deployment from scratch  
**When to use:** Fresh installations  
**Usage:**
```bash
./deployment/linear-deploy.sh
```

---

### Deployment Script Comparison

| Script | Purpose | Time | Downtime | Use When |
|--------|---------|------|----------|----------|
| `homelab-manager.sh` | Interactive management | N/A | Varies | Daily operations |
| `deploy_database_architecture.sh` | Database migration | 5-10 min | None | Database updates |
| `deployment/linear-deploy.sh` | Full deployment | 10-15 min | Yes | Fresh install |
| `deployment/sync-from-replit.sh` | Code sync | 2-3 min | None | After Replit changes |

---

## Service-Specific Guides

### Database Issues
**Guide:** `DEPLOYMENT_GUIDE.md`  
**Common Commands:**
```bash
# Check database status
docker exec homelab-postgres psql -U postgres -c "\l"

# View database logs
docker logs homelab-postgres --tail 100

# Fix migrations
./homelab-manager.sh
# Select: 22) Fix Stuck Database Migrations
```

### VNC Desktop & Code-Server
**Guide:** `deployment/RUN_THIS_ON_UBUNTU.md`  
**Quick Fix:**
```bash
./deployment/fix-vnc-and-code-server.sh
```

### Stream Bot
**Common Issues:** Database table not found  
**Fix:**
```bash
./deployment/fix-streambot-database.sh
```

### Discord Bot
**Logs Location:** `docker logs discord-bot`  
**Restart:**
```bash
docker compose restart discord-bot
```

---

## Advanced Troubleshooting

### Complete System Reset

**⚠️ WARNING: This will stop all services and rebuild from scratch**

```bash
# 1. Stop all services
docker compose down

# 2. Remove all containers (keeps data)
docker compose rm -f

# 3. Rebuild all images
docker compose build --no-cache

# 4. Start services
docker compose up -d

# 5. Verify
docker ps
```

### Nuclear Option (DANGEROUS - Deletes Data)

**⚠️ WARNING: This will DELETE ALL DATA including databases**

```bash
# Backup first!
./deploy_database_architecture.sh  # Creates backups in /tmp/db_backups/

# Then nuclear reset:
docker compose down -v  # -v removes volumes (DATA LOSS!)
docker system prune -a --volumes
docker compose up -d
```

### Backup Everything

```bash
# Create backup directory
mkdir -p ~/homelab_backups/$(date +%Y%m%d_%H%M%S)
cd ~/homelab_backups/$(date +%Y%m%d_%H%M%S)

# Backup databases
docker exec homelab-postgres pg_dumpall -U postgres > all_databases.sql

# Backup docker-compose configuration
cp ~/contain/HomeLabHub/docker-compose.unified.yml .
cp ~/contain/HomeLabHub/.env .
cp ~/contain/HomeLabHub/Caddyfile .

# Backup service data volumes
docker run --rm -v homelab_postgres_data:/data -v $(pwd):/backup \
  alpine tar czf /backup/postgres_data.tar.gz /data

# List backups
ls -lh
```

---

## Environment Variables

### Required Variables

Check your `.env` file contains:

```bash
# PostgreSQL
POSTGRES_PASSWORD=<strong_password>
POSTGRES_HOST=homelab-postgres

# Dashboard
DASHBOARD_API_KEY=<api_key>
FLASK_SECRET_KEY=<secret_key>

# Discord Bot
DISCORD_BOT_TOKEN=<bot_token>
DISCORD_DB_PASSWORD=<password>

# Stream Bot
STREAMBOT_DB_PASSWORD=<password>
TWITCH_CLIENT_ID=<client_id>
TWITCH_CLIENT_SECRET=<secret>

# Jarvis
JARVIS_DB_PASSWORD=<password>
OPENAI_API_KEY=<api_key>
```

### Verify Environment

```bash
# Check all variables are set
cat .env | grep -v "^#" | grep "="

# Test specific variable
echo $POSTGRES_PASSWORD  # (won't work - need to source .env)

# Load and test
set -a; source .env; set +a
echo $POSTGRES_PASSWORD
```

---

## Quick Reference Commands

### Docker Compose

```bash
# Start all services
docker compose up -d

# Stop all services
docker compose down

# Restart specific service
docker compose restart <service-name>

# View logs
docker compose logs -f <service-name>

# Rebuild service
docker compose build --no-cache <service-name>

# Show running services
docker compose ps
```

### Docker

```bash
# List running containers
docker ps

# List all containers (including stopped)
docker ps -a

# View container logs
docker logs <container-name> --tail 100

# Execute command in container
docker exec -it <container-name> bash

# Remove stopped containers
docker container prune

# Remove unused images
docker image prune -a
```

### PostgreSQL

```bash
# Connect to database
docker exec -it homelab-postgres psql -U postgres

# List databases
docker exec homelab-postgres psql -U postgres -c "\l"

# List tables in database
docker exec homelab-postgres psql -U postgres -d <database> -c "\dt"

# Backup database
docker exec homelab-postgres pg_dump -U postgres <database> > backup.sql

# Restore database
cat backup.sql | docker exec -i homelab-postgres psql -U postgres -d <database>
```

---

## Getting Help

### Check Logs First

```bash
# All service logs
docker compose logs --tail=100

# Specific service
docker logs <service-name> --tail=100

# Follow logs in real-time
docker logs -f <service-name>
```

### Health Checks

```bash
# Via management interface
./homelab-manager.sh
# Select: 12) Health Check (all services)

# Manual check
docker compose ps
docker inspect <container-name> | grep -A 10 Health
```

### Diagnostics

```bash
# Automated diagnostics and fixes
./homelab-manager.sh
# Select: 12b) Run Lifecycle Diagnostics & Auto-Fix

# Manual diagnostics script
./homelab-lifecycle-diagnostics.sh
```

---

## Support Resources

### Documentation Files

- `DEPLOYMENT_GUIDE.md` - Database architecture deployment
- `UBUNTU_DEPLOYMENT_CHECKLIST.md` - Complete deployment checklist
- `deployment/RUN_THIS_ON_UBUNTU.md` - VNC & Code-Server fixes
- `deployment/TROUBLESHOOTING_VNC_CODE_SERVER.md` - Detailed VNC troubleshooting

### Log Files

- `/tmp/db_backups/` - Automatic database backups
- `deployment/deployment.log` - Deployment history
- `deployment/pipeline-execution.log` - Pipeline execution logs

### Quick Fixes

- `./deployment/fix-vnc-and-code-server.sh` - Fix VNC and Code-Server
- `./deployment/fix-streambot-database.sh` - Fix Stream Bot database
- `./deployment/fix-stuck-migrations.sh` - Fix stuck database migrations

---

## Summary

**Quick Start:**
1. Ensure `docker-compose.yml` symlink exists
2. Run `./homelab-manager.sh`
3. Select option 1 (Full Deploy) for first-time setup
4. Select option 23 (Full Verification) to confirm everything works

**Daily Operations:**
- Use `./homelab-manager.sh` for all management tasks
- Check logs with `docker logs <service-name>`
- Restart services with `docker compose restart <service-name>`

**When Things Break:**
1. Check logs: `docker logs <service-name> --tail 100`
2. Run diagnostics: `./homelab-manager.sh` → option 12b
3. Check this guide for specific error messages
4. Use service-specific fix scripts in `deployment/` directory

**Remember:**
- Always backup before major changes
- The management interface is your friend
- Check logs for specific error messages
- Most issues can be fixed with a simple restart

---

**Last Updated:** November 20, 2025  
**Maintainer:** HomeLabHub Team  
**Version:** 2.0
