from sqlalchemy import String, DateTime, Integer, Boolean, Enum as SQLEnum, ForeignKey, Text
from sqlalchemy.dialects.postgresql import UUID, JSON
from sqlalchemy.sql import func
from sqlalchemy.orm import relationship, Mapped, mapped_column
from typing import Optional, TYPE_CHECKING, List
from datetime import datetime
import uuid
import enum
from . import Base

if TYPE_CHECKING:
    from .deployment import Deployment
    from .domain_event import DomainEvent
    from .domain_task import DomainTask

class RecordType(enum.Enum):
    A = "A"
    CNAME = "CNAME"
    TXT = "TXT"
    MX = "MX"
    AAAA = "AAAA"

class RecordStatus(enum.Enum):
    pending = "pending"
    active = "active"
    failed = "failed"
    removed = "removed"

class DomainRecord(Base):
    __tablename__ = 'domain_records'
    
    id: Mapped[uuid.UUID] = mapped_column(UUID(as_uuid=True), primary_key=True, default=uuid.uuid4)
    deployment_id: Mapped[Optional[uuid.UUID]] = mapped_column(UUID(as_uuid=True), ForeignKey('deployments.id', ondelete='SET NULL'))
    domain: Mapped[str] = mapped_column(String(255))
    subdomain: Mapped[str] = mapped_column(String(255))
    record_type: Mapped[RecordType] = mapped_column(SQLEnum(RecordType))
    record_value: Mapped[str] = mapped_column(String(512))
    ttl: Mapped[int] = mapped_column(Integer, default=3600)
    auto_managed: Mapped[bool] = mapped_column(Boolean, default=False)
    dns_provider: Mapped[str] = mapped_column(String(100))
    status: Mapped[RecordStatus] = mapped_column(SQLEnum(RecordStatus), default=RecordStatus.pending)
    verified_at: Mapped[Optional[datetime]] = mapped_column(DateTime(timezone=True))
    record_metadata: Mapped[Optional[dict]] = mapped_column(JSON, default=dict)
    managed_by: Mapped[Optional[str]] = mapped_column(String(20), default='automatic')
    verification_token: Mapped[Optional[str]] = mapped_column(String(255))
    priority: Mapped[Optional[int]] = mapped_column(Integer)
    provider: Mapped[Optional[str]] = mapped_column(String(50))
    provider_record_id: Mapped[Optional[str]] = mapped_column(String(255))
    last_verified: Mapped[Optional[datetime]] = mapped_column(DateTime(timezone=True))
    
    # New fields from migration 010
    service_name: Mapped[Optional[str]] = mapped_column(String(100))
    service_type: Mapped[Optional[str]] = mapped_column(String(50))
    container_name: Mapped[Optional[str]] = mapped_column(String(100))
    port: Mapped[Optional[int]] = mapped_column(Integer)
    ssl_enabled: Mapped[bool] = mapped_column(Boolean, default=True)
    auto_ssl: Mapped[bool] = mapped_column(Boolean, default=True)
    health_check_url: Mapped[Optional[str]] = mapped_column(String(512))
    health_check_interval: Mapped[Optional[int]] = mapped_column(Integer, default=300)
    last_health_check: Mapped[Optional[datetime]] = mapped_column(DateTime(timezone=True))
    health_status: Mapped[Optional[str]] = mapped_column(String(20))
    response_time_ms: Mapped[Optional[int]] = mapped_column(Integer)
    provisioning_status: Mapped[str] = mapped_column(String(20), default='pending')
    notes: Mapped[Optional[str]] = mapped_column(Text)
    
    # SSL tracking fields (migration 011)
    ssl_expiry_date: Mapped[Optional[datetime]] = mapped_column(DateTime(timezone=True))
    last_ssl_check: Mapped[Optional[datetime]] = mapped_column(DateTime(timezone=True))
    ssl_issuer: Mapped[Optional[str]] = mapped_column(String(255))
    ssl_days_remaining: Mapped[Optional[int]] = mapped_column(Integer)
    last_health_check_at: Mapped[Optional[datetime]] = mapped_column(DateTime(timezone=True))
    
    # Relationships
    deployment: Mapped[Optional["Deployment"]] = relationship("Deployment", backref="domain_records", foreign_keys=[deployment_id])
    events: Mapped[List["DomainEvent"]] = relationship("DomainEvent", back_populates="domain_record", cascade="all, delete-orphan")
    tasks: Mapped[List["DomainTask"]] = relationship("DomainTask", back_populates="domain_record", cascade="all, delete-orphan")
    
    def __repr__(self):
        return f"<DomainRecord(id={self.id}, domain='{self.domain}', subdomain='{self.subdomain}', type='{self.record_type.value}')>"
    
    def to_dict(self):
        return {
            'id': str(self.id),
            'deployment_id': str(self.deployment_id) if self.deployment_id else None,
            'domain': self.domain,
            'subdomain': self.subdomain,
            'record_type': self.record_type.value if self.record_type else None,
            'record_value': self.record_value,
            'ttl': self.ttl,
            'auto_managed': self.auto_managed,
            'dns_provider': self.dns_provider,
            'status': self.status.value if self.status else None,
            'verified_at': self.verified_at.isoformat() if self.verified_at else None,
            'record_metadata': self.record_metadata,
            'managed_by': self.managed_by,
            'verification_token': self.verification_token,
            'priority': self.priority,
            'provider': self.provider,
            'provider_record_id': self.provider_record_id,
            'last_verified': self.last_verified.isoformat() if self.last_verified else None,
            # New fields
            'service_name': self.service_name,
            'service_type': self.service_type,
            'container_name': self.container_name,
            'port': self.port,
            'ssl_enabled': self.ssl_enabled,
            'auto_ssl': self.auto_ssl,
            'health_check_url': self.health_check_url,
            'health_check_interval': self.health_check_interval,
            'last_health_check': self.last_health_check.isoformat() if self.last_health_check else None,
            'health_status': self.health_status,
            'response_time_ms': self.response_time_ms,
            'provisioning_status': self.provisioning_status,
            'notes': self.notes,
            # SSL tracking fields
            'ssl_expiry_date': self.ssl_expiry_date.isoformat() if self.ssl_expiry_date else None,
            'last_ssl_check': self.last_ssl_check.isoformat() if self.last_ssl_check else None,
            'ssl_issuer': self.ssl_issuer,
            'ssl_days_remaining': self.ssl_days_remaining,
            'last_health_check_at': self.last_health_check_at.isoformat() if self.last_health_check_at else None
        }
    
    @property
    def full_domain(self) -> str:
        """Get the full domain name (subdomain.domain or just domain)"""
        if self.subdomain and self.subdomain not in ['@', '']:
            return f"{self.subdomain}.{self.domain}"
        return self.domain
