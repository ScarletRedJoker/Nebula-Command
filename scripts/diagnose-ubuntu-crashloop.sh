#!/usr/bin/env bash
################################################################################
# Ubuntu Crash-Loop Diagnostic Tool
#
# This script diagnoses why services are crash-looping on Ubuntu production
# by checking logs, environment variables, database connectivity, network,
# ports, permissions, and resource limits.
#
# Usage: ./scripts/diagnose-ubuntu-crashloop.sh
################################################################################

set -e

RED='\033[0;31m'
GREEN='\033[0;32m'
YELLOW='\033[1;33m'
BLUE='\033[0;34m'
CYAN='\033[0;36m'
BOLD='\033[1m'
NC='\033[0m'

SCRIPT_DIR="$(cd "$(dirname "${BASH_SOURCE[0]}")" && pwd)"
PROJECT_DIR="$(dirname "$SCRIPT_DIR")"

echo -e "${BOLD}${BLUE}━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━${NC}"
echo -e "${BOLD}  Ubuntu Crash-Loop Diagnostic Tool${NC}"
echo -e "${BOLD}${BLUE}━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━${NC}"
echo ""
echo "Analyzing crash-looping services: homelab-dashboard, discord-bot, stream-bot, vnc-desktop"
echo ""

CRASH_SERVICES=("homelab-dashboard" "discord-bot" "stream-bot" "vnc-desktop")
CRITICAL_ISSUES=0
WARNINGS=0

cd "$PROJECT_DIR" || exit 1

# Helper function to print section headers
print_section() {
    echo ""
    echo -e "${BOLD}${CYAN}━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━${NC}"
    echo -e "${BOLD}  $1${NC}"
    echo -e "${BOLD}${CYAN}━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━${NC}"
    echo ""
}

# ===== SECTION 1: Container Status Overview =====
print_section "SECTION 1: Container Status Overview"

echo "Current container status:"
echo ""
if docker ps -a --format "table {{.Names}}\t{{.Status}}\t{{.State}}" --filter "name=homelab-dashboard" --filter "name=discord-bot" --filter "name=stream-bot" --filter "name=vnc-desktop" 2>/dev/null; then
    echo ""
else
    echo -e "${RED}✗${NC} Cannot list containers. Is Docker running?"
    CRITICAL_ISSUES=$((CRITICAL_ISSUES + 1))
fi

# ===== SECTION 2: Detailed Container Diagnostics =====
print_section "SECTION 2: Detailed Container Diagnostics"

