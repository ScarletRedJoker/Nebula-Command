#!/bin/bash
# NAS Diagnostic Script
# Run this to troubleshoot NAS mounting issues

RED='\033[0;31m'
GREEN='\033[0;32m'
YELLOW='\033[1;33m'
CYAN='\033[0;36m'
NC='\033[0m'

NAS_HOST="${1:-NAS326.local}"
MOUNT_BASE="/mnt/nas"

echo "═══════════════════════════════════════════════════════════════"
echo "  NAS Diagnostic - Zyxel NAS326"
echo "═══════════════════════════════════════════════════════════════"
echo ""
echo "Target: $NAS_HOST"
echo ""

# Step 1: Check hostname resolution
echo -e "${CYAN}[1/7] Hostname Resolution${NC}"
NAS_IP=$(getent hosts "$NAS_HOST" 2>/dev/null | awk '{print $1}' | head -1)
if [ -n "$NAS_IP" ]; then
    echo -e "${GREEN}[OK]${NC} $NAS_HOST resolves to $NAS_IP"
else
    echo -e "${YELLOW}[WARN]${NC} Cannot resolve $NAS_HOST via DNS"
    
    # Try mDNS
    NAS_IP=$(avahi-resolve -n "$NAS_HOST" 2>/dev/null | awk '{print $2}')
    if [ -n "$NAS_IP" ]; then
        echo -e "${GREEN}[OK]${NC} Resolved via mDNS: $NAS_IP"
    else
        echo -e "${RED}[FAIL]${NC} Cannot resolve hostname"
        echo ""
        echo "Try running with IP address:"
        echo "  ./diagnose-nas.sh 192.168.x.x"
        echo ""
        echo "Or check your network:"
        echo "  - Is NAS powered on?"
        echo "  - Is NAS on same network as this computer?"
        echo "  - Try: arp -a | grep -i zyxel"
    fi
fi

# Step 2: Ping test
echo ""
echo -e "${CYAN}[2/7] Network Connectivity${NC}"
if [ -n "$NAS_IP" ]; then
    if ping -c 2 -W 2 "$NAS_IP" &>/dev/null; then
        echo -e "${GREEN}[OK]${NC} NAS is reachable at $NAS_IP"
    else
        echo -e "${RED}[FAIL]${NC} Cannot ping $NAS_IP"
        echo "  Check: firewall, network cables, NAS power"
    fi
else
    echo -e "${YELLOW}[SKIP]${NC} No IP to test"
fi

# Step 3: Check NFS ports
echo ""
echo -e "${CYAN}[3/7] NFS Service Ports${NC}"
if [ -n "$NAS_IP" ]; then
    if nc -z -w2 "$NAS_IP" 2049 2>/dev/null; then
        echo -e "${GREEN}[OK]${NC} NFS port 2049 is open"
    else
        echo -e "${RED}[FAIL]${NC} NFS port 2049 is closed"
        echo "  → NFS may not be enabled on the NAS"
        echo "  → Check NAS web interface → Control Panel → NFS"
    fi
    
    if nc -z -w2 "$NAS_IP" 111 2>/dev/null; then
        echo -e "${GREEN}[OK]${NC} RPC port 111 is open"
    else
        echo -e "${YELLOW}[WARN]${NC} RPC port 111 is closed (may still work)"
    fi
else
    echo -e "${YELLOW}[SKIP]${NC} No IP to test"
fi

# Step 4: Check SMB ports (alternative protocol)
echo ""
echo -e "${CYAN}[4/7] SMB Service Ports (alternative)${NC}"
if [ -n "$NAS_IP" ]; then
    if nc -z -w2 "$NAS_IP" 445 2>/dev/null; then
        echo -e "${GREEN}[OK]${NC} SMB port 445 is open (can use CIFS instead)"
    else
        echo -e "${YELLOW}[INFO]${NC} SMB port 445 is closed"
    fi
else
    echo -e "${YELLOW}[SKIP]${NC} No IP to test"
fi

