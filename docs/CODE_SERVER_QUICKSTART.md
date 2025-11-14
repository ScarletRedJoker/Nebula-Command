# Code-Server Quick Start Guide

Get VS Code running in your browser in under 5 minutes!

## Prerequisites

- HomeLabHub deployed and running
- Access to your `.env` file
- DNS record for `code.evindrake.net` pointing to your server

## Quick Setup (5 Steps)

### 1. Add Password to .env

```bash
# SSH to your server
ssh evin@your-homelab

# Navigate to HomeLabHub
cd /home/evin/contain/HomeLabHub

# Generate a secure password
python3 -c 'import secrets; print(secrets.token_urlsafe(24))'

# Edit .env and add the password
nano .env
```

Add this at the end of your `.env` file:

```bash
# ============================================
# Code-Server (VS Code in Browser)
# ============================================
CODE_SERVER_PASSWORD=<paste_generated_password_here>
```

Save and exit (Ctrl+X, Y, Enter)

### 2. Deploy Code-Server

```bash
# Pull latest code (if from Replit)
git pull

# Start code-server
docker-compose -f docker-compose.unified.yml up -d code-server
```

### 3. Verify Deployment

```bash
# Check if container is running
docker ps | grep code-server

# Check logs
docker logs code-server

# Should see: "HTTP server listening on http://0.0.0.0:8080"
```

### 4. Test Access

Open your browser and go to:
```
https://code.evindrake.net
```

You should see a login screen. Enter the password from step 1.

### 5. Install Extensions (Optional)

Once logged in:

1. Click Extensions icon (left sidebar) or press `Ctrl+Shift+X`
2. Recommended extensions will appear
3. Click "Install All" or install individually:
   - Python
   - ESLint
   - Prettier
   - Docker
   - GitLens

## What You Can Do

### Access Your Projects
All your homelab services are available at:
```
/home/coder/projects/
```

This maps to `/home/evin/contain` on your host.

### Open Terminal
- Press `` Ctrl+` `` (backtick)
- Or: Menu → Terminal → New Terminal

### Start Coding
1. Click "Open Folder"
2. Navigate to `/home/coder/projects/HomeLabHub`
3. Start editing files!

## Common Tasks

### Edit a Service
```bash
# In code-server terminal:
cd /home/coder/projects/HomeLabHub/services/discord-bot
# Edit files in the editor
```

### Commit Changes
```bash
git add .
git commit -m "Your message"
git push
```

### View Logs
```bash
# On your server (SSH):
docker logs code-server -f
```

### Restart Service
```bash
docker-compose -f docker-compose.unified.yml restart code-server
```

### Update to Latest Version
```bash
docker-compose -f docker-compose.unified.yml pull code-server
docker-compose -f docker-compose.unified.yml up -d code-server
```

## Troubleshooting

### Can't Access URL
- Check Caddy is running: `docker ps | grep caddy`
- Check DNS points to your server: `nslookup code.evindrake.net`
- Check logs: `docker logs caddy | grep code.evindrake.net`

### Password Not Working
- Verify env var: `docker exec code-server env | grep PASSWORD`
- Restart container: `docker-compose -f docker-compose.unified.yml restart code-server`

### Can't See Files
- Check volume mount: `docker exec -it code-server ls -la /home/coder/projects`
- Verify host path exists: `ls -la /home/evin/contain`

## Next Steps

- Read the [full setup guide](CODE_SERVER_SETUP.md)
- Check [environment variables reference](ENV_VARIABLES_REFERENCE.md)
- Customize settings in `config/code-server/settings.json`

## Security Reminder

🔒 Your code-server instance gives full access to your homelab files. Keep your password secure!

- Don't share your password
- Use a strong, unique password
- Consider changing it regularly
- Access only from trusted networks

---

**Need Help?** Check the [complete documentation](CODE_SERVER_SETUP.md) or [troubleshooting guide](CODE_SERVER_SETUP.md#troubleshooting).
