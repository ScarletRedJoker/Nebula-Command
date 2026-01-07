# Residential Networking Setup for Spectrum ISP

This guide covers setting up robust external access for a homelab on a residential Spectrum connection.

## Prerequisites Checklist

- [ ] Spectrum modem/router access (admin credentials)
- [ ] Static LAN IP for your homelab server (recommended: 192.168.1.100)
- [ ] Cloudflare account with API token
- [ ] Domain pointed to Cloudflare nameservers

## Step 1: Set Static LAN IP on Homelab Server

Edit your netplan config (Ubuntu):

```bash
sudo nano /etc/netplan/01-network-manager-all.yaml
```

```yaml
network:
  version: 2
  ethernets:
    enp0s3:  # Replace with your interface name (check with: ip link)
      dhcp4: no
      addresses:
        - 192.168.1.100/24
      gateway4: 192.168.1.1
      nameservers:
        addresses: [1.1.1.1, 8.8.8.8]
```

Apply: `sudo netplan apply`

## Step 2: Configure Router Port Forwarding

Access your Spectrum router at `192.168.1.1` (default admin password on router label).

Add these port forwards to your homelab server (192.168.1.100):

| Service | External Port | Internal Port | Protocol |
|---------|--------------|---------------|----------|
| HTTP    | 80           | 80            | TCP      |
| HTTPS   | 443          | 443           | TCP      |
| Plex    | 32400        | 32400         | TCP      |

**Spectrum Router Path:** Advanced > Port Forwarding > Add

## Step 3: Verify No CGNAT (Carrier-Grade NAT)

Check if you're behind CGNAT:

```bash
# Your public IP
curl -s https://api.ipify.org

# Your router's WAN IP (if different, you're behind CGNAT)
# Check in router admin panel under WAN/Internet settings
```

If behind CGNAT:
- Call Spectrum and request a "public/routable IP address"
- They may offer this for free or small fee
- Alternative: Use Cloudflare Tunnel (bypasses need for port forwarding)

## Step 4: Install Dynamic DNS

Spectrum residential IPs can change. Install automatic DNS updates:

```bash
cd /opt/homelab/HomeLabHub
chmod +x scripts/ddns-update.sh scripts/install-ddns-cron.sh
./scripts/install-ddns-cron.sh
```

This checks your IP every 5 minutes and updates Cloudflare if it changes.

## Step 5: Verify External Access

```bash
cd /opt/homelab/HomeLabHub/deploy/local
./deploy.sh port-check
```

Expected output:
```
Checking port 80 (HTTP)... accessible ✓
Checking port 443 (HTTPS)... accessible ✓
Checking port 32400 (Plex)... accessible ✓
```

## Step 6: Test Services

```bash
# From outside your network (phone on cellular, or use online tools)
curl -I https://plex.evindrake.net
curl -I https://home.evindrake.net
```

## Troubleshooting

### Ports Not Accessible

1. **Firewall blocking:** Check UFW/iptables on homelab server
   ```bash
   sudo ufw status
   sudo ufw allow 80/tcp
   sudo ufw allow 443/tcp
   sudo ufw allow 32400/tcp
   ```

2. **Router firewall:** Some routers have separate firewall settings
   - Disable SIP ALG if having issues with certain ports
   - Check "DMZ" option as last resort (less secure)

3. **ISP blocking ports:** Spectrum sometimes blocks port 80/443
   - Try alternative ports (8080, 8443) with Caddy config adjustment
   - Or use Cloudflare Tunnel

### DNS Not Resolving

```bash
# Check what Cloudflare sees
dig plex.evindrake.net +short

# Force DNS refresh
./deploy.sh dns-sync
```

### Services Accessible Locally But Not Externally

This usually means port forwarding isn't working:
1. Double-check router port forward rules
2. Verify homelab server IP matches router config
3. Try temporarily disabling server firewall to test

## Alternative: Cloudflare Tunnel (No Port Forwarding Needed)

If port forwarding doesn't work or you're behind CGNAT:

```bash
# Install cloudflared
curl -L --output cloudflared.deb https://github.com/cloudflare/cloudflared/releases/latest/download/cloudflared-linux-amd64.deb
sudo dpkg -i cloudflared.deb

# Login and create tunnel
cloudflared tunnel login
cloudflared tunnel create homelab
cloudflared tunnel route dns homelab plex.evindrake.net
cloudflared tunnel run homelab
```

Note: Tunnels have bandwidth limits and add latency - not ideal for media streaming.

## Security Best Practices

1. **Keep Authelia enabled** for protected services (VNC, SSH, torrent)
2. **Use Fail2ban** to block brute force attempts:
   ```bash
   sudo apt install fail2ban
   sudo systemctl enable fail2ban
   ```
3. **Regular updates:** `sudo apt update && sudo apt upgrade`
4. **Monitor access logs:** Check Caddy logs for suspicious activity