# Step 5: Check NFS exports
echo ""
echo -e "${CYAN}[5/7] NFS Exports${NC}"
if [ -n "$NAS_IP" ]; then
    echo "Querying NFS exports from $NAS_IP..."
    exports=$(showmount -e "$NAS_IP" 2>&1)
    if [ $? -eq 0 ]; then
        echo -e "${GREEN}[OK]${NC} NFS exports available:"
        echo "$exports" | sed 's/^/    /'
        
        if echo "$exports" | grep -q "networkshare"; then
            echo -e "${GREEN}[OK]${NC} Found 'networkshare' export"
        else
            echo -e "${YELLOW}[WARN]${NC} 'networkshare' not found in exports"
            echo "  You may need to use a different share path"
        fi
    else
        echo -e "${RED}[FAIL]${NC} Cannot query NFS exports"
        echo "$exports" | sed 's/^/    /'
        echo ""
        echo "  Possible causes:"
        echo "  - NFS not enabled on NAS"
        echo "  - Firewall blocking RPC (port 111)"
        echo "  - No shares configured for NFS"
    fi
else
    echo -e "${YELLOW}[SKIP]${NC} No IP to test"
fi

# Step 6: Check current mounts
echo ""
echo -e "${CYAN}[6/7] Current Mount Status${NC}"
if mountpoint -q "$MOUNT_BASE/all" 2>/dev/null; then
    echo -e "${GREEN}[MOUNTED]${NC} $MOUNT_BASE/all is mounted"
    df -h "$MOUNT_BASE/all"
    echo ""
    echo "Contents:"
    ls -la "$MOUNT_BASE/all" 2>/dev/null | head -10
else
    echo -e "${YELLOW}[NOT MOUNTED]${NC} $MOUNT_BASE/all is not mounted"
fi

# Check fstab
echo ""
echo "fstab entries for NAS:"
grep -i "nas\|nfs\|networkshare" /etc/fstab 2>/dev/null || echo "  (none found)"

# Step 7: Recommendations
echo ""
echo -e "${CYAN}[7/7] Recommendations${NC}"
echo ""

if [ -n "$NAS_IP" ]; then
    # Check if NFS is working
    if nc -z -w2 "$NAS_IP" 2049 2>/dev/null; then
        echo "NFS appears to be running. Try mounting manually:"
        echo ""
        echo "  sudo mount -t nfs -o vers=3,soft,timeo=150 ${NAS_IP}:/nfs/networkshare /mnt/nas/all"
        echo ""
        echo "Or run the setup script with the IP:"
        echo ""
        echo "  sudo ./setup-nas-mounts.sh --nas-ip=${NAS_IP}"
    elif nc -z -w2 "$NAS_IP" 445 2>/dev/null; then
        echo "NFS is not available but SMB is. Consider using CIFS mount:"
        echo ""
        echo "  sudo apt install cifs-utils"
        echo "  sudo mount -t cifs //${NAS_IP}/nfs /mnt/nas/all -o guest"
        echo ""
        echo "Or enable NFS on your NAS:"
        echo "  1. Open NAS web interface: http://${NAS_IP}"
        echo "  2. Go to Control Panel → NFS"
        echo "  3. Enable NFS service"
        echo "  4. Add /nfs/networkshare as an export"
    else
        echo "NAS is reachable but no file sharing services detected."
        echo ""
        echo "Please enable NFS or SMB on your Zyxel NAS326:"
        echo "  1. Open NAS web interface: http://${NAS_IP}"
        echo "  2. Go to Control Panel → NFS or SMB/CIFS"
        echo "  3. Enable the service"
    fi
else
    echo "Cannot reach NAS. Please check:"
    echo "  1. NAS is powered on"
    echo "  2. NAS is connected to the same network"
    echo "  3. Find NAS IP: check router admin or NAS display"
    echo "  4. Run: ./diagnose-nas.sh <NAS_IP>"
fi

echo ""
echo "═══════════════════════════════════════════════════════════════"
