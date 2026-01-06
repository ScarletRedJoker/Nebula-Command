# Nebula Command

A comprehensive homelab management and creation engine - empowering anyone to build, deploy, and manage services, websites, and applications from anywhere.

## Vision

Nebula Command is designed to be a universal creation platform where anyone can:
- Spin up a server and start creating in an afternoon
- Manage and deploy services without DevOps expertise
- Build websites, bots, and applications with visual tools
- Automate infrastructure with AI-powered assistance

## Features

### Dashboard (Next.js 14)
The central control panel for your entire infrastructure.

| Feature | Description |
|---------|-------------|
| **Home** | Live stats, container counts, server metrics, quick actions |
| **Services** | Docker container management (start/stop/restart/logs) |
| **Servers** | SSH-based metrics from remote servers |
| **Deploy** | One-click deployments with live log streaming |
| **Editor** | Monaco code editor with file tree navigation |
| **Designer** | Visual drag-drop website builder (14 component types) |
| **Marketplace** | One-click installation of Docker-based services |
| **Resources** | DNS/SSL management with Cloudflare integration |
| **AI Agents** | Configurable AI assistants (Jarvis, Coder, Creative, DevOps) |
| **Incidents** | Service health monitoring and auto-remediation |
| **Terminal** | Web-based SSH terminal access |

### Discord Bot
Full-featured community management bot.

| Feature | Description |
|---------|-------------|
| Tickets | Support ticket system with transcripts |
| Welcome Cards | Custom welcome images with @napi-rs/canvas |
| Stream Notifications | Go-live alerts for Twitch/YouTube/Kick |
| AutoMod | Automated content moderation |
| XP/Leveling | Member engagement tracking |
| Economy | Virtual currency system |
| Music | Play music with discord-player |

### Stream Bot
Multi-platform streaming management.

| Feature | Description |
|---------|-------------|
| Platform Connections | OAuth for Twitch, YouTube, Kick, Spotify |
| Stream Info Editor | Edit title/game/tags across all platforms |
| OBS Overlays | Now Playing, alerts, chat overlays |
| AI Content | Generate titles, descriptions, social posts |
| Clips | Clip management with social sharing |

## Quick Start (New Users)

### Option 1: Deploy to Linode (Recommended)

1. **Create a Linode server** (Ubuntu 22.04, 4GB RAM minimum)

2. **SSH into your server:**
```bash
ssh root@YOUR_SERVER_IP
```

3. **Install Docker:**
```bash
curl -fsSL https://get.docker.com | sh
```

4. **Clone the repository:**
```bash
mkdir -p /opt/homelab
cd /opt/homelab
git clone https://github.com/YOUR_USERNAME/HomeLabHub.git
cd HomeLabHub
```

5. **Create environment file:**
```bash
cp deploy/linode/.env.example deploy/linode/.env
nano deploy/linode/.env
```

6. **Add your secrets** (see Environment Variables section below)

7. **Deploy:**
```bash
cd deploy/linode
./deploy.sh
```

8. **Access your dashboard** at `http://YOUR_SERVER_IP:5000`

### Option 2: Development in Replit

1. Fork this repository
2. Import into Replit
3. Add secrets in the Secrets tab (see Environment Variables)
4. Run - all services start automatically

## Environment Variables

### Required Secrets

Create a `.env` file with these values:

```env
# Database (required)
DATABASE_URL=postgresql://user:password@host:5432/database

# Discord Bot (if using)
DISCORD_BOT_TOKEN=your_bot_token
DISCORD_CLIENT_ID=your_client_id
DISCORD_CLIENT_SECRET=your_client_secret

# Streaming Platforms (if using Stream Bot)
TWITCH_CLIENT_ID=your_twitch_client_id
TWITCH_CLIENT_SECRET=your_twitch_secret
YOUTUBE_API_KEY=your_youtube_api_key
YOUTUBE_CLIENT_ID=your_youtube_client_id
YOUTUBE_CLIENT_SECRET=your_youtube_secret
KICK_CLIENT_ID=your_kick_client_id

# Spotify (for music features)
SPOTIFY_CLIENT_ID=your_spotify_client_id
SPOTIFY_CLIENT_SECRET=your_spotify_secret

# AI Features
OPENAI_API_KEY=your_openai_key

# DNS Management (optional)
CLOUDFLARE_API_TOKEN=your_cloudflare_token

# Security
SESSION_SECRET=generate_a_random_32_char_string
```

### Getting API Keys

