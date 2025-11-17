# NebulaCommand Ubuntu Deployment Guide

**Complete guide for deploying NebulaCommand to Ubuntu 25.10**

---

## 🚨 CRITICAL FIXES APPLIED

This deployment includes fixes for crash-loop issues discovered during Ubuntu testing:

### **Fixed Issues:**
1. ✅ **Missing Python dependency**: Added `structlog` to dashboard requirements.txt
2. ✅ **Missing Node dependencies**: Added `winston` to discord-bot and stream-bot package.json
3. ✅ **PowerDNS port conflict**: Disabled PowerDNS (port 53 conflict with systemd-resolved)
4. ✅ **Environment validation**: Added `DISCORD_APP_ID` to required variables

---

## 📋 Prerequisites

Before deploying, ensure you have:

- Ubuntu 25.10 (or compatible Linux distribution)
- Docker and Docker Compose installed
- Port forwarding configured for ports 80 and 443
- Dynamic DNS configured (ZoneEdit or similar)
- Required API keys and secrets

---

## 🚀 Quick Start Deployment

### **Step 1: Navigate to Project Directory**

```bash
cd /home/evin/contain/HomeLabHub
```

### **Step 2: Pull Latest Changes**

```bash
git pull origin main
```

### **Step 3: Validate Environment Variables**

```bash
./scripts/setup-ubuntu-env.sh
```

**This script will:**
- Check all 29 required environment variables
- Provide auto-generation commands for missing passwords/secrets
- Show you exactly which API keys you need to add manually
- Exit with error if critical variables are missing

**Follow the script's instructions to fix any missing variables!**

### **Step 4: Rebuild All Docker Images**

**IMPORTANT:** You MUST rebuild images to include the new dependencies!

```bash
./scripts/rebuild-and-deploy.sh
```

**Options:**
- `--no-cache` - Force complete rebuild without cache
- `--services dashboard discord-bot` - Rebuild specific services only

### **Step 5: Verify Deployment**

```bash
# Check service status
docker compose -f docker-compose.unified.yml ps

# Check for errors
./scripts/diagnose-ubuntu-crashloop.sh

# View service logs
docker compose -f docker-compose.unified.yml logs -f homelab-dashboard
docker compose -f docker-compose.unified.yml logs -f discord-bot
docker compose -f docker-compose.unified.yml logs -f stream-bot
```

---

## 🔑 Required Environment Variables

### **Dashboard Variables (5)**
```bash
WEB_USERNAME=admin                    # Dashboard login username
WEB_PASSWORD=<secure-password>        # Dashboard login password
DASHBOARD_API_KEY=<api-key>           # API authentication
SESSION_SECRET=<session-secret>       # Session encryption
OPENAI_API_KEY=<openai-key>          # AI features (GPT-4)
```

### **Discord Bot Variables (6)** ⚠️ **UPDATED**
```bash
DISCORD_BOT_TOKEN=<bot-token>         # From Discord Developer Portal → Bot → Token
DISCORD_CLIENT_ID=<client-id>         # From Discord Developer Portal → General Info
DISCORD_CLIENT_SECRET=<client-secret> # From Discord Developer Portal → OAuth2
DISCORD_APP_ID=<app-id>              # ⚠️ NEW REQUIREMENT - Application ID
DISCORD_DB_PASSWORD=<auto-gen>        # Auto-generated
DISCORD_SESSION_SECRET=<auto-gen>     # Auto-generated
```

### **Stream Bot Variables (7)**
```bash
STREAMBOT_DB_PASSWORD=<auto-gen>      # Auto-generated
STREAMBOT_SESSION_SECRET=<auto-gen>   # Auto-generated

# Platform API Keys (optional but recommended)
TWITCH_CLIENT_ID=<twitch-id>
TWITCH_CLIENT_SECRET=<twitch-secret>
YOUTUBE_CLIENT_ID=<youtube-id>
YOUTUBE_CLIENT_SECRET=<youtube-secret>
# ... (add others as needed)
```

### **Database Variables (1)**
```bash
JARVIS_DB_PASSWORD=<auto-gen>         # Auto-generated
```

