"""
System Log Model
Tracks system-level events, errors, and infrastructure logs
Separate from user activity logs for better separation of concerns
"""
from sqlalchemy import Column, Integer, String, DateTime, Text, JSON, Index, Float
from datetime import datetime
from models import Base


class SystemLog(Base):
    """System log entry for infrastructure and service events"""
    __tablename__ = 'system_logs'
    
    id = Column(Integer, primary_key=True)
    
    source = Column(String(100), nullable=False, index=True)
    source_type = Column(String(50), nullable=False, index=True)
    
    level = Column(String(20), nullable=False, index=True)
    category = Column(String(50), nullable=True, index=True)
    
    message = Column(Text, nullable=False)
    details = Column(JSON, nullable=True)
    
    container_id = Column(String(64), nullable=True)
    container_name = Column(String(100), nullable=True, index=True)
    
    host = Column(String(100), nullable=True)
    process_id = Column(Integer, nullable=True)
    
    stack_trace = Column(Text, nullable=True)
    error_code = Column(String(50), nullable=True, index=True)
    
    cpu_percent = Column(Float, nullable=True)
    memory_percent = Column(Float, nullable=True)
    disk_percent = Column(Float, nullable=True)
    
    timestamp = Column(DateTime, default=datetime.utcnow, nullable=False, index=True)
    
    year_month = Column(String(7), nullable=True, index=True)
    
    metadata_json = Column(JSON, nullable=True)
    
    __table_args__ = (
        Index('ix_syslog_source_timestamp', 'source', 'timestamp'),
        Index('ix_syslog_level_timestamp', 'level', 'timestamp'),
        Index('ix_syslog_category_timestamp', 'category', 'timestamp'),
        Index('ix_syslog_container_timestamp', 'container_name', 'timestamp'),
        Index('ix_syslog_year_month', 'year_month'),
        Index('ix_syslog_error_code', 'error_code'),
    )
    
    def __init__(self, **kwargs):
        super().__init__(**kwargs)
        if self.timestamp and not self.year_month:
            self.year_month = self.timestamp.strftime('%Y-%m')
    
    def to_dict(self):
        return {
            'id': self.id,
            'source': self.source,
            'source_type': self.source_type,
            'level': self.level,
            'category': self.category,
            'message': self.message,
            'details': self.details,
            'container': {
                'id': self.container_id,
                'name': self.container_name
            },
            'host': self.host,
            'process_id': self.process_id,
            'error': {
                'stack_trace': self.stack_trace,
                'code': self.error_code
            } if self.stack_trace or self.error_code else None,
            'metrics': {
                'cpu_percent': self.cpu_percent,
                'memory_percent': self.memory_percent,
                'disk_percent': self.disk_percent
            } if any([self.cpu_percent, self.memory_percent, self.disk_percent]) else None,
            'timestamp': self.timestamp.isoformat() if self.timestamp else None,
            'year_month': self.year_month,
            'metadata': self.metadata_json
        }
    
    @classmethod
    def create_log(cls, source: str, source_type: str, level: str, message: str, **kwargs):
        """Factory method to create a system log entry"""
        timestamp = kwargs.pop('timestamp', None) or datetime.utcnow()
        year_month = timestamp.strftime('%Y-%m')
        return cls(
            source=source,
            source_type=source_type,
            level=level,
            message=message,
            timestamp=timestamp,
            year_month=year_month,
            **kwargs
        )


class ActivityLog(Base):
    """User activity log entry - tracks user-initiated actions"""
    __tablename__ = 'activity_logs'
    
    id = Column(Integer, primary_key=True)
    
    user_id = Column(String(100), nullable=True, index=True)
    username = Column(String(100), nullable=True)
    session_id = Column(String(100), nullable=True, index=True)
    
    activity_type = Column(String(50), nullable=False, index=True)
    action = Column(String(100), nullable=False, index=True)
    
    resource_type = Column(String(50), nullable=True, index=True)
    resource_id = Column(String(255), nullable=True, index=True)
    resource_name = Column(String(255), nullable=True)
    
    description = Column(Text, nullable=True)
    
    previous_state = Column(JSON, nullable=True)
    new_state = Column(JSON, nullable=True)
    
    ip_address = Column(String(45), nullable=True)
    user_agent = Column(String(500), nullable=True)
    
    duration_ms = Column(Integer, nullable=True)
    success = Column(String(10), default='true')
    
    timestamp = Column(DateTime, default=datetime.utcnow, nullable=False, index=True)
    
    year_month = Column(String(7), nullable=True, index=True)
    
    metadata_json = Column(JSON, nullable=True)
    
    __table_args__ = (
        Index('ix_activity_user_timestamp', 'user_id', 'timestamp'),
        Index('ix_activity_type_timestamp', 'activity_type', 'timestamp'),
        Index('ix_activity_resource', 'resource_type', 'resource_id'),
        Index('ix_activity_year_month', 'year_month'),
        Index('ix_activity_session', 'session_id', 'timestamp'),
    )
    
    def __init__(self, **kwargs):
        super().__init__(**kwargs)
        if self.timestamp and not self.year_month:
            self.year_month = self.timestamp.strftime('%Y-%m')
    
    def to_dict(self):
        return {
            'id': self.id,
            'user': {
                'id': self.user_id,
                'username': self.username,
                'session_id': self.session_id
            },
            'activity': {
                'type': self.activity_type,
                'action': self.action,
                'description': self.description
            },
            'resource': {
                'type': self.resource_type,
                'id': self.resource_id,
                'name': self.resource_name
            } if self.resource_type else None,
            'state_change': {
                'previous': self.previous_state,
                'new': self.new_state
            } if self.previous_state or self.new_state else None,
            'client': {
                'ip_address': self.ip_address,
                'user_agent': self.user_agent
            },
            'duration_ms': self.duration_ms,
            'success': self.success == 'true',
            'timestamp': self.timestamp.isoformat() if self.timestamp else None,
            'year_month': self.year_month,
            'metadata': self.metadata_json
        }


__all__ = ['SystemLog', 'ActivityLog']
