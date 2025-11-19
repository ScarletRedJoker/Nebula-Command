# 🌐 ZoneEdit Dynamic DNS Integration

## Overview
The Nebula Command Dashboard includes automatic Dynamic DNS updates for your ZoneEdit domains. When your public IP address changes, the dashboard can automatically update your DNS records to maintain connectivity.

## What is ZoneEdit's "Dynamic Authentication Token"?

ZoneEdit uses a **Dynamic Authentication Token** (not a general API key) for secure Dynamic DNS updates. This is a domain-specific token that allows automated DNS record updates without exposing your account password.

---

## 🔧 Setup Instructions

### Step 1: Generate Your Dynamic Authentication Token

1. **Log in to ZoneEdit:**
   - Go to https://zoneedit.com
   - Sign in with your credentials

2. **Navigate to DNS Settings:**
   - Click **Domains** in the top menu
   - Select the domain you want to manage (e.g., `evindrake.net`)
   - Click **DNS Settings**

3. **Enable Dynamic Authentication:**
   - Scroll to the **DYN records** section
   - Click the **wrench icon** (settings/tools icon)
   - Click **"Enable dynamic authentication"**
   - A token will be generated and displayed

4. **Copy the Token:**
   - Copy the entire token string
   - Save it securely (you'll need it for the next step)

### Step 2: Configure Environment Variables

On your Ubuntu server:

```bash
cd /home/evin/contain/HomeLabHub
nano .env
```

Add or update these lines:

```bash
# ZoneEdit Dynamic DNS
ZONEEDIT_USERNAME=your_zoneedit_email@example.com
ZONEEDIT_API_TOKEN=paste_your_dynamic_auth_token_here
```

**Example:**
```bash
ZONEEDIT_USERNAME=evin@evindrake.net
ZONEEDIT_API_TOKEN=a1b2c3d4e5f6g7h8i9j0k1l2m3n4o5p6
```

Save the file (Ctrl+O, Enter, Ctrl+X)

### Step 3: Restart Dashboard Service

```bash
docker-compose -f docker-compose.unified.yml restart homelab-dashboard
```

---

## ✅ Verify Integration

### Option 1: Check Dashboard Logs
```bash
docker logs homelab-dashboard --tail 50 | grep -i zoneedit
```

You should see:
- ✅ No "ZoneEdit DNS not configured" warnings

If you see warnings, verify your `.env` file has the correct values.

### Option 2: Test via Dashboard UI

1. Go to your dashboard: `https://host.evindrake.net`
2. Navigate to **Network → Domains** or **Settings**
3. Look for ZoneEdit status indicator
4. Test the connection (if UI provides this option)

---

## 🚀 Using ZoneEdit Dynamic DNS

### Automatic Updates

The dashboard can automatically monitor your public IP and update DNS records when it changes. This ensures your domains always point to your current IP address.

### Manual Updates (via Python)

If you want to manually trigger DNS updates via the dashboard's Python service:

```python
from services.zoneedit_dns import ZoneEditDNS

dns = ZoneEditDNS()

# Update single domain
result = dns.update_ip('host.evindrake.net')
print(result)

# Update with specific IP
result = dns.update_ip('host.evindrake.net', '1.2.3.4')

# Update multiple domains at once
domains = [
    'host.evindrake.net',
    'vnc.evindrake.net',
    'code.evindrake.net'
]
result = dns.bulk_update(domains)
print(result)

# Get current public IP
current_ip = dns.get_current_ip()
print(f"Current IP: {current_ip}")

# Test connection
test = dns.test_connection()
print(test)
```

### Manual Updates (via cURL)

You can also update DNS records directly from the command line:

```bash
# Auto-detect IP
curl "https://your_username:your_token@dynamic.zoneedit.com/auth/dynamic.html?host=host.evindrake.net"

# Specify IP
curl "https://your_username:your_token@dynamic.zoneedit.com/auth/dynamic.html?host=host.evindrake.net&dnsto=1.2.3.4"
```

---

## 📋 Supported Domains

You can configure Dynamic DNS for any of your ZoneEdit-managed domains:
- `evindrake.net` and all subdomains
- `rig-city.com` and all subdomains
- `scarletredjoker.com` and all subdomains

**Common subdomains to keep updated:**
- `host.evindrake.net` (Dashboard)
- `vnc.evindrake.net` (VNC Desktop)
- `code.evindrake.net` (Code-Server)
- `n8n.evindrake.net` (n8n Automation)
- `plex.evindrake.net` (Plex Media)
- `home.evindrake.net` (Home Assistant)

---

## 🔐 Security Notes

### Why Use Dynamic Authentication Token?

- ✅ **Secure:** Doesn't expose your account password
- ✅ **Limited Scope:** Only allows DNS updates, not account changes
- ✅ **Revocable:** Can be regenerated if compromised
- ✅ **Domain-Specific:** Token is tied to specific domain

### Best Practices

1. **Keep Token Secret:**
   - Never commit token to Git
   - Store only in `.env` file
   - Use restrictive file permissions: `chmod 600 .env`

2. **Regular Rotation:**
   - Consider regenerating token every 6-12 months
   - Update `.env` file when rotated

3. **Monitor Usage:**
   - Check dashboard logs for unexpected updates
   - ZoneEdit may show update history in their dashboard

---

## 🛠️ Troubleshooting

### Error: "ZoneEdit DNS not configured"

**Cause:** Environment variables not set

**Fix:**
```bash
# Verify variables are set
grep ZONEEDIT .env

# Should show:
# ZONEEDIT_USERNAME=your_email
# ZONEEDIT_API_TOKEN=your_token

# If missing, add them and restart:
docker-compose -f docker-compose.unified.yml restart homelab-dashboard
```

### Error: "Authentication failed" or "ERROR 700"

**Cause:** Invalid username or token

**Fix:**
1. Verify username is correct (your ZoneEdit login email)
2. Regenerate Dynamic Authentication Token:
   - ZoneEdit → Domains → DNS Settings → DYN records → wrench icon
   - Disable then re-enable dynamic authentication
   - Copy new token
3. Update `.env` with new token
4. Restart dashboard

### Error: "Request timeout"

**Cause:** Network connectivity issue or ZoneEdit API down

**Fix:**
```bash
# Test connectivity
curl -I https://dynamic.zoneedit.com

# Check if your server can reach ZoneEdit
ping dynamic.zoneedit.com

# Test with your credentials
curl "https://your_username:your_token@dynamic.zoneedit.com/auth/dynamic.html?host=test.yourdomain.com"
```

### Updates Not Working

**Debugging steps:**

1. **Test token manually:**
```bash
# Get current IP
CURRENT_IP=$(curl -s https://api.ipify.org)
echo "Current IP: $CURRENT_IP"

# Test update
curl -v "https://your_username:your_token@dynamic.zoneedit.com/auth/dynamic.html?host=host.evindrake.net&dnsto=$CURRENT_IP"
```

2. **Check response:**
   - Should contain "SUCCESS" or "UPDATE"
   - If you see "ERROR", check the error code:
     - ERROR 700: Authentication failure
     - ERROR 709: Invalid hostname format

3. **Try alternative endpoint:**
```bash
curl "https://your_username:your_token@api.cp.zoneedit.com/dyn/generic.php?hostname=host.evindrake.net&myip=$CURRENT_IP"
```

---

## 🔗 Official ZoneEdit Resources

- **Official Dynamic DNS Documentation:** https://support.zoneedit.com/en/knowledgebase/article/dynamic-dns
- **Changes to Dynamic DNS:** https://support.zoneedit.com/en/knowledgebase/article/changes-to-dynamic-dns
- **ZoneEdit Support Forum:** https://forum.zoneedit.com/

---

## 📊 Environment Variables Reference

| Variable | Required | Description | Example |
|----------|----------|-------------|---------|
| `ZONEEDIT_USERNAME` | Yes | Your ZoneEdit account username/email | `evin@evindrake.net` |
| `ZONEEDIT_API_TOKEN` | Yes | Dynamic Authentication Token from ZoneEdit | `a1b2c3...` |

---

## ✅ Verification Checklist

After setup, verify:

- [ ] ZONEEDIT_USERNAME is set in `.env`
- [ ] ZONEEDIT_API_TOKEN is set in `.env`
- [ ] Dashboard service restarted
- [ ] No "not configured" warnings in logs
- [ ] Manual cURL test succeeds
- [ ] Dashboard shows ZoneEdit as configured

---

**Need Help?** Check the dashboard logs:
```bash
docker logs homelab-dashboard --tail 100 | grep -i zoneedit
```
