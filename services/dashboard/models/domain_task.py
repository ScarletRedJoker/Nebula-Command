"""Domain Task Model - Track autonomous provisioning workflow tasks"""

from sqlalchemy import String, Text, DateTime, Integer, ForeignKey, Boolean
from sqlalchemy.dialects.postgresql import UUID, JSONB
from sqlalchemy.sql import func
from sqlalchemy.orm import relationship, Mapped, mapped_column
from typing import Optional, Dict, Any, List
from datetime import datetime
import uuid
from . import Base

if __name__ != '__main__':
    from .domain_record import DomainRecord


class DomainTask(Base):
    """Track autonomous domain provisioning and management tasks"""
    __tablename__ = 'domain_tasks'
    
    id: Mapped[uuid.UUID] = mapped_column(UUID(as_uuid=True), primary_key=True, default=uuid.uuid4)
    domain_record_id: Mapped[uuid.UUID] = mapped_column(
        UUID(as_uuid=True), 
        ForeignKey('domain_records.id', ondelete='CASCADE'),
        nullable=False
    )
    task_type: Mapped[str] = mapped_column(String(50), nullable=False)
    status: Mapped[str] = mapped_column(String(20), nullable=False, default='pending')
    priority: Mapped[int] = mapped_column(Integer, nullable=False, default=5)
    scheduled_at: Mapped[Optional[datetime]] = mapped_column(DateTime(timezone=True))
    started_at: Mapped[Optional[datetime]] = mapped_column(DateTime(timezone=True))
    completed_at: Mapped[Optional[datetime]] = mapped_column(DateTime(timezone=True))
    retry_count: Mapped[int] = mapped_column(Integer, nullable=False, default=0)
    max_retries: Mapped[int] = mapped_column(Integer, nullable=False, default=3)
    workflow_state: Mapped[Optional[Dict[str, Any]]] = mapped_column(JSONB)
    steps_completed: Mapped[Optional[List[str]]] = mapped_column(JSONB)
    current_step: Mapped[Optional[str]] = mapped_column(String(100))
    task_metadata: Mapped[Optional[Dict[str, Any]]] = mapped_column(JSONB)
    result: Mapped[Optional[Dict[str, Any]]] = mapped_column(JSONB)
    error_message: Mapped[Optional[str]] = mapped_column(Text)
    error_details: Mapped[Optional[Dict[str, Any]]] = mapped_column(JSONB)
    celery_task_id: Mapped[Optional[str]] = mapped_column(String(255))
    parent_task_id: Mapped[Optional[uuid.UUID]] = mapped_column(
        UUID(as_uuid=True), 
        ForeignKey('domain_tasks.id', ondelete='SET NULL')
    )
    created_by: Mapped[Optional[str]] = mapped_column(String(100))
    created_at: Mapped[datetime] = mapped_column(
        DateTime(timezone=True), 
        nullable=False, 
        server_default=func.now()
    )
    updated_at: Mapped[datetime] = mapped_column(
        DateTime(timezone=True), 
        nullable=False, 
        server_default=func.now(),
        onupdate=func.now()
    )
    
    # Relationships
    domain_record: Mapped["DomainRecord"] = relationship(
        "DomainRecord", 
        back_populates="tasks"
    )
    parent_task: Mapped[Optional["DomainTask"]] = relationship(
        "DomainTask",
        remote_side=[id],
        back_populates="subtasks"
    )
    subtasks: Mapped[List["DomainTask"]] = relationship(
        "DomainTask",
        back_populates="parent_task"
    )
    
    def __repr__(self):
        return f"<DomainTask(id={self.id}, type='{self.task_type}', status='{self.status}', step='{self.current_step}')>"
    
    def to_dict(self) -> Dict[str, Any]:
        """Convert to dictionary for JSON serialization"""
        return {
            'id': str(self.id),
            'domain_record_id': str(self.domain_record_id),
            'task_type': self.task_type,
            'status': self.status,
            'priority': self.priority,
            'scheduled_at': self.scheduled_at.isoformat() if self.scheduled_at else None,
            'started_at': self.started_at.isoformat() if self.started_at else None,
            'completed_at': self.completed_at.isoformat() if self.completed_at else None,
            'retry_count': self.retry_count,
            'max_retries': self.max_retries,
            'workflow_state': self.workflow_state,
            'steps_completed': self.steps_completed,
            'current_step': self.current_step,
            'task_metadata': self.task_metadata,
            'result': self.result,
            'error_message': self.error_message,
            'error_details': self.error_details,
            'celery_task_id': self.celery_task_id,
            'parent_task_id': str(self.parent_task_id) if self.parent_task_id else None,
            'created_by': self.created_by,
            'created_at': self.created_at.isoformat() if self.created_at else None,
            'updated_at': self.updated_at.isoformat() if self.updated_at else None
        }
    
    def mark_started(self):
        """Mark task as started"""
        self.status = 'in_progress'
        self.started_at = datetime.utcnow()
    
    def mark_completed(self, result: Optional[Dict[str, Any]] = None):
        """Mark task as completed"""
        self.status = 'completed'
        self.completed_at = datetime.utcnow()
        if result:
            self.result = result
    
    def mark_failed(self, error_message: str, error_details: Optional[Dict[str, Any]] = None):
        """Mark task as failed"""
        self.status = 'failed'
        self.completed_at = datetime.utcnow()
        self.error_message = error_message
        if error_details:
            self.error_details = error_details
    
    def retry(self):
        """Increment retry count and set status to retrying"""
        self.retry_count += 1
        if self.retry_count < self.max_retries:
            self.status = 'retrying'
        else:
            self.status = 'failed'
            self.error_message = f'Failed after {self.retry_count} retries'
    
    def update_step(self, step: str, details: Optional[Dict[str, Any]] = None):
        """Update current workflow step"""
        self.current_step = step
        
        if self.steps_completed is None:
            self.steps_completed = []
        
        if step not in self.steps_completed:
            self.steps_completed.append(step)
        
        if details and self.workflow_state:
            self.workflow_state.update(details)
    
    @classmethod
    def create_provision_task(
        cls,
        domain_record_id: uuid.UUID,
        created_by: Optional[str] = 'system',
        priority: int = 5,
        metadata: Optional[Dict[str, Any]] = None
    ) -> 'DomainTask':
        """Factory method to create a domain provisioning task"""
        return cls(
            domain_record_id=domain_record_id,
            task_type='provision',
            status='pending',
            priority=priority,
            created_by=created_by,
            task_metadata=metadata or {},
            workflow_state={
                'steps_required': [
                    'validate_domain',
                    'create_dns_records',
                    'wait_dns_propagation',
                    'generate_caddy_config',
                    'reload_caddy',
                    'wait_ssl_certificate',
                    'verify_https',
                    'mark_active'
                ],
                'current_index': 0
            },
            steps_completed=[]
        )