for service in "${CRASH_SERVICES[@]}"; do
    echo -e "${BOLD}━━━ Diagnosing: ${service} ━━━${NC}"
    echo ""
    
    # Check if container exists
    if ! docker inspect "$service" &>/dev/null; then
        echo -e "${RED}✗${NC} Container '$service' does not exist"
        echo -e "${YELLOW}FIX:${NC} Run: docker-compose -f docker-compose.unified.yml up -d $service"
        echo ""
        CRITICAL_ISSUES=$((CRITICAL_ISSUES + 1))
        continue
    fi
    
    # Get container state
    STATE=$(docker inspect "$service" --format '{{.State.Status}}' 2>/dev/null || echo "unknown")
    RUNNING=$(docker inspect "$service" --format '{{.State.Running}}' 2>/dev/null || echo "false")
    RESTART_COUNT=$(docker inspect "$service" --format '{{.RestartCount}}' 2>/dev/null || echo "0")
    EXIT_CODE=$(docker inspect "$service" --format '{{.State.ExitCode}}' 2>/dev/null || echo "0")
    STARTED_AT=$(docker inspect "$service" --format '{{.State.StartedAt}}' 2>/dev/null || echo "unknown")
    FINISHED_AT=$(docker inspect "$service" --format '{{.State.FinishedAt}}' 2>/dev/null || echo "unknown")
    OOM_KILLED=$(docker inspect "$service" --format '{{.State.OOMKilled}}' 2>/dev/null || echo "false")
    
    echo "  State: $STATE"
    echo "  Running: $RUNNING"
    echo "  Restart Count: $RESTART_COUNT"
    echo "  Exit Code: $EXIT_CODE"
    echo "  Started At: $STARTED_AT"
    echo "  Finished At: $FINISHED_AT"
    echo "  OOM Killed: $OOM_KILLED"
    echo ""
    
    # Analyze exit code
    if [ "$EXIT_CODE" != "0" ]; then
        echo -e "${RED}✗${NC} Non-zero exit code detected: $EXIT_CODE"
        case $EXIT_CODE in
            1)
                echo "  Common causes: Application error, missing dependencies, configuration error"
                ;;
            2)
                echo "  Common causes: Misuse of shell command"
                ;;
            126)
                echo "  Common causes: Command cannot execute (permission issue)"
                ;;
            127)
                echo "  Common causes: Command not found"
                ;;
            137)
                echo "  Common causes: Container killed (OOM or manual kill)"
                ;;
            139)
                echo "  Common causes: Segmentation fault"
                ;;
            143)
                echo "  Common causes: Graceful termination (SIGTERM)"
                ;;
            *)
                echo "  Check logs for application-specific error"
                ;;
        esac
        echo ""
        CRITICAL_ISSUES=$((CRITICAL_ISSUES + 1))
    fi
    
    # Check if OOM killed
    if [ "$OOM_KILLED" = "true" ]; then
        echo -e "${RED}✗${NC} Container was killed due to Out Of Memory (OOM)"
        echo -e "${YELLOW}FIX:${NC} Increase memory limits in docker-compose.unified.yml"
        echo ""
        CRITICAL_ISSUES=$((CRITICAL_ISSUES + 1))
    fi
    
    # Get last 50 lines of logs
    echo -e "${BOLD}Last 50 log lines:${NC}"
    echo "----------------------------------------"
    docker logs --tail 50 "$service" 2>&1 || echo "Cannot fetch logs"
    echo "----------------------------------------"
    echo ""
    
    # Analyze logs for common errors
    echo -e "${BOLD}Analyzing logs for common errors:${NC}"
    LOGS=$(docker logs --tail 200 "$service" 2>&1)
    
    if echo "$LOGS" | grep -qi "ECONNREFUSED"; then
        echo -e "${RED}✗${NC} Connection refused errors found (database or service not ready)"
        CRITICAL_ISSUES=$((CRITICAL_ISSUES + 1))
    fi
    
    if echo "$LOGS" | grep -qi "ENOENT"; then
        echo -e "${RED}✗${NC} File not found errors detected"
        CRITICAL_ISSUES=$((CRITICAL_ISSUES + 1))
    fi
    
    if echo "$LOGS" | grep -qi "EACCES\|permission denied"; then
        echo -e "${RED}✗${NC} Permission denied errors found"
        echo -e "${YELLOW}FIX:${NC} Check file/directory permissions and volume mounts"
        CRITICAL_ISSUES=$((CRITICAL_ISSUES + 1))
    fi
    
    if echo "$LOGS" | grep -qi "Cannot find module\|MODULE_NOT_FOUND"; then
        echo -e "${RED}✗${NC} Missing Node.js modules detected"
        echo -e "${YELLOW}FIX:${NC} Rebuild container: docker-compose -f docker-compose.unified.yml build --no-cache $service"
        CRITICAL_ISSUES=$((CRITICAL_ISSUES + 1))
    fi
    
    if echo "$LOGS" | grep -qi "ImportError\|ModuleNotFoundError"; then
        echo -e "${RED}✗${NC} Missing Python modules detected"
        echo -e "${YELLOW}FIX:${NC} Rebuild container: docker-compose -f docker-compose.unified.yml build --no-cache $service"
        CRITICAL_ISSUES=$((CRITICAL_ISSUES + 1))
    fi
    
    if echo "$LOGS" | grep -qi "database.*not.*exist\|relation.*does not exist"; then
        echo -e "${RED}✗${NC} Database schema issues detected"
        echo -e "${YELLOW}FIX:${NC} Run migrations or initialize database"
        CRITICAL_ISSUES=$((CRITICAL_ISSUES + 1))
    fi
    
    if echo "$LOGS" | grep -qi "FATAL.*password authentication failed"; then
        echo -e "${RED}✗${NC} Database authentication failure"
        echo -e "${YELLOW}FIX:${NC} Check DATABASE_URL and database passwords in .env"
        CRITICAL_ISSUES=$((CRITICAL_ISSUES + 1))
    fi
    
    if echo "$LOGS" | grep -qi "address already in use\|EADDRINUSE"; then
        echo -e "${RED}✗${NC} Port conflict detected"
        echo -e "${YELLOW}FIX:${NC} Another service is using the required port"
        CRITICAL_ISSUES=$((CRITICAL_ISSUES + 1))
    fi
    
    echo ""
