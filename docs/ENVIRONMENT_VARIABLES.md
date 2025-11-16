# Environment Variables Reference

Complete documentation of all environment variables used in the Homelab Dashboard ecosystem.

---

## Table of Contents

1. [System Configuration](#system-configuration)
2. [Database Configuration](#database-configuration)
3. [Discord Bot](#discord-bot)
4. [Stream Bot](#stream-bot)
5. [Dashboard / Jarvis](#dashboard--jarvis)
6. [VNC Desktop](#vnc-desktop)
7. [Code Server](#code-server)
8. [Plex Media Server](#plex-media-server)
9. [Home Assistant](#home-assistant)
10. [MinIO Object Storage](#minio-object-storage)
11. [Optional Services](#optional-services)
12. [Security Best Practices](#security-best-practices)

---

## System Configuration

### SERVICE_USER
- **Required**: Yes
- **Default**: `evin`
- **Description**: System user that runs the services
- **Example**: `SERVICE_USER=evin`
- **Security**: No special requirements

### COMPOSE_PROJECT_DIR
- **Required**: No (auto-detected)
- **Default**: `/home/evin/contain/HomeLabHub`
- **Description**: Root directory of the project
- **Example**: `COMPOSE_PROJECT_DIR=/home/evin/contain/HomeLabHub`

---

## Database Configuration

### DISCORD_DB_PASSWORD
- **Required**: Yes
- **Default**: (auto-generated)
- **Description**: Password for Discord Bot PostgreSQL database
- **Example**: `DISCORD_DB_PASSWORD=r4nd0m_s3cur3_p4ssw0rd`
- **Security**: ⚠️ **HIGH** - Use strong password (20+ chars, random)

### STREAMBOT_DB_PASSWORD
- **Required**: Yes
- **Default**: (auto-generated)
- **Description**: Password for Stream Bot PostgreSQL database
- **Example**: `STREAMBOT_DB_PASSWORD=4n0th3r_s3cur3_p4ssw0rd`
- **Security**: ⚠️ **HIGH** - Use strong password (20+ chars, random)

### JARVIS_DB_PASSWORD
- **Required**: Yes
- **Default**: (auto-generated)
- **Description**: Password for Jarvis (Dashboard) PostgreSQL database
- **Example**: `JARVIS_DB_PASSWORD=j4rv1s_s3cur3_p4ss`
- **Security**: ⚠️ **HIGH** - Use strong password (20+ chars, random)

**Note**: All three databases run in the same PostgreSQL container (`discord-bot-db`)

---

## Discord Bot

### DISCORD_BOT_TOKEN
- **Required**: Yes
- **Description**: Discord bot authentication token
- **Where to get**: https://discord.com/developers/applications
- **Example**: `DISCORD_BOT_TOKEN=MTIzNDU2Nzg5MDEyMzQ1Njc4.GaBcDe.FgHiJkLmNoPqRsTuVwXyZ1234567890`
- **Security**: ⚠️ **CRITICAL** - Never commit to Git, rotate if exposed

### DISCORD_CLIENT_ID
- **Required**: Yes
- **Description**: Discord application client ID
- **Where to get**: Discord Developer Portal → Your App → OAuth2
- **Example**: `DISCORD_CLIENT_ID=1234567890123456789`

### DISCORD_CLIENT_SECRET
- **Required**: Yes
- **Description**: Discord OAuth2 client secret
- **Where to get**: Discord Developer Portal → Your App → OAuth2
- **Example**: `DISCORD_CLIENT_SECRET=aBcDeFgHiJkLmNoPqRsTuVwXyZ123456`
- **Security**: ⚠️ **HIGH** - Never share, rotate if exposed

### DISCORD_APP_ID
- **Required**: Yes
- **Description**: Discord application ID (same as CLIENT_ID usually)
- **Example**: `DISCORD_APP_ID=1234567890123456789`

### VITE_DISCORD_CLIENT_ID
- **Required**: Yes (frontend)
- **Description**: Client ID for frontend OAuth flow
- **Example**: `VITE_DISCORD_CLIENT_ID=1234567890123456789`

### DISCORD_SESSION_SECRET
- **Required**: Yes
- **Default**: (auto-generated)
- **Description**: Secret for encrypting session cookies
- **Example**: `DISCORD_SESSION_SECRET=random_64_character_string_here_1234567890abcdef`
- **Security**: ⚠️ **HIGH** - Random 64+ character string

### RESET_DB
- **Required**: No
- **Default**: `false`
- **Description**: Reset Discord bot database on startup (DESTRUCTIVE!)
- **Example**: `RESET_DB=false`
- **Security**: ⚠️ **WARNING** - Only use in development

---

## Stream Bot

### STREAMBOT_SESSION_SECRET
- **Required**: Yes
- **Default**: (auto-generated)
- **Description**: Secret for encrypting session cookies
- **Example**: `STREAMBOT_SESSION_SECRET=another_random_64_char_string_abcdef1234567890`
- **Security**: ⚠️ **HIGH** - Random 64+ character string

### STREAMBOT_OPENAI_API_KEY
- **Required**: Yes (for AI features)
- **Description**: OpenAI API key for AI chatbot personalities
- **Where to get**: https://platform.openai.com/api-keys
- **Example**: `STREAMBOT_OPENAI_API_KEY=sk-proj-abcdefghijklmnopqrstuvwxyz1234567890`
- **Security**: ⚠️ **CRITICAL** - Billable resource, never expose

### STREAMBOT_OPENAI_BASE_URL
- **Required**: No
- **Default**: `https://api.openai.com/v1`
- **Description**: OpenAI API base URL (for proxies/alternatives)
- **Example**: `STREAMBOT_OPENAI_BASE_URL=https://api.openai.com/v1`

### STREAMBOT_NODE_ENV
- **Required**: No
- **Default**: `production`
- **Description**: Node environment (development/production)
- **Example**: `STREAMBOT_NODE_ENV=production`

### STREAMBOT_PORT
- **Required**: No
- **Default**: `5000`
- **Description**: Internal port for Stream Bot service
- **Example**: `STREAMBOT_PORT=5000`

### TWITCH_CLIENT_ID
- **Required**: Yes (for Twitch integration)
- **Description**: Twitch application client ID
- **Where to get**: https://dev.twitch.tv/console/apps
- **Example**: `TWITCH_CLIENT_ID=abcdefghijklmnopqrstuvwxyz123456`

### TWITCH_CLIENT_SECRET
- **Required**: Yes (for Twitch integration)
- **Description**: Twitch application client secret
- **Where to get**: Twitch Developer Console
- **Example**: `TWITCH_CLIENT_SECRET=1234567890abcdefghijklmnopqrstuv`
- **Security**: ⚠️ **HIGH** - Never share

### YOUTUBE_CLIENT_ID
- **Required**: No (for YouTube integration)
- **Description**: Google OAuth2 client ID for YouTube
- **Where to get**: Google Cloud Console → APIs & Services → Credentials
- **Example**: `YOUTUBE_CLIENT_ID=123456789012-abcdefghijklmnopqrstuvwxyz.apps.googleusercontent.com`

### YOUTUBE_CLIENT_SECRET
- **Required**: No (for YouTube integration)
- **Description**: Google OAuth2 client secret
- **Example**: `YOUTUBE_CLIENT_SECRET=GOCSPX-abcdefghijklmnopqrstuvwx`
- **Security**: ⚠️ **HIGH**

### KICK_CLIENT_ID
- **Required**: No (for Kick integration)
- **Description**: Kick.com API client ID
- **Example**: `KICK_CLIENT_ID=kick_client_id_here`

### KICK_CLIENT_SECRET
- **Required**: No (for Kick integration)
- **Description**: Kick.com API client secret
- **Example**: `KICK_CLIENT_SECRET=kick_secret_here`
- **Security**: ⚠️ **HIGH**

### VITE_CUSTOM_WS_URL
- **Required**: No
- **Description**: Custom WebSocket URL for frontend
- **Example**: `VITE_CUSTOM_WS_URL=wss://stream.rig-city.com`

---

## Dashboard / Jarvis

### OPENAI_API_KEY
- **Required**: Yes (for Jarvis AI)
- **Description**: OpenAI API key for Jarvis autonomous AI agent
- **Where to get**: https://platform.openai.com/api-keys
- **Example**: `OPENAI_API_KEY=sk-proj-xyz123abc456def789ghi012jkl345mno678pqr901stu234`
- **Security**: ⚠️ **CRITICAL** - Billable resource

### REDIS_URL
- **Required**: Yes
- **Default**: `redis://redis:6379/0`
- **Description**: Redis connection URL for Celery task queue
- **Example**: `REDIS_URL=redis://redis:6379/0`

### MINIO_ENDPOINT
- **Required**: Yes
- **Default**: `minio:9000`
- **Description**: MinIO S3-compatible object storage endpoint
- **Example**: `MINIO_ENDPOINT=minio:9000`

### FLASK_ENV
- **Required**: No
- **Default**: `production`
- **Description**: Flask environment mode
- **Example**: `FLASK_ENV=production`

---

## VNC Desktop

### VNC_PASSWORD
- **Required**: Yes
- **Description**: Password for VNC remote desktop access
- **Example**: `VNC_PASSWORD=SecureVNCPassword123!`
- **Security**: ⚠️ **HIGH** - Strong password required (12+ chars)

### VNC_USER_PASSWORD
- **Required**: Yes
- **Description**: Password for `evin` user inside VNC desktop
- **Example**: `VNC_USER_PASSWORD=UserPassword456!`
- **Security**: ⚠️ **MEDIUM** - Standard user password

---

## Code Server

### CODE_SERVER_PASSWORD
- **Required**: Yes
- **Description**: Password for VS Code web interface
- **Example**: `CODE_SERVER_PASSWORD=CodeServerPass789!`
- **Security**: ⚠️ **HIGH** - Protects full IDE access

---

## Plex Media Server

### PLEX_CLAIM
- **Required**: Yes (first time setup)
- **Description**: Claim token to link Plex server to your account
- **Where to get**: https://www.plex.tv/claim/ (valid for 4 minutes)
- **Example**: `PLEX_CLAIM=claim-AbCdEfGhIjKlMnOpQrStUvWxYz`
- **Security**: ⚠️ **MEDIUM** - Expires after 4 minutes, one-time use

**Note**: After initial setup, this can be removed from .env

---

## Home Assistant

### HOME_ASSISTANT_API_KEY
- **Required**: No (optional integration)
- **Description**: Long-lived access token for Home Assistant API
- **Where to get**: Home Assistant → Profile → Long-Lived Access Tokens
- **Example**: `HOME_ASSISTANT_API_KEY=eyJ0eXAiOiJKV1QiLCJhbGciOiJIUzI1NiJ9...`
- **Security**: ⚠️ **HIGH** - Full Home Assistant control

---

## MinIO Object Storage

### MINIO_ROOT_USER
- **Required**: Yes
- **Default**: `admin`
- **Description**: MinIO admin username
- **Example**: `MINIO_ROOT_USER=admin`

### MINIO_ROOT_PASSWORD
- **Required**: Yes
- **Default**: (auto-generated)
- **Description**: MinIO admin password
- **Example**: `MINIO_ROOT_PASSWORD=minio_secure_password_123`
- **Security**: ⚠️ **HIGH** - Strong password (16+ chars)

---

## Optional Services

### REPLIT_DEV_DOMAIN
- **Required**: No (Replit only)
- **Description**: Auto-set by Replit for development
- **Example**: `REPLIT_DEV_DOMAIN=homelab-hub.username.repl.co`

---

## Security Best Practices

### Password Generation

Generate strong passwords using:

```bash
# Random 32-character password
openssl rand -base64 32

# Random 64-character password for session secrets
openssl rand -hex 64
```

### Required Security Levels

| Security Level | Requirements |
|---------------|--------------|
| **CRITICAL** | 32+ chars, never expose, rotate quarterly |
| **HIGH** | 20+ chars, never commit to Git, rotate yearly |
| **MEDIUM** | 12+ chars, standard password practices |

### Secrets Management

**✅ DO:**
- Use `.env` file (git-ignored)
- Generate strong random passwords
- Rotate credentials regularly
- Use different passwords for each service
- Keep backup of `.env` in secure location

**❌ DON'T:**
- Commit `.env` to Git
- Share credentials in plain text
- Reuse passwords across services
- Use default passwords
- Store in unsecured locations

### Environment File Template

Create `.env.example` for reference:

```bash
# Copy to .env and fill in values
cp .env.example .env

# Never commit .env
echo ".env" >> .gitignore
```

---

## Validation

Validate your environment setup:

```bash
# Check all required variables
./deployment/check-all-env.sh

# Validate passwords are strong
./deployment/validate-env.sh
```

---

## Quick Reference

### Minimal Required Variables

For a basic deployment, you **must** set:

```bash
SERVICE_USER=evin
DISCORD_DB_PASSWORD=<random>
STREAMBOT_DB_PASSWORD=<random>
JARVIS_DB_PASSWORD=<random>
DISCORD_BOT_TOKEN=<from-discord>
DISCORD_CLIENT_ID=<from-discord>
DISCORD_CLIENT_SECRET=<from-discord>
DISCORD_APP_ID=<from-discord>
DISCORD_SESSION_SECRET=<random-64-chars>
TWITCH_CLIENT_ID=<from-twitch>
TWITCH_CLIENT_SECRET=<from-twitch>
STREAMBOT_SESSION_SECRET=<random-64-chars>
OPENAI_API_KEY=<from-openai>
VNC_PASSWORD=<strong-password>
VNC_USER_PASSWORD=<strong-password>
CODE_SERVER_PASSWORD=<strong-password>
PLEX_CLAIM=<from-plex.tv/claim>
MINIO_ROOT_PASSWORD=<strong-password>
```

---

**Last Updated**: November 2025  
**Version**: 2.0.0
