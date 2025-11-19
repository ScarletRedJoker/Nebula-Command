# 🔥 Critical Fixes Deployment Checklist
**Date**: November 19, 2025
**Status**: Ready for Production Deployment

## Pre-Deployment Verification

### Environment Check
- [ ] All workflows running (dashboard, stream-bot)
- [ ] PostgreSQL database accessible
- [ ] Redis cache accessible
- [ ] All 16 environment variables validated (`./scripts/validate-env-vars.sh`)

## Deployment Steps

### 1. Discord Bot - Interaction Deduplication
**What**: Prevents ticket spam from Discord interaction retries

**Deploy**:
```bash
cd /home/evin/contain/HomeLabHub
cd services/discord-bot
npm run db:migrate  # Applies migration 0003
docker-compose -f ../../docker-compose.unified.yml restart discord-bot
```

**Verify**:
- [ ] Migration 0003 applied: `SELECT COUNT(*) FROM interaction_locks;` returns 0
- [ ] Bot restarted without errors
- [ ] Create test ticket - only ONE notification appears
- [ ] Check logs: `docker logs discord-bot | grep -i "deduplication"`

### 2. VNC/Code-Server Access
**What**: Removes VPN restrictions, enables password-only access

**Deploy**:
```bash
cd /home/evin/contain/HomeLabHub
./scripts/fix-vnc-code-server-access.sh
```

**Verify**:
- [ ] Script runs successfully (exit code 0)
- [ ] Caddy reloaded without errors
- [ ] VNC accessible: https://vnc.evindrake.net (enter VNC_PASSWORD)
- [ ] Code-Server accessible: https://code.evindrake.net (enter CODE_SERVER_PASSWORD)
- [ ] No VPN required for either service

### 3. Home Assistant Integration
**What**: Connects dashboard to Home Assistant via external URL

**Deploy**:
```bash
cd /home/evin/contain/HomeLabHub
./scripts/reset-home-assistant-integration.sh
```

**Interactive Steps**:
1. Script will prompt for new token
2. Open: https://home.evindrake.net/profile/security
3. Create "Long-Lived Access Token" named "Jarvis Dashboard Integration"
4. Copy token and paste into script prompt

**Verify**:
- [ ] HOME_ASSISTANT_URL updated in .env: `grep HOME_ASSISTANT_URL .env`
- [ ] Token stored securely in .env
- [ ] Dashboard restarted
- [ ] Home Assistant accessible: https://home.evindrake.net
- [ ] Dashboard shows HA connection (no "Unable to connect" error)

### 4. Environment Variables
**What**: Validates all required secrets are configured

**Deploy**:
```bash
cd /home/evin/contain/HomeLabHub
./scripts/validate-env-vars.sh
```

**Verify**:
- [ ] Script output shows: "✅ ALL REQUIRED VARIABLES PRESENT"
- [ ] Exit code: 0 (success)
- [ ] All 16 variables validated

## Post-Deployment Verification

### Discord Bot
- [ ] Ticket creation works (one notification per ticket)
- [ ] No spam in #tickets channel
- [ ] Database query: `SELECT COUNT(*) FROM interaction_locks;` (should be small)
- [ ] Cleanup job running: `docker logs discord-bot | grep "Cleaned up old interaction locks"`

### VNC & Code-Server
- [ ] VNC desktop accessible without VPN
- [ ] Code-Server accessible without VPN
- [ ] Both require passwords (security maintained)

### Home Assistant
- [ ] Dashboard shows HA connected
- [ ] Smart Home page loads without errors
- [ ] Can control devices (if any configured)

### Stream Bot
- [ ] Twitch connection active
- [ ] Token refresh working: `docker logs stream-bot | grep TokenRefresh`
- [ ] No authentication errors

## Rollback Plan

### Discord Bot
```bash
# Revert to previous state
cd services/discord-bot
git checkout HEAD~1 migrations/
npm run db:migrate
docker-compose -f ../../docker-compose.unified.yml restart discord-bot
```

### VNC/Code-Server
```bash
# Restore Caddyfile backup
cp Caddyfile.backup.YYYYMMDD_HHMMSS Caddyfile
docker-compose -f docker-compose.unified.yml restart caddy
```

### Home Assistant
```bash
# Restore previous .env
cp .env.backup .env
docker-compose -f docker-compose.unified.yml restart homelab-dashboard homeassistant
```

## Success Criteria
✅ Discord bot creates ONE ticket per interaction (no duplicates)
✅ VNC accessible at https://vnc.evindrake.net with password only
✅ Code-Server accessible at https://code.evindrake.net with password only
✅ Home Assistant connected to dashboard (Smart Home page works)
✅ All 16 environment variables validated
✅ No authentication errors in any service logs

## Support
If issues occur:
1. Check workflow logs: `docker-compose -f docker-compose.unified.yml logs --tail=100 [service]`
2. Verify environment variables: `./scripts/validate-env-vars.sh`
3. Review deployment scripts: `scripts/README-FIX-SCRIPTS.md`