done

# ===== SECTION 3: Environment Variables Check =====
print_section "SECTION 3: Environment Variables Check"

for service in "${CRASH_SERVICES[@]}"; do
    if ! docker inspect "$service" &>/dev/null; then
        continue
    fi
    
    echo -e "${BOLD}━━━ Environment for: ${service} ━━━${NC}"
    echo ""
    
    # Get environment variables (masked for security)
    ENV_VARS=$(docker inspect "$service" --format '{{range .Config.Env}}{{println .}}{{end}}' 2>/dev/null | sort)
    
    # Check critical environment variables
    case $service in
        homelab-dashboard)
            REQUIRED_VARS=("JARVIS_DATABASE_URL" "FLASK_ENV" "REDIS_URL")
            ;;
        discord-bot)
            REQUIRED_VARS=("DATABASE_URL" "DISCORD_BOT_TOKEN" "NODE_ENV" "PORT")
            ;;
        stream-bot)
            REQUIRED_VARS=("DATABASE_URL" "NODE_ENV" "PORT")
            ;;
        vnc-desktop)
            REQUIRED_VARS=("VNC_PASSWORD")
            ;;
        *)
            REQUIRED_VARS=()
            ;;
    esac
    
    for var in "${REQUIRED_VARS[@]}"; do
        if echo "$ENV_VARS" | grep -q "^${var}="; then
            VALUE=$(echo "$ENV_VARS" | grep "^${var}=" | head -1)
            # Mask sensitive values
            if [[ "$var" =~ PASSWORD|SECRET|TOKEN|KEY ]]; then
                echo -e "${GREEN}✓${NC} $var=***MASKED***"
            else
                echo -e "${GREEN}✓${NC} $VALUE"
            fi
        else
            echo -e "${RED}✗${NC} $var is NOT SET"
            echo -e "${YELLOW}FIX:${NC} Add $var to .env file"
            CRITICAL_ISSUES=$((CRITICAL_ISSUES + 1))
        fi
    done
    echo ""
done

# ===== SECTION 4: Database Connectivity =====
print_section "SECTION 4: Database Connectivity"

echo "Testing database connectivity from crash-looping services..."
echo ""

# Check if postgres is running
if docker inspect discord-bot-db &>/dev/null; then
    DB_STATE=$(docker inspect discord-bot-db --format '{{.State.Status}}' 2>/dev/null)
    DB_HEALTH=$(docker inspect discord-bot-db --format '{{.State.Health.Status}}' 2>/dev/null || echo "no healthcheck")
    
    echo "PostgreSQL container (discord-bot-db):"
    echo "  State: $DB_STATE"
    echo "  Health: $DB_HEALTH"
    echo ""
    
    if [ "$DB_STATE" != "running" ]; then
        echo -e "${RED}✗${NC} Database is not running"
        echo -e "${YELLOW}FIX:${NC} Start database: docker-compose -f docker-compose.unified.yml up -d discord-bot-db"
        CRITICAL_ISSUES=$((CRITICAL_ISSUES + 1))
    elif [ "$DB_HEALTH" = "unhealthy" ]; then
        echo -e "${RED}✗${NC} Database is unhealthy"
        echo "  Check database logs: docker logs discord-bot-db"
        CRITICAL_ISSUES=$((CRITICAL_ISSUES + 1))
    else
        echo -e "${GREEN}✓${NC} Database is running and healthy"
        
        # Test connection from each service
        for service in "${CRASH_SERVICES[@]}"; do
            if ! docker inspect "$service" &>/dev/null; then
                continue
            fi
            
            case $service in
                homelab-dashboard|discord-bot|stream-bot)
                    echo ""
                    echo "Testing database connection from $service..."
                    
                    # Try to ping postgres from the container's network
                    if docker exec "$service" sh -c "nc -zv discord-bot-db 5432" 2>&1 | grep -q "succeeded\|open"; then
                        echo -e "${GREEN}✓${NC} $service can reach database"
                    else
                        echo -e "${RED}✗${NC} $service CANNOT reach database"
                        echo -e "${YELLOW}FIX:${NC} Check network configuration in docker-compose.unified.yml"
                        CRITICAL_ISSUES=$((CRITICAL_ISSUES + 1))
                    fi
                    ;;
            esac
        done
    fi
