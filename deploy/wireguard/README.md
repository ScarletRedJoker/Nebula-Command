# WireGuard Site-to-Site VPN Setup

## Network Topology

```
┌─────────────────────────────────────────────────────────────────────┐
│                        INTERNET                                      │
└────────────────────────────┬────────────────────────────────────────┘
                             │
         ┌───────────────────┴───────────────────┐
         │                                       │
         ▼                                       ▼
┌─────────────────────┐                 ┌─────────────────────┐
│   LINODE CLOUD      │                 │   LOCAL UBUNTU      │
│   69.164.211.205    │                 │   (Behind NAT)      │
│                     │                 │                     │
│   WireGuard Hub     │◄───────────────►│   WireGuard Peer    │
│   10.200.0.1/24     │    Encrypted    │   10.200.0.2/24     │
│   Port: 51820       │     Tunnel      │                     │
│                     │                 │                     │
│   Services:         │                 │   Services:         │
│   - Dashboard       │                 │   - Plex :32400     │
│   - Discord Bot     │                 │   - Home Asst :8123 │
│   - Stream Bot      │                 │   - Sunshine :47990 │
│   - n8n             │                 │   - MinIO :9000     │
│   - Caddy           │                 │                     │
└─────────────────────┘                 └─────────────────────┘
```

## Quick Setup

### Step 1: Run on Linode (Cloud Server)
```bash
cd /opt/homelab/HomeLabHub
sudo ./deploy/wireguard/setup-linode.sh
```

### Step 2: Run on Local Ubuntu Host
```bash
cd /path/to/HomeLabHub
sudo ./deploy/wireguard/setup-local.sh <LINODE_PUBLIC_KEY>
```

### Step 3: Update Caddyfile
After both ends are connected, update the Caddyfile to use WireGuard IP:
```
LOCAL_WIREGUARD_IP=10.200.0.2
```

## Manual Verification

Test connectivity:
```bash
# From Linode
ping 10.200.0.2

# From Local Ubuntu
ping 10.200.0.1
```

## Firewall Rules

Linode needs UDP port 51820 open:
```bash
sudo ufw allow 51820/udp
```
