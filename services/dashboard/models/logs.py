"""
Log Entry and Log Stream Models
For the unified log viewer/aggregator
"""
from sqlalchemy import Column, Integer, String, DateTime, Text, JSON, Index, Boolean, BigInteger, Enum as SQLEnum
from datetime import datetime
from models import Base
import enum


class LogLevel(enum.Enum):
    DEBUG = 'debug'
    INFO = 'info'
    WARNING = 'warning'
    ERROR = 'error'


class SourceType(enum.Enum):
    FILE = 'file'
    DOCKER = 'docker'
    SYSTEMD = 'systemd'
    APPLICATION = 'application'


class LogEntry(Base):
    """Log entry from various sources"""
    __tablename__ = 'log_entries'
    
    id = Column(Integer, primary_key=True)
    
    source = Column(String(255), nullable=False, index=True)
    stream_id = Column(Integer, nullable=True, index=True)
    
    level = Column(String(20), nullable=False, index=True, default='info')
    
    message = Column(Text, nullable=False)
    
    container_id = Column(String(64), nullable=True, index=True)
    container_name = Column(String(100), nullable=True, index=True)
    
    host = Column(String(100), nullable=True)
    process_name = Column(String(100), nullable=True)
    process_id = Column(Integer, nullable=True)
    
    file_path = Column(String(500), nullable=True)
    line_number = Column(Integer, nullable=True)
    
    metadata_json = Column(JSON, nullable=True)
    
    timestamp = Column(DateTime, default=datetime.utcnow, nullable=False, index=True)
    
    year_month = Column(String(7), nullable=True, index=True)
    
    __table_args__ = (
        Index('ix_log_source_timestamp', 'source', 'timestamp'),
        Index('ix_log_level_timestamp', 'level', 'timestamp'),
        Index('ix_log_stream_timestamp', 'stream_id', 'timestamp'),
        Index('ix_log_container_timestamp', 'container_name', 'timestamp'),
        Index('ix_log_year_month', 'year_month'),
    )
    
    def __init__(self, **kwargs):
        super().__init__(**kwargs)
        if self.timestamp and not self.year_month:
            self.year_month = self.timestamp.strftime('%Y-%m')
    
    def to_dict(self):
        return {
            'id': self.id,
            'source': self.source,
            'stream_id': self.stream_id,
            'level': self.level,
            'message': self.message,
            'container': {
                'id': self.container_id,
                'name': self.container_name
            } if self.container_id or self.container_name else None,
            'host': self.host,
            'process': {
                'name': self.process_name,
                'id': self.process_id
            } if self.process_name or self.process_id else None,
            'file': {
                'path': self.file_path,
                'line': self.line_number
            } if self.file_path else None,
            'metadata': self.metadata_json,
            'timestamp': self.timestamp.isoformat() if self.timestamp else None,
            'year_month': self.year_month
        }
    
    @classmethod
    def create_entry(cls, source: str, level: str, message: str, **kwargs):
        """Factory method to create a log entry"""
        timestamp = kwargs.pop('timestamp', None) or datetime.utcnow()
        year_month = timestamp.strftime('%Y-%m')
        return cls(
            source=source,
            level=level.lower() if level else 'info',
            message=message,
            timestamp=timestamp,
            year_month=year_month,
            **kwargs
        )


class LogStream(Base):
    """Log stream source configuration"""
    __tablename__ = 'log_streams'
    
    id = Column(Integer, primary_key=True)
    
    name = Column(String(100), nullable=False, unique=True)
    description = Column(Text, nullable=True)
    
    source_type = Column(String(20), nullable=False, index=True)
    
    source_path = Column(String(500), nullable=True)
    
    container_name = Column(String(100), nullable=True)
    container_id = Column(String(64), nullable=True)
    
    systemd_unit = Column(String(100), nullable=True)
    
    enabled = Column(Boolean, default=True, nullable=False)
    
    last_read_position = Column(BigInteger, default=0)
    last_read_timestamp = Column(DateTime, nullable=True)
    
    log_format = Column(String(50), nullable=True)
    
    filter_pattern = Column(String(500), nullable=True)
    
    retention_days = Column(Integer, default=30)
    
    metadata_json = Column(JSON, nullable=True)
    
    created_at = Column(DateTime, default=datetime.utcnow, nullable=False)
    updated_at = Column(DateTime, default=datetime.utcnow, onupdate=datetime.utcnow, nullable=False)
    
    __table_args__ = (
        Index('ix_stream_source_type', 'source_type'),
        Index('ix_stream_enabled', 'enabled'),
    )
    
    def to_dict(self):
        return {
            'id': self.id,
            'name': self.name,
            'description': self.description,
            'source_type': self.source_type,
            'source_path': self.source_path,
            'container': {
                'name': self.container_name,
                'id': self.container_id
            } if self.container_name or self.container_id else None,
            'systemd_unit': self.systemd_unit,
            'enabled': self.enabled,
            'last_read': {
                'position': self.last_read_position,
                'timestamp': self.last_read_timestamp.isoformat() if self.last_read_timestamp else None
            },
            'log_format': self.log_format,
            'filter_pattern': self.filter_pattern,
            'retention_days': self.retention_days,
            'metadata': self.metadata_json,
            'created_at': self.created_at.isoformat() if self.created_at else None,
            'updated_at': self.updated_at.isoformat() if self.updated_at else None
        }
    
    @classmethod
    def create_stream(cls, name: str, source_type: str, **kwargs):
        """Factory method to create a log stream"""
        return cls(
            name=name,
            source_type=source_type.lower() if source_type else 'file',
            **kwargs
        )


__all__ = ['LogEntry', 'LogStream', 'LogLevel', 'SourceType']
