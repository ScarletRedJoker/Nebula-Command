# Quick Start Guide - 5-Minute Setup

Get the HomeLab Dashboard running in **5 minutes** or less!

---

## Prerequisites

Before you begin, ensure you have:

- ✅ **Ubuntu 20.04+** (or any Linux with Docker support)
- ✅ **Docker 20.10+** installed
- ✅ **Docker Compose 2.0+** installed
- ✅ **Git** installed
- ✅ **Root or sudo access**
- ✅ **At least 2GB RAM** (4GB recommended)
- ✅ **10GB free disk space** (20GB recommended)

**Optional for full features:**
- Domain name (for SSL certificates)
- OpenAI API key (for Jarvis AI assistant)

---

## Quick Install (Single Command)

```bash
# Clone and run the automated installer
git clone https://github.com/your-org/HomeLabHub.git
cd HomeLabHub
./deploy.sh deploy
```

That's it! The script will:
1. ✅ Check all prerequisites
2. ✅ Generate environment variables
3. ✅ Pull Docker images
4. ✅ Start all services
5. ✅ Run health checks
6. ✅ Show you the access URLs

**Expected output:**
```
✅ Prerequisites check passed
✅ Environment configured
✅ Database initialized
✅ All services started
✅ Health checks passed

🎉 HomeLab Dashboard is ready!

Access your dashboard at:
  🌐 Local: http://localhost:5000
  🌐 Network: http://your-server-ip:5000

Default credentials:
  👤 Username: evin
  🔑 Password: homelab

⚠️  IMPORTANT: Change the default password immediately!
```

---

## Manual Setup (Step-by-Step)

If the automated installer doesn't work, follow these steps:

### Step 1: Clone Repository (30 seconds)

```bash
# Clone the repository
git clone https://github.com/your-org/HomeLabHub.git
cd HomeLabHub
```

### Step 2: Configure Environment (1 minute)

```bash
# Generate environment file
./deployment/generate-unified-env.sh

# Edit configuration (optional)
nano .env
```

**Key environment variables to configure:**

```env
# Required - Change these!
WEB_USERNAME=evin
WEB_PASSWORD=your-secure-password-here

# Optional - For Jarvis AI
OPENAI_API_KEY=sk-your-key-here

# Optional - For domain management
ZONEEDIT_USER=your-email@example.com
ZONEEDIT_TOKEN=your-zoneedit-token

# Optional - For smart home
HOME_ASSISTANT_URL=http://homeassistant.local:8123
HOME_ASSISTANT_TOKEN=your-long-lived-token
```

**Pro tip:** Run `./deployment/generate-unified-env.sh` to auto-generate secure passwords!

### Step 3: Start Services (2 minutes)

```bash
# Start all services with Docker Compose
docker-compose -f docker-compose.unified.yml up -d

# Check status
docker-compose -f docker-compose.unified.yml ps
```

**Expected services:**
- ✅ `dashboard` - Main dashboard (port 5000)
- ✅ `stream-bot` - Stream bot SaaS (port 3000)
- ✅ `discord-bot-db` - PostgreSQL database
- ✅ `caddy` - Reverse proxy with SSL (ports 80, 443)
- ✅ `redis` - Task queue
- ✅ `minio` - Object storage (port 9000)

### Step 4: Verify Installation (1 minute)

```bash
# Check logs for errors
./deploy.sh logs

# Run health checks
./deploy.sh health
```

**Expected output:**
```
✅ Dashboard: Running on port 5000
✅ Stream Bot: Running on port 3000
✅ PostgreSQL: Healthy
✅ Redis: Connected
✅ MinIO: Running
✅ Caddy: SSL ready
```

### Step 5: Access Dashboard (30 seconds)

Open your browser and navigate to:
- **Local**: http://localhost:5000
- **Network**: http://your-server-ip:5000

**Default login:**
- Username: `evin`
- Password: `homelab` (or what you set in `.env`)

**🎉 You're done! Dashboard is running!**

---

## Optional Configurations

### Enable Jarvis AI Assistant

1. Get an OpenAI API key from https://platform.openai.com/api-keys
2. Add to `.env`:
   ```env
   OPENAI_API_KEY=sk-your-api-key-here
   ```
3. Restart services:
   ```bash
   docker-compose -f docker-compose.unified.yml restart dashboard
   ```
4. Access Jarvis at: http://localhost:5000/ai-assistant

---

### Configure Domain with SSL

1. Point your domain to your server IP:
   ```bash
   # A record
   host.example.com → 192.168.1.100
   ```

2. Update `Caddyfile`:
   ```caddyfile
   host.example.com {
       reverse_proxy dashboard:5000
   }
   ```

3. Restart Caddy:
   ```bash
   docker-compose -f docker-compose.unified.yml restart caddy
   ```

4. SSL certificate will be obtained automatically from Let's Encrypt!

---

### Add Additional Services

Enable optional services by uncommenting in `docker-compose.unified.yml`:

```yaml
# Plex Media Server
plex:
  image: lscr.io/linuxserver/plex:latest
  # ... configuration

# Home Assistant
home-assistant:
  image: homeassistant/home-assistant:latest
  # ... configuration

# n8n Automation
n8n:
  image: n8nio/n8n:latest
  # ... configuration

# VNC Desktop
vnc-desktop:
  image: dorowu/ubuntu-desktop-lxde-vnc
  # ... configuration
```

Then restart:
```bash
docker-compose -f docker-compose.unified.yml up -d
```

---

## Common Issues & Solutions

### Issue: Port 5000 already in use

**Solution:**
```bash
# Check what's using port 5000
sudo lsof -i :5000

# Kill the process or change dashboard port in .env
DASHBOARD_PORT=5001
```

---

