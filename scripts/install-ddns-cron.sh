#!/bin/bash
set -euo pipefail

SCRIPT_DIR="$(cd "$(dirname "${BASH_SOURCE[0]}")" && pwd)"
DDNS_SCRIPT="$SCRIPT_DIR/ddns-update.sh"

chmod +x "$DDNS_SCRIPT"

CRON_JOB="*/5 * * * * $DDNS_SCRIPT >/dev/null 2>&1"

if crontab -l 2>/dev/null | grep -q "ddns-update.sh"; then
    echo "DDNS cron job already exists"
else
    (crontab -l 2>/dev/null; echo "$CRON_JOB") | crontab -
    echo "DDNS cron job installed (runs every 5 minutes)"
fi

echo ""
echo "To test immediately: $DDNS_SCRIPT"
echo "To view logs: tail -f /var/log/ddns-update.log"