else
    echo -e "${RED}✗${NC} PostgreSQL container (discord-bot-db) does not exist"
    echo -e "${YELLOW}FIX:${NC} Start database: docker-compose -f docker-compose.unified.yml up -d discord-bot-db"
    CRITICAL_ISSUES=$((CRITICAL_ISSUES + 1))
fi
echo ""

# ===== SECTION 5: Network Connectivity =====
print_section "SECTION 5: Network Connectivity Between Services"

echo "Testing network connectivity between services..."
echo ""

# Check if homelab network exists
if docker network inspect homelab &>/dev/null; then
    echo -e "${GREEN}✓${NC} Docker network 'homelab' exists"
    
    # List containers on homelab network
    echo ""
    echo "Containers on homelab network:"
    docker network inspect homelab --format '{{range .Containers}}  - {{.Name}} ({{.IPv4Address}}){{println}}{{end}}' 2>/dev/null || echo "  None"
    echo ""
else
    echo -e "${RED}✗${NC} Docker network 'homelab' does NOT exist"
    echo -e "${YELLOW}FIX:${NC} Recreate network: docker network create homelab"
    CRITICAL_ISSUES=$((CRITICAL_ISSUES + 1))
fi

# Test connectivity between key services
echo "Testing service-to-service connectivity:"
echo ""

if docker inspect homelab-dashboard &>/dev/null && docker inspect redis &>/dev/null; then
    if docker exec homelab-dashboard sh -c "nc -zv redis 6379" 2>&1 | grep -q "succeeded\|open"; then
        echo -e "${GREEN}✓${NC} homelab-dashboard → redis (OK)"
    else
        echo -e "${RED}✗${NC} homelab-dashboard → redis (FAILED)"
        WARNINGS=$((WARNINGS + 1))
    fi
fi

if docker inspect stream-bot &>/dev/null && docker inspect discord-bot-db &>/dev/null; then
    if docker exec stream-bot sh -c "nc -zv discord-bot-db 5432" 2>&1 | grep -q "succeeded\|open"; then
        echo -e "${GREEN}✓${NC} stream-bot → discord-bot-db (OK)"
    else
        echo -e "${RED}✗${NC} stream-bot → discord-bot-db (FAILED)"
        WARNINGS=$((WARNINGS + 1))
    fi
fi

echo ""

# ===== SECTION 6: Port Conflicts =====
print_section "SECTION 6: Port Conflicts Check"

echo "Checking for port conflicts on the host..."
echo ""

CRITICAL_PORTS=(
    "80:Caddy HTTP"
    "443:Caddy HTTPS"
    "5000:Dashboard/Discord-Bot/Stream-Bot"
    "5432:PostgreSQL"
    "6379:Redis"
)

for port_info in "${CRITICAL_PORTS[@]}"; do
    PORT="${port_info%%:*}"
    DESC="${port_info#*:}"
    
    LISTENING=$(ss -tlnp 2>/dev/null | grep ":${PORT} " || true)
    
    if [ -n "$LISTENING" ]; then
        echo -e "${GREEN}✓${NC} Port $PORT ($DESC) - IN USE"
        echo "  $LISTENING" | head -1
    else
        echo -e "${YELLOW}⚠${NC} Port $PORT ($DESC) - NOT IN USE"
        WARNINGS=$((WARNINGS + 1))
    fi
done

echo ""

# ===== SECTION 7: File Permissions and Mounts =====
print_section "SECTION 7: File Permissions and Volume Mounts"

echo "Checking volume mounts for crash-looping services..."
echo ""

