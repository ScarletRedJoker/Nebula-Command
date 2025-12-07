#!/bin/bash
set -e

echo "=== GNOME File Manager Bookmark Setup ==="
echo ""

BOOKMARKS_FILE="$HOME/.config/gtk-3.0/bookmarks"

echo "Step 1: Backing up current bookmarks..."
if [ -f "$BOOKMARKS_FILE" ]; then
    cp "$BOOKMARKS_FILE" "$BOOKMARKS_FILE.backup.$(date +%Y%m%d_%H%M%S)"
    echo "  Backup created at: $BOOKMARKS_FILE.backup.*"
    echo ""
    echo "  Current bookmarks:"
    cat "$BOOKMARKS_FILE" | while read line; do
        echo "    - $line"
    done
else
    echo "  No existing bookmarks file found."
fi

echo ""
echo "Step 2: Installing required packages for AFP and Google Drive..."
sudo apt update
sudo apt install -y gvfs-backends gvfs-fuse gnome-online-accounts

echo ""
echo "Step 3: Clearing old bookmarks and adding NAS..."

read -p "Enter your NAS IP address [192.168.0.176]: " NAS_IP
NAS_IP=${NAS_IP:-192.168.0.176}

read -p "Enter your NAS share name [nfs]: " NAS_SHARE
NAS_SHARE=${NAS_SHARE:-nfs}

read -p "Enter your NAS username [admin]: " NAS_USER
NAS_USER=${NAS_USER:-admin}

echo ""
echo "Choose connection protocol:"
echo "  1) AFP (Apple Filing Protocol) - recommended if this works for you"
echo "  2) SMB (Windows/Samba) - more widely compatible"
read -p "Enter choice [1]: " PROTOCOL_CHOICE
PROTOCOL_CHOICE=${PROTOCOL_CHOICE:-1}

if [ "$PROTOCOL_CHOICE" = "1" ]; then
    NAS_URL="afp://$NAS_USER@$NAS_IP/$NAS_SHARE"
    PROTOCOL_NAME="AFP"
else
    NAS_URL="smb://$NAS_USER@$NAS_IP/$NAS_SHARE"
    PROTOCOL_NAME="SMB"
fi

echo ""
echo "Creating new bookmarks file with NAS entry..."

mkdir -p "$(dirname "$BOOKMARKS_FILE")"
cat > "$BOOKMARKS_FILE" << EOF
$NAS_URL NAS ($PROTOCOL_NAME)
EOF

echo "  Added: $NAS_URL as 'NAS ($PROTOCOL_NAME)'"

echo ""
echo "Step 4: Restart GNOME Files to apply changes..."
nautilus -q 2>/dev/null || true
sleep 1

echo ""
echo "=== BOOKMARK SETUP COMPLETE ==="
echo ""
echo "Your new bookmarks:"
cat "$BOOKMARKS_FILE"
echo ""
echo "=== NEXT: Google Drive Setup ==="
echo ""
echo "To add Google Drive with read/write access:"
echo ""
echo "1. Open Settings -> Online Accounts"
echo "   OR run: gnome-control-center online-accounts"
echo ""
echo "2. Click 'Google'"
echo ""
echo "3. Sign in with your Google account"
echo ""
echo "4. Make sure 'Files' toggle is ON (this enables Drive access)"
echo ""
echo "5. Your Google Drive will appear in the Files sidebar!"
echo ""
echo "Would you like to open GNOME Online Accounts now?"
read -p "Open settings? [y/N]: " OPEN_SETTINGS
if [[ "$OPEN_SETTINGS" =~ ^[Yy]$ ]]; then
    gnome-control-center online-accounts &
fi

echo ""
echo "=== MANUAL TEST ==="
echo ""
echo "To test your NAS connection, open Files and click 'NAS ($PROTOCOL_NAME)' in the sidebar."
echo "You'll be prompted for your NAS password."
echo ""
echo "For read/write access on AFP, make sure your NAS user has write permissions on the share."
echo ""
