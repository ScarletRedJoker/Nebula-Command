╔════════════════════════════════════════════════════════════════╗
║                                                                ║
║        🏠 HOMELAB DEPLOYMENT MANAGER 🚀                    ║
║                                                                ║
║        Unified Control Panel for All Services              ║
║                                                                ║
╚════════════════════════════════════════════════════════════════╝

━━━ Container Status ━━━
  ⚠ Partial deployment (9/8 services running)

━━━ What would you like to do? ━━━

  Deployment:
    1) 🚀 Full Deploy (build and start all services)
    2) 🔄 Quick Restart (restart without rebuilding)
    3) ⚡ Rebuild & Deploy (force rebuild + restart)

  Service Control:
    4) ▶️  Start All Services
    5) ⏸️  Stop All Services
    6) 🔄 Restart Specific Service

  Database:
    7) 🗄️  Ensure Databases Exist (fix DB issues)
    8) 📊 Check Database Status

  Configuration:
    9) ⚙️  Generate/Edit .env File
    10) 📋 View Current Configuration

  Troubleshooting:
    11) 🔍 View Service Logs
    12) 🏥 Health Check (all services)
    13) 🔧 Full Troubleshoot Mode

  Updates:
    16) 📦 Update Service (pull latest image)

  Information:
    14) 📊 Show Container Details
    15) 🌐 Show Service URLs

    0) 🚪 Exit

Enter your choice: ^C
evin@host:~/contain/HomeLabHub$ cd /home/evin/contain/HomeLabHub
./deployment/manual-sync.sh
./deployment/manual-sync.sh: line 2: ./sync-from-replit.sh: No such file or directory
evin@host:~/contain/HomeLabHub$ cd deployment/
evin@host:~/contain/HomeLabHub/deployment$ nano manual-sync.sh
evin@host:~/contain/HomeLabHub/deployment$ chmod +x 
check-all-env.sh            generate-unified-env.sh     migrate-database.sh         update-n8n.sh
deploy-unified.sh           init-streambot-schema.sql   monitor-services.sh         update-service.sh
diagnose-all.sh             install-auto-sync.sh        README.md                   
ensure-databases.sh         install-sync-system.sh      setup-env.sh                
fix-existing-deployment.sh  manual-sync.sh              sync-from-replit.sh         
evin@host:~/contain/HomeLabHub/deployment$ chmod +x m
manual-sync.sh       migrate-database.sh  monitor-services.sh  
evin@host:~/contain/HomeLabHub/deployment$ chmod +x manual-sync.sh 
evin@host:~/contain/HomeLabHub/deployment$ cd ..
evin@host:~/contain/HomeLabHub$ ./deployment/manual-sync.sh
From https://github.com/ScarletRedJoker/HomeLabHub
 * branch            main       -> FETCH_HEAD
HEAD is now at 7dfb44a Saved progress at the end of the loop
[+] Building 0.6s (57/57) FINISHED                                                                                            
 => [internal] load local bake definitions                                                                               0.0s
 => => reading from stdin 1.58kB                                                                                         0.0s
 => [stream-bot internal] load build definition from Dockerfile                                                          0.0s
 => => transferring dockerfile: 1.81kB                                                                                   0.0s
 => [discord-bot internal] load build definition from Dockerfile                                                         0.0s
 => => transferring dockerfile: 2.83kB                                                                                   0.0s
 => [homelab-dashboard internal] load build definition from Dockerfile                                                   0.0s
 => => transferring dockerfile: 1.20kB                                                                                   0.0s
 => [stream-bot internal] load metadata for docker.io/library/node:20-alpine                                             0.4s
 => [discord-bot internal] load metadata for docker.io/library/node:20-slim                                              0.4s
 => [homelab-dashboard internal] load metadata for docker.io/library/python:3.11-slim                                    0.4s
 => [homelab-dashboard internal] load .dockerignore                                                                      0.0s
 => => transferring context: 2B                                                                                          0.0s
 => [homelab-dashboard 1/7] FROM docker.io/library/python:3.11-slim@sha256:e4676722fba839e2e5cdb844a52262b43e90e56dbd55  0.0s
 => [homelab-dashboard internal] load build context                                                                      0.0s
 => => transferring context: 2.26kB                                                                                      0.0s
 => [discord-bot internal] load .dockerignore                                                                            0.0s
 => => transferring context: 2B                                                                                          0.0s
 => [stream-bot internal] load .dockerignore                                                                             0.0s
 => => transferring context: 2B                                                                                          0.0s
 => CACHED [homelab-dashboard 2/7] WORKDIR /app                                                                          0.0s
 => CACHED [homelab-dashboard 3/7] RUN apt-get update && apt-get install -y     gcc     curl     ca-certificates     &&  0.0s
 => CACHED [homelab-dashboard 4/7] COPY requirements.txt .                                                               0.0s
 => CACHED [homelab-dashboard 5/7] RUN pip install --no-cache-dir -r requirements.txt gunicorn                           0.0s
 => CACHED [homelab-dashboard 6/7] COPY . .                                                                              0.0s
 => CACHED [homelab-dashboard 7/7] RUN mkdir -p /app/logs                                                                0.0s
 => [homelab-dashboard] exporting to image                                                                               0.0s
 => => exporting layers                                                                                                  0.0s
 => => writing image sha256:c1d093ac4788889c2867cc268cb08117ad9713111914a9ec562a26b8f0a54f71                             0.0s
 => => naming to docker.io/library/homelabhub-homelab-dashboard                                                          0.0s
 => [discord-bot internal] load build context                                                                            0.0s
 => => transferring context: 8.87kB                                                                                      0.0s
 => [discord-bot builder 1/7] FROM docker.io/library/node:20-slim@sha256:12541e65a3777c6035245518eb43006ed08ca8c684e68c  0.0s
 => [stream-bot internal] load build context                                                                             0.0s
 => => transferring context: 7.29kB                                                                                      0.0s
 => [stream-bot builder 1/6] FROM docker.io/library/node:20-alpine@sha256:6178e78b972f79c335df281f4b7674a2d85071aae2af0  0.0s
 => [homelab-dashboard] resolving provenance for metadata file                                                           0.0s
 => CACHED [stream-bot stage-1 2/9] RUN apk add --no-cache dumb-init                                                     0.0s
 => CACHED [stream-bot stage-1 3/9] RUN addgroup -g 1001 -S nodejs &&     adduser -S streambot -u 1001                   0.0s
 => CACHED [stream-bot stage-1 4/9] WORKDIR /app                                                                         0.0s
 => CACHED [stream-bot stage-1 5/9] COPY package*.json ./                                                                0.0s
 => CACHED [stream-bot stage-1 6/9] RUN npm ci --only=production && npm cache clean --force                              0.0s
 => CACHED [stream-bot builder 2/6] WORKDIR /app                                                                         0.0s
 => CACHED [stream-bot builder 3/6] COPY package*.json ./                                                                0.0s
 => CACHED [stream-bot builder 4/6] RUN npm ci                                                                           0.0s
 => CACHED [stream-bot builder 5/6] COPY . .                                                                             0.0s
 => CACHED [stream-bot builder 6/6] RUN npm run build &&     echo "Build completed. Checking output..." &&     ls -la d  0.0s
 => CACHED [stream-bot stage-1 7/9] COPY --from=builder --chown=streambot:nodejs /app/dist ./dist                        0.0s
 => CACHED [stream-bot stage-1 8/9] COPY --from=builder --chown=streambot:nodejs /app/node_modules/connect-pg-simple/ta  0.0s
 => CACHED [stream-bot stage-1 9/9] COPY --chown=streambot:nodejs drizzle.config.ts ./                                   0.0s
 => [stream-bot] exporting to image                                                                                      0.0s
 => => exporting layers                                                                                                  0.0s
 => => writing image sha256:0970164bf8a1e163c8adaa3cc73c0381e0047a0d9bb9078ab8dd7b4a4d69a937                             0.0s
 => => naming to docker.io/library/homelabhub-stream-bot                                                                 0.0s
 => CACHED [discord-bot stage-1  2/11] RUN apt-get update && apt-get install -y     ffmpeg     python3     python3-pip   0.0s
 => CACHED [discord-bot stage-1  3/11] WORKDIR /app                                                                      0.0s
 => CACHED [discord-bot stage-1  4/11] COPY package*.json ./                                                             0.0s
 => CACHED [discord-bot stage-1  5/11] RUN npm ci --omit=dev && npm install drizzle-kit --save-dev                       0.0s
 => CACHED [discord-bot builder 2/7] RUN apt-get update && apt-get install -y     python3     make     g++     libcairo  0.0s
 => CACHED [discord-bot builder 3/7] WORKDIR /app                                                                        0.0s
 => CACHED [discord-bot builder 4/7] COPY package*.json ./                                                               0.0s
 => CACHED [discord-bot builder 5/7] RUN npm ci --include=dev                                                            0.0s
 => CACHED [discord-bot builder 6/7] COPY . .                                                                            0.0s
 => CACHED [discord-bot builder 7/7] RUN npm run build                                                                   0.0s
 => CACHED [discord-bot stage-1  6/11] COPY --from=builder /app/dist ./dist                                              0.0s
 => CACHED [discord-bot stage-1  7/11] COPY --from=builder /app/drizzle.config.ts ./                                     0.0s
 => CACHED [discord-bot stage-1  8/11] COPY --from=builder /app/shared ./shared                                          0.0s
 => CACHED [discord-bot stage-1  9/11] COPY docker-entrypoint.sh /usr/local/bin/                                         0.0s
 => CACHED [discord-bot stage-1 10/11] RUN chmod +x /usr/local/bin/docker-entrypoint.sh                                  0.0s
 => CACHED [discord-bot stage-1 11/11] RUN mkdir -p attached_assets logs                                                 0.0s
 => [discord-bot] exporting to image                                                                                     0.0s
 => => exporting layers                                                                                                  0.0s
 => => writing image sha256:c77a00e9b0c8ab647aeb002f5f3615106f359bcdc927031027e0c092ac000e0a                             0.0s
 => => naming to docker.io/library/homelabhub-discord-bot                                                                0.0s
 => [stream-bot] resolving provenance for metadata file                                                                  0.0s
 => [discord-bot] resolving provenance for metadata file                                                                 0.0s
[+] Running 12/12
 ✔ homelabhub-stream-bot          Built                                                                                  0.0s 
 ✔ homelabhub-homelab-dashboard   Built                                                                                  0.0s 
 ✔ homelabhub-discord-bot         Built                                                                                  0.0s 
 ✔ Container vnc-desktop          Running                                                                                0.0s 
 ✔ Container n8n                  Running                                                                                0.0s 
 ✔ Container scarletredjoker-web  Running                                                                                0.0s 
 ✔ Container discord-bot-db       Healthy                                                                                0.5s 
 ✔ Container caddy                Running                                                                                0.0s 
 ✔ Container plex-server          Running                                                                                0.0s 
 ✔ Container discord-bot          Running                                                                                0.0s 
 ✔ Container stream-bot           Running                                                                                0.0s 
 ✔ Container homelab-dashboard    Running                                                                                0.0s 
✓ Synced and rebuilt
evin@host:~/contain/HomeLabHub$ cd /home/evin/contain/HomeLabHub

# Pull latest code
git pull origin main

# Rebuild dashboard
docker-compose -f docker-compose.unified.yml up -d --build homelab-dashboard

# Check logs
docker logs homelab-dashboard -f
From https://github.com/ScarletRedJoker/HomeLabHub
 * branch            main       -> FETCH_HEAD
Already up to date.
[+] Building 0.2s (14/14) FINISHED                                                                                            
 => [internal] load local bake definitions                                                                               0.0s
 => => reading from stdin 599B                                                                                           0.0s
 => [internal] load build definition from Dockerfile                                                                     0.0s
 => => transferring dockerfile: 1.20kB                                                                                   0.0s
 => [internal] load metadata for docker.io/library/python:3.11-slim                                                      0.1s
 => [internal] load .dockerignore                                                                                        0.0s
 => => transferring context: 2B                                                                                          0.0s
 => [1/7] FROM docker.io/library/python:3.11-slim@sha256:e4676722fba839e2e5cdb844a52262b43e90e56dbd55b7ad953ee3615ad753  0.0s
 => [internal] load build context                                                                                        0.0s
 => => transferring context: 2.26kB                                                                                      0.0s
 => CACHED [2/7] WORKDIR /app                                                                                            0.0s
 => CACHED [3/7] RUN apt-get update && apt-get install -y     gcc     curl     ca-certificates     && install -m 0755 -  0.0s
 => CACHED [4/7] COPY requirements.txt .                                                                                 0.0s
 => CACHED [5/7] RUN pip install --no-cache-dir -r requirements.txt gunicorn                                             0.0s
 => CACHED [6/7] COPY . .                                                                                                0.0s
 => CACHED [7/7] RUN mkdir -p /app/logs                                                                                  0.0s
 => exporting to image                                                                                                   0.0s
 => => exporting layers                                                                                                  0.0s
 => => writing image sha256:c1d093ac4788889c2867cc268cb08117ad9713111914a9ec562a26b8f0a54f71                             0.0s
 => => naming to docker.io/library/homelabhub-homelab-dashboard                                                          0.0s
 => resolving provenance for metadata file                                                                               0.0s
[+] Running 2/2
 ✔ homelabhub-homelab-dashboard  Built                                                                                   0.0s 
 ✔ Container homelab-dashboard   Running                                                                                 0.0s 
[2025-11-13 18:47:22 +0000] [1] [INFO] Starting gunicorn 21.2.0
[2025-11-13 18:47:22 +0000] [1] [INFO] Listening at: http://0.0.0.0:5000 (1)
[2025-11-13 18:47:22 +0000] [1] [INFO] Using worker: sync
[2025-11-13 18:47:22 +0000] [7] [INFO] Booting worker with pid: 7
[2025-11-13 18:47:22 +0000] [8] [INFO] Booting worker with pid: 8
[2025-11-13 18:47:22 +0000] [9] [INFO] Booting worker with pid: 9
/usr/local/lib/python3.11/site-packages/paramiko/pkey.py:100: CryptographyDeprecationWarning: TripleDES has been moved to cryptography.hazmat.decrepit.ciphers.algorithms.TripleDES and will be removed from cryptography.hazmat.primitives.ciphers.algorithms in 48.0.0.
  "cipher": algorithms.TripleDES,
/usr/local/lib/python3.11/site-packages/paramiko/pkey.py:100: CryptographyDeprecationWarning: TripleDES has been moved to cryptography.hazmat.decrepit.ciphers.algorithms.TripleDES and will be removed from cryptography.hazmat.primitives.ciphers.algorithms in 48.0.0.
  "cipher": algorithms.TripleDES,
/usr/local/lib/python3.11/site-packages/paramiko/pkey.py:100: CryptographyDeprecationWarning: TripleDES has been moved to cryptography.hazmat.decrepit.ciphers.algorithms.TripleDES and will be removed from cryptography.hazmat.primitives.ciphers.algorithms in 48.0.0.
  "cipher": algorithms.TripleDES,
/usr/local/lib/python3.11/site-packages/paramiko/transport.py:259: CryptographyDeprecationWarning: TripleDES has been moved to cryptography.hazmat.decrepit.ciphers.algorithms.TripleDES and will be removed from cryptography.hazmat.primitives.ciphers.algorithms in 48.0.0.
  "class": algorithms.TripleDES,
/usr/local/lib/python3.11/site-packages/paramiko/transport.py:259: CryptographyDeprecationWarning: TripleDES has been moved to cryptography.hazmat.decrepit.ciphers.algorithms.TripleDES and will be removed from cryptography.hazmat.primitives.ciphers.algorithms in 48.0.0.
  "class": algorithms.TripleDES,
/usr/local/lib/python3.11/site-packages/paramiko/transport.py:259: CryptographyDeprecationWarning: TripleDES has been moved to cryptography.hazmat.decrepit.ciphers.algorithms.TripleDES and will be removed from cryptography.hazmat.primitives.ciphers.algorithms in 48.0.0.
  "class": algorithms.TripleDES,
