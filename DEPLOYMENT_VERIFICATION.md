# Production Deployment Verification Checklist

## Pre-Deployment Checks

### 1. Environment Variables

Check your production `.env` file has these critical variables:

```bash
# Required for both services
OPENAI_API_KEY=sk-proj-...                    # Must be real OpenAI API key

# Optional (falls back to OPENAI_API_KEY)
STREAMBOT_OPENAI_API_KEY=sk-proj-...         # Can be same as OPENAI_API_KEY
```

Verify in production:
```bash
grep "OPENAI_API_KEY" .env
# Should show: OPENAI_API_KEY=sk-proj-...
# NOT: OPENAI_API_KEY=YOUR_OPENAI_API_KEY_HERE
```

### 2. Docker Compose Configuration

Verify docker-compose.yml has correct settings:

```bash
# Dashboard should have (line ~122):
- OPENAI_API_KEY=${OPENAI_API_KEY}

# Stream-bot should have (line ~259-261):
OPENAI_API_KEY: ${STREAMBOT_OPENAI_API_KEY:-${OPENAI_API_KEY}}
OPENAI_BASE_URL: ${STREAMBOT_OPENAI_BASE_URL:-https://api.openai.com/v1}
STREAMBOT_FACT_MODEL: gpt-4o
```

---

## Deployment Steps

Run the automated deployment script:

```bash
cd /home/evin/contain/HomeLabHub
./deploy-fix.sh
```

Or manual deployment:

### Manual Step 1: Fix Stream-Bot Database

```bash
docker exec -i homelab-postgres psql -U streambot -d streambot <<'EOF'
UPDATE bot_config 
SET ai_model = 'gpt-4o' 
WHERE ai_model IN ('gpt-5-mini', 'gpt-4o-mini', 'gpt-3.5-turbo');

UPDATE users 
SET ai_model = 'gpt-4o' 
WHERE ai_model IN ('gpt-5-mini', 'gpt-4o-mini', 'gpt-3.5-turbo');

SELECT 'bot_config' as table_name, ai_model, COUNT(*) 
FROM bot_config GROUP BY ai_model
UNION ALL
SELECT 'users' as table_name, ai_model, COUNT(*) 
FROM users GROUP BY ai_model;
EOF
```

### Manual Step 2: Rebuild Stream-Bot

```bash
docker-compose up -d --build stream-bot
sleep 15
docker-compose logs stream-bot | tail -50
```

### Manual Step 3: Restart Dashboard

```bash
docker-compose restart homelab-dashboard homelab-celery-worker
sleep 10
docker-compose logs homelab-dashboard | grep "AI Service"
```

---

## Post-Deployment Verification

### Verification 1: Stream-Bot Fact Generation

**Test automatic generation (on startup):**
```bash
# Check logs for fact generation
docker-compose logs stream-bot | grep -A5 "Facts"

# Expected output:
# [Facts] ✓ Snapple Fact generation service configured (immediate + 1 fact/hour)
# [Facts] Generating fact...
# [OpenAI] Generating fact with model: gpt-4o
# [Facts] ✓ Stored fact in stream-bot database
```

**Test manual generation (web UI):**
1. Visit: https://stream.rig-city.com/trigger
2. Click: "Generate Preview" button
3. Expected: New fact appears within 2-3 seconds

**Test API directly:**
```bash
# Get latest fact
curl https://stream.rig-city.com/api/facts/latest

# Expected response:
# {"fact":{"id":"uuid","text":"Interesting fact here...","created_at":"timestamp"}}
```

### Verification 2: Dashboard Jarvis Chatbot

**Test AI service initialization:**
```bash
# Check initialization logs
docker-compose logs homelab-dashboard | grep -i "AI Service"

# Expected output:
# AI Service initialized with Production OpenAI credentials
#   Base URL: https://api.openai.com/v1
```

**Test chatbot (web UI):**
1. Visit: https://host.evindrake.net/assistant
2. Type message: "Hello Jarvis, what's the current time?"
3. Expected: Intelligent response from GPT-4o-mini within 2-3 seconds

**Test API directly:**
```bash
# Test chat endpoint (requires authentication)
curl -X POST https://host.evindrake.net/api/ai/chat \
  -H "Content-Type: application/json" \
  -H "Authorization: Basic $(echo -n 'admin:Brs=2729' | base64)" \
  -d '{"message":"Hello Jarvis","model":"gpt-4o-mini"}'

# Expected response:
# {"success":true,"response":"Hello! How can I help you...","model":"gpt-4o-mini"}
```

### Verification 3: Service Independence

**Test independent restarts:**
```bash
# Restart stream-bot
docker-compose restart stream-bot
sleep 5

# Verify dashboard still works
curl -s https://host.evindrake.net/ | grep -q "Dashboard" && echo "✓ Dashboard OK"

# Restart dashboard
docker-compose restart homelab-dashboard
sleep 5

# Verify stream-bot still works
curl -s https://stream.rig-city.com/api/facts/latest | grep -q "fact" && echo "✓ Stream-bot OK"
```

### Verification 4: Database Separation

**Check each service owns its own data:**
```bash
# Stream-bot facts
docker exec -i homelab-postgres psql -U streambot -d streambot <<'EOF'
SELECT COUNT(*) as total_facts FROM facts;
SELECT created_at::date, COUNT(*) 
FROM facts 
GROUP BY created_at::date 
ORDER BY created_at::date DESC 
LIMIT 7;
EOF

# Dashboard AI sessions
docker exec -i homelab-postgres psql -U homelab -d homelab_jarvis <<'EOF'
SELECT COUNT(*) as total_sessions FROM ai_sessions WHERE session_type = 'chat';
SELECT DATE(created_at), COUNT(*) 
FROM ai_sessions 
GROUP BY DATE(created_at) 
ORDER BY DATE(created_at) DESC 
LIMIT 7;
EOF
```

