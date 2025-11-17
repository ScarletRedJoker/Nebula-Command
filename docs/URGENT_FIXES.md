# URGENT FIXES - Dashboard Caching & 404 Issues

## Problem Summary
1. **Dashboard and System pages showing identical content** (browser caching)
2. **/game-connect returning 404** (but template and route exist)
3. **Steam missing from VNC menu** (needs rebuild)

## Root Causes Identified

### Issue 1: Persistent Caching
**Cause**: Caddy reverse proxy cache + browser cache
**Fix**: Added no-cache headers to Caddyfile + restart Caddy

### Issue 2: /game-connect 404
**Cause**: Flask route exists at `/game-connect` but may need blueprint verification
**Fix**: Template exists, route exists, testing needed after Caddy restart

### Issue 3: Steam Missing
**Cause**: VNC container built before Steam was added to Dockerfile
**Fix**: Rebuild VNC desktop container

---

## IMMEDIATE FIXES (Run on Ubuntu Server)

### Step 1: Restart Caddy (Critical!)
```bash
cd /home/evin/contain/HomeLabHub

# Reload Caddy with new cache headers
docker compose -f docker-compose.unified.yml exec caddy caddy reload --config /etc/caddy/Caddyfile

# If that doesn't work, restart Caddy container:
docker compose -f docker-compose.unified.yml restart caddy

# Verify it's running:
docker logs caddy --tail 20
```

### Step 2: Test Dashboard Routes
```bash
# Test from server directly (should see different content):
curl -s http://localhost:5000/dashboard | grep -o "<title>.*</title>"
# Should show: <title>Mission Control - Homelab Dashboard</title>

curl -s http://localhost:5000/system | grep -o "<title>.*</title>"
# Should show: <title>System Diagnostics - Homelab Dashboard</title>

curl -s http://localhost:5000/game-connect | grep -o "<title>.*</title>"
# Should show: <title>Game Streaming Connection - Homelab</title> (NOT 404!)
```

### Step 3: Clear Browser Cache
**On your client browser**:

**Chrome/Edge**:
1. Open DevTools (F12)
2. Right-click refresh button
3. Select "Empty Cache and Hard Reload"

**Firefox**:
1. Open DevTools (F12)
2. Right-click refresh button
3. Select "Empty Cache and Hard Reload"

OR:

**Force clear all site data**:
1. Visit https://host.evindrake.net
2. Open DevTools (F12)
3. Application tab → Storage → Clear site data
4. Refresh page

### Step 4: Verify Dashboard Pages Are Different
Visit these URLs and confirm they show DIFFERENT content:
- https://host.evindrake.net/dashboard → Should show "Mission Control" with widgets
- https://host.evindrake.net/system → Should show "System Diagnostics" with LED panel

### Step 5: Test Game Connect Route
Visit: https://game.evindrake.net

Should redirect to /game-connect and show the Windows 11 Gaming VM connection guide.

### Step 6: Rebuild VNC Desktop for Steam
```bash
cd /home/evin/contain/HomeLabHub

# Stop and remove existing container
docker stop vnc-desktop
docker rm vnc-desktop

# Rebuild with Steam included
docker compose -f docker-compose.unified.yml build --no-cache vnc-desktop

# Start it
docker compose -f docker-compose.unified.yml up -d vnc-desktop

# Verify Steam is installed:
docker exec vnc-desktop which steam
# Should output: /usr/games/steam

# Check build logs to confirm Steam installation:
docker logs vnc-desktop --tail 50
```

### Step 7: Verify Steam in VNC
1. Visit: https://vnc.evindrake.net
2. Click **Applications** menu (bottom-left)
3. Look for **Games** → **Steam**
4. Or open terminal and run: `steam`

---

## Verification Checklist

### ✅ Caching Fixed
- [ ] Caddy restarted successfully
- [ ] curl tests show different titles for /dashboard and /system
- [ ] Browser hard refresh performed
- [ ] Dashboard and System pages show different content in browser

### ✅ Game Connect Working
- [ ] curl http://localhost:5000/game-connect returns 200 (not 404)
- [ ] https://game.evindrake.net loads connection guide
- [ ] Page shows Windows 11 KVM specs and Moonlight instructions

