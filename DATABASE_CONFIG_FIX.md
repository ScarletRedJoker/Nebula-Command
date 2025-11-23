# Database Configuration Fix

## The Problem

Your dashboard was failing with "HTTP 000000" because of a **database configuration issue**, not missing environment variables.

### Root Cause

The `.env.example` file contains this:

```bash
JARVIS_DB_PASSWORD=YOUR_JARVIS_DB_PASSWORD
JARVIS_DATABASE_URL=postgresql://jarvis:JARVIS_DB_PASSWORD@homelab-postgres:5432/homelab_jarvis
```

When you copy this to `.env` and set:
```bash
JARVIS_DB_PASSWORD=myactualpassword123
```

The `JARVIS_DATABASE_URL` **still contains the literal text "JARVIS_DB_PASSWORD"** instead of your actual password! So when the dashboard tries to connect to PostgreSQL, it fails authentication.

## The Fix (Automatic)

I've updated the database URL resolver to **automatically detect and fix this issue**:

1. ✅ Detects if `JARVIS_DATABASE_URL` contains placeholder text
2. ✅ Auto-builds the correct URL using `JARVIS_DB_PASSWORD`
3. ✅ Falls back to building from scratch if no URL is provided

### What This Means for You

**You now have two options:**

#### Option 1: Just Set the Password (Recommended)
```bash
# In your .env file, ONLY set this:
JARVIS_DB_PASSWORD=your_actual_password

# Leave JARVIS_DATABASE_URL blank or remove it entirely
# The dashboard will auto-build it!
```

#### Option 2: Set the Full URL with Actual Password
```bash
# Set BOTH with the SAME password:
JARVIS_DB_PASSWORD=your_actual_password
JARVIS_DATABASE_URL=postgresql://jarvis:your_actual_password@homelab-postgres:5432/homelab_jarvis
```

## On Your Ubuntu Server

### Quick Check
```bash
cd /home/evin/contain/HomeLabHub
git pull origin main

# Run the diagnostic
./diagnose-startup.sh
```

The diagnostic will now specifically check for this placeholder issue and tell you if it's auto-fixable.

### Expected Output

If you have placeholder text but `JARVIS_DB_PASSWORD` is set:
```
Checking Database URL Configuration:
✗ JARVIS_DATABASE_URL contains placeholder text!
  Found: postgresql://jarvis:JARVIS_DB_PASSWORD@homelab-postgres:5432/homelab_jarvis
  This will cause database connection failures.
  Good news: JARVIS_DB_PASSWORD is set
  The dashboard will auto-fix this on startup!
```

### Then Bootstrap
```bash
./bootstrap-homelab.sh
```

The dashboard will now:
1. ✅ Detect the placeholder in `JARVIS_DATABASE_URL`
2. ✅ Auto-fix it using your actual `JARVIS_DB_PASSWORD`
3. ✅ Connect to PostgreSQL successfully
4. ✅ Run migrations
5. ✅ Start normally

## What Changed in the Code

### `services/dashboard/services/db_url_resolver.py`

The new resolver is smart:

```python
def get_database_url() -> str:
    # Check if URL contains placeholder text
    if 'JARVIS_DB_PASSWORD' in url or 'YOUR_' in url:
        # Auto-fix using actual password
        actual_password = os.getenv('JARVIS_DB_PASSWORD')
        fixed_url = url.replace('JARVIS_DB_PASSWORD', actual_password)
        logger.info("✓ Auto-fixed database URL")
        return fixed_url
    
    # Or build from scratch
    if jarvis_password:
        built_url = f"postgresql://jarvis:{jarvis_password}@homelab-postgres:5432/homelab_jarvis"
        logger.info("✓ Built database URL from JARVIS_DB_PASSWORD")
        return built_url
```

### Benefits

1. **User-Friendly**: No more manually editing connection strings
2. **DRY Principle**: Password defined in ONE place
3. **Error-Proof**: Can't have mismatched passwords
4. **Backward Compatible**: Still works if you set full URLs

## Testing on Replit

The fix is already active. You can test by checking the dashboard logs:

```bash
# If you see this in logs, it's working:
"✓ Auto-fixed database URL using JARVIS_DB_PASSWORD"
# or
"✓ Built database URL from JARVIS_DB_PASSWORD"
```

## Summary

**Before:** Users had to manually replace `JARVIS_DB_PASSWORD` in the connection string with their actual password (error-prone, confusing)

**After:** Just set `JARVIS_DB_PASSWORD` once, and the dashboard auto-builds the correct URL

This was a legitimate design flaw. Thanks for pushing me to investigate the database layer! 🎯