---

## Common Issues and Solutions

### Issue 1: Stream-Bot Not Generating Facts

**Symptoms:**
- No log entries showing fact generation
- API returns empty or error

**Diagnosis:**
```bash
# Check OpenAI key is set
docker exec stream-bot printenv | grep OPENAI_API_KEY

# Check database connection
docker exec -i homelab-postgres psql -U streambot -d streambot -c "SELECT COUNT(*) FROM facts"

# Check logs for errors
docker-compose logs stream-bot | grep -i error
```

**Solution:**
```bash
# If OPENAI_API_KEY missing:
# Edit .env file and add: OPENAI_API_KEY=sk-proj-...
# Then rebuild: docker-compose up -d --build stream-bot

# If database issue:
# Check DATABASE_URL in .env
# Verify PostgreSQL is running: docker-compose ps homelab-postgres
```

### Issue 2: Dashboard Jarvis Not Responding

**Symptoms:**
- Returns error: "AI service not available"
- No response from chatbot

**Diagnosis:**
```bash
# Check if AI service initialized
docker-compose logs homelab-dashboard | grep "AI Service"

# Check OpenAI key
docker exec homelab-dashboard printenv | grep -E "OPENAI|AI_INTEGRATIONS"

# Check for errors
docker-compose logs homelab-dashboard | grep -i error | tail -20
```

**Solution:**
```bash
# If "AI Service not initialized" message:
# 1. Verify .env has OPENAI_API_KEY set
# 2. Verify docker-compose.yml has environment variable mapped
# 3. Restart: docker-compose restart homelab-dashboard

# If 401/403 error:
# API key may be invalid, regenerate at https://platform.openai.com/api-keys
```

### Issue 3: Wrong AI Model Being Used

**Symptoms:**
- Logs show "gpt-3.5-turbo" or "gpt-5-mini" or "gpt-4o-mini" instead of "gpt-4o"

**Diagnosis:**
```bash
# Check stream-bot environment
docker exec stream-bot printenv | grep FACT_MODEL

# Check database records
docker exec -i homelab-postgres psql -U streambot -d streambot -c \
  "SELECT ai_model, COUNT(*) FROM bot_config GROUP BY ai_model"
```

**Solution:**
```bash
# Update environment variable in docker-compose.yml:
# STREAMBOT_FACT_MODEL: gpt-4o

# Update database records:
# Run: ./deploy-fix.sh
# Or manually run the SQL updates from Step 1 above

# Rebuild container:
docker-compose up -d --build stream-bot
```

### Issue 4: Services Interfering With Each Other

**Symptoms:**
- Restarting one service affects another
- Data appears in wrong database schema
- Cross-service errors in logs

**Diagnosis:**
```bash
# Check service separation
docker-compose ps

# Check database schemas
docker exec -i homelab-postgres psql -U postgres <<'EOF'
SELECT nspname FROM pg_namespace WHERE nspname IN ('streambot', 'homelab_jarvis', 'discord');
EOF

# Check for cross-service queries (should be none)
docker-compose logs | grep -E "streambot.*homelab_jarvis|homelab_jarvis.*streambot"
```

**Solution:**
- Review SERVICE_OWNERSHIP.md for correct architecture
- Each service should ONLY query its own database schema
- Cross-service communication should ONLY use HTTP APIs (read-only)
- Never store another service's data in your database

---

## Success Criteria Checklist

- [ ] Stream-bot generates facts automatically on startup
- [ ] Stream-bot generates facts every hour
- [ ] "Generate Preview" button works on stream.rig-city.com/trigger
- [ ] API endpoint /api/facts/latest returns valid facts
- [ ] Dashboard Jarvis chatbot responds to messages
- [ ] Jarvis uses gpt-4o-mini model (check logs)
- [ ] Stream-bot uses gpt-4o model (check logs)
- [ ] All database records updated to gpt-4o
- [ ] Services can restart independently
- [ ] Each service queries only its own database schema
- [ ] No errors in logs related to AI/OpenAI
- [ ] No cross-service data storage

---

## Monitoring

### Continuous Monitoring Commands

```bash
# Watch all services
watch -n 5 'docker-compose ps'

# Monitor logs
docker-compose logs -f --tail=50 stream-bot homelab-dashboard

# Check for errors every minute
watch -n 60 'docker-compose logs --since=1m | grep -i error'

# Monitor fact generation (hourly)
watch -n 3600 'docker-compose logs stream-bot | grep "Generating fact" | tail -5'
```

### Health Check Endpoints

```bash
# Stream-bot health
curl https://stream.rig-city.com/health || curl http://localhost:5000/health

# Dashboard health
curl https://host.evindrake.net/ | head -1

# Database health
docker exec homelab-postgres pg_isready
```

---

## Rollback Procedure

If deployment fails:

```bash
# Stop all services
docker-compose down

# Revert code changes
git checkout HEAD~1

# Restore database from backup (if needed)
# ./homelab db restore <backup-name>

# Start services with old code
docker-compose up -d

# Verify health
./homelab status
```

---

## Documentation References

- **Complete Deployment Guide**: COMPLETE_SERVICE_SEPARATION_FIX.md
- **Service Architecture**: SERVICE_OWNERSHIP.md
- **Production Deployment**: PRODUCTION_DEPLOYMENT_FIX.md
- **AI Model Fix**: services/stream-bot/DEPLOYMENT_AI_MODEL_FIX.md