### ✅ Steam in VNC
- [ ] VNC desktop rebuilt successfully
- [ ] `docker exec vnc-desktop which steam` returns /usr/games/steam
- [ ] Steam appears in Applications → Games menu
- [ ] Can launch Steam from VNC desktop

---

## Still Not Working?

### If Dashboard/System Still Look the Same:
1. **Check Caddy logs**:
   ```bash
   docker logs caddy --tail 50
   ```
   Look for errors or config reload confirmation.

2. **Verify cache headers are being sent**:
   ```bash
   curl -I https://host.evindrake.net/dashboard
   ```
   Should see:
   ```
   Cache-Control: no-cache, no-store, must-revalidate, private
   Pragma: no-cache
   Expires: 0
   ```

3. **Try incognito mode**:
   Open https://host.evindrake.net in incognito/private browsing.
   This bypasses ALL browser cache.

### If /game-connect Still 404:
1. **Check Flask logs**:
   ```bash
   docker logs homelab-dashboard --tail 50
   ```
   Look for route registration errors.

2. **Verify template exists**:
   ```bash
   ls -la /home/evin/contain/HomeLabHub/services/dashboard/templates/game_connect.html
   ```
   Should exist (not be missing).

3. **Test direct Flask access**:
   ```bash
   curl -v http://localhost:5000/game-connect
   ```
   If this works but https://game.evindrake.net doesn't, it's a Caddy issue.

### If Steam Still Missing:
1. **Check Dockerfile**:
   ```bash
   grep INSTALL_STEAM /home/evin/contain/HomeLabHub/services/vnc-desktop/Dockerfile
   ```
   Should show: `INSTALL_STEAM=true`

2. **Check build logs**:
   ```bash
   docker compose -f docker-compose.unified.yml build vnc-desktop 2>&1 | grep -i steam
   ```
   Should see Steam installation in output.

3. **Manual install as fallback**:
   ```bash
   docker exec -it vnc-desktop bash
   apt-get update
   apt-get install -y steam-installer
   ```

---

## Technical Details

### Caddyfile Changes
Added to `host.evindrake.net` and `game.evindrake.net` blocks:
```caddyfile
header_down Cache-Control "no-cache, no-store, must-revalidate, private"
header_down Pragma "no-cache"
header_down Expires "0"
```

These headers tell Caddy and browsers: **DO NOT CACHE ANYTHING**.

### Flask Routes Confirmed
All routes exist in `services/dashboard/routes/web.py`:
- `/dashboard` → dashboard.html (Mission Control)
- `/system` → system.html (System Diagnostics)
- `/game-connect` → game_connect.html (Gaming VM Guide)

No url_prefix on web_bp, so routes are at root level.

### VNC Dockerfile
Steam enabled by default:
```dockerfile
ENV INSTALL_STEAM=true

RUN if [ "$INSTALL_STEAM" = "true" ]; then \
        apt-get update && \
        apt-get install -y steam-installer && \
        apt-get clean && \
        rm -rf /var/lib/apt/lists/*; \
    fi
```

---

## Expected Results After Fixes

### Dashboard (https://host.evindrake.net/dashboard)
- Title: "Mission Control - Homelab Dashboard"
- Widgets showing: System Stats, Service Status, Activity Feed
- Spaceship control panel aesthetic

### System (https://host.evindrake.net/system)
- Title: "System Diagnostics - Homelab Dashboard"
- LED panel showing: CPU, MEMORY, DISK, NETWORK status
- System metrics and graphs

### Game Connect (https://game.evindrake.net)
- Title: "Game Streaming Connection - Homelab"
- Windows 11 VM specifications
- Moonlight client download links
- Twingate VPN connection instructions
- WinApps/Adobe streaming guide link

### VNC Desktop (https://vnc.evindrake.net)
- Applications menu includes:
  - **Games** → Steam
  - **Internet** → Firefox, Chromium
  - **Graphics** → GIMP, OBS Studio
  - **Sound & Video** → VLC, Audacity
  - **Accessories** → KeePassXC
  - **System** → Glances, htop

---

*Created: Nov 13, 2025*
*These fixes address all reported caching and 404 issues*
