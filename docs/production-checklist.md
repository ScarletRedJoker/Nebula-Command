# Production Checklist

## Pre-Demo Checklist for HomeLabHub Production

Use this checklist to verify all production systems are ready before demos or releases.

---

## Quick Status Check Commands

```bash
# Check all services at once
curl -s https://dash.evindrake.net/api/health | jq
curl -s https://stream.rig-city.com/health | jq

# Check SSL certificates
echo | openssl s_client -servername dash.evindrake.net -connect dash.evindrake.net:443 2>/dev/null | openssl x509 -noout -dates
echo | openssl s_client -servername stream.rig-city.com -connect stream.rig-city.com:443 2>/dev/null | openssl x509 -noout -dates
```

---

## 🔐 SSL/TLS Certificates

| Domain | Status | Expiry | Action |
|--------|--------|--------|--------|
| dash.evindrake.net | ⬜ Check | | `See docs/runbooks/ssl-cert-renewal.md` |
| stream.rig-city.com | ⬜ Check | | `See docs/runbooks/ssl-cert-renewal.md` |
| rig-city.com | ⬜ Check | | `See docs/runbooks/ssl-cert-renewal.md` |
| evindrake.net | ⬜ Check | | `See docs/runbooks/ssl-cert-renewal.md` |

### Quick Commands
```bash
# Check all certificates
for domain in dash.evindrake.net stream.rig-city.com rig-city.com evindrake.net; do
  echo -n "$domain: "
  echo | openssl s_client -servername $domain -connect $domain:443 2>/dev/null | \
    openssl x509 -noout -enddate 2>/dev/null | cut -d= -f2 || echo "FAILED"
done
```

---

## 🔑 Authentication

| Item | Status | Notes |
|------|--------|-------|
| Google OAuth configured | ⬜ | `See docs/runbooks/google-oauth-setup.md` |
| `GOOGLE_CLIENT_ID` set | ⬜ | Check Replit secrets |
| `GOOGLE_CLIENT_SECRET` set | ⬜ | Check Replit secrets |
| `NEXTAUTH_URL` correct | ⬜ | Should be `https://dash.evindrake.net` |
| `NEXTAUTH_SECRET` set | ⬜ | Random 32+ character string |
| Redirect URIs in Google Console | ⬜ | Must include all domains |
| Test login works | ⬜ | Try signing in |

### Quick Commands
```bash
# Test OAuth endpoint
curl -s https://dash.evindrake.net/api/auth/providers | jq

# Check session
curl -s -c cookies.txt https://dash.evindrake.net/api/auth/session
```

---

## 🔐 SSH Configuration

| Item | Status | Notes |
|------|--------|-------|
| SSH key in PEM format | ⬜ | `See docs/runbooks/ssh-key-conversion.md` |
| `SSH_PRIVATE_KEY` secret set | ⬜ | Check Replit secrets |
| Key works for Linode | ⬜ | Test connection |
| Key works for Home Server | ⬜ | Test connection |
| Correct permissions (600) | ⬜ | `chmod 600 ~/.ssh/homelab` |

### Quick Commands
```bash
# Check key format
head -1 ~/.ssh/homelab

# Should show: -----BEGIN RSA PRIVATE KEY-----
# NOT: -----BEGIN OPENSSH PRIVATE KEY-----

# Convert if needed
./scripts/convert-ssh-key.sh ~/.ssh/homelab

# Test connections
ssh -i ~/.ssh/homelab root@linode.evindrake.net "echo Linode OK"
ssh -i ~/.ssh/homelab evin@host.evindrake.net "echo Home OK"
```

---

## 🖥️ Server Connectivity

| Server | Status | IP/Host | Notes |
|--------|--------|---------|-------|
| Linode | ⬜ | linode.evindrake.net | Main production |
| Home Server | ⬜ | host.evindrake.net | Plex, Home Assistant |
| Windows VM | ⬜ | 100.118.44.102 | AI workstation |

### Quick Commands
```bash
# Ping servers
ping -c 1 linode.evindrake.net
ping -c 1 host.evindrake.net
ping -c 1 100.118.44.102

# Check SSH
ssh root@linode.evindrake.net "uptime"

# Check Windows Agent
curl -s http://100.118.44.102:9765/api/health | jq
```

---

## 🌐 DNS Configuration

