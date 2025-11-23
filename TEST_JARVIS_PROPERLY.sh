#!/bin/bash

echo "Testing Jarvis AI with proper HTTPS URLs..."
echo ""
echo "Your dashboard is at: https://host.evindrake.net"
echo "(NOT http://host.evindrake.net:8080 - that was my mistake!)"
echo ""
echo "Checking if dashboard container is fully started..."
sleep 5
docker logs homelab-dashboard 2>&1 | tail -30 | grep -E "AI Service initialized|Booting worker|Listening at" || echo "Still starting..."
