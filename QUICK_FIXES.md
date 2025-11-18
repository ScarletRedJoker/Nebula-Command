# Quick Fixes - Remaining Issues

## 1. Home Assistant First-Time Login

Home Assistant requires you to create the first user account on initial setup.

**Steps:**
1. Go to https://home.evindrake.net
2. You'll see a "Create Account" page
3. Fill in:
   - **Name:** Your name (e.g., "Evin")
   - **Username:** Your desired username
   - **Password:** A secure password (minimum 8 characters)
   - **Confirm Password:** Same password again
4. Click "Create Account"
5. You'll be logged in automatically!

**Note:** This first account becomes the admin account with full access.

## 2. Code-Server Still Not Working

The docker-compose.unified.yml changes need to be deployed on your Ubuntu server.

**Quick Deploy:**
```bash
cd /home/evin/contain/HomeLabHub

# Pull latest changes (auto-sync should have done this)
git pull

# Stop and remove old code-server container
docker-compose -f docker-compose.unified.yml stop code-server
docker-compose -f docker-compose.unified.yml rm -f code-server

# Start with new configuration
docker-compose -f docker-compose.unified.yml up -d code-server

# Verify it's running without errors
docker logs code-server --tail 20
```

**Expected:** No more EACCES permission errors!

## 3. n8n Trust Proxy Warning

The n8n service has a rate limiting warning that's been resolved in the updated docker-compose file.

**Deploy Fix:**
```bash
docker-compose -f docker-compose.unified.yml restart n8n

# Check logs - warning should be gone
docker logs n8n --tail 10
```

## All Services Status Check

After applying these fixes:

```bash
# Check all services are healthy
docker ps --format "table {{.Names}}\t{{.Status}}" | sort

# Should see all services "Up" with no crash loops
```

## Service URLs

- **Home Assistant:** https://home.evindrake.net (create your account!)
- **Code-Server:** https://code.evindrake.net (should work after redeployment)
- **Stream-Bot:** https://stream.rig-city.com ✅ ONLINE!
- **n8n:** https://n8n.evindrake.net
- **Dashboard:** https://host.evindrake.net
- **Discord Bot:** https://bot.rig-city.com
- **Plex:** https://plex.evindrake.net
- **VNC Desktop:** https://vnc.evindrake.net

## Troubleshooting

### Code-Server Still Has Permission Errors?
The Ubuntu server might not have pulled the latest changes yet. Manually sync:

```bash
cd /home/evin/contain/HomeLabHub
git fetch origin
git reset --hard origin/main
docker-compose -f docker-compose.unified.yml up -d code-server
```

### Can't Create Home Assistant Account?
If you see errors, check the logs:
```bash
docker logs homeassistant --tail 50
```

Most common issue: The onboarding page might take a moment to load on first access.
