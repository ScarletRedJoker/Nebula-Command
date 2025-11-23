# Homelab Integration Setup Guide

This guide explains how to complete the setup of external integrations for your homelab services.

## 🎯 Current Status

### ✅ Fully Implemented (Code Complete)
All integration code is production-ready and waiting for configuration:

1. **Google Workspace** (Calendar, Gmail, Drive) - Dashboard
2. **Stream Platforms** (Spotify, Twitch, YouTube) - Stream Bot  
3. **Notification System** (Discord, Email, Webhooks) - All Services
4. **OpenAI** - Already active throughout system

### 📋 What Needs Configuration

**For production deployment**, you need to provide OAuth credentials and authorization.

---

## 🔐 Notification System Setup

The homelab now sends alerts for:
- Storage threshold violations
- OAuth token expiration

### Required Environment Variables

Add these to your `.env` file (all optional, enable what you need):

```bash
# Service Authentication (REQUIRED for notifications)
SERVICE_AUTH_TOKEN=<generate-with-openssl-rand-hex-32>

# Notification Channels (all optional)
DISCORD_WEBHOOK_URL=https://discord.com/api/webhooks/YOUR_WEBHOOK_ID/YOUR_WEBHOOK_TOKEN
NOTIFICATION_EMAIL=your-email@example.com
GENERIC_WEBHOOK_URL=https://your-service.com/webhook
```

### Generate Service Auth Token

```bash
# Generate secure random token
openssl rand -hex 32

# Add to .env
echo "SERVICE_AUTH_TOKEN=<your-generated-token>" >> .env
```

### Create Discord Webhook

1. Open Discord server settings
2. Go to **Integrations** → **Webhooks**
3. Click **New Webhook**
4. Name it "Homelab Alerts"
5. Copy webhook URL
6. Add to `.env` as `DISCORD_WEBHOOK_URL`

### Configure Email Notifications

Email notifications use the Gmail integration (see Google Workspace setup below).

Set `NOTIFICATION_EMAIL` to the address where you want to receive alerts.

### Test Notifications

After configuration:

```bash
# Restart services
./homelab restart

# Trigger a test storage alert (if threshold configured)
# Notifications will fire automatically when thresholds exceeded
```

---

## 🌐 Google Workspace Integration Setup

The dashboard has full Google Calendar, Gmail, and Drive integration implemented.

### Current Implementation

**Files:**
- `services/dashboard/services/google/calendar_service.py` ✅ Complete
- `services/dashboard/services/google/gmail_service.py` ✅ Complete  
- `services/dashboard/services/google/drive_service.py` ✅ Complete
- `services/dashboard/services/google/google_client.py` ✅ Complete

**Features:**
- Calendar event management and automation triggers
- Email notifications via Gmail API
- Drive backup management
- Automatic token refresh with Redis caching

### Setup Required (Replit Only)

**⚠️ Note:** Google integrations use Replit Connectors, which are only available in the Replit environment.

If you're running this on Replit:

1. Go to Replit **Secrets** tab
2. Find the following integrations:
   - `connection:conn_google-calendar_*`
   - `connection:conn_google-mail_*`  
   - `connection:conn_google-drive_*`
3. Click **"Connect"** on each one
4. Authorize with your Google account
5. Grant the requested permissions

Once connected, the dashboard will automatically use these credentials.

### Verification

Navigate to `/google` in the dashboard to view connection status and manage integrations.

---

## 🎬 Stream Platform Integration Setup

The stream-bot has complete OAuth implementations for Spotify, Twitch, and YouTube.

### Current Implementation

**Files:**
- `services/stream-bot/server/oauth-spotify.ts` ✅ Complete
- `services/stream-bot/server/oauth-twitch.ts` ✅ Complete
- `services/stream-bot/server/oauth-youtube.ts` ✅ Complete
- `services/stream-bot/server/token-refresh-service.ts` ✅ Complete

**Features:**
- Full OAuth 2.0 PKCE flow implementation
- Automatic token refresh with exponential backoff
- Encrypted token storage in database
- Comprehensive error handling and logging
- User notifications on token expiry

### Setup Steps

#### 1. Create OAuth Applications

##### Spotify

