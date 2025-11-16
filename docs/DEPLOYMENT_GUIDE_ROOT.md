# Homelab Deployment Guide

Complete guide for deploying VNC Desktop enhancements and Cloud Gaming setup.

## Overview

This deployment adds two major features to your homelab:
1. **Enhanced VNC Desktop**: Custom Ubuntu desktop with pre-installed apps and shortcuts
2. **Cloud Gaming**: Moonlight/Sunshine game streaming from Windows 11 KVM with RTX 3060

## Prerequisites

### System Requirements
- Ubuntu 25.10 host server
- Docker and Docker Compose installed
- Twingate VPN configured
- Caddy reverse proxy running
- Windows 11 KVM with RTX 3060 GPU passthrough (for game streaming)

### DNS Configuration
Ensure these domains point to your server:
- `vnc.evindrake.net` → VNC desktop
- `game.evindrake.net` → Game streaming connection page
- `host.evindrake.net` → Homelab dashboard

## Part 1: VNC Desktop Deployment

### Step 1: Sync Latest Code from Replit

```bash
cd /home/evin/contain
./homelab-manager.sh
# Select: Code Sync → Manual Sync from Replit
```

Or use manual sync:
```bash
cd /home/evin/contain
git pull origin main
```

### Step 2: Build VNC Custom Image

```bash
docker compose -f docker-compose.unified.yml build vnc-desktop
```

This builds a custom image with:
- Firefox, Chromium browsers
- Development tools (Git, Python, Node.js)
- Productivity apps (LibreOffice)
- Media apps (VLC, GIMP)
- System utilities

### Step 3: Stop Old VNC Container

```bash
docker stop vnc-desktop
docker rm vnc-desktop
```

### Step 4: Deploy Enhanced VNC

```bash
docker compose -f docker-compose.unified.yml up -d vnc-desktop
```

### Step 5: Verify VNC Desktop

```bash
# Check container status
docker ps | grep vnc-desktop

# View bootstrap logs
docker logs vnc-desktop | grep "VNC Desktop Bootstrap"

# Should see: "Desktop provisioning complete!"
```

### Step 6: Access VNC Desktop

1. Open browser: https://vnc.evindrake.net
2. Enter VNC password (from your .env file)
3. You should see LXDE desktop with shortcuts on Desktop folder
4. Test applications (Firefox, Terminal, File Manager)

## Part 2: Cloud Gaming Setup

### Step 1: Install Sunshine on Windows 11 KVM

**On your Windows VM:**

1. Download Sunshine:
   ```
   https://github.com/LizardByte/Sunshine/releases
   ```

2. Install `sunshine-windows-installer.exe`

3. Open Sunshine Web UI:
   ```
   http://localhost:47990
   Default: admin / admin
   ```

4. **CRITICAL: Change Default Password**
   - Go to Configuration → Credentials
   - Set strong password
   - Save

5. Configure streaming:
   - Go to Configuration → Audio/Video
   - Encoder: NVENC (uses RTX 3060)
   - Resolution: 1920x1080
   - FPS: 60
   - Bitrate: 20 Mbps
   - Save

6. Add applications:
   - Go to Applications
   - Add "Desktop" (full desktop streaming)
   - Add games (browse to .exe files)
   - Save

### Step 2: Configure Windows Firewall

Open PowerShell as Administrator:

```powershell
# Allow Sunshine through firewall
New-NetFirewallRule -DisplayName "Sunshine Game Streaming" -Direction Inbound -Program "C:\Program Files\Sunshine\sunshine.exe" -Action Allow -Profile Any

# Or allow ports directly
New-NetFirewallRule -DisplayName "Sunshine TCP" -Direction Inbound -Protocol TCP -LocalPort 47984-47990,48010 -Action Allow
New-NetFirewallRule -DisplayName "Sunshine UDP" -Direction Inbound -Protocol UDP -LocalPort 47998-48000 -Action Allow
```

### Step 3: Start Sunshine Service

1. Open Services (`Win + R` → `services.msc`)
2. Find "Sunshine" service
3. Set to "Automatic" startup
4. Start the service

### Step 4: Update Ubuntu Server Configuration

Add Windows KVM IP to your `.env`:

```bash
cd /home/evin/contain
nano .env

# Add this line (replace with your Windows VM IP):
WINDOWS_KVM_IP=192.168.1.XXX
```

Save and exit (`Ctrl+X`, `Y`, `Enter`)

### Step 5: Reload Caddy Configuration

```bash
./homelab-manager.sh
# Select: Service Control → Restart caddy
```

Or manually:
```bash
docker restart caddy
```

### Step 6: Verify Game Streaming Page

1. Open browser: https://game.evindrake.net
2. Should redirect to connection instructions page
3. Verify Windows KVM IP is displayed correctly

## Part 3: Connect Moonlight Client

### Desktop/Laptop Setup

1. **Download Moonlight**:
   - Windows/Mac/Linux: https://github.com/moonlight-stream/moonlight-qt/releases
   - Install for your OS

