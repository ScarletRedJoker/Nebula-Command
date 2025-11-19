# Dashboard Feature Proposals

## ✨ New Features to Make Your Homelab Even Better

---

## 🎬 1. Plex Media Import (PRIORITY #1)

**What it does:** Upload movies/TV shows through the dashboard and automatically import them into Plex

### Features:
- **Drag & drop media files** (MP4, MKV, AVI, etc.)
- **Organize by type:** Movies, TV Shows, Music
- **Auto-naming:** Suggest filenames based on content analysis
- **Move to Plex directories:** Automatically copy files to `/services/plex/media/Movies` or `/services/plex/media/TV Shows`
- **Trigger Plex scan:** Hit the Plex API to refresh libraries after upload
- **Progress tracking:** Show upload progress, file movement, and scan status

### Implementation:
```python
# New route: /api/plex/import
- Upload file → MinIO temporary storage
- Analyze filename to detect: Movie vs TV Show
- Prompt user for corrections (show/season/episode)
- Move file to correct Plex directory
- Trigger Plex library scan via API
- Show success notification
```

### UI Location:
New tab: **"Media Import"** in Quick Access Terminal

---

## ⚡ 2. Service Quick Actions

**What it does:** One-click buttons to control services without going to container management

### Features:
- **Quick Restart Buttons** for each service (Discord bot, Stream bot, Plex, etc.)
- **Service Health Checks** with auto-refresh every 30 seconds
- **Resource Usage** per service (CPU, Memory, Network)
- **Recent Logs** (last 50 lines) for quick debugging
- **Status History** graph showing uptime/downtime over 24 hours

### UI Location:
Enhanced "Service Status Array" section with action buttons

---

## 📊 3. Real-Time Container Logs Viewer

**What it does:** Stream container logs in real-time without SSH

### Features:
- **Live log streaming** with WebSocket connection
- **Filter by container** (dropdown selector)
- **Search logs** (highlight matching text)
- **Download logs** as .txt file
- **Auto-scroll toggle**
- **Log level filtering** (ERROR, WARN, INFO, DEBUG)

### UI Location:
Enhanced /logs page with live streaming

---

## 💾 4. Disk Space & Resource Monitoring

**What it does:** Track disk usage and get alerts before running out of space

### Features:
- **Disk space by directory:**
  - /services/plex/media (Movies, TV Shows, Music)
  - /services/plex/transcode
  - Docker volumes
  - PostgreSQL database size
- **Visual pie charts** showing space breakdown
- **Growth trends** (weekly/monthly usage increase)
- **Alert thresholds** (email/notification when >80% full)
- **Quick cleanup** suggestions (old transcodes, temp files)

### UI Location:
New page: /storage or widget on Dashboard

---

## 🔐 5. SSL Certificate Expiry Monitor

**What it does:** Track Let's Encrypt certificates and alert before expiry

### Features:
- **Certificate expiry dates** for all domains
- **Days remaining** countdown
- **Auto-renewal status** (Caddy handles this, but good to monitor)
- **Certificate chain validation**
- **Email alerts** 7 days before expiry

### UI Location:
Widget on /domains page

---

## 🗄️ 6. Backup & Restore Manager

**What it does:** One-click backups of critical configs and databases

### Features:
- **Backup profiles:**
  - PostgreSQL databases (ticketbot, streambot, homelab_jarvis)
  - Plex configuration
  - n8n workflows
  - Docker Compose + Caddyfile
  - Home Assistant config
- **Scheduled backups** (daily, weekly, monthly)
- **Storage to MinIO** with versioning
- **One-click restore** from backup list
- **Backup size tracking**

### UI Location:
New page: /backups

---

## 🎮 7. Game Streaming Quick Launch

**What it does:** Quick shortcuts for launching game streams (Moonlight/Sunshine)

### Features:
- **Game list** with icons (stored in database)
- **One-click launch** via dashboard
- **Stream status** (Active/Idle)
- **Recent plays** history
- **Performance stats** (FPS, latency)

### UI Location:
Enhanced /game_connect page

---

## 🔔 8. Smart Notifications Center

**What it does:** Centralized alerts for all homelab events

### Features:
- **Notification types:**
  - Container restarts
  - High CPU/Memory usage
  - Disk space warnings
  - SSL expiry alerts
  - Failed health checks
  - New Plex content added
- **Delivery methods:**
  - In-dashboard notifications (bell icon)
  - Email (via n8n integration)
  - Discord webhook
  - Telegram bot
- **Notification history** (last 100 events)

### UI Location:
Bell icon in top navigation bar

---

## 🌐 9. Dynamic DNS Manager

**What it does:** Update DNS records directly from dashboard (ZoneEdit integration)

### Features:
- **Current IP detection** (public IP from API)
- **DNS record list** for each domain
- **Quick update** button for dynamic IP changes
- **Update history** log
- **Automatic updates** when IP changes (background task)

### UI Location:
Enhanced /domains page

---

## 📦 10. Docker Image Manager

**What it does:** Update container images and manage Docker resources

### Features:
- **Image update checker** (compare local vs Docker Hub)
- **One-click updates** per container
- **Image size tracking**
- **Cleanup old images** (dangling images, unused layers)
- **Rebuild containers** from dashboard

### UI Location:
Enhanced /containers page

---

## 🚀 Quick Implementation Priority

### High Priority (Week 1):
1. **Plex Media Import** ⭐ (You requested this!)
2. **Service Quick Actions** (Restart buttons, health checks)
3. **Real-Time Logs Viewer**

### Medium Priority (Week 2):
4. **Disk Space Monitoring**
5. **Backup Manager**
6. **SSL Certificate Monitor**

### Low Priority (Future):
7. Game Streaming Quick Launch
8. Smart Notifications Center
9. Dynamic DNS Manager
10. Docker Image Manager

---

## 💡 Which Features Do You Want First?

I recommend starting with:
1. **Plex Media Import** (you asked for this)
2. **Service Quick Actions** (makes day-to-day management easier)
3. **Disk Space Monitoring** (prevent running out of space)

Let me know which features you'd like me to implement!
