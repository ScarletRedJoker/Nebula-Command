# Nebula Command - HomeLabHub Platform

## Overview
Nebula Command, also known as the HomeLabHub Platform, is a comprehensive suite for homelab management, Discord community integration, and multi-platform streaming. It comprises a Dashboard for homelab control and AI assistance, a Discord Bot for community and notification management, and a Stream Bot for automated content posting across streaming platforms. The platform's vision is to offer a unified control plane for homelab enthusiasts, providing advanced features for automation, monitoring, and interaction within their digital environments.

## User Preferences
- **User:** Evin
- **Managed Domains:** rig-city.com, evindrake.net, scarletredjoker.com
- **Development Workflow:** Edit in Replit → Push to GitHub → Pull on Ubuntu servers
- **Database:** Shared PostgreSQL (Neon in dev, homelab-postgres in prod)
- **Secrets:** .env file (never commit), Replit Secrets in dev

### Deployment Preference
When Evin asks to "deploy", this means:
1. **Linode**: `ssh root@linode.evindrake.net` → `cd /opt/homelab/HomeLabHub/deploy/linode && ./deploy.sh`
2. **Local Ubuntu**: `ssh evin@host.evindrake.net` → `cd /opt/homelab/HomeLabHub/deploy/local && ./deploy.sh`

Each server deploys ONLY its own services. They are separate and independent.

## System Architecture

### Core Services
The platform consists of three main services:
-   **Dashboard (Flask/Python)**: A web interface for homelab management, AI assistance (Jarvis), Docker control, NAS management, fleet control, KVM gaming mode switching, and Cloudflare DNS management. It features a professional dark theme.
-   **Discord Bot (Node.js/React)**: Handles Discord community management, including a ticket system, music bot, stream notifications, and analytics. It integrates with the Stream Bot for go-live alerts and offers multi-tenant security.
-   **Stream Bot (Node.js/React/Vite)**: Manages multi-platform content posting and interaction across Twitch, YouTube, and Kick. It supports OAuth, per-user personalization, token encryption, rate limiting, and anti-spam measures, with a modernized UI.

### Cross-Service Integration
Services share a PostgreSQL database and Redis for caching. The Stream Bot uses webhooks for Discord go-live notifications. The Dashboard and Discord Bot communicate via APIs. The Discord Bot integrates with Plex for "Now Playing" status and Lanyard for rich presence. The entire system is multi-tenant with user roles and RBAC.

### Deployment and Hosting
The system is deployed on two independent servers:
-   **Linode Cloud**: Hosts the Dashboard, Discord Bot, and Stream Bot.
-   **Local Ubuntu**: Hosts local homelab services like Plex, MinIO, and Home Assistant.
Each server utilizes separate deployment scripts.

### Tailscale Connectivity
Linode utilizes a Tailscale sidecar container to access local services on the Ubuntu homelab, including Plex, Home Assistant, MinIO, and a KVM/Sunshine gaming VM. The `tailscale` container operates in `network_mode: host` to route all Linode container traffic through the Tailscale network.

### Database Schema
A shared PostgreSQL instance organizes data into distinct databases for each service:
-   `homelab_jarvis`: Dashboard data (AI conversations, Docker, audit logs).
-   `discord_bot`: Discord Bot data (tickets, messages, server configs, stream notifications).
-   `stream_bot`: Stream Bot data (configurations, platform connections, message history).

### KVM Gaming VM (Sunshine/Moonlight)
A KVM VM named `RDPWindows` is configured with GPU passthrough (NVIDIA RTX 3060) and a Tailscale IP (`100.118.44.102`). It features robust startup scripts that handle GPU D3cold recovery, stale process cleanup, retry logic, and health monitoring. Moonlight can connect via Tailscale or local LAN.

### Local Ubuntu Server Configuration
The local Ubuntu server mounts a NAS share (`//192.168.0.185/networkshare`) at `/srv/media` using CIFS with `noauto,x-systemd.automount` for boot safety. Key services run in Docker containers, including Plex, Home Assistant, MinIO, and Caddy.

