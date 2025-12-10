# Intel N100 as Combined Router + Plex Server

## TL;DR

**Yes, an Intel N100 can work as both a router and Plex server**, but with important considerations.

## Hardware Requirements

### Minimum Specs for Dual-Purpose
- **CPU**: Intel N100 (4 cores, Quick Sync for hardware transcoding)
- **RAM**: 16GB minimum (8GB is too tight for both roles)
- **NICs**: Dual 2.5GbE or better (one WAN, one LAN)
- **Storage**: 
  - NVMe for OS + Plex metadata (256GB+)
  - Separate storage for media (NAS or additional drive)

### Recommended Mini PCs
- **Topton N100** with dual 2.5GbE (~$150-200)
- **Beelink EQ12** with dual LAN
- **CWWK N100** with 4x 2.5GbE (ideal for VLANs)

## Architecture Options

### Option A: Proxmox with VMs (Recommended)
```
N100 Mini PC
├── Proxmox VE (hypervisor)
│   ├── OPNsense/pfSense VM (router)
│   │   └── WAN: NIC1, LAN: NIC2
│   └── Ubuntu VM (Plex + services)
│       └── Bridge to LAN
└── Physical: NVMe + optional 4TB for media
```

**Pros:**
- Clean separation of concerns
- Can snapshot/backup each VM
- Router doesn't depend on Plex

**Cons:**
- More complex setup
- Some CPU overhead

### Option B: Docker on Ubuntu (Simpler)
```
N100 Mini PC
├── Ubuntu Server
│   ├── Docker
│   │   ├── Plex
│   │   ├── cloudflared
│   │   └── homelab services
│   └── Router software (OpenWrt/VyOS in container)
└── Current router as AP only
```

**Pros:**
- Simpler to manage
- Less overhead

**Cons:**
- Router and Plex share resources
- Single point of failure

### Option C: Keep Routing Separate
```
Current Setup (Recommended for reliability):
├── Existing router (keep as router)
└── N100 Mini PC
    ├── Ubuntu/Proxmox
    └── Plex + homelab services
```

**Pros:**
- Most reliable
- Router is dedicated hardware
- Easier to troubleshoot

**Cons:**
- Extra device
- Doesn't consolidate

## Performance Expectations

### Plex Performance on N100
| Scenario | Capability |
|----------|------------|
| Direct Play 4K | ✅ Excellent (no CPU use) |
| 1x 4K Transcode | ✅ Good (Quick Sync) |
| 2x 4K Transcode | ⚠️ Marginal |
| 3x 1080p Transcode | ✅ Good |
| 4+ Transcodes | ❌ Not recommended |

### Routing Performance
| Scenario | Capability |
|----------|------------|
| 1Gbps NAT | ✅ Easy |
| 2.5Gbps NAT | ✅ Good |
| VPN (WireGuard 1Gbps) | ✅ Good |
| Deep packet inspection | ⚠️ May impact Plex |

## Setup Instructions

### For Proxmox + OPNsense + Plex VM

1. **Install Proxmox VE** on the N100
2. **Create OPNsense VM**
   - 2 vCPUs, 2GB RAM
   - Pass through both NICs (PCI passthrough)
   - Configure WAN/LAN interfaces
3. **Create Ubuntu VM**
   - 2 vCPUs, 8GB RAM
   - Bridge to LAN network
   - Install Docker + Plex
4. **Set current router to AP mode**
   - Disable DHCP
   - Connect to N100's LAN port

### For Docker-Only Approach

1. **Install Ubuntu Server** on N100
2. **Configure networking**
   ```bash
   # /etc/netplan/00-config.yaml
   network:
     ethernets:
       enp1s0:  # WAN
         dhcp4: true
       enp2s0:  # LAN
         addresses: [192.168.1.1/24]
   ```
3. **Enable IP forwarding**
   ```bash
   echo "net.ipv4.ip_forward=1" >> /etc/sysctl.conf
   sysctl -p
   ```
4. **Install Docker + Plex**
5. **Configure firewall/NAT** (nftables or iptables)

## Thermals & Reliability

### Cooling Considerations
- N100 TDP is 6W but can spike to 25W under load
- Ensure good passive cooling or quiet fan
- Monitor temps: `sensors` command
- Target: < 70°C under load

### Reliability Tips
- Use quality power supply (USB-C PD or barrel)
- Consider UPS for clean shutdown
- Set up watchdog for auto-reboot on hang
- Enable SMART monitoring on storage

## Recommendation

For your use case (gaming workstation + Plex + reliable network):

**Keep routing separate.** Here's why:

1. Your workstation needs **reliable, low-latency** internet for gaming
2. If Plex transcoding spikes CPU, it could add latency to routing
3. If the N100 needs maintenance, you lose both internet AND Plex
4. Debugging network issues is easier with dedicated router

**Better approach:**
```
Current router → Keep as-is for routing
N100 Mini PC  → Dedicated Plex + homelab services
Ubuntu Workstation → Gaming + productivity (no services)
```

This gives you:
- Router handles network (reliable, dedicated)
- N100 handles Plex (can reboot without losing internet)
- Workstation is clean for gaming (no background services)

## Future: TrueNAS + Proxmox

If you want to consolidate storage too:

```
Future Setup:
├── NAS/Server (TrueNAS or Proxmox)
│   ├── ZFS storage pool (multiple drives)
│   ├── Plex VM
│   └── All homelab services
├── Router (keep dedicated)
└── Workstation (gaming only)
```

This separates:
- **Network** (router) - reliability critical
- **Storage + Services** (server) - can tolerate restarts
- **Workstation** (gaming) - clean for performance
