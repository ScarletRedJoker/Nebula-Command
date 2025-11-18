# 🚀 Quick Fix Instructions for Ubuntu Server

## VNC Desktop Login Failing & Code-Server Down

Hi! I've identified and fixed the issues. Here's what to do on your Ubuntu server:

---

## Option 1: Quick Fix (Recommended) ⚡

Run this single command to fix everything:

```bash
cd /home/evin/contain/HomeLabHub && ./deployment/fix-vnc-and-code-server.sh
```

**What it does:**
1. ✅ Fixes code-server permissions (EACCES errors)
2. ✅ Rebuilds VNC Desktop with password fix
3. ✅ Restarts both services
4. ✅ Verifies everything is working

**Time:** ~2-3 minutes

---

## Option 2: Manual Step-by-Step

If you prefer to see each step:

### Step 1: Fix Code-Server Permissions
```bash
cd /home/evin/contain/HomeLabHub

# Get volume path and fix ownership
VOLUME_PATH=$(docker volume inspect code_server_data --format '{{ .Mountpoint }}')
sudo chown -R 1000:1000 "$VOLUME_PATH"

# Restart code-server
docker-compose -f docker-compose.unified.yml restart code-server
```

### Step 2: Fix VNC Desktop
```bash
# Stop VNC
docker-compose -f docker-compose.unified.yml stop vnc-desktop

# Rebuild with password fix
docker-compose -f docker-compose.unified.yml build --no-cache vnc-desktop

# Start VNC
docker-compose -f docker-compose.unified.yml up -d vnc-desktop
```

### Step 3: Verify
```bash
# Check code-server (should NOT see EACCES errors)
docker logs code-server --tail 10

# Check VNC (should see "x11vnc entered RUNNING state")
docker logs vnc-desktop --tail 20 | grep x11vnc
```

---

## What Was Wrong?

### Code-Server Issue:
- **Problem:** Docker volume owned by root, but code-server runs as UID 1000
- **Error:** `EACCES: permission denied, mkdir '/home/coder/.config/code-server'`
- **Fix:** Changed volume ownership to 1000:1000

### VNC Desktop Issue:
- **Problem:** VNC password stored in wrong location (`/.password2` instead of user home)
- **Error:** `x11vnc (exit status 1; not expected)`
- **Fix:** Added startup script that sets password in correct location

---

## After the Fix

Your services should be accessible at:
- 🖥️ **VNC Desktop:** https://vnc.evindrake.net
- 💻 **Code Server:** https://code.evindrake.net

---

## If You Still Have Issues

Check the detailed troubleshooting guide:
```bash
cat /home/evin/contain/HomeLabHub/deployment/TROUBLESHOOTING_VNC_CODE_SERVER.md
```

Or check the logs:
```bash
# Code-server
docker logs code-server --tail 50

# VNC Desktop
docker logs vnc-desktop --tail 50
```

---

## What Changed in the Code

I've made these updates to your Replit project (they'll sync to Ubuntu):

1. ✅ Created `deployment/fix-vnc-and-code-server.sh` - automated fix script
2. ✅ Created `services/vnc-desktop/fix-vnc-password.sh` - VNC password fix
3. ✅ Updated `services/vnc-desktop/Dockerfile` - integrated password fix
4. ✅ Created troubleshooting guides

**Next sync:** These changes will automatically sync to Ubuntu in ~5 minutes, but you can run the fix script immediately!

---

## Need Help?

If the quick fix doesn't work, share the output of:
```bash
docker logs vnc-desktop --tail 50 > ~/vnc-logs.txt
docker logs code-server --tail 50 > ~/code-server-logs.txt
cat ~/vnc-logs.txt ~/code-server-logs.txt
```
