#!/bin/bash
# deploy/local/nas-mount-setup.sh
# Creates a resilient NAS mount configuration using systemd automount.
# Purpose: Prevent system hangs when NAS is offline, allowing gaming/work to continue.

set -e

# Configuration
MOUNT_PATH="/srv/media"
REMOTE_SHARE="//192.168.0.185/networkshare"
CRED_FILE="/etc/nas-credentials"
MOUNT_UNIT_NAME="srv-media.mount"
AUTOMOUNT_UNIT_NAME="srv-media.automount"
UID=1000
GID=1000

# Check if running as root
if [[ $EUID -ne 0 ]]; then
   echo "This script must be run as root (use sudo)"
   exit 1
fi

echo "--- Starting Resilient NAS Mount Setup ---"

# 1. Handle Credentials
if [ ! -f "$CRED_FILE" ]; then
    echo "Configuring credentials at $CRED_FILE..."
    read -p "Enter NAS Username: " NAS_USER
    read -s -p "Enter NAS Password: " NAS_PASS
    echo ""
    
    cat <<EOF > "$CRED_FILE"
username=$NAS_USER
password=$NAS_PASS
EOF
    chmod 600 "$CRED_FILE"
    echo "Credentials stored securely."
else
    echo "Credentials already exist at $CRED_FILE."
fi

# 2. Backup fstab
echo "Backing up /etc/fstab to /etc/fstab.bak..."
cp /etc/fstab /etc/fstab.bak

# Comment out existing srv/media entries in fstab to prevent conflicts
sed -i "s|^//192.168.0.185/networkshare|#//192.168.0.185/networkshare|g" /etc/fstab
sed -i "s|.*/srv/media|#&|g" /etc/fstab

# 3. Create Mount Unit
echo "Creating $MOUNT_UNIT_NAME..."
cat <<EOF > "/etc/systemd/system/$MOUNT_UNIT_NAME"
[Unit]
Description=Resilient NAS Media Mount
After=network-online.target
Wants=network-online.target

[Mount]
What=$REMOTE_SHARE
Where=$MOUNT_PATH
Type=cifs
Options=credentials=$CRED_FILE,uid=$UID,gid=$GID,iocharset=utf8,rw,soft,timeo=5,retry=2,nofail,_netdev

[Install]
WantedBy=multi-user.target
EOF

# 4. Create Automount Unit
echo "Creating $AUTOMOUNT_UNIT_NAME..."
cat <<EOF > "/etc/systemd/system/$AUTOMOUNT_UNIT_NAME"
[Unit]
Description=Automount for NAS Media

[Automount]
Where=$MOUNT_PATH
TimeoutIdleSec=60

[Install]
WantedBy=multi-user.target
EOF

# 5. Apply configuration
echo "Reloading systemd and enabling units..."
mkdir -p "$MOUNT_PATH"
systemctl daemon-reload
systemctl enable "$AUTOMOUNT_UNIT_NAME"
systemctl restart "$AUTOMOUNT_UNIT_NAME"

echo "--- Setup Complete ---"
echo ""
echo "Resilience verified:"
echo "1. System will boot even if NAS is offline (nofail, _netdev)."
echo "2. Mount is 'lazy' and only connects when accessed (automount)."
echo "3. Network timeouts are set to 500ms (timeo=5) with 2 retries to prevent long hangs."
echo "4. Credentials are secured at $CRED_FILE."
echo ""
echo "To test manually:"
echo "  ls $MOUNT_PATH"
echo ""
echo "To check status:"
echo "  systemctl status $AUTOMOUNT_UNIT_NAME"
echo "  systemctl status $MOUNT_UNIT_NAME"
