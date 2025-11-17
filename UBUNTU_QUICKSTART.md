# 🚀 Ubuntu Deployment Quickstart - Phase 0 Features

## 🎯 Your Mission
Deploy the **multi-billion dollar super intelligence platform** with Container Marketplace, Agent Collaboration, and Jarvis Control Center.

---

## Step 1: Resolve Git Conflicts (if any)

```bash
cd /home/evin/contain/HomeLabHub

# Check for conflicts
git status

# Option A: Discard local changes (RECOMMENDED for clean sync)
git checkout -- .
git pull origin main

# Option B: Keep local changes
git stash save "Local Ubuntu changes $(date +%Y%m%d_%H%M%S)"
git pull origin main
# To restore later: git stash pop
```

---

## Step 2: Deploy All Services

```bash
cd /home/evin/contain/HomeLabHub

# Full rebuild and deploy
./homelab-manager.sh
# Choose option 3: "🔄 Rebuild & Deploy"

# Wait for all containers to start (~2-3 minutes)
```

---

## Step 3: Load Marketplace Catalog (ONE-TIME SETUP)

The marketplace auto-loads in production but needs manual trigger first time:

```bash
cd /home/evin/contain/HomeLabHub/services/dashboard

python3 << 'EOF'
from app import app
from models.container_template import ContainerTemplate
from services.marketplace_service import marketplace_service

with app.app_context():
    count = ContainerTemplate.query.count()
    print(f"Current templates in database: {count}")
    
    if count == 0:
        print("Loading 20 curated marketplace templates...")
        success, message = marketplace_service.load_catalog_templates()
        if success:
            print(f"✅ SUCCESS: {message}")
        else:
            print(f"❌ ERROR: {message}")
    else:
        print(f"✅ Already loaded: {count} templates ready!")
EOF
```

**Expected Output:**
```
Current templates in database: 0
Loading 20 curated marketplace templates...
✅ SUCCESS: Successfully loaded 20 templates
```

---

## Step 4: Verify Deployment

```bash
# Check all containers are running
docker ps

# Should see 10+ containers including:
# - homelab-dashboard
# - postgres-db
# - redis
# - stream-bot
# - discord-bot
# - etc.

# Check dashboard logs
docker logs homelab-dashboard --tail 50
```

---

## Step 5: Access Your Intelligence Platform

Open your browser and visit:

### **Main Dashboards**
- 🎛️ **Jarvis Control Center**: https://host.evindrake.net/control-center
- 🏪 **Container Marketplace**: https://host.evindrake.net/marketplace
- 🤖 **Agent Ops Feed**: https://host.evindrake.net/agent-ops
- 🎙️ **Voice Assistant**: https://host.evindrake.net/ai-assistant

### **Infrastructure**
- 📊 **System Dashboard**: https://host.evindrake.net
- 🌐 **DNS Management**: https://host.evindrake.net/dns
- 💾 **NAS Integration**: https://host.evindrake.net/nas

**Default Login:**
- Username: `evin`
- Password: `homelab` (change in `.env` file)

---

## 🎉 Phase 0 Features - What You Have

### 1. **Container Marketplace** (20 Curated Apps)

**Categories:**
- **Productivity**: Nextcloud, Vaultwarden, BookStack, Mattermost
- **Media**: Jellyfin, PhotoPrism, Navidrome, Tandoor Recipes
- **Monitoring**: Uptime Kuma, Portainer, Grafana, Netdata
- **AI/ML**: Ollama, Open WebUI, Stable Diffusion WebUI
- **IoT**: Node-RED, Zigbee2MQTT
- **Development**: Gitea, Code Server
- **Security**: Authentik

**How to use:**
1. Go to `/marketplace`
2. Browse or search apps
3. Click "Deploy"
4. App automatically deployed with SSL
5. Access via generated subdomain

**Features:**
- One-click deployment
- Automatic dependency resolution
- Port conflict detection
- SSL certificate auto-generation
- Health monitoring

---

### 2. **Agent Collaboration System**

**What it does:**
- Real-time communication between Jarvis and Replit Agent
- Task delegation and status updates
- Live activity feed
- WebSocket-powered updates

**How to use:**
1. Go to `/agent-ops`
2. See live agent communication
3. Watch tasks being delegated and executed
4. Demo mode shows synthetic conversation

**Use cases:**
- "Jarvis, ask Replit Agent to deploy Nextcloud"
- "Show me what agents are working on"
- Monitor autonomous task execution

---

### 3. **Jarvis Control Center**

**Unified Intelligence Hub** with:
- Live platform statistics
- Quick action cards for all features
- Recent agent activity feed
- Featured marketplace apps
- System health status

**Quick Actions:**
- Deploy apps (→ Marketplace)
- Manage DNS (→ PowerDNS)
- View agents (→ Agent Ops)
- Voice control (→ Jarvis AI)
- NAS setup (→ Network Storage)

