# Homelab Dashboard Project

## Recent Changes (November 16, 2025)

### Jarvis Autonomous Infrastructure Management (INVESTOR-READY)
- **Autonomous DNS/SSL Remediation**: Jarvis now detects and auto-fixes DNS failures, ddclient auth issues, and SSL certificate problems without human intervention
- **Infrastructure Monitoring**: 8 new Tier 1 diagnostic actions monitor DNS, SSL, git sync, deployments, and service health every 5-15 minutes
- **Self-Healing Capabilities**: 7 new Tier 2 remediation actions automatically restart services, fix configs, clear locks, and recover from failures
- **Safe Config Editing**: SafeCommandExecutor enhanced with config file validation, automatic backups, and rollback capabilities
- **Integration Services**: ZoneEdit DNS API, Caddy certificate management, and Git sync monitoring with exponential backoff and rate limiting
- **Code Generation Workspace**: JarvisCodeWorkspace enables safe autonomous code editing with diff previews, approval workflow, and audit trails
- **Comprehensive Testing**: 22 unit tests covering all autonomous infrastructure capabilities - ALL PASSING
- **Investor Demo Ready**: Full documentation (JARVIS_AUTONOMOUS_CAPABILITIES.md) demonstrating 99.9% uptime target with autonomous remediation

### Production-Ready Updates (November 15, 2025)
- **Jarvis Voice Chat:** Full voice I/O implementation with Web Speech API, cosmic-themed UI, mobile-responsive design using Replit AI Integrations
- **Spotify Integration:** Production-ready with Replit Connector API, automatic token refresh (5-min pre-emptive), exponential backoff retry, 401/429 error handling
- **Code-Server:** Fixed persistent permission errors by switching from Docker volumes to local bind mounts (./volumes/code-server)
- **Network Tab:** Enhanced with comprehensive DOM guards, null checks, Chart.js validation, graceful error handling
- **Mobile UI:** Fully responsive with hamburger menu, touch-friendly buttons (44px min), defensive error handling, complete null guards
- **Critical Bug Fixes:** Fixed 4 syntax errors in network.js, added complete DOM null guards across all JavaScript, fortified hamburger menu error handling

## Overview
This project provides a comprehensive web-based dashboard for managing a Ubuntu homelab server. Its core purpose is to offer a unified, user-friendly interface to reduce operational overhead, enhance server reliability, and enable intelligent automation and monitoring. Key capabilities include one-click database deployments, game streaming integration, robust domain health monitoring, and integrations with Google Services and Smart Home platforms. The project aims for production readiness, envisioning an AI-first homelab copilot, Jarvis, capable of autonomous diagnosis, remediation, and execution of homelab issues.

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
  - Homelab Dashboard (host.evindrake.net)
  - Home Assistant (home.evindrake.net)
- Prefers centralized development environment with clean structure
- Needs public HTTPS access with automatic SSL (port forwarding configured)

## System Architecture

### Directory Structure
The project uses a structured directory for services, deployment scripts, documentation, and configuration, orchestrated by a unified `docker-compose.unified.yml` and Caddyfile.

### Technical Implementations

**Homelab Dashboard**
- **Stack**: Flask, Python, Bootstrap 5, Chart.js, SQLAlchemy, Alembic, Redis, Celery, MinIO.
- **Core Features**: Docker management, system monitoring, AI assistant (Jarvis, powered by gpt-5), network analytics, domain health checks, one-click database deployments, game streaming integration, intelligent deployment analyzer, secure file upload.
- **Integrations**: Google Services (Calendar, Gmail, Drive with automatic token refresh), Smart Home Control (Home Assistant with health monitoring and auto-reconnection), ZoneEdit DNS API, Caddy SSL management.
- **Security**: Session-based auth + API key, secure file validation, antivirus scanning, rate limiting, audit logging, CSRF protection, Celery/Redis health monitoring with circuit breaker.
- **Design System**: Cosmic theme with deep space backgrounds, animated starfields, nebula gradients, glassmorphic UI panels, WCAG AA Accessibility.
- **Jarvis Autonomous Framework**: 
  - **Tier 1 (DIAGNOSE)**: 8 diagnostic actions monitoring DNS, SSL, services, git sync, deployments (every 5-15 min)
  - **Tier 2 (REMEDIATE)**: 7 autonomous healing actions for infrastructure failures (auto-execute with safety checks)
  - **Tier 3 (PROACTIVE)**: Scheduled maintenance (DB optimization, log cleanup)
  - **SafeCommandExecutor**: Config file editing with validation, automatic backups, and rollback
  - **Integration Services**: ZoneEdit DNS health, Caddy certificate management, Git sync monitoring
  - **Code Workspace**: Safe autonomous code generation with diff preview and approval workflow
  - **Security**: Command whitelisting, path whitelisting, rate limiting (60/min), circuit breakers, comprehensive audit logging