| Service | Where to Get |
|---------|--------------|
| Discord | [Discord Developer Portal](https://discord.com/developers/applications) |
| Twitch | [Twitch Developer Console](https://dev.twitch.tv/console) |
| YouTube | [Google Cloud Console](https://console.cloud.google.com/) |
| Spotify | [Spotify Developer Dashboard](https://developer.spotify.com/dashboard) |
| OpenAI | [OpenAI Platform](https://platform.openai.com/api-keys) |
| Cloudflare | [Cloudflare Dashboard](https://dash.cloudflare.com/profile/api-tokens) |

## Architecture

```
nebula-command/
├── services/
│   ├── dashboard-next/     # Next.js 14 Dashboard (TypeScript, shadcn/ui)
│   │   ├── app/            # Next.js App Router pages
│   │   ├── components/     # React components
│   │   ├── lib/            # Utilities, database, API helpers
│   │   └── server/         # Terminal server
│   ├── discord-bot/        # Discord.js Bot (Node.js)
│   │   ├── src/            # Bot source code
│   │   ├── commands/       # Slash commands
│   │   └── events/         # Discord event handlers
│   └── stream-bot/         # Streaming Platform (Node.js, Vite)
│       ├── src/            # Backend source
│       └── client/         # React frontend
├── deploy/
│   ├── linode/             # Cloud deployment (docker-compose)
│   └── local/              # Local Ubuntu deployment
├── orchestration/
│   ├── runbooks/           # Auto-remediation scripts
│   └── service-map.yml     # Service discovery configuration
└── docs/                   # Documentation
```

## Database

PostgreSQL with Drizzle ORM. Schema includes:

- **projects** - Development projects
- **deployments** - Deployment history
- **marketplace_packages** - Available services to install
- **installations** - Installed services
- **agents** - AI assistant configurations
- **incidents** - Service health incidents
- **domains** - DNS/SSL managed domains

Run migrations:
```bash
cd services/dashboard-next
npm run db:push
```

## Customization

### Adding Your Own Services

1. Add a new package to the marketplace:
   - Go to Dashboard > Marketplace
   - Create a custom package with Docker compose configuration

2. Create a custom AI agent:
   - Go to Dashboard > AI Agents
   - Click "Create Agent"
   - Configure system prompt and capabilities

3. Add custom domains:
   - Go to Dashboard > Resources
   - Add your domain and configure DNS records
   - SSL is managed automatically via Cloudflare

### Modifying the Discord Bot

Edit files in `services/discord-bot/`:
- `src/commands/` - Add new slash commands
- `src/events/` - Handle Discord events
- `src/modules/` - Add new features

### Modifying the Stream Bot

Edit files in `services/stream-bot/`:
- `src/routes/` - API endpoints
- `client/src/` - React frontend
- `src/services/` - Platform integrations

## Production Deployment

### Linode Cloud
```bash
ssh root@YOUR_LINODE_IP
cd /opt/homelab/HomeLabHub/deploy/linode
./deploy.sh
```

### Local Ubuntu Server
```bash
ssh user@YOUR_SERVER_IP
cd /opt/homelab/HomeLabHub/deploy/local
./deploy.sh
```

## Ports

| Service | Port | Description |
|---------|------|-------------|
| Dashboard | 5000 | Main web interface |
| Discord Bot | 4000 | Bot API & dashboard |
| Stream Bot | 3000 | Streaming platform |
| Terminal Server | 5001 | SSH terminal WebSocket |

## Tech Stack

| Layer | Technology |
|-------|------------|
| Frontend | Next.js 14, React, Vite, TypeScript |
| UI | shadcn/ui, Tailwind CSS, Radix UI |
| Backend | Node.js, Express |
| Database | PostgreSQL, Drizzle ORM |
| Cache | Redis |
| Auth | JWT sessions, OAuth 2.0/2.1 (PKCE) |
| AI | OpenAI GPT-4 |
| Deployment | Docker, Docker Compose |
| Reverse Proxy | Caddy (auto-SSL) |
| Network | Tailscale (optional secure mesh) |

## Security

- JWT-signed sessions (HMAC-SHA256)
- All API routes require authentication
- SSH keys accessed server-side only
- OAuth tokens encrypted at rest
- Rate limiting on all endpoints

## Testing

```bash
# Stream Bot
cd services/stream-bot
npm test

# Discord Bot
cd services/discord-bot
npm test
```

## Troubleshooting

### Dashboard won't start
- Check DATABASE_URL is set correctly
- Run `npm install` in services/dashboard-next
- Check logs: `docker logs homelab-dashboard`

### Discord Bot not connecting
- Verify DISCORD_BOT_TOKEN is correct
- Check bot has proper gateway intents enabled
- Ensure bot is invited to your server

### Database errors
- Run `npm run db:push` to sync schema
- Check PostgreSQL is accessible

## Contributing

1. Fork the repository
2. Create a feature branch
3. Make changes and test
4. Submit a pull request

## License

Private repository - All rights reserved.

---

**Nebula Command** - Create, Deploy, and Manage Anything
