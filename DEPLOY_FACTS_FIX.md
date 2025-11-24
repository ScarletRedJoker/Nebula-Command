# Facts Architecture Fix - Deployment Guide

## What Was Fixed (CRITICAL SERVICE SEPARATION)

**Problem:** Facts were incorrectly implemented with stream-bot data stored in dashboard service.

**Solution:** Complete architectural refactor - stream-bot now owns facts end-to-end.

### Before (WRONG):
- ❌ Stream-bot POSTed facts to dashboard
- ❌ Dashboard stored facts in its Artifact table (service mixing)

### After (CORRECT):
- ✅ Stream-bot generates AND stores facts in its own database
- ✅ Stream-bot has its own `facts` table
- ✅ Stream-bot serves facts via its own API

## Deploy to Production

### Step 1: Pull latest code
```bash
cd /home/evin/contain/HomeLabHub
git pull origin main
```

### Step 2: Apply database migration (CRITICAL)
```bash
# Create facts table in stream-bot database
docker exec -i homelab-postgres psql -U streambot -d streambot < services/stream-bot/migrations/0006_add_facts_table.sql
```

### Step 3: Restart stream-bot
```bash
docker-compose restart stream-bot
```

## Verify It Works

```bash
# Check logs - should see fact generation immediately on startup
docker-compose logs stream-bot | tail -30

# Expected output (within 2-5 seconds of startup):
# [Facts] ✓ Snapple Fact generation service configured (immediate + 1 fact/hour)
# serving on port 5000
# [Facts] Generating fact...
# [OpenAI] Final cleaned fact: [some fact about sharks, octopuses, etc]
# [Facts] ✓ Stored fact in stream-bot database
```

**Test API (immediately after restart):**
```bash
# Check latest fact
curl http://localhost:5000/api/facts/latest

# Get random fact
curl http://localhost:5000/api/facts/random

# Test Generate Preview button
# Visit https://stream.rig-city.com/trigger and click "Generate Preview"
```

## Files Changed
- `services/stream-bot/shared/schema.ts` - Added facts table definition
- `services/stream-bot/migrations/0006_add_facts_table.sql` - Database migration
- `services/stream-bot/server/routes.ts` - Added POST/GET facts API endpoints with wrapped responses
- `services/stream-bot/server/index.ts` - Runs fact generation IMMEDIATELY on startup + hourly
- `services/dashboard/routes/facts_routes.py` - Reverted to read-only proxy pattern

## What's New
- **Immediate fact generation**: Facts generate 2 seconds after server starts (no waiting 1 hour!)
- **Proper timing**: Server listens first, then generates facts (no more fetch failures)
- **Better logging**: Clear messages showing OpenAI calls and storage success/failure

## Service Separation Principle
Each service owns its own data, UI, and API completely. Stream-bot facts belong to stream-bot, not dashboard.
