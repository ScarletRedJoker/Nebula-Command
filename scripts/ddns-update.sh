#!/bin/bash
set -euo pipefail

SCRIPT_DIR="$(cd "$(dirname "${BASH_SOURCE[0]}")" && pwd)"
STATE_FILE="/tmp/ddns-last-ip.txt"
LOG_FILE="/var/log/ddns-update.log"

log() {
    echo "[$(date '+%Y-%m-%d %H:%M:%S')] $1" | tee -a "$LOG_FILE" 2>/dev/null || echo "[$(date '+%Y-%m-%d %H:%M:%S')] $1"
}

get_public_ip() {
    local ip=""
    for service in "https://api.ipify.org" "https://ifconfig.me" "https://icanhazip.com"; do
        ip=$(curl -sf --max-time 5 "$service" 2>/dev/null | tr -d '\n' || true)
        if [[ "$ip" =~ ^[0-9]+\.[0-9]+\.[0-9]+\.[0-9]+$ ]]; then
            echo "$ip"
            return 0
        fi
    done
    return 1
}

get_last_ip() {
    [ -f "$STATE_FILE" ] && cat "$STATE_FILE" || echo ""
}

save_ip() {
    echo "$1" > "$STATE_FILE"
}

CURRENT_IP=$(get_public_ip) || { log "ERROR: Could not determine public IP"; exit 1; }
LAST_IP=$(get_last_ip)

if [ "$CURRENT_IP" = "$LAST_IP" ]; then
    log "IP unchanged: $CURRENT_IP"
    exit 0
fi

log "IP changed: $LAST_IP -> $CURRENT_IP"

if [ -f "$SCRIPT_DIR/cloudflare-sync.js" ]; then
    log "Updating Cloudflare DNS records..."
    
    if [ -f "$SCRIPT_DIR/package.json" ] && [ ! -d "$SCRIPT_DIR/node_modules" ]; then
        npm install --prefix "$SCRIPT_DIR" --silent 2>/dev/null || true
    fi
    
    REPO_ROOT="$(dirname "$SCRIPT_DIR")"
    cd "$REPO_ROOT"
    
    if node "$SCRIPT_DIR/cloudflare-sync.js" 2>&1 | tee -a "$LOG_FILE"; then
        log "DNS update successful"
        save_ip "$CURRENT_IP"
    else
        log "ERROR: DNS update failed"
        exit 1
    fi
else
    log "ERROR: cloudflare-sync.js not found"
    exit 1
fi
