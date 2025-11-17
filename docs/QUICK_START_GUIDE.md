# Quick Start Guide - Fix Everything Now!

## 🚀 Three Commands to Fix Everything

Run these on your **Ubuntu server** in order:

```bash
cd /home/evin/contain/HomeLabHub

# 1. Fix VNC Desktop Icons (30 seconds)
./FIX_VNC_DESKTOP.sh

# 2. Fix game.evindrake.net SSL (wait 5 minutes after)
docker restart caddy

# 3. Verify everything
docker compose -f docker-compose.unified.yml ps
```

---

## ✅ What Each Fix Does

### Fix 1: VNC Desktop Icons
**Creates desktop shortcuts for**:
- VLC Media Player (working, no crashes!)
- OBS Studio
- Steam
- GIMP, Audacity
- Firefox, Terminal, File Manager
- NebulaCommand Dashboard link

**After running**: Refresh VNC browser tab (F5) - icons appear!

### Fix 2: game.evindrake.net SSL
**Triggers Let's Encrypt certificate request**:
- Wait 2-5 minutes for certificate issuance
- SSL error will disappear
- Game streaming page will load

**After waiting 5 min**: Visit https://game.evindrake.net (incognito mode)

---

## 🎯 Using Homelab Manager

You already have the manager running! Here's what to use:

### For Daily Operations:
```bash
cd /home/evin/contain/HomeLabHub
./homelab-manager.sh
```

**Most useful options**:
- **Option 17**: Sync from Replit (now works! ✅)
- **Option 1**: Full Deploy (rebuild everything)
- **Option 11**: View Service Logs (troubleshooting)
- **Option 12**: Health Check (verify all services)
- **Option 15**: Show Service URLs (quick reference)

### Sync from Replit Now Works!
```
Enter your choice: 17
```

This will:
1. Pull latest code from GitHub
2. Auto-deploy changes
3. Restart affected services
4. Show you what changed

---

## 📊 Service URLs Quick Reference

**Dashboard & System**:
- 🚀 Mission Control: https://host.evindrake.net/dashboard
- 💻 System Diagnostics: https://host.evindrake.net/system
- 🎮 Game Streaming: https://game.evindrake.net

**VNC Desktop**:
- 🖥️ Remote Desktop: https://vnc.evindrake.net

**Bots & Services**:
- 🎫 Discord Bot: https://bot.rig-city.com
- 📺 Stream Bot: https://stream.rig-city.com
- 🔄 n8n Automation: https://n8n.evindrake.net
- 🎬 Plex Media: https://plex.evindrake.net
- 🌐 Static Site: https://scarletredjoker.com

---

## 🆘 Quick Troubleshooting

### VNC Desktop - No Icons?
```bash
./FIX_VNC_DESKTOP.sh
# Then refresh browser (F5)
```

### game.evindrake.net - SSL Error?
```bash
docker restart caddy
# Wait 5 minutes, try incognito mode
```

### Dashboard Pages Look the Same?
```bash
# Clear browser cache
# F12 → Right-click refresh → "Empty Cache and Hard Reload"
# Or use incognito mode
```

### Service Not Starting?
```bash
./homelab-manager.sh
# Choose option 11 (View Service Logs)
# Select the service having issues
```

### Database Issues?
```bash
./homelab-manager.sh
# Choose option 7 (Ensure Databases Exist)
```

---

## 🔄 Auto-Sync from Replit

Want automatic code sync every 5 minutes?

```bash
./homelab-manager.sh
# Choose option 18 (Install Auto-Sync)
```

This creates a systemd timer that:
- Pulls from GitHub every 5 minutes
- Auto-deploys changes
- Logs to `/var/log/homelab-sync.log`

**Check status**:
```bash
./homelab-manager.sh
# Choose option 19 (Check Auto-Sync Status)
```

---

## 📋 Daily Workflow

### Morning Routine:
```bash
cd /home/evin/contain/HomeLabHub
./homelab-manager.sh
# Option 12 - Health Check (verify all services)
# Option 15 - Show Service URLs
```

### After Editing on Replit:
```bash
./homelab-manager.sh
# Option 17 - Sync from Replit
# Wait for deployment
# Test your changes
```

### If Something Breaks:
```bash
./homelab-manager.sh
# Option 11 - View Service Logs
# Option 13 - Full Troubleshoot Mode
# Option 7 - Fix Database (if DB issue)
```

### Full Rebuild (Nuclear Option):
```bash
./homelab-manager.sh
# Option 3 - Rebuild & Deploy
# This rebuilds everything from scratch
```

---

## 🎮 Adobe Apps (Important!)

**Adobe apps are NOT in VNC Desktop.**

They're on your **Windows 11 KVM** with RTX 3060 GPU.

**To use Adobe apps**:
1. Visit: https://game.evindrake.net (after SSL fix)
2. Follow Moonlight setup guide
3. Connect to Windows VM
4. Launch Adobe apps with full GPU acceleration

**Full guide**: `docs/WINAPPS_STREAMING.md`

---

## ✅ Verification Checklist

After running the three commands above, verify:

- [ ] VNC Desktop has icons (refresh browser)
- [ ] VLC icon launches without crashing
- [ ] Steam in Games menu
- [ ] Dashboard and System pages look different
- [ ] game.evindrake.net loads (after 5 min wait)
- [ ] All 9 services running (`docker ps`)

---

## 📚 All Documentation

**Quick Fixes**:
- `QUICK_START_GUIDE.md` ← You are here
- `FIX_VNC_DESKTOP.sh` - Desktop icons fix
- `FIX_GAME_STREAMING.md` - SSL troubleshooting

**Deployment**:
- `homelab-manager.sh` - Unified control panel
- `RESOLVE_GIT_CONFLICT.sh` - Git sync helper
- `DEPLOY_ALL_FIXES.sh` - One-command deployment

**Features**:
- `ADOBE_APPS_CLARIFICATION.md` - Where Adobe apps really are
- `docs/WINAPPS_STREAMING.md` - Adobe Creative Cloud streaming
- `services/vnc-desktop/FIX_VLC.md` - VLC troubleshooting

**Reference**:
- `QUICK_DEPLOY.md` - Manual deployment steps
- `URGENT_FIXES.md` - Comprehensive troubleshooting
- `docs/IMPROVEMENT_PLAN.md` - Future enhancements

---

## 🎉 Summary

**Right now, run these three commands**:
```bash
cd /home/evin/contain/HomeLabHub
./FIX_VNC_DESKTOP.sh
docker restart caddy
```

**Then wait 5 minutes and test**:
1. Refresh VNC tab → See desktop icons
2. Visit game.evindrake.net → SSL should work
3. Double-click VLC icon → Should launch!

**For daily use**:
```bash
./homelab-manager.sh
# Option 17 - Sync from Replit (now fixed!)
```

---

*All scripts are now executable and ready to use! 🚀*
