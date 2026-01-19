# SSL Certificate Renewal Runbook

## Overview
This runbook covers renewing Let's Encrypt SSL certificates for `stream.rig-city.com` and other domains.

## Quick Reference

### Check Certificate Expiry
```bash
# Check certificate expiry date
echo | openssl s_client -servername stream.rig-city.com -connect stream.rig-city.com:443 2>/dev/null | openssl x509 -noout -dates

# Check days until expiry
echo | openssl s_client -servername stream.rig-city.com -connect stream.rig-city.com:443 2>/dev/null | openssl x509 -noout -enddate | cut -d= -f2
```

---

## Option 1: Caddy (Automatic SSL)

Caddy handles SSL certificates automatically. If using Caddy:

### Verify Caddy Configuration
```bash
# SSH into the server
ssh root@linode.evindrake.net

# Check Caddy status
systemctl status caddy

# View Caddy config
cat /etc/caddy/Caddyfile
```

### Caddyfile Example for stream.rig-city.com
```
stream.rig-city.com {
    reverse_proxy localhost:3000
    encode gzip
}
```

### Force Certificate Renewal
```bash
# Restart Caddy to trigger renewal check
sudo systemctl restart caddy

# View certificate details
sudo caddy list-certs
```

### Caddy Certificate Location
```bash
# Certificates stored at:
ls -la /var/lib/caddy/.local/share/caddy/certificates/
```

---

## Option 2: Nginx with Certbot

### Prerequisites
```bash
# Install certbot (Ubuntu/Debian)
sudo apt update
sudo apt install -y certbot python3-certbot-nginx
```

### Obtain New Certificate
```bash
# Obtain certificate for stream.rig-city.com
sudo certbot --nginx -d stream.rig-city.com

# For multiple domains
sudo certbot --nginx -d stream.rig-city.com -d www.rig-city.com
```

### Renew Existing Certificate
```bash
# Check what would be renewed (dry run)
sudo certbot renew --dry-run

# Force renewal
sudo certbot renew --force-renewal

# Renew specific domain
sudo certbot certonly --nginx -d stream.rig-city.com --force-renewal
```

### Nginx Configuration
```nginx
# /etc/nginx/sites-available/stream.rig-city.com
server {
    listen 80;
    server_name stream.rig-city.com;
    return 301 https://$server_name$request_uri;
}

server {
    listen 443 ssl http2;
    server_name stream.rig-city.com;

    ssl_certificate /etc/letsencrypt/live/stream.rig-city.com/fullchain.pem;
    ssl_certificate_key /etc/letsencrypt/live/stream.rig-city.com/privkey.pem;
    include /etc/letsencrypt/options-ssl-nginx.conf;
    ssl_dhparam /etc/letsencrypt/ssl-dhparams.pem;

    location / {
        proxy_pass http://localhost:3000;
        proxy_http_version 1.1;
        proxy_set_header Upgrade $http_upgrade;
        proxy_set_header Connection 'upgrade';
        proxy_set_header Host $host;
        proxy_set_header X-Real-IP $remote_addr;
        proxy_set_header X-Forwarded-For $proxy_add_x_forwarded_for;
        proxy_set_header X-Forwarded-Proto $scheme;
    }
}
```

### Restart Nginx
```bash
# Test configuration
sudo nginx -t

# Reload nginx
sudo systemctl reload nginx
```

---

## Automation: Certbot Auto-Renewal

### Setup Auto-Renewal Cron
```bash
# Certbot usually sets this up automatically, verify with:
sudo systemctl status certbot.timer

# Or check crontab
sudo crontab -l | grep certbot
```

### Manual Cron Setup (if needed)
```bash
# Add to crontab
sudo crontab -e

# Add this line (runs twice daily at random minute)
0 0,12 * * * /usr/bin/certbot renew --quiet --post-hook "systemctl reload nginx"
```

