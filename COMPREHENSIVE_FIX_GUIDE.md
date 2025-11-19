# Comprehensive Service Fix Guide

**Generated:** November 19, 2025  
**Issues Fixed:** Home Assistant, Stream-Bot OAuth, Snapple Facts, Database Migrations

---

## 🔴 Critical Issues Identified

### 1. Home Assistant Cannot Connect
**Symptom:** Dashboard shows "Unable to connect to Home Assistant"  
**Root Cause:** Missing environment variables

**Fix:**
```bash
# Run the updated environment generator
cd deployment
./generate-unified-env.sh

# When prompted for Home Assistant, provide:
# - HOME_ASSISTANT_URL: http://homeassistant:8123 (Docker) or https://home.evindrake.net (external)
# - HOME_ASSISTANT_TOKEN: <your-long-lived-access-token>
# - HOME_ASSISTANT_VERIFY_SSL: False (for internal) or True (for external HTTPS)
```

**How to Get Long-Lived Access Token:**
1. Login to your Home Assistant instance
2. Click your username (bottom left) → Profile
3. Scroll down to "Long-Lived Access Tokens"
4. Click "Create Token"
5. Give it a name (e.g., "Nebula Dashboard")
6. Copy the token immediately (it won't be shown again!)
7. Add to .env file

---

### 2. Stream-Bot OAuth Failing (Twitch/YouTube/Kick)
**Symptom:** Logs show "Login authentication failed" for Twitch  
**Root Cause:** OAuth tokens expired or missing credentials

**Fix for Twitch:**
```bash
# 1. Create/Update Twitch App at https://dev.twitch.tv/console/apps
#    Callback URL: https://stream.rig-city.com/auth/twitch/callback

# 2. Add credentials to .env:
TWITCH_CLIENT_ID=your_client_id_here
TWITCH_CLIENT_SECRET=your_client_secret_here

# 3. Restart stream-bot container:
docker-compose restart stream-bot
```

**Fix for YouTube:**
```bash
# 1. Create OAuth 2.0 Client at https://console.cloud.google.com/apis/credentials
#    Callback URL: https://stream.rig-city.com/auth/youtube/callback

# 2. Add credentials to .env:
YOUTUBE_CLIENT_ID=your_client_id
YOUTUBE_CLIENT_SECRET=your_client_secret
YOUTUBE_REDIRECT_URI=https://stream.rig-city.com/auth/youtube/callback

# 3. Enable YouTube Data API v3 in Google Cloud Console
```

**Fix for Kick:**
```bash
# 1. Get Kick API credentials (contact Kick support or use their developer portal)

# 2. Add to .env:
KICK_CLIENT_ID=your_kick_client_id
KICK_CLIENT_SECRET=your_kick_client_secret

# 3. Restart stream-bot
```

**Important:** After adding OAuth credentials, users must:
1. Visit https://stream.rig-city.com
2. Login and go to Settings
3. Click "Connect" for each platform (Twitch/YouTube/Kick)
4. Complete OAuth authorization flow
5. Verify connection status shows "Connected"

---

### 3. Snapple Facts Not Displaying
**Symptom:** Facts aren't being posted to stream chat  
**Root Cause:** Multiple possible causes

**Diagnostic Checklist:**
```bash
# 1. Verify OpenAI API is configured
grep AI_INTEGRATIONS_OPENAI_API_KEY .env

# 2. Check stream-bot logs for fact generation errors
docker logs stream-bot | grep -i "fact\|openai\|error"

# 3. Verify bot instance is running
docker exec stream-bot cat /app/logs/*.log | grep "BotWorker"
```

**Fix Steps:**

**Step 1: Verify OpenAI Configuration**
```bash
# Add to .env if missing:
AI_INTEGRATIONS_OPENAI_API_KEY=sk-proj-your-key-here
AI_INTEGRATIONS_OPENAI_BASE_URL=https://api.openai.com/v1
```

**Step 2: Check Bot Settings in UI**
1. Login to https://stream.rig-city.com
2. Go to Settings
3. Verify:
   - ✅ "Enable automated fact posting" is ON
   - ✅ "Post interval" is set (e.g., every 10 minutes)
   - ✅ "Enable chat triggers" is ON (if you want !snapple command)
   - ✅ Keywords include "!snapple" and "!fact"

**Step 3: Test Fact Generation**
1. In the Stream-Bot dashboard, click "Post Fact Now" button
2. Check the "Activity" or "History" tab to see if fact appears
3. If it generates in UI but not in chat, check platform connections

**Step 4: Verify Platform Connections**
- Ensure Twitch/YouTube/Kick show "Connected" status
- Check that bot has proper permissions in chat
- For Twitch: Ensure your channel is in "Chat" mode not "Follower-only"

---

### 4. Database Migration Errors
**Symptom:** Logs show "relation 'agents' does not exist" or "relation 'marketplace_apps' does not exist"  
**Root Cause:** Dashboard database migrations didn't run

**Automatic Fix (Preferred):**
```bash
# Restart dashboard container - migrations run automatically on startup
docker-compose restart homelab-dashboard

# Check logs to verify migrations completed
docker logs homelab-dashboard | grep -i "migration"
```

**Manual Fix (If Automatic Fails):**
```bash
# Run migrations manually inside container
docker exec -it homelab-dashboard bash
cd /app
alembic upgrade head
exit

# Verify tables exist
docker exec -it discord-bot-db psql -U jarvis -d homelab_jarvis -c "\dt"
```

---

## 🎯 Complete Deployment Checklist

### Environment Variables Required

**Core Services:**
- ✅ `AI_INTEGRATIONS_OPENAI_API_KEY` - OpenAI API key (required for all AI features)
- ✅ `AI_INTEGRATIONS_OPENAI_BASE_URL` - OpenAI base URL
- ✅ `WEB_USERNAME` / `WEB_PASSWORD` - Dashboard login credentials

**Home Assistant:**
- ✅ `HOME_ASSISTANT_URL` - Home Assistant server URL
- ✅ `HOME_ASSISTANT_TOKEN` - Long-lived access token
- ✅ `HOME_ASSISTANT_VERIFY_SSL` - SSL verification (False for internal, True for external)

**Stream-Bot (SnappleBotAI):**
- ✅ `STREAMBOT_DB_PASSWORD` - Auto-generated database password
- ✅ `STREAMBOT_SESSION_SECRET` - Auto-generated session secret
- ⚠️ `TWITCH_CLIENT_ID` / `TWITCH_CLIENT_SECRET` - Optional but required for Twitch
- ⚠️ `YOUTUBE_CLIENT_ID` / `YOUTUBE_CLIENT_SECRET` - Optional but required for YouTube
- ⚠️ `KICK_CLIENT_ID` / `KICK_CLIENT_SECRET` - Optional but required for Kick
- ⚠️ `SPOTIFY_CLIENT_ID` / `SPOTIFY_CLIENT_SECRET` - Optional for Spotify overlay

**Discord Bot:**
- ✅ `DISCORD_BOT_TOKEN` - Bot token from Discord Developer Portal
- ✅ `DISCORD_CLIENT_ID` - Application client ID
- ✅ `DISCORD_CLIENT_SECRET` - Application client secret

---

## 📋 Step-by-Step Recovery Process

### For Ubuntu Production Server:

```bash
# 1. Navigate to project directory
cd ~/contain/HomeLabHub

# 2. Backup current .env
cp .env .env.backup.$(date +%Y%m%d_%H%M%S)

# 3. Run environment generator to add missing variables
cd deployment
./generate-unified-env.sh

# When prompted:
# - Choose option 1 (Keep existing and add missing variables)
# - Fill in Home Assistant URL and token
# - Verify Twitch/YouTube credentials
# - Confirm all other settings

# 4. Return to project root
cd ..

# 5. Restart all services
docker-compose -f docker-compose.unified.yml down
docker-compose -f docker-compose.unified.yml up -d

# 6. Monitor logs for errors
docker-compose logs -f homelab-dashboard stream-bot | grep -i "error\|failed\|success"

# 7. Verify services are healthy
docker ps
```

### For Replit Development:

The Replit environment is for development only. To test changes:

```bash
# 1. Commit changes
git add .
git commit -m "Fix environment configuration and OAuth setup"

# 2. Push to repository
git push origin main

# 3. On Ubuntu server, pull changes
cd ~/contain/HomeLabHub
git pull origin main

# 4. Follow Ubuntu deployment steps above
```

---

## 🧪 Testing All Features

### Test Home Assistant
```bash
# From dashboard, navigate to Smart Home section
# - Should see "Connected" status
# - Devices should load
# - Controls should work (toggle lights, etc.)
```

### Test Stream-Bot OAuth
```bash
# 1. Visit https://stream.rig-city.com
# 2. Login with credentials
# 3. Go to Settings → Platforms
# 4. Click "Connect Twitch" → Should redirect to Twitch OAuth → Authorize
# 5. Verify "Connected" status appears
# 6. Repeat for YouTube and Kick
```

### Test Snapple Facts
```bash
# Method 1: Manual Trigger
# 1. Go to Stream-Bot dashboard
# 2. Click "Post Fact Now" button
# 3. Check chat in Twitch/YouTube/Kick for fact

# Method 2: Chat Command
# 1. In your Twitch chat, type: !snapple
# 2. Bot should respond with a random fact

# Method 3: Automated
# 1. Enable "Automated fact posting" in Settings
# 2. Set interval to 1 minute (for testing)
# 3. Wait 1 minute, check chat for fact
# 4. Set back to desired interval (e.g., 10 minutes)
```

### Verify Database Migrations
```bash
# Check dashboard database has all tables
docker exec -it discord-bot-db psql -U jarvis -d homelab_jarvis -c "
SELECT table_name FROM information_schema.tables 
WHERE table_schema = 'public' 
ORDER BY table_name;
"

# Should see tables including: agents, marketplace_apps, deployed_apps, etc.
```

---

## 🐛 Common Errors and Solutions

### Error: "AI_INTEGRATIONS_OPENAI_API_KEY not configured"
**Solution:** Add OpenAI API key to .env file
```bash
AI_INTEGRATIONS_OPENAI_API_KEY=sk-proj-xxxxxxxxxxxxxxxxxxxxx
AI_INTEGRATIONS_OPENAI_BASE_URL=https://api.openai.com/v1
```

### Error: "This Twitch account is already linked to another StreamBot account"
**Solution:** 
1. Check database for existing connections
2. Delete old connection if needed:
```sql
docker exec -it discord-bot-db psql -U streambot -d streambot -c "
DELETE FROM platform_connections 
WHERE platform='twitch' AND platform_user_id='<twitch_user_id>';
"
```
3. Try connecting again

### Error: "Login authentication failed" (Twitch)
**Causes:**
- Expired OAuth tokens
- Invalid client ID/secret
- Callback URL mismatch

**Solution:**
1. Verify Twitch app callback URL matches: `https://stream.rig-city.com/auth/twitch/callback`
2. Check .env has correct TWITCH_CLIENT_ID and TWITCH_CLIENT_SECRET
3. Restart stream-bot: `docker-compose restart stream-bot`
4. Reconnect platform in UI

### Error: "Unable to connect to Home Assistant"
**Solution:** See Section 1 above - ensure URL and token are correct

---

## 📞 Getting Help

If issues persist:

1. **Check Logs:**
   ```bash
   # Dashboard logs
   docker logs homelab-dashboard --tail=100

   # Stream-Bot logs
   docker logs stream-bot --tail=100

   # Database logs
   docker logs discord-bot-db --tail=100
   ```

2. **Run Diagnostics:**
   ```bash
   # From homelab-manager.sh
   ./homelab-manager.sh
   # Choose option 12b: Run Lifecycle Diagnostics & Auto-Fix
   ```

3. **Export Logs:**
   ```bash
   # Save all logs for debugging
   docker-compose logs > homelab-full-logs.txt
   ```

---

## ✅ Success Indicators

Your system is fully operational when:

- ✅ Dashboard loads at https://host.evindrake.net
- ✅ Home Assistant section shows "Connected" status
- ✅ Stream-Bot shows all platforms as "Connected"
- ✅ Snapple facts are being posted to chat
- ✅ No errors in container logs
- ✅ All database migrations completed successfully
- ✅ All containers show "healthy" or "running" status

---

**Last Updated:** November 19, 2025  
**Version:** 2.0  
**Maintainer:** Nebula Command AI Assistant
