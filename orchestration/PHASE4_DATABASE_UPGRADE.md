# PHASE 4: Database Platform Upgrade

**Status:** ✅ Implemented  
**Version:** 1.0.0  
**Date:** 2025-11-23

## Overview

Phase 4 introduces enterprise-grade database features for the homelab platform:

- **pgBouncer**: Connection pooling to reduce overhead and improve scalability
- **pgBackRest**: Automated backups with S3 storage (MinIO)
- **WAL Archiving**: Point-in-time recovery capability
- **Database CLI**: Comprehensive database management commands

## Architecture

```
┌──────────────────────────────────────────────────────────┐
│                   Application Services                    │
│  (Dashboard, Discord Bot, Stream Bot, Celery Worker)     │
└───────────────────────┬──────────────────────────────────┘
                        │
                        │ Connection Pooling
                        ▼
┌──────────────────────────────────────────────────────────┐
│                      pgBouncer                            │
│  - Transaction pooling mode                               │
│  - Max 1000 client connections                            │
│  - 25 connections per pool                                │
│  - Port: 6432                                             │
└───────────────────────┬──────────────────────────────────┘
                        │
                        │ PostgreSQL Protocol
                        ▼
┌──────────────────────────────────────────────────────────┐
│                   PostgreSQL 16                           │
│  - Multi-tenant databases                                 │
│  - WAL archiving enabled                                  │
│  - Port: 5432 (internal)                                  │
└─────────┬────────────────────────────────────────────────┘
          │
          │ WAL Shipping & Backup
          ▼
┌──────────────────────────────────────────────────────────┐
│                    pgBackRest                             │
│  - Full backups: Daily at 2 AM                            │
│  - Incremental: Every hour                                │
│  - Storage: MinIO S3 (homelab-backups)                    │
│  - Compression: LZ4                                       │
│  - Retention: 7 full, 4 diff, 7 incr                      │
└──────────────────────┬───────────────────────────────────┘
                       │
                       │ S3 Protocol
                       ▼
┌──────────────────────────────────────────────────────────┐
│                      MinIO                                │
│  - Bucket: homelab-backups                                │
│  - Object storage                                         │
└──────────────────────────────────────────────────────────┘
```

## Features

### 1. Connection Pooling (pgBouncer)

**Benefits:**
- Reduces connection overhead (PostgreSQL connection cost)
- Supports 1000+ concurrent clients with only 100 backend connections
- Transparent to applications
- Improves application response time
- Enables future remote database support

**Configuration:**
- **Pool Mode**: Transaction pooling (recommended for web apps)
- **Max Client Connections**: 1000
- **Default Pool Size**: 25 per database
- **Port**: 6432
- **Admin Access**: `psql -h pgbouncer -p 6432 -U postgres -d pgbouncer`

**Monitoring:**
```bash
# Show pool statistics
docker exec homelab-pgbouncer psql -h localhost -p 6432 -U postgres -d pgbouncer -c "SHOW POOLS;"

# Show client connections
docker exec homelab-pgbouncer psql -h localhost -p 6432 -U postgres -d pgbouncer -c "SHOW CLIENTS;"

# Show server connections
docker exec homelab-pgbouncer psql -h localhost -p 6432 -U postgres -d pgbouncer -c "SHOW SERVERS;"
```

### 2. Automated Backups (pgBackRest)

**Backup Types:**
- **Full Backup**: Complete database copy (Daily at 2 AM)
- **Incremental**: Changed blocks since last backup (Hourly)
- **Differential**: Changed blocks since last full (Weekly on Sunday)

**Storage:**
- **Backend**: MinIO S3-compatible storage
- **Bucket**: homelab-backups
- **Compression**: LZ4 (fast, good ratio)
- **Encryption**: Optional (configure in pgbackrest config)

**Retention Policy:**
- Full backups: 7 days
- Differential backups: 4 weeks
- Incremental backups: 7 days
- Archive logs: 7 days

**Backup Commands:**
```bash
# Manual full backup
./homelab db backup full

# Manual incremental backup
./homelab db backup incr

# Manual differential backup
./homelab db backup diff

# List all backups
./homelab db list-backups

# Check backup status
./homelab db status
```

