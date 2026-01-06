# Jellyfin + Community Media Network

Run Jellyfin alongside Plex for community media sharing.

## Quick Start

```bash
cd deploy/local/jellyfin

# Create community upload folder
sudo mkdir -p /srv/media/community
sudo chown 1000:1000 /srv/media/community

# Start Jellyfin
docker compose up -d
```

Access Jellyfin at: http://localhost:8096

## Setup

1. Open http://localhost:8096
2. Create admin account
3. Add library pointing to `/media` (your existing Plex content)
4. Add another library for `/media/community` (friend uploads)

## Sharing with Friends

Each friend runs their own Jellyfin + sync service. The sync service:
- Reports node status to the central dashboard
- Tracks storage contribution
- Indexes available media for cross-node search

### Friend Setup

1. Install Docker on their machine
2. Clone this repo
3. Set environment variables:
   ```bash
   # .env file
   NODE_NAME=FriendsNode
   DASHBOARD_URL=https://your-dashboard.com
   SYNC_API_KEY=generated_key_from_dashboard
   ```
4. Run: `docker compose up -d`

## Architecture

```
┌─────────────────┐     ┌─────────────────┐
│   Your Server   │     │  Friend's Node  │
├─────────────────┤     ├─────────────────┤
│ Plex (personal) │     │    Jellyfin     │
│ Jellyfin (comm) │     │   Sync Service  │
│ Sync Service    │     └────────┬────────┘
└────────┬────────┘              │
         │                       │
         └───────────┬───────────┘
                     │
              ┌──────▼──────┐
              │  Dashboard  │
              │  (Central)  │
              │ - Node list │
              │ - Search    │
              │ - Stats     │
              └─────────────┘
```

## Ports

- 8096: Jellyfin Web UI
- 3456: Sync service API (internal)
