# Comprehensive Fix Scripts Guide

This directory contains three automated fix scripts to resolve common homelab issues.

## 📋 Available Scripts

### 1. **fix-vnc-code-server-access.sh**
**Purpose:** Remove VPN restrictions from VNC and Code-Server to enable password-only access

**Usage:**
```bash
./scripts/fix-vnc-code-server-access.sh
```

**What it does:**
- ✅ Verifies Caddyfile VPN restrictions are commented out
- ✅ Backs up Caddyfile before making changes
- ✅ Reloads Caddy configuration
- ✅ Validates password environment variables
- ✅ Restarts VNC and Code-Server containers

**Expected outcome:**
- VNC accessible at https://vnc.evindrake.net (password auth only)
- Code-Server accessible at https://code.evindrake.net (password auth only)

---

### 2. **reset-home-assistant-integration.sh**
**Purpose:** Reconfigure Home Assistant to use external URL instead of internal container URL

**Usage:**
```bash
./scripts/reset-home-assistant-integration.sh
```

**What it does:**
- ✅ Updates HOME_ASSISTANT_URL to https://home.evindrake.net
- ✅ Prompts for new long-lived access token
- ✅ Verifies trusted_proxies configuration
- ✅ Restarts Home Assistant and Dashboard
- ✅ Tests connection to Home Assistant

**Prerequisites:**
- Home Assistant must be accessible at https://home.evindrake.net
- You'll need to generate a new long-lived token during script execution

**Interactive steps:**
1. Script will prompt you to open https://home.evindrake.net/profile/security
2. Create a new long-lived token named "Jarvis Dashboard Integration"
3. Paste the token when prompted

---

### 3. **validate-env-vars.sh**
**Purpose:** Validate that all required environment variables are set in .env

**Usage:**
```bash
./scripts/validate-env-vars.sh
```

**What it does:**
- ✅ Checks for .env file existence
- ✅ Validates 15+ critical environment variables
- ✅ Reports missing or empty variables
- ✅ Provides summary of validation status

**Variables checked:**
- Database passwords (Discord, StreamBot, Jarvis)
- API keys (OpenAI, Discord, Twitch)
- Service passwords (VNC, Code-Server, MinIO)
- Integration tokens (Home Assistant)
- Security secrets (Session, API keys)

**Exit codes:**
- `0` = All variables present
- `1` = Missing or empty variables found

---

## 🚀 Quick Start

### Run all validations:
```bash
# 1. Validate environment
./scripts/validate-env-vars.sh

# 2. Fix VNC/Code-Server access
./scripts/fix-vnc-code-server-access.sh

# 3. Reset Home Assistant integration
./scripts/reset-home-assistant-integration.sh
```

### Common workflows:

**After deployment to new server:**
```bash
./scripts/validate-env-vars.sh
```

**Can't access VNC or Code-Server:**
```bash
./scripts/fix-vnc-code-server-access.sh
```

**Home Assistant not connecting to dashboard:**
```bash
./scripts/reset-home-assistant-integration.sh
```

---

## 🔒 Security Notes

1. **VNC Access:** After running fix-vnc-code-server-access.sh, VNC will be accessible with password authentication only. Make sure your VNC_PASSWORD is strong!

2. **Code-Server Access:** Code-Server will be accessible with password authentication. Ensure CODE_SERVER_PASSWORD is secure.

3. **Home Assistant Token:** The script stores the long-lived token in .env. Keep this file secure and never commit it to git!

4. **Backup:** All scripts create backups before making changes (Caddyfile.backup.TIMESTAMP)

---

## 🐛 Troubleshooting

### Script fails with "Permission denied"
```bash
chmod +x scripts/*.sh
```

### Caddy reload fails
The script will automatically try a full container restart if reload fails.

### Home Assistant connection test fails
Wait a few minutes for Home Assistant to fully start, then manually verify at https://home.evindrake.net

### Environment validation fails
Check the output for specific missing variables and add them to .env file.

---

## 📝 Notes

- All scripts use `set -e` to exit on first error
- Scripts create backups before making destructive changes
- Output is color-coded with emojis for easy reading
- Scripts are idempotent (safe to run multiple times)

---

## 🔄 Maintenance

These scripts are located in `/home/evin/contain/HomeLabHub/scripts/` on the production server.

To update scripts:
1. Edit in development environment
2. Test changes
3. Deploy to production
4. Ensure executable permissions: `chmod +x scripts/*.sh`