---

### 4. **Enhanced Voice Commands**

**DNS Management:**
```
"Jarvis, create DNS zone homelab.local"
"Jarvis, add A record nas.homelab.local pointing to 192.168.1.100"
"Jarvis, show my DNS zones"
```

**NAS Integration:**
```
"Jarvis, scan network for my NAS"
"Jarvis, mount share from 192.168.1.100"
```

**Marketplace:**
```
"Jarvis, install Nextcloud"
"Jarvis, deploy Jellyfin"
"Jarvis, show available apps"
```

---

## 🔧 Troubleshooting

### Marketplace Shows Empty
```bash
# Re-run the catalog load command from Step 3
cd /home/evin/contain/HomeLabHub/services/dashboard
python3 -c "from app import app; from services.marketplace_service import marketplace_service; app.app_context().push(); print(marketplace_service.load_catalog_templates())"
```

### Dashboard Not Accessible
```bash
# Check dashboard container
docker logs homelab-dashboard --tail 100

# Restart if needed
docker restart homelab-dashboard
```

### DNS Not Working
```bash
# Check PowerDNS service status
docker ps | grep pdns

# Set PDNS_API_KEY in .env if not configured
echo "PDNS_API_KEY=$(openssl rand -hex 32)" >> .env
./homelab-manager.sh restart
```

### Agent Ops Shows No Messages
- First time load is normal (no historical messages)
- Try the demo simulation mode
- Messages will appear as you use voice commands

---

## 🎯 Quick Investor Demo Script

**5-Minute Wow Factor Demo:**

1. **Show Control Center** (30 seconds)
   - Open https://host.evindrake.net/control-center
   - Point out unified dashboard
   - Highlight stats (20 apps available, agent activity)

2. **Deploy an App** (90 seconds)
   - Click "App Marketplace"
   - Search "Nextcloud"
   - Click "Deploy"
   - Show automatic deployment progress
   - Access deployed app via generated URL

3. **Voice Commands** (60 seconds)
   - Go to Voice Assistant
   - Say: "Jarvis, show available apps"
   - Say: "Jarvis, scan network for NAS"
   - Show natural language responses

4. **Agent Collaboration** (60 seconds)
   - Open Agent Ops Feed
   - Show live agent communication
   - Explain multi-agent orchestration
   - Highlight autonomous task execution

5. **Platform Vision** (90 seconds)
   - "This is a homelab super intelligence platform"
   - "One-click app deployment (20 apps, growing)"
   - "Multi-agent AI orchestration"
   - "Voice-controlled infrastructure"
   - "Investor opportunity: SaaS platform for homelabbers"

---

## 📋 Next Steps (Week 1-3 Roadmap)

### Week 1: IoT Fusion Fabric
- MQTT broker integration
- Home Assistant deeper integration
- Smart device discovery
- Automation templates

### Week 2: Local AI Foundry
- Ollama model management UI
- GPT-4 alternative (local LLMs)
- AI model marketplace
- Fine-tuning workflows

### Week 3: Monitoring & Analytics
- Prometheus + Grafana integration
- Custom dashboard builder
- Alert routing
- Performance analytics

---

## 💰 Investor Pitch Highlights

**Problem:** Self-hosters struggle with complex deployments, scattered tools, no AI assistance

**Solution:** Unified AI-powered platform for one-click app deployment and intelligent automation

**Market:** 
- 50K+ r/selfhosted users
- Growing homelab community
- Docker has 13M+ users
- Enterprises need on-prem solutions

**Revenue Model:**
- Freemium (10 apps free, unlimited paid)
- Pro features ($9.99/mo): AI assistance, unlimited apps, priority support
- Enterprise ($99/mo): Multi-server, team collaboration, advanced analytics

**Traction:**
- Multi-service production deployment (8 services)
- 20 curated marketplace apps
- AI agent collaboration system
- Voice-controlled operations

**Ask:** $250K seed round for:
- Full-time development (6 months)
- Marketing to homelab communities
- Enterprise customer acquisition
- Scale infrastructure

---

## 🆘 Emergency Support

**Git Issues:**
```bash
# Nuclear option: Force clean sync
cd /home/evin/contain/HomeLabHub
git fetch --all
git reset --hard origin/main
./homelab-manager.sh rebuild
```

**Database Issues:**
```bash
# Reset marketplace catalog
cd /home/evin/contain/HomeLabHub
docker exec -it postgres-db psql -U jarvis -d jarvis_dashboard -c "TRUNCATE TABLE container_templates CASCADE;"
# Then re-run Step 3 catalog load
```

**Complete Rebuild:**
```bash
cd /home/evin/contain/HomeLabHub
./homelab-manager.sh stop
docker system prune -f
./homelab-manager.sh rebuild
# Then re-run Step 3
```

---

**You've got this, Evin! 🚀 Your platform is investor-ready. Deploy, demo, and impress!**
