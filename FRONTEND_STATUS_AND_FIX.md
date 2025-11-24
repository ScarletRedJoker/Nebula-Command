# Frontend Code Status & Stream-Bot Facts Integration

## Current Status

### ✅ What's Working

1. **Stream-Bot Fact Generation** ✅
   - Stream-bot IS generating AI facts every hour using gpt-4o
   - Successfully calling OpenAI API
   - Facts are cleaned and formatted
   - Code location: `services/stream-bot/server/openai.ts`

2. **Dashboard API Endpoint** ✅
   - Endpoint `/api/stream/facts` exists
   - Accepts POST requests with fact data
   - Stores facts in artifacts table with type='fact'
   - Code location: `services/dashboard/routes/api.py` (line 1218)

3. **Frontend UI for Facts** ✅ **JUST CREATED!**
   - New page: `/facts` 
   - Template: `services/dashboard/templates/facts.html`
   - Features:
     - Beautiful card-based display
     - Featured fact at the top
     - Statistics (total, today, this week)
     - Auto-refresh every 5 minutes
     - Manual refresh button
     - Time formatting (e.g., "2h ago", "just now")
     - Empty state handling
   - Routes: `services/dashboard/routes/facts_routes.py`
   - API endpoints:
     - GET `/api/facts/latest` - Get latest N facts
     - GET `/api/facts/random` - Get random fact

### ❌ What's BROKEN

**Stream-Bot CANNOT Post Facts to Dashboard!**

**Problem:** From stream-bot logs:
```
[Facts] ✗ fetch failed
```

**Root Cause:** Network connectivity issue between stream-bot container and dashboard container.

**Stream-bot configuration** (`services/stream-bot/server/index.ts` line 254):
```javascript
const dashboardUrl = 'http://homelab-dashboard:5000';
const response = await fetch(`${dashboardUrl}/api/stream/facts`, {
  method: 'POST',
  headers: { 'Content-Type': 'application/json' },
  body: JSON.stringify({ fact, source: 'stream-bot' })
});
```

**Possible Issues:**
1. **Dashboard not accessible from stream-bot container** (network isolation)
2. **Dashboard URL wrong** - Should it be port 8080? Or needs authentication?
3. **CORS blocking** the POST request
4. **Authentication required** but no token sent

## Fixes Implemented

### 1. Created Facts Display Frontend ✅
- **File:** `services/dashboard/templates/facts.html`
- **Route:** `/facts`
- **Features:** Modern UI with cards, statistics, auto-refresh

### 2. Created Facts API Routes ✅
- **File:** `services/dashboard/routes/facts_routes.py`
- **Endpoints:**
  - `GET /facts` - Facts page
  - `GET /api/facts/latest?limit=20` - Get latest facts
  - `GET /api/facts/random` - Get random fact

### 3. Registered Routes in App ✅
- **File:** `services/dashboard/app.py`
- Added import and registration of `facts_bp`

## Fixes Still Needed

### 1. Fix Stream-Bot to Dashboard Connection ❌

**Option A: Verify Network Configuration**
Check docker-compose to ensure both containers are on the same network:
```bash
# On Ubuntu server:
docker network inspect homelab
```

**Option B: Fix Dashboard URL**
Current: `http://homelab-dashboard:5000`
Try alternatives:
- `http://homelab-dashboard:8080` (if Gunicorn runs on 8080)
- `http://dashboard.evindrake.net/api/stream/facts` (external URL)
- `http://localhost:5000` (if running in same container)

**Option C: Remove Authentication**
The `/api/stream/facts` endpoint might need to bypass authentication for internal service calls:

```python
# In services/dashboard/routes/api.py
@api_bp.route('/stream/facts', methods=['POST'])
# Remove @require_web_auth or add service-to-service token
def receive_stream_facts():
    ...
```

### 2. Add Facts Link to Navigation ❌

Add to `services/dashboard/templates/base.html` sidebar:
```html
<li class="nav-item">
    <a href="/facts" class="nav-link">
        <i class="bi bi-lightbulb"></i>
        <span>Stream Bot Facts</span>
    </a>
</li>
```

## Testing Checklist

After applying fixes:

### Test Stream-Bot Posting
```bash
# On Ubuntu server:
# 1. Check stream-bot logs
./homelab logs stream-bot --tail 50 | grep -i "fact"

# 2. Should see:
[Facts] ✓ Posted fact to dashboard

# Not:
[Facts] ✗ fetch failed
```

### Test Dashboard Receiving
```bash
# Check dashboard logs for incoming facts
./homelab logs homelab-dashboard --tail 50 | grep -i "fact"

# Should see:
✓ Received fact from stream-bot: [fact content]
```

### Test Frontend Display
1. Visit: `https://dashboard.evindrake.net/facts`
2. Should see:
   - Statistics showing number of facts
   - Featured fact at top
   - List of all facts with timestamps
3. If empty:
   - Shows "No facts yet!" message
   - Wait 1 hour for first fact generation
   - Or manually test API endpoint

### Manual Test API
```bash
# Post a test fact
curl -X POST http://localhost:5000/api/stream/facts \
  -H "Content-Type: application/json" \
  -d '{"fact":"Test fact: Bananas are berries!","source":"test"}'

# Then visit /facts page to see it
```

## Architecture Overview

```
┌─────────────────┐
│   Stream-Bot    │
│  (Node.js/TS)   │
└────────┬────────┘
         │
         │ Every hour:
         │ 1. Generate fact (OpenAI gpt-4o)
         │ 2. POST to dashboard API
         │
         ▼
┌─────────────────┐
│   Dashboard     │
│  (Flask/Python) │
├─────────────────┤
│ API Endpoint:   │
│ /api/stream/    │
│      facts      │
│                 │
│ Stores in       │
│ artifacts       │
│ table           │
└────────┬────────┘
         │
         │ User visits /facts
         │
         ▼
┌─────────────────┐
│  Facts Frontend │
│   (HTML/JS)     │
├─────────────────┤
│ Features:       │
│ - Card display  │
│ - Statistics    │
│ - Auto-refresh  │
│ - Time format   │
└─────────────────┘
```

## Files Created/Modified

### New Files ✅
1. `services/dashboard/routes/facts_routes.py` (134 lines)
2. `services/dashboard/templates/facts.html` (240 lines)
3. `FRONTEND_STATUS_AND_FIX.md` (this file)

### Modified Files ✅
1. `services/dashboard/app.py` - Added facts_bp import and registration

### Files to Modify Next ❌
1. `services/dashboard/templates/base.html` - Add nav link
2. `services/stream-bot/server/index.ts` - Fix dashboard URL or add auth
3. Possibly `services/dashboard/routes/api.py` - Remove auth requirement for service-to-service

## Summary

**Status:** 80% Complete

✅ **Working:**
- Stream-bot generates facts
- Dashboard has API endpoint
- Frontend UI created
- Routes registered

❌ **Broken:**
- Stream-bot can't POST to dashboard (network/auth issue)
- No navigation link to facts page
- No facts in database yet

**Next Steps:**
1. Fix stream-bot → dashboard connection
2. Add navigation link
3. Test end-to-end flow
4. Restart both services
5. Wait 1 hour or manually trigger fact generation
6. Verify facts appear on /facts page
