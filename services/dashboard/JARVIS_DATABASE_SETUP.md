# Jarvis Platform Database - Phase 1.1 Complete

## Overview
Successfully implemented the core database schema for the Jarvis platform with SQLAlchemy ORM and Alembic migrations.

## What Was Created

### 1. Database Initialization
**File:** `config/postgres-init/03-init-jarvis-db.sh`
- Creates `homelab_jarvis` database
- Creates `jarvis` user with appropriate permissions
- Integrates with existing PostgreSQL container

### 2. Python Dependencies
**File:** `services/dashboard/requirements.txt`
Added:
- `sqlalchemy==2.0.23`
- `alembic==1.13.1`
- `psycopg2-binary==2.9.9`
- `flask-sqlalchemy==3.1.1`

### 3. SQLAlchemy Models
**Location:** `services/dashboard/models/`

#### models/__init__.py
- Base declarative model
- Engine and session factory functions
- Exports all models

#### models/workflow.py
- Tracks workflow execution state
- Enum fields: WorkflowStatus (pending, running, completed, failed, paused)
- JSON metadata field for workflow-specific data
- UUID primary key

#### models/task.py
- Manual task delegation and tracking
- Foreign key to workflows (nullable, SET NULL on delete)
- Three enum types: TaskType, TaskStatus, TaskPriority
- JSON instructions and metadata fields

#### models/artifact.py
- Uploaded file metadata
- File type enum: zip, tar, directory, single_file
- SHA256 checksum for integrity
- Service type detection support

#### models/deployment.py
- Deployment history and state
- Foreign keys to both workflows (CASCADE) and artifacts (SET NULL)
- Health status tracking
- JSON configuration storage

#### models/domain_record.py
- DNS record management
- Foreign key to deployments (SET NULL)
- Record type enum: A, CNAME, TXT, MX, AAAA
- Auto-managed flag for DDNS integration

### 4. Alembic Configuration

#### alembic.ini
- Standard Alembic configuration
- Configured for PostgreSQL

#### alembic/env.py
- Reads JARVIS_DATABASE_URL from environment
- Imports all models for migration detection
- Supports both online and offline migrations

#### alembic/script.py.mako
- Migration template

#### alembic/versions/001_initial_schema.py
- Initial migration creating all 5 tables
- All foreign key relationships
- All enum types
- Proper indexes and constraints

### 5. Database Service

**File:** `services/dashboard/services/db_service.py`

Features:
- Connection factory with connection pooling
- Context manager for session management
- Automatic migration runner
- Database health check
- Migration status reporting
- Graceful degradation if database unavailable

### 6. Configuration Updates

#### config.py
Added:
- `JARVIS_DATABASE_URL` configuration

#### docker-compose.unified.yml
Updated:
- Added `JARVIS_DB_PASSWORD` to postgres init environment
- Added `JARVIS_DATABASE_URL` to dashboard environment
- Added database health check dependency for dashboard
- Database URL: `postgresql://jarvis:${JARVIS_DB_PASSWORD}@discord-bot-db:5432/homelab_jarvis`

#### app.py
Added:
- Database service import
- Automatic migration execution on startup
- Database health check logging
- Migration status reporting
- Graceful handling when database unavailable

## Database Schema

### Relationships
```
workflows (1) ─────< (n) tasks
    │
    └──────< (n) deployments ─────< (n) domain_records
                    │
artifacts (1) ──────┘
```

### Tables Created
1. **workflows** - Workflow execution tracking
2. **tasks** - Manual task delegation
3. **artifacts** - File upload metadata
4. **deployments** - Deployment history
5. **domain_records** - DNS configuration

## Usage

### Environment Variable Required
```bash
JARVIS_DB_PASSWORD=your_secure_password
```

This will be automatically used in docker-compose to create:
```
JARVIS_DATABASE_URL=postgresql://jarvis:${JARVIS_DB_PASSWORD}@discord-bot-db:5432/homelab_jarvis
```

### Using the Database Service

```python
from services.db_service import db_service
from models import Workflow, Task

# Check if database is available
if db_service.is_available:
    # Use context manager for sessions
    with db_service.get_session() as session:
        # Create a workflow
        workflow = Workflow(
            name="Deploy mysite to example.com",
            workflow_type="deployment",
            created_by="admin"
        )
        session.add(workflow)
        # Session auto-commits on context exit
```

### Health Check
```python
status = db_service.health_check()
print(status)
# {'healthy': True, 'message': 'Database connection successful'}
```

### Migration Status
```python
status = db_service.get_migration_status()
print(f"Current: {status['current_revision']}")
print(f"Latest: {status['head_revision']}")
```

## Testing the Setup

1. **Set environment variable:**
   ```bash
   export JARVIS_DB_PASSWORD=your_secure_password
   ```

2. **Rebuild containers:**
   ```bash
   docker-compose -f docker-compose.unified.yml up -d --build homelab-dashboard
   ```

3. **Check logs:**
   ```bash
   docker logs homelab-dashboard
   ```

   Should see:
   ```
   ============================================================
   Initializing Jarvis Platform Database
   ============================================================
   Database service is available, running migrations...
   ✓ Database migrations completed successfully
   ✓ Database health check passed
   ✓ Current migration: 001
   ✓ Latest migration: 001
   ============================================================
   ```

4. **Verify tables created:**
   ```bash
   docker exec -it discord-bot-db psql -U jarvis -d homelab_jarvis -c "\dt"
   ```

## Next Steps

Phase 1.1 is complete. The database schema is ready for:
- Phase 1.2: Workflow API endpoints
- Phase 1.3: Task management UI
- Phase 1.4: Artifact upload and analysis
- Phase 1.5: Deployment orchestration
- Phase 1.6: DNS management integration

## Notes

- Database init script placed in `config/postgres-init/` to match existing project structure
- All models include `to_dict()` methods for easy serialization
- Foreign key relationships use appropriate cascade/set null behaviors
- Database service gracefully degrades if JARVIS_DATABASE_URL not set
- No breaking changes to existing services
