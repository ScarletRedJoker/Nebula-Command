#!/bin/bash
# Emergency NAS Unmount - Run this when Docker is hanging due to NAS issues
# For ZyXEL NAS326 with single networkshare mounted at /srv/media

echo "Force unmounting NAS..."

# Force lazy unmount - clears stale mounts without hanging
sudo umount -l /srv/media 2>/dev/null || true

# Also clean up any legacy mount points if they exist
sudo umount -l /mnt/nas/all 2>/dev/null || true
sudo umount -l /mnt/nas 2>/dev/null || true

echo "Done. Docker commands should work now."
echo ""
echo "To remount NAS when it's back online:"
echo "  sudo mount /srv/media"
echo ""
echo "To restart Plex:"
echo "  docker compose up -d plex"