for service in "${CRASH_SERVICES[@]}"; do
    if ! docker inspect "$service" &>/dev/null; then
        continue
    fi
    
    echo -e "${BOLD}━━━ Mounts for: ${service} ━━━${NC}"
    docker inspect "$service" --format '{{range .Mounts}}  Type: {{.Type}} | Source: {{.Source}} | Destination: {{.Destination}} | RW: {{.RW}}{{println}}{{end}}' 2>/dev/null || echo "  No mounts"
    echo ""
    
    # Check if critical directories exist and are accessible
    case $service in
        homelab-dashboard)
            CRITICAL_PATHS=(
                "/var/run/docker.sock"
                "/app/logs"
            )
            ;;
        vnc-desktop)
            CRITICAL_PATHS=(
                "/home/evin"
            )
            ;;
        *)
            CRITICAL_PATHS=()
            ;;
    esac
    
    for path in "${CRITICAL_PATHS[@]}"; do
        if docker exec "$service" test -e "$path" 2>/dev/null; then
            echo -e "${GREEN}✓${NC} $path exists in container"
        else
            echo -e "${RED}✗${NC} $path does NOT exist in container"
            CRITICAL_ISSUES=$((CRITICAL_ISSUES + 1))
        fi
    done
    
    echo ""
done

# ===== SECTION 8: Resource Limits and Usage =====
print_section "SECTION 8: Resource Limits and System Resources"

echo "System resource overview:"
echo ""

# Disk space
echo -e "${BOLD}Disk Space:${NC}"
df -h / 2>/dev/null | grep -E "Filesystem|/$" || echo "Cannot check disk space"
echo ""

DISK_USAGE=$(df / | tail -1 | awk '{print $5}' | sed 's/%//')
if [ "$DISK_USAGE" -gt 90 ]; then
    echo -e "${RED}✗${NC} Disk usage critical: ${DISK_USAGE}%"
    echo -e "${YELLOW}FIX:${NC} Free up disk space: docker system prune -a"
    CRITICAL_ISSUES=$((CRITICAL_ISSUES + 1))
elif [ "$DISK_USAGE" -gt 80 ]; then
    echo -e "${YELLOW}⚠${NC} Disk usage high: ${DISK_USAGE}%"
    WARNINGS=$((WARNINGS + 1))
else
    echo -e "${GREEN}✓${NC} Disk usage OK: ${DISK_USAGE}%"
fi
echo ""

# Memory
echo -e "${BOLD}Memory Usage:${NC}"
free -h 2>/dev/null || echo "Cannot check memory"
echo ""

if command -v free &>/dev/null; then
    MEM_TOTAL=$(free -m | grep "^Mem:" | awk '{print $2}')
    MEM_USED=$(free -m | grep "^Mem:" | awk '{print $3}')
    MEM_PERCENT=$((MEM_USED * 100 / MEM_TOTAL))
    
    if [ "$MEM_PERCENT" -gt 90 ]; then
        echo -e "${RED}✗${NC} Memory usage critical: ${MEM_PERCENT}%"
        CRITICAL_ISSUES=$((CRITICAL_ISSUES + 1))
    elif [ "$MEM_PERCENT" -gt 80 ]; then
        echo -e "${YELLOW}⚠${NC} Memory usage high: ${MEM_PERCENT}%"
        WARNINGS=$((WARNINGS + 1))
    else
        echo -e "${GREEN}✓${NC} Memory usage OK: ${MEM_PERCENT}%"
    fi
fi
echo ""

# Docker stats for crash-looping containers
echo -e "${BOLD}Container Resource Usage (current):${NC}"
docker stats --no-stream --format "table {{.Name}}\t{{.CPUPerc}}\t{{.MemUsage}}\t{{.MemPerc}}" \
    homelab-dashboard discord-bot stream-bot vnc-desktop 2>/dev/null || echo "Cannot get container stats"
echo ""

# Check container resource limits
echo -e "${BOLD}Container Resource Limits:${NC}"
echo ""
for service in "${CRASH_SERVICES[@]}"; do
    if ! docker inspect "$service" &>/dev/null; then
        continue
    fi
    
    MEM_LIMIT=$(docker inspect "$service" --format '{{.HostConfig.Memory}}' 2>/dev/null)
    CPU_QUOTA=$(docker inspect "$service" --format '{{.HostConfig.CpuQuota}}' 2>/dev/null)
    
    echo "$service:"
    if [ "$MEM_LIMIT" = "0" ]; then
        echo "  Memory Limit: unlimited"
    else
        MEM_LIMIT_MB=$((MEM_LIMIT / 1024 / 1024))
        echo "  Memory Limit: ${MEM_LIMIT_MB}MB"
    fi
    
    if [ "$CPU_QUOTA" = "-1" ] || [ "$CPU_QUOTA" = "0" ]; then
        echo "  CPU Quota: unlimited"
    else
        echo "  CPU Quota: $CPU_QUOTA"
    fi
    echo ""
