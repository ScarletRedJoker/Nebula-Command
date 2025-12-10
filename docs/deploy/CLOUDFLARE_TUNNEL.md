# Cloudflare Tunnel Setup for HomeLabHub

This guide covers setting up Cloudflare Tunnel to expose local services (like Plex) to the internet without port forwarding or firewall configuration.

## Why Cloudflare Tunnel?

- **No port forwarding required** - Works behind any NAT/firewall
- **No exposed IP address** - Traffic routes through Cloudflare
- **Automatic SSL** - HTTPS everywhere with zero configuration  
- **Survives IP changes** - Works even if your ISP changes your IP
- **DDoS protection** - Cloudflare's security built-in

## Prerequisites

1. A Cloudflare account (free tier works)
2. Domain(s) with DNS managed by Cloudflare (e.g., evindrake.net)
3. Docker installed on your local server

## Quick Setup

### 1. Install cloudflared (one-time on host)

```bash
curl -L --output cloudflared.deb https://github.com/cloudflare/cloudflared/releases/latest/download/cloudflared-linux-amd64.deb
sudo dpkg -i cloudflared.deb
```

### 2. Authenticate with Cloudflare

```bash
cloudflared tunnel login
```

This opens a browser to authorize cloudflared with your Cloudflare account.

### 3. Create a Tunnel

```bash
cloudflared tunnel create homelab-tunnel
```

Note the tunnel ID (e.g., `071c430b-cb74-4fc3-ba92-29feadd4426f`).

### 4. Route DNS

```bash
cloudflared tunnel route dns homelab-tunnel plex.evindrake.net
cloudflared tunnel route dns homelab-tunnel home.evindrake.net
```

### 5. Configure the Tunnel

Copy and edit the config template:

```bash
cd /opt/homelab/HomeLabHub/deploy/local
cp config/cloudflared/config.yml.example config/cloudflared/config.yml
```

Edit `config/cloudflared/config.yml`:

```yaml
tunnel: YOUR_TUNNEL_ID_HERE
credentials-file: /etc/cloudflared/credentials.json

ingress:
  - hostname: plex.evindrake.net
    service: http://localhost:32400
    originRequest:
      noTLSVerify: true
      connectTimeout: 30s

  - hostname: home.evindrake.net  
    service: http://localhost:8123
    
  - service: http_status:404
```

### 6. Copy Credentials

```bash
cp ~/.cloudflared/YOUR_TUNNEL_ID.json config/cloudflared/credentials.json
```

### 7. Start the Tunnel

**Option A: Docker (recommended)**

```bash
docker compose up -d cloudflared
```

**Option B: Token-based (simpler)**

Get a tunnel token:
```bash
cloudflared tunnel token homelab-tunnel
```

Add to `.env`:
```bash
CLOUDFLARE_TUNNEL_TOKEN=eyJhIjoixxxxxxxxx...
```

Then start:
```bash
docker compose up -d cloudflared
```

## Services Exposed via Tunnel

| Hostname | Local Service | Port |
|----------|---------------|------|
| plex.evindrake.net | Plex Media Server | 32400 |
| home.evindrake.net | Home Assistant | 8123 |
| minio.evindrake.net | MinIO Console | 9001 |

## Troubleshooting

### Check tunnel status

```bash
docker logs cloudflared
cloudflared tunnel info homelab-tunnel
```

### Test connectivity

```bash
curl -I https://plex.evindrake.net/identity
```

### Tunnel not connecting

1. Check credentials file exists and has correct tunnel ID
2. Verify DNS is routed: `cloudflared tunnel route dns homelab-tunnel plex.evindrake.net`
3. Check Cloudflare dashboard: Zero Trust → Tunnels

### Service not reachable

1. Verify local service is running: `curl http://localhost:32400/identity`
2. Check ingress rules in config.yml
3. Review cloudflared logs for connection errors

## Security Considerations

- Cloudflare Access can add authentication to any tunnel endpoint
- Consider enabling Access policies for sensitive services
- Tunnel tokens should be treated as secrets (never commit to git)

## Updating the Tunnel

To add new services:

1. Edit `config/cloudflared/config.yml`
2. Add new ingress rule
3. Route DNS: `cloudflared tunnel route dns homelab-tunnel newservice.evindrake.net`
4. Restart: `docker compose restart cloudflared`
