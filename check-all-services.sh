#!/bin/bash
# Quick check of all 15 services

cd /home/evin/contain/HomeLabHub

echo "Checking all services..."
docker compose --project-directory /home/evin/contain/HomeLabHub \
    --env-file /home/evin/contain/HomeLabHub/.env \
    ps --format "table {{.Name}}\t{{.Status}}\t{{.Ports}}"

echo ""
echo "Service count:"
docker compose --project-directory /home/evin/contain/HomeLabHub \
    --env-file /home/evin/contain/HomeLabHub/.env \
    ps -q | wc -l
