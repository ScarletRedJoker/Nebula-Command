#!/bin/bash
# Plex Health Gate Entrypoint
# Waits for media mounts to be available, starts Plex with graceful handling
# If mounts aren't available, Plex starts anyway but logs a warning

set -euo pipefail

MEDIA_PATHS=${MEDIA_PATHS:-"/media/movies /media/shows /media/music"}
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
    
    return 1
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
        if check_mount "$path"; then
            log_info "  ✓ $path - available"
        else
            log_warn "  ✗ $path - NOT available"
        fi
    done
    
    if $all_ready; then
        log_info "All media mounts are ready!"
        return 0
    else
        log_warn "Starting Plex with some mounts unavailable."
        log_warn "Libraries may show empty until NAS is online."
        return 0  # Still return success to allow Plex to start
    fi
}

main() {
    log_info "Plex Health Gate starting..."
    log_info "Configured media paths: $MEDIA_PATHS"
    log_info "Wait timeout: ${WAIT_TIMEOUT}s"
    
    wait_for_mounts
    
    log_info "Handing off to Plex..."
    
    # Execute the original Plex entrypoint
    exec /init "$@"
}

main "$@"
