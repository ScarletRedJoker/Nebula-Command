from sqlalchemy import Column, String, DateTime, Integer, Text, Enum as SQLEnum
from sqlalchemy.dialects.postgresql import UUID, JSON
from sqlalchemy.sql import func
import uuid
import enum
from . import Base

class WorkflowStatus(enum.Enum):
    pending = "pending"
    running = "running"
    completed = "completed"
    failed = "failed"
    paused = "paused"

class Workflow(Base):
    __tablename__ = 'workflows'
    
    id = Column(UUID(as_uuid=True), primary_key=True, default=uuid.uuid4)
    name = Column(String(255), nullable=False)
    status = Column(SQLEnum(WorkflowStatus), nullable=False, default=WorkflowStatus.pending)
    workflow_type = Column(String(100), nullable=False)
    created_by = Column(String(255), nullable=False)
    started_at = Column(DateTime(timezone=True), server_default=func.now())
    completed_at = Column(DateTime(timezone=True), nullable=True)
    error_message = Column(Text, nullable=True)
    workflow_metadata = Column(JSON, nullable=True, default=dict)
    current_step = Column(String(255), nullable=True)
    total_steps = Column(Integer, nullable=True)
    
    def __repr__(self):
        return f"<Workflow(id={self.id}, name='{self.name}', status='{self.status.value}')>"
    
    def to_dict(self):
        return {
            'id': str(self.id),
            'name': self.name,
            'status': self.status.value,
            'workflow_type': self.workflow_type,
            'created_by': self.created_by,
            'started_at': self.started_at.isoformat() if self.started_at else None,
            'completed_at': self.completed_at.isoformat() if self.completed_at else None,
            'error_message': self.error_message,
            'workflow_metadata': self.workflow_metadata,
            'current_step': self.current_step,
            'total_steps': self.total_steps
        }
