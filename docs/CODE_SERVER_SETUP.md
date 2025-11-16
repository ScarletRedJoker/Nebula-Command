# Code-Server Setup & Troubleshooting

## Overview
Code-Server provides VS Code in the browser, accessible at `https://code.evindrake.net`

## Configuration

### Required Environment Variables

The following must be set in `.env`:

```bash
CODE_SERVER_PASSWORD=your_secure_password_here
```

**Current Status:** ✅ Configured (set to `Brs=2729`)

### Docker Configuration

Code-Server is configured in `docker-compose.unified.yml`:

```yaml
code-server:
  image: codercom/code-server:latest
  container_name: code-server
  restart: unless-stopped
  command: 
    - --bind-addr
    - 0.0.0.0:8080
    - --proxy-domain
    - code.evindrake.net
    - --auth
    - password
    - --disable-telemetry
  environment:
    - PASSWORD=${CODE_SERVER_PASSWORD}
    - TZ=America/New_York
    - PROXY_DOMAIN=code.evindrake.net
  volumes:
    - code_server_config:/home/coder/.config
    - /home/evin/contain:/home/coder/projects:ro
    - code_server_data:/home/coder/.local/share/code-server
```

### Caddy Reverse Proxy

Code-Server is proxied through Caddy with full WebSocket support:

```caddy
code.evindrake.net {
    reverse_proxy code-server:8080 {
        # WebSocket support - CRITICAL
        header_up Upgrade {>Upgrade}
        header_up Connection {>Connection}
        
        # Long-running connection timeouts
        transport http {
            read_timeout 3600s
            write_timeout 3600s
            dial_timeout 30s
        }
        
        # Real-time updates
        flush_interval -1
    }
}
```

## WebSocket Error Troubleshooting

### Error: "WebSocket close with status code: 1006"

This error indicates the WebSocket connection was closed unexpectedly.

**Common Causes:**

1. **Missing PASSWORD environment variable**
   - ✅ Fixed: CODE_SERVER_PASSWORD is set in `.env`
   - Verify: `docker exec code-server env | grep PASSWORD`

2. **Container not running**
   - Check: `docker ps | grep code-server`
   - Restart: `docker-compose -f docker-compose.unified.yml restart code-server`

3. **Network/proxy issues**
   - Verify Caddy is running: `docker ps | grep caddy`
   - Check Caddy logs: `docker logs caddy | grep code-server`

4. **Certificate issues**
   - Verify SSL is active: `curl -I https://code.evindrake.net`
   - Check cert status: `docker logs caddy | grep certificate`

### Verification Steps

1. **Check container health:**
   ```bash
   docker ps --filter name=code-server --format "table {{.Names}}\t{{.Status}}"
   ```

2. **Verify password is set:**
   ```bash
   docker exec code-server sh -c 'echo $PASSWORD'
   ```
   Should output: `Brs=2729`

3. **Test WebSocket connection:**
   ```bash
   curl -I -H "Upgrade: websocket" https://code.evindrake.net
   ```
   Should return `101 Switching Protocols` or similar

4. **Check code-server logs:**
   ```bash
   docker logs code-server --tail 50
   ```

### Manual Fix (if needed)

If WebSocket errors persist:

1. **Restart code-server container:**
   ```bash
   cd /home/evin/contain/HomeLabHub
   docker-compose -f docker-compose.unified.yml restart code-server
   ```

2. **Force recreate (if restart doesn't work):**
   ```bash
   docker-compose -f docker-compose.unified.yml up -d --force-recreate code-server
   ```

3. **Clear browser cache:**
   - Open Developer Tools (F12)
   - Right-click refresh button
   - Select "Empty Cache and Hard Reload"

## Access

- **URL:** https://code.evindrake.net
- **Password:** Set in .env as `CODE_SERVER_PASSWORD`
- **Project Directory:** `/home/coder/projects` (maps to `/home/evin/contain`)

## Integration with Jarvis

See [JARVIS_IDE_INTEGRATION.md](./JARVIS_IDE_INTEGRATION.md) for AI-powered coding assistance within Code-Server.

## Security Notes

- Password authentication is required
- Connection is TLS-encrypted via Caddy
- Project directory is mounted read-only for safety
- Telemetry is disabled