### 3. WAL Archiving & Point-in-Time Recovery

**WAL (Write-Ahead Log) Archiving:**
- Continuously archives transaction logs
- Enables point-in-time recovery (PITR)
- Supports incremental backups
- Stored in MinIO alongside backups

**Point-in-Time Recovery:**
```bash
# Restore to specific point in time
docker exec homelab-pgbackrest pgbackrest \
  --stanza=homelab \
  --type=time \
  --target="2025-11-23 14:30:00" \
  restore

# Restore to specific transaction ID
docker exec homelab-pgbackrest pgbackrest \
  --stanza=homelab \
  --type=xid \
  --target="12345" \
  restore
```

### 4. Database Management CLI

**Status & Health:**
```bash
# Show complete database platform status
./homelab db status

# Output includes:
# - PostgreSQL health
# - Database list
# - pgBouncer pool stats
# - Backup status
# - Scheduler status
```

**Backup Operations:**
```bash
# Trigger manual backup
./homelab db backup full          # Full backup
./homelab db backup incr          # Incremental
./homelab db backup diff          # Differential

# List available backups
./homelab db list-backups

# Sample output:
# stanza: homelab
# full backup: 20251123-020000F
#     timestamp start/stop: 2025-11-23 02:00:00 / 02:15:32
#     wal start/stop: 000000010000000000000003 / 000000010000000000000005
#     database size: 1.2GB, backup size: 450MB
#     repo1: backup set size: 180MB, backup set backup size: 180MB
```

**Restore Operations:**
```bash
# List backups and select one
./homelab db list-backups

# Restore from specific backup
./homelab db restore 20251123-020000F

# Interactive confirmation required
# Stops all services, restores database, restarts services
```

**Migration Operations:**
```bash
# Run migrations for specific service
./homelab db migrate dashboard      # Alembic migrations
./homelab db migrate discord-bot    # Drizzle migrations
./homelab db migrate stream-bot     # Drizzle migrations
```

## Deployment

### Option 1: Deploy Database Bundle Only

```bash
# Deploy pgBouncer + pgBackRest + Scheduler
docker compose -f orchestration/compose.database.yml up -d

# Verify services
./homelab db status
```

### Option 2: Deploy Everything (Recommended)

```bash
# Deploy complete stack with database platform
./homelab fix

# Or use modular deployment
docker compose -f orchestration/compose.all.yml up -d
```

### Configuration

**1. Enable Connection Pooling (Optional):**

Edit `config/overlays/prod.yaml`:
```yaml
database:
  use_pooler: true
  pooler_host: pgbouncer
  pooler_port: 6432
```

Regenerate configs:
```bash
./homelab config generate prod evindrake.net
```

**2. Configure Backup Retention:**

Edit `config/overlays/prod.yaml`:
```yaml
database:
  backup_retention_full: 7      # Days
  backup_retention_diff: 4      # Weeks
  backup_retention_archive: 7   # Days
```

**3. Customize Backup Schedule:**

Edit `config/overlays/prod.yaml`:
```yaml
database:
  backup_schedule_full: "0 2 * * *"    # Daily at 2 AM
  backup_schedule_incr: "0 */1 * * *"  # Every hour
  backup_schedule_diff: "0 12 * * 0"   # Sunday at noon
```

## Connection Strings

### Direct Connection (Backward Compatible)
```
postgresql://user:password@homelab-postgres:5432/database
```

### Pooled Connection (Recommended)
```
postgresql://user:password@pgbouncer:6432/database
```

**When to Use Each:**

| Use Case | Connection Type | Reason |
|----------|----------------|--------|
| Web Applications | Pooled (pgBouncer) | High concurrency, short transactions |
| Background Workers | Pooled (pgBouncer) | Many concurrent jobs |
| Migrations | Direct | Requires exclusive locks |
| Admin Tasks | Direct | May need superuser features |
| Data Import/Export | Direct | Long-running transactions |

## Backward Compatibility

**All existing services continue to work!**

