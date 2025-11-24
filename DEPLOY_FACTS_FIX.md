# Deploy Facts API Fix 🚀

## What Was Fixed
Stream-bot was generating facts every hour but getting 404 errors trying to save them.

**Root Cause:** Dashboard had no POST endpoint for facts.

**Solution:** Added `/api/stream/facts` endpoint with proper authentication.

## Deploy to Production

```bash
cd /home/evin/contain/HomeLabHub
git pull origin main
docker-compose restart homelab-dashboard stream-bot
```

## Verify It Works

**Option 1: Wait 1 hour, then check logs:**
```bash
docker-compose logs stream-bot | grep Facts
# Should see: [Facts] ✓ Posted fact to dashboard
```

**Option 2: Manual test (immediate):**
```bash
# Test from within stream-bot container
docker-compose exec stream-bot sh -c 'curl -X POST http://homelab-dashboard:5000/api/stream/facts \
  -H "Content-Type: application/json" \
  -H "X-API-Key: $SERVICE_AUTH_TOKEN" \
  -d "{\"fact\":\"Test fact from manual curl\",\"source\":\"manual-test\"}"'
```

**Option 3: Check facts page:**
Visit https://host.evindrake.net/facts after deployment

## Files Changed
- `services/dashboard/routes/facts_routes.py` - Added POST endpoint
- `services/stream-bot/server/index.ts` - Added auth header
- `replit.md` - Documented the fix

## Status
✅ All tasks completed
✅ Architect approved
✅ Production ready
