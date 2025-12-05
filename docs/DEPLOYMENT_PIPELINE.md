# Deployment Pipeline Guide

> Simple, one-click deployment from Replit to production.

## Important Notes

- **Tests are enforced** - Deployment will only proceed if all tests pass
- **In Replit** - Git operations may be restricted; the deploy script will use the GitHub API instead
- **Required secrets** - Make sure GitHub Actions secrets are configured (see below)

## Quick Start

### One-Click Deploy

From Replit, run:
```bash
npm run deploy
```

> **Note**: In Replit, if git push fails, you'll need to either:
> 1. Use the Git pane in Replit sidebar to commit and push
> 2. Set `GITHUB_TOKEN` to enable API-based deployment
> 3. Trigger the workflow manually from GitHub Actions

This will:
1. Run all tests
2. Push code to GitHub
3. Trigger automated deployment
4. Deploy to your Linode server
5. Run health checks
6. Rollback automatically if anything fails

### Other Commands

| Command | Description |
|---------|-------------|
| `npm run deploy` | Full deployment (test → push → deploy) |
| `npm run deploy:test` | Run tests only |
| `npm run deploy:push` | Push to GitHub only |
| `npm run deploy:status` | Check deployment status |
| `npm run deploy:health` | Run health checks |

---

## Environment Sync

Keep your secrets in sync between Replit and production.

### Check Status
```bash
npm run env:status
```

### Validate Environment
```bash
npm run env:validate
```

### Pull from Production
```bash
npm run env:pull
```

### Push to Production
```bash
npm run env:push
```

---

## Required Secrets

### In Replit (Secrets Tab)

These are set in the Replit "Secrets" tab:

| Secret | Description |
|--------|-------------|
| `DATABASE_URL` | PostgreSQL connection string |
| `SESSION_SECRET` | Flask session secret |
| `DISCORD_BOT_TOKEN` | Discord bot token |
| `TWITCH_CLIENT_ID` | Twitch API client ID |
| `TWITCH_CLIENT_SECRET` | Twitch API client secret |
| `OPENAI_API_KEY` | OpenAI API key (or via integration) |

### In GitHub (Repository Secrets) - REQUIRED

These secrets **must** be set in GitHub → Settings → Secrets → Actions for deployment to work:

| Secret | Description | Example |
|--------|-------------|---------|
| `PROD_SERVER_HOST` | Linode server IP or Tailscale hostname | `100.64.0.1` |
| `PROD_SERVER_USER` | SSH username | `evin` |
| `PROD_SSH_KEY` | SSH private key (ed25519 recommended) | Full key contents |
| `PROD_PROJECT_PATH` | Path to project on server | `/home/evin/contain/HomeLabHub` |

### Optional GitHub Secrets (for local Ubuntu deployment)

| Secret | Description |
|--------|-------------|
| `LOCAL_SERVER_HOST` | Local Ubuntu server Tailscale IP |
| `LOCAL_SERVER_USER` | Local SSH username |
| `LOCAL_SSH_KEY` | Local SSH private key |
| `LOCAL_PROJECT_PATH` | Local project path |

### Setting Up SSH Key

1. Generate a deployment key:
   ```bash
   ssh-keygen -t ed25519 -f ~/.ssh/deploy_key -N ""
   ```

2. Add public key to server:
   ```bash
   ssh-copy-id -i ~/.ssh/deploy_key.pub evin@your-server
   ```

3. Copy private key contents to GitHub secret `PROD_SSH_KEY`:
   ```bash
   cat ~/.ssh/deploy_key
   ```

---

## How It Works

### Development Flow

```
┌─────────────────────────────────────────────────────────────────────┐
│                         DEVELOPMENT                                   │
│                                                                       │
│   Replit IDE  ──────────►  npm run deploy  ──────────►  GitHub       │
│       │                         │                           │        │
│       │                         ▼                           │        │
│       │                    Run Tests                        │        │
│       │                         │                           │        │
│       │                         ▼                           │        │
│       │                    Git Push                         │        │
│       │                         │                           │        │
│       │                         ▼                           │        │
│       │              GitHub Actions Triggered               │        │
│                                                                       │
└─────────────────────────────────────────────────────────────────────┘
                                   │
                                   ▼
┌─────────────────────────────────────────────────────────────────────┐
│                        GITHUB ACTIONS                                 │
│                                                                       │
│   ┌──────────┐    ┌─────────────┐    ┌─────────────┐                │
│   │  Tests   │───►│ Deploy Cloud│───►│Deploy Local │                │
│   └──────────┘    │  (Linode)   │    │  (Ubuntu)   │                │
│                   └─────────────┘    └─────────────┘                │
│                         │                   │                        │
│                         ▼                   ▼                        │
│                   Health Check         Health Check                  │
│                         │                   │                        │
│                         ▼                   ▼                        │
│                   Auto-Rollback        Auto-Rollback                 │
│                   (on failure)         (on failure)                  │
│                                                                       │
└─────────────────────────────────────────────────────────────────────┘
```

### Service Architecture

```
                    LINODE CLOUD                    LOCAL UBUNTU
                    ────────────                    ────────────
                    
                    ┌──────────────┐                ┌──────────────┐
                    │  Dashboard   │                │    Plex      │
                    │   (Flask)    │                │              │
                    └──────────────┘                └──────────────┘
                    
                    ┌──────────────┐                ┌──────────────┐
                    │ Discord Bot  │                │Home Assistant│
                    │  (Node.js)   │                │              │
                    └──────────────┘                └──────────────┘
                    
                    ┌──────────────┐                ┌──────────────┐
                    │ Stream Bot   │                │    MinIO     │
                    │  (Node.js)   │                │              │
                    └──────────────┘                └──────────────┘
                    
                    ┌──────────────┐
                    │ PostgreSQL   │
                    │    Redis     │
                    │    Caddy     │
                    └──────────────┘
```

---

## Troubleshooting

### Deployment Failed

1. Check GitHub Actions logs:
   ```
   https://github.com/YOUR_REPO/actions
   ```

2. Check service health:
   ```bash
   npm run deploy:health
   ```

3. SSH to production and check logs:
   ```bash
   ssh evin@your-linode-ip
   cd /home/evin/contain/HomeLabHub
   docker compose logs --tail 50
   ```

### Tests Failing

Run tests locally to see details:
```bash
npm run deploy:test
```

### SSH Connection Failed

Make sure:
1. Tailscale is connected: `tailscale status`
2. SSH key is in GitHub secrets
3. Server is accessible: `ssh user@host`

### Rollback

Rollback happens automatically on health check failure. To rollback manually:
```bash
ssh evin@your-linode-ip
cd /home/evin/contain/HomeLabHub
./scripts/rollback.sh all [backup-name]
```

---

## Manual Deployment

If you need to deploy manually (without GitHub Actions):

```bash
# SSH to server
ssh evin@your-linode-ip

# Navigate to project
cd /home/evin/contain/HomeLabHub

# Pull latest code
git pull origin main

# Deploy all services
./scripts/deploy.sh all

# Or deploy specific service
./scripts/deploy.sh dashboard
```

---

## Adding New Services

1. Create Dockerfile in `services/your-service/`
2. Add to `docker-compose.yml`
3. Add health check endpoint at `/health`
4. Update `scripts/deploy.sh` if needed
5. Add to GitHub Actions workflow

---

*Last Updated: December 2024*
