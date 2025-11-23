#!/bin/bash
echo "=== Checking AI Service Status ==="
docker logs homelab-dashboard 2>&1 | grep -E "AI Service|OpenAI" | tail -20
echo ""
echo "=== Checking recent errors ==="
docker logs homelab-dashboard 2>&1 | grep -i "error" | tail -20
echo ""
echo "=== Testing AI endpoint directly ==="
docker exec homelab-dashboard curl -s http://localhost:5000/api/ai/status 2>&1 | head -20