**Discord Ticket Bot**
- **Stack**: TypeScript, React, Express, Discord.js, Drizzle ORM, PostgreSQL.
- **Purpose**: Support ticket system and multi-platform streamer go-live notifications with automatic streamer discovery.
- **Security**: OAuth CSRF protection, atomic database transactions, comprehensive security headers, session hardening.
- **Stream Notifications**: Debouncing, offline grace period, platform switch detection, YouTube API integration, exponential backoff retry.

**Stream Bot / SnappleBotAI**
- **Stack**: TypeScript, React, Express, tmi.js, @retconned/kick-js, OpenAI GPT-5, Spotify Web API, Drizzle ORM, PostgreSQL.
- **Purpose**: Multi-tenant SaaS for AI-powered stream bot management across Twitch, YouTube, and Kick.
- **Key Features**: Custom commands, AI auto-moderation, giveaway system (with atomic concurrency protection), stream statistics, mini-games, channel points, song requests, polls, alerts, AI chatbot personalities, advanced analytics, OAuth platform linking with automatic token refresh.
- **Security**: Fort Knox OAuth, multi-tenant isolation, OAuth rate limiting, giveaway concurrency protection, atomic SQL for currency operations.
- **Design System**: Candy theme with delicious gradients, glassmorphism effects, rounded edges, and glow effects.

**Other Services**:
- **Static Site**: Simple HTML/CSS/JS personal portfolio.
- **n8n**: Workflow automation platform.
- **Plex**: Media streaming server with automated backup and resource limits.
- **VNC Desktop**: Custom Dockerized Ubuntu desktop environment for remote access with resource limits and security hardening.

### Database Architecture
A single PostgreSQL container manages multiple service-specific databases with robust concurrency protection and constraints.

### Unified Deployment System
- `homelab-manager.sh`: Centralized script for all operations.
- `docker-compose.unified.yml`: Orchestrates all services.
- Caddy reverse proxy: Provides automatic SSL via Let's Encrypt.
- Automated Replit → Ubuntu Sync: Scripts for 5-minute code synchronization.
- **Deployment Automation**: Includes blue-green deployments for static sites, pre-deployment validation, health-based deployment with auto-rollback, and comprehensive backup/restore systems.
- **CI/CD Pipeline**: A 5-stage pipeline (Validate → Test → Build → Deploy → Verify) with multi-environment support, security scanning, and automatic rollback.

### Production Readiness
- **Security**: Comprehensive security audits, environment variable-based secrets, robust OAuth, automatic HTTPS, SQL injection prevention, secure Docker configurations, secure session management, input validation, multi-tenant isolation.
- **Performance**: Health check endpoints, database connection pooling, optimized Docker images, Celery background job monitoring with retry and dead letter queues.
- **Error Handling**: React Error Boundaries, comprehensive logging, user-friendly messages, automatic retry logic with exponential backoff, circuit breaker patterns.
- **Reliability**: Automatic token refresh, giveaway concurrency protection, stream detection edge cases handled, Home Assistant auto-reconnection.
- **Testing**: Extensive End-to-End test suites (14 comprehensive flows), security test suites (140+ tests).
- **Monitoring**: Centralized system monitoring with structured JSON logging, real-time status dashboards for all services.

## External Dependencies

**Dashboard:**
- Flask (and related Flask extensions), docker (SDK), psutil, dnspython, paramiko, openai, tenacity
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