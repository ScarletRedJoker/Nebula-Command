# Homelab Dashboard

A comprehensive Flask-based dashboard for managing homelab infrastructure, Docker containers, databases, deployments, and smart home devices.

## Features

### System Monitoring
- Real-time system statistics (CPU, memory, disk usage)
- Process monitoring
- Network interface statistics and bandwidth monitoring
- Container status and log viewing

### Docker Management
- List, start, stop, and restart containers
- View container logs
- Monitor container status and resource usage

### Database Management
- Create and manage PostgreSQL, MySQL, and MongoDB containers
- Database backups
- Connection string generation
- Template-based database deployment

### Deployment System
- Template-based service deployment
- Environment variable management
- Service lifecycle management (deploy, update, rebuild, remove)
- Multiple deployment strategies (rolling, blue-green, recreate)

### Jarvis AI Platform
- Voice-controlled deployments
- AI-powered conversational assistant
- Automated artifact building
- SSL certificate management
- Project and workflow management

### Smart Home Integration
- Home Assistant integration
- Device control (lights, switches, sensors, climate)
- Scene activation and automation triggers
- Voice command processing
- Pre-made automation templates

### File & Artifact Management
- File upload to MinIO object storage
- Artifact analysis and validation
- ZIP file extraction
- Artifact download with pre-signed URLs

### AI Assistant
- Log analysis
- Troubleshooting advice
- Conversational chat interface

### Network Management
- Port monitoring
- Connection tracking
- Interface statistics
- Bandwidth delta calculation

### Domain & SSL
- Domain health monitoring
- SSL certificate tracking
- DNS record verification

## Architecture

### Tech Stack
- **Backend**: Flask 3.0.0
- **Database**: PostgreSQL (via SQLAlchemy 2.0.23)
- **Task Queue**: Celery 5.3.4 with Redis 5.0.1
- **WebSocket**: Flask-Sock 0.7.0
- **Storage**: MinIO 7.2.0
- **Container Management**: Docker SDK 7.1.0
- **Migrations**: Alembic 1.13.1
- **AI Integration**: OpenAI >=1.55.3

### Components
- **Flask Application** (`app.py`): Main application with blueprint registration
- **Routes**: Modular blueprint-based routing
- **Services**: Business logic layer (Docker, System, AI, Database, etc.)
- **Models**: SQLAlchemy ORM models for database entities
- **Workers**: Celery workers for async tasks
- **Jarvis**: AI-powered deployment and automation system

## Setup & Installation

### Prerequisites
- Python 3.11+
- PostgreSQL database
- Redis server
- Docker daemon
- MinIO server (optional, for artifact storage)
- Home Assistant (optional, for smart home features)

### Installation

1. **Install dependencies**:
```bash
cd services/dashboard
pip install -r requirements.txt
```

2. **Set up environment variables** (see Environment Variables section)

3. **Run database migrations**:
```bash
alembic upgrade head
```

4. **Start Celery workers** (in separate terminals):
```bash
# Main worker
celery -A celery_app worker --loglevel=info

# Deployment queue worker
celery -A celery_app worker --loglevel=info -Q deployments
```

5. **Run the application**:
```bash
# Development
python app.py

# Production
gunicorn --bind 0.0.0.0:5000 --workers 4 --reuse-port app:app
```

## Environment Variables

### Required Variables
- `WEB_USERNAME` - Dashboard login username
- `WEB_PASSWORD` - Dashboard login password

### Flask Configuration
- `SESSION_SECRET` - Flask session secret key (auto-generated if not set)
- `FLASK_ENV` - Environment mode (development/production)

### Database
- `JARVIS_DATABASE_URL` - PostgreSQL connection string for Jarvis platform

### Redis & Celery
- `REDIS_URL` - Redis connection URL (default: `redis://localhost:6379/0`)

### WebSocket
- `DASHBOARD_API_KEY` - API key for WebSocket authentication (auto-generated if not set)
- `WEBSOCKET_PING_INTERVAL` - WebSocket ping interval in seconds (default: 25)
- `WEBSOCKET_PING_TIMEOUT` - WebSocket timeout in seconds (default: 60)

