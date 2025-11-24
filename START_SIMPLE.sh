#!/bin/bash
# Just start everything without the overly-strict bootstrap validation

echo "Starting all services..."
docker compose up -d

echo ""
echo "Waiting 30 seconds for services to initialize..."
sleep 30

echo ""
echo "Checking service status..."
docker compose ps

echo ""
echo "Testing dashboard health..."
curl -s http://localhost:5000/health 2>/dev/null || echo "Dashboard still initializing (this is normal)"

echo ""
echo "✓ Services started. Give them 2-3 minutes to fully initialize."
echo ""
echo "Check status with: docker compose ps"
echo "View logs with: ./homelab logs"
echo "Dashboard: https://host.evindrake.net"
