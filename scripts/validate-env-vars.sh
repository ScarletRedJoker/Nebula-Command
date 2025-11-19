#!/bin/bash

echo "=================================================================="
echo " ✅ Environment Variable Validation"
echo "=================================================================="
echo ""

# Check for .env file
if [ ! -f ".env" ]; then
    echo "❌ ERROR: .env file not found"
    exit 1
fi

echo "Validating environment variables..."
echo ""

# Required variables
REQUIRED_VARS=(
    "DISCORD_BOT_TOKEN"
    "DISCORD_CLIENT_ID"
    "DISCORD_CLIENT_SECRET"
    "TWITCH_CLIENT_ID"
    "TWITCH_CLIENT_SECRET"
    "OPENAI_API_KEY"
    "VNC_PASSWORD"
    "CODE_SERVER_PASSWORD"
    "HOME_ASSISTANT_URL"
    "HOME_ASSISTANT_TOKEN"
    "N8N_ENCRYPTION_KEY"
    "MINIO_ROOT_PASSWORD"
    "SESSION_SECRET"
    "STREAMBOT_DB_PASSWORD"
    "DISCORD_DB_PASSWORD"
    "JARVIS_DB_PASSWORD"
)

MISSING_VARS=()
PRESENT_VARS=()

for var in "${REQUIRED_VARS[@]}"; do
    if grep -q "^${var}=" .env && [ -n "$(grep ^${var}= .env | cut -d'=' -f2)" ]; then
        PRESENT_VARS+=("$var")
        echo "✅ $var"
    else
        MISSING_VARS+=("$var")
        echo "❌ $var - MISSING or EMPTY"
    fi
done

echo ""
echo "=================================================================="
echo " Summary:"
echo "=================================================================="
echo "  ✅ Present: ${#PRESENT_VARS[@]}/${#REQUIRED_VARS[@]}"
echo "  ❌ Missing: ${#MISSING_VARS[@]}/${#REQUIRED_VARS[@]}"
echo ""

if [ ${#MISSING_VARS[@]} -gt 0 ]; then
    echo "Missing variables:"
    for var in "${MISSING_VARS[@]}"; do
        echo "  - $var"
    done
    echo ""
    echo "❌ VALIDATION FAILED"
    exit 1
else
    echo "✅ ALL REQUIRED VARIABLES PRESENT"
fi

echo ""
echo "Special Notes:"
echo "  ℹ️  All OAuth secrets (YouTube, Spotify, Kick) are optional"
echo "      They're only needed if users want to connect those platforms."
echo ""
echo "  ℹ️  Database passwords are auto-generated if not present"
echo "      Make sure they stay consistent once set!"
echo ""
