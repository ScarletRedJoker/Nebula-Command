# Nebula Command Dashboard Project

## Overview
The Nebula Command Dashboard is a web-based interface for managing a Ubuntu 25.10 server hosting 15 Docker-based services. These services are accessible via custom evindrake.net subdomains and include homelab management, Discord/Twitch bots, media streaming, remote desktop access, and home automation. The project aims to provide a centralized, robust, and secure platform for managing a comprehensive homelab environment, integrating various functionalities for personal and community use.

## User Preferences
- User: Evin
- Ubuntu 25.10 server at host.evindrake.net
- Project location: `/home/evin/contain/HomeLabHub`
- Development: Edit in cloud IDE → Push to GitHub → Pull on Ubuntu server
- All services use shared PostgreSQL (homelab-postgres) with individual databases
- Main password: `Brs=2729` (used for most services)
- Managed domains: rig-city.com, evindrake.net, scarletredjoker.com

## System Architecture

### UI/UX Decisions
The dashboard is a Flask-based management UI using Bootstrap 5 and Chart.js for visualization. Bot interfaces are built with React, Vite, Tailwind CSS, and Radix UI.

### Technical Implementations
The core system relies on Docker Compose for orchestrating 15 services. A `bootstrap-homelab.sh` script provides idempotent fresh installations with pre-flight checks, rollback capabilities, and comprehensive validation. A `./homelab` script offers day-to-day management, including fixing issues, checking status, viewing logs, restarting services, health checks, database operations (backup/restore), and updates.

### Feature Specifications
- **Dashboard & AI:** Flask UI with Jarvis AI assistant (GPT-3.5-turbo), Docker/system monitoring.
- **Bots:** Discord ticket bot (TypeScript, React, Drizzle ORM) and a multi-platform stream bot (SnappleBotAI for Twitch/Kick/YouTube).
- **Services:** Remote Ubuntu desktop (VNC), VS Code in browser (code-server), Plex media server, n8n workflow automation, Home Assistant.
- **Static Sites:** Hosting for rig-city.com and scarletredjoker.com.
- **Notification System:** Multi-channel alerts for storage thresholds and OAuth token expiry.
- **Security:** Automatic SSL via Caddy/Let's Encrypt, environment-based secrets, isolated database credentials per service, password-protected VNC/Code Server, rate limiting, and CSRF protection.

### System Design Choices
- **Containerization:** All services are Dockerized and managed by Docker Compose.
- **Centralized Database:** A single PostgreSQL container (`homelab-postgres`) serves as the shared database for all services, with individual databases and user credentials for each.
- **Reverse Proxy:** Caddy handles reverse proxying and automatic SSL for all services.
- **Environment Management:** All configuration is managed via a single `.env` file at the project root, loaded by Docker via absolute paths.
- **Modular Architecture:** Designed for easy addition of new services by modifying `docker-compose.yml` and Caddy configuration.

## External Dependencies

- **PostgreSQL 16 Alpine:** Shared database for all services.
- **Redis:** Used for caching.
- **MinIO:** S3-compatible object storage.
- **Caddy:** Reverse proxy with automatic SSL via Let's Encrypt.
- **GPT-3.5-turbo (OpenAI API):** Powers the Jarvis AI assistant and stream bot's fact generation.
- **Discord API:** For the Discord ticket bot.
- **Twitch/Kick/YouTube APIs:** For the multi-platform stream bot.
- **Plex Media Server:** Integrated for media streaming.
- **n8n:** Workflow automation tool.
- **Home Assistant:** Smart home hub integration.