# ✅ DNS Fully Configured - Next Steps

## DNS Status: ALL CONFIGURED ✓

Great news! Both domains are now fully configured in ZoneEdit:

### rig-city.com ✅
- ✓ Apex domain: `rig-city.com` → 74.76.32.151
- ✓ Subdomain: `bot.rig-city.com` → 74.76.32.151
- ✓ Subdomain: `stream.rig-city.com` → 74.76.32.151
- ✓ WWW redirect: `www.rig-city.com` → CNAME to rig-city.com

### scarletredjoker.com ✅
- ✓ Apex domain: `scarletredjoker.com` → 74.76.32.151
- ✓ WWW redirect: `www.scarletredjoker.com` → CNAME to scarletredjoker.com

---

## 🚀 Next Steps to Get SSL Certificates

### 1. Wait for DNS Propagation (15-30 minutes recommended)

Even though DNS records are added, they need time to propagate globally. Let's Encrypt's validation servers need to see these records.

**Check DNS propagation:**
```bash
# Test from your server
dig +short A rig-city.com
dig +short A scarletredjoker.com

# Should return: 74.76.32.151
```

**Or use online tools:**
- https://whatsmydns.net
- https://dnschecker.org

### 2. Restart Caddy Container

Once DNS has propagated (wait at least 15-30 minutes after adding records), restart Caddy to trigger SSL certificate requests:

```bash
docker restart caddy
```

### 3. Monitor Caddy Logs

Watch for successful certificate issuance:

```bash
docker logs -f caddy
```

**Look for:**
- ✅ `certificate obtained successfully` messages
- ✅ No more NXDOMAIN errors
- ❌ If you still see errors, wait longer for DNS propagation

### 4. Test Your Websites

After Caddy successfully obtains certificates:

**Rig City Community Website:**
- https://rig-city.com
- https://www.rig-city.com (should redirect to https://rig-city.com)

**Scarlet Red Joker Personal Website:**
- https://scarletredjoker.com
- https://www.scarletredjoker.com (should redirect to https://scarletredjoker.com)

---

## 📋 Verification Checklist

- [ ] DNS records added in ZoneEdit ✅ (DONE)
- [ ] Caddyfile updated to enable domains ✅ (DONE)
- [ ] Waited 15-30 minutes for DNS propagation
- [ ] Verified DNS resolution with `dig` command
- [ ] Restarted Caddy container
- [ ] Checked Caddy logs for successful certificate issuance
- [ ] Tested websites in browser (https://)
- [ ] Verified SSL certificates are valid (green padlock)

---

## ⚠️ Troubleshooting

### If SSL certificates fail to issue:

**1. DNS Not Propagated Yet**
- **Error**: Still seeing NXDOMAIN errors
- **Solution**: Wait longer (up to 48 hours in rare cases, typically 1-2 hours)
- **Check**: https://whatsmydns.net to see global propagation status

**2. Ports Not Open**
- **Error**: "connection refused" or timeout errors
- **Solution**: Ensure ports 80 and 443 are forwarded on your router and firewall
- **Test**: `curl -I http://rig-city.com` from an external network

**3. Let's Encrypt Rate Limits**
- **Error**: "too many certificates already issued"
- **Solution**: Wait 1 hour between retry attempts
- **Alternative**: Use staging certificates first to test (won't trigger rate limits)

### Staging Certificates (For Testing)

If you want to test without rate limits, temporarily use staging certificates:

```caddy
rig-city.com {
    tls {
        ca https://acme-staging-v02.api.letsencrypt.org/directory
    }
    reverse_proxy rig-city-site:80
}
```

Then switch back to production after confirming DNS works.

---

## 🎯 Expected Timeline

| Time | Action |
|------|--------|
| Now | DNS records added in ZoneEdit ✅ |
| Now | Caddyfile updated ✅ |
| +15-30 min | DNS propagation complete |
| +30 min | Restart Caddy container |
| +32 min | SSL certificates issued automatically |
| +35 min | Websites accessible via HTTPS |

---

## 📊 All Services After Setup

Once complete, you'll have **11 working services** with SSL:

1. host.evindrake.net - Homelab Dashboard
2. bot.rig-city.com - Discord Ticket Bot
3. stream.rig-city.com - Stream Bot
4. **rig-city.com** - Rig City Community Website 🆕
5. **scarletredjoker.com** - Personal Website 🆕
6. plex.evindrake.net - Plex Media Server
7. n8n.evindrake.net - Automation Platform
8. vnc.evindrake.net - Remote Desktop
9. code.evindrake.net - VS Code Server
10. game.evindrake.net - Game Streaming
11. home.evindrake.net - Home Assistant

---

## 🔧 Quick Commands Reference

```bash
# Check DNS resolution
dig +short A rig-city.com
dig +short A scarletredjoker.com

# Restart Caddy
docker restart caddy

# Watch Caddy logs
docker logs -f caddy

# Test HTTP (should redirect to HTTPS)
curl -I http://rig-city.com
curl -I http://scarletredjoker.com

# Test HTTPS
curl -I https://rig-city.com
curl -I https://scarletredjoker.com
```

---

**Ready to proceed!** The DNS is configured, the Caddyfile is updated. Just wait 15-30 minutes for DNS propagation, then restart Caddy to get your SSL certificates automatically.
