# Ubuntu Environment Variable Validation Tool

## Overview

The `setup-ubuntu-env.sh` script is a comprehensive environment variable validation and setup tool designed to prevent deployment failures on Ubuntu by ensuring all required environment variables are properly configured before services start.

## Features

✅ **Comprehensive Validation**
- Checks all critical environment variables required for deployment
- Validates Dashboard, Discord Bot, Stream Bot, and Infrastructure variables
- Distinguishes between required and optional variables

✅ **User-Friendly Output**
- Colorized terminal output (green=configured, red=missing, yellow=warning)
- Clear section headers for each service category
- Detailed summary with counts of configured/missing variables

✅ **Intelligent Setup**
- Auto-generates .env from .env.example if missing
- Provides copy-paste commands to generate secure secrets
- Includes "quick-fix" snippets to generate all missing secrets at once

✅ **Smart Exit Codes**
- Returns `0` if all required variables are present (ready to deploy)
- Returns `1` if any critical variables are missing (blocks deployment)

## Usage

### Basic Validation

```bash
# Run the validation script
bash scripts/setup-ubuntu-env.sh

# Or make it executable and run directly
chmod +x scripts/setup-ubuntu-env.sh
./scripts/setup-ubuntu-env.sh
```

### Integration with Deployment Pipeline

```bash
# In your deployment script, check validation before deploying
if bash scripts/setup-ubuntu-env.sh; then
    echo "✅ Environment validated - proceeding with deployment"
    docker-compose up -d
else
    echo "❌ Environment validation failed - fix issues before deploying"
    exit 1
fi
```

### First-Time Setup

If you don't have a `.env` file, the script will offer to create one from `.env.example`:

```
❌ .env file not found

⚠️  No .env file detected!

Would you like to create .env from .env.example? (y/n)
```

## Validated Variables

### Dashboard (Critical)
- `WEB_USERNAME` - Dashboard login username
- `WEB_PASSWORD` - Dashboard login password
- `DASHBOARD_API_KEY` - API authentication key (auto-generatable)
- `SESSION_SECRET` - Session encryption secret (auto-generatable)
- `OPENAI_API_KEY` - OpenAI API key for AI features
- `JARVIS_DB_PASSWORD` - Jarvis database password (auto-generatable)
- `REDIS_URL` - Redis connection URL (auto-configured if missing)

### Discord Bot (Critical)
- `DISCORD_BOT_TOKEN` - Bot authentication token
- `DISCORD_CLIENT_ID` - Application client ID
- `DISCORD_CLIENT_SECRET` - OAuth2 client secret
- `DISCORD_DB_PASSWORD` - Database password (auto-generatable)
- `DISCORD_SESSION_SECRET` - Session secret (auto-generatable)

### Stream Bot (Mixed)
- `STREAMBOT_DB_PASSWORD` - Database password (auto-generatable)
- `STREAMBOT_SESSION_SECRET` - Session secret (auto-generatable)
- `TWITCH_CLIENT_ID` - Twitch integration (optional)
- `TWITCH_CLIENT_SECRET` - Twitch integration (optional)
- `KICK_CLIENT_ID` - Kick integration (optional)
- `KICK_CLIENT_SECRET` - Kick integration (optional)
- `YOUTUBE_CLIENT_ID` - YouTube integration (optional)
- `YOUTUBE_CLIENT_SECRET` - YouTube integration (optional)

### Infrastructure (Optional)
- `ZONEEDIT_USERNAME` - Dynamic DNS username
- `ZONEEDIT_PASSWORD` - Dynamic DNS password
- `MINIO_ROOT_PASSWORD` - Object storage password (auto-generatable)
- `VNC_PASSWORD` - VNC viewer password (optional)
- `VNC_USER_PASSWORD` - VNC user password (optional)
- `PLEX_CLAIM` - Plex claim token (optional, expires in 4 minutes)

## Example Output

### ✅ Successful Validation

