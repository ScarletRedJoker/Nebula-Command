# Homelab Dashboard

A comprehensive homelab management platform with AI-powered deployment automation (Jarvis Platform), container orchestration, service monitoring, and real-time updates.

## Table of Contents

- [Overview](#overview)
- [Key Features](#key-features)
- [Architecture](#architecture)
- [Installation & Setup](#installation--setup)
- [Environment Variables](#environment-variables)
- [Running the Service](#running-the-service)
- [API Documentation](#api-documentation)
- [Jarvis Platform](#jarvis-platform)
- [Service Integration](#service-integration)
- [Development Workflow](#development-workflow)
- [Troubleshooting](#troubleshooting)

## Overview

The Homelab Dashboard is a unified management platform designed to monitor and control your entire homelab infrastructure. It provides a web-based interface for managing Docker containers, deploying services, analyzing artifacts, and automating deployments through the Jarvis Platform.

**Tech Stack:**
- **Backend:** Flask 3.0.0 with Python 3.11+
- **Database:** PostgreSQL (homelab_jarvis database)
- **Task Queue:** Celery 5.3.4 with Redis 5.0.1
- **Real-time:** WebSocket (Flask-Sock 0.7.0)
- **Containerization:** Docker SDK 7.1.0
- **Object Storage:** MinIO 7.2.0
- **ORM:** SQLAlchemy 2.0.23 with Alembic 1.13.1

## Key Features

### 🤖 Jarvis Platform - AI-Powered Deployment Automation
- **Dockerfile Generation:** Automatic Dockerfile creation for multiple frameworks (Node.js, Python, Go, Rust, PHP, Java, Ruby, .NET)
- **Artifact Building:** Docker image building with local registry integration
- **Docker Compose Management:** Generate and manage docker-compose.yml specifications
- **Deployment Execution:** Automated deployments with multiple strategies (rolling, blue-green, recreate)
- **Caddy Integration:** Automatic reverse proxy configuration

### 🐳 Container & Service Management
- Real-time container status monitoring
- Start/stop/restart container operations
- Container logs viewing (with tail support)
- Service health monitoring for:
  - Discord Ticket Bot
  - Stream Bot (Twitch/Kick AI facts)
  - n8n Automation
  - Plex Media Server
  - Static Sites (ScarletRedJoker)
  - VNC Desktop

### 📦 Artifact Upload & Analysis
- Secure file upload to MinIO object storage
- Automatic artifact analysis with Celery workers
- Framework detection (React, Vue, Angular, Express, FastAPI, etc.)
- Database requirement detection
- SHA256 checksum verification
- ZIP archive support with extraction

### 🔄 Real-Time Updates
- WebSocket connections for live updates
- Workflow status streaming
- Task notifications
- Deployment progress tracking
- Global activity feed

### 🛠️ System Monitoring
- CPU, memory, disk usage statistics
- Process monitoring
- Network statistics and bandwidth tracking
- Network interface information
- Listening ports detection

### 🗄️ Database Management
- Create PostgreSQL, MySQL, MongoDB containers
- Database backup and restore
- Connection string examples
- Template-based deployments

### 🌐 Domain & SSL Management
- Domain health checking
- SSL certificate monitoring
- DNS record management (A, CNAME, TXT, MX, AAAA)
- Caddy automatic HTTPS

### 🤝 AI Assistant
- Log analysis with OpenAI integration
- Troubleshooting advice
- Interactive chat interface

## Architecture

```
┌─────────────────────────────────────────────────────────────────┐
│                      Homelab Dashboard                          │
├─────────────────────────────────────────────────────────────────┤
│                                                                 │
│  ┌──────────────┐    ┌──────────────┐    ┌──────────────┐    │
│  │   Flask App  │◄──►│  PostgreSQL  │◄──►│    Redis     │    │
│  │   (Port 5000)│    │  (Jarvis DB) │    │  (Celery)    │    │
│  └──────┬───────┘    └──────────────┘    └──────────────┘    │
│         │                                                      │
│         ├──► Docker SDK ──► Docker Engine                     │
│         │                                                      │
│         ├──► WebSocket ──► Real-time Clients                  │
│         │                                                      │
│         ├──► MinIO ──► Object Storage                         │
│         │                                                      │
│         └──► SSH ──► Remote Command Execution                 │
│                                                                │
├─────────────────────────────────────────────────────────────────┤
│                      Celery Workers                             │
├─────────────────────────────────────────────────────────────────┤
│  ┌──────────────────┐      ┌───────────────────┐              │
│  │ Analysis Worker  │      │ Workflow Worker   │              │
│  │ - Artifact scan  │      │ - Task execution  │              │
│  │ - Framework      │      │ - Deployment      │              │
│  │   detection      │      │   automation      │              │
│  └──────────────────┘      └───────────────────┘              │
└─────────────────────────────────────────────────────────────────┘
```

### Database Schema

The dashboard uses a PostgreSQL database (`homelab_jarvis`) with the following tables:

- **workflows** - Workflow execution tracking
- **tasks** - Manual task delegation and tracking
- **artifacts** - Uploaded file metadata
- **deployments** - Deployment history and state
- **domain_records** - DNS configuration
- **projects** - Jarvis project definitions
- **artifact_builds** - Docker image build records
- **compose_specs** - Docker Compose specifications

## Installation & Setup

### Prerequisites

- Python 3.11+
- PostgreSQL 12+
- Redis 5.0+
- Docker Engine
- MinIO (optional, for object storage)

### 1. Install Dependencies

```bash
cd services/dashboard
pip install -r requirements.txt
```

### 2. Database Setup

The database initialization is handled automatically by `config/postgres-init/03-init-jarvis-db.sh`:

```bash
# Creates homelab_jarvis database
# Creates jarvis user with appropriate permissions
```

Set the database password:
```bash
export JARVIS_DB_PASSWORD=your_secure_password
```

The connection URL will be:
```
postgresql://jarvis:${JARVIS_DB_PASSWORD}@discord-bot-db:5432/homelab_jarvis
```

### 3. Run Database Migrations

Migrations run automatically on app startup. Manual migration:

```bash
cd services/dashboard
alembic upgrade head
```

### 4. Configure Environment Variables

Create a `.env` file (see [Environment Variables](#environment-variables) section).

### 5. Start Redis (if not running)

```bash
docker run -d -p 6379:6379 redis:7-alpine
```

### 6. Start Celery Workers

```bash
cd services/dashboard
celery -A celery_app worker --loglevel=info
```

## Environment Variables

### Required Variables

These **must** be set for the dashboard to function:

```bash
# Authentication (REQUIRED)
WEB_USERNAME=your_username
WEB_PASSWORD=your_secure_password

# Database (REQUIRED if using Jarvis features)
JARVIS_DATABASE_URL=postgresql://jarvis:password@host:5432/homelab_jarvis

# Redis (REQUIRED for Celery)
REDIS_URL=redis://localhost:6379/0
```

### Optional Variables

```bash
# Flask Session
SESSION_SECRET=auto-generated-if-not-set

# API Security
DASHBOARD_API_KEY=auto-generated-if-not-set

# Docker
DOCKER_HOST=unix:///var/run/docker.sock

# SSH Configuration
SSH_HOST=localhost
SSH_PORT=22
SSH_USER=root
SSH_KEY_PATH=/root/.ssh/id_rsa

# MinIO Object Storage
MINIO_ENDPOINT=minio:9000
MINIO_ROOT_USER=admin
MINIO_ROOT_PASSWORD=minio_admin_password
MINIO_SECURE=False

# Upload Configuration
MAX_UPLOAD_SIZE=524288000  # 500MB in bytes
ALLOWED_EXTENSIONS=zip,tar,gz,html,css,js,py,php,java,go,rs,dockerfile,sh,bash
UPLOAD_FOLDER=/tmp/jarvis_uploads

# Service Paths
STATIC_SITE_PATH=/var/www/scarletredjoker
NOVNC_URL=https://vnc.evindrake.net
WINDOWS_KVM_IP=192.168.1.100
```

### Celery Configuration

```bash
CELERY_BROKER_URL=redis://localhost:6379/0
CELERY_RESULT_BACKEND=redis://localhost:6379/0
CELERY_TASK_SERIALIZER=json
CELERY_RESULT_SERIALIZER=json
CELERY_ACCEPT_CONTENT=json
CELERY_TIMEZONE=America/New_York
CELERY_TASK_TRACK_STARTED=True
CELERY_TASK_TIME_LIMIT=1800  # 30 minutes
CELERY_TASK_SOFT_TIME_LIMIT=1500  # 25 minutes
```

## Running the Service

### Development Mode

```bash
cd services/dashboard
python main.py
```

The dashboard will start on `http://0.0.0.0:5000`

### Production Mode (with Gunicorn)

```bash
gunicorn --bind 0.0.0.0:5000 --reuse-port --workers 4 main:app
```

### Docker Deployment

```bash
docker-compose -f docker-compose.unified.yml up -d homelab-dashboard
```

### Health Check

```bash
curl http://localhost:5000/health
```

Expected response:
```json
{
  "status": "healthy",
  "message": "Homelab Dashboard is running",
  "services": {
    "database": true,
    "redis": true,
    "websocket": true
  }
}
```

## API Documentation

All API endpoints require authentication via:
- Session cookie (after web login), OR
- `X-API-Key` header with `DASHBOARD_API_KEY`

### System API

#### Get System Information
```http
GET /api/system/info
```

#### Get System Statistics
```http
GET /api/system/stats
```

#### Get Process List
```http
GET /api/system/processes
```

#### Get Disk Information
```http
GET /api/system/disk
```

### Container Management API

#### List All Containers
```http
GET /api/containers
```

#### Get Container Status
```http
GET /api/containers/{container_name}/status
```

#### Start Container
```http
POST /api/containers/{container_name}/start
```

#### Stop Container
```http
POST /api/containers/{container_name}/stop
```

#### Restart Container
```http
POST /api/containers/{container_name}/restart
```

#### Get Container Logs
```http
GET /api/containers/{container_name}/logs?lines=100
```

### Service Status API

#### Get All Services Status
```http
GET /api/services/status
```

Response:
```json
{
  "success": true,
  "data": [
    {
      "id": "discord-bot",
      "name": "Discord Ticket Bot",
      "domain": "https://bot.rig-city.com",
      "type": "container",
      "status": "running",
      "container_status": { ... }
    }
  ]
}
```

### AI Assistant API

#### Analyze Logs
```http
POST /api/ai/analyze-logs
Content-Type: application/json

{
  "logs": "container logs here",
  "context": "nginx container crashing"
}
```

#### Chat with AI
```http
POST /api/ai/chat
Content-Type: application/json

{
  "message": "How do I fix permission denied errors?",
  "history": []
}
```

#### Get Troubleshooting Advice
```http
POST /api/ai/troubleshoot
Content-Type: application/json

{
  "issue": "Container won't start",
  "service": "discord-bot"
}
```

### Database Management API

#### List Databases
```http
GET /api/databases
```

#### Create Database
```http
POST /api/databases
Content-Type: application/json

{
  "db_type": "postgresql",
  "name": "my-postgres",
  "database_name": "myapp",
  "username": "myuser",
  "password": "secure_password"
}
```

#### Get Database Info
```http
GET /api/databases/{container_name}
```

#### Delete Database
```http
DELETE /api/databases/{container_name}?delete_volume=true
```

#### Backup Database
```http
POST /api/databases/{container_name}/backup
Content-Type: application/json

{
  "backup_path": "/backups"
}
```

#### Get Connection Examples
```http
GET /api/databases/{container_name}/connection-examples
```

### Network API

#### Get Network Statistics
```http
GET /api/network/stats
```

#### Get Network Interfaces
```http
GET /api/network/interfaces
```

#### Get Active Connections
```http
GET /api/network/connections
```

#### Get Listening Ports
```http
GET /api/network/ports
```

#### Get Bandwidth Usage
```http
GET /api/network/bandwidth
```

### Domain & SSL API

#### Get Domains Summary
```http
GET /api/domains
```

#### Check Specific Domain
```http
GET /api/domains/{subdomain}/check
```

#### Get SSL Certificates
```http
GET /api/domains/ssl-certificates
```

### Deployment API

#### List Service Templates
```http
GET /api/deployment/templates?category=web
```

#### Get Template Details
```http
GET /api/deployment/templates/{template_id}
```

#### Deploy Service
```http
POST /api/deployment/deploy
Content-Type: application/json

{
  "template_id": "nginx",
  "service_name": "my-website",
  "domain": "example.com",
  "environment_vars": {
    "PORT": "8080"
  }
}
```

#### List Deployed Services
```http
GET /api/deployment/services
```

#### Get Service Details
```http
GET /api/deployment/services/{service_name}
```

#### Remove Service
```http
DELETE /api/deployment/services/{service_name}?remove_volumes=true
```

#### Update Service
```http
PATCH /api/deployment/services/{service_name}
Content-Type: application/json

{
  "updates": {
    "environment": {
      "NEW_VAR": "value"
    }
  }
}
```

#### Rebuild Service
```http
POST /api/deployment/services/{service_name}/rebuild
```

### Upload & Artifacts API

#### Upload File
```http
POST /api/upload/file
Content-Type: multipart/form-data

file: <binary>
bucket: artifacts (optional)
description: My project files (optional)
```

#### Upload ZIP
```http
POST /api/upload/zip
Content-Type: multipart/form-data

file: <binary>
extract: true (optional)
bucket: artifacts (optional)
```

#### List Artifacts
```http
GET /api/artifacts?bucket=artifacts&limit=100
```

#### Get Artifact Details
```http
GET /api/artifacts/{artifact_id}
```

#### Download Artifact
```http
GET /api/artifacts/{artifact_id}/download
```

Returns pre-signed download URL:
```json
{
  "success": true,
  "download_url": "http://minio:9000/artifacts/file.zip?...",
  "filename": "original_name.zip"
}
```

#### Delete Artifact
```http
DELETE /api/artifacts/{artifact_id}
```

#### Validate File
```http
POST /api/upload/validate
Content-Type: multipart/form-data

file: <binary>
```

### Analysis API

#### Trigger Artifact Analysis
```http
POST /api/analyze/artifact/{artifact_id}
```

Starts Celery background task to analyze the artifact.

#### Get Analysis Status
```http
GET /api/analyze/artifact/{artifact_id}/status
```

Response:
```json
{
  "success": true,
  "artifact_id": "uuid",
  "status": "complete",
  "analysis_complete": true,
  "detected_framework": "react",
  "requires_database": false
}
```

#### Get Analysis Result
```http
GET /api/analyze/artifact/{artifact_id}/result
```

#### Preview Analysis (without saving)
```http
POST /api/analyze/preview
Content-Type: multipart/form-data

file: <binary>
```

### Jarvis Artifact Builder API

#### Build Docker Image
```http
POST /api/artifacts/build
Content-Type: application/json

{
  "project_id": "uuid",
  "workflow_id": "uuid" (optional)
}
```

Response:
```json
{
  "id": "build-uuid",
  "project_id": "project-uuid",
  "status": "building",
  "image_ref": "localhost:5000/my-app:latest",
  "dockerfile_content": "FROM node:20-alpine...",
  "created_at": "2025-11-14T12:00:00Z"
}
```

#### Get Build Status
```http
GET /api/artifacts/build/{build_id}
```

#### Get Build Logs
```http
GET /api/artifacts/build/{build_id}/logs
```

#### List Recent Builds
```http
GET /api/artifacts/builds?project_id=uuid&limit=10
```

#### List Dockerfile Templates
```http
GET /api/artifacts/templates
```

Response:
```json
{
  "templates": ["nodejs", "python", "go", "rust", "php", "java", "ruby", "dotnet"],
  "count": 8
}
```

### Jarvis Deployment Executor API

#### Create Deployment
```http
POST /api/jarvis/deployments/deploy
Content-Type: application/json

{
  "project_id": "uuid",
  "image_ref": "localhost:5000/my-app:latest",
  "domain": "app.example.com",
  "container_port": 3000,
  "host_port": null,
  "environment": {
    "NODE_ENV": "production",
    "DATABASE_URL": "postgresql://..."
  },
  "strategy": "rolling"
}
```

**Deployment Strategies:**
- `rolling` - Zero-downtime rolling update
- `blue-green` - Blue-green deployment
- `recreate` - Stop old, start new

Response:
```json
{
  "id": "deployment-uuid",
  "project_id": "project-uuid",
  "spec_id": "compose-spec-uuid",
  "status": "running",
  "health_status": "healthy",
  "created_at": "2025-11-14T12:00:00Z"
}
```

#### Stop Deployment
```http
POST /api/jarvis/deployments/{deployment_id}/stop
```

#### Get Deployment Logs
```http
GET /api/jarvis/deployments/{deployment_id}/logs?tail=100
```

### WebSocket API

All WebSocket endpoints support authentication via:
- Query parameter: `?token=<auth_token>`
- Session cookie (after web login)
- Header: `X-API-Key: <api_key>`

#### Workflow Updates
```javascript
const ws = new WebSocket('ws://localhost:5000/ws/workflows/{workflow_id}?token=xxx');

ws.onmessage = (event) => {
  const data = JSON.parse(event.data);
  console.log('Workflow update:', data);
};

// Send ping to keep connection alive
ws.send(JSON.stringify({ type: 'ping', timestamp: Date.now() }));
```

#### Task Notifications
```javascript
const ws = new WebSocket('ws://localhost:5000/ws/tasks?token=xxx');
```

#### Deployment Updates
```javascript
const ws = new WebSocket('ws://localhost:5000/ws/deployments?token=xxx');
```

#### Global Activity Stream
```javascript
const ws = new WebSocket('ws://localhost:5000/ws/activity?token=xxx');
```

### Activity API

#### Get Recent Activity
```http
GET /api/activity/recent?limit=20
```

## Jarvis Platform

The Jarvis Platform is an AI-powered deployment automation system that provides end-to-end CI/CD capabilities for your homelab.

### Features

1. **Dockerfile Generation**
   - Automatic Dockerfile creation based on project type
   - Support for 8+ frameworks and languages
   - Optimized multi-stage builds
   - Security best practices

2. **Artifact Building**
   - Docker image building with local registry
   - Build status tracking
   - Build logs and duration metrics
   - Image size and layer analysis

3. **Docker Compose Management**
   - Generate docker-compose.yml specifications
   - Caddy reverse proxy integration
   - Environment variable management
   - Volume and network configuration

4. **Deployment Execution**
   - Multiple deployment strategies
   - Health check monitoring
   - Rollback capabilities
   - Deployment history tracking

### Workflow

```
1. Upload Project → 2. Analyze Artifact → 3. Build Image → 4. Deploy
```

#### 1. Upload Project Files

```bash
curl -X POST http://localhost:5000/api/upload/zip \
  -H "X-API-Key: $DASHBOARD_API_KEY" \
  -F "file=@my-project.zip" \
  -F "extract=true"
```

#### 2. Analyze Artifact (Automatic)

The analysis worker automatically:
- Detects framework (React, Vue, Express, FastAPI, etc.)
- Identifies required dependencies
- Checks for database requirements
- Generates recommended configuration

#### 3. Build Docker Image

```bash
curl -X POST http://localhost:5000/api/artifacts/build \
  -H "Content-Type: application/json" \
  -H "X-API-Key: $DASHBOARD_API_KEY" \
  -d '{
    "project_id": "your-project-uuid"
  }'
```

#### 4. Deploy Application

```bash
curl -X POST http://localhost:5000/api/jarvis/deployments/deploy \
  -H "Content-Type: application/json" \
  -H "X-API-Key: $DASHBOARD_API_KEY" \
  -d '{
    "project_id": "your-project-uuid",
    "image_ref": "localhost:5000/my-app:latest",
    "domain": "app.example.com",
    "container_port": 3000,
    "environment": {
      "NODE_ENV": "production"
    },
    "strategy": "rolling"
  }'
```

### Dockerfile Templates

Jarvis supports automatic Dockerfile generation for:

- **Node.js** - React, Vue, Angular, Express, Next.js, Nest.js
- **Python** - Flask, FastAPI, Django
- **Go** - Gin, Echo, standard net/http
- **Rust** - Actix, Rocket, Axum
- **PHP** - Laravel, Symfony, vanilla PHP
- **Java** - Spring Boot, standard JAR
- **Ruby** - Rails, Sinatra
- **.NET** - ASP.NET Core

### Compose Template Generator

Automatically generates `docker-compose.yml` with:
- Service configuration
- Caddy reverse proxy labels (`caddy: domain.com`, `caddy.reverse_proxy: service:port`)
- Environment variable injection
- Volume mounts
- Network configuration
- Port mapping (direct or proxied)

### Deployment Strategies

#### Rolling Deployment (Zero-downtime)
- Default strategy
- Starts new containers before stopping old ones
- Ensures service availability

#### Blue-Green Deployment
- Maintains two environments (blue and green)
- Routes traffic to new version after validation
- Instant rollback capability

#### Recreate Deployment
- Stops old containers completely
- Starts new containers
- Brief downtime during transition

## Service Integration

The dashboard integrates with multiple homelab services:

### Discord Bot
- **Container:** `discord-bot`
- **Domain:** `https://bot.rig-city.com`
- **Integration:** Container management, logs viewing, status monitoring

### Stream Bot
- **Container:** `stream-bot`
- **Domain:** `https://stream.rig-city.com`
- **Integration:** AI-powered Snapple facts for Twitch/Kick streams

### n8n Automation
- **Container:** `n8n`
- **Domain:** `https://n8n.evindrake.net`
- **Integration:** Workflow automation, API connectivity

### Plex Media Server
- **Container:** `plex-server`
- **Domain:** `https://plex.evindrake.net`
- **Integration:** Media server management

### Static Sites
- **Container:** `scarletredjoker-web`
- **Domain:** `https://scarletredjoker.com`
- **Integration:** File manager, deployment automation

### VNC Desktop
- **Container:** `vnc-desktop`
- **Domain:** `https://vnc.evindrake.net`
- **Integration:** Remote desktop access via noVNC

## Development Workflow

### Project Structure

```
services/dashboard/
├── alembic/              # Database migrations
│   └── versions/         # Migration files
├── jarvis/               # Jarvis Platform modules
│   ├── artifact_builder.py
│   ├── compose_templates.py
│   ├── deployment_executor.py
│   └── dockerfile_templates.py
├── models/               # SQLAlchemy models
│   ├── artifact.py
│   ├── deployment.py
│   ├── domain_record.py
│   ├── jarvis.py
│   ├── task.py
│   └── workflow.py
├── routes/               # Flask blueprints
│   ├── analysis_routes.py
│   ├── api.py
│   ├── artifact_routes.py
│   ├── deployment_api.py
│   ├── deployment_routes.py
│   ├── upload_routes.py
│   ├── web.py
│   └── websocket_routes.py
├── services/             # Business logic
│   ├── activity_service.py
│   ├── ai_service.py
│   ├── caddy_manager.py
│   ├── compose_manager.py
│   ├── database_service.py
│   ├── db_service.py
│   ├── deployment_analyzer.py
│   ├── deployment_service.py
│   ├── docker_service.py
│   ├── domain_service.py
│   ├── env_manager.py
│   ├── file_validator.py
│   ├── network_service.py
│   ├── service_templates.py
│   ├── ssh_service.py
│   ├── system_service.py
│   ├── upload_service.py
│   └── websocket_service.py
├── static/               # Frontend assets
│   ├── css/
│   └── js/
├── templates/            # Jinja2 templates
├── tests/                # Test files
├── utils/                # Utility functions
│   └── auth.py
├── workers/              # Celery workers
│   ├── analysis_worker.py
│   └── workflow_worker.py
├── app.py                # Flask application factory
├── celery_app.py         # Celery configuration
├── config.py             # Configuration
├── main.py               # Entry point
└── requirements.txt      # Python dependencies
```

### Adding a New API Endpoint

1. **Create route in appropriate blueprint:**

```python
# routes/my_routes.py
from flask import Blueprint, jsonify
from utils.auth import require_auth

my_bp = Blueprint('my_feature', __name__, url_prefix='/api/my-feature')

@my_bp.route('/action', methods=['POST'])
@require_auth
def my_action():
    return jsonify({'success': True})
```

2. **Register blueprint in app.py:**

```python
from routes.my_routes import my_bp
app.register_blueprint(my_bp)
```

### Adding a Database Model

1. **Create model in models/:**

```python
# models/my_model.py
from sqlalchemy import Column, String, DateTime
from sqlalchemy.dialects.postgresql import UUID
from models import Base
import uuid
from datetime import datetime

class MyModel(Base):
    __tablename__ = 'my_models'
    
    id = Column(UUID(as_uuid=True), primary_key=True, default=uuid.uuid4)
    name = Column(String(255), nullable=False)
    created_at = Column(DateTime, default=datetime.utcnow)
    
    def to_dict(self):
        return {
            'id': str(self.id),
            'name': self.name,
            'created_at': self.created_at.isoformat()
        }
```

2. **Create migration:**

```bash
cd services/dashboard
alembic revision -m "Add my_model table"
```

3. **Edit migration file:**

```python
# alembic/versions/xxx_add_my_model.py
def upgrade():
    op.create_table(
        'my_models',
        sa.Column('id', UUID(as_uuid=True), primary_key=True),
        sa.Column('name', sa.String(255), nullable=False),
        sa.Column('created_at', sa.DateTime(), nullable=True)
    )

def downgrade():
    op.drop_table('my_models')
```

4. **Apply migration:**

```bash
alembic upgrade head
```

### Adding a Celery Worker Task

```python
# workers/my_worker.py
from celery_app import celery_app
import logging

logger = logging.getLogger(__name__)

@celery_app.task(name='workers.my_worker.process_data')
def process_data(data_id: str):
    """Process data asynchronously"""
    try:
        logger.info(f"Processing data: {data_id}")
        # Your processing logic here
        return {'status': 'success', 'data_id': data_id}
    except Exception as e:
        logger.error(f"Error processing data: {e}")
        raise
```

Trigger the task:
```python
from workers.my_worker import process_data
task = process_data.delay('data-123')
result = task.get(timeout=30)  # Wait for result
```

### Testing

```bash
# Run all tests
pytest services/dashboard/tests/

# Run specific test file
pytest services/dashboard/tests/test_deployment_analyzer.py

# Run with coverage
pytest --cov=services/dashboard --cov-report=html
```

## Troubleshooting

### Dashboard Won't Start

**Issue:** `CRITICAL: Missing required environment variables!`

**Solution:**
```bash
export WEB_USERNAME=admin
export WEB_PASSWORD=secure_password
```

---

**Issue:** `Database connection failed`

**Solution:**
1. Check PostgreSQL is running:
   ```bash
   docker ps | grep postgres
   ```
2. Verify connection string:
   ```bash
   echo $JARVIS_DATABASE_URL
   ```
3. Test connection manually:
   ```bash
   docker exec -it discord-bot-db psql -U jarvis -d homelab_jarvis -c "SELECT 1;"
   ```

---

**Issue:** `Redis connection failed`

**Solution:**
1. Check Redis is running:
   ```bash
   docker ps | grep redis
   ```
2. Test Redis connection:
   ```bash
   redis-cli -u $REDIS_URL ping
   ```

### Celery Workers Not Processing Tasks

**Issue:** Tasks stuck in pending state

**Solution:**
1. Check Celery worker is running:
   ```bash
   ps aux | grep celery
   ```
2. Start worker manually:
   ```bash
   cd services/dashboard
   celery -A celery_app worker --loglevel=info
   ```
3. Check Redis queue:
   ```bash
   redis-cli -u $REDIS_URL llen celery
   ```

### Docker Build Failures

**Issue:** `Docker client not available`

**Solution:**
1. Verify Docker socket is accessible:
   ```bash
   ls -la /var/run/docker.sock
   ```
2. Add user to docker group:
   ```bash
   sudo usermod -aG docker $USER
   ```
3. Restart Docker service:
   ```bash
   sudo systemctl restart docker
   ```

---

**Issue:** `Docker Compose CLI not found`

**Solution:**
1. Install Docker Compose plugin:
   ```bash
   sudo apt-get install docker-compose-plugin
   ```
2. Verify installation:
   ```bash
   docker compose version
   ```

### Deployment Failures

**Issue:** Caddy reverse proxy not routing traffic

**Solution:**
1. Check Caddy labels in generated compose file
2. Verify Caddy configuration:
   ```bash
   docker exec caddy cat /etc/caddy/Caddyfile
   ```
3. Check Caddy logs:
   ```bash
   docker logs caddy --tail 100
   ```

---

**Issue:** Deployment stuck in "building" status

**Solution:**
1. Check build logs:
   ```bash
   curl -X GET http://localhost:5000/api/artifacts/build/{build_id}/logs
   ```
2. Verify Docker registry is accessible:
   ```bash
   docker pull localhost:5000/test-image || echo "Registry not accessible"
   ```

### WebSocket Connection Issues

**Issue:** WebSocket connection immediately closes

**Solution:**
1. Check authentication token/session
2. Verify WebSocket endpoint path
3. Check for proxy/firewall blocking WebSocket upgrades
4. Test with browser DevTools Network tab

### File Upload Failures

**Issue:** `Upload failed: File size exceeds limit`

**Solution:**
1. Increase upload limit:
   ```bash
   export MAX_UPLOAD_SIZE=1048576000  # 1GB
   ```
2. Update nginx/proxy settings if behind reverse proxy

---

**Issue:** `MinIO connection failed`

**Solution:**
1. Check MinIO is running:
   ```bash
   docker ps | grep minio
   ```
2. Verify MinIO credentials:
   ```bash
   echo $MINIO_ROOT_USER
   echo $MINIO_ROOT_PASSWORD
   ```
3. Test MinIO access:
   ```bash
   curl http://minio:9000/minio/health/live
   ```

### Database Migration Issues

**Issue:** `Alembic can't locate migration environment`

**Solution:**
```bash
cd services/dashboard
alembic init alembic  # Only if alembic/ doesn't exist
```

---

**Issue:** `Migration failed: table already exists`

**Solution:**
1. Stamp current database state:
   ```bash
   alembic stamp head
   ```
2. Or drop and recreate:
   ```bash
   docker exec -it discord-bot-db psql -U jarvis -d homelab_jarvis -c "DROP SCHEMA public CASCADE; CREATE SCHEMA public;"
   alembic upgrade head
   ```

### Performance Issues

**Issue:** Dashboard slow to load

**Solution:**
1. Check Docker container count:
   ```bash
   docker ps -a | wc -l
   ```
2. Monitor system resources:
   ```bash
   htop
   ```
3. Increase Gunicorn workers:
   ```bash
   gunicorn --workers 8 --bind 0.0.0.0:5000 main:app
   ```

---

**Issue:** High memory usage

**Solution:**
1. Limit Celery worker concurrency:
   ```bash
   celery -A celery_app worker --concurrency=2
   ```
2. Check for memory leaks in custom code
3. Restart workers periodically with `--max-tasks-per-child=1000`

### Logging & Debugging

Enable debug logging:
```bash
export FLASK_DEBUG=1
export FLASK_ENV=development
python main.py
```

View application logs:
```bash
# Docker deployment
docker logs homelab-dashboard --tail 100 -f

# Development
tail -f services/dashboard/logs/app.log
```

Check Celery worker logs:
```bash
celery -A celery_app worker --loglevel=debug
```

### Common Error Messages

| Error | Cause | Solution |
|-------|-------|----------|
| `Deployment executor: compose_available = False` | Docker Compose CLI not installed | `sudo apt-get install docker-compose-plugin` |
| `BuildError: Dockerfile not found` | Project path incorrect | Verify project.path points to valid directory |
| `Artifact analysis failed: Unsupported file type` | File type not in ALLOWED_EXTENSIONS | Add extension to config or use ZIP |
| `Session expired` | Session timeout | Re-login at `/login` |
| `Invalid container name` | Container name has invalid characters | Use alphanumeric, dash, underscore only |

---

## Support & Documentation

- **Main Documentation:** `/docs/` folder in repository
- **Deployment Guide:** `docs/DEPLOYMENT_GUIDE.md`
- **Database Setup:** `services/dashboard/JARVIS_DATABASE_SETUP.md`
- **Deployment Executor:** `services/dashboard/DEPLOYMENT_EXECUTOR_SUMMARY.md`
- **Security Guide:** `services/dashboard/JARVIS_SECURITY_SETUP.md`

## License

Proprietary - Homelab use only
