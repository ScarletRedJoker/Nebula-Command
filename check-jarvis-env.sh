#!/bin/bash
echo "Checking OpenAI API key in dashboard container..."
echo ""
echo "Environment variables (masked):"
docker exec homelab-dashboard printenv | grep -E 'OPENAI|WEB_|AI_' | sed 's/=.*/=***/'
echo ""
echo "Checking AI Service initialization in logs:"
docker logs homelab-dashboard 2>&1 | grep -i "AI Service" | tail -5
echo ""
echo "Checking for OpenAI errors:"
docker logs homelab-dashboard 2>&1 | grep -i "openai.*error\|api.*key" | tail -10
