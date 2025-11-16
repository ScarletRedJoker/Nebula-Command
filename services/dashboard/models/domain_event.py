"""Domain Event Model - Audit trail for all domain operations"""

from sqlalchemy import String, Text, DateTime, Integer, ForeignKey
from sqlalchemy.dialects.postgresql import UUID, JSONB
from sqlalchemy.sql import func
from sqlalchemy.orm import relationship, Mapped, mapped_column
from typing import Optional, Dict, Any
from datetime import datetime
import uuid
from . import Base

if __name__ != '__main__':
    from .domain_record import DomainRecord


class DomainEvent(Base):
    """Audit trail for all domain-related events and operations"""
    __tablename__ = 'domain_events'
    
    id: Mapped[uuid.UUID] = mapped_column(UUID(as_uuid=True), primary_key=True, default=uuid.uuid4)
    domain_record_id: Mapped[Optional[uuid.UUID]] = mapped_column(
        UUID(as_uuid=True), 
        ForeignKey('domain_records.id', ondelete='CASCADE')
    )
    event_type: Mapped[str] = mapped_column(String(50), nullable=False)
    event_category: Mapped[str] = mapped_column(String(20), nullable=False)
    status: Mapped[str] = mapped_column(String(20), nullable=False, default='info')
    message: Mapped[str] = mapped_column(Text, nullable=False)
    details: Mapped[Optional[Dict[str, Any]]] = mapped_column(JSONB, nullable=True)
    triggered_by: Mapped[Optional[str]] = mapped_column(String(100))
    ip_address: Mapped[Optional[str]] = mapped_column(String(45))
    user_agent: Mapped[Optional[str]] = mapped_column(String(512))
    execution_time_ms: Mapped[Optional[int]] = mapped_column(Integer)
    error_details: Mapped[Optional[Dict[str, Any]]] = mapped_column(JSONB)
    created_at: Mapped[datetime] = mapped_column(
        DateTime(timezone=True), 
        nullable=False, 
        server_default=func.now()
    )
    
    # Relationship
    domain_record: Mapped[Optional["DomainRecord"]] = relationship(
        "DomainRecord", 
        back_populates="events"
    )
    
    def __repr__(self):
        return f"<DomainEvent(id={self.id}, type='{self.event_type}', category='{self.event_category}', status='{self.status}')>"
    
    def to_dict(self) -> Dict[str, Any]:
        """Convert to dictionary for JSON serialization"""
        return {
            'id': str(self.id),
            'domain_record_id': str(self.domain_record_id) if self.domain_record_id else None,
            'event_type': self.event_type,
            'event_category': self.event_category,
            'status': self.status,
            'message': self.message,
            'details': self.details,
            'triggered_by': self.triggered_by,
            'ip_address': self.ip_address,
            'user_agent': self.user_agent,
            'execution_time_ms': self.execution_time_ms,
            'error_details': self.error_details,
            'created_at': self.created_at.isoformat() if self.created_at else None
        }
    
    @classmethod
    def create_event(
        cls,
        event_type: str,
        event_category: str,
        message: str,
        status: str = 'info',
        domain_record_id: Optional[uuid.UUID] = None,
        details: Optional[Dict[str, Any]] = None,
        triggered_by: Optional[str] = None,
        ip_address: Optional[str] = None,
        user_agent: Optional[str] = None,
        execution_time_ms: Optional[int] = None,
        error_details: Optional[Dict[str, Any]] = None
    ) -> 'DomainEvent':
        """Factory method to create domain events"""
        return cls(
            event_type=event_type,
            event_category=event_category,
            message=message,
            status=status,
            domain_record_id=domain_record_id,
            details=details,
            triggered_by=triggered_by,
            ip_address=ip_address,
            user_agent=user_agent,
            execution_time_ms=execution_time_ms,
            error_details=error_details
        )
