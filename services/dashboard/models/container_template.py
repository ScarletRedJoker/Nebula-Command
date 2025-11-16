from sqlalchemy import String, DateTime, Integer, Boolean, Float, Text
from sqlalchemy.dialects.postgresql import UUID, JSON
from sqlalchemy.sql import func
from sqlalchemy.orm import relationship, Mapped, mapped_column
from typing import Optional, TYPE_CHECKING, List
from datetime import datetime
import uuid
from . import Base

if TYPE_CHECKING:
    from .deployed_container import DeployedContainer


class ContainerTemplate(Base):
    """Curated app templates for one-click deployment from marketplace"""
    __tablename__ = 'container_templates'
    
    id: Mapped[uuid.UUID] = mapped_column(UUID(as_uuid=True), primary_key=True, default=uuid.uuid4)
    name: Mapped[str] = mapped_column(String(100), unique=True, nullable=False, index=True)
    display_name: Mapped[str] = mapped_column(String(200), nullable=False)
    description: Mapped[Optional[str]] = mapped_column(Text)
    category: Mapped[str] = mapped_column(String(50), nullable=False, index=True)
    icon_url: Mapped[Optional[str]] = mapped_column(String(500))
    
    # Deployment configuration
    docker_image: Mapped[str] = mapped_column(String(200), nullable=False)
    compose_template: Mapped[dict] = mapped_column(JSON, nullable=False)
    required_ports: Mapped[Optional[List]] = mapped_column(JSON, default=list)
    required_volumes: Mapped[Optional[List]] = mapped_column(JSON, default=list)
    environment_vars: Mapped[Optional[dict]] = mapped_column(JSON, default=dict)
    
    # Metadata
    author: Mapped[Optional[str]] = mapped_column(String(100))
    version: Mapped[str] = mapped_column(String(20), default='latest')
    homepage_url: Mapped[Optional[str]] = mapped_column(String(500))
    documentation_url: Mapped[Optional[str]] = mapped_column(String(500))
    
    # Statistics
    downloads: Mapped[int] = mapped_column(Integer, default=0)
    rating: Mapped[float] = mapped_column(Float, default=0.0)
    featured: Mapped[bool] = mapped_column(Boolean, default=False, index=True)
    
    # Dependencies and conflicts
    depends_on: Mapped[Optional[List]] = mapped_column(JSON, default=list)
    conflicts_with: Mapped[Optional[List]] = mapped_column(JSON, default=list)
    
    # Timestamps
    created_at: Mapped[datetime] = mapped_column(DateTime(timezone=True), server_default=func.now())
    updated_at: Mapped[Optional[datetime]] = mapped_column(DateTime(timezone=True), onupdate=func.now())
    
    # Relationships
    deployments: Mapped[List["DeployedContainer"]] = relationship(
        "DeployedContainer",
        back_populates="template",
        cascade="all, delete-orphan"
    )
    
    def __repr__(self):
        return f"<ContainerTemplate(id={self.id}, name='{self.name}', category='{self.category}')>"
    
    def to_dict(self):
        return {
            'id': str(self.id),
            'name': self.name,
            'display_name': self.display_name,
            'description': self.description,
            'category': self.category,
            'icon_url': self.icon_url,
            'docker_image': self.docker_image,
            'compose_template': self.compose_template,
            'required_ports': self.required_ports,
            'required_volumes': self.required_volumes,
            'environment_vars': self.environment_vars,
            'author': self.author,
            'version': self.version,
            'homepage_url': self.homepage_url,
            'documentation_url': self.documentation_url,
            'downloads': self.downloads,
            'rating': self.rating,
            'featured': self.featured,
            'depends_on': self.depends_on,
            'conflicts_with': self.conflicts_with,
            'created_at': self.created_at.isoformat() if self.created_at else None,
            'updated_at': self.updated_at.isoformat() if self.updated_at else None
        }
