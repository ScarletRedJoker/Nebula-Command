# Troubleshooting VNC Desktop & Code-Server

## Common Issues and Solutions

### Issue 1: Code-Server EACCES Permission Denied

**Symptoms:**
```
code-server | [2025-11-18T11:52:11.328Z] error EACCES: permission denied, mkdir '/home/coder/.config/code-server'
```

**Root Cause:**
The `code_server_data` Docker volume is owned by root (UID 0), but code-server runs as UID 1000 (user 'coder').

**Solution:**

**Option A: Quick Fix (Recommended)**
```bash
cd /home/evin/contain/HomeLabHub
./deployment/fix-vnc-and-code-server.sh
```

**Option B: Manual Fix**
```bash
# Get the volume path
VOLUME_PATH=$(docker volume inspect code_server_data --format '{{ .Mountpoint }}')

# Fix ownership
sudo chown -R 1000:1000 "$VOLUME_PATH"

# Restart code-server
docker-compose -f docker-compose.unified.yml restart code-server
```

**Verification:**
```bash
# Check logs - should NOT see EACCES errors
docker logs code-server --tail 20

# Should see something like:
# HTTP server listening on http://0.0.0.0:8080
```

---

### Issue 2: VNC Desktop Login Fails / x11vnc Exit Status 1

**Symptoms:**
```
vnc-desktop | stored passwd in file: /.password2
vnc-desktop | INFO exited: x11vnc (exit status 1; not expected)
```

**Root Cause:**
The base Docker image (`dorowu/ubuntu-desktop-lxde-vnc`) stores the VNC password in the root directory (`/.password2`) instead of the user's home directory, causing x11vnc to fail.

**Solution:**

**Option A: Quick Fix (Recommended)**
```bash
cd /home/evin/contain/HomeLabHub
./deployment/fix-vnc-and-code-server.sh
```

This script will:
1. Rebuild the VNC container with the password fix
2. Restart all services
3. Verify the fix worked

**Option B: Manual Rebuild**
```bash
cd /home/evin/contain/HomeLabHub

# Stop VNC
docker-compose -f docker-compose.unified.yml stop vnc-desktop

# Rebuild with fix
docker-compose -f docker-compose.unified.yml build --no-cache vnc-desktop

# Start VNC
docker-compose -f docker-compose.unified.yml up -d vnc-desktop

# Wait 10 seconds
sleep 10

# Check logs
docker logs vnc-desktop --tail 30 | grep -i "x11vnc\|vnc"
```

**Verification:**
```bash
# Check that x11vnc is running
docker logs vnc-desktop 2>&1 | grep "x11vnc.*RUNNING"

# Should output:
# INFO success: x11vnc entered RUNNING state

# Check password file location (should NOT see /.password2)
docker logs vnc-desktop 2>&1 | grep "password"
```

**If Login Still Fails:**
1. Verify VNC_PASSWORD is set in `.env`:
   ```bash
   grep VNC_PASSWORD /home/evin/contain/HomeLabHub/.env
   ```

2. If not set or wrong, update `.env` and rebuild:
   ```bash
   # Edit .env and set VNC_PASSWORD
   nano /home/evin/contain/HomeLabHub/.env
   
   # Rebuild
   docker-compose -f docker-compose.unified.yml up -d --build vnc-desktop
   ```

---

### Issue 3: Code-Server DNS Lookup Failure

**Symptoms:**
```
caddy | dial tcp: lookup code-server on 127.0.0.11:53: server misbehaving
```

**Root Cause:**
Code-server container is not running or not accessible on the Docker network.

**Solution:**
```bash
# Check if code-server is running
docker ps | grep code-server

# If not running, start it
docker-compose -f docker-compose.unified.yml up -d code-server

# Check Caddy can resolve it
docker exec caddy nslookup code-server

# Restart Caddy if needed
docker-compose -f docker-compose.unified.yml restart caddy
```

---

## Quick Health Check Script

Run this to check the status of both services:

```bash
#!/bin/bash
echo "=== VNC Desktop Status ==="
docker logs vnc-desktop --tail 5 | grep -i "x11vnc\|error\|running"

echo ""
echo "=== Code-Server Status ==="
docker logs code-server --tail 5 | grep -i "listening\|error\|EACCES"

echo ""
echo "=== Service URLs ==="
echo "VNC Desktop: https://vnc.evindrake.net"
echo "Code Server: https://code.evindrake.net"
```

---

## Prevention

To prevent these issues from recurring:

1. **Always use the fix script after fresh deployment:**
   ```bash
   ./deployment/fix-vnc-and-code-server.sh
   ```

2. **Check volume permissions before first run:**
   ```bash
   docker volume ls
   docker volume inspect code_server_data
   ```

3. **Verify environment variables are set:**
   ```bash
   grep -E "VNC_PASSWORD|CODE_SERVER_PASSWORD" .env
   ```

---

## Technical Details

### Code-Server Volume Ownership
- Container runs as: `user: "1000:1000"` (defined in docker-compose.unified.yml)
- Volume created as: root (UID 0) by default
- **Fix:** Change volume ownership to 1000:1000

### VNC Password File Location
- Base image default: `/.password2` (root directory)
- Expected location: `/home/evin/.vnc/passwd`
- **Fix:** Added `fix-vnc-password.sh` script that runs before startup
- Script creates password file in correct location using `x11vnc -storepasswd`

---

## Related Files

- Fix script: `deployment/fix-vnc-and-code-server.sh`
- VNC Dockerfile: `services/vnc-desktop/Dockerfile`
- VNC password fix: `services/vnc-desktop/fix-vnc-password.sh`
- Docker Compose: `docker-compose.unified.yml`
- Complete fix: `deployment/FIX_EVERYTHING_NOW.sh`

---

## Contact

If issues persist after following this guide, check:
1. Docker logs: `docker-compose -f docker-compose.unified.yml logs`
2. System resources: `docker stats`
3. Network connectivity: `docker network inspect homelab`