1. Go to [Spotify Developer Dashboard](https://developer.spotify.com/dashboard)
2. Click **"Create App"**
3. Fill in:
   - **App Name**: Homelab Stream Bot
   - **App Description**: Stream integration for homelab  
   - **Redirect URI**: `https://homelab.yourdomain.com/auth/spotify/callback`
4. Note **Client ID** and **Client Secret**

##### Twitch

1. Go to [Twitch Developer Console](https://dev.twitch.tv/console/apps)
2. Click **"Register Your Application"**
3. Fill in:
   - **Name**: Homelab Stream Bot
   - **OAuth Redirect URL**: `https://homelab.yourdomain.com/auth/twitch/callback`
   - **Category**: Website Integration
4. Note **Client ID** and **Client Secret**

##### YouTube

1. Go to [Google Cloud Console](https://console.cloud.google.com/)
2. Create new project or select existing
3. Enable **YouTube Data API v3**
4. Go to **Credentials** → **Create Credentials** → **OAuth 2.0 Client ID**
5. Configure OAuth consent screen
6. Create **Web application** credential
7. Add authorized redirect URI: `https://homelab.yourdomain.com/auth/youtube/callback`
8. Note **Client ID** and **Client Secret**

#### 2. Configure Environment Variables

Add to your `.env` file:

```bash
# Spotify OAuth
SPOTIFY_CLIENT_ID=your_spotify_client_id
SPOTIFY_CLIENT_SECRET=your_spotify_client_secret
SPOTIFY_REDIRECT_URI=https://homelab.yourdomain.com/auth/spotify/callback

# Twitch OAuth
TWITCH_CLIENT_ID=your_twitch_client_id
TWITCH_CLIENT_SECRET=your_twitch_client_secret
TWITCH_REDIRECT_URI=https://homelab.yourdomain.com/auth/twitch/callback

# YouTube OAuth
YOUTUBE_CLIENT_ID=your_youtube_client_id
YOUTUBE_CLIENT_SECRET=your_youtube_client_secret
YOUTUBE_REDIRECT_URI=https://homelab.yourdomain.com/auth/youtube/callback
```

#### 3. Update Docker Compose

The environment variables are already configured in `docker-compose.yml` to read from `.env`:

```yaml
stream-bot:
  environment:
    - SPOTIFY_REDIRECT_URI=${SPOTIFY_REDIRECT_URI}
    - TWITCH_REDIRECT_URI=${TWITCH_REDIRECT_URI}
    - YOUTUBE_REDIRECT_URI=${YOUTUBE_REDIRECT_URI}
    # Secrets loaded from env_file
  env_file:
    - .env
```

#### 4. Restart Services

```bash
# Restart stream-bot to load new credentials
docker-compose restart stream-bot

# Or full restart
./homelab restart
```

#### 5. Connect Accounts

1. Log into stream-bot frontend
2. Go to **Settings** page
3. Click **"Connect Spotify"**, **"Connect Twitch"**, or **"Connect YouTube"**
4. Authorize the application
5. You'll be redirected back to settings with connection confirmed

### Token Management

The system automatically:
- Refreshes tokens before expiry (5-minute buffer)
- Retries failed requests with exponential backoff
- Stores tokens encrypted in database
- Sends notifications when re-authentication needed

---

## 🧪 Testing & Verification

### Check Integration Status

```bash
# View all service logs
./homelab logs

# Check stream-bot specifically
docker-compose logs stream-bot | tail -100

# Check dashboard
docker-compose logs homelab-dashboard | tail -100
```

### Expected Log Messages

**Stream-Bot OAuth Success:**
```
[Spotify OAuth] ✓ Successfully connected Spotify for user 1
[Twitch OAuth] ✓ Successfully connected user 1 to Twitch (@username)
[YouTube OAuth] ✓ Successfully connected YouTube for user 1
```

**Token Refresh Service:**
```
[TokenRefresh] Starting token refresh service...
[TokenRefresh] Checking 3 platform connections...
[TokenRefresh] No tokens need refreshing
```

**Storage Alerts:**
```
[Storage Worker] ⚠️ Storage alert: /mnt/data at 87.3% (threshold: 85.0%)
[NotificationService] ✓ Successfully sent storage alert to Discord
[NotificationService] ✓ Successfully sent storage alert via Email
```

### Troubleshooting

#### OAuth Redirect Mismatch

**Error**: `redirect_uri_mismatch`

**Fix**: Ensure redirect URIs in OAuth app configuration match exactly what's in `.env`

#### Token Refresh Failures

**Error**: `[OAuth] ✗ Token has been revoked`

**Fix**: User needs to reconnect platform in settings page

#### No Notifications Sent

**Possible Causes**:
- SERVICE_AUTH_TOKEN not set
- Discord webhook URL invalid
- Gmail integration not connected

**Check**: Review logs for notification service errors

---

## 📊 Feature Summary

| Feature | Status | Requires User Action |
|---------|--------|---------------------|
| Database migrations | ✅ Working | None - automatic |
| Storage monitoring | ✅ Working | Optional: notification config |
| Storage alerts | ✅ Implemented | Optional: notification config |
| Token refresh | ✅ Working | OAuth credentials |
| Google Calendar | ✅ Code ready | Replit connector auth |
| Google Gmail | ✅ Code ready | Replit connector auth |
| Google Drive | ✅ Code ready | Replit connector auth |
| Spotify OAuth | ✅ Code ready | OAuth app + credentials |
| Twitch OAuth | ✅ Code ready | OAuth app + credentials |
| YouTube OAuth | ✅ Code ready | OAuth app + credentials |
| Discord notifications | ✅ Implemented | Webhook URL |
| Email notifications | ✅ Implemented | Gmail integration |
| Generic webhooks | ✅ Implemented | Webhook URL |

---

## 🚀 Deployment Checklist

Before deploying to production:

- [ ] Generate `SERVICE_AUTH_TOKEN` and add to `.env`
- [ ] (Optional) Configure Discord webhook for alerts
- [ ] (Optional) Set notification email address
- [ ] (Optional) Create Spotify OAuth app and add credentials
- [ ] (Optional) Create Twitch OAuth app and add credentials  
- [ ] (Optional) Create YouTube OAuth app and add credentials
- [ ] Update redirect URIs to match production domain
- [ ] Test all configured integrations
- [ ] Verify notification delivery
- [ ] Monitor logs for errors

---

## 🆘 Support

If you encounter issues:

1. Check logs: `./homelab logs`
2. Review environment variables in `.env`
3. Verify OAuth redirect URIs match configuration
4. Ensure services are running: `./homelab status`
5. Check database migrations completed successfully

For detailed technical documentation, see:
- `services/dashboard/services/google/` - Google integration implementation
- `services/stream-bot/server/oauth-*.ts` - OAuth implementations
- `services/dashboard/services/notification_service.py` - Notification system
- `replit.md` - Project overview and architecture