| Domain | Type | Target | Status |
|--------|------|--------|--------|
| dash.evindrake.net | A | Linode IP | ⬜ |
| stream.rig-city.com | A | Linode IP | ⬜ |
| rig-city.com | A | Linode IP | ⬜ |
| evindrake.net | A | Linode IP | ⬜ |

### Quick Commands
```bash
# Check DNS resolution
for domain in dash.evindrake.net stream.rig-city.com rig-city.com; do
  echo -n "$domain: "
  dig +short $domain
done
```

---

## 🚀 Services Health

| Service | URL | Status | Action |
|---------|-----|--------|--------|
| Dashboard Next | https://dash.evindrake.net | ⬜ | |
| Stream Bot | https://stream.rig-city.com | ⬜ | |
| Discord Bot | (internal) | ⬜ | |

### Quick Commands
```bash
# Check service health
curl -s https://dash.evindrake.net/api/health | jq
curl -s https://stream.rig-city.com/health | jq

# Check PM2 on Linode
ssh root@linode.evindrake.net "pm2 status"

# View logs
ssh root@linode.evindrake.net "pm2 logs --lines 20"
```

---

## 🗄️ Database

| Item | Status | Notes |
|------|--------|-------|
| PostgreSQL running | ⬜ | Check Replit database |
| Connection string valid | ⬜ | `DATABASE_URL` |
| Migrations applied | ⬜ | `npm run db:push` |
| Backup recent | ⬜ | Check backup date |

### Quick Commands
```bash
# Test database connection (in Replit)
npm run db:studio

# Check migrations
cd services/dashboard-next && npx drizzle-kit push
```

---

## 🔒 Secrets & Environment

| Secret | Set | Required For |
|--------|-----|--------------|
| `DATABASE_URL` | ⬜ | PostgreSQL |
| `GOOGLE_CLIENT_ID` | ⬜ | OAuth |
| `GOOGLE_CLIENT_SECRET` | ⬜ | OAuth |
| `NEXTAUTH_SECRET` | ⬜ | Session |
| `SSH_PRIVATE_KEY` | ⬜ | Remote access |
| `DISCORD_BOT_TOKEN` | ⬜ | Discord bot |
| `TWITCH_CLIENT_ID` | ⬜ | Stream bot |
| `TWITCH_CLIENT_SECRET` | ⬜ | Stream bot |
| `NEBULA_AGENT_TOKEN` | ⬜ | Windows agent |

---

## 📋 Pre-Demo Final Checks

1. **Visual Check**
   - [ ] Dashboard loads without errors
   - [ ] Login works
   - [ ] Server status shows green
   - [ ] No console errors in browser

2. **Functionality Check**
   - [ ] Can SSH to servers from dashboard
   - [ ] AI features work (if Windows VM is on)
   - [ ] Discord bot responds
   - [ ] Stream bot connects to Twitch

3. **Performance Check**
   - [ ] Dashboard loads in < 3 seconds
   - [ ] No timeout errors
   - [ ] API responses are fast

---

## 🚨 Emergency Fixes

### SSL Certificate Expired
```bash
# Renew with certbot
sudo certbot renew --force-renewal
sudo systemctl restart nginx
```

### OAuth Not Working
```bash
# Check redirect URIs match exactly
# Go to: https://console.cloud.google.com/apis/credentials
# Add: https://dash.evindrake.net/api/auth/callback/google
```

### SSH Keys Not Working
```bash
# Convert to PEM format
./scripts/convert-ssh-key.sh ~/.ssh/homelab
# Update Replit secret SSH_PRIVATE_KEY
```

### Services Down
```bash
# SSH to Linode and restart
ssh root@linode.evindrake.net
pm2 restart all
```

---

## Related Runbooks

- [SSL Certificate Renewal](runbooks/ssl-cert-renewal.md)
- [Google OAuth Setup](runbooks/google-oauth-setup.md)
- [SSH Key Conversion](runbooks/ssh-key-conversion.md)
- [Linode Deployment](runbooks/LINODE_DEPLOYMENT.md)
- [Service Test Plan](runbooks/SERVICE_TEST_PLAN.md)

---

## Status Legend

| Symbol | Meaning |
|--------|---------|
| ⬜ | Not checked |
| ✅ | Verified working |
| ⚠️ | Warning / needs attention |
| ❌ | Failed / broken |
