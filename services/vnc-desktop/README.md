# Enhanced VNC Desktop

Custom Ubuntu desktop environment with pre-installed applications and shortcuts for seamless homelab management.

## Features

### Pre-installed Applications
- **Web Browsers**: Firefox, Chromium
- **Development**: Git, Python3, Node.js, npm, Vim, Nano
- **Productivity**: LibreOffice suite
- **Media**: VLC, GIMP
- **System Tools**: htop, neofetch, Thunar file manager, Mousepad text editor
- **Terminal**: GNOME Terminal with full features

### Desktop Environment
- **Window Manager**: LXDE/LXQt (lightweight and responsive)
- **Desktop Shortcuts**: 
  - Firefox Web Browser
  - Terminal
  - File Manager (Thunar)
  - Homelab Dashboard (direct link to host.evindrake.net)
  - Projects Folder (linked to host projects)
- **Panel**: Custom LXQt panel with quick launch bar

### Persistent Storage
- **vnc_home** volume: Stores user settings, desktop configurations, and installed apps
- **Selective Host Mounts**: 
  - `/home/evin/contain` → `~/host-projects` (read-only)
  - `/home/evin/Downloads` → `~/host-downloads` (read-write)

## Build & Deploy

### Build Custom Image
```bash
cd /home/evin/contain
docker compose -f docker-compose.unified.yml build vnc-desktop
```

### Deploy
```bash
./homelab-manager.sh
# Select: Deploy Options → Full Deployment
# Or: Service Control → Restart vnc-desktop
```

## First-Time Setup

When the container starts for the first time:
1. Bootstrap script runs automatically
2. Creates XDG user directories (Desktop, Documents, Downloads, etc.)
3. Provisions desktop shortcuts
4. Configures LXQt panel
5. Sets up file manager favorites
6. Creates `.desktop_provisioned` flag to prevent re-provisioning

## Access

### Web Browser (noVNC)
- **URL**: https://vnc.evindrake.net
- **Port**: 6080 (proxied via Caddy)
- **Security**: VNC password required + HTTPS

### Native VNC Client (Optional)
Not exposed externally for security. Use noVNC web interface.

## Security

- **VNC Password**: Set via `VNC_PASSWORD` environment variable
- **User Password**: Set via `VNC_USER_PASSWORD` environment variable
- **Network**: Internal Docker network only
- **Reverse Proxy**: Caddy handles HTTPS and SSL termination
- **No Direct Exposure**: VNC ports not exposed to internet

## Customization

### Add More Applications
Edit `services/vnc-desktop/Dockerfile`:
```dockerfile
RUN apt-get update && apt-get install -y \
    your-package-here \
    && apt-get clean \
    && rm -rf /var/lib/apt/lists/*
```

### Add Desktop Shortcuts
Edit `services/vnc-desktop/bootstrap.sh`:
```bash
cat > "${USER_HOME}/Desktop/YourApp.desktop" << 'EOF'
[Desktop Entry]
Name=Your Application
Exec=/path/to/your/app
Icon=app-icon
Type=Application
EOF
```

### Rebuild After Changes
```bash
docker compose -f docker-compose.unified.yml build vnc-desktop
docker compose -f docker-compose.unified.yml up -d vnc-desktop
```

## Troubleshooting

### Desktop Not Showing Apps
1. Check if bootstrap script ran: `docker logs vnc-desktop | grep "VNC Desktop Bootstrap"`
2. Verify volume persistence: `docker volume inspect vnc_home`
3. Remove provisioning flag to re-run: 
   ```bash
   docker exec vnc-desktop rm /home/evin/.desktop_provisioned
   docker restart vnc-desktop
   ```

### Permission Issues
1. Ensure UID/GID match: Set `USER_UID=1000` and `USER_GID=1000` in .env
2. Check volume ownership: `docker exec vnc-desktop ls -la /home/evin`

### Can't Access Web UI
1. Check container status: `docker ps | grep vnc-desktop`
2. View logs: `docker logs vnc-desktop`
3. Verify Caddy routing: `docker logs caddy`
4. Test health check: `docker exec vnc-desktop curl -f http://localhost:6080`

## Architecture

```
Internet → Caddy (HTTPS/443)
    ↓
vnc-desktop:80 (noVNC web interface)
    ↓
vnc-desktop:5900 (VNC server)
    ↓
X Server + LXDE Desktop
    ↓
User Applications
```

## Performance

- **RAM**: 2GB shared memory allocated
- **Resolution**: 1920x1080 (configurable via RESOLUTION env var)
- **Timezone**: America/New_York (configurable via TZ env var)

## Backup & Restore

### Backup VNC Home
```bash
docker run --rm -v vnc_home:/data -v $(pwd):/backup \
    ubuntu tar czf /backup/vnc_home_backup.tar.gz /data
```

### Restore VNC Home
```bash
docker run --rm -v vnc_home:/data -v $(pwd):/backup \
    ubuntu tar xzf /backup/vnc_home_backup.tar.gz -C /
```