- Direct PostgreSQL connections (port 5432) remain functional
- Connection pooling is **opt-in** via configuration
- Services can gradually migrate to pgBouncer
- No breaking changes to existing deployments

## Migration Path

### Phase 1: Deploy Infrastructure (Current)
```bash
# Deploy database platform
./homelab fix

# Verify all services running
./homelab db status
```

### Phase 2: Enable Connection Pooling (Optional)
```bash
# Edit config to enable pooler
vim config/overlays/prod.yaml
# Set: database.use_pooler = true

# Regenerate configs
./homelab config generate prod evindrake.net

# Restart services to pick up new connection strings
./homelab restart
```

### Phase 3: Verify Backups
```bash
# Wait for first scheduled backup (2 AM)
# Or trigger manually
./homelab db backup full

# Verify backup completed
./homelab db list-backups

# Test restore to verify backup integrity
./homelab db restore <backup-id>
```

## Troubleshooting

### pgBouncer Not Starting

**Check logs:**
```bash
docker logs homelab-pgbouncer
```

**Common issues:**
- PostgreSQL not ready: Wait for postgres to be healthy
- User authentication: Verify passwords in USERLIST match postgres
- Database list: Ensure all databases exist in postgres

### Backups Failing

**Check pgBackRest logs:**
```bash
docker logs homelab-pgbackrest
```

**Common issues:**
- MinIO not accessible: Verify minio container running
- S3 credentials incorrect: Check MINIO_ROOT_USER/PASSWORD
- Bucket doesn't exist: Create `homelab-backups` bucket in MinIO
- Disk space: Check MinIO storage capacity

**Create bucket manually:**
```bash
# Access MinIO console: http://localhost:9001
# Or use mc CLI:
docker exec homelab-minio mc mb /data/homelab-backups
```

### Connection Pool Exhaustion

**Symptoms:**
- Applications timeout waiting for connection
- "no more connections available" errors

**Diagnosis:**
```bash
# Check pool usage
docker exec homelab-pgbouncer psql -h localhost -p 6432 \
  -U postgres -d pgbouncer -c "SHOW POOLS;"

# Look for:
# - cl_active (active clients)
# - sv_active (active servers)
# - maxwait (clients waiting)
```

**Solutions:**
1. Increase pool size in config
2. Fix application connection leaks
3. Switch to session pooling for specific apps

### Restore Issues

**If restore fails:**
```bash
# Check available backups
./homelab db list-backups

# Verify backup integrity
docker exec homelab-pgbackrest pgbackrest \
  --stanza=homelab --set=<backup-id> verify

# Manual restore with verbose output
docker exec homelab-pgbackrest pgbackrest \
  --stanza=homelab --set=<backup-id> --log-level-console=detail restore
```

## Performance Tuning

### pgBouncer Pool Sizing

**Calculate optimal pool size:**
```
pool_size = (num_cpu_cores * 2) + effective_spindle_count
```

For typical homelab:
- 4 CPU cores
- 1 SSD (spindle = 1)
- **Recommended**: 10-25 connections per pool

**Adjust in config:**
```yaml
database:
  default_pool_size: 25
  max_db_connections: 100
```

### Backup Performance

**Compression vs. Speed:**
- **LZ4**: Fast, good compression (default, recommended)
- **GZ**: Slower, better compression
- **None**: Fastest, largest backups

**Parallel Processing:**
```yaml
database:
  backup_process_max: 4  # Number of parallel backup workers
```

## Monitoring

### Health Checks

**Automated checks:**
```bash
# Comprehensive health check
./homelab health

# Database-specific health
./homelab db status
```

**Key metrics to monitor:**
- PostgreSQL connection count
- pgBouncer pool utilization
- Backup success/failure rate
- Backup size and duration
- WAL archive lag

### Backup Monitoring

**Check last backup:**
```bash
./homelab db list-backups | head -20

# Look for:
# - Recent backup timestamp
# - Backup size (should be consistent)
# - No errors in output
```

**Automated backup verification:**
```bash
# Add to cron (runs daily after backup)
0 3 * * * docker exec homelab-pgbackrest pgbackrest --stanza=homelab check
```

## Security Considerations

### Connection Security

