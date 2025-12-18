# Homelab Discord Rich Presence

Shows your homelab status as your personal Discord Rich Presence.

## Features

- Rotates through CPU/RAM usage, uptime, services online, and current mode
- Fetches data from Dashboard API when available
- Falls back to local system stats if Dashboard is unavailable
- Runs as a systemd user service

## Setup

### 1. Create Discord Application

1. Go to [Discord Developer Portal](https://discord.com/developers/applications)
2. Click "New Application"
3. Name it "Homelab" or similar
4. Copy the **Application ID** (this is your Client ID)
5. Go to Rich Presence > Art Assets and upload images named:
   - `homelab` - Your main homelab icon
   - `server` - A server/computer icon
   - `uptime` - An uptime/clock icon

### 2. Install Dependencies

```bash
cd /opt/homelab/HomeLabHub/deploy/local/services/homelab-presence
pip install -r requirements.txt
```

### 3. Configure Environment

Edit the systemd service file or set environment variables:

```bash
export DISCORD_CLIENT_ID="your_application_id"
export DASHBOARD_URL="http://localhost:5000"
export SERVICE_AUTH_TOKEN="your_service_auth_token"
```

### 4. Run Manually (Test)

```bash
python homelab_presence.py
```

### 5. Install as Systemd User Service

```bash
# Copy service file
mkdir -p ~/.config/systemd/user
cp homelab-presence.service ~/.config/systemd/user/

# Edit with your values
nano ~/.config/systemd/user/homelab-presence.service

# Enable and start
systemctl --user daemon-reload
systemctl --user enable homelab-presence
systemctl --user start homelab-presence

# Check status
systemctl --user status homelab-presence
```

## Troubleshooting

### "Failed to connect to Discord"
- Make sure Discord desktop is running
- Discord must be running on the same machine (not browser Discord)

### No presence showing
- Presence is only visible to others, not yourself (Discord limitation)
- Ask a friend to check your profile

### "requests.exceptions.ConnectionError"
- Dashboard may not be reachable
- The script will fall back to local stats only
