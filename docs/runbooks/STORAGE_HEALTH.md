# Storage Health Monitoring Runbook

This runbook covers storage health monitoring, disk diagnostics, and ZFS migration for HomeLabHub.

## Quick Commands

```bash
# Check all storage health
./deploy/local/scripts/storage-health.sh

# Inventory all disks
./deploy/local/scripts/disk-inventory.sh

# Start storage monitor service
docker compose --profile monitoring up -d storage-monitor smartctl-exporter

# Check monitor status
curl http://localhost:9634/status
```

## Storage Monitor Service

The storage monitor runs as a Docker container and:
- Checks SMART health every hour (configurable)
- Monitors ZFS pool status (if enabled)
- Sends Discord alerts on issues
- Exports Prometheus metrics

### Environment Variables

| Variable | Default | Description |
|----------|---------|-------------|
| `ZFS_ENABLED` | false | Enable ZFS pool monitoring |
| `STORAGE_CHECK_INTERVAL` | 3600 | Seconds between checks |
| `STORAGE_ALERT_DISCORD_WEBHOOK` | - | Discord webhook for alerts |
| `SMART_THRESHOLD_REALLOCATED` | 5 | Alert if reallocated sectors exceed |
| `SMART_THRESHOLD_PENDING` | 1 | Alert if pending sectors exceed |

### API Endpoints

| Endpoint | Description |
|----------|-------------|
| GET /health | Service health check |
| GET /status | Current disk status |
| GET /check | Force immediate health check |
| GET /disks | List detected disks |
| GET /metrics | Prometheus metrics |

## SMART Monitoring

### Check Individual Disk

```bash
# Full SMART info
sudo smartctl -a /dev/sda

# Quick health test
sudo smartctl -H /dev/sda

# Run short self-test
sudo smartctl -t short /dev/sda

# Run extended self-test (takes hours)
sudo smartctl -t long /dev/sda
```

### Critical SMART Attributes

| Attribute | Warning If | Description |
|-----------|-----------|-------------|
| Reallocated_Sector_Ct | > 5 | Bad sectors remapped |
| Current_Pending_Sector | > 0 | Unstable sectors awaiting remap |
| Offline_Uncorrectable | > 0 | Sectors unreadable offline |
| UDMA_CRC_Error_Count | > 0 | Cable/connection issues |
| Temperature_Celsius | > 50°C | Overheating |

### Disk Failing Signs

🔴 **Replace immediately if:**
- SMART Health Status: FAILED
- Reallocated sectors rapidly increasing
- Pending sectors not clearing after writes
- Audible clicking or grinding

🟡 **Monitor closely if:**
- Low but stable reallocated sector count
- Temperature consistently high
- Power-on hours > 40,000 (5+ years)

## ZFS Migration

ZFS provides checksums, scrubbing, snapshots, and easy expansion - highly recommended for NAS storage.

### Install ZFS (Ubuntu)

```bash
sudo apt install zfsutils-linux
```

### Create ZFS Mirror (2 disks)

```bash
# Identify disks by ID (more reliable than /dev/sdX)
ls -la /dev/disk/by-id/

# Create mirror pool
sudo zpool create \
  -o ashift=12 \
  -O compression=lz4 \
  -O atime=off \
  -O xattr=sa \
  -O acltype=posixacl \
  nas-pool mirror \
  /dev/disk/by-id/ata-DISK1 \
  /dev/disk/by-id/ata-DISK2

# Create datasets
sudo zfs create nas-pool/media
sudo zfs create nas-pool/media/movies
sudo zfs create nas-pool/media/shows
sudo zfs create nas-pool/media/music
sudo zfs create nas-pool/backups
```

### ZFS Maintenance

```bash
# Check pool status
zpool status

# Scrub pool (check all checksums)
sudo zpool scrub nas-pool

# Check scrub progress
zpool status nas-pool

# List snapshots
zfs list -t snapshot

# Create snapshot
sudo zfs snapshot nas-pool/media@$(date +%Y%m%d)

# List all datasets
zfs list
```

### Replace Failing Disk in ZFS

```bash
# Take failing disk offline
sudo zpool offline nas-pool /dev/disk/by-id/ata-OLD_DISK

# Physically replace the disk

# Replace in ZFS (starts resilver)
sudo zpool replace nas-pool /dev/disk/by-id/ata-OLD_DISK /dev/disk/by-id/ata-NEW_DISK

# Monitor resilver progress
watch zpool status
```

## Disk Space Alerts

The storage monitor checks disk usage and alerts when:
- 🟡 Usage > 85% - Warning
- 🔴 Usage > 95% - Critical

### Free Up Space

```bash
# Find large files
sudo du -h --max-depth=2 / | sort -rh | head -20

# Find old Docker images
docker system df
docker image prune -a

# Clear journal logs older than 7 days
sudo journalctl --vacuum-time=7d

# Check Plex transcodes (should be tmpfs)
df -h /transcode
```

## NAS Health Checks

### Check NAS Mount Status

```bash
# View NAS mounts
mount | grep -E "(nfs|cifs)"

# Test NAS connectivity
ping -c 3 $NAS_HOST

# Check mount is writable
touch /mnt/nas/networkshare/.homelab-test && rm /mnt/nas/networkshare/.homelab-test
```

### Remount NAS

```bash
# Unmount
sudo umount /mnt/nas/networkshare

# Remount
sudo mount -a

# Or run setup script
sudo ./deploy/local/scripts/setup-nas-mounts.sh
```

## Prometheus Metrics

The storage monitor exports these metrics:

```
storage_disk_health{device, model}                 # 1=healthy, 0=warning, -1=failing
storage_disk_temperature_celsius{device}           # Temperature
storage_disk_reallocated_sectors{device}           # Reallocated count
storage_disk_pending_sectors{device}               # Pending count
storage_zfs_pool_health{pool}                      # 1=online, 0=degraded, -1=faulted
storage_alerts_total{severity}                     # Alert counter
```

Add to Prometheus scrape config:
```yaml
- job_name: 'storage'
  static_configs:
    - targets: ['localhost:9634']
```

## Emergency Recovery

### Disk Won't Mount

```bash
# Check filesystem
sudo fsck -n /dev/sda1

# Force repair (data may be lost)
sudo fsck -y /dev/sda1
```

### ZFS Pool Degraded

```bash
# Check what's wrong
zpool status -v

# Clear transient errors
sudo zpool clear nas-pool

# If disk truly failed, replace it (see above)
```

### Complete Disk Failure

1. **Don't panic** - If ZFS mirror, data is safe on second disk
2. Document serial numbers and error messages
3. Order replacement disk (same size or larger)
4. Replace and resilver (see ZFS section)
