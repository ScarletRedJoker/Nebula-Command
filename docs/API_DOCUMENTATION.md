# 📡 API Documentation

**Complete API reference for Nebula Command integrations and programmatic access**

---

## 📑 Table of Contents

1. [Overview](#overview)
2. [Authentication](#authentication)
3. [Dashboard API](#dashboard-api)
4. [Stream Bot API](#stream-bot-api)
5. [WebSocket Events](#websocket-events)
6. [Error Handling](#error-handling)
7. [Rate Limiting](#rate-limiting)
8. [SDKs and Libraries](#sdks-and-libraries)

---

## 🌐 Overview

### Base URLs

| Service | Base URL | Protocol |
|---------|----------|----------|
| **Dashboard API** | `https://host.yourdomain.com/api` | HTTPS |
| **Stream Bot API** | `https://stream.yourdomain.com/api` | HTTPS |
| **Discord Bot API** | `https://bot.yourdomain.com/api` | HTTPS |

### Request Format

All API requests must include:
- **Content-Type:** `application/json`
- **Accept:** `application/json`
- **Authorization:** Session cookie or API key (where applicable)

### Response Format

All responses follow this structure:

**Success:**
```json
{
  "success": true,
  "data": { ... },
  "message": "Operation completed successfully"
}
```

**Error:**
```json
{
  "success": false,
  "error": "Error description",
  "code": "ERROR_CODE",
  "details": { ... }
}
```

---

## 🔐 Authentication

### Session-Based Authentication

**Login:**

```http
POST /api/auth/login
Content-Type: application/json

{
  "username": "admin",
  "password": "your_password"
}
```

**Response:**
```json
{
  "success": true,
  "data": {
    "user_id": "123",
    "username": "admin",
    "session_expires": "2025-11-20T12:00:00Z"
  }
}
```

**Logout:**

```http
POST /api/auth/logout
Cookie: session=...
```

**Check Authentication Status:**

```http
GET /api/auth/status
Cookie: session=...
```

**Response:**
```json
{
  "success": true,
  "data": {
    "authenticated": true,
    "user": {
      "id": "123",
      "username": "admin"
    }
  }
}
```

### API Key Authentication (Alternative)

Some endpoints support API key authentication:

```http
GET /api/services
Authorization: Bearer YOUR_API_KEY
```

---

## 🎛️ Dashboard API

### Jarvis AI

#### Chat with Jarvis

```http
POST /api/jarvis/chat
Content-Type: application/json
Cookie: session=...

{
  "message": "Show me running services",
  "session_id": "abc123",
  "context": {
    "previous_messages": []
  }
}
```

**Response:**
```json
{
  "success": true,
  "data": {
    "response": "I found 15 services running. Here's the breakdown:\n- homelab-dashboard (healthy)\n- stream-bot (healthy)\n...",
    "session_id": "abc123",
    "actions": [
      {
        "type": "list_services",
        "executed": true
      }
    ],
    "suggestions": [
      "Would you like to see resource usage?",
      "I can restart a specific service if needed"
    ]
  }
}
```

#### Marketplace Installation via Jarvis

```http
POST /api/jarvis/marketplace/install
Content-Type: application/json
Cookie: session=...

{
  "app_name": "wordpress",
  "instance_name": "myblog",
  "domain": "blog.mydomain.com",
  "database": "mysql",
  "auto_configure": true
}
```

**Response:**
```json
{
  "success": true,
  "data": {
    "deployment_id": "42",
    "status": "deploying",
    "estimated_time": 120,
    "progress_url": "/api/marketplace/deployments/42"
  },
  "message": "WordPress deployment started"
}
```

#### Marketplace Wizard

**Step-by-step configuration:**

```http
POST /api/jarvis/marketplace/wizard/step
Content-Type: application/json
Cookie: session=...

{
  "wizard_id": "wiz_123",
  "step": 1,
  "data": {
    "app_name": "wordpress",
    "instance_name": "myblog"
  }
}
```

**Response:**
```json
{
  "success": true,
  "data": {
    "wizard_id": "wiz_123",
    "current_step": 2,
    "total_steps": 4,
    "next_question": "Which domain should WordPress use?",
    "options": ["blog.mydomain.com", "custom"],
    "validation": {
      "required": true,
      "pattern": "^[a-z0-9.-]+\\.[a-z]{2,}$"
    }
  }
}
```

### Marketplace

#### List Templates

```http
GET /api/marketplace/templates
```

**Query Parameters:**
- `category` (optional): `apps`, `databases`, `stacks`
- `search` (optional): Search keyword

**Response:**
```json
{
  "success": true,
  "data": {
    "templates": [
      {
        "id": "wordpress",
        "name": "WordPress",
        "category": "apps",
        "description": "Popular CMS and blogging platform",
        "icon": "📝",
        "version": "6.4",
        "tags": ["cms", "blog", "php"],
        "requirements": {
          "database": true,
          "min_memory": "512M",
          "min_cpu": "1"
        }
      }
    ],
    "count": 15,
    "categories": {
      "apps": 8,
      "databases": 4,
      "stacks": 3
    }
  }
}
```

#### Get Template Details

```http
GET /api/marketplace/templates/apps/wordpress
```

**Response:**
```json
{
  "success": true,
  "data": {
    "id": "wordpress",
    "name": "WordPress",
    "category": "apps",
    "description": "WordPress is a free and open-source content management system...",
    "version": "6.4",
    "docker_image": "wordpress:6.4-apache",
    "ports": [
      { "container": 80, "description": "HTTP" }
    ],
    "environment_variables": [
      {
        "key": "WORDPRESS_DB_HOST",
        "description": "Database hostname",
        "required": true,
        "default": "mysql:3306"
      },
      {
        "key": "WORDPRESS_DB_NAME",
        "description": "Database name",
        "required": true
      }
    ],
    "volumes": [
      "/var/www/html"
    ],
    "dependencies": ["mysql"],
    "documentation_url": "https://wordpress.org/documentation"
  }
}
```

#### Validate Template Configuration

```http
POST /api/marketplace/templates/apps/wordpress/validate
Content-Type: application/json

{
  "instance_name": "myblog",
  "domain": "blog.mydomain.com",
  "environment": {
    "WORDPRESS_DB_NAME": "myblog_db",
    "WORDPRESS_DB_USER": "wp_user",
    "WORDPRESS_DB_PASSWORD": "secure_password"
  }
}
```

**Response:**
```json
{
  "success": true,
  "data": {
    "valid": true,
    "warnings": [
      "Port 8080 is already in use, will auto-assign alternative"
    ],
    "suggestions": {
      "WORDPRESS_DB_PASSWORD": "Consider using a stronger password"
    }
  }
}
```

#### Generate Docker Compose

```http
POST /api/marketplace/templates/apps/wordpress/compose
Content-Type: application/json

{
  "instance_name": "myblog",
  "domain": "blog.mydomain.com",
  "environment": { ... }
}
```

**Response:**
```json
{
  "success": true,
  "data": {
    "compose_yaml": "version: '3.8'\nservices:\n  myblog:\n    image: wordpress:6.4-apache\n    ...",
    "preview": true
  }
}
```

#### Install from Marketplace

```http
POST /api/marketplace/install
Content-Type: application/json
Cookie: session=...

{
  "template_id": "wordpress",
  "instance_name": "myblog",
  "domain": "blog.mydomain.com",
  "environment": {
    "WORDPRESS_DB_NAME": "myblog_db",
    "WORDPRESS_DB_USER": "wp_user",
    "WORDPRESS_DB_PASSWORD": "secure_password"
  },
  "database": {
    "type": "mysql",
    "name": "myblog_db"
  }
}
```

**Response:**
```json
{
  "success": true,
  "data": {
    "deployment_id": 42,
    "status": "deploying",
    "containers": ["myblog", "myblog_db"],
    "estimated_completion": "2025-11-19T13:45:00Z"
  },
  "message": "Deployment started"
}
```

#### List Deployments

```http
GET /api/marketplace/deployments
```

**Response:**
```json
{
  "success": true,
  "data": {
    "deployments": [
      {
        "id": 42,
        "template_id": "wordpress",
        "instance_name": "myblog",
        "status": "running",
        "domain": "blog.mydomain.com",
        "created_at": "2025-11-19T13:00:00Z",
        "containers": [
          {
            "name": "myblog",
            "status": "running",
            "uptime": "2h 15m"
          }
        ],
        "resources": {
          "cpu": "5%",
          "memory": "256M / 512M"
        }
      }
    ],
    "count": 5
  }
}
```

#### Get Deployment Details

```http
GET /api/marketplace/deployments/42
```

**Response:**
```json
{
  "success": true,
  "data": {
    "id": 42,
    "template_id": "wordpress",
    "instance_name": "myblog",
    "status": "running",
    "domain": "blog.mydomain.com",
    "url": "https://blog.mydomain.com",
    "containers": [
      {
        "id": "abc123",
        "name": "myblog",
        "image": "wordpress:6.4-apache",
        "status": "running",
        "created": "2025-11-19T13:00:00Z",
        "ports": ["80/tcp -> 8080"]
      }
    ],
    "environment": {
      "WORDPRESS_DB_HOST": "mysql:3306",
      "WORDPRESS_DB_NAME": "myblog_db"
    },
    "logs_url": "/api/marketplace/deployments/42/logs"
  }
}
```

#### Control Deployment

**Start:**
```http
POST /api/marketplace/deployments/42/start
```

**Stop:**
```http
POST /api/marketplace/deployments/42/stop
```

**Restart:**
```http
POST /api/marketplace/deployments/42/restart
```

**Delete:**
```http
DELETE /api/marketplace/deployments/42
Content-Type: application/json

{
  "delete_volumes": true,
  "delete_networks": false
}
```

**Response:**
```json
{
  "success": true,
  "message": "Deployment stopped and removed",
  "data": {
    "containers_removed": ["myblog", "myblog_db"],
    "volumes_removed": ["myblog_data"],
    "networks_preserved": ["homelab"]
  }
}
```

### Services

#### List All Services

```http
GET /api/services
```

**Response:**
```json
{
  "success": true,
  "data": {
    "services": [
      {
        "id": "homelab-dashboard",
        "name": "Nebula Command Dashboard",
        "status": "running",
        "health": "healthy",
        "uptime": "5d 12h 34m",
        "cpu": "8%",
        "memory": "256M / 1G",
        "ports": ["5000/tcp"],
        "url": "https://host.yourdomain.com"
      },
      {
        "id": "stream-bot",
        "name": "Stream Bot",
        "status": "running",
        "health": "healthy",
        "uptime": "5d 12h 30m",
        "cpu": "12%",
        "memory": "384M / 1G",
        "ports": ["3000/tcp"],
        "url": "https://stream.yourdomain.com"
      }
    ],
    "count": 15,
    "summary": {
      "running": 15,
      "stopped": 0,
      "error": 0
    }
  }
}
```

#### Get Service Details

```http
GET /api/services/stream-bot
```

**Response:**
```json
{
  "success": true,
  "data": {
    "id": "stream-bot",
    "name": "Stream Bot",
    "container_id": "abc123def456",
    "status": "running",
    "health": "healthy",
    "created_at": "2025-11-14T10:00:00Z",
    "started_at": "2025-11-14T10:01:23Z",
    "image": "stream-bot:latest",
    "uptime": "5d 12h 34m",
    "restart_count": 0,
    "resources": {
      "cpu_percent": 12.5,
      "memory_usage": "384M",
      "memory_limit": "1G",
      "memory_percent": 37.5,
      "network_rx": "1.2GB",
      "network_tx": "856MB"
    },
    "ports": [
      {"container": 3000, "host": 3000}
    ],
    "environment": {
      "NODE_ENV": "production",
      "PORT": "3000"
    },
    "volumes": [
      "/app/data:/data"
    ]
  }
}
```

#### Control Services

**Start Service:**
```http
POST /api/services/stream-bot/start
```

**Stop Service:**
```http
POST /api/services/stream-bot/stop
```

**Restart Service:**
```http
POST /api/services/stream-bot/restart
```

**Response (all actions):**
```json
{
  "success": true,
  "message": "Service restarted successfully",
  "data": {
    "service_id": "stream-bot",
    "status": "running",
    "restart_time": "3.2s"
  }
}
```

#### Get Service Logs

```http
GET /api/services/stream-bot/logs?tail=100&since=1h
```

**Query Parameters:**
- `tail` (optional): Number of lines (default: 100)
- `since` (optional): Time range (1h, 24h, 7d)
- `follow` (optional): Stream logs (true/false)
- `level` (optional): Filter by log level (ERROR, WARN, INFO)

**Response:**
```json
{
  "success": true,
  "data": {
    "logs": [
      {
        "timestamp": "2025-11-19T13:45:23.123Z",
        "level": "INFO",
        "message": "Bot connected to Twitch",
        "service": "stream-bot"
      },
      {
        "timestamp": "2025-11-19T13:45:24.456Z",
        "level": "INFO",
        "message": "Listening for chat messages",
        "service": "stream-bot"
      }
    ],
    "count": 100,
    "has_more": true
  }
}
```

### System

#### System Health

```http
GET /api/system/health
```

**Response:**
```json
{
  "success": true,
  "data": {
    "status": "healthy",
    "uptime": "5d 12h 45m",
    "services": {
      "total": 15,
      "running": 15,
      "stopped": 0,
      "error": 0
    },
    "resources": {
      "cpu": {
        "usage": 35.2,
        "cores": 8
      },
      "memory": {
        "used": "8.2G",
        "total": "16G",
        "percent": 51.25
      },
      "disk": {
        "used": "45G",
        "total": "100G",
        "percent": 45.0
      }
    },
    "checks": {
      "docker": "healthy",
      "database": "healthy",
      "redis": "healthy",
      "minio": "healthy",
      "caddy": "healthy"
    }
  }
}
```

#### System Metrics

```http
GET /api/system/metrics?range=1h&interval=5m
```

**Query Parameters:**
- `range`: Time range (1h, 6h, 24h, 7d)
- `interval`: Data point interval (1m, 5m, 15m, 1h)

**Response:**
```json
{
  "success": true,
  "data": {
    "cpu": [
      {"timestamp": "2025-11-19T13:00:00Z", "value": 32.5},
      {"timestamp": "2025-11-19T13:05:00Z", "value": 35.2}
    ],
    "memory": [
      {"timestamp": "2025-11-19T13:00:00Z", "value": 50.1},
      {"timestamp": "2025-11-19T13:05:00Z", "value": 51.25}
    ],
    "network": {
      "rx": [...],
      "tx": [...]
    }
  }
}
```

#### Docker Containers

```http
GET /api/system/docker/containers
```

**Response:**
```json
{
  "success": true,
  "data": {
    "containers": [
      {
        "id": "abc123",
        "name": "homelab-dashboard",
        "image": "homelab-dashboard:latest",
        "status": "running",
        "created": "2025-11-14T10:00:00Z",
        "ports": ["5000/tcp"],
        "networks": ["homelab"]
      }
    ],
    "count": 15
  }
}
```

#### Docker Images

```http
GET /api/system/docker/images
```

**Response:**
```json
{
  "success": true,
  "data": {
    "images": [
      {
        "id": "sha256:abc123...",
        "tags": ["homelab-dashboard:latest"],
        "size": "1.2GB",
        "created": "2025-11-14T09:00:00Z"
      }
    ],
    "count": 20,
    "total_size": "15.6GB"
  }
}
```

### Logs

#### Search Logs

```http
POST /api/logs/search
Content-Type: application/json

{
  "services": ["stream-bot", "discord-bot"],
  "level": "ERROR",
  "search": "connection",
  "time_range": {
    "start": "2025-11-19T00:00:00Z",
    "end": "2025-11-19T23:59:59Z"
  },
  "limit": 100
}
```

**Response:**
```json
{
  "success": true,
  "data": {
    "logs": [
      {
        "timestamp": "2025-11-19T13:45:23.123Z",
        "service": "stream-bot",
        "level": "ERROR",
        "message": "Database connection failed: ECONNREFUSED",
        "metadata": {
          "error_code": "ECONNREFUSED",
          "retry_attempt": 1
        }
      }
    ],
    "count": 5,
    "total_matches": 5
  }
}
```

#### Stream Logs (WebSocket)

```javascript
const ws = new WebSocket('wss://host.yourdomain.com/api/logs/stream');

ws.onopen = () => {
  ws.send(JSON.stringify({
    action: 'subscribe',
    services: ['stream-bot'],
    level: 'INFO'
  }));
};

ws.onmessage = (event) => {
  const log = JSON.parse(event.data);
  console.log(log);
  // {
  //   timestamp: "2025-11-19T13:45:23.123Z",
  //   service: "stream-bot",
  //   level: "INFO",
  //   message: "..."
  // }
};
```

---

## 🤖 Stream Bot API

### Authentication

#### OAuth Sign-In URLs

**Twitch:**
```http
GET /api/auth/twitch
```
Redirects to Twitch OAuth.

**Callback:**
```http
GET /api/auth/twitch/callback?code=...&state=...
```

**YouTube:**
```http
GET /api/auth/youtube
```

**Kick:**
```http
GET /api/auth/kick
```

**Spotify:**
```http
GET /api/auth/spotify
```

#### Logout

```http
POST /api/auth/logout
Cookie: session=...
```

### Analytics

#### Overview

```http
GET /api/analytics/overview?range=7d
```

**Query Parameters:**
- `range`: `24h`, `7d`, `30d`, `all`

**Response:**
```json
{
  "success": true,
  "data": {
    "viewers": {
      "current": 142,
      "peak": 256,
      "average": 98,
      "unique_chatters": 87
    },
    "followers": {
      "total": 1523,
      "new_today": 12,
      "new_this_week": 87,
      "growth_rate": 5.7
    },
    "engagement": {
      "messages_per_minute": 15.3,
      "chat_activity_score": 8.5,
      "active_chatters_percent": 61.2
    },
    "streaming": {
      "total_hours": 45.5,
      "average_duration": "3h 45m",
      "uptime_percent": 99.2
    }
  }
}
```

#### Sentiment Analysis

```http
GET /api/analytics/sentiment?stream_id=123
```

**Response:**
```json
{
  "success": true,
  "data": {
    "overall": {
      "positive": 65.2,
      "neutral": 30.1,
      "negative": 4.7
    },
    "timeline": [
      {
        "timestamp": "2025-11-19T13:00:00Z",
        "positive": 70,
        "neutral": 25,
        "negative": 5
      }
    ],
    "trending_phrases": [
      {"phrase": "POGGERS", "count": 145, "sentiment": "positive"},
      {"phrase": "nice play", "count": 89, "sentiment": "positive"}
    ],
    "word_cloud": {
      "positive": ["great", "awesome", "love", "amazing"],
      "negative": ["lag", "boring"]
    }
  }
}
```

#### Growth Metrics

```http
GET /api/analytics/growth?range=30d
```

**Response:**
```json
{
  "success": true,
  "data": {
    "followers": {
      "start": 1200,
      "end": 1523,
      "growth": 323,
      "growth_percent": 26.9,
      "daily_average": 10.8
    },
    "timeline": [
      {"date": "2025-10-20", "followers": 1200, "new": 8},
      {"date": "2025-10-21", "followers": 1212, "new": 12}
    ],
    "predictions": {
      "next_30_days": 1850,
      "confidence": 0.85
    }
  }
}
```

#### Export Analytics

```http
GET /api/analytics/export?format=csv&range=30d
```

**Query Parameters:**
- `format`: `csv`, `json`, `pdf`
- `range`: Time range

**Response:**
```
Content-Type: text/csv
Content-Disposition: attachment; filename="analytics-2025-11-19.csv"

Date,Viewers,Followers,Messages,Sentiment
2025-10-20,95,1200,1234,0.65
2025-10-21,102,1212,1456,0.68
```

### Moderation

#### List Rules

```http
GET /api/moderation/rules
```

**Response:**
```json
{
  "success": true,
  "data": {
    "rules": [
      {
        "id": 1,
        "name": "Toxic Language Filter",
        "type": "toxic_language",
        "enabled": true,
        "sensitivity": "high",
        "action": "timeout",
        "timeout_duration": 600,
        "platforms": ["twitch", "youtube", "kick"]
      },
      {
        "id": 2,
        "name": "Spam Filter",
        "type": "spam",
        "enabled": true,
        "action": "delete",
        "max_repeated": 3,
        "time_window": 30
      }
    ],
    "count": 5
  }
}
```

#### Create Rule

```http
POST /api/moderation/rules
Content-Type: application/json

{
  "name": "Link Blocker",
  "type": "link_blocking",
  "enabled": true,
  "action": "delete",
  "allow_subscribers": true,
  "whitelist": ["twitch.tv", "youtube.com"],
  "platforms": ["twitch", "youtube"]
}
```

**Response:**
```json
{
  "success": true,
  "data": {
    "rule_id": 6,
    "name": "Link Blocker",
    "enabled": true
  },
  "message": "Moderation rule created"
}
```

#### Update Rule

```http
PUT /api/moderation/rules/6
Content-Type: application/json

{
  "enabled": false,
  "action": "warn"
}
```

#### Delete Rule

```http
DELETE /api/moderation/rules/6
```

#### Moderation Logs

```http
GET /api/moderation/logs?limit=50&platform=twitch
```

**Response:**
```json
{
  "success": true,
  "data": {
    "logs": [
      {
        "id": 1234,
        "timestamp": "2025-11-19T13:45:23Z",
        "platform": "twitch",
        "user": "spammer123",
        "rule": "Spam Filter",
        "action": "timeout",
        "duration": 600,
        "message": "BUY MY STUFF!!! BUY MY STUFF!!!",
        "moderator": "bot"
      }
    ],
    "count": 50
  }
}
```

### Giveaways

#### List Giveaways

```http
GET /api/giveaways?status=active
```

**Query Parameters:**
- `status`: `active`, `completed`, `all`

**Response:**
```json
{
  "success": true,
  "data": {
    "giveaways": [
      {
        "id": 42,
        "title": "Keyboard Giveaway",
        "description": "Win a custom mechanical keyboard!",
        "status": "active",
        "created_at": "2025-11-19T13:00:00Z",
        "ends_at": "2025-11-19T14:00:00Z",
        "entry_count": 142,
        "winner": null,
        "platforms": ["twitch", "youtube"]
      }
    ],
    "count": 1
  }
}
```

#### Create Giveaway

```http
POST /api/giveaways
Content-Type: application/json

{
  "title": "Keyboard Giveaway",
  "description": "Win a custom mechanical keyboard!",
  "entry_command": "!enter",
  "duration": 3600,
  "eligibility": {
    "subscribers_only": true,
    "min_follow_days": 30,
    "min_account_age_days": 180,
    "exclude_previous_winners": true
  },
  "platforms": ["twitch", "youtube"]
}
```

**Response:**
```json
{
  "success": true,
  "data": {
    "giveaway_id": 43,
    "status": "active",
    "ends_at": "2025-11-19T14:00:00Z"
  },
  "message": "Giveaway created and started"
}
```

#### Get Giveaway Details

```http
GET /api/giveaways/42
```

#### Start Giveaway

```http
POST /api/giveaways/42/start
```

#### End Giveaway

```http
POST /api/giveaways/42/end
```

#### Select Winner

```http
POST /api/giveaways/42/select-winner
Content-Type: application/json

{
  "method": "random",
  "announce": true
}
```

**Response:**
```json
{
  "success": true,
  "data": {
    "winner": {
      "username": "luckyviewer123",
      "platform": "twitch",
      "entry_time": "2025-11-19T13:15:00Z"
    },
    "announced": true,
    "total_entries": 142
  },
  "message": "Winner selected and announced"
}
```

#### Get Giveaway Entries

```http
GET /api/giveaways/42/entries
```

**Response:**
```json
{
  "success": true,
  "data": {
    "entries": [
      {
        "username": "viewer1",
        "platform": "twitch",
        "entry_time": "2025-11-19T13:10:00Z",
        "is_subscriber": true
      }
    ],
    "count": 142
  }
}
```

### OBS Control

#### Connect to OBS

```http
POST /api/obs/connect
Content-Type: application/json

{
  "host": "localhost",
  "port": 4455,
  "password": "your_obs_password"
}
```

**Response:**
```json
{
  "success": true,
  "data": {
    "connected": true,
    "obs_version": "29.0.2",
    "websocket_version": "5.0.1"
  },
  "message": "Connected to OBS Studio"
}
```

#### Get Scenes

```http
GET /api/obs/scenes
```

**Response:**
```json
{
  "success": true,
  "data": {
    "current_scene": "Gaming",
    "scenes": [
      {"name": "Starting Soon", "index": 0},
      {"name": "Gaming", "index": 1},
      {"name": "Just Chatting", "index": 2},
      {"name": "BRB", "index": 3},
      {"name": "Ending Soon", "index": 4}
    ]
  }
}
```

#### Activate Scene

```http
POST /api/obs/scenes/2/activate
```

**Response:**
```json
{
  "success": true,
  "data": {
    "scene_name": "Just Chatting",
    "previous_scene": "Gaming"
  },
  "message": "Scene activated"
}
```

#### Get Sources

```http
GET /api/obs/sources?scene=Gaming
```

**Response:**
```json
{
  "success": true,
  "data": {
    "scene": "Gaming",
    "sources": [
      {
        "name": "Game Capture",
        "type": "game_capture",
        "visible": true,
        "enabled": true
      },
      {
        "name": "Webcam",
        "type": "video_capture",
        "visible": true,
        "enabled": true
      }
    ]
  }
}
```

#### Toggle Source

```http
POST /api/obs/sources/Webcam/toggle
Content-Type: application/json

{
  "visible": false
}
```

#### List Automations

```http
GET /api/obs/automations
```

#### Create Automation

```http
POST /api/obs/automations
Content-Type: application/json

{
  "name": "Follower Alert",
  "trigger": {
    "type": "follower",
    "platform": "twitch"
  },
  "action": {
    "type": "show_source",
    "source": "Alert Box",
    "duration": 5000
  },
  "enabled": true
}
```

#### Update Automation

```http
PUT /api/obs/automations/1
Content-Type: application/json

{
  "enabled": false
}
```

#### Delete Automation

```http
DELETE /api/obs/automations/1
```

### Custom Commands

#### List Commands

```http
GET /api/commands
```

**Response:**
```json
{
  "success": true,
  "data": {
    "commands": [
      {
        "id": 1,
        "trigger": "!socials",
        "response": "Follow me on Twitter @handle | Discord: discord.gg/invite",
        "cooldown": 30,
        "permission": "everyone",
        "enabled": true,
        "use_count": 145
      }
    ],
    "count": 12
  }
}
```

#### Create Command

```http
POST /api/commands
Content-Type: application/json

{
  "trigger": "!discord",
  "response": "Join our Discord: discord.gg/invite",
  "cooldown": 60,
  "permission": "everyone",
  "enabled": true
}
```

#### Update Command

```http
PUT /api/commands/1
Content-Type: application/json

{
  "response": "Updated response text",
  "cooldown": 45
}
```

#### Delete Command

```http
DELETE /api/commands/1
```

#### Test Command

```http
POST /api/commands/1/test
Content-Type: application/json

{
  "user": "TestUser",
  "message": "!socials",
  "context": {
    "is_subscriber": false,
    "is_moderator": false
  }
}
```

**Response:**
```json
{
  "success": true,
  "data": {
    "output": "Follow me on Twitter @handle | Discord: discord.gg/invite",
    "executed": true,
    "cooldown_remaining": 0
  }
}
```

### Bot Control

#### Bot Status

```http
GET /api/bot/status
```

**Response:**
```json
{
  "success": true,
  "data": {
    "status": "online",
    "platforms": {
      "twitch": {
        "connected": true,
        "streaming": true,
        "viewers": 142
      },
      "youtube": {
        "connected": true,
        "streaming": false
      },
      "kick": {
        "connected": false
      }
    },
    "uptime": "5d 12h 34m",
    "messages_processed": 15234
  }
}
```

#### Start Bot

```http
POST /api/bot/start
```

#### Stop Bot

```http
POST /api/bot/stop
```

#### Restart Bot

```http
POST /api/bot/restart
```

---

## 🔌 WebSocket Events

### Dashboard WebSocket

**Connect:**
```javascript
const ws = new WebSocket('wss://host.yourdomain.com/ws');
```

**Event Types:**

#### Service Status Update
```json
{
  "type": "service_status",
  "data": {
    "service_id": "stream-bot",
    "status": "running",
    "health": "healthy"
  }
}
```

#### Resource Update
```json
{
  "type": "resource_update",
  "data": {
    "cpu": 35.2,
    "memory": 51.25,
    "timestamp": "2025-11-19T13:45:00Z"
  }
}
```

#### Deployment Progress
```json
{
  "type": "deployment_progress",
  "data": {
    "deployment_id": 42,
    "status": "pulling_images",
    "progress": 45,
    "message": "Pulling wordpress:6.4-apache"
  }
}
```

### Stream Bot WebSocket

**Connect:**
```javascript
const ws = new WebSocket('wss://stream.yourdomain.com/ws');
```

**Event Types:**

#### Chat Message
```json
{
  "type": "chat_message",
  "data": {
    "platform": "twitch",
    "username": "viewer123",
    "message": "Hello stream!",
    "timestamp": "2025-11-19T13:45:23Z",
    "badges": ["subscriber"]
  }
}
```

#### Bot Status Change
```json
{
  "type": "bot_status",
  "data": {
    "status": "online",
    "platform": "twitch"
  }
}
```

#### Giveaway Update
```json
{
  "type": "giveaway_update",
  "data": {
    "giveaway_id": 42,
    "event": "winner_selected",
    "winner": "luckyviewer123"
  }
}
```

#### Analytics Update
```json
{
  "type": "analytics",
  "data": {
    "viewers": 142,
    "followers": 1523,
    "chat_messages_per_min": 15.3
  }
}
```

#### OBS Event
```json
{
  "type": "obs_event",
  "data": {
    "event": "scene_changed",
    "from": "Gaming",
    "to": "Just Chatting"
  }
}
```

---

## ⚠️ Error Handling

### Error Response Format

```json
{
  "success": false,
  "error": "Resource not found",
  "code": "RESOURCE_NOT_FOUND",
  "details": {
    "resource_type": "deployment",
    "resource_id": "999"
  },
  "timestamp": "2025-11-19T13:45:23Z"
}
```

### Common Error Codes

| Code | HTTP Status | Description |
|------|-------------|-------------|
| `UNAUTHORIZED` | 401 | Authentication required |
| `FORBIDDEN` | 403 | Insufficient permissions |
| `RESOURCE_NOT_FOUND` | 404 | Resource doesn't exist |
| `VALIDATION_ERROR` | 400 | Invalid request data |
| `CONFLICT` | 409 | Resource conflict (duplicate) |
| `RATE_LIMIT_EXCEEDED` | 429 | Too many requests |
| `INTERNAL_ERROR` | 500 | Server error |
| `SERVICE_UNAVAILABLE` | 503 | Service temporarily down |

### Error Examples

**Unauthorized:**
```json
{
  "success": false,
  "error": "Authentication required",
  "code": "UNAUTHORIZED",
  "details": {
    "login_url": "/api/auth/login"
  }
}
```

**Validation Error:**
```json
{
  "success": false,
  "error": "Validation failed",
  "code": "VALIDATION_ERROR",
  "details": {
    "fields": {
      "domain": "Invalid domain format",
      "instance_name": "Name already in use"
    }
  }
}
```

---

## 🚦 Rate Limiting

### Limits

| Endpoint Type | Limit | Window |
|--------------|-------|---------|
| **Authentication** | 5 requests | 1 minute |
| **Read Operations** | 60 requests | 1 minute |
| **Write Operations** | 30 requests | 1 minute |
| **WebSocket Connections** | 10 connections | Per user |

### Rate Limit Headers

```http
X-RateLimit-Limit: 60
X-RateLimit-Remaining: 45
X-RateLimit-Reset: 1605887400
```

### Rate Limit Exceeded

```json
{
  "success": false,
  "error": "Rate limit exceeded",
  "code": "RATE_LIMIT_EXCEEDED",
  "details": {
    "limit": 60,
    "window": "1m",
    "retry_after": 42
  }
}
```

---

## 📚 SDKs and Libraries

### JavaScript/TypeScript SDK

```bash
npm install @nebula-command/sdk
```

```typescript
import { NebulaClient } from '@nebula-command/sdk';

const client = new NebulaClient({
  baseUrl: 'https://host.yourdomain.com',
  apiKey: 'your-api-key'
});

// List services
const services = await client.services.list();

// Start service
await client.services.start('stream-bot');

// Deploy from marketplace
const deployment = await client.marketplace.deploy({
  templateId: 'wordpress',
  instanceName: 'myblog',
  domain: 'blog.mydomain.com'
});
```

### Python SDK

```bash
pip install nebula-command
```

```python
from nebula_command import NebulaClient

client = NebulaClient(
    base_url='https://host.yourdomain.com',
    api_key='your-api-key'
)

# List services
services = client.services.list()

# Get service logs
logs = client.services.logs('stream-bot', tail=100)

# Create giveaway
giveaway = client.stream_bot.giveaways.create(
    title='Keyboard Giveaway',
    duration=3600
)
```

### cURL Examples

**List Services:**
```bash
curl -X GET https://host.yourdomain.com/api/services \
  -H "Authorization: Bearer YOUR_API_KEY" \
  -H "Accept: application/json"
```

**Deploy from Marketplace:**
```bash
curl -X POST https://host.yourdomain.com/api/marketplace/install \
  -H "Content-Type: application/json" \
  -H "Authorization: Bearer YOUR_API_KEY" \
  -d '{
    "template_id": "wordpress",
    "instance_name": "myblog",
    "domain": "blog.mydomain.com"
  }'
```

---

## 🔗 Additional Resources

- **[USER_MANUAL.md](USER_MANUAL.md)** - Feature usage guide
- **[DEPLOYMENT_GUIDE.md](DEPLOYMENT_GUIDE.md)** - Setup instructions
- **[TROUBLESHOOTING_GUIDE.md](TROUBLESHOOTING_GUIDE.md)** - Common issues

---

**Last Updated:** November 2025  
**API Version:** 2.0  
**Platform:** Nebula Command AI Homelab
