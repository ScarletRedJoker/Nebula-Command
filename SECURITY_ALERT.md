# 🚨 CRITICAL SECURITY ALERT 🚨

## Your .env file with production secrets is committed to git!

**Status:** ⚠️ **IMMEDIATE ACTION REQUIRED**

### What's Exposed

The following live credentials are currently in your git repository:

- ✅ OpenAI API Key: `sk-proj-zpuT7AnNUW8y8y9NRYfc...`
- ✅ Twitch OAuth credentials
- ✅ YouTube OAuth credentials
- ✅ Spotify OAuth credentials
- ✅ Discord bot token, client ID, client secret
- ✅ Database passwords for all 3 databases
- ✅ Session secrets
- ✅ Dashboard API keys

### Immediate Actions Required

#### Step 1: Remove .env from Git (On Your Local Machine)

```bash
# Navigate to your repository
cd /path/to/HomeLabHub

# Remove .env from git tracking (keeps local file)
git rm --cached .env

# Commit the removal
git commit -m "Remove .env from git tracking (security fix)"

# Push to GitHub
git push origin main
```

#### Step 2: Rotate ALL Exposed Credentials

You **MUST** rotate every credential that was exposed:

**OpenAI API Key:**
1. Go to https://platform.openai.com/api-keys
2. Revoke the old key: `sk-proj-zpuT7AnNUW8y8y9NRYfc...`
3. Create a new key
4. Update in `.env` file

**Discord Bot:**
1. Go to https://discord.com/developers/applications
2. Select your application
3. Go to "Bot" section
4. Click "Reset Token" to get a new bot token
5. Also regenerate Client Secret in "OAuth2" section
6. Update `DISCORD_BOT_TOKEN` and `DISCORD_CLIENT_SECRET` in `.env`

**Twitch OAuth:**
1. Go to https://dev.twitch.tv/console/apps
2. Select your application
3. Click "New Secret" to generate new client secret
4. Update `TWITCH_CLIENT_SECRET` in `.env`

**YouTube OAuth:**
1. Go to https://console.cloud.google.com/apis/credentials
2. Find your OAuth 2.0 Client ID
3. Delete and recreate the client (or rotate the secret if possible)
4. Update `YOUTUBE_CLIENT_SECRET` in `.env`

**Spotify OAuth:**
1. Go to https://developer.spotify.com/dashboard/applications
2. Select your application
3. Click "Show Client Secret" → "Reset Client Secret"
4. Update `SPOTIFY_CLIENT_SECRET` in `.env`

**Database Passwords:**
```bash
# On your Ubuntu server, generate new passwords:
openssl rand -hex 16

# Update these in .env:
POSTGRES_PASSWORD=NEW_PASSWORD_HERE
DISCORD_DB_PASSWORD=NEW_PASSWORD_HERE
STREAMBOT_DB_PASSWORD=NEW_PASSWORD_HERE
JARVIS_DB_PASSWORD=NEW_PASSWORD_HERE

# Update database URLs with new passwords
DISCORD_DATABASE_URL=postgresql://ticketbot:NEW_PASSWORD@homelab-postgres:5432/ticketbot
STREAMBOT_DATABASE_URL=postgresql://streambot:NEW_PASSWORD@homelab-postgres:5432/streambot
JARVIS_DATABASE_URL=postgresql://jarvis:NEW_PASSWORD@homelab-postgres:5432/homelab_jarvis
```

**Session Secrets:**
```bash
# Generate new session secrets:
openssl rand -hex 32

# Update these in .env:
SESSION_SECRET=NEW_SECRET_HERE
DISCORD_SESSION_SECRET=NEW_SECRET_HERE
STREAMBOT_SESSION_SECRET=NEW_SECRET_HERE
SECRET_KEY=NEW_SECRET_HERE
DASHBOARD_API_KEY=NEW_SECRET_HERE
```

#### Step 3: Use .env.example Template

From now on:
1. Never commit `.env` to git (already in `.gitignore`)
2. Use `.env.example` as your template
3. Only share `.env.example` publicly

#### Step 4: Rebuild and Restart Services

After updating all credentials:

```bash
# On your Ubuntu server
cd /home/evin/contain/HomeLabHub
./homelab fix
```

This will rebuild all services with the new credentials.

### How This Happened

The `.env` file was accidentally committed to git before being added to `.gitignore`. Even though it's now in `.gitignore`, the file remains in git history.

### Prevention

- ✅ `.env` is now in `.gitignore`
- ✅ `.env.example` template created with placeholders
- ✅ All code cleaned up and LSP errors resolved
- ⚠️ **You must complete the steps above to secure your deployment**

### After Securing

Once you've completed all steps:
1. All services will continue working with new credentials
2. Old credentials will be revoked and useless
3. Your deployment will be secure

---

**Do this now. Your credentials are public in git history until you complete these steps.**