2. **Connect to Twingate VPN** (for best performance)

3. **Add PC in Moonlight**:
   - Click "Add PC"
   - Enter IP: `192.168.1.XXX` (your Windows VM IP)
   - Moonlight shows a PIN

4. **Pair Device**:
   - Go to Sunshine Web UI: `http://192.168.1.XXX:47990`
   - Go to Pin tab
   - Enter the PIN from Moonlight
   - Click "Pair"

5. **Start Streaming**:
   - In Moonlight, select your PC
   - Choose game or desktop
   - Enjoy gaming! 🎮

### Mobile Setup (Android/iOS)

1. Download Moonlight from app store
2. Connect to same WiFi as Windows VM (for initial setup)
3. Add PC and pair (same as desktop)
4. For internet access, use Twingate VPN

## Troubleshooting

### VNC Desktop Issues

**Desktop shortcuts not showing:**
```bash
# Re-run bootstrap
docker exec vnc-desktop rm /home/evin/.desktop_provisioned
docker restart vnc-desktop
```

**Permission errors:**
```bash
# Check volume ownership
docker exec vnc-desktop ls -la /home/evin
# Should show: evin:evin for all files
```

**Can't access web UI:**
```bash
# Check container health
docker ps | grep vnc-desktop

# View logs
docker logs vnc-desktop --tail 50

# Test local access
docker exec vnc-desktop curl -f http://localhost:6080
```

### Game Streaming Issues

**"Failed to Connect to PC":**
1. Check Sunshine service is running on Windows
2. Verify firewall rules allow Sunshine
3. Test locally first: Use Windows VM's LAN IP
4. Check Twingate VPN connection

**High latency/stuttering:**
1. Lower bitrate in Sunshine settings
2. Use wired connection on both ends
3. Close background apps
4. Verify upload speed (need 20+ Mbps for 1080p60)

**Black screen:**
1. Verify GPU passthrough: Run `nvidia-smi` on Windows
2. Update NVIDIA drivers on Windows
3. Try desktop stream first before games

**Audio issues:**
1. In Sunshine: Configuration → Audio/Video
2. Select correct audio device
3. Check Windows default playback device

## Verification Checklist

### VNC Desktop
- [ ] VNC container running: `docker ps | grep vnc-desktop`
- [ ] Bootstrap completed: `docker logs vnc-desktop | grep "provisioning complete"`
- [ ] Web UI accessible: https://vnc.evindrake.net
- [ ] Desktop shortcuts visible
- [ ] Firefox launches
- [ ] Terminal opens
- [ ] File manager works
- [ ] Projects folder accessible

### Cloud Gaming
- [ ] Sunshine service running on Windows
- [ ] Firewall rules configured
- [ ] Game page loads: https://game.evindrake.net
- [ ] Windows KVM IP displayed correctly
- [ ] Moonlight client installed
- [ ] PC paired successfully
- [ ] Games/Desktop streaming works
- [ ] Latency < 10ms via Twingate

## Maintenance

### Update VNC Desktop Apps

1. Edit `services/vnc-desktop/Dockerfile`
2. Add new packages to `apt-get install` line
3. Rebuild image: `docker compose build vnc-desktop`
4. Redeploy: `docker compose up -d vnc-desktop`

### Update Sunshine

On Windows VM:
1. Download latest release
2. Run installer
3. Restart Sunshine service

### Backup VNC Settings

```bash
# Backup vnc_home volume
docker run --rm -v vnc_home:/data -v $(pwd):/backup \
    ubuntu tar czf /backup/vnc_home_backup.tar.gz /data
```

## Performance Tips

### VNC Desktop
- Resolution: Adjust via `RESOLUTION` env var (default: 1920x1080)
- Shared memory: Already set to 2GB for smooth performance
- For remote access: Use Twingate VPN for better speeds

### Game Streaming
- **Competitive Gaming**: 120 FPS, 10-15 Mbps bitrate
- **High Quality**: 60 FPS, 30-50 Mbps bitrate
- **4K Gaming**: 60 FPS, 50+ Mbps bitrate
- Always use Twingate or LAN for best latency (<5ms)

## Support Resources

- **VNC Desktop Docs**: `services/vnc-desktop/README.md`
- **Moonlight Setup Guide**: `services/dashboard/static/MOONLIGHT_SETUP.md`
- **Sunshine Docs**: https://docs.lizardbyte.dev/projects/sunshine/
- **Homelab Manager**: `./homelab-manager.sh` (unified control panel)

## Summary

✅ **VNC Desktop**: Custom Ubuntu environment with apps and shortcuts  
✅ **Cloud Gaming**: Moonlight/Sunshine streaming with RTX 3060  
✅ **Security**: VNC behind Caddy proxy, Sunshine via Twingate VPN  
✅ **Performance**: <5ms latency via direct connection  
✅ **Unified Control**: All managed via homelab-manager.sh  

Enjoy your enhanced homelab! 🚀
