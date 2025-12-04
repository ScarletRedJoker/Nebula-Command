# Service Functional Test Plan
**Purpose:** Systematically verify each service is FUNCTIONAL, not just responding.

---

## Pre-Flight Checks

### 1. Infrastructure Foundation
```bash
# On Linode - Check all containers
docker compose ps

# Check WireGuard tunnel
wg show
# Expected: Latest handshake < 2 minutes, transfer counters > 0

# If WireGuard down:
systemctl restart wg-quick@wg0
```

### 2. Database Health
```bash
# PostgreSQL
docker exec homelab-postgres pg_isready -U postgres
# Expected: "accepting connections"

# Redis
docker exec homelab-redis redis-cli ping
# Expected: PONG
```

---

## Linode Services

### Dashboard (dashboard.evindrake.net)
| Test | Command | Expected | Fix |
|------|---------|----------|-----|
| Health | `curl -I https://dashboard.evindrake.net` | 302 to /login | Check container logs |
| Login | Open browser, login with WEB_USERNAME/WEB_PASSWORD | Dashboard loads | Check .env credentials |
| DB Connection | Check logs for errors | No DB errors | Run migrations |

```bash
# Functional test
curl -I https://dashboard.evindrake.net
docker logs homelab-dashboard --tail 50 | grep -i error
```

### Discord Bot (bot.rig-city.com)
| Test | Command | Expected | Fix |
|------|---------|----------|-----|
| Health | `curl -I https://bot.rig-city.com/health` | 200 OK | Check container logs |
| Bot Online | Check Discord server | Bot shows online | Check DISCORD_BOT_TOKEN |
| Commands | Type `!ping` in Discord | Bot replies | Check DB/permissions |

```bash
# Functional test
curl -I https://bot.rig-city.com/health
docker logs discord-bot --tail 50 | grep -i error
```

### Stream Bot (stream.rig-city.com)
| Test | Command | Expected | Fix |
|------|---------|----------|-----|
| Health | `curl -I https://stream.rig-city.com/health` | 200 OK | Check container logs |
| OAuth | Visit site, try Twitch login | OAuth flow works | Check TWITCH_CLIENT_ID/SECRET |
| Dashboard | Login and view dashboard | Loads correctly | Check DB migrations |

```bash
# Functional test
curl -I https://stream.rig-city.com/health
docker logs stream-bot --tail 50 | grep -i error
```

### n8n (n8n.evindrake.net)
| Test | Command | Expected | Fix |
|------|---------|----------|-----|
| Access | `curl -I https://n8n.evindrake.net` | 401 (auth required) | Check Caddy route |
| Login | Open browser, login | n8n UI loads | Check N8N_BASIC_AUTH creds |
| Workflow | Create test workflow | Executes successfully | Check container logs |

```bash
# Functional test
curl -I https://n8n.evindrake.net
docker logs n8n --tail 50 | grep -i error
```

### Code Server (code.evindrake.net)
| Test | Command | Expected | Fix |
|------|---------|----------|-----|
| Access | `curl -I https://code.evindrake.net` | 302 to login | Check Caddy/proxy |
| Login | Enter CODE_SERVER_PASSWORD | VS Code loads | Check .env password |
| Terminal | Open terminal in VS Code | Works | Check container health |

```bash
# Functional test
curl -I https://code.evindrake.net
docker logs code-server --tail 50 | grep -i error
```

### Static Sites
| Site | Command | Expected |
|------|---------|----------|
| rig-city.com | `curl -I https://rig-city.com` | 200 OK |
| scarletredjoker.com | `curl -I https://scarletredjoker.com` | 200 OK |

```bash
curl -I https://rig-city.com
curl -I https://scarletredjoker.com
```

---

## Local Services (via WireGuard)

### Plex (plex.evindrake.net)
| Test | Command | Expected | Fix |
|------|---------|----------|-----|
| Identity | `curl https://plex.evindrake.net/identity` | XML with machineId | Check WireGuard |
| Web UI | Open browser, login | Plex loads | Check PLEX_TOKEN |
| Playback | Play a media file | Streams smoothly | Check transcoding |

```bash
# From Linode - test WireGuard path
curl -s https://plex.evindrake.net/identity | head -5

# From local Ubuntu
curl -s http://localhost:32400/identity | head -5
```

### Home Assistant (home.evindrake.net)
| Test | Command | Expected | Fix |
|------|---------|----------|-----|
| API | `curl https://home.evindrake.net/api/` | API root response | Check WireGuard |
| Web UI | Open browser, login | HA dashboard | Check trusted_proxies |
| Devices | Check device states | Devices visible | Check integrations |

```bash
# From Linode - test WireGuard path
curl -I https://home.evindrake.net

# From local Ubuntu
docker logs homeassistant --tail 50 | grep -i error
```

### MinIO (local only)
```bash
# From local Ubuntu
curl -I http://localhost:9000/minio/health/ready
# Expected: 200 OK

# Check console
curl -I http://localhost:9001
# Expected: 200 OK
```

---

## Windows VM / GameStream

### Sunshine
| Test | Method | Expected | Fix |
|------|--------|----------|-----|
| Web UI | https://192.168.122.250:47990 | Sunshine admin | Check Windows firewall |
| Moonlight | Connect from client | Stream starts | Check GPU passthrough |
| Quality | 1080p60 test | Smooth video | Adjust virtual display |

```bash
# From Ubuntu host - test port forwarding
nc -zv 192.168.122.250 47990
# Expected: Connection succeeded

# Test from WireGuard
nc -zv 10.200.0.2 47990
```

---

## Quick Full Test Script

Run this on Linode after deployment:

```bash
#!/bin/bash
echo "=== Infrastructure Test ==="

echo -e "\n[1] Docker Services"
docker compose ps

echo -e "\n[2] WireGuard"
wg show | head -10

echo -e "\n[3] PostgreSQL"
docker exec homelab-postgres pg_isready -U postgres

echo -e "\n[4] Redis"
docker exec homelab-redis redis-cli ping

echo -e "\n[5] Dashboard"
curl -s -o /dev/null -w "%{http_code}" https://dashboard.evindrake.net

echo -e "\n[6] Discord Bot"
curl -s -o /dev/null -w "%{http_code}" https://bot.rig-city.com/health

echo -e "\n[7] Stream Bot"
curl -s -o /dev/null -w "%{http_code}" https://stream.rig-city.com/health

echo -e "\n[8] n8n"
curl -s -o /dev/null -w "%{http_code}" https://n8n.evindrake.net

echo -e "\n[9] Code Server"
curl -s -o /dev/null -w "%{http_code}" https://code.evindrake.net

echo -e "\n[10] Plex (via WireGuard)"
curl -s -o /dev/null -w "%{http_code}" https://plex.evindrake.net/identity

echo -e "\n[11] Home Assistant (via WireGuard)"
curl -s -o /dev/null -w "%{http_code}" https://home.evindrake.net

echo -e "\n[12] Static Sites"
curl -s -o /dev/null -w "%{http_code}" https://rig-city.com
curl -s -o /dev/null -w "%{http_code}" https://scarletredjoker.com

echo -e "\n=== Test Complete ==="
```

---

## Common Failure Modes

| Symptom | Likely Cause | Fix |
|---------|--------------|-----|
| 502 Bad Gateway | Container not running or wrong network | `docker compose up -d --no-build` |
| 401 Unauthorized | Missing/wrong credentials | Check .env file |
| Connection timeout | WireGuard down or firewall | `wg show`, check iptables |
| SSL errors | DNS misconfigured | Check Cloudflare A records |
| Database errors | Migrations not run | Check service logs |
