#!/bin/bash
# Comprehensive Network Diagnostics for HomeLabHub
# Run on your Ubuntu server to troubleshoot connectivity issues

set -e

RED='\033[0;31m'
GREEN='\033[0;32m'
YELLOW='\033[1;33m'
BLUE='\033[0;34m'
NC='\033[0m'

EXPECTED_IP="192.168.0.177"
ROUTER_IP="192.168.0.1"
TAILSCALE_IP="100.110.227.25"
PUBLIC_IP="74.76.34.7"

echo "============================================================"
echo -e "${BLUE}HOMELAB NETWORK DIAGNOSTICS${NC}"
echo "============================================================"
echo "Started: $(date)"
echo ""

PASS_COUNT=0
FAIL_COUNT=0
WARN_COUNT=0

pass() {
    echo -e "${GREEN}[PASS]${NC} $1"
    ((PASS_COUNT++))
}

fail() {
    echo -e "${RED}[FAIL]${NC} $1"
    ((FAIL_COUNT++))
}

warn() {
    echo -e "${YELLOW}[WARN]${NC} $1"
    ((WARN_COUNT++))
}

info() {
    echo -e "${BLUE}[INFO]${NC} $1"
}

echo "============================================================"
echo "1. NETWORK INTERFACE STATUS"
echo "============================================================"

if ip link show | grep -q "state UP"; then
    pass "Network interface is UP"
    ip link show | grep -E "state UP|state DOWN" | head -5
else
    fail "No network interface is UP"
    ip link show
fi
echo ""

CURRENT_IP=$(ip -4 addr show | grep -oP '192\.168\.0\.\d+' | head -1 || echo "none")
if [ "$CURRENT_IP" = "$EXPECTED_IP" ]; then
    pass "Local IP is correct: $CURRENT_IP"
else
    if [ "$CURRENT_IP" = "none" ]; then
        fail "No local IP assigned! DHCP may have failed."
    else
        warn "Local IP changed: Expected $EXPECTED_IP, Got $CURRENT_IP"
        info "DHCP reservation may not be working"
    fi
fi
echo ""

echo "Active IP addresses:"
ip -4 addr show | grep inet | grep -v "127.0.0.1"
echo ""

echo "============================================================"
echo "2. GATEWAY & ROUTER CONNECTIVITY"
echo "============================================================"

DEFAULT_GW=$(ip route | grep default | awk '{print $3}' | head -1)
if [ -n "$DEFAULT_GW" ]; then
    pass "Default gateway configured: $DEFAULT_GW"
else
    fail "No default gateway configured!"
fi
echo ""

if ping -c 2 -W 3 $ROUTER_IP &>/dev/null; then
    pass "Can reach router at $ROUTER_IP"
else
    fail "Cannot reach router at $ROUTER_IP"
    info "This suggests a LAN connectivity issue"
fi
echo ""

echo "============================================================"
echo "3. INTERNET CONNECTIVITY"
echo "============================================================"

if ping -c 2 -W 5 8.8.8.8 &>/dev/null; then
    pass "Can reach internet (8.8.8.8)"
else
    fail "Cannot reach internet (8.8.8.8)"
    info "WAN connectivity is broken"
fi
echo ""

if ping -c 2 -W 5 google.com &>/dev/null; then
    pass "DNS resolution working (google.com)"
else
    if ping -c 2 -W 5 8.8.8.8 &>/dev/null; then
        fail "DNS resolution failed but internet works"
        info "Check /etc/resolv.conf"
        cat /etc/resolv.conf | grep nameserver
    else
        warn "DNS test skipped - no internet"
    fi
fi
echo ""

