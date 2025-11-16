# Deployment Scripts

Quick reference for managing HomeLabHub services.

---

## Recovery Script (Recommended)

**Fix everything in one command:**
```bash
cd /home/evin/contain/HomeLabHub
bash MASTER_FIX_ALL.sh
```

This fixes:
- Database authentication
- CSRF/session errors
- Broken containers
- Service dependencies

---

## Auto-Sync

**Install 5-minute auto-sync from Replit:**
```bash
./deployment/install-auto-sync.sh
```

**View sync logs:**
```bash
journalctl -u replit-sync.service -f
```

**Manual sync when needed:**
```bash
./deployment/manual-sync.sh
```

---

## Database Management

**Ensure databases exist:**
```bash
./deployment/ensure-databases.sh
```

This creates missing databases and updates user passwords.

---

## Full Deployment

**Deploy all services:**
```bash
./deployment/deploy-unified.sh
```

**Interactive manager:**
```bash
./homelab-manager.sh
```

---

## Individual Service Updates

**Update any service:**
```bash
./deployment/update-service.sh <service-name>

# Examples:
./deployment/update-service.sh n8n
./deployment/update-service.sh plex
```

**Quick n8n update:**
```bash
./deployment/update-n8n.sh
```

---

## Environment Setup

**Generate .env file:**
```bash
./deployment/generate-unified-env.sh
```

---

## Simple Principle

**When things break, run:**
```bash
bash MASTER_FIX_ALL.sh
```

That's it.
