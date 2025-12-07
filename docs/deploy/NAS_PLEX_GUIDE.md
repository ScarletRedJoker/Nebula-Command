# NAS and Plex Media Server Guide

This guide covers setting up NAS storage for Plex media and troubleshooting common issues.

## NAS Configuration

### Hardware
- **NAS Model**: Zyxel NAS326
- **NAS IP**: 192.168.0.176
- **Hostname**: NAS326.local
- **Protocol**: NFS (preferred) or SMB/CIFS

### Media Folders on NAS
| Folder | Content | Plex Library Type |
|--------|---------|-------------------|
| `/video` | Movies & TV Shows | Movies / TV Shows |
| `/music` | Audio files | Music |
| `/photo` | Images | Photos |
| `/games` | Game files | N/A |

## Setting Up NAS Mounts

### Automatic Setup
```bash
cd /home/evin/contain/HomeLabHub
git pull

# Auto-discover and mount NAS
sudo ./deploy/local/scripts/discover-nas.sh --auto-mount

# Or specify NAS IP directly
sudo ./deploy/local/scripts/setup-nas-mounts.sh --nas-ip=192.168.0.176
```

### Manual Setup
```bash
# Install NFS utilities
sudo apt-get install nfs-common

# Create mount point
sudo mkdir -p /mnt/nas/all

# Mount NFS share (read-write enabled)
sudo mount -t nfs -o rw,nfsvers=3 192.168.0.176:/nfs/networkshare /mnt/nas/all

# Verify mount
ls -la /mnt/nas/all
```

### Check Mount Status
```bash
sudo ./deploy/local/scripts/setup-nas-mounts.sh --status

# Or manually
mount | grep nas
df -h /mnt/nas/all
```

## Plex Media Server

### Access
- **Web UI**: https://plex.evindrake.net (via Caddy reverse proxy)
- **Direct Access**: http://192.168.0.x:32400/web (from local network)
- **Container Name**: plex

### Plex Library Paths (Inside Container)
When adding libraries in Plex, use these container paths:

| Media Type | Container Path |
|------------|----------------|
| Movies | `/nas/video` |
| TV Shows | `/nas/video` |
| Music | `/nas/music` |
| Photos | `/nas/photo` |

### Starting Plex
```bash
cd /home/evin/contain/HomeLabHub

# Start all local services including Plex
./deploy/local/start-local-services.sh

# Or start Plex individually
docker-compose -f deploy/local/docker-compose.yml up -d plex
```

### Plex Container Configuration
```yaml
plex:
  image: lscr.io/linuxserver/plex:latest
  container_name: plex
  network_mode: host
  environment:
    - PUID=1000
    - PGID=1000
    - TZ=America/New_York
  volumes:
    - plex_config:/config
    - plex_transcode:/transcode
    # NAS media mounts (read-only for safety)
    - /mnt/nas/networkshare/video:/nas/video:ro
    - /mnt/nas/networkshare/music:/nas/music:ro
    - /mnt/nas/networkshare/photo:/nas/photo:ro
```

## Uploading Files to NAS

### Why Plex Volumes are Read-Only
Plex container mounts NAS with `:ro` (read-only) for safety:
- Prevents accidental deletion of media
- Plex only needs to read files, not write
- Protects against container security issues

### How to Upload to NAS

#### Option 1: Direct NFS Mount (Recommended)
The NFS share is mounted read-write at `/mnt/nas/all` with a symlink at `/mnt/nas/networkshare`:
```bash
# Copy files to NAS (use either path - they point to the same location)
cp /path/to/movie.mkv /mnt/nas/networkshare/video/
# or
cp /path/to/movie.mkv /mnt/nas/all/video/

# Or use rsync for large transfers
rsync -avP /path/to/media/ /mnt/nas/networkshare/video/
```

#### Option 2: SMB/CIFS from Windows/Mac
1. Open file browser
2. Connect to: `\\192.168.0.176\networkshare` or `smb://192.168.0.176/networkshare`
3. Login with NAS credentials
4. Drag and drop files

#### Option 3: NAS Web Interface
1. Go to NAS admin panel: `http://192.168.0.176`
2. Login as admin
3. Use File Manager to upload

#### Option 4: Dashboard API
The Nebula Dashboard provides a file copy API:
```bash
# Using the NAS service endpoint
curl -X POST https://dashboard.evindrake.net/api/nas/upload \
  -H "Authorization: Bearer $TOKEN" \
  -F "file=@movie.mkv" \
  -F "dest_folder=networkshare/video"
```

## Troubleshooting

### NAS Won't Mount

#### Check NAS is reachable
```bash
ping 192.168.0.176
```

#### Check NFS exports on NAS
```bash
showmount -e 192.168.0.176
```
Expected output:
```
Export list for 192.168.0.176:
/nfs/networkshare *
```

#### Check NFS service on NAS
Access NAS admin panel and ensure:
1. NFS service is enabled
2. Share is exported with proper permissions
3. Export allows your host's IP

### Permission Denied When Uploading

#### Check mount options
```bash
mount | grep nas
```
Should show `rw` (read-write), not `ro`.

#### Re-mount with write access
```bash
sudo umount /mnt/nas/all
sudo mount -t nfs -o rw 192.168.0.176:/nfs/networkshare /mnt/nas/all
```

#### NAS Export Settings
On Zyxel NAS326:
1. Go to Control Panel → Shared Folder
2. Select networkshare → NFS Permission
3. Ensure "Read/Write" is enabled
4. Set "Squash" to "No Mapping" or "Map to admin"

### Plex Can't Find Media

#### Verify NAS is mounted
```bash
ls -la /mnt/nas/networkshare/video
```

#### Check Plex container mounts
```bash
docker inspect plex | grep -A 20 "Mounts"
```

#### Restart Plex after mounting NAS
```bash
docker restart plex
```

#### Scan Library in Plex
1. Go to Plex Web UI
2. Settings → Libraries
3. Click "Scan Library Files"

### Plex Slow Performance

#### Enable hardware transcoding
Ensure `/dev/dri` is passed to container (already in docker-compose).

#### Check transcoder directory
```bash
docker exec plex ls -la /transcode
```

#### Monitor Plex logs
```bash
docker logs -f plex
```

## Maintenance

### Refresh Plex Libraries
```bash
# Force library scan
docker exec plex /usr/lib/plexmediaserver/Plex\ Media\ Scanner --scan --refresh
```

### Backup Plex Configuration
```bash
# Backup Plex database
docker run --rm -v plex_config:/config -v $(pwd):/backup alpine \
  tar cvf /backup/plex-config-backup.tar /config
```

### Update Plex
```bash
docker-compose -f deploy/local/docker-compose.yml pull plex
docker-compose -f deploy/local/docker-compose.yml up -d plex
```

## Quick Reference

| Task | Command |
|------|---------|
| Mount NAS | `sudo ./deploy/local/scripts/setup-nas-mounts.sh` |
| Check mount | `mount \| grep nas` |
| Start Plex | `docker-compose -f deploy/local/docker-compose.yml up -d plex` |
| Plex logs | `docker logs -f plex` |
| Upload file | `cp file.mkv /mnt/nas/all/networkshare/video/` |
| Restart Plex | `docker restart plex` |