done

# ===== SECTION 9: Docker Compose Status =====
print_section "SECTION 9: Docker Compose Status"

echo "Current docker-compose service status:"
echo ""

if [ -f "docker-compose.unified.yml" ]; then
    docker-compose -f docker-compose.unified.yml ps 2>/dev/null || docker compose -f docker-compose.unified.yml ps 2>/dev/null || echo "Cannot get docker-compose status"
else
    echo -e "${RED}✗${NC} docker-compose.unified.yml not found"
    CRITICAL_ISSUES=$((CRITICAL_ISSUES + 1))
fi

echo ""

# ===== SECTION 10: Recent Docker Events =====
print_section "SECTION 10: Recent Docker Events"

echo "Recent Docker events (last 50):"
echo ""
docker events --since 5m --until 0s 2>/dev/null | tail -50 || echo "Cannot fetch Docker events"
echo ""

# ===== FINAL SUMMARY =====
print_section "DIAGNOSTIC SUMMARY"

echo -e "${BOLD}Results:${NC}"
echo ""

if [ $CRITICAL_ISSUES -eq 0 ] && [ $WARNINGS -eq 0 ]; then
    echo -e "${GREEN}${BOLD}✓ No critical issues or warnings detected${NC}"
    echo ""
    echo "The crash-loop may be caused by:"
    echo "  • Application-level errors (check logs above)"
    echo "  • Race conditions during startup"
    echo "  • External service dependencies"
    echo ""
    echo "Recommended actions:"
    echo "  1. Review detailed logs above for each service"
    echo "  2. Check application configuration files"
    echo "  3. Verify external API endpoints are accessible"
    echo "  4. Try rebuilding containers: docker-compose -f docker-compose.unified.yml build --no-cache"
    echo ""
elif [ $CRITICAL_ISSUES -eq 0 ]; then
    echo -e "${YELLOW}${BOLD}⚠ $WARNINGS WARNING(S) FOUND${NC}"
    echo ""
    echo "The system has warnings but no critical issues."
    echo "Review the warnings above and consider addressing them."
    echo ""
else
    echo -e "${RED}${BOLD}✗ $CRITICAL_ISSUES CRITICAL ISSUE(S) FOUND${NC}"
    if [ $WARNINGS -gt 0 ]; then
        echo -e "${YELLOW}⚠ $WARNINGS WARNING(S) FOUND${NC}"
    fi
    echo ""
    echo -e "${RED}These critical issues are likely causing the crash-loops.${NC}"
    echo "Review the diagnostic output above for specific fixes."
    echo ""
    echo "Quick fixes to try:"
    echo "  1. Rebuild all containers:"
    echo "     docker-compose -f docker-compose.unified.yml build --no-cache"
    echo ""
    echo "  2. Restart all services:"
    echo "     docker-compose -f docker-compose.unified.yml down"
    echo "     docker-compose -f docker-compose.unified.yml up -d"
    echo ""
    echo "  3. Check environment variables:"
    echo "     cat .env | grep -E 'DATABASE_URL|PASSWORD|TOKEN'"
    echo ""
    echo "  4. Initialize database:"
    echo "     docker-compose -f docker-compose.unified.yml up -d discord-bot-db"
    echo "     # Wait 30 seconds for init scripts to run"
    echo ""
fi

echo -e "${BOLD}${BLUE}━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━${NC}"
echo ""
echo "Diagnostic complete. Review the output above for detailed findings."
echo ""
echo "For more help, check:"
echo "  • docs/TROUBLESHOOTING.md"
echo "  • docker logs <service-name>"
echo "  • docker-compose -f docker-compose.unified.yml logs <service-name>"
echo ""

exit $CRITICAL_ISSUES
