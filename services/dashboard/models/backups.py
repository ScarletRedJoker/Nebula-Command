"""Backup Management Models"""
import uuid
from datetime import datetime
from sqlalchemy import Column, String, Integer, BigInteger, DateTime, Text, Boolean
from sqlalchemy.dialects.postgresql import UUID, JSONB
from . import Base


class Backup(Base):
    """System backup record"""
    __tablename__ = 'backups'
    
    id = Column(UUID(as_uuid=True), primary_key=True, default=uuid.uuid4)
    name = Column(String(255), nullable=False)
    backup_type = Column(String(50), nullable=False)  # 'full', 'incremental', 'database', 'files', 'docker_volume', 'studio_project'
    source = Column(String(1000), nullable=False)  # Source path or database name
    destination = Column(String(1000), nullable=False)  # Backup storage location
    size_bytes = Column(BigInteger, nullable=True)
    status = Column(String(50), nullable=False, default='pending')  # 'pending', 'running', 'completed', 'failed', 'restoring'
    started_at = Column(DateTime(timezone=True), nullable=True)
    completed_at = Column(DateTime(timezone=True), nullable=True)
    error = Column(Text, nullable=True)
    checksum = Column(String(64), nullable=True)  # SHA256 checksum
    compression = Column(String(20), nullable=True, default='gzip')  # 'gzip', 'none'
    backup_metadata = Column(JSONB, nullable=True)  # Additional metadata (file count, tables, etc.)
    schedule_id = Column(UUID(as_uuid=True), nullable=True)  # Reference to schedule if created by schedule
    created_at = Column(DateTime(timezone=True), default=datetime.utcnow, nullable=False)
    
    def to_dict(self):
        duration = None
        if self.completed_at and self.started_at:
            duration = (self.completed_at - self.started_at).total_seconds()
        
        return {
            'id': str(self.id),
            'name': self.name,
            'backup_type': self.backup_type,
            'source': self.source,
            'destination': self.destination,
            'size_bytes': self.size_bytes,
            'size_mb': round(self.size_bytes / (1024 * 1024), 2) if self.size_bytes else None,
            'size_gb': round(self.size_bytes / (1024 * 1024 * 1024), 2) if self.size_bytes else None,
            'size_human': self._format_size(self.size_bytes) if self.size_bytes else None,
            'status': self.status,
            'started_at': self.started_at.isoformat() if self.started_at else None,
            'completed_at': self.completed_at.isoformat() if self.completed_at else None,
            'duration_seconds': duration,
            'error': self.error,
            'checksum': self.checksum,
            'compression': self.compression,
            'backup_metadata': self.backup_metadata,
            'schedule_id': str(self.schedule_id) if self.schedule_id else None,
            'created_at': self.created_at.isoformat() if self.created_at else None,
        }
    
    def _format_size(self, size_bytes):
        """Format bytes to human readable string"""
        for unit in ['B', 'KB', 'MB', 'GB', 'TB']:
            if size_bytes < 1024:
                return f"{size_bytes:.2f} {unit}"
            size_bytes /= 1024
        return f"{size_bytes:.2f} PB"


class BackupSchedule(Base):
    """Backup schedule configuration"""
    __tablename__ = 'backup_schedules'
    
    id = Column(UUID(as_uuid=True), primary_key=True, default=uuid.uuid4)
    name = Column(String(255), nullable=False)
    backup_type = Column(String(50), nullable=False)  # 'full', 'incremental', 'database', 'files', 'docker_volume', 'studio_project'
    source = Column(String(1000), nullable=False)
    destination = Column(String(1000), nullable=False)
    cron_expression = Column(String(100), nullable=False)  # Standard cron format
    enabled = Column(Boolean, nullable=False, default=True)
    last_run = Column(DateTime(timezone=True), nullable=True)
    next_run = Column(DateTime(timezone=True), nullable=True)
    retention_days = Column(Integer, nullable=False, default=30)  # Keep backups for X days
    retention_count = Column(Integer, nullable=True)  # Keep last X backups (alternative to days)
    compression = Column(String(20), nullable=True, default='gzip')
    schedule_metadata = Column(JSONB, nullable=True)  # Additional options
    created_at = Column(DateTime(timezone=True), default=datetime.utcnow, nullable=False)
    updated_at = Column(DateTime(timezone=True), default=datetime.utcnow, onupdate=datetime.utcnow, nullable=False)
    
    def to_dict(self):
        return {
            'id': str(self.id),
            'name': self.name,
            'backup_type': self.backup_type,
            'source': self.source,
            'destination': self.destination,
            'cron_expression': self.cron_expression,
            'cron_readable': self._cron_to_readable(self.cron_expression),
            'enabled': self.enabled,
            'last_run': self.last_run.isoformat() if self.last_run else None,
            'next_run': self.next_run.isoformat() if self.next_run else None,
            'retention_days': self.retention_days,
            'retention_count': self.retention_count,
            'compression': self.compression,
            'schedule_metadata': self.schedule_metadata,
            'created_at': self.created_at.isoformat() if self.created_at else None,
            'updated_at': self.updated_at.isoformat() if self.updated_at else None,
        }
    
    def _cron_to_readable(self, cron_expr):
        """Convert cron expression to human readable format"""
        parts = cron_expr.split()
        if len(parts) != 5:
            return cron_expr
        
        minute, hour, day, month, weekday = parts
        
        common_patterns = {
            '0 0 * * *': 'Daily at midnight',
            '0 2 * * *': 'Daily at 2:00 AM',
            '0 3 * * *': 'Daily at 3:00 AM',
            '0 0 * * 0': 'Weekly on Sunday at midnight',
            '0 0 * * 1': 'Weekly on Monday at midnight',
            '0 0 1 * *': 'Monthly on the 1st at midnight',
            '*/15 * * * *': 'Every 15 minutes',
            '0 */6 * * *': 'Every 6 hours',
            '0 */12 * * *': 'Every 12 hours',
        }
        
        if cron_expr in common_patterns:
            return common_patterns[cron_expr]
        
        return cron_expr
