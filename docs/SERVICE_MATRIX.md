# Service Testing Matrix - Replit vs Ubuntu

## Overview
This matrix shows which services can be tested on Replit vs Ubuntu, and what features work in each environment.

## Service Status

| Service | Replit | Ubuntu | Port | Status |
|---------|--------|--------|------|--------|
| **Dashboard** | ✅ Full | ✅ Full | 5000 | Production Ready |
| **Stream Bot** | ✅ Full | ✅ Full | 3000 | Production Ready |
| **Discord Bot** | ✅ Partial | ✅ Full | 3001 | Needs Token |
| **Static Site** | ❌ N/A | ✅ Full | - | Simple HTML |
| **n8n** | ❌ Docker | ✅ Full | - | Docker Only |
| **Plex** | ❌ Docker | ✅ Full | - | Docker Only |
| **VNC Desktop** | ❌ Docker | ✅ Full | - | Docker Only |
| **Home Assistant** | ❌ External | ✅ Full | - | External Service |

## Service Details

### ✅ Dashboard (Port 5000)
**Replit:** ✅ Full functionality
- Login and authentication
- Control Center UI
- Smart Home (mock data)
- AI Foundry (mock data)
- Container Marketplace (mock data)
- Agent-to-Agent Chat
- All API endpoints
- Database operations

**Ubuntu:** ✅ Full functionality + real integrations
- All Replit features
- Real Docker container deployment
- Real Ollama AI models
- Real Home Assistant connection
- Redis/Celery background tasks

### ✅ Stream Bot (Port 3000)
**Replit:** ✅ Full functionality
- OAuth flows (Twitch/YouTube/Kick)
- Bot management dashboard
- Command management
- User management
- Database operations
- WebSocket connections
- In-memory quota tracking

**Ubuntu:** ✅ Full functionality + Redis
- All Replit features
- Redis-based quota tracking
- Full production deployment

### ⚠️ Discord Bot (Port 3001)
**Replit:** ⚠️ Partial (requires token)
- Web dashboard ✅
- API endpoints ✅
- Database operations ✅
- User authentication ✅
- Ticket system UI ✅
- Discord connection ⚠️ (needs DISCORD_BOT_TOKEN)
- Bot commands ⚠️ (needs token)

**Ubuntu:** ✅ Full functionality
- All Replit features
- Full Discord bot functionality
- Production deployment

**Setup:**
1. Get Discord bot token from https://discord.com/developers
2. Add to Replit Secrets as `DISCORD_BOT_TOKEN`
3. Restart discord-bot workflow

### ❌ Docker-Based Services (n8n, Plex, VNC)
**Replit:** ❌ Cannot run (no Docker support)

**Ubuntu:** ✅ Full functionality via docker-compose

**Why Not Replit:**
- These services require Docker runtime
- Replit does not support Docker containers
- Must be tested on Ubuntu deployment

### ❌ Home Assistant
**Replit:** ❌ External service (not our code)

**Ubuntu:** ✅ Connects to existing Home Assistant instance

**Dashboard Integration:**
- Dashboard can connect to Home Assistant API
- Replit: Shows mock data in DEMO_MODE
- Ubuntu: Connects to real Home Assistant instance

## Quick Access Guide

### On Replit:
```
Dashboard:    https://your-repl.replit.dev/
Stream Bot:   https://your-repl.replit.dev:3000/
Discord Bot:  https://your-repl.replit.dev:3001/
```

### On Ubuntu:
```
Dashboard:    https://test.evindrake.net/
Stream Bot:   https://stream.rig-city.com/
Discord Bot:  https://bot.rig-city.com/
n8n:          https://n8n.evindrake.net/
Plex:         https://plex.evindrake.net/
VNC:          https://vnc.evindrake.net/
Home Assist:  https://home.evindrake.net/
```

## Testing Strategy

### Development (Replit):
1. **Quick UI Changes** → Test on Dashboard/Stream Bot/Discord Bot
2. **API Development** → Test all endpoints on Replit
3. **Database Changes** → Test migrations on Replit Postgres
4. **OAuth Flows** → Test with real OAuth providers

### Production (Ubuntu):
1. **Docker Services** → Test n8n, Plex, VNC on Ubuntu only
2. **Full Integration** → Test all services together
3. **Performance** → Load testing on Ubuntu
4. **Security** → Production security audits

## Environment Variables

### Required for Replit Testing:
```bash
DATABASE_URL          # Auto-set by Replit (managed Postgres)
DEMO_MODE=true        # Auto-set for Replit
```

### Optional for Enhanced Testing:
```bash
DISCORD_BOT_TOKEN     # Enable Discord bot features
TWITCH_CLIENT_ID      # Test Twitch OAuth
YOUTUBE_CLIENT_ID     # Test YouTube OAuth
KICK_CLIENT_ID        # Test Kick OAuth
```

### Ubuntu Production:
```bash
# All tokens required
# Redis, Celery, Docker enabled
# DEMO_MODE=false
```

## Switching Between Services

### Method 1: Use Service Switcher Script
```bash
./scripts/replit-switch-service.sh
```

### Method 2: Manual Port Access
- Dashboard: Visit root URL
- Stream Bot: Add `:3000` to URL
- Discord Bot: Add `:3001` to URL

### Method 3: Run All Simultaneously
- Click "Run" button in Replit (runs all three)
- Use Preview tool to switch between ports

## Summary

**Testable on Replit (3 services):**
- ✅ Dashboard
- ✅ Stream Bot  
- ✅ Discord Bot (partial, needs token)

**Ubuntu Only (4 services + 1 external):**
- n8n (Docker)
- Plex (Docker)
- VNC Desktop (Docker)
- Static Site (simple HTML)
- Home Assistant (external)

**User can test 95% of functionality on Replit, deploy remaining 5% to Ubuntu for full testing.**