- **Internal network**: All database traffic stays within Docker network
- **No external exposure**: PostgreSQL/pgBouncer not exposed to internet
- **Password encryption**: Passwords stored in encrypted config
- **SSL/TLS**: Can be enabled for postgres connections

### Backup Security

**Current state:**
- Backups stored in MinIO (local S3)
- MinIO access controlled by credentials
- Backups compressed (not encrypted)

**Optional encryption:**
```yaml
# Add to pgbackrest config
PGBACKREST_REPO1_CIPHER_TYPE: aes-256-cbc
PGBACKREST_REPO1_CIPHER_PASS: <encryption-password>
```

### Access Control

**PostgreSQL:**
- Superuser: postgres (admin only)
- Service users: Limited to specific databases
- No remote access (Docker network only)

**pgBouncer:**
- Admin user: postgres
- Stats user: postgres
- Application users: Read-only to pgbouncer database

## Future Enhancements

### Phase 5: High Availability (Deferred)
- **Patroni**: Automated failover
- **Streaming replication**: Multiple postgres instances
- **HAProxy**: Load balancing between replicas
- **Consul**: Distributed configuration

### Phase 6: Remote Database Support
- Connect to external PostgreSQL (AWS RDS, etc.)
- Support multiple database backends
- Multi-region replication
- Read replicas for analytics

### Phase 7: Advanced Backup Features
- Off-site backup replication
- Backup encryption at rest
- Backup verification automation
- Custom retention policies per database

## Quick Reference

### Common Commands

```bash
# Status & Health
./homelab db status              # Full database platform status
./homelab health                 # Comprehensive health check

# Backups
./homelab db backup full         # Manual full backup
./homelab db backup incr         # Manual incremental backup
./homelab db list-backups        # List all backups
./homelab db restore <id>        # Restore from backup

# Migrations
./homelab db migrate dashboard   # Run dashboard migrations
./homelab db migrate discord-bot # Run Discord bot migrations
./homelab db migrate stream-bot  # Run stream bot migrations

# Monitoring
docker logs homelab-postgres     # PostgreSQL logs
docker logs homelab-pgbouncer    # pgBouncer logs
docker logs homelab-pgbackrest   # Backup logs

# Direct database access (bypass pooler)
./homelab db-shell homelab_jarvis
```

### Connection Strings Reference

```bash
# Dashboard (Jarvis)
# Pooled:  postgresql://jarvis:PASSWORD@pgbouncer:6432/homelab_jarvis
# Direct:  postgresql://jarvis:PASSWORD@homelab-postgres:5432/homelab_jarvis

# Discord Bot
# Pooled:  postgresql://ticketbot:PASSWORD@pgbouncer:6432/ticketbot
# Direct:  postgresql://ticketbot:PASSWORD@homelab-postgres:5432/ticketbot

# Stream Bot
# Pooled:  postgresql://streambot:PASSWORD@pgbouncer:6432/streambot
# Direct:  postgresql://streambot:PASSWORD@homelab-postgres:5432/streambot
```

## Acceptance Criteria

- [x] pgBouncer running and pooling connections
- [x] pgBackRest performing automated backups
- [x] WAL archiving enabled
- [x] CLI commands for backup/restore
- [x] Services can connect via pgBouncer (backward compatible)
- [x] Documentation complete
- [x] Backward compatible (direct connections still work)

## Summary

Phase 4 successfully implements enterprise-grade database features while maintaining full backward compatibility. The platform now supports:

✅ **Connection pooling** for improved scalability  
✅ **Automated backups** with flexible retention  
✅ **Point-in-time recovery** for disaster recovery  
✅ **CLI management** for operations  
✅ **Monitoring & health checks** for observability  
✅ **Zero breaking changes** to existing deployments  

The foundation is now ready for future enhancements including high availability, remote databases, and advanced backup features.

## Support

For issues or questions:
1. Check troubleshooting section above
2. Review logs: `./homelab logs <service>`
3. Check service status: `./homelab db status`
4. Consult service catalog: `orchestration/services.yaml`

---

**Phase 4 Implementation Complete** ✅  
Next: Phase 5 - High Availability (Future)