### Docker
- `DOCKER_HOST` - Docker daemon socket (default: `unix:///var/run/docker.sock`)

### SSH (Remote Execution)
- `SSH_HOST` - SSH host for remote commands (default: `localhost`)
- `SSH_PORT` - SSH port (default: `22`)
- `SSH_USER` - SSH username (default: `root`)
- `SSH_KEY_PATH` - Path to SSH private key (default: `/root/.ssh/id_rsa`)

### Service Paths
- `STATIC_SITE_PATH` - Path to static site files (default: `/var/www/scarletredjoker`)

### URLs
- `NOVNC_URL` - noVNC remote desktop URL (default: `https://vnc.evindrake.net`)
- `WINDOWS_KVM_IP` - Windows KVM IP address

### MinIO Object Storage
- `MINIO_ENDPOINT` - MinIO server endpoint (default: `minio:9000`)
- `MINIO_ROOT_USER` - MinIO access key (default: `admin`)
- `MINIO_ROOT_PASSWORD` - MinIO secret key (default: `minio_admin_password`)
- `MINIO_SECURE` - Use HTTPS for MinIO (default: `False`)

### Upload Settings
- `MAX_UPLOAD_SIZE` - Maximum upload size in bytes (default: 524288000 / 500MB)
- `ALLOWED_EXTENSIONS` - Comma-separated allowed file extensions (default: `zip,tar,gz,html,css,js,py,php,java,go,rs,dockerfile,sh,bash`)
- `UPLOAD_FOLDER` - Temporary upload directory (default: `/tmp/jarvis_uploads`)

### Celery Configuration
- `CELERY_TIMEZONE` - Timezone for Celery tasks (default: `America/New_York`)
- `CELERY_TASK_TIME_LIMIT` - Task hard time limit in seconds (default: 1800)
- `CELERY_TASK_SOFT_TIME_LIMIT` - Task soft time limit in seconds (default: 1500)

## API Endpoints

### Health Check
- `GET /health` - Service health status

### Web Routes (Blueprint: web)
- `GET,POST /login` - User login
- `GET /logout` - User logout
- `GET /` - Dashboard index
- `GET /dashboard` - Main dashboard
- `GET /logs` - Logs viewer
- `GET /ai-assistant` - AI assistant interface
- `GET /file-manager` - File manager
- `GET /remote-desktop` - Remote desktop viewer
- `GET /scripts` - Scripts management
- `GET /containers` - Container management
- `GET /system` - System monitoring
- `GET /databases` - Database management
- `GET /game-streaming` - Game streaming interface
- `GET /network` - Network monitoring
- `GET /domains` - Domain management
- `GET /game-connect` - Game connection interface

### System API (Blueprint: api, prefix: /api)
**System Information**
- `GET /api/system/info` - Get system information
- `GET /api/system/processes` - List running processes
- `GET /api/system/stats` - Real-time system statistics
- `GET /api/system/disk` - Disk partition information

**Container Management**
- `GET /api/containers` - List all containers
- `GET /api/containers/<container_name>/status` - Get container status
- `POST /api/containers/<container_name>/start` - Start container
- `POST /api/containers/<container_name>/stop` - Stop container
- `POST /api/containers/<container_name>/restart` - Restart container
- `GET /api/containers/<container_name>/logs` - Get container logs

**Service Status**
- `GET /api/services/status` - Get all service statuses

**AI Features**
- `POST /api/ai/analyze-logs` - Analyze logs with AI
- `POST /api/ai/chat` - Chat with AI assistant
- `POST /api/ai/troubleshoot` - Get troubleshooting advice

**Script Execution**
- `POST /api/scripts/execute` - Execute safe commands

