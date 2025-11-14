from sqlalchemy import Column, String, DateTime, Integer, Boolean, Enum as SQLEnum, ForeignKey
from sqlalchemy.dialects.postgresql import UUID, JSON
from sqlalchemy.sql import func
from sqlalchemy.orm import relationship
import uuid
import enum
from . import Base

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
    
    id = Column(UUID(as_uuid=True), primary_key=True, default=uuid.uuid4)
    deployment_id = Column(UUID(as_uuid=True), ForeignKey('deployments.id', ondelete='SET NULL'), nullable=True)
    domain = Column(String(255), nullable=False)
    subdomain = Column(String(255), nullable=False)
    record_type = Column(SQLEnum(RecordType), nullable=False)
    record_value = Column(String(512), nullable=False)
    ttl = Column(Integer, nullable=False, default=3600)
    auto_managed = Column(Boolean, nullable=False, default=False)
    dns_provider = Column(String(100), nullable=False)
    status = Column(SQLEnum(RecordStatus), nullable=False, default=RecordStatus.pending)
    verified_at = Column(DateTime(timezone=True), nullable=True)
    record_metadata = Column(JSON, nullable=True, default=dict)
    managed_by = Column(String(20), nullable=True, default='automatic')
    verification_token = Column(String(255), nullable=True)
    priority = Column(Integer, nullable=True)
    provider = Column(String(50), nullable=True)
    provider_record_id = Column(String(255), nullable=True)
    last_verified = Column(DateTime(timezone=True), nullable=True)
    
    deployment = relationship("Deployment", backref="domain_records", foreign_keys=[deployment_id])
    
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
            'last_verified': self.last_verified.isoformat() if self.last_verified else None
        }