### Auto-Renewal Script
```bash
#!/bin/bash
# /opt/homelab/scripts/ssl-renew.sh

set -e

DOMAINS=("stream.rig-city.com" "rig-city.com")
WEBHOOK_URL="${DISCORD_WEBHOOK_URL:-}"
NOTIFY_DAYS=14

notify() {
    local message="$1"
    echo "[$(date)] $message"
    if [ -n "$WEBHOOK_URL" ]; then
        curl -s -H "Content-Type: application/json" \
            -d "{\"content\": \"🔐 SSL: $message\"}" \
            "$WEBHOOK_URL" > /dev/null
    fi
}

for domain in "${DOMAINS[@]}"; do
    # Check expiry
    expiry=$(echo | openssl s_client -servername "$domain" -connect "$domain":443 2>/dev/null | \
             openssl x509 -noout -enddate 2>/dev/null | cut -d= -f2)
    
    if [ -z "$expiry" ]; then
        notify "⚠️ Could not check certificate for $domain"
        continue
    fi
    
    expiry_epoch=$(date -d "$expiry" +%s 2>/dev/null || date -j -f "%b %d %T %Y %Z" "$expiry" +%s 2>/dev/null)
    now_epoch=$(date +%s)
    days_left=$(( (expiry_epoch - now_epoch) / 86400 ))
    
    if [ "$days_left" -lt "$NOTIFY_DAYS" ]; then
        notify "⚠️ Certificate for $domain expires in $days_left days"
        certbot renew --quiet
        notify "✅ Renewal attempted for $domain"
    else
        echo "[$(date)] $domain: $days_left days remaining - OK"
    fi
done
```

---

## Verification Steps

### 1. Check Certificate Details
```bash
# Full certificate info
echo | openssl s_client -servername stream.rig-city.com -connect stream.rig-city.com:443 2>/dev/null | openssl x509 -noout -text

# Just issuer and dates
echo | openssl s_client -servername stream.rig-city.com -connect stream.rig-city.com:443 2>/dev/null | openssl x509 -noout -issuer -dates
```

### 2. Test HTTPS Connection
```bash
# Simple HTTPS test
curl -I https://stream.rig-city.com

# Verbose SSL handshake
curl -vvI https://stream.rig-city.com 2>&1 | grep -A5 "SSL connection"
```

### 3. Check Certificate Chain
```bash
# View full certificate chain
echo | openssl s_client -showcerts -servername stream.rig-city.com -connect stream.rig-city.com:443 2>/dev/null
```

### 4. Browser Test
1. Open `https://stream.rig-city.com` in browser
2. Click padlock icon → Certificate
3. Verify: Valid dates, Issuer = Let's Encrypt, Domain matches

---

## Troubleshooting

### Certificate Not Renewing
```bash
# Check certbot logs
sudo cat /var/log/letsencrypt/letsencrypt.log | tail -100

# Test renewal with verbose output
sudo certbot renew --dry-run -v
```

### Port 80 Blocked
```bash
# Check if port 80 is open
sudo lsof -i :80

# Temporarily stop nginx to free port
sudo systemctl stop nginx
sudo certbot certonly --standalone -d stream.rig-city.com
sudo systemctl start nginx
```

### DNS Issues
```bash
# Verify DNS points to correct IP
dig stream.rig-city.com +short

# Check from Let's Encrypt perspective
curl -s https://dns.google/resolve?name=stream.rig-city.com&type=A | jq
```

### Rate Limits
Let's Encrypt has rate limits:
- 50 certificates per registered domain per week
- 5 duplicate certificates per week
- 5 failed validations per hour

```bash
# Check current certificates
sudo certbot certificates
```

---

## Emergency: Manual Certificate Replacement

If automated renewal fails:

```bash
# 1. Generate new certificate
sudo certbot certonly --standalone -d stream.rig-city.com --preferred-challenges http

# 2. Certificate files will be at:
# /etc/letsencrypt/live/stream.rig-city.com/fullchain.pem
# /etc/letsencrypt/live/stream.rig-city.com/privkey.pem

# 3. Restart web server
sudo systemctl restart nginx
# or
sudo systemctl restart caddy
```

---

## Related Domains

| Domain | Server | Notes |
|--------|--------|-------|
| stream.rig-city.com | Linode | Stream bot |
| rig-city.com | Linode | Main site |
| dash.evindrake.net | Linode | Dashboard |
| evindrake.net | Linode | Personal site |

---

## Contacts

- **Let's Encrypt Status**: https://letsencrypt.status.io/
- **Certbot Docs**: https://certbot.eff.org/docs/
- **Caddy Docs**: https://caddyserver.com/docs/automatic-https
