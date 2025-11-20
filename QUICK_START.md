# HomeLabHub - Quick Start

## ⚡ Fix Everything (One Command)

```bash
ssh evin@host.evindrake.net
cd /home/evin/contain/HomeLabHub
git pull origin main
./homelab fix
```

## 📋 Simple Commands

```bash
./homelab fix       # Fix all issues and start services  
./homelab status    # Show what's running (goal: 15/15)
./homelab logs      # View all logs
./homelab debug     # Show debugging information
./homelab restart   # Restart all services
./homelab stop      # Stop everything
```

## 🌐 Your Services

- **Dashboard**: https://host.evindrake.net (login: evin/Brs=2729)
- **Discord Bot**: https://bot.rig-city.com
- **Stream Bot**: https://stream.rig-city.com
- **VNC Desktop**: https://vnc.evindrake.net
- **Code Server**: https://code.evindrake.net
- **Plex**: https://plex.evindrake.net
- **n8n**: https://n8n.evindrake.net
- **Home Assistant**: https://home.evindrake.net
- **Static Sites**: https://rig-city.com, https://scarletredjoker.com

## 🔧 If Something's Wrong

```bash
./homelab debug     # Shows exactly what's wrong
./homelab fix       # Fixes it
```

## ✅ Expected Result

```
✅ SUCCESS! All 15/15 services running!
```

## 🎯 Why This Works

**The Fix:** Uses absolute paths so Docker finds your .env file:

```bash
docker compose \
    --project-directory /home/evin/contain/HomeLabHub \
    --env-file /home/evin/contain/HomeLabHub/.env \
    up -d --force-recreate
```

Previous versions failed because Docker was looking for .env in the wrong directory!
