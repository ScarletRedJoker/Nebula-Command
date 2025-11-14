from sqlalchemy import Column, String, DateTime, Enum as SQLEnum, ForeignKey
from sqlalchemy.dialects.postgresql import UUID, JSON
from sqlalchemy.sql import func
from sqlalchemy.orm import relationship
import uuid
import enum
from . import Base

class DeploymentStatus(enum.Enum):
    deploying = "deploying"
    running = "running"
    stopped = "stopped"
    failed = "failed"
    removed = "removed"

class HealthStatus(enum.Enum):
    healthy = "healthy"
    unhealthy = "unhealthy"
    unknown = "unknown"

class Deployment(Base):
    __tablename__ = 'deployments'
    
    id = Column(UUID(as_uuid=True), primary_key=True, default=uuid.uuid4)
    workflow_id = Column(UUID(as_uuid=True), ForeignKey('workflows.id', ondelete='CASCADE'), nullable=False)
    artifact_id = Column(UUID(as_uuid=True), ForeignKey('artifacts.id', ondelete='SET NULL'), nullable=True)
    service_name = Column(String(255), nullable=False)
    service_type = Column(String(100), nullable=False)
    domain = Column(String(255), nullable=True)
    status = Column(SQLEnum(DeploymentStatus), nullable=False, default=DeploymentStatus.deploying)
    deployed_at = Column(DateTime(timezone=True), server_default=func.now())
    configuration = Column(JSON, nullable=True, default=dict)
    health_status = Column(SQLEnum(HealthStatus), nullable=False, default=HealthStatus.unknown)
    last_health_check = Column(DateTime(timezone=True), nullable=True)
    
    workflow = relationship("Workflow", backref="deployments", foreign_keys=[workflow_id])
    artifact = relationship("Artifact", backref="deployments", foreign_keys=[artifact_id])
    
    def __repr__(self):
        return f"<Deployment(id={self.id}, service_name='{self.service_name}', status='{self.status.value}')>"
    
    def to_dict(self):
        return {
            'id': str(self.id),
            'workflow_id': str(self.workflow_id),
            'artifact_id': str(self.artifact_id) if self.artifact_id else None,
            'service_name': self.service_name,
            'service_type': self.service_type,
            'domain': self.domain,
            'status': self.status.value,
            'deployed_at': self.deployed_at.isoformat() if self.deployed_at else None,
            'configuration': self.configuration,
            'health_status': self.health_status.value,
            'last_health_check': self.last_health_check.isoformat() if self.last_health_check else None
        }
