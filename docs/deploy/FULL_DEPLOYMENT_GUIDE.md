# HomeLabHub Complete Deployment Guide

A step-by-step walkthrough to deploy your homelab from zero to production.

---

## Table of Contents

1. [Prerequisites](#1-prerequisites)
2. [Account Setup](#2-account-setup)
3. [Cloudflare DNS Configuration](#3-cloudflare-dns-configuration)
4. [Tailscale VPN Setup](#4-tailscale-vpn-setup)
5. [Linode Cloud Server Deployment](#5-linode-cloud-server-deployment)
6. [Local Ubuntu Host Deployment](#6-local-ubuntu-host-deployment)
7. [OAuth App Configuration](#7-oauth-app-configuration)
8. [Database Initialization](#8-database-initialization)
9. [Post-Deployment Verification](#9-post-deployment-verification)
10. [Troubleshooting](#10-troubleshooting)

---

## 1. Prerequisites

### Required Accounts

| Account | Purpose | Sign Up |
|---------|---------|---------|
| Cloudflare | DNS & domain management | https://cloudflare.com |
| Linode/Akamai | Cloud server hosting | https://linode.com |
| Tailscale | VPN mesh between servers | https://tailscale.com |
| OpenAI | Jarvis AI assistant | https://platform.openai.com |
| Discord | Discord bot | https://discord.com/developers |
| Twitch | Stream bot integration | https://dev.twitch.tv |
| Google Cloud | YouTube, Calendar, Gmail | https://console.cloud.google.com |
| Spotify | Stream bot music | https://developer.spotify.com |
| GitHub | Code repository | https://github.com |

### Hardware Requirements

**Linode Cloud Server (Recommended: Linode 4GB)**
- 2 CPU cores
- 4GB RAM
- 80GB SSD
- Ubuntu 22.04 LTS

**Local Ubuntu Host (Your gaming/streaming PC)**
- Ubuntu 22.04+ or similar
- GPU (NVIDIA recommended for Sunshine)
- Sufficient storage for media
- Always-on or wake-on-LAN capable

### Domain Names

You'll need at least one domain. Example setup:
- `evindrake.net` - Main domain for infrastructure
- `rig-city.com` - Secondary domain for public-facing bots

---

## 2. Account Setup

### 2.1 Linode Server Creation

1. Log into Linode Dashboard
2. Click **Create Linode**
3. Select:
   - **Image**: Ubuntu 22.04 LTS
   - **Region**: Closest to you (e.g., Newark, Atlanta)
   - **Plan**: Shared CPU - Linode 4GB ($24/month)
   - **Label**: `homelab-cloud`
   - **Root Password**: Save this securely!
4. Click **Create Linode**
5. Note the **public IP address** (e.g., `172.234.x.x`)

### 2.2 Cloudflare Domain Setup

1. Log into Cloudflare
2. Click **Add a Site**
3. Enter your domain (e.g., `evindrake.net`)
4. Select **Free** plan
5. Cloudflare will scan existing DNS records
6. Update nameservers at your registrar to Cloudflare's:
   ```
   ns1.cloudflare.com
   ns2.cloudflare.com
   ```
7. Wait for nameserver propagation (up to 24 hours)

### 2.3 Tailscale Setup

1. Go to https://login.tailscale.com
2. Sign up with Google, GitHub, or email
3. Create or join a tailnet
4. Go to **Settings > Keys** and create an auth key:
   - **Reusable**: Yes
   - **Ephemeral**: No
   - **Tags**: (optional)
5. Save this auth key - you'll use it on both servers

---

## 3. Cloudflare DNS Configuration

### 3.1 Add DNS Records

Go to **DNS > Records** and add these A records pointing to your **Linode public IP**:

| Type | Name | Content | Proxy | TTL |
|------|------|---------|-------|-----|
| A | `@` | `YOUR_LINODE_IP` | DNS only (gray) | Auto |
| A | `dash` | `YOUR_LINODE_IP` | DNS only (gray) | Auto |
| A | `bot` | `YOUR_LINODE_IP` | DNS only (gray) | Auto |
| A | `stream` | `YOUR_LINODE_IP` | DNS only (gray) | Auto |
| A | `n8n` | `YOUR_LINODE_IP` | DNS only (gray) | Auto |
| A | `code` | `YOUR_LINODE_IP` | DNS only (gray) | Auto |
| A | `plex` | `YOUR_LINODE_IP` | DNS only (gray) | Auto |
| A | `home` | `YOUR_LINODE_IP` | DNS only (gray) | Auto |

**Important**: Keep proxy **OFF** (gray cloud) - Caddy handles SSL directly.

### 3.2 For Multiple Domains

If using `rig-city.com` for bots:

| Type | Name | Content | Proxy | TTL |
|------|------|---------|-------|-----|
| A | `bot` | `YOUR_LINODE_IP` | DNS only | Auto |
| A | `stream` | `YOUR_LINODE_IP` | DNS only | Auto |

### 3.3 SSL/TLS Settings

1. Go to **SSL/TLS > Overview**
2. Set mode to **Full (strict)**
3. Go to **Edge Certificates**
4. Enable **Always Use HTTPS**

### 3.4 Verify DNS

```bash
# Test from any computer
nslookup dash.evindrake.net
nslookup bot.rig-city.com

# Should return your Linode IP
```

---

## 4. Tailscale VPN Setup

### 4.1 Install on Linode

SSH into your Linode:
```bash
ssh root@YOUR_LINODE_IP
```

Install Tailscale:
```bash
curl -fsSL https://tailscale.com/install.sh | sh
```

Connect to your tailnet:
```bash
sudo tailscale up --authkey=tskey-auth-YOUR_KEY_HERE --hostname=linode-homelab
```

Get the Tailscale IP:
```bash
tailscale ip -4
# Example output: 100.100.100.1
```

### 4.2 Install on Local Ubuntu Host

```bash
curl -fsSL https://tailscale.com/install.sh | sh
sudo tailscale up --authkey=tskey-auth-YOUR_KEY_HERE --hostname=local-homelab
```

Get the Tailscale IP:
```bash
tailscale ip -4
# Example output: 100.100.100.2
```

### 4.3 Verify Connection

From Linode, ping local host:
```bash
ping 100.100.100.2
```

From local, ping Linode:
```bash
ping 100.100.100.1
```

Both should succeed. Note these IPs - you'll need them!

---

## 5. Linode Cloud Server Deployment

### 5.1 Install Docker

```bash
# SSH into Linode
ssh root@YOUR_LINODE_IP

# Install Docker
curl -fsSL https://get.docker.com | sh

# Verify
docker --version
docker compose version
```

### 5.2 Clone Repository

```bash
mkdir -p /opt/homelab
cd /opt/homelab
git clone https://github.com/YOUR_USERNAME/HomeLabHub.git
cd HomeLabHub
```

### 5.3 Create Environment File

```bash
cp .env.example .env
chmod 600 .env
nano .env
```

### 5.4 Configure .env (Linode)

Fill in these **required** values:

```bash
# ═══════════════════════════════════════════════════════════════
# CORE - Generate with: openssl rand -hex 16
# ═══════════════════════════════════════════════════════════════
POSTGRES_PASSWORD=GENERATE_NEW_PASSWORD
DISCORD_DB_PASSWORD=GENERATE_NEW_PASSWORD
STREAMBOT_DB_PASSWORD=GENERATE_NEW_PASSWORD
JARVIS_DB_PASSWORD=GENERATE_NEW_PASSWORD

# Dashboard login
WEB_USERNAME=admin
WEB_PASSWORD=YOUR_DASHBOARD_PASSWORD

# Session secrets (generate with: openssl rand -hex 32)
SESSION_SECRET=GENERATE_64_CHAR_HEX
SECRET_KEY=GENERATE_64_CHAR_HEX

# ═══════════════════════════════════════════════════════════════
# AI - Required for Jarvis
# ═══════════════════════════════════════════════════════════════
OPENAI_API_KEY=sk-proj-YOUR_OPENAI_KEY

# ═══════════════════════════════════════════════════════════════
# DISCORD BOT - From Discord Developer Portal
# ═══════════════════════════════════════════════════════════════
DISCORD_BOT_TOKEN=YOUR_BOT_TOKEN
DISCORD_CLIENT_ID=YOUR_CLIENT_ID
DISCORD_CLIENT_SECRET=YOUR_CLIENT_SECRET

# ═══════════════════════════════════════════════════════════════
# CROSS-HOST ROUTING - Your LOCAL machine's Tailscale IP
# ═══════════════════════════════════════════════════════════════
LOCAL_TAILSCALE_IP=100.100.100.2

# ═══════════════════════════════════════════════════════════════
# CODE SERVER
# ═══════════════════════════════════════════════════════════════
CODE_SERVER_PASSWORD=YOUR_CODE_SERVER_PASSWORD
```

### 5.5 Generate Missing Secrets

Quick way to generate passwords:
```bash
# Generate a 16-character password
openssl rand -hex 16

# Generate a 32-character session secret
openssl rand -hex 32
```

### 5.6 Run Bootstrap

```bash
chmod +x deploy/scripts/bootstrap.sh
./deploy/scripts/bootstrap.sh --role cloud --generate-secrets
```

Or start manually:
```bash
docker compose up -d
```

### 5.7 Verify Cloud Services

```bash
# Check all containers
docker compose ps

# Should see these healthy:
# - caddy
# - homelab-postgres
# - homelab-redis
# - homelab-dashboard
# - discord-bot
# - stream-bot
# - n8n
# - code-server

# Check logs
docker compose logs -f homelab-dashboard
```

---

## 6. Local Ubuntu Host Deployment

### 6.1 Install Docker

```bash
curl -fsSL https://get.docker.com | sh
sudo usermod -aG docker $USER
newgrp docker
```

### 6.2 Clone Repository

```bash
cd /home/evin/contain
git clone https://github.com/YOUR_USERNAME/HomeLabHub.git
cd HomeLabHub
```

### 6.3 Create Environment File

```bash
cp .env.example .env
chmod 600 .env
nano .env
```

### 6.4 Configure .env (Local)

Fill in these values:

```bash
# ═══════════════════════════════════════════════════════════════
# MINIO STORAGE
# ═══════════════════════════════════════════════════════════════
MINIO_ROOT_USER=admin
MINIO_ROOT_PASSWORD=YOUR_MINIO_PASSWORD

# ═══════════════════════════════════════════════════════════════
# PLEX MEDIA SERVER
# ═══════════════════════════════════════════════════════════════
# Get claim token from: https://plex.tv/claim (expires in 4 minutes!)
PLEX_CLAIM=claim-XXXXXX
PLEX_MEDIA_PATH=/path/to/your/media

# ═══════════════════════════════════════════════════════════════
# SUNSHINE GAMESTREAM
# ═══════════════════════════════════════════════════════════════
SUNSHINE_USER=admin
SUNSHINE_PASS=YOUR_SUNSHINE_PASSWORD

# ═══════════════════════════════════════════════════════════════
# LINODE CONNECTION
# ═══════════════════════════════════════════════════════════════
LINODE_TAILSCALE_IP=100.100.100.1
```

### 6.5 Prepare Media Directories

```bash
# Create directories if needed
sudo mkdir -p /data/plex/media
sudo chown -R $USER:$USER /data/plex

# If using NAS
sudo mkdir -p /mnt/nas
```

### 6.6 Run Bootstrap

```bash
./deploy/scripts/bootstrap.sh --role local
```

Or start manually:
```bash
docker compose -f compose.local.yml up -d
```

### 6.7 Verify Local Services

```bash
docker compose -f compose.local.yml ps

# Should see:
# - homelab-minio
# - plex-server
# - homeassistant
# - sunshine-gamestream
```

---

## 7. OAuth App Configuration

### 7.1 Discord Application

1. Go to https://discord.com/developers/applications
2. Click **New Application** → Name it "HomeLabHub Bot"
3. Go to **Bot** → Click **Add Bot**
4. Copy the **Token** → `DISCORD_BOT_TOKEN`
5. Go to **OAuth2 > General**:
   - Copy **Client ID** → `DISCORD_CLIENT_ID`
   - Copy **Client Secret** → `DISCORD_CLIENT_SECRET`
6. Add **Redirect URL**: `https://bot.rig-city.com/auth/discord/callback`
7. Go to **Bot** → Enable these intents:
   - Presence Intent
   - Server Members Intent
   - Message Content Intent

### 7.2 Twitch Application

1. Go to https://dev.twitch.tv/console/apps
2. Click **Register Your Application**
3. Fill in:
   - **Name**: HomeLabHub Stream Bot
   - **OAuth Redirect URL**: `https://stream.rig-city.com/api/auth/twitch/callback`
   - **Category**: Chat Bot
4. Copy **Client ID** → `TWITCH_CLIENT_ID`
5. Generate and copy **Client Secret** → `TWITCH_CLIENT_SECRET`

### 7.3 YouTube (Google Cloud)

1. Go to https://console.cloud.google.com
2. Create a new project: "HomeLabHub"
3. Go to **APIs & Services > Library**
4. Enable these APIs:
   - YouTube Data API v3
   - Google Calendar API
   - Gmail API
5. Go to **APIs & Services > Credentials**
6. Click **Create Credentials > OAuth client ID**
7. Configure consent screen first:
   - User Type: External
   - App name: HomeLabHub
   - Add scopes for YouTube, Calendar, Gmail
8. Create OAuth client:
   - **Type**: Web application
   - **Authorized redirect URIs**:
     - `https://stream.rig-city.com/api/auth/youtube/callback`
     - `https://dash.evindrake.net/api/google/callback`
9. Copy **Client ID** → `YOUTUBE_CLIENT_ID`
10. Copy **Client Secret** → `YOUTUBE_CLIENT_SECRET`

### 7.4 Spotify Application

1. Go to https://developer.spotify.com/dashboard
2. Click **Create App**
3. Fill in:
   - **App name**: HomeLabHub Stream Bot
   - **Redirect URI**: `https://stream.rig-city.com/api/auth/spotify/callback`
4. Copy **Client ID** → `SPOTIFY_CLIENT_ID`
5. Copy **Client Secret** → `SPOTIFY_CLIENT_SECRET`

### 7.5 Update .env with OAuth Credentials

After creating all apps, update your Linode `.env`:

```bash
nano /opt/homelab/HomeLabHub/.env

# Add all the OAuth credentials you just created
```

Then restart services:
```bash
cd /opt/homelab/HomeLabHub
docker compose down
docker compose up -d
```

---

## 8. Database Initialization

### 8.1 Automatic Initialization

The bootstrap script handles this automatically. Databases are created on first run via `config/postgres-init/` scripts.

### 8.2 Verify Databases

```bash
# Connect to PostgreSQL
docker exec -it homelab-postgres psql -U postgres

# List databases
\l

# You should see:
# - postgres (default)
# - ticketbot (Discord bot)
# - streambot (Stream bot)
# - homelab_jarvis (Jarvis AI)

# Exit
\q
```

### 8.3 Run Migrations (if needed)

```bash
# Dashboard migrations
docker exec homelab-dashboard flask db upgrade

# Or use the homelab script
./homelab db migrate
```

---

## 9. Post-Deployment Verification

### 9.1 Service Access Checklist

Test each service in your browser:

| Service | URL | Expected |
|---------|-----|----------|
| Dashboard | https://dash.evindrake.net | Login page |
| Discord Bot | https://bot.rig-city.com | Bot dashboard |
| Stream Bot | https://stream.rig-city.com | Stream dashboard |
| n8n | https://n8n.evindrake.net | n8n login |
| Code Server | https://code.evindrake.net | VS Code |
| Plex | https://plex.evindrake.net | Plex Web |
| Home Assistant | https://home.evindrake.net | HA dashboard |

### 9.2 Cross-Host Routing Test

```bash
# From Linode, test local service access
curl -I http://100.100.100.2:32400  # Plex
curl -I http://100.100.100.2:8123   # Home Assistant
curl -I http://100.100.100.2:47990  # Sunshine
```

### 9.3 Discord Bot Test

1. Invite bot to your server using:
   ```
   https://discord.com/api/oauth2/authorize?client_id=YOUR_CLIENT_ID&permissions=8&scope=bot%20applications.commands
   ```
2. In Discord, type `/ping` or `/ticket`

### 9.4 Health Check

```bash
# On Linode
cd /opt/homelab/HomeLabHub
./homelab health
./homelab status
```

### 9.5 View Logs

```bash
# All logs
./homelab logs

# Specific service
./homelab logs dashboard
./homelab logs discord-bot

# Follow logs in real-time
docker compose logs -f
```

---

## 10. Troubleshooting

### 10.1 Common Issues

#### "Connection refused" errors
```bash
# Check if containers are running
docker compose ps

# Restart all services
docker compose down && docker compose up -d
```

#### SSL Certificate Issues
```bash
# Check Caddy logs
docker logs caddy

# Force certificate renewal
docker compose restart caddy
```

#### Database Connection Errors
```bash
# Check PostgreSQL is healthy
docker logs homelab-postgres

# Verify database exists
docker exec homelab-postgres psql -U postgres -c "\l"

# Reset a specific database
docker exec homelab-postgres psql -U postgres -c "DROP DATABASE IF EXISTS ticketbot; CREATE DATABASE ticketbot OWNER ticketbot;"
```

#### Tailscale Not Connecting
```bash
# Check status
tailscale status

# Re-authenticate
sudo tailscale up --reset
```

#### Cross-Host Routing Not Working
```bash
# Verify LOCAL_TAILSCALE_IP in .env on Linode
grep LOCAL_TAILSCALE_IP /opt/homelab/HomeLabHub/.env

# Restart Caddy to pick up env changes
docker compose restart caddy

# Check Caddy can reach local host
docker exec caddy ping -c 3 100.100.100.2
```

#### Empty Logs
```bash
# Make sure services are actually running
docker compose ps

# Check for startup errors
docker compose logs --tail=100
```

### 10.2 Reset Everything

If you need to start fresh:

```bash
# Stop everything
docker compose down -v  # -v removes volumes!

# Remove all containers and images
docker system prune -a

# Re-run bootstrap
./deploy/scripts/bootstrap.sh --role cloud --generate-secrets
```

### 10.3 Useful Commands

```bash
# Check disk space
df -h

# Check memory
free -h

# Check Docker resource usage
docker stats

# Enter a container
docker exec -it homelab-dashboard bash

# View container logs
docker logs -f container-name

# Restart single service
docker compose restart service-name
```

---

## Quick Reference Card

### Linode Commands
```bash
cd /opt/homelab/HomeLabHub
./homelab status          # Check all services
./homelab health          # Health check
./homelab logs            # View logs
./homelab restart         # Restart all
./homelab restart caddy   # Restart one service
```

### Local Ubuntu Commands
```bash
cd /home/evin/contain/HomeLabHub
docker compose -f compose.local.yml ps
docker compose -f compose.local.yml logs -f
docker compose -f compose.local.yml restart
```

### Generate Secrets
```bash
openssl rand -hex 16   # Password
openssl rand -hex 32   # Session secret
```

### Tailscale
```bash
tailscale status       # Check connection
tailscale ip -4        # Get your IP
sudo tailscale up      # Reconnect
```

---

## Summary Checklist

- [ ] Linode server created
- [ ] Cloudflare account with domains added
- [ ] DNS A records pointing to Linode IP
- [ ] Tailscale installed on both servers
- [ ] Tailscale IPs noted and added to .env
- [ ] Linode .env configured with all secrets
- [ ] Cloud services deployed and healthy
- [ ] Local .env configured
- [ ] Local services deployed and healthy
- [ ] Discord app created with OAuth
- [ ] Twitch app created with OAuth
- [ ] Google Cloud project with YouTube/Calendar/Gmail APIs
- [ ] Spotify app created with OAuth
- [ ] All services accessible via HTTPS
- [ ] Cross-host routing working (Plex, Home Assistant)
- [ ] Discord bot responding to commands

---

**Congratulations!** Your homelab is now fully deployed and operational.

For ongoing management, use the Dashboard at https://dash.evindrake.net