```
╔══════════════════════════════════════════════════════════════╗
║    NebulaCommand Environment Variable Validation            ║
╚══════════════════════════════════════════════════════════════╝

✅ .env file found

━━━ Dashboard Variables ━━━
✅ WEB_USERNAME
✅ WEB_PASSWORD
✅ DASHBOARD_API_KEY
✅ SESSION_SECRET
✅ OPENAI_API_KEY
✅ JARVIS_DB_PASSWORD
ℹ️  REDIS_URL (Will be auto-configured to redis://redis:6379/0)

━━━ Discord Bot Variables ━━━
✅ DISCORD_BOT_TOKEN
✅ DISCORD_CLIENT_ID
✅ DISCORD_CLIENT_SECRET
✅ DISCORD_DB_PASSWORD
✅ DISCORD_SESSION_SECRET

━━━ Stream Bot Variables ━━━
✅ STREAMBOT_DB_PASSWORD
✅ STREAMBOT_SESSION_SECRET
⚠️  TWITCH_CLIENT_ID (OPTIONAL - Twitch integration)
⚠️  TWITCH_CLIENT_SECRET (OPTIONAL - Twitch integration)

━━━ Summary ━━━
Total Variables: 25
✅ Configured: 20
❌ Missing Critical: 0
⚠️  Missing Optional: 5

╔══════════════════════════════════════════════════════════════╗
║                                                              ║
║  🚀 VALIDATION PASSED! All critical variables configured.   ║
║                                                              ║
╚══════════════════════════════════════════════════════════════╝

✅ Ready to deploy!

Next steps:
  • Review configuration: cat .env
  • Start services: docker-compose up -d
  • Check logs: docker-compose logs -f
```

### ❌ Failed Validation (Missing Variables)

```
╔══════════════════════════════════════════════════════════════╗
║    NebulaCommand Environment Variable Validation            ║
╚══════════════════════════════════════════════════════════════╝

✅ .env file found

━━━ Dashboard Variables ━━━
✅ WEB_USERNAME
✅ WEB_PASSWORD
❌ DASHBOARD_API_KEY (MISSING - Dashboard API key)
❌ SESSION_SECRET (MISSING - Session encryption secret)
❌ OPENAI_API_KEY (MISSING - OpenAI API key for AI features)
✅ JARVIS_DB_PASSWORD

━━━ Discord Bot Variables ━━━
❌ DISCORD_BOT_TOKEN (MISSING - Discord bot token)
✅ DISCORD_CLIENT_ID
✅ DISCORD_CLIENT_SECRET

━━━ Summary ━━━
Total Variables: 25
✅ Configured: 15
❌ Missing Critical: 4
⚠️  Missing Optional: 6

🛑 DEPLOYMENT BLOCKED - Fix missing variables before deploying!

━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━
Missing Critical Variables:
━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━

Auto-Generatable Secrets:
Run these commands to generate secure values:

1. DASHBOARD_API_KEY - Dashboard API key
   python3 -c 'import secrets; print(secrets.token_urlsafe(32))'

2. SESSION_SECRET - Session encryption secret
   python3 -c 'import secrets; print(secrets.token_hex(64))'

Quick-fix: Generate all at once:
cat >> .env << EOF
DASHBOARD_API_KEY=$(python3 -c 'import secrets; print(secrets.token_urlsafe(32))')
SESSION_SECRET=$(python3 -c 'import secrets; print(secrets.token_hex(64))')
EOF

Manual Configuration Required:

3. OPENAI_API_KEY - OpenAI API key for AI features
   Get from: https://platform.openai.com/api-keys

4. DISCORD_BOT_TOKEN - Discord bot token
   Get from: https://discord.com/developers/applications → Bot → Token

━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━

⚠️  Optional Features Not Configured:

  • TWITCH_CLIENT_ID - Twitch integration
    Get from: https://dev.twitch.tv/console/apps → Register application
  • YOUTUBE_CLIENT_ID - YouTube livestream integration
    Get from: https://console.cloud.google.com/apis/credentials → Create OAuth 2.0 Client ID

ℹ️  These are optional. Services will start without them, but some features may be disabled.

╔══════════════════════════════════════════════════════════════╗
║                                                              ║
║  🛑 VALIDATION FAILED - Missing 4 critical variable(s)      ║
║                                                              ║
╚══════════════════════════════════════════════════════════════╝

❌ Cannot deploy until all critical variables are set.

Fix the issues above, then run this script again:
  bash scripts/setup-ubuntu-env.sh
```

## Quick Fixes

### Generate All Missing Auto-Generatable Secrets

