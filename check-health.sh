#!/bin/bash
# Check health status details for unhealthy services

echo "════════════════════════════════════════"
echo "  Service Health Check Details"
echo "════════════════════════════════════════"
echo ""

cd /home/evin/contain/HomeLabHub

for service in discord-bot stream-bot vnc-desktop code-server; do
    echo "─────────────────────────────────────────"
    echo "Service: $service"
    echo "─────────────────────────────────────────"
    
    # Get health check command
    echo "Health check config:"
    docker inspect $service --format='{{.Config.Healthcheck.Test}}' 2>/dev/null || echo "  No healthcheck defined"
    
    echo ""
    echo "Last health check output:"
    docker inspect $service --format='{{range .State.Health.Log}}{{.Output}}{{end}}' 2>/dev/null | tail -5 || echo "  No health log"
    
    echo ""
    echo "Current status:"
    docker inspect $service --format='Status: {{.State.Health.Status}}' 2>/dev/null || echo "  No status"
    
    echo ""
done

echo "════════════════════════════════════════"
echo ""
echo "Testing actual connectivity:"
echo ""

# Test if services are actually responding
echo "[Discord Bot]"
curl -s -o /dev/null -w "  HTTP %{http_code}\n" http://localhost:4000/ || echo "  Connection failed"

echo ""
echo "[Stream Bot]"  
curl -s -o /dev/null -w "  HTTP %{http_code}\n" http://localhost:5000/ || echo "  Connection failed"

echo ""
echo "[VNC Desktop]"
curl -s -o /dev/null -w "  HTTP %{http_code}\n" http://localhost:6080/ || echo "  Connection failed"

echo ""
echo "[Code Server]"
curl -s -o /dev/null -w "  HTTP %{http_code}\n" http://localhost:8443/ || echo "  Connection failed"

echo ""
echo "════════════════════════════════════════"