DETECTED_PUBLIC_IP=$(curl -s --connect-timeout 5 https://icanhazip.com 2>/dev/null || echo "unavailable")
if [ "$DETECTED_PUBLIC_IP" != "unavailable" ]; then
    if [ "$DETECTED_PUBLIC_IP" = "$PUBLIC_IP" ]; then
        pass "Public IP verified: $DETECTED_PUBLIC_IP"
    else
        warn "Public IP changed: Expected $PUBLIC_IP, Got $DETECTED_PUBLIC_IP"
    fi
else
    warn "Could not detect public IP"
fi
echo ""

echo "============================================================"
echo "4. LOCAL FIREWALL STATUS"
echo "============================================================"

if command -v ufw &>/dev/null; then
    UFW_STATUS=$(sudo ufw status 2>/dev/null | head -1)
    info "UFW: $UFW_STATUS"
fi

if command -v nft &>/dev/null; then
    NFT_RULES=$(sudo nft list ruleset 2>/dev/null | wc -l)
    if [ "$NFT_RULES" -gt 5 ]; then
        warn "nftables has $NFT_RULES lines of rules - may be blocking traffic"
    else
        pass "nftables has minimal rules ($NFT_RULES lines)"
    fi
fi

IPTABLES_RULES=$(sudo iptables -L -n 2>/dev/null | grep -c "DROP\|REJECT" || echo "0")
if [ "$IPTABLES_RULES" -gt 0 ]; then
    warn "iptables has $IPTABLES_RULES DROP/REJECT rules"
else
    pass "iptables has no DROP/REJECT rules"
fi
echo ""

echo "============================================================"
echo "5. SERVICE PORT STATUS"
echo "============================================================"

check_port() {
    local port=$1
    local name=$2
    if ss -tulpn 2>/dev/null | grep -q ":$port "; then
        pass "$name listening on port $port"
        return 0
    else
        fail "$name NOT listening on port $port"
        return 1
    fi
}

check_port 32400 "Plex"
check_port 5000 "Dashboard" 2>/dev/null || info "Dashboard port 5000 (may run on Replit)"
check_port 3000 "Stream Bot" 2>/dev/null || info "Stream Bot port 3000 (may run on Replit)"
echo ""

echo "All listening ports:"
ss -tulpn 2>/dev/null | grep LISTEN | head -15 || netstat -tulpn 2>/dev/null | grep LISTEN | head -15
echo ""

echo "============================================================"
echo "6. PLEX SPECIFIC CHECKS"
echo "============================================================"

if systemctl is-active plexmediaserver &>/dev/null; then
    pass "Plex systemd service is running"
elif docker ps 2>/dev/null | grep -q plex; then
    pass "Plex Docker container is running"
else
    fail "Plex is not running (checked systemd and Docker)"
fi

if curl -s --connect-timeout 5 http://localhost:32400/identity &>/dev/null; then
    pass "Plex API responding on localhost:32400"
    PLEX_VERSION=$(curl -s http://localhost:32400/identity 2>/dev/null | grep -oP 'version="\K[^"]+' || echo "unknown")
    info "Plex version: $PLEX_VERSION"
else
    fail "Plex API not responding on localhost:32400"
fi
echo ""

echo "============================================================"
echo "7. TAILSCALE STATUS"
echo "============================================================"

if command -v tailscale &>/dev/null; then
    TS_STATUS=$(tailscale status 2>&1 | head -1)
    if echo "$TS_STATUS" | grep -q "stopped\|not running"; then
        fail "Tailscale is not running"
    else
        pass "Tailscale is running"
        TS_IP=$(tailscale ip -4 2>/dev/null || echo "unknown")
        info "Tailscale IP: $TS_IP"
        
        if [ "$TS_IP" = "$TAILSCALE_IP" ]; then
            pass "Tailscale IP matches expected: $TS_IP"
        else
            warn "Tailscale IP changed: Expected $TAILSCALE_IP, Got $TS_IP"
        fi
    fi
else
    info "Tailscale not installed"
fi
echo ""

echo "============================================================"
echo "8. DOCKER STATUS (if applicable)"
echo "============================================================"

if command -v docker &>/dev/null; then
    if docker ps &>/dev/null; then
        pass "Docker daemon is running"
        echo ""
        echo "Running containers:"
        docker ps --format 'table {{.Names}}\t{{.Status}}\t{{.Ports}}' 2>/dev/null | head -10
    else
        fail "Docker daemon not accessible"
    fi
else
    info "Docker not installed"
fi
echo ""

echo "============================================================"
echo "9. EXTERNAL PORT FORWARDING TEST"
echo "============================================================"

info "Testing if port 32400 is reachable from outside..."
if command -v nc &>/dev/null; then
    if timeout 5 nc -zv $PUBLIC_IP 32400 2>&1 | grep -q "succeeded\|open"; then
        pass "Port 32400 reachable via public IP ($PUBLIC_IP)"
    else
        fail "Port 32400 NOT reachable via public IP ($PUBLIC_IP)"
        info "Router port forward may not be working"
    fi
else
    warn "nc (netcat) not available for port test"
fi
echo ""

echo "============================================================"
echo "10. DHCP LEASE INFO"
echo "============================================================"

if [ -d /var/lib/dhcp ]; then
    info "DHCP lease files:"
    ls -la /var/lib/dhcp/ 2>/dev/null || echo "  (none found)"
    if ls /var/lib/dhcp/dhclient*.leases 2>/dev/null; then
        echo ""
        echo "Current lease info:"
        grep -E "lease|fixed-address|routers|expire" /var/lib/dhcp/dhclient*.leases 2>/dev/null | tail -10
    fi
fi
echo ""

echo "============================================================"
echo "SUMMARY"
echo "============================================================"
echo -e "${GREEN}Passed:${NC} $PASS_COUNT"
echo -e "${RED}Failed:${NC} $FAIL_COUNT"
echo -e "${YELLOW}Warnings:${NC} $WARN_COUNT"
echo ""

if [ $FAIL_COUNT -eq 0 ]; then
    echo -e "${GREEN}All critical checks passed!${NC}"
    exit 0
elif [ $FAIL_COUNT -le 2 ]; then
    echo -e "${YELLOW}Some issues detected - see failures above${NC}"
    exit 1
else
    echo -e "${RED}Multiple failures - network may be down${NC}"
    exit 2
fi