### Stream Bot OBS Overlays
The Stream Bot offers an overlay editor for OBS, allowing visual drag-and-drop customization of text, images, and alerts. Overlays can be exported as JSON or saved in-memory. Specific URLs are provided for Spotify, YouTube, and custom overlays.

### Recent Fixes (January 2026)
- **Stream Bot Rate Limiter Fixed**: Increased auth limit from 5 to 50 requests, added skipSuccessfulRequests for OAuth flows
- **Discord Bot Dashboard Simplified**: Reduced from 11 tabs to 5 core tabs (Overview, Tickets, Streams, Welcome, Commands) + "More Tools" dropdown
- **qBittorrent + VPN Setup Added**: Created deploy/local/torrent-vpn/ with gluetun container for private torrenting

### Powerhouse Features (January 2026)
Eight major features were added to transform the platform into an ultimate powerhouse for developers and content creators:

1. **Homelab Monitoring** (`services/dashboard/routes/monitoring_routes.py`)
   - Python agent collects CPU, RAM, disk, temps, network metrics
   - Remote reporting via API endpoints
   - Discord alerts when thresholds are breached
   - Install script served from `/api/monitoring/agent/script`

2. **Developer Tools - GitHub Webhooks** (`services/discord-bot/server/routes/github-webhooks.ts`)
   - Receives webhooks for push, PR, workflow, release events
   - Sends formatted Discord embeds with event details
   - Supports deploy-on-push automation

3. **AI Content Assistant** (`services/stream-bot/server/ai-content-service.ts`)
   - GPT-4o-mini powered content generation
   - Generates stream titles, descriptions, social posts, hashtags
   - Stream idea suggestions based on channel theme

4. **Multi-Platform Analytics** (`services/stream-bot/server/analytics-service.ts`)
   - Unified Twitch/YouTube/Kick metrics
   - `getPlatformMetrics()` - Real-time follower/subscriber counts
   - `getStreamHistory()` - Historical stream sessions
   - `getRevenueEstimate()` - Revenue calculations from subs/donations

5. **Multi-Platform Restream** (`services/stream-bot/server/restream-service.ts`)
   - RTMP destination management for Twitch, YouTube, Kick, Facebook
   - Stream key storage with encryption
   - Region-based RTMP server selection
   - Database table: `restream_destinations`

6. **Community Events Calendar** (`services/stream-bot/server/events-service.ts`)
   - Schedule streams, watch parties, collab events
   - Recurring events with daily/weekly/monthly patterns
   - Public embed endpoint for sharing: `/api/events/public/:userId`
   - Discord notification integration
   - Database table: `stream_events`

7. **Clip Manager** (`services/stream-bot/server/clip-service.ts`)
   - Fetch clips from Twitch (Helix API) and YouTube (Data API v3)
   - AI caption generation for social media posting
   - Status workflow: new → reviewed → posted
   - Tag organization and highlight marking

8. **Smart Notifications / Unified Inbox** (`services/stream-bot/server/notifications-service.ts`)
   - Aggregates follows, subs, donations, mentions, raids across platforms
   - Filter by platform and notification type
   - Mark as read functionality
   - Webhook endpoint for platform integrations
   - Database table: `unified_inbox_notifications`

### Discord Bot Stream Notifications
Stream notifications require explicit setup by configuring a channel and tracking streamers via Discord commands. Detection works by monitoring Discord presence and polling Twitch/YouTube APIs. Users must link their streaming platforms to Discord for detection.

## External Dependencies

-   **PostgreSQL**: Primary database (Neon, homelab-postgres).
-   **Redis**: Caching and session management.
-   **OpenAI API**: Jarvis AI and text-to-speech.
-   **Discord API (discord.js)**: Discord Bot functionality.
-   **Twitch API**: Stream Bot and Discord Bot integrations.
-   **YouTube API**: Stream Bot and Discord Bot integrations.
-   **Kick API**: Stream Bot integration.
-   **Spotify API**: Music bot features.
-   **Plex API**: "Now Playing" integration.
-   **Home Assistant API**: Homelab automation and status.
-   **Cloudflare API**: DNS management.
-   **Lanyard API**: Personal rich presence.
-   **Caddy**: Reverse proxy.
-   **Tailscale**: Secure network access.