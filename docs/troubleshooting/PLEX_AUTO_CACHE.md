# Plex Auto-Cache System

The Plex Auto-Cache system automatically caches content to your fast local SSD when you start watching, with intelligent disk management that prevents your drive from filling up.

## Features

- **Automatic Caching**: Content is cached when playback starts via Plex webhooks
- **Smart Disk Management**: Configurable size limit (default 100GB) with automatic eviction
- **LRU Eviction**: Least-recently-watched content is removed first when space is needed
- **Session Protection**: Content being watched or recently paused is never evicted
- **Watch Completion Tracking**: Fully-watched content is deprioritized for eviction
- **Seamless Fallback**: When content is evicted, Plex automatically plays from NAS

## How It Works

1. **You start watching a movie** → Plex sends a webhook to the auto-cache service
2. **Service checks if cached** → If not, queues it for background caching
3. **Cache syncs from NAS** → Content copies to your fast local SSD
4. **Next time you watch** → Plays from cache (buffer-free 4K!)
5. **Cache gets full** → Automatically removes old/watched content

## Configuration

Environment variables (set in `.env` file):

| Variable | Default | Description |
|----------|---------|-------------|
| `PLEX_CACHE_MAX_GB` | 100 | Maximum cache size in GB |
| `PLEX_CACHE_BUFFER_GB` | 10 | Buffer space to keep free |
| `PLEX_SESSION_PROTECT_MINUTES` | 60 | Minutes to protect paused content from eviction |

### Example `.env` Configuration

```bash
# Plex Auto-Cache Settings
PLEX_CACHE_MAX_GB=150      # Allow up to 150GB cache
PLEX_CACHE_BUFFER_GB=15    # Keep 15GB buffer
PLEX_SESSION_PROTECT_MINUTES=120  # Protect paused content for 2 hours
```

## Setup Instructions

### 1. Start the Auto-Cache Service

```bash
cd /opt/homelab/HomeLabHub/deploy/local

# Pull latest changes
git pull

# Build and start the service
docker compose up -d --build plex-auto-cache

# Check it's running
docker compose logs plex-auto-cache
```

### 2. Configure Plex Webhooks

> **Note**: Webhooks require Plex Pass subscription.

1. Open Plex Web App → **Settings** → **Webhooks**
2. Click **Add Webhook**
3. Enter URL: `http://localhost:5055/webhook`
   - Both Plex and plex-auto-cache run on host networking, so `localhost` works
   - Alternatively, use your server's IP: `http://YOUR_SERVER_IP:5055/webhook`
4. Click **Save Changes**

### 3. Verify It's Working

```bash
# Check service health
curl http://localhost:5055/health

# View cache status
curl http://localhost:5055/status

# List cached items
curl http://localhost:5055/cached
```

Then play something in Plex and check the logs:

```bash
docker compose logs -f plex-auto-cache
```

You should see: `Webhook: media.play - Movie Title (movie) - folder: Movie.Folder.Name`

## API Endpoints

| Endpoint | Method | Description |
|----------|--------|-------------|
| `/health` | GET | Health check |
| `/status` | GET | Cache statistics (size, items, active sessions, queue) |
| `/cached` | GET | List all cached items |
| `/queue` | GET | View cache job history (pending, processing, completed, failed) |
| `/webhook` | POST | Receives Plex webhooks |
| `/cache` | POST | Manually trigger caching |
| `/evict` | POST | Manually evict content |

### Manual Caching via API

```bash
# Cache a specific movie
curl -X POST http://localhost:5055/cache \
  -H "Content-Type: application/json" \
  -d '{"folder_name": "John.Wick.2014", "type": "movie"}'

# Cache a TV show
curl -X POST http://localhost:5055/cache \
  -H "Content-Type: application/json" \
  -d '{"folder_name": "Breaking Bad", "type": "show"}'
```

### Manual Eviction via API

```bash
# Remove a movie from cache
curl -X POST http://localhost:5055/evict \
  -H "Content-Type: application/json" \
  -d '{"folder_name": "Old.Movie.2020", "type": "movie"}'
```

## Smart Eviction Details

When the cache approaches its limit, the system automatically evicts content based on:

1. **Watch Completion**: Content watched to 90%+ is evicted first
2. **Last Watched**: Older content is evicted before recently watched
3. **Watch Count**: Content watched fewer times is evicted first
4. **Session Protection**: Active/paused sessions are never evicted

### Example Eviction Priority

| Content | Last Watched | Progress | Protected | Priority |
|---------|--------------|----------|-----------|----------|
| Old Movie (finished) | 2 weeks ago | 100% | No | Evict First |
| Documentary | 1 week ago | 100% | No | Evict Second |
| New Movie (paused) | 30 min ago | 45% | Yes | Never |
| Currently Playing | Now | 20% | Yes | Never |

## Playback Resume Behavior

When content is evicted from cache:

1. **Plex handles it automatically** - Both cache and NAS are library sources
2. **Resume position is preserved** - Plex stores watch progress, not the cache
3. **Seamless fallback** - Plex just plays from NAS instead
4. **May buffer briefly** - First few seconds while NAS catches up

The cache system only affects *where* content plays from, not your watch history or resume position.

## Troubleshooting

### Webhooks Not Arriving

1. Verify Plex Pass is active
2. Check webhook URL is correct: `http://YOUR_IP:5055/webhook`
3. Ensure port 5055 is accessible on your server
4. Check service logs: `docker compose logs plex-auto-cache`

### Cache Not Working

```bash
# Check service status
docker compose ps plex-auto-cache

# View logs for errors
docker compose logs --tail=50 plex-auto-cache

# Verify NAS is mounted
ls -la /mnt/nas/networkshare/video/Movies

# Verify cache directory
ls -la /opt/plex-cache/
```

### Reset Cache Database

If the cache database gets corrupted:

```bash
# Stop service
docker compose stop plex-auto-cache

# Remove database volume
docker volume rm local_plex_cache_data

# Restart service
docker compose up -d plex-auto-cache
```

## Integration with Manual Cache

The auto-cache service works alongside the manual `plex-cache.sh` script:

- **Auto-cache**: Caches content on playback
- **Manual cache**: Pre-cache content before watching

```bash
# Pre-cache a movie for tonight
sudo ./deploy/local/scripts/plex-cache.sh add movie "Movie.Name"

# Check what auto-cache has cached
curl http://localhost:5055/cached
```

## Monitoring

View real-time cache statistics:

```bash
# Quick status
curl -s http://localhost:5055/status | jq .

# Example output:
{
  "cache_size_gb": 45.2,
  "max_size_gb": 100,
  "usage_percent": 45.2,
  "cached_items": 5,
  "active_sessions": 1,
  "queue_size": 0,
  "session_protect_minutes": 60
}
```
