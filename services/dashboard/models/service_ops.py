"""Service Operations Models"""
import uuid
from datetime import datetime
from sqlalchemy import Column, String, Integer, BigInteger, DateTime, Float, Boolean
from sqlalchemy.dialects.postgresql import UUID, JSONB
from sqlalchemy.ext.declarative import declarative_base

Base = declarative_base()


class ServiceTelemetry(Base):
    """Service telemetry and health metrics"""
    __tablename__ = 'service_telemetry'
    
    id = Column(UUID(as_uuid=True), primary_key=True, default=uuid.uuid4)
    service_name = Column(String(255), nullable=False)
    container_id = Column(String(255), nullable=True)
    status = Column(String(50), nullable=False)  # 'online', 'offline', 'restarting', 'error'
    cpu_percent = Column(Float, nullable=True)
    memory_usage = Column(BigInteger, nullable=True)  # Bytes
    memory_limit = Column(BigInteger, nullable=True)  # Bytes
    network_rx = Column(BigInteger, nullable=True)  # Bytes received
    network_tx = Column(BigInteger, nullable=True)  # Bytes transmitted
    health_status = Column(String(50), nullable=True)  # 'healthy', 'unhealthy', 'starting'
    restart_count = Column(Integer, nullable=True)
    uptime_seconds = Column(Integer, nullable=True)
    metadata = Column(JSONB, nullable=True)
    timestamp = Column(DateTime(timezone=True), default=datetime.utcnow, nullable=False)
    
    def to_dict(self):
        return {
            'id': str(self.id),
            'service_name': self.service_name,
            'container_id': self.container_id,
            'status': self.status,
            'cpu_percent': self.cpu_percent,
            'memory_usage': self.memory_usage,
            'memory_limit': self.memory_limit,
            'memory_percent': (self.memory_usage / self.memory_limit * 100) if self.memory_limit and self.memory_usage else None,
            'network_rx': self.network_rx,
            'network_tx': self.network_tx,
            'health_status': self.health_status,
            'restart_count': self.restart_count,
            'uptime_seconds': self.uptime_seconds,
            'metadata': self.metadata,
            'timestamp': self.timestamp.isoformat() if self.timestamp else None,
        }