### **ZoneEdit DNS (3)** *(if using DNS management)*
```bash
ZONEEDIT_USERNAME=<your-username>
ZONEEDIT_PASSWORD=<your-password>
ZONEEDIT_TOKEN=<api-token>           # Optional
```

---

## 🛠️ Troubleshooting

### **Services Crash-Looping**

**Symptom:** Containers keep restarting

**Solution:**
```bash
# 1. Run diagnostics
./scripts/diagnose-ubuntu-crashloop.sh

# 2. Check for missing environment variables
./scripts/setup-ubuntu-env.sh

# 3. View logs for specific service
docker compose -f docker-compose.unified.yml logs discord-bot | tail -n 100
```

### **Dashboard Shows "Module Not Found: structlog"**

**Solution:**
```bash
# Rebuild dashboard with updated requirements
./scripts/rebuild-and-deploy.sh --services homelab-dashboard
```

### **Discord/Stream Bot Shows "Cannot find package 'winston'"**

**Solution:**
```bash
# Rebuild bots with updated dependencies
./scripts/rebuild-and-deploy.sh --services discord-bot stream-bot
```

### **PowerDNS Port Conflict (Port 53)**

**Status:** ✅ **FIXED** - PowerDNS is now disabled by default

If you need PowerDNS, you must either:
1. Stop systemd-resolved: `sudo systemctl stop systemd-resolved`
2. OR configure PowerDNS on a different port in `docker-compose.unified.yml`

### **"Address Already in Use" Errors**

**Solution:**
```bash
# Stop all services first
./deploy.sh stop

# Then restart
./scripts/rebuild-and-deploy.sh
```

---

## 📊 Accessing Your Services

After successful deployment, your services will be available at:

| Service | URL | Purpose |
|---------|-----|---------|
| **NebulaCommand Dashboard** | https://host.evindrake.net | Main control panel |
| **Discord Bot Dashboard** | https://bot.rig-city.com | Discord ticket bot management |
| **Stream Bot Dashboard** | https://stream.rig-city.com | Multi-platform stream bot |
| **Static Website** | https://scarletredjoker.com | Public-facing website |
| **n8n Automation** | https://n8n.evindrake.net | Workflow automation |
| **Home Assistant** | https://home.evindrake.net | Smart home control |
| **Plex Media Server** | https://plex.evindrake.net | Media streaming |
| **VNC Desktop** | https://vnc.evindrake.net | Remote desktop |

---

## 🎯 Post-Deployment Checklist

- [ ] All services show "healthy" status
- [ ] No crash-loops detected
- [ ] Dashboard accessible at https://host.evindrake.net
- [ ] Discord bot connected and responsive
- [ ] Stream bot connected to platforms
- [ ] SSL certificates generated (via Caddy)
- [ ] DNS records propagated
- [ ] Backup system configured

---

## 📝 Maintenance Commands

```bash
# View all service status
docker compose -f docker-compose.unified.yml ps

# Restart specific service
docker compose -f docker-compose.unified.yml restart discord-bot

# View logs (follow mode)
docker compose -f docker-compose.unified.yml logs -f stream-bot

# Stop all services
./deploy.sh stop

# Start all services
./deploy.sh start

# Complete rebuild (after code changes)
./scripts/rebuild-and-deploy.sh --no-cache

# Environment validation (run periodically)
./scripts/setup-ubuntu-env.sh
```

---

## 🔒 Security Notes

1. **Never commit `.env` file to git**
2. **Use strong passwords for all services**
3. **Keep API keys secret**
4. **Regularly update Docker images**
5. **Monitor logs for suspicious activity**
6. **Enable firewall (ufw) with only ports 80/443 open**

---

## 🆘 Getting Help

If you encounter issues:

1. **Check logs:** `docker compose logs [service-name]`
2. **Run diagnostics:** `./scripts/diagnose-ubuntu-crashloop.sh`
3. **Validate environment:** `./scripts/setup-ubuntu-env.sh`
4. **Review this guide**
5. **Check GitHub issues**

---

## 📚 Additional Resources

- **Docker Compose Docs:** https://docs.docker.com/compose/
- **Caddy Reverse Proxy:** https://caddyserver.com/docs/
- **Discord.js Guide:** https://discordjs.guide/
- **OpenAI API Docs:** https://platform.openai.com/docs/

---

**Happy deploying! 🚀**
