# REST API Documentation

Complete API reference for the NebulaCommand Dashboard ecosystem.

---

## Table of Contents

1. [Authentication](#authentication)
2. [NebulaCommand Dashboard API](#homelab-dashboard-api)
3. [Discord Bot API](#discord-bot-api)
4. [Stream Bot API](#stream-bot-api)
5. [Error Handling](#error-handling)
6. [Rate Limiting](#rate-limiting)

---

## Authentication

### Session-Based Authentication

All dashboard endpoints use session-based authentication with cookies.

```bash
# Login required for protected endpoints
Cookie: session=<session-token>
```

### API Key Authentication (Jarvis)

Some endpoints support API key authentication:

```bash
# Header-based API key
Authorization: Bearer <api-key>

# OR query parameter
?api_key=<api-key>
```

---

## NebulaCommand Dashboard API

Base URL: `https://host.evindrake.net`

### System & Monitoring

#### GET /health
Health check endpoint.

**Response:**
```json
{
  "status": "healthy",
  "timestamp": "2025-11-16T12:00:00Z",
  "services": {
    "database": "ok",
    "redis": "ok",
    "minio": "ok"
  }
}
```

#### GET /api/system/stats
Get system resource statistics.

**Response:**
```json
{
  "cpu_percent": 45.2,
  "memory_percent": 62.1,
  "disk_percent": 38.7,
  "uptime": 86400,
  "docker_containers": {
    "running": 12,
    "total": 15
  }
}
```

#### GET /api/system/services
List all Docker services.

**Response:**
```json
{
  "services": [
    {
      "name": "homelab-dashboard",
      "status": "running",
      "health": "healthy",
      "uptime": "2 days"
    }
  ]
}
```

### Docker Management

#### GET /api/docker/containers
List all Docker containers.

**Response:**
```json
{
  "containers": [
    {
      "id": "abc123",
      "name": "discord-bot",
      "status": "running",
      "image": "discord-bot:latest",
      "ports": ["5000:5000"]
    }
  ]
}
```

#### POST /api/docker/containers/:id/restart
Restart a specific container.

**Response:**
```json
{
  "success": true,
  "message": "Container restarted successfully"
}
```

#### POST /api/docker/containers/:id/stop
Stop a specific container.

#### POST /api/docker/containers/:id/start
Start a specific container.

### Domain Management

#### GET /api/domains
List all managed domains.

**Response:**
```json
{
  "domains": [
    {
      "id": 1,
      "domain": "host.evindrake.net",
      "ip_address": "123.45.67.89",
      "dns_provider": "zoneedit",
      "ssl_status": "valid",
      "ssl_expiry": "2025-02-15T00:00:00Z",
      "health_status": "healthy",
      "last_checked": "2025-11-16T12:00:00Z"
    }
  ]
}
```

#### POST /api/domains
Create a new domain record.

**Request:**
```json
{
  "domain": "new.example.com",
  "dns_provider": "zoneedit",
  "target_ip": "auto"
}
```

#### GET /api/domains/:id/health
Check domain health.

**Response:**
```json
{
  "domain": "host.evindrake.net",
  "dns_resolves": true,
  "https_accessible": true,
  "ssl_valid": true,
  "ssl_expiry_days": 75,
  "response_time_ms": 234
}
```

#### POST /api/domains/:id/provision
Provision a new domain with DNS and SSL.

**Response:**
```json
{
  "status": "provisioning",
  "steps": {
    "dns_created": true,
    "dns_propagated": false,
    "caddy_configured": false,
    "ssl_obtained": false
  }
}
```

### Jarvis AI Assistant

#### POST /api/jarvis/chat
Send a message to Jarvis AI assistant.

**Request:**
```json
{
  "message": "Check system health",
  "context": "dashboard"
}
```

**Response:**
```json
{
  "response": "All systems are operational. CPU at 45%, Memory at 62%.",
  "actions_taken": [],
  "suggestions": ["Consider updating Plex"]
}
```

#### GET /api/jarvis/tasks
List all Jarvis autonomous tasks.

**Response:**
```json
{
  "tasks": [
    {
      "id": 1,
      "type": "health_check",
      "status": "completed",
      "created_at": "2025-11-16T10:00:00Z",
      "completed_at": "2025-11-16T10:01:30Z",
      "result": {
        "all_healthy": true
      }
    }
  ]
}
```

#### POST /api/jarvis/tasks
Create a new Jarvis task.

**Request:**
```json
{
  "task_type": "domain_health_check",
  "parameters": {
    "domain_id": 1
  },
  "auto_execute": false
}
```

#### GET /api/jarvis/actions
List available autonomous actions.

**Response:**
```json
{
  "actions": [
    {
      "name": "health_check_endpoints",
      "tier": "DIAGNOSE",
      "description": "Check health of all service endpoints",
      "requires_approval": false
    },
    {
      "name": "domain_ssl_renew",
      "tier": "REMEDIATE",
      "description": "Renew SSL certificate for domain",
      "requires_approval": true
    }
  ]
}
```

#### POST /api/jarvis/voice
Process voice command (speech-to-text).

**Request (multipart/form-data):**
```
audio: <audio-file>
```

**Response:**
```json
{
  "transcription": "Check system health",
  "response": "All systems operational",
  "audio_url": "/static/jarvis/response_12345.mp3"
}
```

### Deployment Management

#### POST /api/deployment/analyze
Analyze deployment configuration.

**Request:**
```json
{
  "compose_file": "docker-compose.unified.yml",
  "caddyfile": "Caddyfile"
}
```

**Response:**
```json
{
  "issues": [],
  "warnings": [
    "Service 'plex' has no healthcheck defined"
  ],
  "recommendations": [
    "Consider adding resource limits to all services"
  ]
}
```

#### POST /api/deployment/deploy
Trigger deployment workflow.

**Request:**
```json
{
  "services": ["discord-bot", "stream-bot"],
  "rebuild": true,
  "run_migrations": true
}
```

### Google Services Integration

#### GET /api/google/calendar/events
List calendar events.

**Query Parameters:**
- `start_date`: ISO 8601 date
- `end_date`: ISO 8601 date
- `max_results`: int (default: 50)

**Response:**
```json
{
  "events": [
    {
      "id": "event123",
      "summary": "Team Meeting",
      "start": "2025-11-16T14:00:00Z",
      "end": "2025-11-16T15:00:00Z",
      "location": "Conference Room A"
    }
  ]
}
```

#### POST /api/google/calendar/events
Create calendar event.

#### GET /api/google/gmail/messages
List Gmail messages.

#### POST /api/google/gmail/send
Send email via Gmail.

#### GET /api/google/drive/files
List Drive files.

### Celery Task Analytics

#### GET /api/celery/analytics
Get Celery task analytics.

**Response:**
```json
{
  "total_tasks": 1523,
  "tasks_by_status": {
    "SUCCESS": 1450,
    "FAILURE": 23,
    "PENDING": 50
  },
  "avg_runtime_seconds": 2.34,
  "tasks_by_type": {
    "domain_health_check": 450,
    "ssl_renewal": 12
  }
}
```

---

## Discord Bot API

Base URL: `https://bot.rig-city.com`

### Authentication

OAuth2 with Discord:

```
GET /auth/discord
GET /auth/discord/callback
POST /auth/logout
```

### Tickets

#### GET /api/tickets
List all tickets.

**Query Parameters:**
- `status`: open | closed | all (default: all)
- `assigned_to`: user ID
- `page`: int (default: 1)
- `per_page`: int (default: 20)

**Response:**
```json
{
  "tickets": [
    {
      "id": 1,
      "title": "Unable to access dashboard",
      "status": "open",
      "priority": "high",
      "created_at": "2025-11-16T10:00:00Z",
      "updated_at": "2025-11-16T11:30:00Z",
      "creator": {
        "id": "123456789",
        "username": "user#1234"
      },
      "assigned_to": null
    }
  ],
  "pagination": {
    "total": 45,
    "page": 1,
    "per_page": 20,
    "pages": 3
  }
}
```

#### POST /api/tickets
Create a new ticket.

**Request:**
```json
{
  "title": "Need help with deployment",
  "description": "Getting SSL errors",
  "priority": "medium",
  "category": "technical"
}
```

#### GET /api/tickets/:id
Get ticket details.

#### PATCH /api/tickets/:id
Update ticket.

**Request:**
```json
{
  "status": "closed",
  "resolution": "Issue resolved by updating DNS"
}
```

#### DELETE /api/tickets/:id
Delete ticket.

### Stream Notifications

#### GET /api/stream-notifications/configs
List stream notification configurations.

#### POST /api/stream-notifications/configs
Create notification config.

**Request:**
```json
{
  "platform": "twitch",
  "streamer_id": "shroud",
  "discord_channel_id": "123456789",
  "notification_template": "{{streamer}} is now live!"
}
```

#### POST /api/stream-notifications/test
Test notification delivery.

### Server Settings

#### GET /api/servers/:id/settings
Get Discord server settings.

#### PATCH /api/servers/:id/settings
Update server settings.

---

## Stream Bot API

Base URL: `https://stream.rig-city.com`

### Authentication

OAuth2 with Twitch/YouTube/Kick:

```
GET /api/auth/twitch
GET /api/auth/twitch/callback
GET /api/auth/youtube
GET /api/auth/youtube/callback
GET /api/auth/kick
GET /api/auth/kick/callback
POST /api/auth/logout
```

### Bot Configuration

#### GET /api/bot/config
Get bot configuration for current user.

**Response:**
```json
{
  "user_id": 12345,
  "platform": "twitch",
  "bot_enabled": true,
  "ai_personality": "friendly",
  "commands": [
    {
      "name": "!discord",
      "response": "Join our Discord: https://discord.gg/...",
      "enabled": true
    }
  ],
  "moderation": {
    "spam_filter": true,
    "link_filter": false,
    "caps_filter": true
  }
}
```

#### PATCH /api/bot/config
Update bot configuration.

### Custom Commands

#### GET /api/commands
List all custom commands.

#### POST /api/commands
Create custom command.

**Request:**
```json
{
  "name": "!website",
  "response": "Check out my website: https://example.com",
  "cooldown_seconds": 30,
  "enabled": true
}
```

#### PATCH /api/commands/:id
Update command.

#### DELETE /api/commands/:id
Delete command.

### AI Chatbot

#### GET /api/ai/config
Get AI chatbot configuration.

**Response:**
```json
{
  "enabled": true,
  "personality": "friendly",
  "response_rate": 0.3,
  "context_awareness": true,
  "model": "gpt-4"
}
```

#### PATCH /api/ai/config
Update AI configuration.

#### POST /api/ai/test
Test AI response.

**Request:**
```json
{
  "message": "What game are we playing?",
  "context": {
    "game": "Minecraft",
    "mood": "excited"
  }
}
```

### Analytics

#### GET /api/analytics/stats
Get stream statistics.

**Response:**
```json
{
  "total_messages": 15234,
  "unique_chatters": 423,
  "top_commands": [
    { "command": "!discord", "uses": 234 },
    { "command": "!website", "uses": 156 }
  ],
  "ai_interactions": 1523,
  "moderation_actions": 45
}
```

#### GET /api/analytics/viewer-activity
Get viewer activity over time.

### Giveaways

#### GET /api/giveaways
List all giveaways.

#### POST /api/giveaways
Create giveaway.

**Request:**
```json
{
  "title": "$50 Steam Gift Card",
  "duration_minutes": 60,
  "entry_command": "!enter",
  "max_entries": 1000,
  "winner_count": 1
}
```

#### POST /api/giveaways/:id/draw
Draw winner(s).

---

## Error Handling

### Standard Error Response

```json
{
  "error": {
    "code": "VALIDATION_ERROR",
    "message": "Invalid domain format",
    "details": {
      "field": "domain",
      "provided": "invalid..domain"
    }
  }
}
```

### HTTP Status Codes

| Code | Meaning |
|------|---------|
| 200 | Success |
| 201 | Created |
| 400 | Bad Request - Invalid input |
| 401 | Unauthorized - Authentication required |
| 403 | Forbidden - Insufficient permissions |
| 404 | Not Found |
| 429 | Too Many Requests - Rate limited |
| 500 | Internal Server Error |
| 503 | Service Unavailable |

### Error Codes

- `VALIDATION_ERROR` - Input validation failed
- `AUTHENTICATION_REQUIRED` - Not authenticated
- `PERMISSION_DENIED` - Insufficient permissions
- `RESOURCE_NOT_FOUND` - Requested resource doesn't exist
- `RATE_LIMIT_EXCEEDED` - Too many requests
- `INTERNAL_ERROR` - Server error
- `SERVICE_UNAVAILABLE` - Service temporarily down

---

## Rate Limiting

### Default Limits

- **Anonymous requests**: 60/hour
- **Authenticated requests**: 600/hour
- **AI endpoints**: 100/hour
- **Deployment endpoints**: 20/hour

### Rate Limit Headers

```
X-RateLimit-Limit: 600
X-RateLimit-Remaining: 542
X-RateLimit-Reset: 1700145600
```

### Rate Limit Response

```json
{
  "error": {
    "code": "RATE_LIMIT_EXCEEDED",
    "message": "Too many requests. Try again in 45 minutes.",
    "retry_after": 2700
  }
}
```

---

## WebSocket APIs

### Dashboard WebSocket

```javascript
// Connect to dashboard WebSocket
const ws = new WebSocket('wss://host.evindrake.net/ws');

// Subscribe to system updates
ws.send(JSON.stringify({
  type: 'subscribe',
  channels: ['system_stats', 'docker_events']
}));

// Receive updates
ws.onmessage = (event) => {
  const data = JSON.parse(event.data);
  console.log(data);
  // { type: 'system_stats', data: { cpu: 45.2, ... } }
};
```

### Stream Bot WebSocket

```javascript
// Connect to stream bot WebSocket
const ws = new WebSocket('wss://stream.rig-city.com/ws');

// Subscribe to chat events
ws.send(JSON.stringify({
  type: 'subscribe',
  events: ['chat_message', 'viewer_join']
}));
```

---

## SDK Examples

### Python (Dashboard)

```python
import requests

# Authenticate
session = requests.Session()
response = session.post('https://host.evindrake.net/api/login', json={
    'username': 'admin',
    'password': 'password'
})

# Get system stats
stats = session.get('https://host.evindrake.net/api/system/stats').json()
print(f"CPU: {stats['cpu_percent']}%")

# Create Jarvis task
task = session.post('https://host.evindrake.net/api/jarvis/tasks', json={
    'task_type': 'health_check_endpoints',
    'auto_execute': True
}).json()
```

### JavaScript (Frontend)

```javascript
// Fetch system stats
const stats = await fetch('/api/system/stats').then(r => r.json());
console.log(`CPU: ${stats.cpu_percent}%`);

// Create domain
const domain = await fetch('/api/domains', {
  method: 'POST',
  headers: { 'Content-Type': 'application/json' },
  body: JSON.stringify({
    domain: 'new.example.com',
    dns_provider: 'zoneedit'
  })
}).then(r => r.json());
```

---

**Last Updated**: November 2025  
**Version**: 2.0.0  
**Total Endpoints**: 150+