172.23.0.4 - - [13/Nov/2025:18:47:23 +0000] "GET /api/containers HTTP/1.1" 200 1534 "https://host.evindrake.net/" "Mozilla/5.0 (X11; Ubuntu; Linux x86_64; rv:145.0) Gecko/20100101 Firefox/145.0"
172.23.0.4 - - [13/Nov/2025:18:47:24 +0000] "GET /api/system/stats HTTP/1.1" 200 216 "https://host.evindrake.net/dashboard" "Mozilla/5.0 (X11; Ubuntu; Linux x86_64; rv:145.0) Gecko/20100101 Firefox/145.0"
172.23.0.4 - - [13/Nov/2025:18:47:26 +0000] "GET /api/system/stats HTTP/1.1" 200 216 "https://host.evindrake.net/dashboard" "Mozilla/5.0 (X11; Ubuntu; Linux x86_64; rv:145.0) Gecko/20100101 Firefox/145.0"
172.23.0.4 - - [13/Nov/2025:18:47:26 +0000] "GET /api/system/stats HTTP/1.1" 200 216 "https://host.evindrake.net/dashboard" "Mozilla/5.0 (X11; Ubuntu; Linux x86_64; rv:145.0) Gecko/20100101 Firefox/145.0"
172.23.0.4 - - [13/Nov/2025:18:47:27 +0000] "GET /api/containers HTTP/1.1" 200 1534 "https://host.evindrake.net/" "Mozilla/5.0 (X11; Ubuntu; Linux x86_64; rv:145.0) Gecko/20100101 Firefox/145.0"
172.23.0.4 - - [13/Nov/2025:18:47:29 +0000] "GET /api/system/stats HTTP/1.1" 200 217 "https://host.evindrake.net/dashboard" "Mozilla/5.0 (X11; Ubuntu; Linux x86_64; rv:145.0) Gecko/20100101 Firefox/145.0"
172.23.0.4 - - [13/Nov/2025:18:47:31 +0000] "GET /api/system/stats HTTP/1.1" 200 217 "https://host.evindrake.net/dashboard" "Mozilla/5.0 (X11; Ubuntu; Linux x86_64; rv:145.0) Gecko/20100101 Firefox/145.0"
172.23.0.4 - - [13/Nov/2025:18:47:32 +0000] "GET /api/system/stats HTTP/1.1" 200 217 "https://host.evindrake.net/dashboard" "Mozilla/5.0 (X11; Ubuntu; Linux x86_64; rv:145.0) Gecko/20100101 Firefox/145.0"
172.23.0.4 - - [13/Nov/2025:18:47:33 +0000] "GET /api/system/stats HTTP/1.1" 200 217 "https://host.evindrake.net/dashboard" "Mozilla/5.0 (X11; Ubuntu; Linux x86_64; rv:145.0) Gecko/20100101 Firefox/145.0"
172.23.0.4 - - [13/Nov/2025:18:47:35 +0000] "GET /api/system/stats HTTP/1.1" 200 217 "https://host.evindrake.net/dashboard" "Mozilla/5.0 (X11; Ubuntu; Linux x86_64; rv:145.0) Gecko/20100101 Firefox/145.0"
172.23.0.4 - - [13/Nov/2025:18:47:37 +0000] "GET /api/containers HTTP/1.1" 200 1534 "https://host.evindrake.net/" "Mozilla/5.0 (X11; Ubuntu; Linux x86_64; rv:145.0) Gecko/20100101 Firefox/145.0"
172.23.0.4 - - [13/Nov/2025:18:47:38 +0000] "GET /api/system/stats HTTP/1.1" 200 217 "https://host.evindrake.net/dashboard" "Mozilla/5.0 (X11; Ubuntu; Linux x86_64; rv:145.0) Gecko/20100101 Firefox/145.0"
172.23.0.4 - - [13/Nov/2025:18:47:41 +0000] "GET /api/system/stats HTTP/1.1" 200 217 "https://host.evindrake.net/dashboard" "Mozilla/5.0 (X11; Ubuntu; Linux x86_64; rv:145.0) Gecko/20100101 Firefox/145.0"
172.23.0.4 - - [13/Nov/2025:18:47:44 +0000] "GET /api/system/stats HTTP/1.1" 200 217 "https://host.evindrake.net/dashboard" "Mozilla/5.0 (X11; Ubuntu; Linux x86_64; rv:145.0) Gecko/20100101 Firefox/145.0"
172.23.0.4 - - [13/Nov/2025:18:47:47 +0000] "GET /api/system/stats HTTP/1.1" 200 217 "https://host.evindrake.net/dashboard" "Mozilla/5.0 (X11; Ubuntu; Linux x86_64; rv:145.0) Gecko/20100101 Firefox/145.0"
172.23.0.4 - - [13/Nov/2025:18:47:50 +0000] "GET /api/system/stats HTTP/1.1" 200 217 "https://host.evindrake.net/dashboard" "Mozilla/5.0 (X11; Ubuntu; Linux x86_64; rv:145.0) Gecko/20100101 Firefox/145.0"
172.23.0.4 - - [13/Nov/2025:18:47:50 +0000] "GET /api/system/disk HTTP/1.1" 200 1063 "https://host.evindrake.net/dashboard" "Mozilla/5.0 (X11; Ubuntu; Linux x86_64; rv:145.0) Gecko/20100101 Firefox/145.0"
172.23.0.4 - - [13/Nov/2025:18:47:52 +0000] "GET /api/containers HTTP/1.1" 200 1534 "https://host.evindrake.net/" "Mozilla/5.0 (X11; Ubuntu; Linux x86_64; rv:145.0) Gecko/20100101 Firefox/145.0"
172.23.0.4 - - [13/Nov/2025:18:47:53 +0000] "GET /api/system/stats HTTP/1.1" 200 217 "https://host.evindrake.net/dashboard" "Mozilla/5.0 (X11; Ubuntu; Linux x86_64; rv:145.0) Gecko/20100101 Firefox/145.0"
172.23.0.4 - - [13/Nov/2025:18:47:56 +0000] "GET /api/system/stats HTTP/1.1" 200 217 "https://host.evindrake.net/dashboard" "Mozilla/5.0 (X11; Ubuntu; Linux x86_64; rv:145.0) Gecko/20100101 Firefox/145.0"
172.23.0.4 - - [13/Nov/2025:18:47:59 +0000] "GET /api/system/stats HTTP/1.1" 200 217 "https://host.evindrake.net/dashboard" "Mozilla/5.0 (X11; Ubuntu; Linux x86_64; rv:145.0) Gecko/20100101 Firefox/145.0"
172.23.0.4 - - [13/Nov/2025:18:48:02 +0000] "GET /api/system/stats HTTP/1.1" 200 217 "https://host.evindrake.net/dashboard" "Mozilla/5.0 (X11; Ubuntu; Linux x86_64; rv:145.0) Gecko/20100101 Firefox/145.0"
172.23.0.4 - - [13/Nov/2025:18:48:05 +0000] "GET /api/system/stats HTTP/1.1" 200 217 "https://host.evindrake.net/dashboard" "Mozilla/5.0 (X11; Ubuntu; Linux x86_64; rv:145.0) Gecko/20100101 Firefox/145.0"
172.23.0.4 - - [13/Nov/2025:18:48:07 +0000] "GET /api/containers HTTP/1.1" 200 1534 "https://host.evindrake.net/" "Mozilla/5.0 (X11; Ubuntu; Linux x86_64; rv:145.0) Gecko/20100101 Firefox/145.0"
172.23.0.4 - - [13/Nov/2025:18:48:08 +0000] "GET /api/system/stats HTTP/1.1" 200 217 "https://host.evindrake.net/dashboard" "Mozilla/5.0 (X11; Ubuntu; Linux x86_64; rv:145.0) Gecko/20100101 Firefox/145.0"
172.23.0.4 - - [13/Nov/2025:18:48:11 +0000] "GET /api/system/stats HTTP/1.1" 200 217 "https://host.evindrake.net/dashboard" "Mozilla/5.0 (X11; Ubuntu; Linux x86_64; rv:145.0) Gecko/20100101 Firefox/145.0"
172.23.0.4 - - [13/Nov/2025:18:48:14 +0000] "GET /api/system/stats HTTP/1.1" 200 217 "https://host.evindrake.net/dashboard" "Mozilla/5.0 (X11; Ubuntu; Linux x86_64; rv:145.0) Gecko/20100101 Firefox/145.0"
172.23.0.4 - - [13/Nov/2025:18:48:17 +0000] "GET /api/system/stats HTTP/1.1" 200 217 "https://host.evindrake.net/dashboard" "Mozilla/5.0 (X11; Ubuntu; Linux x86_64; rv:145.0) Gecko/20100101 Firefox/145.0"
172.23.0.4 - - [13/Nov/2025:18:48:20 +0000] "GET /api/system/stats HTTP/1.1" 200 217 "https://host.evindrake.net/dashboard" "Mozilla/5.0 (X11; Ubuntu; Linux x86_64; rv:145.0) Gecko/20100101 Firefox/145.0"
172.23.0.4 - - [13/Nov/2025:18:48:20 +0000] "GET /api/system/disk HTTP/1.1" 200 1063 "https://host.evindrake.net/dashboard" "Mozilla/5.0 (X11; Ubuntu; Linux x86_64; rv:145.0) Gecko/20100101 Firefox/145.0"
172.23.0.4 - - [13/Nov/2025:18:48:22 +0000] "GET /api/containers HTTP/1.1" 200 1534 "https://host.evindrake.net/" "Mozilla/5.0 (X11; Ubuntu; Linux x86_64; rv:145.0) Gecko/20100101 Firefox/145.0"
172.23.0.4 - - [13/Nov/2025:18:48:23 +0000] "GET /api/system/stats HTTP/1.1" 200 217 "https://host.evindrake.net/dashboard" "Mozilla/5.0 (X11; Ubuntu; Linux x86_64; rv:145.0) Gecko/20100101 Firefox/145.0"
172.23.0.4 - - [13/Nov/2025:18:48:26 +0000] "GET /api/system/stats HTTP/1.1" 200 217 "https://host.evindrake.net/dashboard" "Mozilla/5.0 (X11; Ubuntu; Linux x86_64; rv:145.0) Gecko/20100101 Firefox/145.0"
172.23.0.4 - - [13/Nov/2025:18:48:29 +0000] "GET /api/system/stats HTTP/1.1" 200 217 "https://host.evindrake.net/dashboard" "Mozilla/5.0 (X11; Ubuntu; Linux x86_64; rv:145.0) Gecko/20100101 Firefox/145.0"
172.23.0.4 - - [13/Nov/2025:18:48:32 +0000] "GET /api/system/stats HTTP/1.1" 200 217 "https://host.evindrake.net/dashboard" "Mozilla/5.0 (X11; Ubuntu; Linux x86_64; rv:145.0) Gecko/20100101 Firefox/145.0"
172.23.0.4 - - [13/Nov/2025:18:48:35 +0000] "GET /api/system/stats HTTP/1.1" 200 217 "https://host.evindrake.net/dashboard" "Mozilla/5.0 (X11; Ubuntu; Linux x86_64; rv:145.0) Gecko/20100101 Firefox/145.0"
172.23.0.4 - - [13/Nov/2025:18:48:37 +0000] "GET /api/containers HTTP/1.1" 200 1534 "https://host.evindrake.net/" "Mozilla/5.0 (X11; Ubuntu; Linux x86_64; rv:145.0) Gecko/20100101 Firefox/145.0"
172.23.0.4 - - [13/Nov/2025:18:48:38 +0000] "GET /api/system/stats HTTP/1.1" 200 217 "https://host.evindrake.net/dashboard" "Mozilla/5.0 (X11; Ubuntu; Linux x86_64; rv:145.0) Gecko/20100101 Firefox/145.0"
172.23.0.4 - - [13/Nov/2025:18:48:41 +0000] "GET /api/system/stats HTTP/1.1" 200 217 "https://host.evindrake.net/dashboard" "Mozilla/5.0 (X11; Ubuntu; Linux x86_64; rv:145.0) Gecko/20100101 Firefox/145.0"
172.23.0.4 - - [13/Nov/2025:18:48:44 +0000] "GET /api/system/stats HTTP/1.1" 200 217 "https://host.evindrake.net/dashboard" "Mozilla/5.0 (X11; Ubuntu; Linux x86_64; rv:145.0) Gecko/20100101 Firefox/145.0"
172.23.0.4 - - [13/Nov/2025:18:48:47 +0000] "GET /api/system/stats HTTP/1.1" 200 217 "https://host.evindrake.net/dashboard" "Mozilla/5.0 (X11; Ubuntu; Linux x86_64; rv:145.0) Gecko/20100101 Firefox/145.0"
172.23.0.4 - - [13/Nov/2025:18:48:50 +0000] "GET /api/system/disk HTTP/1.1" 200 1063 "https://host.evindrake.net/dashboard" "Mozilla/5.0 (X11; Ubuntu; Linux x86_64; rv:145.0) Gecko/20100101 Firefox/145.0"
172.23.0.4 - - [13/Nov/2025:18:48:50 +0000] "GET /api/system/stats HTTP/1.1" 200 217 "https://host.evindrake.net/dashboard" "Mozilla/5.0 (X11; Ubuntu; Linux x86_64; rv:145.0) Gecko/20100101 Firefox/145.0"
172.23.0.4 - - [13/Nov/2025:18:48:52 +0000] "GET /api/containers HTTP/1.1" 200 1534 "https://host.evindrake.net/" "Mozilla/5.0 (X11; Ubuntu; Linux x86_64; rv:145.0) Gecko/20100101 Firefox/145.0"
172.23.0.4 - - [13/Nov/2025:18:48:53 +0000] "GET /api/system/stats HTTP/1.1" 200 217 "https://host.evindrake.net/dashboard" "Mozilla/5.0 (X11; Ubuntu; Linux x86_64; rv:145.0) Gecko/20100101 Firefox/145.0"
172.23.0.4 - - [13/Nov/2025:18:48:56 +0000] "GET /api/system/stats HTTP/1.1" 200 217 "https://host.evindrake.net/dashboard" "Mozilla/5.0 (X11; Ubuntu; Linux x86_64; rv:145.0) Gecko/20100101 Firefox/145.0"
172.23.0.4 - - [13/Nov/2025:18:48:59 +0000] "GET /api/system/stats HTTP/1.1" 200 217 "https://host.evindrake.net/dashboard" "Mozilla/5.0 (X11; Ubuntu; Linux x86_64; rv:145.0) Gecko/20100101 Firefox/145.0"
172.23.0.4 - - [13/Nov/2025:18:49:02 +0000] "GET /api/system/stats HTTP/1.1" 200 217 "https://host.evindrake.net/dashboard" "Mozilla/5.0 (X11; Ubuntu; Linux x86_64; rv:145.0) Gecko/20100101 Firefox/145.0"
172.23.0.4 - - [13/Nov/2025:18:49:05 +0000] "GET /api/system/stats HTTP/1.1" 200 217 "https://host.evindrake.net/dashboard" "Mozilla/5.0 (X11; Ubuntu; Linux x86_64; rv:145.0) Gecko/20100101 Firefox/145.0"
172.23.0.4 - - [13/Nov/2025:18:49:07 +0000] "GET /api/containers HTTP/1.1" 200 1534 "https://host.evindrake.net/" "Mozilla/5.0 (X11; Ubuntu; Linux x86_64; rv:145.0) Gecko/20100101 Firefox/145.0"
172.23.0.4 - - [13/Nov/2025:18:49:08 +0000] "GET /api/system/stats HTTP/1.1" 200 217 "https://host.evindrake.net/dashboard" "Mozilla/5.0 (X11; Ubuntu; Linux x86_64; rv:145.0) Gecko/20100101 Firefox/145.0"
172.23.0.4 - - [13/Nov/2025:18:49:11 +0000] "GET /api/system/stats HTTP/1.1" 200 217 "https://host.evindrake.net/dashboard" "Mozilla/5.0 (X11; Ubuntu; Linux x86_64; rv:145.0) Gecko/20100101 Firefox/145.0"
172.23.0.4 - - [13/Nov/2025:18:49:14 +0000] "GET /api/system/stats HTTP/1.1" 200 217 "https://host.evindrake.net/dashboard" "Mozilla/5.0 (X11; Ubuntu; Linux x86_64; rv:145.0) Gecko/20100101 Firefox/145.0"
172.23.0.4 - - [13/Nov/2025:18:49:17 +0000] "GET /api/system/stats HTTP/1.1" 200 217 "https://host.evindrake.net/dashboard" "Mozilla/5.0 (X11; Ubuntu; Linux x86_64; rv:145.0) Gecko/20100101 Firefox/145.0"
172.23.0.4 - - [13/Nov/2025:18:49:20 +0000] "GET /api/system/disk HTTP/1.1" 200 1063 "https://host.evindrake.net/dashboard" "Mozilla/5.0 (X11; Ubuntu; Linux x86_64; rv:145.0) Gecko/20100101 Firefox/145.0"
172.23.0.4 - - [13/Nov/2025:18:49:20 +0000] "GET /api/system/stats HTTP/1.1" 200 217 "https://host.evindrake.net/dashboard" "Mozilla/5.0 (X11; Ubuntu; Linux x86_64; rv:145.0) Gecko/20100101 Firefox/145.0"
172.23.0.4 - - [13/Nov/2025:18:49:22 +0000] "GET /api/containers HTTP/1.1" 200 1534 "https://host.evindrake.net/" "Mozilla/5.0 (X11; Ubuntu; Linux x86_64; rv:145.0) Gecko/20100101 Firefox/145.0"
172.23.0.4 - - [13/Nov/2025:18:49:23 +0000] "GET /api/system/stats HTTP/1.1" 200 217 "https://host.evindrake.net/dashboard" "Mozilla/5.0 (X11; Ubuntu; Linux x86_64; rv:145.0) Gecko/20100101 Firefox/145.0"
172.23.0.4 - - [13/Nov/2025:18:49:26 +0000] "GET /api/system/stats HTTP/1.1" 200 217 "https://host.evindrake.net/dashboard" "Mozilla/5.0 (X11; Ubuntu; Linux x86_64; rv:145.0) Gecko/20100101 Firefox/145.0"
172.23.0.4 - - [13/Nov/2025:18:49:29 +0000] "GET /api/system/stats HTTP/1.1" 200 217 "https://host.evindrake.net/dashboard" "Mozilla/5.0 (X11; Ubuntu; Linux x86_64; rv:145.0) Gecko/20100101 Firefox/145.0"
172.23.0.4 - - [13/Nov/2025:18:49:32 +0000] "GET /api/system/stats HTTP/1.1" 200 217 "https://host.evindrake.net/dashboard" "Mozilla/5.0 (X11; Ubuntu; Linux x86_64; rv:145.0) Gecko/20100101 Firefox/145.0"
172.23.0.4 - - [13/Nov/2025:18:49:35 +0000] "GET /api/system/stats HTTP/1.1" 200 217 "https://host.evindrake.net/dashboard" "Mozilla/5.0 (X11; Ubuntu; Linux x86_64; rv:145.0) Gecko/20100101 Firefox/145.0"
172.23.0.4 - - [13/Nov/2025:18:49:37 +0000] "GET /api/containers HTTP/1.1" 200 1534 "https://host.evindrake.net/" "Mozilla/5.0 (X11; Ubuntu; Linux x86_64; rv:145.0) Gecko/20100101 Firefox/145.0"
172.23.0.4 - - [13/Nov/2025:18:49:38 +0000] "GET /api/system/stats HTTP/1.1" 200 216 "https://host.evindrake.net/dashboard" "Mozilla/5.0 (X11; Ubuntu; Linux x86_64; rv:145.0) Gecko/20100101 Firefox/145.0"
172.23.0.4 - - [13/Nov/2025:18:49:41 +0000] "GET /api/system/stats HTTP/1.1" 200 216 "https://host.evindrake.net/dashboard" "Mozilla/5.0 (X11; Ubuntu; Linux x86_64; rv:145.0) Gecko/20100101 Firefox/145.0"
172.23.0.4 - - [13/Nov/2025:18:49:44 +0000] "GET /api/system/stats HTTP/1.1" 200 216 "https://host.evindrake.net/dashboard" "Mozilla/5.0 (X11; Ubuntu; Linux x86_64; rv:145.0) Gecko/20100101 Firefox/145.0"
172.23.0.4 - - [13/Nov/2025:18:49:47 +0000] "GET /api/system/stats HTTP/1.1" 200 216 "https://host.evindrake.net/dashboard" "Mozilla/5.0 (X11; Ubuntu; Linux x86_64; rv:145.0) Gecko/20100101 Firefox/145.0"
172.23.0.4 - - [13/Nov/2025:18:49:50 +0000] "GET /api/system/stats HTTP/1.1" 200 216 "https://host.evindrake.net/dashboard" "Mozilla/5.0 (X11; Ubuntu; Linux x86_64; rv:145.0) Gecko/20100101 Firefox/145.0"
172.23.0.4 - - [13/Nov/2025:18:49:50 +0000] "GET /api/system/disk HTTP/1.1" 200 1063 "https://host.evindrake.net/dashboard" "Mozilla/5.0 (X11; Ubuntu; Linux x86_64; rv:145.0) Gecko/20100101 Firefox/145.0"
172.23.0.4 - - [13/Nov/2025:18:49:52 +0000] "GET /api/containers HTTP/1.1" 200 1534 "https://host.evindrake.net/" "Mozilla/5.0 (X11; Ubuntu; Linux x86_64; rv:145.0) Gecko/20100101 Firefox/145.0"
172.23.0.4 - - [13/Nov/2025:18:49:53 +0000] "GET /api/system/stats HTTP/1.1" 200 216 "https://host.evindrake.net/dashboard" "Mozilla/5.0 (X11; Ubuntu; Linux x86_64; rv:145.0) Gecko/20100101 Firefox/145.0"
172.23.0.4 - - [13/Nov/2025:18:49:56 +0000] "GET /api/system/stats HTTP/1.1" 200 216 "https://host.evindrake.net/dashboard" "Mozilla/5.0 (X11; Ubuntu; Linux x86_64; rv:145.0) Gecko/20100101 Firefox/145.0"
172.23.0.4 - - [13/Nov/2025:18:49:59 +0000] "GET /api/system/stats HTTP/1.1" 200 217 "https://host.evindrake.net/dashboard" "Mozilla/5.0 (X11; Ubuntu; Linux x86_64; rv:145.0) Gecko/20100101 Firefox/145.0"
172.23.0.4 - - [13/Nov/2025:18:50:02 +0000] "GET /api/system/stats HTTP/1.1" 200 217 "https://host.evindrake.net/dashboard" "Mozilla/5.0 (X11; Ubuntu; Linux x86_64; rv:145.0) Gecko/20100101 Firefox/145.0"
172.23.0.4 - - [13/Nov/2025:18:50:05 +0000] "GET /api/system/stats HTTP/1.1" 200 217 "https://host.evindrake.net/dashboard" "Mozilla/5.0 (X11; Ubuntu; Linux x86_64; rv:145.0) Gecko/20100101 Firefox/145.0"
172.23.0.4 - - [13/Nov/2025:18:50:07 +0000] "GET /api/containers HTTP/1.1" 200 1534 "https://host.evindrake.net/" "Mozilla/5.0 (X11; Ubuntu; Linux x86_64; rv:145.0) Gecko/20100101 Firefox/145.0"
172.23.0.4 - - [13/Nov/2025:18:50:08 +0000] "GET /api/system/stats HTTP/1.1" 200 217 "https://host.evindrake.net/dashboard" "Mozilla/5.0 (X11; Ubuntu; Linux x86_64; rv:145.0) Gecko/20100101 Firefox/145.0"
172.23.0.4 - - [13/Nov/2025:18:50:11 +0000] "GET /api/system/stats HTTP/1.1" 200 216 "https://host.evindrake.net/dashboard" "Mozilla/5.0 (X11; Ubuntu; Linux x86_64; rv:145.0) Gecko/20100101 Firefox/145.0"
172.23.0.4 - - [13/Nov/2025:18:50:14 +0000] "GET /api/system/stats HTTP/1.1" 200 216 "https://host.evindrake.net/dashboard" "Mozilla/5.0 (X11; Ubuntu; Linux x86_64; rv:145.0) Gecko/20100101 Firefox/145.0"
172.23.0.4 - - [13/Nov/2025:18:50:17 +0000] "GET /api/system/stats HTTP/1.1" 200 216 "https://host.evindrake.net/dashboard" "Mozilla/5.0 (X11; Ubuntu; Linux x86_64; rv:145.0) Gecko/20100101 Firefox/145.0"
172.23.0.4 - - [13/Nov/2025:18:50:20 +0000] "GET /api/system/stats HTTP/1.1" 200 216 "https://host.evindrake.net/dashboard" "Mozilla/5.0 (X11; Ubuntu; Linux x86_64; rv:145.0) Gecko/20100101 Firefox/145.0"
172.23.0.4 - - [13/Nov/2025:18:50:20 +0000] "GET /api/system/disk HTTP/1.1" 200 1063 "https://host.evindrake.net/dashboard" "Mozilla/5.0 (X11; Ubuntu; Linux x86_64; rv:145.0) Gecko/20100101 Firefox/145.0"
172.23.0.4 - - [13/Nov/2025:18:50:22 +0000] "GET /api/containers HTTP/1.1" 200 1534 "https://host.evindrake.net/" "Mozilla/5.0 (X11; Ubuntu; Linux x86_64; rv:145.0) Gecko/20100101 Firefox/145.0"
172.23.0.4 - - [13/Nov/2025:18:50:23 +0000] "GET /api/system/stats HTTP/1.1" 200 216 "https://host.evindrake.net/dashboard" "Mozilla/5.0 (X11; Ubuntu; Linux x86_64; rv:145.0) Gecko/20100101 Firefox/145.0"
172.23.0.4 - - [13/Nov/2025:18:50:26 +0000] "GET /api/system/stats HTTP/1.1" 200 216 "https://host.evindrake.net/dashboard" "Mozilla/5.0 (X11; Ubuntu; Linux x86_64; rv:145.0) Gecko/20100101 Firefox/145.0"
172.23.0.4 - - [13/Nov/2025:18:50:29 +0000] "GET /api/system/stats HTTP/1.1" 200 216 "https://host.evindrake.net/dashboard" "Mozilla/5.0 (X11; Ubuntu; Linux x86_64; rv:145.0) Gecko/20100101 Firefox/145.0"
172.23.0.4 - - [13/Nov/2025:18:50:32 +0000] "GET /api/system/stats HTTP/1.1" 200 217 "https://host.evindrake.net/dashboard" "Mozilla/5.0 (X11; Ubuntu; Linux x86_64; rv:145.0) Gecko/20100101 Firefox/145.0"
172.23.0.4 - - [13/Nov/2025:18:50:35 +0000] "GET /api/system/stats HTTP/1.1" 200 217 "https://host.evindrake.net/dashboard" "Mozilla/5.0 (X11; Ubuntu; Linux x86_64; rv:145.0) Gecko/20100101 Firefox/145.0"
172.23.0.4 - - [13/Nov/2025:18:50:37 +0000] "GET /api/containers HTTP/1.1" 200 1534 "https://host.evindrake.net/" "Mozilla/5.0 (X11; Ubuntu; Linux x86_64; rv:145.0) Gecko/20100101 Firefox/145.0"
172.23.0.4 - - [13/Nov/2025:18:50:38 +0000] "GET /api/system/stats HTTP/1.1" 200 217 "https://host.evindrake.net/dashboard" "Mozilla/5.0 (X11; Ubuntu; Linux x86_64; rv:145.0) Gecko/20100101 Firefox/145.0"
172.23.0.4 - - [13/Nov/2025:18:50:41 +0000] "GET /api/system/stats HTTP/1.1" 200 217 "https://host.evindrake.net/dashboard" "Mozilla/5.0 (X11; Ubuntu; Linux x86_64; rv:145.0) Gecko/20100101 Firefox/145.0"
172.23.0.4 - - [13/Nov/2025:18:50:44 +0000] "GET /api/system/stats HTTP/1.1" 200 217 "https://host.evindrake.net/dashboard" "Mozilla/5.0 (X11; Ubuntu; Linux x86_64; rv:145.0) Gecko/20100101 Firefox/145.0"
172.23.0.4 - - [13/Nov/2025:18:50:47 +0000] "GET /api/system/stats HTTP/1.1" 200 217 "https://host.evindrake.net/dashboard" "Mozilla/5.0 (X11; Ubuntu; Linux x86_64; rv:145.0) Gecko/20100101 Firefox/145.0"
172.23.0.4 - - [13/Nov/2025:18:50:50 +0000] "GET /api/system/stats HTTP/1.1" 200 217 "https://host.evindrake.net/dashboard" "Mozilla/5.0 (X11; Ubuntu; Linux x86_64; rv:145.0) Gecko/20100101 Firefox/145.0"
172.23.0.4 - - [13/Nov/2025:18:50:50 +0000] "GET /api/system/disk HTTP/1.1" 200 1063 "https://host.evindrake.net/dashboard" "Mozilla/5.0 (X11; Ubuntu; Linux x86_64; rv:145.0) Gecko/20100101 Firefox/145.0"
172.23.0.4 - - [13/Nov/2025:18:50:52 +0000] "GET /api/containers HTTP/1.1" 200 1534 "https://host.evindrake.net/" "Mozilla/5.0 (X11; Ubuntu; Linux x86_64; rv:145.0) Gecko/20100101 Firefox/145.0"
172.23.0.4 - - [13/Nov/2025:18:50:53 +0000] "GET /api/system/stats HTTP/1.1" 200 217 "https://host.evindrake.net/dashboard" "Mozilla/5.0 (X11; Ubuntu; Linux x86_64; rv:145.0) Gecko/20100101 Firefox/145.0"
172.23.0.4 - - [13/Nov/2025:18:50:56 +0000] "GET /api/system/stats HTTP/1.1" 200 217 "https://host.evindrake.net/dashboard" "Mozilla/5.0 (X11; Ubuntu; Linux x86_64; rv:145.0) Gecko/20100101 Firefox/145.0"
172.23.0.4 - - [13/Nov/2025:18:50:59 +0000] "GET /api/system/stats HTTP/1.1" 200 217 "https://host.evindrake.net/dashboard" "Mozilla/5.0 (X11; Ubuntu; Linux x86_64; rv:145.0) Gecko/20100101 Firefox/145.0"
172.23.0.4 - - [13/Nov/2025:18:51:02 +0000] "GET /api/system/stats HTTP/1.1" 200 217 "https://host.evindrake.net/dashboard" "Mozilla/5.0 (X11; Ubuntu; Linux x86_64; rv:145.0) Gecko/20100101 Firefox/145.0"
172.23.0.4 - - [13/Nov/2025:18:51:03 +0000] "GET / HTTP/1.1" 200 20761 "https://host.evindrake.net/system" "Mozilla/5.0 (X11; Ubuntu; Linux x86_64; rv:145.0) Gecko/20100101 Firefox/145.0"
172.23.0.4 - - [13/Nov/2025:18:51:04 +0000] "GET /api/containers HTTP/1.1" 200 1534 "https://host.evindrake.net/" "Mozilla/5.0 (X11; Ubuntu; Linux x86_64; rv:145.0) Gecko/20100101 Firefox/145.0"
172.23.0.4 - - [13/Nov/2025:18:51:05 +0000] "GET /dashboard HTTP/1.1" 200 20228 "https://host.evindrake.net/" "Mozilla/5.0 (X11; Ubuntu; Linux x86_64; rv:145.0) Gecko/20100101 Firefox/145.0"
172.23.0.4 - - [13/Nov/2025:18:51:05 +0000] "GET /api/system/disk HTTP/1.1" 200 1063 "https://host.evindrake.net/dashboard" "Mozilla/5.0 (X11; Ubuntu; Linux x86_64; rv:145.0) Gecko/20100101 Firefox/145.0"
172.23.0.4 - - [13/Nov/2025:18:51:05 +0000] "GET /api/system/stats HTTP/1.1" 200 217 "https://host.evindrake.net/dashboard" "Mozilla/5.0 (X11; Ubuntu; Linux x86_64; rv:145.0) Gecko/20100101 Firefox/145.0"
172.23.0.4 - - [13/Nov/2025:18:51:06 +0000] "GET /api/system/stats HTTP/1.1" 200 217 "https://host.evindrake.net/dashboard" "Mozilla/5.0 (X11; Ubuntu; Linux x86_64; rv:145.0) Gecko/20100101 Firefox/145.0"
172.23.0.4 - - [13/Nov/2025:18:51:06 +0000] "GET /containers HTTP/1.1" 200 17530 "https://host.evindrake.net/dashboard" "Mozilla/5.0 (X11; Ubuntu; Linux x86_64; rv:145.0) Gecko/20100101 Firefox/145.0"
172.23.0.4 - - [13/Nov/2025:18:51:06 +0000] "GET /api/containers HTTP/1.1" 200 1534 "https://host.evindrake.net/containers" "Mozilla/5.0 (X11; Ubuntu; Linux x86_64; rv:145.0) Gecko/20100101 Firefox/145.0"
172.23.0.4 - - [13/Nov/2025:18:51:07 +0000] "GET / HTTP/1.1" 200 20761 "https://host.evindrake.net/containers" "Mozilla/5.0 (X11; Ubuntu; Linux x86_64; rv:145.0) Gecko/20100101 Firefox/145.0"
172.23.0.4 - - [13/Nov/2025:18:51:07 +0000] "GET /api/containers HTTP/1.1" 200 1534 "https://host.evindrake.net/" "Mozilla/5.0 (X11; Ubuntu; Linux x86_64; rv:145.0) Gecko/20100101 Firefox/145.0"
172.23.0.4 - - [13/Nov/2025:18:51:08 +0000] "GET /api/system/stats HTTP/1.1" 200 217 "https://host.evindrake.net/dashboard" "Mozilla/5.0 (X11; Ubuntu; Linux x86_64; rv:145.0) Gecko/20100101 Firefox/145.0"
172.23.0.4 - - [13/Nov/2025:18:51:11 +0000] "GET /api/system/stats HTTP/1.1" 200 217 "https://host.evindrake.net/dashboard" "Mozilla/5.0 (X11; Ubuntu; Linux x86_64; rv:145.0) Gecko/20100101 Firefox/145.0"
172.23.0.4 - - [13/Nov/2025:18:51:14 +0000] "GET /api/system/stats HTTP/1.1" 200 217 "https://host.evindrake.net/dashboard" "Mozilla/5.0 (X11; Ubuntu; Linux x86_64; rv:145.0) Gecko/20100101 Firefox/145.0"
172.23.0.4 - - [13/Nov/2025:18:51:17 +0000] "GET /api/system/stats HTTP/1.1" 200 217 "https://host.evindrake.net/dashboard" "Mozilla/5.0 (X11; Ubuntu; Linux x86_64; rv:145.0) Gecko/20100101 Firefox/145.0"
172.23.0.4 - - [13/Nov/2025:18:51:20 +0000] "GET /api/system/stats HTTP/1.1" 200 217 "https://host.evindrake.net/dashboard" "Mozilla/5.0 (X11; Ubuntu; Linux x86_64; rv:145.0) Gecko/20100101 Firefox/145.0"
172.23.0.4 - - [13/Nov/2025:18:51:20 +0000] "GET /api/system/disk HTTP/1.1" 200 1063 "https://host.evindrake.net/dashboard" "Mozilla/5.0 (X11; Ubuntu; Linux x86_64; rv:145.0) Gecko/20100101 Firefox/145.0"
172.23.0.4 - - [13/Nov/2025:18:51:22 +0000] "GET /api/containers HTTP/1.1" 200 1534 "https://host.evindrake.net/" "Mozilla/5.0 (X11; Ubuntu; Linux x86_64; rv:145.0) Gecko/20100101 Firefox/145.0"
172.23.0.4 - - [13/Nov/2025:18:51:23 +0000] "GET /api/system/stats HTTP/1.1" 200 217 "https://host.evindrake.net/dashboard" "Mozilla/5.0 (X11; Ubuntu; Linux x86_64; rv:145.0) Gecko/20100101 Firefox/145.0"
172.23.0.4 - - [13/Nov/2025:18:51:25 +0000] "GET /dashboard HTTP/1.1" 200 20228 "https://host.evindrake.net/" "Mozilla/5.0 (X11; Ubuntu; Linux x86_64; rv:145.0) Gecko/20100101 Firefox/145.0"
172.23.0.4 - - [13/Nov/2025:18:51:25 +0000] "GET /api/system/disk HTTP/1.1" 200 1063 "https://host.evindrake.net/dashboard" "Mozilla/5.0 (X11; Ubuntu; Linux x86_64; rv:145.0) Gecko/20100101 Firefox/145.0"
172.23.0.4 - - [13/Nov/2025:18:51:26 +0000] "GET /api/system/stats HTTP/1.1" 200 217 "https://host.evindrake.net/dashboard" "Mozilla/5.0 (X11; Ubuntu; Linux x86_64; rv:145.0) Gecko/20100101 Firefox/145.0"
172.23.0.4 - - [13/Nov/2025:18:51:26 +0000] "GET /api/system/stats HTTP/1.1" 200 217 "https://host.evindrake.net/dashboard" "Mozilla/5.0 (X11; Ubuntu; Linux x86_64; rv:145.0) Gecko/20100101 Firefox/145.0"
172.23.0.4 - - [13/Nov/2025:18:51:29 +0000] "GET /api/system/stats HTTP/1.1" 200 217 "https://host.evindrake.net/dashboard" "Mozilla/5.0 (X11; Ubuntu; Linux x86_64; rv:145.0) Gecko/20100101 Firefox/145.0"
172.23.0.4 - - [13/Nov/2025:18:51:29 +0000] "GET /api/system/stats HTTP/1.1" 200 217 "https://host.evindrake.net/dashboard" "Mozilla/5.0 (X11; Ubuntu; Linux x86_64; rv:145.0) Gecko/20100101 Firefox/145.0"
172.23.0.4 - - [13/Nov/2025:18:51:32 +0000] "GET /api/system/stats HTTP/1.1" 200 217 "https://host.evindrake.net/dashboard" "Mozilla/5.0 (X11; Ubuntu; Linux x86_64; rv:145.0) Gecko/20100101 Firefox/145.0"
172.23.0.4 - - [13/Nov/2025:18:51:32 +0000] "GET /api/system/stats HTTP/1.1" 200 217 "https://host.evindrake.net/dashboard" "Mozilla/5.0 (X11; Ubuntu; Linux x86_64; rv:145.0) Gecko/20100101 Firefox/145.0"
172.23.0.4 - - [13/Nov/2025:18:51:35 +0000] "GET /api/system/stats HTTP/1.1" 200 217 "https://host.evindrake.net/dashboard" "Mozilla/5.0 (X11; Ubuntu; Linux x86_64; rv:145.0) Gecko/20100101 Firefox/145.0"
172.23.0.4 - - [13/Nov/2025:18:51:36 +0000] "GET /api/system/stats HTTP/1.1" 200 217 "https://host.evindrake.net/dashboard" "Mozilla/5.0 (X11; Ubuntu; Linux x86_64; rv:145.0) Gecko/20100101 Firefox/145.0"
172.23.0.4 - - [13/Nov/2025:18:51:38 +0000] "GET /api/system/stats HTTP/1.1" 200 217 "https://host.evindrake.net/dashboard" "Mozilla/5.0 (X11; Ubuntu; Linux x86_64; rv:145.0) Gecko/20100101 Firefox/145.0"
172.23.0.4 - - [13/Nov/2025:18:51:39 +0000] "GET /api/system/stats HTTP/1.1" 200 217 "https://host.evindrake.net/dashboard" "Mozilla/5.0 (X11; Ubuntu; Linux x86_64; rv:145.0) Gecko/20100101 Firefox/145.0"
172.23.0.4 - - [13/Nov/2025:18:51:41 +0000] "GET /api/system/stats HTTP/1.1" 200 217 "https://host.evindrake.net/dashboard" "Mozilla/5.0 (X11; Ubuntu; Linux x86_64; rv:145.0) Gecko/20100101 Firefox/145.0"
172.23.0.4 - - [13/Nov/2025:18:51:42 +0000] "GET /api/system/stats HTTP/1.1" 200 217 "https://host.evindrake.net/dashboard" "Mozilla/5.0 (X11; Ubuntu; Linux x86_64; rv:145.0) Gecko/20100101 Firefox/145.0"
172.23.0.4 - - [13/Nov/2025:18:51:43 +0000] "GET /containers HTTP/1.1" 200 17530 "https://host.evindrake.net/dashboard" "Mozilla/5.0 (X11; Ubuntu; Linux x86_64; rv:145.0) Gecko/20100101 Firefox/145.0"
172.23.0.4 - - [13/Nov/2025:18:51:43 +0000] "GET /api/containers HTTP/1.1" 200 1534 "https://host.evindrake.net/containers" "Mozilla/5.0 (X11; Ubuntu; Linux x86_64; rv:145.0) Gecko/20100101 Firefox/145.0"
172.23.0.4 - - [13/Nov/2025:18:51:45 +0000] "GET /api/system/stats HTTP/1.1" 200 217 "https://host.evindrake.net/dashboard" "Mozilla/5.0 (X11; Ubuntu; Linux x86_64; rv:145.0) Gecko/20100101 Firefox/145.0"
172.23.0.4 - - [13/Nov/2025:18:51:48 +0000] "GET /api/system/stats HTTP/1.1" 200 217 "https://host.evindrake.net/dashboard" "Mozilla/5.0 (X11; Ubuntu; Linux x86_64; rv:145.0) Gecko/20100101 Firefox/145.0"
172.23.0.4 - - [13/Nov/2025:18:51:51 +0000] "GET /api/system/disk HTTP/1.1" 200 1063 "https://host.evindrake.net/dashboard" "Mozilla/5.0 (X11; Ubuntu; Linux x86_64; rv:145.0) Gecko/20100101 Firefox/145.0"
172.23.0.4 - - [13/Nov/2025:18:51:51 +0000] "GET /api/system/stats HTTP/1.1" 200 217 "https://host.evindrake.net/dashboard" "Mozilla/5.0 (X11; Ubuntu; Linux x86_64; rv:145.0) Gecko/20100101 Firefox/145.0"
172.23.0.4 - - [13/Nov/2025:18:51:54 +0000] "GET /api/system/stats HTTP/1.1" 200 217 "https://host.evindrake.net/dashboard" "Mozilla/5.0 (X11; Ubuntu; Linux x86_64; rv:145.0) Gecko/20100101 Firefox/145.0"
172.23.0.4 - - [13/Nov/2025:18:51:57 +0000] "GET /api/system/stats HTTP/1.1" 200 217 "https://host.evindrake.net/dashboard" "Mozilla/5.0 (X11; Ubuntu; Linux x86_64; rv:145.0) Gecko/20100101 Firefox/145.0"
172.23.0.4 - - [13/Nov/2025:18:51:58 +0000] "GET /api/containers HTTP/1.1" 200 1534 "https://host.evindrake.net/containers" "Mozilla/5.0 (X11; Ubuntu; Linux x86_64; rv:145.0) Gecko/20100101 Firefox/145.0"
172.23.0.4 - - [13/Nov/2025:18:52:00 +0000] "GET /api/system/stats HTTP/1.1" 200 217 "https://host.evindrake.net/dashboard" "Mozilla/5.0 (X11; Ubuntu; Linux x86_64; rv:145.0) Gecko/20100101 Firefox/145.0"
172.23.0.4 - - [13/Nov/2025:18:52:03 +0000] "GET /api/system/stats HTTP/1.1" 200 217 "https://host.evindrake.net/dashboard" "Mozilla/5.0 (X11; Ubuntu; Linux x86_64; rv:145.0) Gecko/20100101 Firefox/145.0"
172.23.0.4 - - [13/Nov/2025:18:52:06 +0000] "GET /api/system/stats HTTP/1.1" 200 217 "https://host.evindrake.net/dashboard" "Mozilla/5.0 (X11; Ubuntu; Linux x86_64; rv:145.0) Gecko/20100101 Firefox/145.0"
172.23.0.4 - - [13/Nov/2025:18:52:09 +0000] "GET /api/system/stats HTTP/1.1" 200 217 "https://host.evindrake.net/dashboard" "Mozilla/5.0 (X11; Ubuntu; Linux x86_64; rv:145.0) Gecko/20100101 Firefox/145.0"
172.23.0.4 - - [13/Nov/2025:18:52:12 +0000] "GET /api/system/stats HTTP/1.1" 200 217 "https://host.evindrake.net/dashboard" "Mozilla/5.0 (X11; Ubuntu; Linux x86_64; rv:145.0) Gecko/20100101 Firefox/145.0"
172.23.0.4 - - [13/Nov/2025:18:52:13 +0000] "GET /api/containers HTTP/1.1" 200 1534 "https://host.evindrake.net/containers" "Mozilla/5.0 (X11; Ubuntu; Linux x86_64; rv:145.0) Gecko/20100101 Firefox/145.0"
172.23.0.4 - - [13/Nov/2025:18:52:15 +0000] "GET /api/system/stats HTTP/1.1" 200 217 "https://host.evindrake.net/dashboard" "Mozilla/5.0 (X11; Ubuntu; Linux x86_64; rv:145.0) Gecko/20100101 Firefox/145.0"
172.23.0.4 - - [13/Nov/2025:18:52:18 +0000] "GET /api/system/stats HTTP/1.1" 200 217 "https://host.evindrake.net/dashboard" "Mozilla/5.0 (X11; Ubuntu; Linux x86_64; rv:145.0) Gecko/20100101 Firefox/145.0"
172.23.0.4 - - [13/Nov/2025:18:52:21 +0000] "GET /api/system/stats HTTP/1.1" 200 217 "https://host.evindrake.net/dashboard" "Mozilla/5.0 (X11; Ubuntu; Linux x86_64; rv:145.0) Gecko/20100101 Firefox/145.0"
172.23.0.4 - - [13/Nov/2025:18:52:21 +0000] "GET /api/system/disk HTTP/1.1" 200 1063 "https://host.evindrake.net/dashboard" "Mozilla/5.0 (X11; Ubuntu; Linux x86_64; rv:145.0) Gecko/20100101 Firefox/145.0"
172.23.0.4 - - [13/Nov/2025:18:52:24 +0000] "GET /api/system/stats HTTP/1.1" 200 215 "https://host.evindrake.net/dashboard" "Mozilla/5.0 (X11; Ubuntu; Linux x86_64; rv:145.0) Gecko/20100101 Firefox/145.0"
172.23.0.4 - - [13/Nov/2025:18:52:27 +0000] "GET /api/system/stats HTTP/1.1" 200 215 "https://host.evindrake.net/dashboard" "Mozilla/5.0 (X11; Ubuntu; Linux x86_64; rv:145.0) Gecko/20100101 Firefox/145.0"
172.23.0.4 - - [13/Nov/2025:18:52:28 +0000] "GET /api/containers HTTP/1.1" 200 1534 "https://host.evindrake.net/containers" "Mozilla/5.0 (X11; Ubuntu; Linux x86_64; rv:145.0) Gecko/20100101 Firefox/145.0"
172.23.0.4 - - [13/Nov/2025:18:52:30 +0000] "GET /api/system/stats HTTP/1.1" 200 215 "https://host.evindrake.net/dashboard" "Mozilla/5.0 (X11; Ubuntu; Linux x86_64; rv:145.0) Gecko/20100101 Firefox/145.0"
172.23.0.4 - - [13/Nov/2025:18:52:33 +0000] "GET /api/system/stats HTTP/1.1" 200 215 "https://host.evindrake.net/dashboard" "Mozilla/5.0 (X11; Ubuntu; Linux x86_64; rv:145.0) Gecko/20100101 Firefox/145.0"
172.23.0.4 - - [13/Nov/2025:18:52:36 +0000] "GET /api/system/stats HTTP/1.1" 200 215 "https://host.evindrake.net/dashboard" "Mozilla/5.0 (X11; Ubuntu; Linux x86_64; rv:145.0) Gecko/20100101 Firefox/145.0"
172.23.0.4 - - [13/Nov/2025:18:52:39 +0000] "GET /api/system/stats HTTP/1.1" 200 215 "https://host.evindrake.net/dashboard" "Mozilla/5.0 (X11; Ubuntu; Linux x86_64; rv:145.0) Gecko/20100101 Firefox/145.0"
172.23.0.4 - - [13/Nov/2025:18:52:42 +0000] "GET /api/system/stats HTTP/1.1" 200 215 "https://host.evindrake.net/dashboard" "Mozilla/5.0 (X11; Ubuntu; Linux x86_64; rv:145.0) Gecko/20100101 Firefox/145.0"
172.23.0.4 - - [13/Nov/2025:18:52:43 +0000] "GET /api/containers HTTP/1.1" 200 1534 "https://host.evindrake.net/containers" "Mozilla/5.0 (X11; Ubuntu; Linux x86_64; rv:145.0) Gecko/20100101 Firefox/145.0"
172.23.0.4 - - [13/Nov/2025:18:52:45 +0000] "GET /api/system/stats HTTP/1.1" 200 217 "https://host.evindrake.net/dashboard" "Mozilla/5.0 (X11; Ubuntu; Linux x86_64; rv:145.0) Gecko/20100101 Firefox/145.0"
172.23.0.4 - - [13/Nov/2025:18:52:48 +0000] "GET /api/system/stats HTTP/1.1" 200 217 "https://host.evindrake.net/dashboard" "Mozilla/5.0 (X11; Ubuntu; Linux x86_64; rv:145.0) Gecko/20100101 Firefox/145.0"
172.23.0.4 - - [13/Nov/2025:18:52:51 +0000] "GET /api/system/stats HTTP/1.1" 200 217 "https://host.evindrake.net/dashboard" "Mozilla/5.0 (X11; Ubuntu; Linux x86_64; rv:145.0) Gecko/20100101 Firefox/145.0"
172.23.0.4 - - [13/Nov/2025:18:52:51 +0000] "GET /api/system/disk HTTP/1.1" 200 1063 "https://host.evindrake.net/dashboard" "Mozilla/5.0 (X11; Ubuntu; Linux x86_64; rv:145.0) Gecko/20100101 Firefox/145.0"
172.23.0.4 - - [13/Nov/2025:18:52:54 +0000] "GET /api/system/stats HTTP/1.1" 200 217 "https://host.evindrake.net/dashboard" "Mozilla/5.0 (X11; Ubuntu; Linux x86_64; rv:145.0) Gecko/20100101 Firefox/145.0"
172.23.0.4 - - [13/Nov/2025:18:52:57 +0000] "GET /api/system/stats HTTP/1.1" 200 217 "https://host.evindrake.net/dashboard" "Mozilla/5.0 (X11; Ubuntu; Linux x86_64; rv:145.0) Gecko/20100101 Firefox/145.0"
172.23.0.4 - - [13/Nov/2025:18:52:59 +0000] "GET /api/containers HTTP/1.1" 200 1534 "https://host.evindrake.net/containers" "Mozilla/5.0 (X11; Ubuntu; Linux x86_64; rv:145.0) Gecko/20100101 Firefox/145.0"
172.23.0.4 - - [13/Nov/2025:18:53:00 +0000] "GET /api/system/stats HTTP/1.1" 200 217 "https://host.evindrake.net/dashboard" "Mozilla/5.0 (X11; Ubuntu; Linux x86_64; rv:145.0) Gecko/20100101 Firefox/145.0"
172.23.0.4 - - [13/Nov/2025:18:53:03 +0000] "GET /api/system/stats HTTP/1.1" 200 217 "https://host.evindrake.net/dashboard" "Mozilla/5.0 (X11; Ubuntu; Linux x86_64; rv:145.0) Gecko/20100101 Firefox/145.0"
172.23.0.4 - - [13/Nov/2025:18:53:06 +0000] "GET /api/system/stats HTTP/1.1" 200 217 "https://host.evindrake.net/dashboard" "Mozilla/5.0 (X11; Ubuntu; Linux x86_64; rv:145.0) Gecko/20100101 Firefox/145.0"
172.23.0.4 - - [13/Nov/2025:18:53:09 +0000] "GET /api/system/stats HTTP/1.1" 200 217 "https://host.evindrake.net/dashboard" "Mozilla/5.0 (X11; Ubuntu; Linux x86_64; rv:145.0) Gecko/20100101 Firefox/145.0"
172.23.0.4 - - [13/Nov/2025:18:53:12 +0000] "GET /api/system/stats HTTP/1.1" 200 217 "https://host.evindrake.net/dashboard" "Mozilla/5.0 (X11; Ubuntu; Linux x86_64; rv:145.0) Gecko/20100101 Firefox/145.0"
172.23.0.4 - - [13/Nov/2025:18:53:14 +0000] "GET /api/containers HTTP/1.1" 200 1534 "https://host.evindrake.net/containers" "Mozilla/5.0 (X11; Ubuntu; Linux x86_64; rv:145.0) Gecko/20100101 Firefox/145.0"
172.23.0.4 - - [13/Nov/2025:18:53:15 +0000] "GET /api/system/stats HTTP/1.1" 200 217 "https://host.evindrake.net/dashboard" "Mozilla/5.0 (X11; Ubuntu; Linux x86_64; rv:145.0) Gecko/20100101 Firefox/145.0"
172.23.0.4 - - [13/Nov/2025:18:53:18 +0000] "GET /api/system/stats HTTP/1.1" 200 217 "https://host.evindrake.net/dashboard" "Mozilla/5.0 (X11; Ubuntu; Linux x86_64; rv:145.0) Gecko/20100101 Firefox/145.0"
172.23.0.4 - - [13/Nov/2025:18:53:21 +0000] "GET /api/system/stats HTTP/1.1" 200 217 "https://host.evindrake.net/dashboard" "Mozilla/5.0 (X11; Ubuntu; Linux x86_64; rv:145.0) Gecko/20100101 Firefox/145.0"
172.23.0.4 - - [13/Nov/2025:18:53:21 +0000] "GET /api/system/disk HTTP/1.1" 200 1063 "https://host.evindrake.net/dashboard" "Mozilla/5.0 (X11; Ubuntu; Linux x86_64; rv:145.0) Gecko/20100101 Firefox/145.0"
172.23.0.4 - - [13/Nov/2025:18:53:24 +0000] "GET /api/system/stats HTTP/1.1" 200 217 "https://host.evindrake.net/dashboard" "Mozilla/5.0 (X11; Ubuntu; Linux x86_64; rv:145.0) Gecko/20100101 Firefox/145.0"
172.23.0.4 - - [13/Nov/2025:18:53:27 +0000] "GET /api/system/stats HTTP/1.1" 200 217 "https://host.evindrake.net/dashboard" "Mozilla/5.0 (X11; Ubuntu; Linux x86_64; rv:145.0) Gecko/20100101 Firefox/145.0"
172.23.0.4 - - [13/Nov/2025:18:53:29 +0000] "GET /api/containers HTTP/1.1" 200 1534 "https://host.evindrake.net/containers" "Mozilla/5.0 (X11; Ubuntu; Linux x86_64; rv:145.0) Gecko/20100101 Firefox/145.0"
172.23.0.4 - - [13/Nov/2025:18:53:30 +0000] "GET /api/system/stats HTTP/1.1" 200 217 "https://host.evindrake.net/dashboard" "Mozilla/5.0 (X11; Ubuntu; Linux x86_64; rv:145.0) Gecko/20100101 Firefox/145.0"
172.23.0.4 - - [13/Nov/2025:18:53:33 +0000] "GET /api/system/stats HTTP/1.1" 200 217 "https://host.evindrake.net/dashboard" "Mozilla/5.0 (X11; Ubuntu; Linux x86_64; rv:145.0) Gecko/20100101 Firefox/145.0"
172.23.0.4 - - [13/Nov/2025:18:53:36 +0000] "GET /api/system/stats HTTP/1.1" 200 217 "https://host.evindrake.net/dashboard" "Mozilla/5.0 (X11; Ubuntu; Linux x86_64; rv:145.0) Gecko/20100101 Firefox/145.0"
172.23.0.4 - - [13/Nov/2025:18:53:39 +0000] "GET /api/system/stats HTTP/1.1" 200 217 "https://host.evindrake.net/dashboard" "Mozilla/5.0 (X11; Ubuntu; Linux x86_64; rv:145.0) Gecko/20100101 Firefox/145.0"
172.23.0.4 - - [13/Nov/2025:18:53:42 +0000] "GET /api/system/stats HTTP/1.1" 200 217 "https://host.evindrake.net/dashboard" "Mozilla/5.0 (X11; Ubuntu; Linux x86_64; rv:145.0) Gecko/20100101 Firefox/145.0"
172.23.0.4 - - [13/Nov/2025:18:53:45 +0000] "GET /api/containers HTTP/1.1" 200 1534 "https://host.evindrake.net/containers" "Mozilla/5.0 (X11; Ubuntu; Linux x86_64; rv:145.0) Gecko/20100101 Firefox/145.0"
172.23.0.4 - - [13/Nov/2025:18:53:45 +0000] "GET /api/system/stats HTTP/1.1" 200 217 "https://host.evindrake.net/dashboard" "Mozilla/5.0 (X11; Ubuntu; Linux x86_64; rv:145.0) Gecko/20100101 Firefox/145.0"
172.23.0.4 - - [13/Nov/2025:18:53:48 +0000] "GET /api/system/stats HTTP/1.1" 200 217 "https://host.evindrake.net/dashboard" "Mozilla/5.0 (X11; Ubuntu; Linux x86_64; rv:145.0) Gecko/20100101 Firefox/145.0"
172.23.0.4 - - [13/Nov/2025:18:53:51 +0000] "GET /api/system/stats HTTP/1.1" 200 217 "https://host.evindrake.net/dashboard" "Mozilla/5.0 (X11; Ubuntu; Linux x86_64; rv:145.0) Gecko/20100101 Firefox/145.0"
172.23.0.4 - - [13/Nov/2025:18:53:51 +0000] "GET /api/system/disk HTTP/1.1" 200 1063 "https://host.evindrake.net/dashboard" "Mozilla/5.0 (X11; Ubuntu; Linux x86_64; rv:145.0) Gecko/20100101 Firefox/145.0"
172.23.0.4 - - [13/Nov/2025:18:53:54 +0000] "GET /api/system/stats HTTP/1.1" 200 217 "https://host.evindrake.net/dashboard" "Mozilla/5.0 (X11; Ubuntu; Linux x86_64; rv:145.0) Gecko/20100101 Firefox/145.0"
172.23.0.4 - - [13/Nov/2025:18:53:57 +0000] "GET /api/system/stats HTTP/1.1" 200 217 "https://host.evindrake.net/dashboard" "Mozilla/5.0 (X11; Ubuntu; Linux x86_64; rv:145.0) Gecko/20100101 Firefox/145.0"
172.23.0.4 - - [13/Nov/2025:18:54:00 +0000] "GET /api/containers HTTP/1.1" 200 1534 "https://host.evindrake.net/containers" "Mozilla/5.0 (X11; Ubuntu; Linux x86_64; rv:145.0) Gecko/20100101 Firefox/145.0"
172.23.0.4 - - [13/Nov/2025:18:54:00 +0000] "GET /api/system/stats HTTP/1.1" 200 217 "https://host.evindrake.net/dashboard" "Mozilla/5.0 (X11; Ubuntu; Linux x86_64; rv:145.0) Gecko/20100101 Firefox/145.0"
172.23.0.4 - - [13/Nov/2025:18:54:03 +0000] "GET /api/system/stats HTTP/1.1" 200 217 "https://host.evindrake.net/dashboard" "Mozilla/5.0 (X11; Ubuntu; Linux x86_64; rv:145.0) Gecko/20100101 Firefox/145.0"
172.23.0.4 - - [13/Nov/2025:18:54:06 +0000] "GET /api/system/stats HTTP/1.1" 200 217 "https://host.evindrake.net/dashboard" "Mozilla/5.0 (X11; Ubuntu; Linux x86_64; rv:145.0) Gecko/20100101 Firefox/145.0"
172.23.0.4 - - [13/Nov/2025:18:54:09 +0000] "GET /api/system/stats HTTP/1.1" 200 217 "https://host.evindrake.net/dashboard" "Mozilla/5.0 (X11; Ubuntu; Linux x86_64; rv:145.0) Gecko/20100101 Firefox/145.0"
172.23.0.4 - - [13/Nov/2025:18:54:12 +0000] "GET /api/system/stats HTTP/1.1" 200 217 "https://host.evindrake.net/dashboard" "Mozilla/5.0 (X11; Ubuntu; Linux x86_64; rv:145.0) Gecko/20100101 Firefox/145.0"
172.23.0.4 - - [13/Nov/2025:18:54:15 +0000] "GET /api/containers HTTP/1.1" 200 1534 "https://host.evindrake.net/containers" "Mozilla/5.0 (X11; Ubuntu; Linux x86_64; rv:145.0) Gecko/20100101 Firefox/145.0"
172.23.0.4 - - [13/Nov/2025:18:54:15 +0000] "GET /api/system/stats HTTP/1.1" 200 217 "https://host.evindrake.net/dashboard" "Mozilla/5.0 (X11; Ubuntu; Linux x86_64; rv:145.0) Gecko/20100101 Firefox/145.0"
172.23.0.4 - - [13/Nov/2025:18:54:18 +0000] "GET /api/system/stats HTTP/1.1" 200 217 "https://host.evindrake.net/dashboard" "Mozilla/5.0 (X11; Ubuntu; Linux x86_64; rv:145.0) Gecko/20100101 Firefox/145.0"
172.23.0.4 - - [13/Nov/2025:18:54:21 +0000] "GET /api/system/stats HTTP/1.1" 200 217 "https://host.evindrake.net/dashboard" "Mozilla/5.0 (X11; Ubuntu; Linux x86_64; rv:145.0) Gecko/20100101 Firefox/145.0"
172.23.0.4 - - [13/Nov/2025:18:54:21 +0000] "GET /api/system/disk HTTP/1.1" 200 1063 "https://host.evindrake.net/dashboard" "Mozilla/5.0 (X11; Ubuntu; Linux x86_64; rv:145.0) Gecko/20100101 Firefox/145.0"
172.23.0.4 - - [13/Nov/2025:18:54:24 +0000] "GET /api/system/stats HTTP/1.1" 200 217 "https://host.evindrake.net/dashboard" "Mozilla/5.0 (X11; Ubuntu; Linux x86_64; rv:145.0) Gecko/20100101 Firefox/145.0"
172.23.0.4 - - [13/Nov/2025:18:54:27 +0000] "GET /api/system/stats HTTP/1.1" 200 217 "https://host.evindrake.net/dashboard" "Mozilla/5.0 (X11; Ubuntu; Linux x86_64; rv:145.0) Gecko/20100101 Firefox/145.0"
172.23.0.4 - - [13/Nov/2025:18:54:30 +0000] "GET /api/containers HTTP/1.1" 200 1534 "https://host.evindrake.net/containers" "Mozilla/5.0 (X11; Ubuntu; Linux x86_64; rv:145.0) Gecko/20100101 Firefox/145.0"
172.23.0.4 - - [13/Nov/2025:18:54:30 +0000] "GET /api/system/stats HTTP/1.1" 200 217 "https://host.evindrake.net/dashboard" "Mozilla/5.0 (X11; Ubuntu; Linux x86_64; rv:145.0) Gecko/20100101 Firefox/145.0"
172.23.0.4 - - [13/Nov/2025:18:54:33 +0000] "GET /api/system/stats HTTP/1.1" 200 217 "https://host.evindrake.net/dashboard" "Mozilla/5.0 (X11; Ubuntu; Linux x86_64; rv:145.0) Gecko/20100101 Firefox/145.0"
172.23.0.4 - - [13/Nov/2025:18:54:36 +0000] "GET /api/system/stats HTTP/1.1" 200 217 "https://host.evindrake.net/dashboard" "Mozilla/5.0 (X11; Ubuntu; Linux x86_64; rv:145.0) Gecko/20100101 Firefox/145.0"
172.23.0.4 - - [13/Nov/2025:18:54:39 +0000] "GET /api/system/stats HTTP/1.1" 200 217 "https://host.evindrake.net/dashboard" "Mozilla/5.0 (X11; Ubuntu; Linux x86_64; rv:145.0) Gecko/20100101 Firefox/145.0"
172.23.0.4 - - [13/Nov/2025:18:54:42 +0000] "GET /api/system/stats HTTP/1.1" 200 217 "https://host.evindrake.net/dashboard" "Mozilla/5.0 (X11; Ubuntu; Linux x86_64; rv:145.0) Gecko/20100101 Firefox/145.0"
172.23.0.4 - - [13/Nov/2025:18:54:45 +0000] "GET /api/containers HTTP/1.1" 200 1534 "https://host.evindrake.net/containers" "Mozilla/5.0 (X11; Ubuntu; Linux x86_64; rv:145.0) Gecko/20100101 Firefox/145.0"
172.23.0.4 - - [13/Nov/2025:18:54:45 +0000] "GET /api/system/stats HTTP/1.1" 200 217 "https://host.evindrake.net/dashboard" "Mozilla/5.0 (X11; Ubuntu; Linux x86_64; rv:145.0) Gecko/20100101 Firefox/145.0"
172.23.0.4 - - [13/Nov/2025:18:54:48 +0000] "GET /api/system/stats HTTP/1.1" 200 217 "https://host.evindrake.net/dashboard" "Mozilla/5.0 (X11; Ubuntu; Linux x86_64; rv:145.0) Gecko/20100101 Firefox/145.0"
172.23.0.4 - - [13/Nov/2025:18:54:51 +0000] "GET /api/system/stats HTTP/1.1" 200 217 "https://host.evindrake.net/dashboard" "Mozilla/5.0 (X11; Ubuntu; Linux x86_64; rv:145.0) Gecko/20100101 Firefox/145.0"
172.23.0.4 - - [13/Nov/2025:18:54:51 +0000] "GET /api/system/disk HTTP/1.1" 200 1063 "https://host.evindrake.net/dashboard" "Mozilla/5.0 (X11; Ubuntu; Linux x86_64; rv:145.0) Gecko/20100101 Firefox/145.0"
172.23.0.4 - - [13/Nov/2025:18:54:54 +0000] "GET /api/system/stats HTTP/1.1" 200 217 "https://host.evindrake.net/dashboard" "Mozilla/5.0 (X11; Ubuntu; Linux x86_64; rv:145.0) Gecko/20100101 Firefox/145.0"
172.23.0.4 - - [13/Nov/2025:18:54:57 +0000] "GET /api/system/stats HTTP/1.1" 200 217 "https://host.evindrake.net/dashboard" "Mozilla/5.0 (X11; Ubuntu; Linux x86_64; rv:145.0) Gecko/20100101 Firefox/145.0"
172.23.0.4 - - [13/Nov/2025:18:55:00 +0000] "GET /api/containers HTTP/1.1" 200 1534 "https://host.evindrake.net/containers" "Mozilla/5.0 (X11; Ubuntu; Linux x86_64; rv:145.0) Gecko/20100101 Firefox/145.0"
172.23.0.4 - - [13/Nov/2025:18:55:00 +0000] "GET /api/system/stats HTTP/1.1" 200 217 "https://host.evindrake.net/dashboard" "Mozilla/5.0 (X11; Ubuntu; Linux x86_64; rv:145.0) Gecko/20100101 Firefox/145.0"
172.23.0.4 - - [13/Nov/2025:18:55:03 +0000] "GET /api/system/stats HTTP/1.1" 200 217 "https://host.evindrake.net/dashboard" "Mozilla/5.0 (X11; Ubuntu; Linux x86_64; rv:145.0) Gecko/20100101 Firefox/145.0"
172.23.0.4 - - [13/Nov/2025:18:55:06 +0000] "GET /api/system/stats HTTP/1.1" 200 217 "https://host.evindrake.net/dashboard" "Mozilla/5.0 (X11; Ubuntu; Linux x86_64; rv:145.0) Gecko/20100101 Firefox/145.0"
172.23.0.4 - - [13/Nov/2025:18:55:09 +0000] "GET /api/system/stats HTTP/1.1" 200 217 "https://host.evindrake.net/dashboard" "Mozilla/5.0 (X11; Ubuntu; Linux x86_64; rv:145.0) Gecko/20100101 Firefox/145.0"
172.23.0.4 - - [13/Nov/2025:18:55:12 +0000] "GET /api/system/stats HTTP/1.1" 200 217 "https://host.evindrake.net/dashboard" "Mozilla/5.0 (X11; Ubuntu; Linux x86_64; rv:145.0) Gecko/20100101 Firefox/145.0"
172.23.0.4 - - [13/Nov/2025:18:55:15 +0000] "GET /api/containers HTTP/1.1" 200 1534 "https://host.evindrake.net/containers" "Mozilla/5.0 (X11; Ubuntu; Linux x86_64; rv:145.0) Gecko/20100101 Firefox/145.0"
172.23.0.4 - - [13/Nov/2025:18:55:15 +0000] "GET /api/system/stats HTTP/1.1" 200 217 "https://host.evindrake.net/dashboard" "Mozilla/5.0 (X11; Ubuntu; Linux x86_64; rv:145.0) Gecko/20100101 Firefox/145.0"
172.23.0.4 - - [13/Nov/2025:18:55:18 +0000] "GET /api/system/stats HTTP/1.1" 200 217 "https://host.evindrake.net/dashboard" "Mozilla/5.0 (X11; Ubuntu; Linux x86_64; rv:145.0) Gecko/20100101 Firefox/145.0"
172.23.0.4 - - [13/Nov/2025:18:55:21 +0000] "GET /api/system/stats HTTP/1.1" 200 217 "https://host.evindrake.net/dashboard" "Mozilla/5.0 (X11; Ubuntu; Linux x86_64; rv:145.0) Gecko/20100101 Firefox/145.0"
172.23.0.4 - - [13/Nov/2025:18:55:21 +0000] "GET /api/system/disk HTTP/1.1" 200 1063 "https://host.evindrake.net/dashboard" "Mozilla/5.0 (X11; Ubuntu; Linux x86_64; rv:145.0) Gecko/20100101 Firefox/145.0"
172.23.0.4 - - [13/Nov/2025:18:55:24 +0000] "GET /api/system/stats HTTP/1.1" 200 217 "https://host.evindrake.net/dashboard" "Mozilla/5.0 (X11; Ubuntu; Linux x86_64; rv:145.0) Gecko/20100101 Firefox/145.0"
172.23.0.4 - - [13/Nov/2025:18:55:27 +0000] "GET /api/system/stats HTTP/1.1" 200 217 "https://host.evindrake.net/dashboard" "Mozilla/5.0 (X11; Ubuntu; Linux x86_64; rv:145.0) Gecko/20100101 Firefox/145.0"
172.23.0.4 - - [13/Nov/2025:18:55:30 +0000] "GET /api/containers HTTP/1.1" 200 1534 "https://host.evindrake.net/containers" "Mozilla/5.0 (X11; Ubuntu; Linux x86_64; rv:145.0) Gecko/20100101 Firefox/145.0"
172.23.0.4 - - [13/Nov/2025:18:55:30 +0000] "GET /api/system/stats HTTP/1.1" 200 217 "https://host.evindrake.net/dashboard" "Mozilla/5.0 (X11; Ubuntu; Linux x86_64; rv:145.0) Gecko/20100101 Firefox/145.0"
172.23.0.4 - - [13/Nov/2025:18:55:33 +0000] "GET /api/system/stats HTTP/1.1" 200 216 "https://host.evindrake.net/dashboard" "Mozilla/5.0 (X11; Ubuntu; Linux x86_64; rv:145.0) Gecko/20100101 Firefox/145.0"
172.23.0.4 - - [13/Nov/2025:18:55:36 +0000] "GET /api/system/stats HTTP/1.1" 200 216 "https://host.evindrake.net/dashboard" "Mozilla/5.0 (X11; Ubuntu; Linux x86_64; rv:145.0) Gecko/20100101 Firefox/145.0"
172.23.0.4 - - [13/Nov/2025:18:55:40 +0000] "GET /api/system/stats HTTP/1.1" 200 216 "https://host.evindrake.net/dashboard" "Mozilla/5.0 (X11; Ubuntu; Linux x86_64; rv:145.0) Gecko/20100101 Firefox/145.0"
172.23.0.4 - - [13/Nov/2025:18:55:43 +0000] "GET /api/system/stats HTTP/1.1" 200 216 "https://host.evindrake.net/dashboard" "Mozilla/5.0 (X11; Ubuntu; Linux x86_64; rv:145.0) Gecko/20100101 Firefox/145.0"
172.23.0.4 - - [13/Nov/2025:18:55:45 +0000] "GET /api/containers HTTP/1.1" 200 1534 "https://host.evindrake.net/containers" "Mozilla/5.0 (X11; Ubuntu; Linux x86_64; rv:145.0) Gecko/20100101 Firefox/145.0"
172.23.0.4 - - [13/Nov/2025:18:55:46 +0000] "GET /api/system/stats HTTP/1.1" 200 216 "https://host.evindrake.net/dashboard" "Mozilla/5.0 (X11; Ubuntu; Linux x86_64; rv:145.0) Gecko/20100101 Firefox/145.0"
172.23.0.4 - - [13/Nov/2025:18:55:49 +0000] "GET /api/system/stats HTTP/1.1" 200 215 "https://host.evindrake.net/dashboard" "Mozilla/5.0 (X11; Ubuntu; Linux x86_64; rv:145.0) Gecko/20100101 Firefox/145.0"
172.23.0.4 - - [13/Nov/2025:18:55:52 +0000] "GET /api/system/stats HTTP/1.1" 200 215 "https://host.evindrake.net/dashboard" "Mozilla/5.0 (X11; Ubuntu; Linux x86_64; rv:145.0) Gecko/20100101 Firefox/145.0"
172.23.0.4 - - [13/Nov/2025:18:55:52 +0000] "GET /api/system/disk HTTP/1.1" 200 1063 "https://host.evindrake.net/dashboard" "Mozilla/5.0 (X11; Ubuntu; Linux x86_64; rv:145.0) Gecko/20100101 Firefox/145.0"
172.23.0.4 - - [13/Nov/2025:18:55:55 +0000] "GET /api/system/stats HTTP/1.1" 200 216 "https://host.evindrake.net/dashboard" "Mozilla/5.0 (X11; Ubuntu; Linux x86_64; rv:145.0) Gecko/20100101 Firefox/145.0"
172.23.0.4 - - [13/Nov/2025:18:55:58 +0000] "GET /api/system/stats HTTP/1.1" 200 216 "https://host.evindrake.net/dashboard" "Mozilla/5.0 (X11; Ubuntu; Linux x86_64; rv:145.0) Gecko/20100101 Firefox/145.0"
172.23.0.4 - - [13/Nov/2025:18:56:00 +0000] "GET /api/containers HTTP/1.1" 200 1534 "https://host.evindrake.net/containers" "Mozilla/5.0 (X11; Ubuntu; Linux x86_64; rv:145.0) Gecko/20100101 Firefox/145.0"
172.23.0.4 - - [13/Nov/2025:18:56:01 +0000] "GET /api/system/stats HTTP/1.1" 200 216 "https://host.evindrake.net/dashboard" "Mozilla/5.0 (X11; Ubuntu; Linux x86_64; rv:145.0) Gecko/20100101 Firefox/145.0"
172.23.0.4 - - [13/Nov/2025:18:56:04 +0000] "GET /api/system/stats HTTP/1.1" 200 216 "https://host.evindrake.net/dashboard" "Mozilla/5.0 (X11; Ubuntu; Linux x86_64; rv:145.0) Gecko/20100101 Firefox/145.0"
172.23.0.4 - - [13/Nov/2025:18:56:07 +0000] "GET /api/system/stats HTTP/1.1" 200 217 "https://host.evindrake.net/dashboard" "Mozilla/5.0 (X11; Ubuntu; Linux x86_64; rv:145.0) Gecko/20100101 Firefox/145.0"
172.23.0.4 - - [13/Nov/2025:18:56:10 +0000] "GET /api/system/stats HTTP/1.1" 200 217 "https://host.evindrake.net/dashboard" "Mozilla/5.0 (X11; Ubuntu; Linux x86_64; rv:145.0) Gecko/20100101 Firefox/145.0"
172.23.0.4 - - [13/Nov/2025:18:56:13 +0000] "GET /api/system/stats HTTP/1.1" 200 217 "https://host.evindrake.net/dashboard" "Mozilla/5.0 (X11; Ubuntu; Linux x86_64; rv:145.0) Gecko/20100101 Firefox/145.0"
172.23.0.4 - - [13/Nov/2025:18:56:15 +0000] "GET /api/containers HTTP/1.1" 200 1534 "https://host.evindrake.net/containers" "Mozilla/5.0 (X11; Ubuntu; Linux x86_64; rv:145.0) Gecko/20100101 Firefox/145.0"
172.23.0.4 - - [13/Nov/2025:18:56:16 +0000] "GET /api/system/stats HTTP/1.1" 200 217 "https://host.evindrake.net/dashboard" "Mozilla/5.0 (X11; Ubuntu; Linux x86_64; rv:145.0) Gecko/20100101 Firefox/145.0"
172.23.0.4 - - [13/Nov/2025:18:56:19 +0000] "GET /api/system/stats HTTP/1.1" 200 217 "https://host.evindrake.net/dashboard" "Mozilla/5.0 (X11; Ubuntu; Linux x86_64; rv:145.0) Gecko/20100101 Firefox/145.0"
172.23.0.4 - - [13/Nov/2025:18:56:22 +0000] "GET /api/system/stats HTTP/1.1" 200 217 "https://host.evindrake.net/dashboard" "Mozilla/5.0 (X11; Ubuntu; Linux x86_64; rv:145.0) Gecko/20100101 Firefox/145.0"
172.23.0.4 - - [13/Nov/2025:18:56:22 +0000] "GET /api/system/disk HTTP/1.1" 200 1063 "https://host.evindrake.net/dashboard" "Mozilla/5.0 (X11; Ubuntu; Linux x86_64; rv:145.0) Gecko/20100101 Firefox/145.0"
172.23.0.4 - - [13/Nov/2025:18:56:25 +0000] "GET /api/system/stats HTTP/1.1" 200 217 "https://host.evindrake.net/dashboard" "Mozilla/5.0 (X11; Ubuntu; Linux x86_64; rv:145.0) Gecko/20100101 Firefox/145.0"
172.23.0.4 - - [13/Nov/2025:18:56:28 +0000] "GET /api/system/stats HTTP/1.1" 200 217 "https://host.evindrake.net/dashboard" "Mozilla/5.0 (X11; Ubuntu; Linux x86_64; rv:145.0) Gecko/20100101 Firefox/145.0"
172.23.0.4 - - [13/Nov/2025:18:56:30 +0000] "GET /api/containers HTTP/1.1" 200 1534 "https://host.evindrake.net/containers" "Mozilla/5.0 (X11; Ubuntu; Linux x86_64; rv:145.0) Gecko/20100101 Firefox/145.0"
172.23.0.4 - - [13/Nov/2025:18:56:31 +0000] "GET /api/system/stats HTTP/1.1" 200 217 "https://host.evindrake.net/dashboard" "Mozilla/5.0 (X11; Ubuntu; Linux x86_64; rv:145.0) Gecko/20100101 Firefox/145.0"
172.23.0.4 - - [13/Nov/2025:18:56:34 +0000] "GET /api/system/stats HTTP/1.1" 200 217 "https://host.evindrake.net/dashboard" "Mozilla/5.0 (X11; Ubuntu; Linux x86_64; rv:145.0) Gecko/20100101 Firefox/145.0"
172.23.0.4 - - [13/Nov/2025:18:56:37 +0000] "GET /api/system/stats HTTP/1.1" 200 217 "https://host.evindrake.net/dashboard" "Mozilla/5.0 (X11; Ubuntu; Linux x86_64; rv:145.0) Gecko/20100101 Firefox/145.0"
172.23.0.4 - - [13/Nov/2025:18:56:40 +0000] "GET /api/system/stats HTTP/1.1" 200 217 "https://host.evindrake.net/dashboard" "Mozilla/5.0 (X11; Ubuntu; Linux x86_64; rv:145.0) Gecko/20100101 Firefox/145.0"
172.23.0.4 - - [13/Nov/2025:18:56:43 +0000] "GET /api/system/stats HTTP/1.1" 200 217 "https://host.evindrake.net/dashboard" "Mozilla/5.0 (X11; Ubuntu; Linux x86_64; rv:145.0) Gecko/20100101 Firefox/145.0"
172.23.0.4 - - [13/Nov/2025:18:56:45 +0000] "GET /api/containers HTTP/1.1" 200 1534 "https://host.evindrake.net/containers" "Mozilla/5.0 (X11; Ubuntu; Linux x86_64; rv:145.0) Gecko/20100101 Firefox/145.0"
172.23.0.4 - - [13/Nov/2025:18:56:46 +0000] "GET /api/system/stats HTTP/1.1" 200 217 "https://host.evindrake.net/dashboard" "Mozilla/5.0 (X11; Ubuntu; Linux x86_64; rv:145.0) Gecko/20100101 Firefox/145.0"
172.23.0.4 - - [13/Nov/2025:18:56:49 +0000] "GET /api/system/stats HTTP/1.1" 200 217 "https://host.evindrake.net/dashboard" "Mozilla/5.0 (X11; Ubuntu; Linux x86_64; rv:145.0) Gecko/20100101 Firefox/145.0"
172.23.0.4 - - [13/Nov/2025:18:56:52 +0000] "GET /api/system/stats HTTP/1.1" 200 217 "https://host.evindrake.net/dashboard" "Mozilla/5.0 (X11; Ubuntu; Linux x86_64; rv:145.0) Gecko/20100101 Firefox/145.0"
172.23.0.4 - - [13/Nov/2025:18:56:52 +0000] "GET /api/system/disk HTTP/1.1" 200 1063 "https://host.evindrake.net/dashboard" "Mozilla/5.0 (X11; Ubuntu; Linux x86_64; rv:145.0) Gecko/20100101 Firefox/145.0"
172.23.0.4 - - [13/Nov/2025:18:56:55 +0000] "GET /api/system/stats HTTP/1.1" 200 217 "https://host.evindrake.net/dashboard" "Mozilla/5.0 (X11; Ubuntu; Linux x86_64; rv:145.0) Gecko/20100101 Firefox/145.0"
172.23.0.4 - - [13/Nov/2025:18:56:58 +0000] "GET /api/system/stats HTTP/1.1" 200 217 "https://host.evindrake.net/dashboard" "Mozilla/5.0 (X11; Ubuntu; Linux x86_64; rv:145.0) Gecko/20100101 Firefox/145.0"
172.23.0.4 - - [13/Nov/2025:18:57:00 +0000] "GET /api/containers HTTP/1.1" 200 1534 "https://host.evindrake.net/containers" "Mozilla/5.0 (X11; Ubuntu; Linux x86_64; rv:145.0) Gecko/20100101 Firefox/145.0"
172.23.0.4 - - [13/Nov/2025:18:57:01 +0000] "GET /api/system/stats HTTP/1.1" 200 217 "https://host.evindrake.net/dashboard" "Mozilla/5.0 (X11; Ubuntu; Linux x86_64; rv:145.0) Gecko/20100101 Firefox/145.0"
172.23.0.4 - - [13/Nov/2025:18:57:04 +0000] "GET /api/system/stats HTTP/1.1" 200 217 "https://host.evindrake.net/dashboard" "Mozilla/5.0 (X11; Ubuntu; Linux x86_64; rv:145.0) Gecko/20100101 Firefox/145.0"
172.23.0.4 - - [13/Nov/2025:18:57:07 +0000] "GET /api/system/stats HTTP/1.1" 200 217 "https://host.evindrake.net/dashboard" "Mozilla/5.0 (X11; Ubuntu; Linux x86_64; rv:145.0) Gecko/20100101 Firefox/145.0"
172.23.0.4 - - [13/Nov/2025:18:57:10 +0000] "GET /api/system/stats HTTP/1.1" 200 217 "https://host.evindrake.net/dashboard" "Mozilla/5.0 (X11; Ubuntu; Linux x86_64; rv:145.0) Gecko/20100101 Firefox/145.0"
172.23.0.4 - - [13/Nov/2025:18:57:13 +0000] "GET /api/system/stats HTTP/1.1" 200 217 "https://host.evindrake.net/dashboard" "Mozilla/5.0 (X11; Ubuntu; Linux x86_64; rv:145.0) Gecko/20100101 Firefox/145.0"
172.23.0.4 - - [13/Nov/2025:18:57:15 +0000] "GET /api/containers HTTP/1.1" 200 1534 "https://host.evindrake.net/containers" "Mozilla/5.0 (X11; Ubuntu; Linux x86_64; rv:145.0) Gecko/20100101 Firefox/145.0"
172.23.0.4 - - [13/Nov/2025:18:57:16 +0000] "GET /api/system/stats HTTP/1.1" 200 217 "https://host.evindrake.net/dashboard" "Mozilla/5.0 (X11; Ubuntu; Linux x86_64; rv:145.0) Gecko/20100101 Firefox/145.0"
172.23.0.4 - - [13/Nov/2025:18:57:19 +0000] "GET /api/system/stats HTTP/1.1" 200 217 "https://host.evindrake.net/dashboard" "Mozilla/5.0 (X11; Ubuntu; Linux x86_64; rv:145.0) Gecko/20100101 Firefox/145.0"
172.23.0.4 - - [13/Nov/2025:18:57:22 +0000] "GET /api/system/stats HTTP/1.1" 200 217 "https://host.evindrake.net/dashboard" "Mozilla/5.0 (X11; Ubuntu; Linux x86_64; rv:145.0) Gecko/20100101 Firefox/145.0"
172.23.0.4 - - [13/Nov/2025:18:57:22 +0000] "GET /api/system/disk HTTP/1.1" 200 1063 "https://host.evindrake.net/dashboard" "Mozilla/5.0 (X11; Ubuntu; Linux x86_64; rv:145.0) Gecko/20100101 Firefox/145.0"
172.23.0.4 - - [13/Nov/2025:18:57:25 +0000] "GET /api/system/stats HTTP/1.1" 200 217 "https://host.evindrake.net/dashboard" "Mozilla/5.0 (X11; Ubuntu; Linux x86_64; rv:145.0) Gecko/20100101 Firefox/145.0"
172.23.0.4 - - [13/Nov/2025:18:57:28 +0000] "GET /api/system/stats HTTP/1.1" 200 217 "https://host.evindrake.net/dashboard" "Mozilla/5.0 (X11; Ubuntu; Linux x86_64; rv:145.0) Gecko/20100101 Firefox/145.0"
172.23.0.4 - - [13/Nov/2025:18:57:30 +0000] "GET /api/containers HTTP/1.1" 200 1534 "https://host.evindrake.net/containers" "Mozilla/5.0 (X11; Ubuntu; Linux x86_64; rv:145.0) Gecko/20100101 Firefox/145.0"
172.23.0.4 - - [13/Nov/2025:18:57:31 +0000] "GET /api/system/stats HTTP/1.1" 200 217 "https://host.evindrake.net/dashboard" "Mozilla/5.0 (X11; Ubuntu; Linux x86_64; rv:145.0) Gecko/20100101 Firefox/145.0"
172.23.0.4 - - [13/Nov/2025:18:57:34 +0000] "GET /api/system/stats HTTP/1.1" 200 217 "https://host.evindrake.net/dashboard" "Mozilla/5.0 (X11; Ubuntu; Linux x86_64; rv:145.0) Gecko/20100101 Firefox/145.0"
172.23.0.4 - - [13/Nov/2025:18:57:37 +0000] "GET /api/system/stats HTTP/1.1" 200 217 "https://host.evindrake.net/dashboard" "Mozilla/5.0 (X11; Ubuntu; Linux x86_64; rv:145.0) Gecko/20100101 Firefox/145.0"
172.23.0.4 - - [13/Nov/2025:18:57:40 +0000] "GET /api/system/stats HTTP/1.1" 200 217 "https://host.evindrake.net/dashboard" "Mozilla/5.0 (X11; Ubuntu; Linux x86_64; rv:145.0) Gecko/20100101 Firefox/145.0"
172.23.0.4 - - [13/Nov/2025:18:57:43 +0000] "GET /api/system/stats HTTP/1.1" 200 217 "https://host.evindrake.net/dashboard" "Mozilla/5.0 (X11; Ubuntu; Linux x86_64; rv:145.0) Gecko/20100101 Firefox/145.0"
172.23.0.4 - - [13/Nov/2025:18:57:45 +0000] "GET /api/containers HTTP/1.1" 200 1534 "https://host.evindrake.net/containers" "Mozilla/5.0 (X11; Ubuntu; Linux x86_64; rv:145.0) Gecko/20100101 Firefox/145.0"
172.23.0.4 - - [13/Nov/2025:18:57:46 +0000] "GET /api/system/stats HTTP/1.1" 200 217 "https://host.evindrake.net/dashboard" "Mozilla/5.0 (X11; Ubuntu; Linux x86_64; rv:145.0) Gecko/20100101 Firefox/145.0"
172.23.0.4 - - [13/Nov/2025:18:57:49 +0000] "GET /api/system/stats HTTP/1.1" 200 217 "https://host.evindrake.net/dashboard" "Mozilla/5.0 (X11; Ubuntu; Linux x86_64; rv:145.0) Gecko/20100101 Firefox/145.0"
172.23.0.4 - - [13/Nov/2025:18:57:52 +0000] "GET /api/system/stats HTTP/1.1" 200 217 "https://host.evindrake.net/dashboard" "Mozilla/5.0 (X11; Ubuntu; Linux x86_64; rv:145.0) Gecko/20100101 Firefox/145.0"
172.23.0.4 - - [13/Nov/2025:18:57:52 +0000] "GET /api/system/disk HTTP/1.1" 200 1063 "https://host.evindrake.net/dashboard" "Mozilla/5.0 (X11; Ubuntu; Linux x86_64; rv:145.0) Gecko/20100101 Firefox/145.0"
172.23.0.4 - - [13/Nov/2025:18:57:55 +0000] "GET /api/system/stats HTTP/1.1" 200 217 "https://host.evindrake.net/dashboard" "Mozilla/5.0 (X11; Ubuntu; Linux x86_64; rv:145.0) Gecko/20100101 Firefox/145.0"
172.23.0.4 - - [13/Nov/2025:18:57:58 +0000] "GET /api/system/stats HTTP/1.1" 200 217 "https://host.evindrake.net/dashboard" "Mozilla/5.0 (X11; Ubuntu; Linux x86_64; rv:145.0) Gecko/20100101 Firefox/145.0"
172.23.0.4 - - [13/Nov/2025:18:58:00 +0000] "GET /api/containers HTTP/1.1" 200 1534 "https://host.evindrake.net/containers" "Mozilla/5.0 (X11; Ubuntu; Linux x86_64; rv:145.0) Gecko/20100101 Firefox/145.0"
172.23.0.4 - - [13/Nov/2025:18:58:01 +0000] "GET /api/system/stats HTTP/1.1" 200 217 "https://host.evindrake.net/dashboard" "Mozilla/5.0 (X11; Ubuntu; Linux x86_64; rv:145.0) Gecko/20100101 Firefox/145.0"
172.23.0.4 - - [13/Nov/2025:18:58:04 +0000] "GET /api/system/stats HTTP/1.1" 200 217 "https://host.evindrake.net/dashboard" "Mozilla/5.0 (X11; Ubuntu; Linux x86_64; rv:145.0) Gecko/20100101 Firefox/145.0"
172.23.0.4 - - [13/Nov/2025:18:58:07 +0000] "GET /api/system/stats HTTP/1.1" 200 217 "https://host.evindrake.net/dashboard" "Mozilla/5.0 (X11; Ubuntu; Linux x86_64; rv:145.0) Gecko/20100101 Firefox/145.0"
172.23.0.4 - - [13/Nov/2025:18:58:10 +0000] "GET /api/system/stats HTTP/1.1" 200 217 "https://host.evindrake.net/dashboard" "Mozilla/5.0 (X11; Ubuntu; Linux x86_64; rv:145.0) Gecko/20100101 Firefox/145.0"
172.23.0.4 - - [13/Nov/2025:18:58:13 +0000] "GET /api/system/stats HTTP/1.1" 200 217 "https://host.evindrake.net/dashboard" "Mozilla/5.0 (X11; Ubuntu; Linux x86_64; rv:145.0) Gecko/20100101 Firefox/145.0"
172.23.0.4 - - [13/Nov/2025:18:58:15 +0000] "GET /api/containers HTTP/1.1" 200 1534 "https://host.evindrake.net/containers" "Mozilla/5.0 (X11; Ubuntu; Linux x86_64; rv:145.0) Gecko/20100101 Firefox/145.0"
172.23.0.4 - - [13/Nov/2025:18:58:16 +0000] "GET /api/system/stats HTTP/1.1" 200 217 "https://host.evindrake.net/dashboard" "Mozilla/5.0 (X11; Ubuntu; Linux x86_64; rv:145.0) Gecko/20100101 Firefox/145.0"
172.23.0.4 - - [13/Nov/2025:18:58:19 +0000] "GET /api/system/stats HTTP/1.1" 200 217 "https://host.evindrake.net/dashboard" "Mozilla/5.0 (X11; Ubuntu; Linux x86_64; rv:145.0) Gecko/20100101 Firefox/145.0"
172.23.0.4 - - [13/Nov/2025:18:58:22 +0000] "GET /api/system/disk HTTP/1.1" 200 1063 "https://host.evindrake.net/dashboard" "Mozilla/5.0 (X11; Ubuntu; Linux x86_64; rv:145.0) Gecko/20100101 Firefox/145.0"
172.23.0.4 - - [13/Nov/2025:18:58:22 +0000] "GET /api/system/stats HTTP/1.1" 200 217 "https://host.evindrake.net/dashboard" "Mozilla/5.0 (X11; Ubuntu; Linux x86_64; rv:145.0) Gecko/20100101 Firefox/145.0"
172.23.0.4 - - [13/Nov/2025:18:58:25 +0000] "GET /api/system/stats HTTP/1.1" 200 217 "https://host.evindrake.net/dashboard" "Mozilla/5.0 (X11; Ubuntu; Linux x86_64; rv:145.0) Gecko/20100101 Firefox/145.0"
172.23.0.4 - - [13/Nov/2025:18:58:28 +0000] "GET /api/system/stats HTTP/1.1" 200 217 "https://host.evindrake.net/dashboard" "Mozilla/5.0 (X11; Ubuntu; Linux x86_64; rv:145.0) Gecko/20100101 Firefox/145.0"
172.23.0.4 - - [13/Nov/2025:18:58:30 +0000] "GET /api/containers HTTP/1.1" 200 1534 "https://host.evindrake.net/containers" "Mozilla/5.0 (X11; Ubuntu; Linux x86_64; rv:145.0) Gecko/20100101 Firefox/145.0"
172.23.0.4 - - [13/Nov/2025:18:58:31 +0000] "GET /api/system/stats HTTP/1.1" 200 217 "https://host.evindrake.net/dashboard" "Mozilla/5.0 (X11; Ubuntu; Linux x86_64; rv:145.0) Gecko/20100101 Firefox/145.0"
172.23.0.4 - - [13/Nov/2025:18:58:34 +0000] "GET /api/system/stats HTTP/1.1" 200 217 "https://host.evindrake.net/dashboard" "Mozilla/5.0 (X11; Ubuntu; Linux x86_64; rv:145.0) Gecko/20100101 Firefox/145.0"
172.23.0.4 - - [13/Nov/2025:18:58:37 +0000] "GET /api/system/stats HTTP/1.1" 200 217 "https://host.evindrake.net/dashboard" "Mozilla/5.0 (X11; Ubuntu; Linux x86_64; rv:145.0) Gecko/20100101 Firefox/145.0"
172.23.0.4 - - [13/Nov/2025:18:58:40 +0000] "GET /api/system/stats HTTP/1.1" 200 217 "https://host.evindrake.net/dashboard" "Mozilla/5.0 (X11; Ubuntu; Linux x86_64; rv:145.0) Gecko/20100101 Firefox/145.0"
172.23.0.4 - - [13/Nov/2025:18:58:43 +0000] "GET /api/system/stats HTTP/1.1" 200 217 "https://host.evindrake.net/dashboard" "Mozilla/5.0 (X11; Ubuntu; Linux x86_64; rv:145.0) Gecko/20100101 Firefox/145.0"
172.23.0.4 - - [13/Nov/2025:18:58:45 +0000] "GET /api/containers HTTP/1.1" 200 1534 "https://host.evindrake.net/containers" "Mozilla/5.0 (X11; Ubuntu; Linux x86_64; rv:145.0) Gecko/20100101 Firefox/145.0"
172.23.0.4 - - [13/Nov/2025:18:58:46 +0000] "GET /api/system/stats HTTP/1.1" 200 216 "https://host.evindrake.net/dashboard" "Mozilla/5.0 (X11; Ubuntu; Linux x86_64; rv:145.0) Gecko/20100101 Firefox/145.0"
172.23.0.4 - - [13/Nov/2025:18:58:49 +0000] "GET /api/system/stats HTTP/1.1" 200 216 "https://host.evindrake.net/dashboard" "Mozilla/5.0 (X11; Ubuntu; Linux x86_64; rv:145.0) Gecko/20100101 Firefox/145.0"
172.23.0.4 - - [13/Nov/2025:18:58:52 +0000] "GET /api/system/stats HTTP/1.1" 200 216 "https://host.evindrake.net/dashboard" "Mozilla/5.0 (X11; Ubuntu; Linux x86_64; rv:145.0) Gecko/20100101 Firefox/145.0"
172.23.0.4 - - [13/Nov/2025:18:58:52 +0000] "GET /api/system/disk HTTP/1.1" 200 1063 "https://host.evindrake.net/dashboard" "Mozilla/5.0 (X11; Ubuntu; Linux x86_64; rv:145.0) Gecko/20100101 Firefox/145.0"
172.23.0.4 - - [13/Nov/2025:18:58:55 +0000] "GET /api/system/stats HTTP/1.1" 200 216 "https://host.evindrake.net/dashboard" "Mozilla/5.0 (X11; Ubuntu; Linux x86_64; rv:145.0) Gecko/20100101 Firefox/145.0"
172.23.0.4 - - [13/Nov/2025:18:58:58 +0000] "GET /api/system/stats HTTP/1.1" 200 216 "https://host.evindrake.net/dashboard" "Mozilla/5.0 (X11; Ubuntu; Linux x86_64; rv:145.0) Gecko/20100101 Firefox/145.0"
172.23.0.4 - - [13/Nov/2025:18:59:00 +0000] "GET /api/containers HTTP/1.1" 200 1534 "https://host.evindrake.net/containers" "Mozilla/5.0 (X11; Ubuntu; Linux x86_64; rv:145.0) Gecko/20100101 Firefox/145.0"
172.23.0.4 - - [13/Nov/2025:18:59:01 +0000] "GET /api/system/stats HTTP/1.1" 200 216 "https://host.evindrake.net/dashboard" "Mozilla/5.0 (X11; Ubuntu; Linux x86_64; rv:145.0) Gecko/20100101 Firefox/145.0"
172.23.0.4 - - [13/Nov/2025:18:59:04 +0000] "GET /api/system/stats HTTP/1.1" 200 217 "https://host.evindrake.net/dashboard" "Mozilla/5.0 (X11; Ubuntu; Linux x86_64; rv:145.0) Gecko/20100101 Firefox/145.0"
172.23.0.4 - - [13/Nov/2025:18:59:07 +0000] "GET /api/system/stats HTTP/1.1" 200 217 "https://host.evindrake.net/dashboard" "Mozilla/5.0 (X11; Ubuntu; Linux x86_64; rv:145.0) Gecko/20100101 Firefox/145.0"
172.23.0.4 - - [13/Nov/2025:18:59:10 +0000] "GET /api/system/stats HTTP/1.1" 200 217 "https://host.evindrake.net/dashboard" "Mozilla/5.0 (X11; Ubuntu; Linux x86_64; rv:145.0) Gecko/20100101 Firefox/145.0"
172.23.0.4 - - [13/Nov/2025:18:59:13 +0000] "GET /api/system/stats HTTP/1.1" 200 216 "https://host.evindrake.net/dashboard" "Mozilla/5.0 (X11; Ubuntu; Linux x86_64; rv:145.0) Gecko/20100101 Firefox/145.0"
172.23.0.4 - - [13/Nov/2025:18:59:15 +0000] "GET /api/containers HTTP/1.1" 200 1534 "https://host.evindrake.net/containers" "Mozilla/5.0 (X11; Ubuntu; Linux x86_64; rv:145.0) Gecko/20100101 Firefox/145.0"
172.23.0.4 - - [13/Nov/2025:18:59:16 +0000] "GET /api/system/stats HTTP/1.1" 200 216 "https://host.evindrake.net/dashboard" "Mozilla/5.0 (X11; Ubuntu; Linux x86_64; rv:145.0) Gecko/20100101 Firefox/145.0"
172.23.0.4 - - [13/Nov/2025:18:59:19 +0000] "GET /api/system/stats HTTP/1.1" 200 216 "https://host.evindrake.net/dashboard" "Mozilla/5.0 (X11; Ubuntu; Linux x86_64; rv:145.0) Gecko/20100101 Firefox/145.0"
172.23.0.4 - - [13/Nov/2025:18:59:22 +0000] "GET /api/system/stats HTTP/1.1" 200 216 "https://host.evindrake.net/dashboard" "Mozilla/5.0 (X11; Ubuntu; Linux x86_64; rv:145.0) Gecko/20100101 Firefox/145.0"
172.23.0.4 - - [13/Nov/2025:18:59:22 +0000] "GET /api/system/disk HTTP/1.1" 200 1063 "https://host.evindrake.net/dashboard" "Mozilla/5.0 (X11; Ubuntu; Linux x86_64; rv:145.0) Gecko/20100101 Firefox/145.0"
172.23.0.4 - - [13/Nov/2025:18:59:25 +0000] "GET /api/system/stats HTTP/1.1" 200 216 "https://host.evindrake.net/dashboard" "Mozilla/5.0 (X11; Ubuntu; Linux x86_64; rv:145.0) Gecko/20100101 Firefox/145.0"
172.23.0.4 - - [13/Nov/2025:18:59:28 +0000] "GET /api/system/stats HTTP/1.1" 200 216 "https://host.evindrake.net/dashboard" "Mozilla/5.0 (X11; Ubuntu; Linux x86_64; rv:145.0) Gecko/20100101 Firefox/145.0"
172.23.0.4 - - [13/Nov/2025:18:59:30 +0000] "GET /api/containers HTTP/1.1" 200 1534 "https://host.evindrake.net/containers" "Mozilla/5.0 (X11; Ubuntu; Linux x86_64; rv:145.0) Gecko/20100101 Firefox/145.0"
172.23.0.4 - - [13/Nov/2025:18:59:31 +0000] "GET /api/system/stats HTTP/1.1" 200 217 "https://host.evindrake.net/dashboard" "Mozilla/5.0 (X11; Ubuntu; Linux x86_64; rv:145.0) Gecko/20100101 Firefox/145.0"
172.23.0.4 - - [13/Nov/2025:18:59:34 +0000] "GET /api/system/stats HTTP/1.1" 200 217 "https://host.evindrake.net/dashboard" "Mozilla/5.0 (X11; Ubuntu; Linux x86_64; rv:145.0) Gecko/20100101 Firefox/145.0"
172.23.0.4 - - [13/Nov/2025:18:59:37 +0000] "GET /api/system/stats HTTP/1.1" 200 217 "https://host.evindrake.net/dashboard" "Mozilla/5.0 (X11; Ubuntu; Linux x86_64; rv:145.0) Gecko/20100101 Firefox/145.0"
172.23.0.4 - - [13/Nov/2025:18:59:40 +0000] "GET /api/system/stats HTTP/1.1" 200 217 "https://host.evindrake.net/dashboard" "Mozilla/5.0 (X11; Ubuntu; Linux x86_64; rv:145.0) Gecko/20100101 Firefox/145.0"
172.23.0.4 - - [13/Nov/2025:18:59:43 +0000] "GET /api/system/stats HTTP/1.1" 200 217 "https://host.evindrake.net/dashboard" "Mozilla/5.0 (X11; Ubuntu; Linux x86_64; rv:145.0) Gecko/20100101 Firefox/145.0"
172.23.0.4 - - [13/Nov/2025:18:59:45 +0000] "GET /api/containers HTTP/1.1" 200 1534 "https://host.evindrake.net/containers" "Mozilla/5.0 (X11; Ubuntu; Linux x86_64; rv:145.0) Gecko/20100101 Firefox/145.0"
172.23.0.4 - - [13/Nov/2025:18:59:46 +0000] "GET /api/system/stats HTTP/1.1" 200 217 "https://host.evindrake.net/dashboard" "Mozilla/5.0 (X11; Ubuntu; Linux x86_64; rv:145.0) Gecko/20100101 Firefox/145.0"
172.23.0.4 - - [13/Nov/2025:18:59:50 +0000] "GET /api/system/stats HTTP/1.1" 200 217 "https://host.evindrake.net/dashboard" "Mozilla/5.0 (X11; Ubuntu; Linux x86_64; rv:145.0) Gecko/20100101 Firefox/145.0"
172.23.0.4 - - [13/Nov/2025:18:59:53 +0000] "GET /api/system/stats HTTP/1.1" 200 217 "https://host.evindrake.net/dashboard" "Mozilla/5.0 (X11; Ubuntu; Linux x86_64; rv:145.0) Gecko/20100101 Firefox/145.0"
172.23.0.4 - - [13/Nov/2025:18:59:53 +0000] "GET /api/system/disk HTTP/1.1" 200 1063 "https://host.evindrake.net/dashboard" "Mozilla/5.0 (X11; Ubuntu; Linux x86_64; rv:145.0) Gecko/20100101 Firefox/145.0"
172.23.0.4 - - [13/Nov/2025:18:59:56 +0000] "GET /api/system/stats HTTP/1.1" 200 217 "https://host.evindrake.net/dashboard" "Mozilla/5.0 (X11; Ubuntu; Linux x86_64; rv:145.0) Gecko/20100101 Firefox/145.0"
172.23.0.4 - - [13/Nov/2025:18:59:59 +0000] "GET /api/system/stats HTTP/1.1" 200 217 "https://host.evindrake.net/dashboard" "Mozilla/5.0 (X11; Ubuntu; Linux x86_64; rv:145.0) Gecko/20100101 Firefox/145.0"
172.23.0.4 - - [13/Nov/2025:19:00:00 +0000] "GET /api/containers HTTP/1.1" 200 1534 "https://host.evindrake.net/containers" "Mozilla/5.0 (X11; Ubuntu; Linux x86_64; rv:145.0) Gecko/20100101 Firefox/145.0"
172.23.0.4 - - [13/Nov/2025:19:00:02 +0000] "GET /api/system/stats HTTP/1.1" 200 217 "https://host.evindrake.net/dashboard" "Mozilla/5.0 (X11; Ubuntu; Linux x86_64; rv:145.0) Gecko/20100101 Firefox/145.0"
172.23.0.4 - - [13/Nov/2025:19:00:05 +0000] "GET /api/system/stats HTTP/1.1" 200 217 "https://host.evindrake.net/dashboard" "Mozilla/5.0 (X11; Ubuntu; Linux x86_64; rv:145.0) Gecko/20100101 Firefox/145.0"
172.23.0.4 - - [13/Nov/2025:19:00:08 +0000] "GET /api/system/stats HTTP/1.1" 200 217 "https://host.evindrake.net/dashboard" "Mozilla/5.0 (X11; Ubuntu; Linux x86_64; rv:145.0) Gecko/20100101 Firefox/145.0"
172.23.0.4 - - [13/Nov/2025:19:00:11 +0000] "GET /api/system/stats HTTP/1.1" 200 217 "https://host.evindrake.net/dashboard" "Mozilla/5.0 (X11; Ubuntu; Linux x86_64; rv:145.0) Gecko/20100101 Firefox/145.0"
172.23.0.4 - - [13/Nov/2025:19:00:14 +0000] "GET /api/system/stats HTTP/1.1" 200 217 "https://host.evindrake.net/dashboard" "Mozilla/5.0 (X11; Ubuntu; Linux x86_64; rv:145.0) Gecko/20100101 Firefox/145.0"
172.23.0.4 - - [13/Nov/2025:19:00:15 +0000] "GET /api/containers HTTP/1.1" 200 1534 "https://host.evindrake.net/containers" "Mozilla/5.0 (X11; Ubuntu; Linux x86_64; rv:145.0) Gecko/20100101 Firefox/145.0"
172.23.0.4 - - [13/Nov/2025:19:00:17 +0000] "GET /api/system/stats HTTP/1.1" 200 217 "https://host.evindrake.net/dashboard" "Mozilla/5.0 (X11; Ubuntu; Linux x86_64; rv:145.0) Gecko/20100101 Firefox/145.0"
172.23.0.4 - - [13/Nov/2025:19:00:20 +0000] "GET /api/system/stats HTTP/1.1" 200 217 "https://host.evindrake.net/dashboard" "Mozilla/5.0 (X11; Ubuntu; Linux x86_64; rv:145.0) Gecko/20100101 Firefox/145.0"
172.23.0.4 - - [13/Nov/2025:19:00:23 +0000] "GET /api/system/stats HTTP/1.1" 200 217 "https://host.evindrake.net/dashboard" "Mozilla/5.0 (X11; Ubuntu; Linux x86_64; rv:145.0) Gecko/20100101 Firefox/145.0"
172.23.0.4 - - [13/Nov/2025:19:00:23 +0000] "GET /api/system/disk HTTP/1.1" 200 1063 "https://host.evindrake.net/dashboard" "Mozilla/5.0 (X11; Ubuntu; Linux x86_64; rv:145.0) Gecko/20100101 Firefox/145.0"
172.23.0.4 - - [13/Nov/2025:19:00:26 +0000] "GET /api/system/stats HTTP/1.1" 200 217 "https://host.evindrake.net/dashboard" "Mozilla/5.0 (X11; Ubuntu; Linux x86_64; rv:145.0) Gecko/20100101 Firefox/145.0"
172.23.0.4 - - [13/Nov/2025:19:00:29 +0000] "GET /api/system/stats HTTP/1.1" 200 217 "https://host.evindrake.net/dashboard" "Mozilla/5.0 (X11; Ubuntu; Linux x86_64; rv:145.0) Gecko/20100101 Firefox/145.0"
172.23.0.4 - - [13/Nov/2025:19:00:30 +0000] "GET /api/containers HTTP/1.1" 200 1534 "https://host.evindrake.net/containers" "Mozilla/5.0 (X11; Ubuntu; Linux x86_64; rv:145.0) Gecko/20100101 Firefox/145.0"
172.23.0.4 - - [13/Nov/2025:19:00:32 +0000] "GET /api/system/stats HTTP/1.1" 200 217 "https://host.evindrake.net/dashboard" "Mozilla/5.0 (X11; Ubuntu; Linux x86_64; rv:145.0) Gecko/20100101 Firefox/145.0"
172.23.0.4 - - [13/Nov/2025:19:00:35 +0000] "GET /api/system/stats HTTP/1.1" 200 217 "https://host.evindrake.net/dashboard" "Mozilla/5.0 (X11; Ubuntu; Linux x86_64; rv:145.0) Gecko/20100101 Firefox/145.0"
172.23.0.4 - - [13/Nov/2025:19:00:38 +0000] "GET /api/system/stats HTTP/1.1" 200 217 "https://host.evindrake.net/dashboard" "Mozilla/5.0 (X11; Ubuntu; Linux x86_64; rv:145.0) Gecko/20100101 Firefox/145.0"
172.23.0.4 - - [13/Nov/2025:19:00:41 +0000] "GET /api/system/stats HTTP/1.1" 200 217 "https://host.evindrake.net/dashboard" "Mozilla/5.0 (X11; Ubuntu; Linux x86_64; rv:145.0) Gecko/20100101 Firefox/145.0"
172.23.0.4 - - [13/Nov/2025:19:00:44 +0000] "GET /api/system/stats HTTP/1.1" 200 217 "https://host.evindrake.net/dashboard" "Mozilla/5.0 (X11; Ubuntu; Linux x86_64; rv:145.0) Gecko/20100101 Firefox/145.0"
172.23.0.4 - - [13/Nov/2025:19:00:45 +0000] "GET /api/containers HTTP/1.1" 200 1534 "https://host.evindrake.net/containers" "Mozilla/5.0 (X11; Ubuntu; Linux x86_64; rv:145.0) Gecko/20100101 Firefox/145.0"
172.23.0.4 - - [13/Nov/2025:19:00:47 +0000] "GET /api/system/stats HTTP/1.1" 200 217 "https://host.evindrake.net/dashboard" "Mozilla/5.0 (X11; Ubuntu; Linux x86_64; rv:145.0) Gecko/20100101 Firefox/145.0"
172.23.0.4 - - [13/Nov/2025:19:00:50 +0000] "GET /api/system/stats HTTP/1.1" 200 217 "https://host.evindrake.net/dashboard" "Mozilla/5.0 (X11; Ubuntu; Linux x86_64; rv:145.0) Gecko/20100101 Firefox/145.0"
172.23.0.4 - - [13/Nov/2025:19:00:53 +0000] "GET /api/system/disk HTTP/1.1" 200 1063 "https://host.evindrake.net/dashboard" "Mozilla/5.0 (X11; Ubuntu; Linux x86_64; rv:145.0) Gecko/20100101 Firefox/145.0"
172.23.0.4 - - [13/Nov/2025:19:00:53 +0000] "GET /api/system/stats HTTP/1.1" 200 217 "https://host.evindrake.net/dashboard" "Mozilla/5.0 (X11; Ubuntu; Linux x86_64; rv:145.0) Gecko/20100101 Firefox/145.0"
172.23.0.4 - - [13/Nov/2025:19:00:56 +0000] "GET /api/system/stats HTTP/1.1" 200 217 "https://host.evindrake.net/dashboard" "Mozilla/5.0 (X11; Ubuntu; Linux x86_64; rv:145.0) Gecko/20100101 Firefox/145.0"
172.23.0.4 - - [13/Nov/2025:19:00:59 +0000] "GET /api/system/stats HTTP/1.1" 200 217 "https://host.evindrake.net/dashboard" "Mozilla/5.0 (X11; Ubuntu; Linux x86_64; rv:145.0) Gecko/20100101 Firefox/145.0"
172.23.0.4 - - [13/Nov/2025:19:01:00 +0000] "GET /api/containers HTTP/1.1" 200 1534 "https://host.evindrake.net/containers" "Mozilla/5.0 (X11; Ubuntu; Linux x86_64; rv:145.0) Gecko/20100101 Firefox/145.0"
172.23.0.4 - - [13/Nov/2025:19:01:02 +0000] "GET /api/system/stats HTTP/1.1" 200 217 "https://host.evindrake.net/dashboard" "Mozilla/5.0 (X11; Ubuntu; Linux x86_64; rv:145.0) Gecko/20100101 Firefox/145.0"
172.23.0.4 - - [13/Nov/2025:19:01:05 +0000] "GET /api/system/stats HTTP/1.1" 200 217 "https://host.evindrake.net/dashboard" "Mozilla/5.0 (X11; Ubuntu; Linux x86_64; rv:145.0) Gecko/20100101 Firefox/145.0"
172.23.0.4 - - [13/Nov/2025:19:01:08 +0000] "GET /api/system/stats HTTP/1.1" 200 217 "https://host.evindrake.net/dashboard" "Mozilla/5.0 (X11; Ubuntu; Linux x86_64; rv:145.0) Gecko/20100101 Firefox/145.0"
172.23.0.4 - - [13/Nov/2025:19:01:11 +0000] "GET /api/system/stats HTTP/1.1" 200 217 "https://host.evindrake.net/dashboard" "Mozilla/5.0 (X11; Ubuntu; Linux x86_64; rv:145.0) Gecko/20100101 Firefox/145.0"
172.23.0.4 - - [13/Nov/2025:19:01:14 +0000] "GET /api/system/stats HTTP/1.1" 200 217 "https://host.evindrake.net/dashboard" "Mozilla/5.0 (X11; Ubuntu; Linux x86_64; rv:145.0) Gecko/20100101 Firefox/145.0"
172.23.0.4 - - [13/Nov/2025:19:01:15 +0000] "GET /api/containers HTTP/1.1" 200 1534 "https://host.evindrake.net/containers" "Mozilla/5.0 (X11; Ubuntu; Linux x86_64; rv:145.0) Gecko/20100101 Firefox/145.0"
172.23.0.4 - - [13/Nov/2025:19:01:17 +0000] "GET /api/system/stats HTTP/1.1" 200 217 "https://host.evindrake.net/dashboard" "Mozilla/5.0 (X11; Ubuntu; Linux x86_64; rv:145.0) Gecko/20100101 Firefox/145.0"
172.23.0.4 - - [13/Nov/2025:19:01:20 +0000] "GET /api/system/stats HTTP/1.1" 200 217 "https://host.evindrake.net/dashboard" "Mozilla/5.0 (X11; Ubuntu; Linux x86_64; rv:145.0) Gecko/20100101 Firefox/145.0"
172.23.0.4 - - [13/Nov/2025:19:01:23 +0000] "GET /api/system/disk HTTP/1.1" 200 1063 "https://host.evindrake.net/dashboard" "Mozilla/5.0 (X11; Ubuntu; Linux x86_64; rv:145.0) Gecko/20100101 Firefox/145.0"
172.23.0.4 - - [13/Nov/2025:19:01:23 +0000] "GET /api/system/stats HTTP/1.1" 200 217 "https://host.evindrake.net/dashboard" "Mozilla/5.0 (X11; Ubuntu; Linux x86_64; rv:145.0) Gecko/20100101 Firefox/145.0"
172.23.0.4 - - [13/Nov/2025:19:01:26 +0000] "GET /api/system/stats HTTP/1.1" 200 217 "https://host.evindrake.net/dashboard" "Mozilla/5.0 (X11; Ubuntu; Linux x86_64; rv:145.0) Gecko/20100101 Firefox/145.0"
172.23.0.4 - - [13/Nov/2025:19:01:29 +0000] "GET /api/system/stats HTTP/1.1" 200 217 "https://host.evindrake.net/dashboard" "Mozilla/5.0 (X11; Ubuntu; Linux x86_64; rv:145.0) Gecko/20100101 Firefox/145.0"
172.23.0.4 - - [13/Nov/2025:19:01:30 +0000] "GET /api/containers HTTP/1.1" 200 1534 "https://host.evindrake.net/containers" "Mozilla/5.0 (X11; Ubuntu; Linux x86_64; rv:145.0) Gecko/20100101 Firefox/145.0"
172.23.0.4 - - [13/Nov/2025:19:01:32 +0000] "GET /api/system/stats HTTP/1.1" 200 217 "https://host.evindrake.net/dashboard" "Mozilla/5.0 (X11; Ubuntu; Linux x86_64; rv:145.0) Gecko/20100101 Firefox/145.0"
172.23.0.4 - - [13/Nov/2025:19:01:35 +0000] "GET /api/system/stats HTTP/1.1" 200 217 "https://host.evindrake.net/dashboard" "Mozilla/5.0 (X11; Ubuntu; Linux x86_64; rv:145.0) Gecko/20100101 Firefox/145.0"
172.23.0.4 - - [13/Nov/2025:19:01:38 +0000] "GET /api/system/stats HTTP/1.1" 200 217 "https://host.evindrake.net/dashboard" "Mozilla/5.0 (X11; Ubuntu; Linux x86_64; rv:145.0) Gecko/20100101 Firefox/145.0"
172.23.0.4 - - [13/Nov/2025:19:01:41 +0000] "GET /api/system/stats HTTP/1.1" 200 217 "https://host.evindrake.net/dashboard" "Mozilla/5.0 (X11; Ubuntu; Linux x86_64; rv:145.0) Gecko/20100101 Firefox/145.0"
172.23.0.4 - - [13/Nov/2025:19:01:44 +0000] "GET /api/system/stats HTTP/1.1" 200 217 "https://host.evindrake.net/dashboard" "Mozilla/5.0 (X11; Ubuntu; Linux x86_64; rv:145.0) Gecko/20100101 Firefox/145.0"
172.23.0.4 - - [13/Nov/2025:19:01:45 +0000] "GET /api/containers HTTP/1.1" 200 1534 "https://host.evindrake.net/containers" "Mozilla/5.0 (X11; Ubuntu; Linux x86_64; rv:145.0) Gecko/20100101 Firefox/145.0"
172.23.0.4 - - [13/Nov/2025:19:01:47 +0000] "GET /api/system/stats HTTP/1.1" 200 217 "https://host.evindrake.net/dashboard" "Mozilla/5.0 (X11; Ubuntu; Linux x86_64; rv:145.0) Gecko/20100101 Firefox/145.0"
172.23.0.4 - - [13/Nov/2025:19:01:50 +0000] "GET /api/system/stats HTTP/1.1" 200 217 "https://host.evindrake.net/dashboard" "Mozilla/5.0 (X11; Ubuntu; Linux x86_64; rv:145.0) Gecko/20100101 Firefox/145.0"
172.23.0.4 - - [13/Nov/2025:19:01:53 +0000] "GET /api/system/disk HTTP/1.1" 200 1063 "https://host.evindrake.net/dashboard" "Mozilla/5.0 (X11; Ubuntu; Linux x86_64; rv:145.0) Gecko/20100101 Firefox/145.0"
172.23.0.4 - - [13/Nov/2025:19:01:53 +0000] "GET /api/system/stats HTTP/1.1" 200 217 "https://host.evindrake.net/dashboard" "Mozilla/5.0 (X11; Ubuntu; Linux x86_64; rv:145.0) Gecko/20100101 Firefox/145.0"
172.23.0.4 - - [13/Nov/2025:19:01:56 +0000] "GET /api/system/stats HTTP/1.1" 200 216 "https://host.evindrake.net/dashboard" "Mozilla/5.0 (X11; Ubuntu; Linux x86_64; rv:145.0) Gecko/20100101 Firefox/145.0"
172.23.0.4 - - [13/Nov/2025:19:01:59 +0000] "GET /api/system/stats HTTP/1.1" 200 216 "https://host.evindrake.net/dashboard" "Mozilla/5.0 (X11; Ubuntu; Linux x86_64; rv:145.0) Gecko/20100101 Firefox/145.0"
172.23.0.4 - - [13/Nov/2025:19:02:01 +0000] "GET /api/containers HTTP/1.1" 200 1534 "https://host.evindrake.net/containers" "Mozilla/5.0 (X11; Ubuntu; Linux x86_64; rv:145.0) Gecko/20100101 Firefox/145.0"
172.23.0.4 - - [13/Nov/2025:19:02:02 +0000] "GET /api/system/stats HTTP/1.1" 200 216 "https://host.evindrake.net/dashboard" "Mozilla/5.0 (X11; Ubuntu; Linux x86_64; rv:145.0) Gecko/20100101 Firefox/145.0"
172.23.0.4 - - [13/Nov/2025:19:02:05 +0000] "GET /api/system/stats HTTP/1.1" 200 216 "https://host.evindrake.net/dashboard" "Mozilla/5.0 (X11; Ubuntu; Linux x86_64; rv:145.0) Gecko/20100101 Firefox/145.0"
172.23.0.4 - - [13/Nov/2025:19:02:08 +0000] "GET /api/system/stats HTTP/1.1" 200 216 "https://host.evindrake.net/dashboard" "Mozilla/5.0 (X11; Ubuntu; Linux x86_64; rv:145.0) Gecko/20100101 Firefox/145.0"
172.23.0.4 - - [13/Nov/2025:19:02:11 +0000] "GET /api/system/stats HTTP/1.1" 200 216 "https://host.evindrake.net/dashboard" "Mozilla/5.0 (X11; Ubuntu; Linux x86_64; rv:145.0) Gecko/20100101 Firefox/145.0"
172.23.0.4 - - [13/Nov/2025:19:02:14 +0000] "GET /api/system/stats HTTP/1.1" 200 216 "https://host.evindrake.net/dashboard" "Mozilla/5.0 (X11; Ubuntu; Linux x86_64; rv:145.0) Gecko/20100101 Firefox/145.0"
172.23.0.4 - - [13/Nov/2025:19:02:16 +0000] "GET /api/containers HTTP/1.1" 200 1534 "https://host.evindrake.net/containers" "Mozilla/5.0 (X11; Ubuntu; Linux x86_64; rv:145.0) Gecko/20100101 Firefox/145.0"
172.23.0.4 - - [13/Nov/2025:19:02:17 +0000] "GET /api/system/stats HTTP/1.1" 200 217 "https://host.evindrake.net/dashboard" "Mozilla/5.0 (X11; Ubuntu; Linux x86_64; rv:145.0) Gecko/20100101 Firefox/145.0"
172.23.0.4 - - [13/Nov/2025:19:02:20 +0000] "GET /api/system/stats HTTP/1.1" 200 217 "https://host.evindrake.net/dashboard" "Mozilla/5.0 (X11; Ubuntu; Linux x86_64; rv:145.0) Gecko/20100101 Firefox/145.0"
172.23.0.4 - - [13/Nov/2025:19:02:23 +0000] "GET /api/system/stats HTTP/1.1" 200 217 "https://host.evindrake.net/dashboard" "Mozilla/5.0 (X11; Ubuntu; Linux x86_64; rv:145.0) Gecko/20100101 Firefox/145.0"
172.23.0.4 - - [13/Nov/2025:19:02:23 +0000] "GET /api/system/disk HTTP/1.1" 200 1063 "https://host.evindrake.net/dashboard" "Mozilla/5.0 (X11; Ubuntu; Linux x86_64; rv:145.0) Gecko/20100101 Firefox/145.0"
172.23.0.4 - - [13/Nov/2025:19:02:26 +0000] "GET /api/system/stats HTTP/1.1" 200 217 "https://host.evindrake.net/dashboard" "Mozilla/5.0 (X11; Ubuntu; Linux x86_64; rv:145.0) Gecko/20100101 Firefox/145.0"
172.23.0.4 - - [13/Nov/2025:19:02:29 +0000] "GET /api/system/stats HTTP/1.1" 200 217 "https://host.evindrake.net/dashboard" "Mozilla/5.0 (X11; Ubuntu; Linux x86_64; rv:145.0) Gecko/20100101 Firefox/145.0"
172.23.0.4 - - [13/Nov/2025:19:02:31 +0000] "GET /api/containers HTTP/1.1" 200 1534 "https://host.evindrake.net/containers" "Mozilla/5.0 (X11; Ubuntu; Linux x86_64; rv:145.0) Gecko/20100101 Firefox/145.0"
172.23.0.4 - - [13/Nov/2025:19:02:32 +0000] "GET /api/system/stats HTTP/1.1" 200 217 "https://host.evindrake.net/dashboard" "Mozilla/5.0 (X11; Ubuntu; Linux x86_64; rv:145.0) Gecko/20100101 Firefox/145.0"
172.23.0.4 - - [13/Nov/2025:19:02:35 +0000] "GET /api/system/stats HTTP/1.1" 200 216 "https://host.evindrake.net/dashboard" "Mozilla/5.0 (X11; Ubuntu; Linux x86_64; rv:145.0) Gecko/20100101 Firefox/145.0"
172.23.0.4 - - [13/Nov/2025:19:02:38 +0000] "GET /api/system/stats HTTP/1.1" 200 216 "https://host.evindrake.net/dashboard" "Mozilla/5.0 (X11; Ubuntu; Linux x86_64; rv:145.0) Gecko/20100101 Firefox/145.0"
172.23.0.4 - - [13/Nov/2025:19:02:41 +0000] "GET /api/system/stats HTTP/1.1" 200 216 "https://host.evindrake.net/dashboard" "Mozilla/5.0 (X11; Ubuntu; Linux x86_64; rv:145.0) Gecko/20100101 Firefox/145.0"
172.23.0.4 - - [13/Nov/2025:19:02:44 +0000] "GET /api/system/stats HTTP/1.1" 200 216 "https://host.evindrake.net/dashboard" "Mozilla/5.0 (X11; Ubuntu; Linux x86_64; rv:145.0) Gecko/20100101 Firefox/145.0"
172.23.0.4 - - [13/Nov/2025:19:02:46 +0000] "GET /api/containers HTTP/1.1" 200 1534 "https://host.evindrake.net/containers" "Mozilla/5.0 (X11; Ubuntu; Linux x86_64; rv:145.0) Gecko/20100101 Firefox/145.0"
172.23.0.4 - - [13/Nov/2025:19:02:47 +0000] "GET /api/system/stats HTTP/1.1" 200 216 "https://host.evindrake.net/dashboard" "Mozilla/5.0 (X11; Ubuntu; Linux x86_64; rv:145.0) Gecko/20100101 Firefox/145.0"
172.23.0.4 - - [13/Nov/2025:19:02:50 +0000] "GET /api/system/stats HTTP/1.1" 200 216 "https://host.evindrake.net/dashboard" "Mozilla/5.0 (X11; Ubuntu; Linux x86_64; rv:145.0) Gecko/20100101 Firefox/145.0"
172.23.0.4 - - [13/Nov/2025:19:02:53 +0000] "GET /api/system/stats HTTP/1.1" 200 216 "https://host.evindrake.net/dashboard" "Mozilla/5.0 (X11; Ubuntu; Linux x86_64; rv:145.0) Gecko/20100101 Firefox/145.0"
172.23.0.4 - - [13/Nov/2025:19:02:53 +0000] "GET /api/system/disk HTTP/1.1" 200 1063 "https://host.evindrake.net/dashboard" "Mozilla/5.0 (X11; Ubuntu; Linux x86_64; rv:145.0) Gecko/20100101 Firefox/145.0"
172.23.0.4 - - [13/Nov/2025:19:02:56 +0000] "GET /api/system/stats HTTP/1.1" 200 217 "https://host.evindrake.net/dashboard" "Mozilla/5.0 (X11; Ubuntu; Linux x86_64; rv:145.0) Gecko/20100101 Firefox/145.0"
172.23.0.4 - - [13/Nov/2025:19:02:59 +0000] "GET /api/system/stats HTTP/1.1" 200 217 "https://host.evindrake.net/dashboard" "Mozilla/5.0 (X11; Ubuntu; Linux x86_64; rv:145.0) Gecko/20100101 Firefox/145.0"
172.23.0.4 - - [13/Nov/2025:19:03:01 +0000] "GET /api/containers HTTP/1.1" 200 1534 "https://host.evindrake.net/containers" "Mozilla/5.0 (X11; Ubuntu; Linux x86_64; rv:145.0) Gecko/20100101 Firefox/145.0"
172.23.0.4 - - [13/Nov/2025:19:03:02 +0000] "GET /api/system/stats HTTP/1.1" 200 217 "https://host.evindrake.net/dashboard" "Mozilla/5.0 (X11; Ubuntu; Linux x86_64; rv:145.0) Gecko/20100101 Firefox/145.0"
172.23.0.4 - - [13/Nov/2025:19:03:05 +0000] "GET /api/system/stats HTTP/1.1" 200 217 "https://host.evindrake.net/dashboard" "Mozilla/5.0 (X11; Ubuntu; Linux x86_64; rv:145.0) Gecko/20100101 Firefox/145.0"
172.23.0.4 - - [13/Nov/2025:19:03:08 +0000] "GET /api/system/stats HTTP/1.1" 200 217 "https://host.evindrake.net/dashboard" "Mozilla/5.0 (X11; Ubuntu; Linux x86_64; rv:145.0) Gecko/20100101 Firefox/145.0"
172.23.0.4 - - [13/Nov/2025:19:03:11 +0000] "GET /api/system/stats HTTP/1.1" 200 217 "https://host.evindrake.net/dashboard" "Mozilla/5.0 (X11; Ubuntu; Linux x86_64; rv:145.0) Gecko/20100101 Firefox/145.0"
172.23.0.4 - - [13/Nov/2025:19:03:14 +0000] "GET /api/system/stats HTTP/1.1" 200 217 "https://host.evindrake.net/dashboard" "Mozilla/5.0 (X11; Ubuntu; Linux x86_64; rv:145.0) Gecko/20100101 Firefox/145.0"
172.23.0.4 - - [13/Nov/2025:19:03:16 +0000] "GET /api/containers HTTP/1.1" 200 1534 "https://host.evindrake.net/containers" "Mozilla/5.0 (X11; Ubuntu; Linux x86_64; rv:145.0) Gecko/20100101 Firefox/145.0"
172.23.0.4 - - [13/Nov/2025:19:03:17 +0000] "GET /api/system/stats HTTP/1.1" 200 217 "https://host.evindrake.net/dashboard" "Mozilla/5.0 (X11; Ubuntu; Linux x86_64; rv:145.0) Gecko/20100101 Firefox/145.0"
172.23.0.4 - - [13/Nov/2025:19:03:20 +0000] "GET /api/system/stats HTTP/1.1" 200 217 "https://host.evindrake.net/dashboard" "Mozilla/5.0 (X11; Ubuntu; Linux x86_64; rv:145.0) Gecko/20100101 Firefox/145.0"
172.23.0.4 - - [13/Nov/2025:19:03:23 +0000] "GET /api/system/stats HTTP/1.1" 200 217 "https://host.evindrake.net/dashboard" "Mozilla/5.0 (X11; Ubuntu; Linux x86_64; rv:145.0) Gecko/20100101 Firefox/145.0"
172.23.0.4 - - [13/Nov/2025:19:03:23 +0000] "GET /api/system/disk HTTP/1.1" 200 1063 "https://host.evindrake.net/dashboard" "Mozilla/5.0 (X11; Ubuntu; Linux x86_64; rv:145.0) Gecko/20100101 Firefox/145.0"
172.23.0.4 - - [13/Nov/2025:19:03:26 +0000] "GET /api/system/stats HTTP/1.1" 200 217 "https://host.evindrake.net/dashboard" "Mozilla/5.0 (X11; Ubuntu; Linux x86_64; rv:145.0) Gecko/20100101 Firefox/145.0"
172.23.0.4 - - [13/Nov/2025:19:03:29 +0000] "GET /api/system/stats HTTP/1.1" 200 217 "https://host.evindrake.net/dashboard" "Mozilla/5.0 (X11; Ubuntu; Linux x86_64; rv:145.0) Gecko/20100101 Firefox/145.0"
172.23.0.4 - - [13/Nov/2025:19:03:31 +0000] "GET /api/containers HTTP/1.1" 200 1534 "https://host.evindrake.net/containers" "Mozilla/5.0 (X11; Ubuntu; Linux x86_64; rv:145.0) Gecko/20100101 Firefox/145.0"
172.23.0.4 - - [13/Nov/2025:19:03:32 +0000] "GET /api/system/stats HTTP/1.1" 200 217 "https://host.evindrake.net/dashboard" "Mozilla/5.0 (X11; Ubuntu; Linux x86_64; rv:145.0) Gecko/20100101 Firefox/145.0"
172.23.0.4 - - [13/Nov/2025:19:03:35 +0000] "GET /api/system/stats HTTP/1.1" 200 217 "https://host.evindrake.net/dashboard" "Mozilla/5.0 (X11; Ubuntu; Linux x86_64; rv:145.0) Gecko/20100101 Firefox/145.0"
172.23.0.4 - - [13/Nov/2025:19:03:38 +0000] "GET /api/system/stats HTTP/1.1" 200 217 "https://host.evindrake.net/dashboard" "Mozilla/5.0 (X11; Ubuntu; Linux x86_64; rv:145.0) Gecko/20100101 Firefox/145.0"
172.23.0.4 - - [13/Nov/2025:19:03:41 +0000] "GET /api/system/stats HTTP/1.1" 200 217 "https://host.evindrake.net/dashboard" "Mozilla/5.0 (X11; Ubuntu; Linux x86_64; rv:145.0) Gecko/20100101 Firefox/145.0"
172.23.0.4 - - [13/Nov/2025:19:03:44 +0000] "GET /api/system/stats HTTP/1.1" 200 217 "https://host.evindrake.net/dashboard" "Mozilla/5.0 (X11; Ubuntu; Linux x86_64; rv:145.0) Gecko/20100101 Firefox/145.0"
172.23.0.4 - - [13/Nov/2025:19:03:46 +0000] "GET /api/containers HTTP/1.1" 200 1534 "https://host.evindrake.net/containers" "Mozilla/5.0 (X11; Ubuntu; Linux x86_64; rv:145.0) Gecko/20100101 Firefox/145.0"
172.23.0.4 - - [13/Nov/2025:19:03:47 +0000] "GET /api/system/stats HTTP/1.1" 200 217 "https://host.evindrake.net/dashboard" "Mozilla/5.0 (X11; Ubuntu; Linux x86_64; rv:145.0) Gecko/20100101 Firefox/145.0"
172.23.0.4 - - [13/Nov/2025:19:03:50 +0000] "GET /api/system/stats HTTP/1.1" 200 217 "https://host.evindrake.net/dashboard" "Mozilla/5.0 (X11; Ubuntu; Linux x86_64; rv:145.0) Gecko/20100101 Firefox/145.0"
172.23.0.4 - - [13/Nov/2025:19:03:53 +0000] "GET /api/system/disk HTTP/1.1" 200 1063 "https://host.evindrake.net/dashboard" "Mozilla/5.0 (X11; Ubuntu; Linux x86_64; rv:145.0) Gecko/20100101 Firefox/145.0"
172.23.0.4 - - [13/Nov/2025:19:03:53 +0000] "GET /api/system/stats HTTP/1.1" 200 217 "https://host.evindrake.net/dashboard" "Mozilla/5.0 (X11; Ubuntu; Linux x86_64; rv:145.0) Gecko/20100101 Firefox/145.0"
172.23.0.4 - - [13/Nov/2025:19:03:56 +0000] "GET /api/system/stats HTTP/1.1" 200 217 "https://host.evindrake.net/dashboard" "Mozilla/5.0 (X11; Ubuntu; Linux x86_64; rv:145.0) Gecko/20100101 Firefox/145.0"
172.23.0.4 - - [13/Nov/2025:19:03:59 +0000] "GET /api/system/stats HTTP/1.1" 200 217 "https://host.evindrake.net/dashboard" "Mozilla/5.0 (X11; Ubuntu; Linux x86_64; rv:145.0) Gecko/20100101 Firefox/145.0"
172.23.0.4 - - [13/Nov/2025:19:04:01 +0000] "GET /api/containers HTTP/1.1" 200 1534 "https://host.evindrake.net/containers" "Mozilla/5.0 (X11; Ubuntu; Linux x86_64; rv:145.0) Gecko/20100101 Firefox/145.0"
172.23.0.4 - - [13/Nov/2025:19:04:02 +0000] "GET /api/system/stats HTTP/1.1" 200 217 "https://host.evindrake.net/dashboard" "Mozilla/5.0 (X11; Ubuntu; Linux x86_64; rv:145.0) Gecko/20100101 Firefox/145.0"
172.23.0.4 - - [13/Nov/2025:19:04:05 +0000] "GET /api/system/stats HTTP/1.1" 200 217 "https://host.evindrake.net/dashboard" "Mozilla/5.0 (X11; Ubuntu; Linux x86_64; rv:145.0) Gecko/20100101 Firefox/145.0"
172.23.0.4 - - [13/Nov/2025:19:04:08 +0000] "GET /api/system/stats HTTP/1.1" 200 217 "https://host.evindrake.net/dashboard" "Mozilla/5.0 (X11; Ubuntu; Linux x86_64; rv:145.0) Gecko/20100101 Firefox/145.0"
172.23.0.4 - - [13/Nov/2025:19:04:11 +0000] "GET /api/system/stats HTTP/1.1" 200 217 "https://host.evindrake.net/dashboard" "Mozilla/5.0 (X11; Ubuntu; Linux x86_64; rv:145.0) Gecko/20100101 Firefox/145.0"
172.23.0.4 - - [13/Nov/2025:19:04:14 +0000] "GET /api/system/stats HTTP/1.1" 200 217 "https://host.evindrake.net/dashboard" "Mozilla/5.0 (X11; Ubuntu; Linux x86_64; rv:145.0) Gecko/20100101 Firefox/145.0"
172.23.0.4 - - [13/Nov/2025:19:04:16 +0000] "GET /api/containers HTTP/1.1" 200 1534 "https://host.evindrake.net/containers" "Mozilla/5.0 (X11; Ubuntu; Linux x86_64; rv:145.0) Gecko/20100101 Firefox/145.0"
172.23.0.4 - - [13/Nov/2025:19:04:18 +0000] "GET /api/system/stats HTTP/1.1" 200 217 "https://host.evindrake.net/dashboard" "Mozilla/5.0 (X11; Ubuntu; Linux x86_64; rv:145.0) Gecko/20100101 Firefox/145.0"
172.23.0.4 - - [13/Nov/2025:19:04:21 +0000] "GET /api/system/stats HTTP/1.1" 200 217 "https://host.evindrake.net/dashboard" "Mozilla/5.0 (X11; Ubuntu; Linux x86_64; rv:145.0) Gecko/20100101 Firefox/145.0"
172.23.0.4 - - [13/Nov/2025:19:04:24 +0000] "GET /api/system/stats HTTP/1.1" 200 217 "https://host.evindrake.net/dashboard" "Mozilla/5.0 (X11; Ubuntu; Linux x86_64; rv:145.0) Gecko/20100101 Firefox/145.0"
172.23.0.4 - - [13/Nov/2025:19:04:24 +0000] "GET /api/system/disk HTTP/1.1" 200 1063 "https://host.evindrake.net/dashboard" "Mozilla/5.0 (X11; Ubuntu; Linux x86_64; rv:145.0) Gecko/20100101 Firefox/145.0"
172.23.0.4 - - [13/Nov/2025:19:04:27 +0000] "GET /api/system/stats HTTP/1.1" 200 217 "https://host.evindrake.net/dashboard" "Mozilla/5.0 (X11; Ubuntu; Linux x86_64; rv:145.0) Gecko/20100101 Firefox/145.0"
172.23.0.4 - - [13/Nov/2025:19:04:30 +0000] "GET /api/system/stats HTTP/1.1" 200 217 "https://host.evindrake.net/dashboard" "Mozilla/5.0 (X11; Ubuntu; Linux x86_64; rv:145.0) Gecko/20100101 Firefox/145.0"
172.23.0.4 - - [13/Nov/2025:19:04:31 +0000] "GET /api/containers HTTP/1.1" 200 1534 "https://host.evindrake.net/containers" "Mozilla/5.0 (X11; Ubuntu; Linux x86_64; rv:145.0) Gecko/20100101 Firefox/145.0"
172.23.0.4 - - [13/Nov/2025:19:04:33 +0000] "GET /api/system/stats HTTP/1.1" 200 217 "https://host.evindrake.net/dashboard" "Mozilla/5.0 (X11; Ubuntu; Linux x86_64; rv:145.0) Gecko/20100101 Firefox/145.0"
172.23.0.4 - - [13/Nov/2025:19:04:36 +0000] "GET /api/system/stats HTTP/1.1" 200 217 "https://host.evindrake.net/dashboard" "Mozilla/5.0 (X11; Ubuntu; Linux x86_64; rv:145.0) Gecko/20100101 Firefox/145.0"
172.23.0.4 - - [13/Nov/2025:19:04:39 +0000] "GET /api/system/stats HTTP/1.1" 200 217 "https://host.evindrake.net/dashboard" "Mozilla/5.0 (X11; Ubuntu; Linux x86_64; rv:145.0) Gecko/20100101 Firefox/145.0"
172.23.0.4 - - [13/Nov/2025:19:04:42 +0000] "GET /api/system/stats HTTP/1.1" 200 217 "https://host.evindrake.net/dashboard" "Mozilla/5.0 (X11; Ubuntu; Linux x86_64; rv:145.0) Gecko/20100101 Firefox/145.0"
172.23.0.4 - - [13/Nov/2025:19:04:45 +0000] "GET /api/system/stats HTTP/1.1" 200 217 "https://host.evindrake.net/dashboard" "Mozilla/5.0 (X11; Ubuntu; Linux x86_64; rv:145.0) Gecko/20100101 Firefox/145.0"
172.23.0.4 - - [13/Nov/2025:19:04:46 +0000] "GET /api/containers HTTP/1.1" 200 1534 "https://host.evindrake.net/containers" "Mozilla/5.0 (X11; Ubuntu; Linux x86_64; rv:145.0) Gecko/20100101 Firefox/145.0"
172.23.0.4 - - [13/Nov/2025:19:04:48 +0000] "GET /api/system/stats HTTP/1.1" 200 217 "https://host.evindrake.net/dashboard" "Mozilla/5.0 (X11; Ubuntu; Linux x86_64; rv:145.0) Gecko/20100101 Firefox/145.0"
172.23.0.4 - - [13/Nov/2025:19:04:51 +0000] "GET /api/system/stats HTTP/1.1" 200 217 "https://host.evindrake.net/dashboard" "Mozilla/5.0 (X11; Ubuntu; Linux x86_64; rv:145.0) Gecko/20100101 Firefox/145.0"
172.23.0.4 - - [13/Nov/2025:19:04:54 +0000] "GET /api/system/stats HTTP/1.1" 200 217 "https://host.evindrake.net/dashboard" "Mozilla/5.0 (X11; Ubuntu; Linux x86_64; rv:145.0) Gecko/20100101 Firefox/145.0"
172.23.0.4 - - [13/Nov/2025:19:04:54 +0000] "GET /api/system/disk HTTP/1.1" 200 1063 "https://host.evindrake.net/dashboard" "Mozilla/5.0 (X11; Ubuntu; Linux x86_64; rv:145.0) Gecko/20100101 Firefox/145.0"
172.23.0.4 - - [13/Nov/2025:19:04:57 +0000] "GET /api/system/stats HTTP/1.1" 200 217 "https://host.evindrake.net/dashboard" "Mozilla/5.0 (X11; Ubuntu; Linux x86_64; rv:145.0) Gecko/20100101 Firefox/145.0"
172.23.0.4 - - [13/Nov/2025:19:05:00 +0000] "GET /api/system/stats HTTP/1.1" 200 217 "https://host.evindrake.net/dashboard" "Mozilla/5.0 (X11; Ubuntu; Linux x86_64; rv:145.0) Gecko/20100101 Firefox/145.0"
172.23.0.4 - - [13/Nov/2025:19:05:01 +0000] "GET /api/containers HTTP/1.1" 200 1534 "https://host.evindrake.net/containers" "Mozilla/5.0 (X11; Ubuntu; Linux x86_64; rv:145.0) Gecko/20100101 Firefox/145.0"
172.23.0.4 - - [13/Nov/2025:19:05:03 +0000] "GET /api/system/stats HTTP/1.1" 200 217 "https://host.evindrake.net/dashboard" "Mozilla/5.0 (X11; Ubuntu; Linux x86_64; rv:145.0) Gecko/20100101 Firefox/145.0"
172.23.0.4 - - [13/Nov/2025:19:05:06 +0000] "GET /api/system/stats HTTP/1.1" 200 216 "https://host.evindrake.net/dashboard" "Mozilla/5.0 (X11; Ubuntu; Linux x86_64; rv:145.0) Gecko/20100101 Firefox/145.0"
172.23.0.4 - - [13/Nov/2025:19:05:09 +0000] "GET /containers HTTP/1.1" 200 17530 "https://host.evindrake.net/dashboard" "Mozilla/5.0 (X11; Ubuntu; Linux x86_64; rv:145.0) Gecko/20100101 Firefox/145.0"
172.23.0.4 - - [13/Nov/2025:19:05:09 +0000] "GET /api/containers HTTP/1.1" 200 1534 "https://host.evindrake.net/containers" "Mozilla/5.0 (X11; Ubuntu; Linux x86_64; rv:145.0) Gecko/20100101 Firefox/145.0"
172.23.0.4 - - [13/Nov/2025:19:05:09 +0000] "GET /api/system/stats HTTP/1.1" 200 217 "https://host.evindrake.net/dashboard" "Mozilla/5.0 (X11; Ubuntu; Linux x86_64; rv:145.0) Gecko/20100101 Firefox/145.0"
172.23.0.4 - - [13/Nov/2025:19:05:10 +0000] "GET / HTTP/1.1" 200 20761 "https://host.evindrake.net/containers" "Mozilla/5.0 (X11; Ubuntu; Linux x86_64; rv:145.0) Gecko/20100101 Firefox/145.0"
172.23.0.4 - - [13/Nov/2025:19:05:10 +0000] "GET /api/containers HTTP/1.1" 200 1534 "https://host.evindrake.net/" "Mozilla/5.0 (X11; Ubuntu; Linux x86_64; rv:145.0) Gecko/20100101 Firefox/145.0"
172.23.0.4 - - [13/Nov/2025:19:05:12 +0000] "GET /api/system/stats HTTP/1.1" 200 217 "https://host.evindrake.net/dashboard" "Mozilla/5.0 (X11; Ubuntu; Linux x86_64; rv:145.0) Gecko/20100101 Firefox/145.0"
172.23.0.4 - - [13/Nov/2025:19:05:15 +0000] "GET /api/system/stats HTTP/1.1" 200 217 "https://host.evindrake.net/dashboard" "Mozilla/5.0 (X11; Ubuntu; Linux x86_64; rv:145.0) Gecko/20100101 Firefox/145.0"
172.23.0.4 - - [13/Nov/2025:19:05:18 +0000] "GET /api/system/stats HTTP/1.1" 200 217 "https://host.evindrake.net/dashboard" "Mozilla/5.0 (X11; Ubuntu; Linux x86_64; rv:145.0) Gecko/20100101 Firefox/145.0"
172.23.0.4 - - [13/Nov/2025:19:05:21 +0000] "GET /api/system/stats HTTP/1.1" 200 217 "https://host.evindrake.net/dashboard" "Mozilla/5.0 (X11; Ubuntu; Linux x86_64; rv:145.0) Gecko/20100101 Firefox/145.0"
172.23.0.4 - - [13/Nov/2025:19:05:24 +0000] "GET /api/system/disk HTTP/1.1" 200 1063 "https://host.evindrake.net/dashboard" "Mozilla/5.0 (X11; Ubuntu; Linux x86_64; rv:145.0) Gecko/20100101 Firefox/145.0"
172.23.0.4 - - [13/Nov/2025:19:05:24 +0000] "GET /api/system/stats HTTP/1.1" 200 217 "https://host.evindrake.net/dashboard" "Mozilla/5.0 (X11; Ubuntu; Linux x86_64; rv:145.0) Gecko/20100101 Firefox/145.0"
172.23.0.4 - - [13/Nov/2025:19:05:25 +0000] "GET /api/containers HTTP/1.1" 200 1534 "https://host.evindrake.net/" "Mozilla/5.0 (X11; Ubuntu; Linux x86_64; rv:145.0) Gecko/20100101 Firefox/145.0"
172.23.0.4 - - [13/Nov/2025:19:05:27 +0000] "GET /api/system/stats HTTP/1.1" 200 217 "https://host.evindrake.net/dashboard" "Mozilla/5.0 (X11; Ubuntu; Linux x86_64; rv:145.0) Gecko/20100101 Firefox/145.0"
172.23.0.4 - - [13/Nov/2025:19:05:30 +0000] "GET /api/system/stats HTTP/1.1" 200 217 "https://host.evindrake.net/dashboard" "Mozilla/5.0 (X11; Ubuntu; Linux x86_64; rv:145.0) Gecko/20100101 Firefox/145.0"
172.23.0.4 - - [13/Nov/2025:19:05:33 +0000] "GET /api/system/stats HTTP/1.1" 200 217 "https://host.evindrake.net/dashboard" "Mozilla/5.0 (X11; Ubuntu; Linux x86_64; rv:145.0) Gecko/20100101 Firefox/145.0"
172.23.0.4 - - [13/Nov/2025:19:05:36 +0000] "GET /api/system/stats HTTP/1.1" 200 217 "https://host.evindrake.net/dashboard" "Mozilla/5.0 (X11; Ubuntu; Linux x86_64; rv:145.0) Gecko/20100101 Firefox/145.0"
