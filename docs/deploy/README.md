# HomeLabHub Deployment Guide

## Architecture Overview

HomeLabHub uses a **two-tier deployment architecture** that separates cloud-accessible services from local, resource-intensive applications.

```
┌─────────────────────────────────────────────────────────────────────────┐
│                              INTERNET                                    │
└────────────────────────────────┬────────────────────────────────────────┘
                                 │
                      ┌──────────┴──────────┐
                      │     Cloudflare      │
                      │    (DNS + CDN)      │
                      └──────────┬──────────┘
                                 │
         ┌───────────────────────┴───────────────────────┐
         │                                               │
         ▼                                               ▼
┌─────────────────────┐                      ┌─────────────────────┐
│   LINODE CLOUD      │◄──── Tailscale ────► │   LOCAL UBUNTU      │
│   (4GB+ RAM)        │       VPN Mesh       │   (Gaming PC)       │
├─────────────────────┤                      ├─────────────────────┤
│ • Dashboard (5000)  │                      │ • Plex (32400)      │
│ • Discord Bot       │                      │ • Home Assistant    │
│ • Stream Bot        │                      │ • MinIO Storage     │
│ • PostgreSQL        │                      │ • VNC Desktop       │
│ • Redis             │                      │ • NAS Mount         │
│ • n8n Automation    │                      └─────────────────────┘
│ • Code Server       │
│ • Static Sites      │
│ • Caddy (SSL)       │
└─────────────────────┘
```

## Service Distribution

### Cloud Services (Linode)
Services that need 24/7 uptime and public internet access:

| Service | Port | Domain |
|---------|------|--------|
| Dashboard | 5000 | host.evindrake.net |
| Discord Bot | 4000 | bot.rig-city.com |
| Stream Bot | 5000 | stream.rig-city.com |
| n8n Automation | 5678 | n8n.evindrake.net |
| Code Server | 8443 | code.evindrake.net |
| PostgreSQL | 5432 | (internal) |
| Redis | 6379 | (internal) |

### Local Services (Ubuntu Host)
Services that need local hardware access or high bandwidth:

| Service | Port | Domain |
|---------|------|--------|
| Plex Media Server | 32400 | plex.evindrake.net |
| Home Assistant | 8123 | home.evindrake.net |
| MinIO Object Storage | 9000/9001 | (internal) |
| VNC Desktop | 5901/6080 | vnc.evindrake.net |

## Tailscale VPN Mesh

All communication between Linode and local host uses Tailscale for secure, encrypted connectivity.

```
Linode (100.x.x.x) ◄─────────────► Local Host (100.y.y.y)
        │                                    │
        └──── Encrypted WireGuard ───────────┘
```

Benefits:
- **Zero trust networking** - No exposed ports between servers
- **Automatic key rotation** - Managed by Tailscale
- **MagicDNS** - Access services by hostname
- **Exit nodes** - Route traffic through specific nodes

## Quick Start

### 1. Linode Server Setup
```bash
# SSH into your Linode
ssh root@your-linode-ip

# Clone the repository
git clone https://github.com/ScarletRedJoker/HomeLabHub.git /opt/homelab/HomeLabHub

# Run Linode bootstrap
cd /opt/homelab/HomeLabHub
sudo ./deploy/scripts/bootstrap-linode.sh

# Authenticate Tailscale
sudo tailscale up

# Configure environment
cp .env.example .env
nano .env  # Add your credentials

# Deploy services
./deploy/scripts/bootstrap.sh
```

### 2. Local Host Setup
```bash
# Clone the repository
git clone https://github.com/ScarletRedJoker/HomeLabHub.git ~/contain/HomeLabHub

# Run local bootstrap
cd ~/contain/HomeLabHub
./deploy/scripts/bootstrap-local.sh

# Configure environment
cp .env.example .env.local
nano .env.local  # Add local credentials

# Start local services
docker compose -f compose.local.yml up -d
```

### 3. DNS Configuration
Point domains to your Linode IP in Cloudflare:
```
A  host.evindrake.net    → <linode-ip>
A  bot.rig-city.com      → <linode-ip>
A  stream.rig-city.com   → <linode-ip>
A  plex.evindrake.net    → <linode-ip>
A  home.evindrake.net    → <linode-ip>
```

## Documentation Index

| Document | Description |
|----------|-------------|
| [Prerequisites](prereqs.md) | Required accounts, API keys, and resources |
| [Linode Setup](linode-setup.md) | Step-by-step cloud server deployment |
| [Local Setup](local-setup.md) | Ubuntu host configuration |
| [Secrets Management](secrets.md) | Handling API keys and passwords |
| [Email Setup](email.md) | Transactional email configuration |
| [Troubleshooting](troubleshooting.md) | Common issues and solutions |

## Useful Commands

```bash
# Check all service status
./homelab status

# View service logs
./homelab logs

# Restart all services
./homelab restart

# Health check
./homelab health

# View specific service logs
docker compose logs -f homelab-dashboard
```

## Support

- **Repository**: https://github.com/ScarletRedJoker/HomeLabHub
- **Issues**: Create a GitHub issue for bugs or feature requests