**Database Management**
- `GET /api/databases` - List databases
- `POST /api/databases` - Create database
- `GET /api/databases/<container_name>` - Get database info
- `DELETE /api/databases/<container_name>` - Delete database
- `POST /api/databases/<container_name>/backup` - Backup database
- `GET /api/databases/templates` - Get database templates
- `GET /api/databases/<container_name>/connection-examples` - Get connection examples

**Network Monitoring**
- `GET /api/network/stats` - Network statistics
- `GET /api/network/interfaces` - Network interfaces
- `GET /api/network/connections` - Active connections
- `GET /api/network/ports` - Listening ports
- `GET /api/network/bandwidth` - Bandwidth usage

**Domain Management**
- `GET /api/domains` - Domain status summary
- `GET /api/domains/<subdomain>/check` - Check specific domain
- `GET /api/domains/ssl-certificates` - SSL certificate status

**Activity Log**
- `GET /api/activity/recent` - Recent activity log

### Deployment API (Blueprint: deployment, prefix: /api/deployment)
**Templates**
- `GET /api/deployment/templates` - List service templates
- `GET /api/deployment/templates/<template_id>` - Get template details

**Service Deployment**
- `POST /api/deployment/deploy` - Deploy new service
- `GET /api/deployment/services` - List deployed services
- `GET /api/deployment/services/<service_name>` - Get service details
- `DELETE /api/deployment/services/<service_name>` - Remove service
- `PATCH /api/deployment/services/<service_name>` - Update service
- `POST /api/deployment/services/<service_name>/rebuild` - Rebuild service

**Environment Variables**
- `GET /api/deployment/environment` - List environment variables
- `POST /api/deployment/environment` - Set environment variable
- `DELETE /api/deployment/environment/<key>` - Delete environment variable

### Jarvis Deployment API (Blueprint: jarvis_deployments, prefix: /api/jarvis/deployments)
- `POST /api/jarvis/deployments/deploy` - Create Jarvis deployment
- `POST /api/jarvis/deployments/<deployment_id>/stop` - Stop deployment
- `GET /api/jarvis/deployments/<deployment_id>/logs` - Get deployment logs

### Upload & Artifacts (Blueprint: upload)
**File Upload**
- `POST /api/upload/file` - Upload single file
- `POST /api/upload/zip` - Upload ZIP file
- `POST /api/upload/validate` - Validate file without uploading

**Artifact Management**
- `GET /api/artifacts` - List artifacts
- `GET /api/artifacts/<artifact_id>` - Get artifact details
- `GET /api/artifacts/<artifact_id>/download` - Download artifact
- `DELETE /api/artifacts/<artifact_id>` - Delete artifact

**Web Interface**
- `GET /uploads` - Uploads page

### Analysis (Blueprint: analysis)
**Artifact Analysis**
- `POST /api/analyze/artifact/<artifact_id>` - Trigger analysis
- `GET /api/analyze/artifact/<artifact_id>/status` - Get analysis status
- `GET /api/analyze/artifact/<artifact_id>/result` - Get analysis result
- `POST /api/analyze/preview` - Preview analysis without saving

**Web Interface**
- `GET /analysis/result/<artifact_id>` - Analysis result page

### Artifact Builder (Blueprint: artifacts, prefix: /api/artifacts)
**Build Management**
- `POST /api/artifacts/build` - Build artifact for project
- `GET /api/artifacts/build/<build_id>` - Get build status
- `GET /api/artifacts/build/<build_id>/logs` - Get build logs
- `GET /api/artifacts/builds` - List recent builds

**Templates**
- `GET /api/artifacts/templates` - List Dockerfile templates

### Smart Home API (Blueprint: smart_home, prefix: /smarthome)
**Dashboard**
- `GET /smarthome/` - Smart home dashboard

**Device Management**
- `GET /smarthome/api/devices` - Get all devices
- `GET /smarthome/api/devices/<domain>` - Get devices by domain
- `GET /smarthome/api/device/<entity_id>` - Get device state

**Device Control**
- `POST /smarthome/api/device/<entity_id>/turn_on` - Turn on device
- `POST /smarthome/api/device/<entity_id>/turn_off` - Turn off device