When the script detects missing auto-generatable secrets, it provides a "Quick-fix" snippet:

```bash
# Copy-paste output from the script, which looks like:
cat >> .env << EOF
DASHBOARD_API_KEY=$(python3 -c 'import secrets; print(secrets.token_urlsafe(32))')
SESSION_SECRET=$(python3 -c 'import secrets; print(secrets.token_hex(64))')
JARVIS_DB_PASSWORD=$(python3 -c 'import secrets; print(secrets.token_urlsafe(16))')
DISCORD_DB_PASSWORD=$(python3 -c 'import secrets; print(secrets.token_urlsafe(16))')
STREAMBOT_DB_PASSWORD=$(python3 -c 'import secrets; print(secrets.token_urlsafe(16))')
DISCORD_SESSION_SECRET=$(python3 -c 'import secrets; print(secrets.token_hex(32))')
STREAMBOT_SESSION_SECRET=$(python3 -c 'import secrets; print(secrets.token_hex(32))')
MINIO_ROOT_PASSWORD=$(python3 -c 'import secrets; print(secrets.token_urlsafe(24))')
EOF
```

### Manual Setup Steps

For API keys and OAuth credentials that require manual setup:

1. **OpenAI API Key**
   ```
   Visit: https://platform.openai.com/api-keys
   Create new secret key
   Add to .env: OPENAI_API_KEY=sk-proj-xxx...
   ```

2. **Discord Bot Token**
   ```
   Visit: https://discord.com/developers/applications
   Select your application → Bot → Reset Token
   Add to .env: DISCORD_BOT_TOKEN=xxx...
   ```

3. **Twitch OAuth**
   ```
   Visit: https://dev.twitch.tv/console/apps
   Register Your Application
   Add to .env:
     TWITCH_CLIENT_ID=xxx...
     TWITCH_CLIENT_SECRET=xxx...
   ```

## Integration with CI/CD

### GitHub Actions Example

```yaml
- name: Validate Environment Variables
  run: |
    bash scripts/setup-ubuntu-env.sh
    
- name: Deploy Services
  if: success()
  run: |
    docker-compose up -d
```

### Pre-Deployment Check

```bash
#!/bin/bash
# deployment/pre-deploy-check.sh

set -e

echo "Running pre-deployment validation..."

# Validate environment
if ! bash scripts/setup-ubuntu-env.sh; then
    echo "❌ Environment validation failed"
    exit 1
fi

# Additional checks
echo "✅ Environment validated"
echo "Proceeding with deployment..."
```

## Troubleshooting

### Script reports variable as missing but it's set in .env

**Solution**: Check for syntax errors in .env file
```bash
# View .env file
cat .env

# Check for:
# - Missing quotes around values with spaces
# - Trailing whitespace
# - Lines without = sign
# - Comments in wrong format
```

### Quick-fix command doesn't work

**Solution**: Ensure Python 3 is installed
```bash
# Check Python version
python3 --version

# If missing, install:
sudo apt update && sudo apt install python3 -y
```

### Script says .env exists but variables still missing

**Solution**: Variables might be empty
```bash
# Find empty variables
grep "^[A-Z_]*=$" .env

# Or use the script's validation to identify them
bash scripts/setup-ubuntu-env.sh
```

## Best Practices

1. **Run Before Every Deployment**
   - Always validate environment before deploying
   - Prevents crash-loops due to missing variables

2. **Use Auto-Generation**
   - Let the script generate secure secrets
   - Don't reuse secrets across environments

3. **Keep .env Secure**
   - Never commit .env to version control
   - Use .env.example for templates
   - Rotate secrets regularly

4. **Document Custom Variables**
   - If you add custom variables, update this script
   - Keep validation in sync with docker-compose.yml

5. **CI/CD Integration**
   - Make environment validation a required CI/CD step
   - Fail fast if variables are missing

## Related Scripts

- `deployment/generate-unified-env.sh` - Interactive environment setup
- `deployment/check-all-env.sh` - Legacy environment checker
- `.env.example` - Template for all environment variables

## Support

For issues or questions about environment configuration:
1. Check this documentation
2. Review `.env.example` for variable descriptions
3. Consult the main project README.md
4. Review service-specific documentation in `services/*/README.md`
