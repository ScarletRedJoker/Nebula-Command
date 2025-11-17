# NebulaCommand Project

## Overview
NebulaCommand is an enterprise-grade, web-based dashboard for managing Ubuntu servers. It offers a unified, AI-powered interface to minimize operational overhead, maximize reliability, and enable intelligent automated operations. The platform integrates a Jarvis AI Agent for diagnostics and remediation, zero-touch domain management, multi-service orchestration with automatic SSL, and automated health monitoring. It is designed for production environments, featuring robust security, rolling deployments, automatic backups, and comprehensive monitoring. The project aims to provide a Container Marketplace, an Agent Collaboration System, and a Jarvis Control Center for unified intelligence.

## User Preferences
- User: Evin
- Ubuntu 25.10 desktop homelab with Twingate VPN and dynamic DNS (ZoneEdit)
- Manages domains: rig-city.com, evindrake.net, scarletredjoker.com
- All projects stored in: `/home/evin/contain/` (production) and Replit (development)
- Development workflow: **Edit on Replit → Agent makes changes → Auto-sync to Ubuntu every 5 minutes**
- Services to manage:
  - Discord Ticket Bot (bot.rig-city.com)
  - Stream Bot / SnappleBotAI (stream.rig-city.com)
  - Plex Server (plex.evindrake.net)
  - n8n Automation (n8n.evindrake.net)
  - Static Website (scarletredjoker.com)
  - VNC Desktop (vnc.evindrake.net)
  - NebulaCommand Dashboard (host.evindrake.net)
  - Home Assistant (home.evindrake.net)
- Prefers centralized development environment with clean structure
- Needs public HTTPS access with automatic SSL (port forwarding configured)

## System Architecture

### UI/UX Decisions
The NebulaCommand Dashboard features a cosmic theme with deep space backgrounds, animated starfields, nebula gradients, and glassmorphic UI panels, adhering to WCAG AA Accessibility standards. The Jarvis Voice Chat and mobile UI are fully responsive with cosmic themes and touch-friendly design. The Stream Bot uses a "candy theme" with gradients, glassmorphism, rounded edges, and glow effects.

### Technical Implementations

**NebulaCommand Dashboard**
- **Stack**: Flask, Python 3.11, Bootstrap 5, Chart.js, SQLAlchemy, Alembic, Redis, Celery, MinIO.
- **Core Features**: Docker orchestration, real-time monitoring, GPT-4 AI assistant (Jarvis), network analytics, domain health, one-click database deployments, intelligent deployment analyzer, secure file upload, Google Services integration, Home Assistant integration, Container Marketplace, Agent Collaboration, Jarvis Control Center, DNS Records Management (ZoneEdit), PowerDNS Integration, NAS Discovery.

**Jarvis Autonomous Framework**
- **Architecture**: Task System (CRUD API), Action Library (20+ YAML actions across 3 tiers), Safe Executor (sandboxed with rollback), Code Workspace (AI code generation, diff preview, approval), Policy Engine, Observability.
- **Tier 1 (DIAGNOSE)**: 8 diagnostic actions (DNS, SSL, service health, Git sync, deployments, disk usage, log analysis, endpoint health).
- **Tier 2 (REMEDIATE)**: 7 autonomous healing actions (DNS, SSL renewal, ddclient fixes, service restart, Git sync recovery, config rollback, DB optimization).
- **Tier 3 (PROACTIVE)**: 5 maintenance tasks (temp file cleanup, log rotation, Redis cache clearing, DB vacuum/reindex, resource optimization).

**Domain Management System**
- **Database Models**: `DomainRecord`, `DomainEvent`, `DomainTask`.
- **REST API**: 9 production endpoints for domain management (CRUD, provision, health, SSL renewal, import/export).
- **Celery Workers**: Background tasks for health monitoring, SSL expiration, DNS propagation, provisioning, certificate renewal.
- **ZoneEdit DNS Integration**: Full CRUD, public IP detection, propagation verification, TTL management, bulk updates.
- **Caddy Configuration Automation**: Template-based config generation, validation, backup, syntax validation, zero-downtime reloads, automatic rollback, smart block removal.
- **SSL Certificate Lifecycle**: Expiration monitoring, automatic renewal, multi-step validation, HTTPS verification, alert system, manual renewal API.
- **Autonomous Provisioning Workflow**: 8 steps from IP detection to HTTPS verification.
- **Import/Export**: JSON and CSV support with validation and conflict detection.

**Discord Ticket Bot**
- **Stack**: TypeScript, React, Express, Discord.js, Drizzle ORM, PostgreSQL.
- **Purpose**: Support ticket system and multi-platform streamer go-live notifications.

**Stream Bot / SnappleBotAI**
- **Stack**: TypeScript, React, Express, tmi.js, @retconned/kick-js, OpenAI GPT-5, Spotify Web API, Drizzle ORM, PostgreSQL.
- **Purpose**: Multi-tenant SaaS for AI-powered stream bot management across Twitch, YouTube, and Kick.
- **Key Features**: Custom commands, AI auto-moderation, giveaways, stream statistics, mini-games, channel points, song requests, polls, alerts, AI chatbot personalities, analytics.

**Other Services**: Static Site, n8n, Plex, VNC Desktop (Dockerized).

### System Design Choices
- **Database Architecture**: Single PostgreSQL container managing multiple service-specific databases with concurrency protection.
- **Unified Deployment System**: Orchestrated by `docker-compose.unified.yml` and `homelab-manager.sh` with Caddy reverse proxy for automatic SSL. Automated Replit → Ubuntu sync.
- **Deployment Automation**: Rolling deployments with health checks, pre-deployment validation, backup/restore, manual rollback.
- **CI/CD Pipeline**: 5-stage pipeline (Validate → Test → Build → Deploy → Verify) with multi-environment and security scanning.
- **Security**: Session-based auth + API key, secure file validation, antivirus, rate limiting, audit logging, CSRF, Celery/Redis health monitoring, command/path whitelisting, multi-tenant isolation, OAuth.
- **Production Readiness**: Emphasizes security, performance (connection pooling, optimized Docker images, background jobs), robust error handling, high reliability, extensive End-to-End and security testing, and centralized monitoring with structured JSON logging.

## External Dependencies

**Dashboard:**
- Flask (and extensions)
- docker (SDK), psutil, dnspython, paramiko
- openai, tenacity
- SQLAlchemy, Alembic, psycopg2-binary
- Redis, Celery, eventlet
- MinIO
- Google APIs: `google-api-python-client`, `google-auth`, `google-auth-httplib2`, `google-auth-oauthlib`
- Bootstrap 5, Chart.js

**Discord Bot:**
- `discord.js`, `express`, `drizzle-orm`, `pg`
- `passport-discord`, `express-rate-limit`, `express-session`
- React, Vite, Radix UI components, Tailwind CSS

**Stream Bot:**
- `tmi.js` (Twitch), `@retconned/kick-js` (Kick)
- `openai` (GPT-5), `express`, `drizzle-orm`, `pg`
- `passport`, `passport-twitch-new`, `passport-google-oauth20` (OAuth)
- `express-rate-limit`, `express-session`
- React, Vite, Radix UI, Tailwind CSS, Recharts
- Spotify Web API, YouTube Data API v3

**Infrastructure:**
- Caddy
- PostgreSQL 16 Alpine
- Docker & Docker Compose
- Let's Encrypt