**Light Control**
- `POST /smarthome/api/light/<entity_id>/brightness` - Set brightness
- `POST /smarthome/api/light/<entity_id>/color` - Set color

**Climate Control**
- `POST /smarthome/api/climate/<entity_id>/temperature` - Set temperature

**Automation**
- `POST /smarthome/api/scene/<entity_id>/activate` - Activate scene
- `POST /smarthome/api/automation/<entity_id>/trigger` - Trigger automation
- `GET /smarthome/api/automation/templates` - Get automation templates

**Voice Commands**
- `POST /smarthome/api/voice/command` - Process voice command

**Status**
- `GET /smarthome/api/status` - Smart home system status

### Jarvis Voice API (Blueprint: jarvis_voice, prefix: /api/jarvis)
**Voice-Controlled Operations**
- `POST /api/jarvis/voice/deploy` - Deploy project via voice
- `POST /api/jarvis/voice/database` - Create database via voice
- `POST /api/jarvis/voice/ssl` - Manage SSL certificates
- `POST /api/jarvis/voice/query` - Conversational AI query

**System Status**
- `GET /api/jarvis/status` - Jarvis system status

### WebSocket Endpoints (Blueprint: websocket, prefix: /ws)
- `WebSocket /ws/workflows/<workflow_id>` - Workflow-specific updates
- `WebSocket /ws/tasks` - Task notifications
- `WebSocket /ws/deployments/<deployment_id>` - Deployment progress updates
- `WebSocket /ws/system` - System-wide events

## Running the Service

### Development Mode
```bash
python app.py
```
The application will be available at `http://0.0.0.0:5000`

### Production Mode
```bash
gunicorn --bind 0.0.0.0:5000 --workers 4 --reuse-port app:app
```

### With Celery Workers
```bash
# Terminal 1: Start Flask app
gunicorn --bind 0.0.0.0:5000 --workers 4 --reuse-port app:app

# Terminal 2: Start Celery worker
celery -A celery_app worker --loglevel=info

# Terminal 3: Start deployment queue worker
celery -A celery_app worker --loglevel=info -Q deployments
```

## Troubleshooting

### Missing Environment Variables
If you see the error "Missing required environment variables", ensure both `WEB_USERNAME` and `WEB_PASSWORD` are set in your environment or `.env` file.

### Database Connection Issues
- Verify `JARVIS_DATABASE_URL` is correctly formatted: `postgresql://user:password@host:port/database`
- Check PostgreSQL service is running
- Run migrations: `alembic upgrade head`

### Redis Connection Failed
- Ensure Redis is running on the specified `REDIS_URL`
- Default is `redis://localhost:6379/0`
- Workflow features will be unavailable without Redis

### Docker Connection Issues
- Verify Docker daemon is running
- Check `DOCKER_HOST` environment variable
- Ensure user has Docker permissions

### MinIO Upload Failures
- Verify MinIO service is running
- Check `MINIO_ENDPOINT`, `MINIO_ROOT_USER`, and `MINIO_ROOT_PASSWORD`
- Ensure buckets exist or service has permission to create them

### WebSocket Connection Failures
- Check that `DASHBOARD_API_KEY` is set (or let it auto-generate)
- Verify client is sending proper authentication (token, session, or API key)

### Smart Home Integration Not Working
- Set `HOME_ASSISTANT_URL` environment variable
- Set `HOME_ASSISTANT_TOKEN` with a long-lived access token from Home Assistant
- Verify Home Assistant is accessible from the dashboard server

### AI Features Unavailable
- Set `OPENAI_API_KEY` environment variable
- Ensure OpenAI package is installed: `pip install openai>=1.55.3`

## Security Notes

- All API endpoints require authentication via `@require_auth` or `@login_required` decorators
- WebSocket connections authenticate via token, session, or API key
- File uploads are validated and size-limited
- Shell command execution is restricted to an allowlist
- Database names and project names are validated against injection attacks
- Container names are validated with regex patterns
- SSL/TLS recommended for production deployments
