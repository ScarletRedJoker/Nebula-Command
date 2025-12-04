#!/bin/bash
# Gaming Mode - Switch Windows VM to console session for Sunshine/Moonlight
# This disconnects any RDP sessions and enables GPU streaming

WINDOWS_VM_IP="${WINDOWS_VM_IP:-192.168.122.250}"
WINDOWS_USER="${WINDOWS_USER:-Evin}"

echo "=== Switching to Gaming Mode ==="
echo "Windows VM: $WINDOWS_VM_IP"

# Method 1: Try via SSH (requires OpenSSH server on Windows)
if ssh -o ConnectTimeout=5 -o StrictHostKeyChecking=no "$WINDOWS_USER@$WINDOWS_VM_IP" "query session" 2>/dev/null; then
    echo "Switching RDP session to console..."
    ssh "$WINDOWS_USER@$WINDOWS_VM_IP" "tscon 1 /dest:console" 2>/dev/null || \
    ssh "$WINDOWS_USER@$WINDOWS_VM_IP" "tscon 2 /dest:console" 2>/dev/null || \
    echo "Note: May already be on console or no active RDP session"
    
    echo "Starting Sunshine..."
    ssh "$WINDOWS_USER@$WINDOWS_VM_IP" "powershell -Command \"Start-Process 'C:\Program Files\Sunshine\sunshine.exe' -WorkingDirectory 'C:\Program Files\Sunshine'\"" &
    
    echo ""
    echo "Gaming mode activated!"
    echo "Connect with Moonlight to: $WINDOWS_VM_IP"
else
    # Method 2: Use virsh console commands
    echo "SSH not available. Trying virsh method..."
    
    # Check if VM is running
    if virsh list --name | grep -q "RDPWindows"; then
        echo "VM is running. Use virt-manager or RDP to run tscon manually:"
        echo ""
        echo "  In Windows PowerShell (as Admin):"
        echo "    tscon 1 /dest:console"
        echo "    cd 'C:\\Program Files\\Sunshine'"
        echo "    .\\sunshine.exe"
        echo ""
        echo "Then connect with Moonlight to: $WINDOWS_VM_IP"
    else
        echo "Starting VM..."
        virsh start RDPWindows
        sleep 30
        echo "VM started. Connect with Moonlight after Windows boots."
    fi
fi

echo ""
echo "=== Moonlight Connection Info ==="
echo "Host: $WINDOWS_VM_IP (local) or via WireGuard"
echo "Port: 47989 (TCP), 47998-48000 (UDP)"