### Issue: Database connection failed

**Solution:**
```bash
# Ensure database is running
docker-compose -f docker-compose.unified.yml ps discord-bot-db

# Recreate database
docker-compose -f docker-compose.unified.yml down
docker volume rm homelabhub_postgres_data
docker-compose -f docker-compose.unified.yml up -d
```

---

### Issue: SSL certificate not obtained

**Solution:**
```bash
# Check Caddy logs
docker-compose -f docker-compose.unified.yml logs caddy

# Verify domain DNS is correct
dig your-domain.com

# Ensure ports 80 and 443 are open
sudo ufw allow 80/tcp
sudo ufw allow 443/tcp
```

---

### Issue: Jarvis not responding

**Solution:**
```bash
# Check OpenAI API key is set
grep OPENAI_API_KEY .env

# Verify API key is valid
curl https://api.openai.com/v1/models \
  -H "Authorization: Bearer $OPENAI_API_KEY"

# Check dashboard logs
docker-compose -f docker-compose.unified.yml logs dashboard | grep -i openai
```

---

## Next Steps

### 1. Secure Your Installation

```bash
# Change default password
nano .env
# Set WEB_PASSWORD=your-strong-password

# Restart dashboard
docker-compose -f docker-compose.unified.yml restart dashboard
```

### 2. Configure Backups

```bash
# Set up automated backups
./deployment/backup-databases.sh

# Add to crontab for daily backups
crontab -e
# Add: 0 2 * * * /path/to/HomeLabHub/deployment/backup-databases.sh
```

### 3. Add Your First Domain

1. Navigate to **Domain Management** in dashboard
2. Click **"Add Domain"**
3. Enter domain name and target service
4. Click **"Provision"** - DNS and SSL configured automatically!

### 4. Configure Jarvis AI

1. Get OpenAI API key
2. Add to `.env`: `OPENAI_API_KEY=sk-...`
3. Restart dashboard
4. Try voice commands: "Jarvis, check system health"

### 5. Explore Features

- **System Monitoring**: Real-time CPU, memory, disk stats
- **Docker Management**: Manage all containers
- **Jarvis AI**: Voice-controlled infrastructure
- **Domain Management**: Zero-touch SSL provisioning
- **File Upload**: Artifact storage and management
- **Smart Home**: Home Assistant integration (if enabled)
- **Google Services**: Gmail, Calendar, Drive integration (if configured)

---

## Upgrading

### Update to Latest Version

```bash
# Pull latest code
git pull origin main

# Update Docker images
docker-compose -f docker-compose.unified.yml pull

# Restart services
docker-compose -f docker-compose.unified.yml down
docker-compose -f docker-compose.unified.yml up -d

# Run migrations
docker-compose -f docker-compose.unified.yml exec dashboard \
  python -c "from services.db_service import run_migrations; run_migrations()"
```

---

## Performance Tuning

### For Production Deployment

1. **Use production WSGI server**:
   ```env
   FLASK_ENV=production
   ```

2. **Increase worker threads**:
   ```yaml
   # In docker-compose.unified.yml
   environment:
     - WORKERS=4
     - THREADS=2
   ```

3. **Enable Redis caching**:
   ```env
   REDIS_URL=redis://redis:6379/0
   CACHE_TYPE=redis
   ```

4. **Configure resource limits**:
   ```yaml
   # In docker-compose.unified.yml
   services:
     dashboard:
       deploy:
         resources:
           limits:
             cpus: '2.0'
             memory: 1G
   ```

---

## Monitoring & Maintenance

### View Logs

```bash
# All services
./deploy.sh logs

# Specific service
./deploy.sh logs --service dashboard

# Follow logs in real-time
./deploy.sh logs -f
```

### Check Health

```bash
# Run health checks
./deploy.sh health

# Check specific service
docker-compose -f docker-compose.unified.yml exec dashboard \
  curl -f http://localhost:5000/api/health || echo "Dashboard unhealthy"
```

### Resource Usage

```bash
# Container stats
docker stats

# Disk usage
docker system df

# Clean up unused resources
docker system prune -a
```

---

## Getting Help

### Documentation

- **Full Deployment Guide**: [docs/DEPLOYMENT.md](DEPLOYMENT.md)
- **API Reference**: [docs/API.md](API.md)
- **Environment Variables**: [docs/ENVIRONMENT_VARIABLES.md](ENVIRONMENT_VARIABLES.md)
- **Troubleshooting**: [docs/TROUBLESHOOTING.md](TROUBLESHOOTING.md)

### Support

- **GitHub Issues**: https://github.com/your-org/HomeLabHub/issues
- **Discussions**: https://github.com/your-org/HomeLabHub/discussions
- **Email**: support@homelabhub.com (if available)

---

## Success Checklist

After completing this guide, you should have:

- ✅ All services running without errors
- ✅ Dashboard accessible at http://localhost:5000
- ✅ Can log in with credentials
- ✅ System stats displaying correctly
- ✅ No console errors in browser
- ✅ All health checks passing

**Congratulations! Your HomeLab Dashboard is ready! 🎉**

---

## What's Next?

### For Developers
- Explore the API: http://localhost:5000/api/docs
- Set up development environment on Replit
- Contribute to the project

### For Investors
- Try the live demo
- Review the feature comparison: [docs/FEATURE_MATRIX.md](FEATURE_MATRIX.md)
- Watch the demo video (if available)
- Schedule technical deep-dive

### For Users
- Add your first domain
- Configure Jarvis AI with OpenAI key
- Set up automated backups
- Enable smart home integration
- Explore all features

---

**Total Setup Time: ~5 minutes**  
**Difficulty: Easy** (one command)  
**Support: Community + Documentation**

Welcome to the future of homelab management! 🚀
