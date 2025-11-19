# Production Database Schema Fix - Testing Guide

## Purpose
Fixes legacy `agent_messages` table with VARCHAR columns that should be UUID, preventing migration 014 foreign key errors.

## Quick Test

### Prerequisites
```bash
# Ensure you have a .env file with NEON_DATABASE_URL set
cat .env | grep NEON_DATABASE_URL
```

### Test 1: Via homelab-manager.sh (Recommended)
```bash
./homelab-manager.sh
# Select Option 22a: Fix Production Database Schema (VARCHAR → UUID)
# Follow the prompts
```

### Test 2: Direct Script Execution
```bash
cd /home/evin/contain/nebula-command-dashboard
./deployment/scripts/fix-production-database.sh
```

## Expected Behavior

### Scenario 1: No Legacy Table
```
✅ No legacy agent_messages table found
ℹ️  Migration 014 will create it properly
```
**Action:** None needed, exit cleanly

### Scenario 2: UUID Columns Already Present
```
✅ Columns already UUID - schema is correct
ℹ️  No fix needed
```
**Action:** None needed, schema is correct

### Scenario 3: VARCHAR Columns Detected
```
⚠️  OPTIONS:
  1) Drop legacy table and recreate (SAFE if no production data)
  2) Migrate data and alter columns (SAFER if production data exists)

Choose option (1/2):
```

**Option 1 (Drop & Recreate):**
- Fastest method
- Use if no important data in agent_messages
- Tables will be recreated by migration 014

**Option 2 (Backup & Migrate):**
- Safer method
- Creates backup: `agent_messages_backup`
- Preserves data before dropping table
- Migration 014 will recreate with UUID columns

## Post-Fix Steps

After running the fix script:

```bash
# 1. Run migrations to recreate tables properly
docker exec homelab-dashboard python -m alembic upgrade head

# 2. Restart services
./homelab-manager.sh
# Choose: 2) Quick Restart

# 3. Verify no errors
docker logs homelab-dashboard | grep -i agent_messages
docker logs homelab-dashboard | grep -i error
```

## Troubleshooting

### Error: "NEON_DATABASE_URL not found"
```bash
# Check .env file
cat .env | grep NEON_DATABASE_URL

# If missing, add it:
echo "NEON_DATABASE_URL=postgresql://user:password@host/database" >> .env
```

### Error: "Connection refused"
```bash
# Test database connectivity
psql "$NEON_DATABASE_URL" -c "SELECT 1;"

# Check firewall/network
# Verify database host is accessible
```

### Error: "Permission denied"
```bash
# Make script executable
chmod +x deployment/scripts/fix-production-database.sh
```

## Verification

```bash
# Check database schema after fix
psql "$NEON_DATABASE_URL" -c "
  SELECT column_name, data_type 
  FROM information_schema.columns 
  WHERE table_name = 'agent_messages' 
    AND column_name IN ('from_agent_id', 'to_agent_id', 'response_to');
"

# Expected output: All columns should show 'uuid'
```

## Safety Features

- ✅ **Idempotent:** Safe to run multiple times
- ✅ **Checks before changes:** Validates column types first
- ✅ **Backup option:** Option 2 creates backup table
- ✅ **No data loss:** Migration recreates tables properly
- ✅ **Clear prompts:** User chooses fix method

## Related Documentation

- Main troubleshooting: `docs/TROUBLESHOOTING_GUIDE.md` → "Database Migration: agent_messages Foreign Key Error"
- Migration details: `services/dashboard/alembic/versions/014_create_agents_table.py`
- Homelab manager: `./homelab-manager.sh` → Option 22a
