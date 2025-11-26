"""
Service Configuration Model
Metadata tables for service configurations, settings, and environment variables
"""
from sqlalchemy import Column, Integer, String, DateTime, Text, JSON, Boolean, Index, ForeignKey
from sqlalchemy.orm import relationship
from datetime import datetime
from models import Base


class ServiceConfig(Base):
    """Service configuration metadata"""
    __tablename__ = 'service_configs'
    
    id = Column(Integer, primary_key=True)
    
    service_name = Column(String(100), nullable=False, unique=True, index=True)
    display_name = Column(String(200), nullable=True)
    description = Column(Text, nullable=True)
    
    container_name = Column(String(100), nullable=True)
    image_name = Column(String(255), nullable=True)
    image_tag = Column(String(100), nullable=True)
    
    category = Column(String(50), nullable=True, index=True)
    
    ports = Column(JSON, nullable=True)
    volumes = Column(JSON, nullable=True)
    environment = Column(JSON, nullable=True)
    labels = Column(JSON, nullable=True)
    
    health_check_url = Column(String(500), nullable=True)
    health_check_interval = Column(Integer, default=60)
    health_check_timeout = Column(Integer, default=10)
    
    restart_policy = Column(String(50), default='unless-stopped')
    max_restarts = Column(Integer, default=3)
    
    dependencies = Column(JSON, nullable=True)
    
    is_enabled = Column(Boolean, default=True)
    is_critical = Column(Boolean, default=False)
    
    public_url = Column(String(500), nullable=True)
    internal_url = Column(String(500), nullable=True)
    
    created_at = Column(DateTime, default=datetime.utcnow, nullable=False)
    updated_at = Column(DateTime, default=datetime.utcnow, onupdate=datetime.utcnow)
    
    metadata_json = Column(JSON, nullable=True)
    
    settings = relationship("ServiceSetting", back_populates="service", cascade="all, delete-orphan")
    
    __table_args__ = (
        Index('ix_svc_config_category', 'category'),
        Index('ix_svc_config_enabled', 'is_enabled'),
        Index('ix_svc_config_critical', 'is_critical'),
    )
    
    def to_dict(self):
        return {
            'id': self.id,
            'service_name': self.service_name,
            'display_name': self.display_name,
            'description': self.description,
            'container': {
                'name': self.container_name,
                'image': self.image_name,
                'tag': self.image_tag
            },
            'category': self.category,
            'network': {
                'ports': self.ports,
                'public_url': self.public_url,
                'internal_url': self.internal_url
            },
            'volumes': self.volumes,
            'environment': self.environment,
            'labels': self.labels,
            'health_check': {
                'url': self.health_check_url,
                'interval': self.health_check_interval,
                'timeout': self.health_check_timeout
            },
            'restart': {
                'policy': self.restart_policy,
                'max_restarts': self.max_restarts
            },
            'dependencies': self.dependencies,
            'is_enabled': self.is_enabled,
            'is_critical': self.is_critical,
            'created_at': self.created_at.isoformat() if self.created_at else None,
            'updated_at': self.updated_at.isoformat() if self.updated_at else None,
            'metadata': self.metadata_json
        }


class ServiceSetting(Base):
    """Individual service settings key-value pairs"""
    __tablename__ = 'service_settings'
    
    id = Column(Integer, primary_key=True)
    
    service_id = Column(Integer, ForeignKey('service_configs.id'), nullable=False, index=True)
    
    key = Column(String(100), nullable=False)
    value = Column(Text, nullable=True)
    value_type = Column(String(20), default='string')
    
    is_secret = Column(Boolean, default=False)
    is_required = Column(Boolean, default=False)
    
    description = Column(Text, nullable=True)
    default_value = Column(Text, nullable=True)
    
    created_at = Column(DateTime, default=datetime.utcnow, nullable=False)
    updated_at = Column(DateTime, default=datetime.utcnow, onupdate=datetime.utcnow)
    
    service = relationship("ServiceConfig", back_populates="settings")
    
    __table_args__ = (
        Index('ix_svc_setting_key', 'service_id', 'key', unique=True),
    )
    
    def to_dict(self):
        return {
            'id': self.id,
            'service_id': self.service_id,
            'key': self.key,
            'value': '[REDACTED]' if self.is_secret else self.value,
            'value_type': self.value_type,
            'is_secret': self.is_secret,
            'is_required': self.is_required,
            'description': self.description,
            'default_value': self.default_value,
            'updated_at': self.updated_at.isoformat() if self.updated_at else None
        }


class ServiceDependency(Base):
    """Service dependency relationships"""
    __tablename__ = 'service_dependencies'
    
    id = Column(Integer, primary_key=True)
    
    service_name = Column(String(100), nullable=False, index=True)
    depends_on = Column(String(100), nullable=False, index=True)
    
    dependency_type = Column(String(50), default='required')
    
    startup_order = Column(Integer, nullable=True)
    
    health_check_required = Column(Boolean, default=True)
    timeout_seconds = Column(Integer, default=60)
    
    created_at = Column(DateTime, default=datetime.utcnow, nullable=False)
    
    __table_args__ = (
        Index('ix_svc_dep_service', 'service_name'),
        Index('ix_svc_dep_depends', 'depends_on'),
        Index('ix_svc_dep_pair', 'service_name', 'depends_on', unique=True),
    )
    
    def to_dict(self):
        return {
            'id': self.id,
            'service_name': self.service_name,
            'depends_on': self.depends_on,
            'dependency_type': self.dependency_type,
            'startup_order': self.startup_order,
            'health_check_required': self.health_check_required,
            'timeout_seconds': self.timeout_seconds
        }


__all__ = ['ServiceConfig', 'ServiceSetting', 'ServiceDependency']
