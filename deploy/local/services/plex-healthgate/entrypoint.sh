#!/bin/bash
# Plex Health Gate Entrypoint
# Waits for media mount to be available, starts Plex with graceful handling
# If mount isn't available, Plex starts anyway but logs a warning
#
# User mounts single NAS share (networkshare) to /srv/media on host
# Docker binds /srv/media:/media, so Plex sees /media
# User creates their own subfolders and points Plex libraries wherever they want

set -euo pipefail

MEDIA_PATHS=${MEDIA_PATHS:-"/media"}
WAIT_TIMEOUT=${WAIT_TIMEOUT:-30}
LOG_PREFIX="[plex-healthgate]"

log_info() {
    echo "${LOG_PREFIX} INFO: $1"
}

log_warn() {
    echo "${LOG_PREFIX} WARN: $1"
}

log_error() {
    echo "${LOG_PREFIX} ERROR: $1"
}

check_mount() {
    local path=$1
    
    # Check if path exists
    if [[ ! -d "$path" ]]; then
        return 1
    fi
    
    # Check if it's a mount point or has content
    if mountpoint -q "$path" 2>/dev/null; then
        return 0
    fi
    
    # If it's a symlink, check if target is accessible
    if [[ -L "$path" ]]; then
        local target=$(readlink -f "$path")
        if [[ -d "$target" ]]; then
            return 0
        fi
        return 1
    fi
    
    # Check if directory has content (even if not a mount)
    if [[ -n "$(ls -A "$path" 2>/dev/null)" ]]; then
        return 0
    fi
    
    # Directory exists but is empty - still OK for startup
    # User will add content or NAS will mount later
    return 0
}

wait_for_mounts() {
    local start_time=$(date +%s)
    local all_ready=false
    
    log_info "Checking media mount availability..."
    
    while true; do
        local elapsed=$(($(date +%s) - start_time))
        
        if [[ $elapsed -ge $WAIT_TIMEOUT ]]; then
            log_warn "Timeout waiting for mounts after ${WAIT_TIMEOUT}s"
            break
        fi
        
        local missing=0
        for path in $MEDIA_PATHS; do
            if ! check_mount "$path"; then
                ((missing++)) || true
            fi
        done
        
        if [[ $missing -eq 0 ]]; then
            all_ready=true
            break
        fi
        
        log_info "Waiting for mounts... ($missing paths unavailable, ${elapsed}s elapsed)"
        sleep 2
    done
    
    # Report final status
    log_info "Media mount status:"
    for path in $MEDIA_PATHS; do
        if [[ -d "$path" ]]; then
            local count=$(ls -A "$path" 2>/dev/null | wc -l)
            if [[ $count -gt 0 ]]; then
                log_info "  ✓ $path - available ($count items)"
            else
                log_warn "  ○ $path - exists but empty (NAS may be offline)"
            fi
        else
            log_warn "  ✗ $path - NOT available"
        fi
    done
    
    if $all_ready; then
        log_info "Media mount is ready!"
        return 0
    else
        log_warn "Starting Plex with mount unavailable."
        log_warn "Libraries may show empty until NAS is online."
        return 0  # Still return success to allow Plex to start
    fi
}

main() {
    log_info "Plex Health Gate starting..."
    log_info "Configured media paths: $MEDIA_PATHS"
    log_info "Wait timeout: ${WAIT_TIMEOUT}s"
    log_info "Note: User manages subfolders inside /media"
    
    wait_for_mounts
    
    log_info "Handing off to Plex..."
    
    # Execute the original Plex entrypoint
    exec /init "$@"
}

main "$@"
