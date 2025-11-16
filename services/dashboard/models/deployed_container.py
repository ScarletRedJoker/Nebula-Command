from sqlalchemy import String, DateTime, Enum as SQLEnum, ForeignKey
from sqlalchemy.dialects.postgresql import UUID, JSON
from sqlalchemy.sql import func
from sqlalchemy.orm import relationship, Mapped, mapped_column
from typing import Optional, TYPE_CHECKING
from datetime import datetime
import uuid
import enum
from . import Base

if TYPE_CHECKING:
    from .container_template import ContainerTemplate


class ContainerStatus(enum.Enum):
    deploying = "deploying"
    running = "running"
    stopped = "stopped"
    failed = "failed"
    removing = "removing"


class DeployedContainer(Base):
    """User's deployed containers from marketplace"""
    __tablename__ = 'deployed_containers'
    
    id: Mapped[uuid.UUID] = mapped_column(UUID(as_uuid=True), primary_key=True, default=uuid.uuid4)
    template_id: Mapped[uuid.UUID] = mapped_column(
        UUID(as_uuid=True),
        ForeignKey('container_templates.id', ondelete='CASCADE'),
        nullable=False
    )
    
    container_name: Mapped[str] = mapped_column(String(100), unique=True, nullable=False, index=True)
    subdomain: Mapped[Optional[str]] = mapped_column(String(100), index=True)
    status: Mapped[ContainerStatus] = mapped_column(
        SQLEnum(ContainerStatus),
        default=ContainerStatus.deploying,
        index=True
    )
    
    # Custom configuration overrides
    custom_env: Mapped[Optional[dict]] = mapped_column(JSON, default=dict)
    custom_volumes: Mapped[Optional[dict]] = mapped_column(JSON, default=dict)
    custom_ports: Mapped[Optional[dict]] = mapped_column(JSON, default=dict)
    
    # Runtime information
    access_url: Mapped[Optional[str]] = mapped_column(String(500))
    internal_port: Mapped[Optional[int]] = mapped_column()
    docker_container_id: Mapped[Optional[str]] = mapped_column(String(100))
    
    # Health monitoring
    last_health_check: Mapped[Optional[datetime]] = mapped_column(DateTime(timezone=True))
    health_status: Mapped[Optional[str]] = mapped_column(String(20))
    error_message: Mapped[Optional[str]] = mapped_column(String(1000))
    
    # Timestamps
    deployed_at: Mapped[datetime] = mapped_column(DateTime(timezone=True), server_default=func.now())
    updated_at: Mapped[Optional[datetime]] = mapped_column(DateTime(timezone=True), onupdate=func.now())
    stopped_at: Mapped[Optional[datetime]] = mapped_column(DateTime(timezone=True))
    
    # Relationships
    template: Mapped["ContainerTemplate"] = relationship(
        "ContainerTemplate",
        back_populates="deployments",
        foreign_keys=[template_id]
    )
    
    def __repr__(self):
        return f"<DeployedContainer(id={self.id}, name='{self.container_name}', status='{self.status.value}')>"
    
    def to_dict(self):
        return {
            'id': str(self.id),
            'template_id': str(self.template_id),
            'template': self.template.to_dict() if self.template else None,
            'container_name': self.container_name,
            'subdomain': self.subdomain,
            'status': self.status.value if self.status else None,
            'custom_env': self.custom_env,
            'custom_volumes': self.custom_volumes,
            'custom_ports': self.custom_ports,
            'access_url': self.access_url,
            'internal_port': self.internal_port,
            'docker_container_id': self.docker_container_id,
            'last_health_check': self.last_health_check.isoformat() if self.last_health_check else None,
            'health_status': self.health_status,
            'error_message': self.error_message,
            'deployed_at': self.deployed_at.isoformat() if self.deployed_at else None,
            'updated_at': self.updated_at.isoformat() if self.updated_at else None,
            'stopped_at': self.stopped_at.isoformat() if self.stopped_at else None
        }
