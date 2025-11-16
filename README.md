# 🚀 Homelab Dashboard

> **AI-powered homelab management platform with autonomous operations**

[![Status](https://img.shields.io/badge/Status-Production-success)]()
[![Python](https://img.shields.io/badge/Python-3.11-blue)]()

## Overview

Production-ready web dashboard for managing Ubuntu homelab servers across 3 domains. Features Jarvis AI assistant, container orchestration, domain management with auto-SSL, and smart home integration.

**Live URLs:**
- Demo: [test.evindrake.net](https://test.evindrake.net) (demo/demo)
- Production: [host.evindrake.net](https://host.evindrake.net) (evin/homelab)
- Game Streaming: [game.evindrake.net](https://game.evindrake.net)

---

## Features

### 🤖 Jarvis AI Assistant
- GPT-4 powered with voice control
- 20+ autonomous actions (diagnose, remediate, maintain)
- Task approval workflow
- Natural language commands

### 🌐 Domain Management
- ZoneEdit DNS integration
- Automatic SSL with Caddy + Let's Encrypt
- 8-step autonomous provisioning
- Health monitoring

### 🐳 Container Marketplace
- 20 curated production apps
- One-click deployment
- Auto port management
- Health checks

### 🏠 Smart Home
- Home Assistant integration
- Device control
- Automation management
- Energy monitoring

### 📊 System Monitoring
- Real-time stats (CPU, memory, disk, network)
- Container health tracking
- Service status dashboard
- Live activity feed

---

## Quick Start (Ubuntu)

### Prerequisites
- Ubuntu 25.10 (or similar)
- Docker + Docker Compose
- Port 80/443 forwarded

### 1. Setup
```bash
cd /home/evin/contain/HomeLabHub
cp .env.unified.example .env
# Edit .env and set passwords
```

### 2. Deploy
```bash
docker compose -f docker-compose.unified.yml up -d
```

### 3. Fix Issues (if needed)
```bash
bash MASTER_FIX_ALL.sh
```

That's it! Access at https://test.evindrake.net

---

## Managed Services

**8 Production Services:**
- Dashboard (test.evindrake.net, host.evindrake.net)
- Discord Bot (bot.rig-city.com)
- Stream Bot (stream.rig-city.com)
- Plex Media (plex.evindrake.net)
- n8n Automation (n8n.evindrake.net)
- Home Assistant (home.evindrake.net)
- VNC Desktop (vnc.evindrake.net)
- Static Site (scarletredjoker.com)

---

## Architecture

```
┌─────────────────────────────────────────────┐
│         Caddy Reverse Proxy (SSL)           │
└────────────────┬────────────────────────────┘
                 │
        ┌────────┴────────┐
        │                 │
┌───────▼──────┐  ┌──────▼────────┐
│  Dashboard   │  │   8 Services  │
│   (Flask)    │  │               │
└───────┬──────┘  └───────────────┘
        │
┌───────▼──────────────────────────┐
│  PostgreSQL + Redis + MinIO      │
└──────────────────────────────────┘
```

**Tech Stack:**
- **Backend**: Flask, Python 3.11
- **Database**: PostgreSQL 16 (multi-tenant)
- **Cache**: Redis
- **Storage**: MinIO (S3-compatible)
- **AI**: OpenAI GPT-4
- **Proxy**: Caddy (auto-SSL)
- **Orchestration**: Docker Compose

---

## Recovery

If services are broken after sync/update:

```bash
bash MASTER_FIX_ALL.sh
```

This script:
1. ✅ Validates .env configuration
2. ✅ Ensures infrastructure healthy
3. ✅ Fixes database passwords
4. ✅ Clears Redis cache (fixes CSRF)
5. ✅ Rebuilds broken containers
6. ✅ Restarts services in order
7. ✅ Shows status

**One command fixes everything.**

---

## Security

- ✅ Session authentication + API keys
- ✅ CSRF protection
- ✅ Rate limiting
- ✅ Audit logging
- ✅ HTTPS everywhere
- ✅ Multi-tenant isolation

---

## Development

**Workflow:**
1. Edit code on Replit
2. Auto-sync to Ubuntu every 5 minutes
3. Run MASTER_FIX_ALL.sh if needed
4. Test on production URLs

**Simple principle:** Keep it simple, one command fixes everything.

---

## License

MIT
