# Homelab Dashboard Project

## Overview
This project delivers a comprehensive web-based dashboard for managing a Ubuntu 25.10 homelab server. Its primary purpose is to provide a unified, user-friendly interface to reduce operational overhead, enhance server reliability, and enable intelligent automation and monitoring for complex homelab setups. Key capabilities include one-click database deployments, game streaming integration, robust domain health monitoring, and integrations with Google Services and Smart Home platforms. The project aims to provide all necessary source code for easy development, testing, and deployment, with a focus on production readiness. The vision for this project is an AI-first homelab copilot, Jarvis, capable of autonomous diagnosis, remediation, and execution of homelab issues, serving as a mission control UI for actionable intelligence and safe automation.

## User Preferences
- User: Evin
- Ubuntu 25.10 desktop homelab with Twingate VPN and dynamic DNS (ZoneEdit)
- Manages domains: rig-city.com, evindrake.net, scarletredjoker.com
- All projects stored in: `/home/evin/contain/` (production) and Replit (development)
- Development workflow: **Edit on Replit → Agent makes changes → Auto-sync to Ubuntu every 5 minutes**
- Services to manage:
  - Discord Ticket Bot (bot.rig-city.com) - Custom support bot with PostgreSQL
  - Stream Bot / SnappleBotAI (stream.rig-city.com) - AI Snapple facts for Twitch/Kick
  - Plex Server (plex.evindrake.net) - Media streaming
  - n8n Automation (n8n.evindrake.net) - Workflow automation
  - Static Website (scarletredjoker.com) - Personal website
  - VNC Desktop (vnc.evindrake.net) - Remote desktop access
  - Homelab Dashboard (host.evindrake.net) - Management UI
  - **Home Assistant (home.evindrake.net) - Smart home automation hub with Google Home integration**
- Prefers centralized development environment with clean structure
- Needs public HTTPS access with automatic SSL (port forwarding configured)

## System Architecture

### Directory Structure
```
HomeLabHub/
├── services/
│   ├── dashboard/
│   ├── discord-bot/
│   ├── stream-bot/
│   ├── static-site/
│   ├── vnc-desktop/
│   ├── n8n/
│   └── plex/
├── deployment/
├── docs/
├── config/
├── docker-compose.unified.yml
├── Caddyfile
└── DEPLOYMENT_GUIDE.md
```

### Technical Implementations

**Homelab Dashboard (services/dashboard/)**
- **Stack**: Flask, Python, Bootstrap 5, Chart.js, SQLAlchemy, Alembic, Redis, Celery, MinIO.
- **Core Features**: Docker management, system monitoring, AI assistant (Jarvis, powered by gpt-5), network analytics, domain health checks, one-click database deployments, game streaming integration, intelligent deployment analyzer, secure file upload.
- **Advanced Integrations**: Google Services (Calendar, Gmail, Drive), Smart Home Control (Home Assistant with Google Home voice commands).
- **Security**: Session-based auth + API key, secure file validation, antivirus scanning, rate limiting, audit logging, CSRF protection.
- **Design System**: Cosmic theme with deep space backgrounds, animated starfields, nebula gradients, glassmorphic UI panels. WCAG AA Accessibility for text contrast.

**Discord Ticket Bot (services/discord-bot/)**
- **Stack**: TypeScript, React, Express, Discord.js, Drizzle ORM, PostgreSQL.
- **Purpose**: Support ticket system and multi-platform streamer go-live notifications with automatic streamer discovery via Discord presence.

**Stream Bot / SnappleBotAI (services/stream-bot/)**
- **Stack**: TypeScript, React, Express, tmi.js, @retconned/kick-js, OpenAI GPT-5, Spotify Web API, Drizzle ORM, PostgreSQL.
- **Purpose**: Multi-tenant SaaS for AI-powered stream bot management across Twitch, YouTube, and Kick.
- **Key Features**: Custom commands, AI auto-moderation, giveaway system, shoutouts, stream statistics, mini-games, channel points, song requests, polls, alerts, AI chatbot personalities, advanced analytics, OAuth platform linking, onboarding wizard.
- **Design System**: Candy theme with delicious gradients, glassmorphism effects, rounded edges, and glow effects.

**Other Services**:
- **Static Site**: Simple HTML/CSS/JS personal portfolio.
- **n8n**: Workflow automation platform.
- **Plex**: Media streaming server.
- **VNC Desktop**: Custom Dockerized Ubuntu desktop environment for remote access.

### Database Architecture
A single PostgreSQL container manages multiple databases (`ticketbot`, `streambot`).

### Unified Deployment System
- `homelab-manager.sh`: Central script for all operations.
- `docker-compose.unified.yml`: Orchestrates all services.
- Caddy reverse proxy: Provides automatic SSL via Let's Encrypt.
- Automated Replit → Ubuntu Sync: Scripts for 5-minute code synchronization.

### Production Readiness
- **Security**: Comprehensive security audit, environment variable-based secrets, robust OAuth (including critical fix for account hijacking), automatic HTTPS, SQL injection prevention, secure Docker configurations, secure session management, input validation, rate limiting, and CORS configuration.
- **Performance**: Health check endpoints, database connection pooling, optimized Docker images.
- **Error Handling**: React Error Boundaries, comprehensive logging, user-friendly messages, automatic retry logic.

## External Dependencies

**Dashboard:**
- Flask, Flask-CORS, Flask-SocketIO, Flask-Session, Flask-WTF, Flask-Limiter, docker (SDK), psutil, dnspython, paramiko, openai, tenacity
- SQLAlchemy, Alembic, psycopg2-binary
- Redis, Celery, eventlet
- MinIO (S3-compatible object storage)
- Google APIs: `google-api-python-client`, `google-auth`, `google-auth-httplib2`, `google-auth-oauthlib`
- Bootstrap 5, Chart.js

**Discord Bot:**
- `discord.js`, `express`, `drizzle-orm`, `pg`, `passport-discord`
- `express-rate-limit`, `express-session`
- React, Vite, Radix UI components, Tailwind CSS

**Stream Bot:**
- `tmi.js` (Twitch), `@retconned/kick-js` (Kick), `openai` (GPT-5), `express`, `drizzle-orm`, `pg`
- `passport`, `passport-twitch-new`, `passport-google-oauth20` (OAuth)
- `express-rate-limit`, `express-session`
- React, Vite, Radix UI, Tailwind CSS, Recharts
- Spotify Web API, YouTube Data API v3

**Infrastructure:**
- Caddy (reverse proxy)
- PostgreSQL 16 Alpine
- Docker & Docker Compose
- Let's Encrypt