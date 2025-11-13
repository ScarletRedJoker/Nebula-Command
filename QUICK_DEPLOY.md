# Quick Deployment Guide

## All Fixes Included
- ✅ Caching fix (dashboard/system pages different)
- ✅ VLC fix (working media player)
- ✅ Steam installation (in Games menu)
- ✅ 30+ apps (complete development environment)
- ✅ Security fix (mandatory dashboard credentials)
- ✅ WinApps/Adobe streaming guide

---

## One-Command Deployment

### On Your Ubuntu Server:

```bash
cd /home/evin/contain/HomeLabHub
./DEPLOY_ALL_FIXES.sh
```

**What it does**:
1. Syncs latest code from GitHub
2. Checks .env credentials
3. Restarts Caddy (applies cache headers)
4. Rebuilds VNC Desktop (VLC + Steam + all apps)
5. Restarts Dashboard (security fixes)
6. Verifies all services
7. Shows deployment summary

**Time**: ~15 minutes (VNC rebuild takes longest)

---

## Manual Step-by-Step (If Preferred)

### 1. Sync Code
```bash
cd /home/evin/contain/HomeLabHub
git pull origin main
```

### 2. Set Dashboard Credentials (REQUIRED)
```bash
nano .env
```

Add these lines:
```bash
WEB_USERNAME=your_username
WEB_PASSWORD=your_secure_password
```

Save and exit (Ctrl+X, Y, Enter)

### 3. Restart Caddy
```bash
docker compose -f docker-compose.unified.yml restart caddy
```

### 4. Rebuild VNC Desktop
```bash
docker stop vnc-desktop && docker rm vnc-desktop
docker compose -f docker-compose.unified.yml build --no-cache vnc-desktop
docker compose -f docker-compose.unified.yml up -d vnc-desktop
```

### 5. Restart Dashboard
```bash
docker compose -f docker-compose.unified.yml restart homelab-dashboard
```

### 6. Verify Services
```bash
docker compose -f docker-compose.unified.yml ps
docker logs caddy --tail 20
docker logs vnc-desktop --tail 20
docker logs homelab-dashboard --tail 20
```

---

## Browser Cache Clearing (CRITICAL!)

### Chrome/Edge:
1. Open DevTools (F12)
2. Right-click refresh button
3. Select **"Empty Cache and Hard Reload"**

### Firefox:
1. Open DevTools (F12)
2. Right-click refresh button  
3. Select **"Empty Cache and Hard Reload"**

### Alternative (Nuclear Option):
1. Visit https://host.evindrake.net
2. F12 → Application tab
3. Storage → **Clear site data**
4. Refresh

---

## Verification Checklist

### ✅ Dashboard Fixed
- [ ] Visit https://host.evindrake.net/dashboard
  - Should show **"Mission Control"** with widgets
- [ ] Visit https://host.evindrake.net/system  
  - Should show **"System Diagnostics"** with LED panel
- [ ] Pages are **COMPLETELY DIFFERENT** now

### ✅ Game Connect Working
- [ ] Visit https://game.evindrake.net
  - Should show Windows 11 Gaming VM guide
  - NOT a 404 error

### ✅ VNC Desktop Enhanced
- [ ] Visit https://vnc.evindrake.net
- [ ] Desktop has **VLC icon** (double-click to launch)
- [ ] Applications menu → Games → **Steam**
- [ ] Applications menu → Sound & Video → **VLC Media Player**
- [ ] VLC launches without crashing

---

## Quick Tests

### Test Cache Headers
```bash
curl -I https://host.evindrake.net/dashboard
```
Should see:
```
Cache-Control: no-cache, no-store, must-revalidate, private
```

### Test VLC in VNC
```bash
docker exec vnc-desktop which vlc
# Should output: /usr/bin/vlc

docker exec vnc-desktop which steam
# Should output: /usr/games/steam
```

### Test Dashboard Routes
```bash
curl -s http://localhost:5000/dashboard | grep -o "<title>.*</title>"
# Should show: <title>Mission Control - Homelab Dashboard</title>

curl -s http://localhost:5000/system | grep -o "<title>.*</title>"
# Should show: <title>System Diagnostics - Homelab Dashboard</title>
```

---

## Troubleshooting

### Dashboard Won't Start
**Error**: "CRITICAL: Missing required environment variables"

**Fix**:
```bash
nano .env
# Add WEB_USERNAME and WEB_PASSWORD
docker compose -f docker-compose.unified.yml restart homelab-dashboard
```

### VLC Still Won't Open
**Try**:
```bash
docker exec -it vnc-desktop bash
vlc --verbose=2
# Check error messages
```

See `services/vnc-desktop/FIX_VLC.md` for detailed troubleshooting.

### Steam Not in Menu
**Wait for VNC rebuild to complete**:
```bash
docker logs vnc-desktop --tail 100 | grep -i steam
# Should see: "Setting up steam-installer..."
```

### Pages Still Look the Same
1. **Hard refresh** browser (Ctrl+Shift+R)
2. **Try incognito mode** (bypasses all cache)
3. **Check Caddy logs**:
   ```bash
   docker logs caddy --tail 50
   ```

---

## Documentation

**Deployment & Fixes**:
- `URGENT_FIXES.md` - Comprehensive troubleshooting
- `DEPLOY_ALL_FIXES.sh` - Automated deployment script
- `QUICK_DEPLOY.md` - This file

**New Features**:
- `docs/WINAPPS_STREAMING.md` - Adobe Creative Cloud streaming guide
- `services/vnc-desktop/FIX_VLC.md` - VLC troubleshooting
- `docs/IMPROVEMENT_PLAN.md` - Future enhancements roadmap

---

## Expected Timeline

| Step | Time | What Happens |
|------|------|--------------|
| Code sync | 10s | Git pull from GitHub |
| Caddy restart | 5s | Cache headers applied |
| VNC rebuild | 10-15m | Compiles with VLC + Steam + 30+ apps |
| Dashboard restart | 10s | Security fixes applied |
| Health checks | 30s | Verify all services |
| **Total** | **~15-20m** | Complete deployment |

---

## Success Indicators

When everything is working:
- ✅ Dashboard login requires your credentials (no defaults)
- ✅ Dashboard and System pages look different
- ✅ game.evindrake.net shows connection guide
- ✅ VNC has VLC icon on desktop
- ✅ VLC launches and plays videos
- ✅ Steam appears in Games menu
- ✅ All 30+ apps available

---

**Need help?** Check detailed guides:
- Caching issues → `URGENT_FIXES.md`
- VLC issues → `services/vnc-desktop/FIX_VLC.md`
- Adobe streaming → `docs/WINAPPS_STREAMING.md`

**Ready to deploy?** Run `./DEPLOY_ALL_FIXES.sh` and follow the prompts!
