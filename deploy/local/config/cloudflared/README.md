# Cloudflare Tunnel Configuration

This directory contains the Cloudflare Tunnel configuration for local services.

## Setup Instructions

### 1. Create a Cloudflare Tunnel

```bash
cloudflared tunnel login
cloudflared tunnel create homelab-tunnel
```

### 2. Configure the Tunnel

Copy the example config and edit with your tunnel ID:

```bash
cp config.yml.example config.yml
```

Edit `config.yml` and replace `YOUR_TUNNEL_ID` with your actual tunnel ID.

### 3. Copy Credentials

After creating the tunnel, cloudflared generates a credentials file. Copy it here:

```bash
cp ~/.cloudflared/TUNNEL_ID.json /path/to/deploy/local/config/cloudflared/credentials.json
```

### 4. Route DNS

Route your domains to the tunnel:

```bash
cloudflared tunnel route dns homelab-tunnel plex.evindrake.net
cloudflared tunnel route dns homelab-tunnel home.evindrake.net
```

### 5. Start the Tunnel

The tunnel runs as a Docker service. It will start automatically with:

```bash
docker compose up -d cloudflared
```

## Environment Variables

Set in your `.env` file:

- `CLOUDFLARE_TUNNEL_TOKEN` - Optional: Use token-based auth instead of credentials file

## Troubleshooting

Check tunnel status:
```bash
docker logs cloudflared
cloudflared tunnel info homelab-tunnel
```

Test connectivity:
```bash
curl https://plex.evindrake.net/identity
```
