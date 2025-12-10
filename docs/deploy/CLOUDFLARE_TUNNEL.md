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

## Quick Setup (Token-Based - Recommended)

The token-based approach is simpler and recommended for Docker deployments.

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

### 4. Get the Tunnel Token

```bash
cloudflared tunnel token homelab-tunnel
```

Copy the full token (starts with `eyJ...`).

### 5. Configure Environment

Add the token to your `.env` file:

```bash
CLOUDFLARE_TUNNEL_TOKEN=eyJhIjoixxxxxxxxx...
```

### 6. Route DNS

Configure which hostnames route through the tunnel. This is done in the Cloudflare dashboard:

1. Go to **Zero Trust** → **Tunnels**
2. Click on your tunnel
3. Click **Configure** → **Public Hostname**
4. Add hostnames:
   - `plex.evindrake.net` → `http://localhost:32400`
   - `home.evindrake.net` → `http://localhost:8123`

Or via CLI:
```bash
cloudflared tunnel route dns homelab-tunnel plex.evindrake.net
cloudflared tunnel route dns homelab-tunnel home.evindrake.net
```

### 7. Start the Tunnel

```bash
cd deploy/local
docker compose up -d cloudflared
```

Verify it's running:
```bash
docker logs cloudflared
```

## Services Exposed via Tunnel

| Hostname | Local Service | Port |
|----------|---------------|------|
| plex.evindrake.net | Plex Media Server | 32400 |
| home.evindrake.net | Home Assistant | 8123 |
| minio.evindrake.net | MinIO Console | 9001 |

## Alternative: Credentials File Method

If you prefer using a config file instead of token-based auth:

### 1. Create Configuration

```bash
cd deploy/local
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

### 2. Copy Credentials

```bash
cp ~/.cloudflared/YOUR_TUNNEL_ID.json config/cloudflared/credentials.json
```

### 3. Modify docker-compose.yml

Change the cloudflared command from token-based to config-based:

```yaml
cloudflared:
  command: tunnel --no-autoupdate run
  # Remove the --token flag
```

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

1. Verify token is correctly set in `.env`: `grep CLOUDFLARE .env`
2. Check DNS is routed: `cloudflared tunnel route dns homelab-tunnel plex.evindrake.net`
3. Check Cloudflare dashboard: Zero Trust → Tunnels

### Service not reachable

1. Verify local service is running: `curl http://localhost:32400/identity`
2. For token-based: Check public hostnames in Cloudflare dashboard
3. For config-based: Check ingress rules in config.yml
4. Review cloudflared logs for connection errors

### Container exits immediately

If the container exits with code 1:
1. Ensure `CLOUDFLARE_TUNNEL_TOKEN` is set in `.env`
2. Verify token is valid: `cloudflared tunnel token homelab-tunnel`
3. Check logs: `docker logs cloudflared`

## Security Considerations

- Cloudflare Access can add authentication to any tunnel endpoint
- Consider enabling Access policies for sensitive services
- Tunnel tokens should be treated as secrets (never commit to git)
- The `config/cloudflared/credentials.json` file is gitignored

## Updating the Tunnel

To add new services via Cloudflare dashboard (token-based):

1. Go to Zero Trust → Tunnels → Your Tunnel → Configure
2. Add new public hostname
3. Restart: `docker compose restart cloudflared`

To add new services via config file:

1. Edit `config/cloudflared/config.yml`
2. Add new ingress rule
3. Route DNS: `cloudflared tunnel route dns homelab-tunnel newservice.evindrake.net`
4. Restart: `docker compose restart cloudflared`
