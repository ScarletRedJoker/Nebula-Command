from sqlalchemy import Column, String, DateTime, Text, Enum as SQLEnum, ForeignKey
from sqlalchemy.dialects.postgresql import UUID, JSON
from sqlalchemy.sql import func
from sqlalchemy.orm import relationship
import uuid
import enum
from . import Base

class TaskType(enum.Enum):
    dns_manual = "dns_manual"
    approval_required = "approval_required"
    verification = "verification"

class TaskStatus(enum.Enum):
    pending = "pending"
    in_progress = "in_progress"
    completed = "completed"
    cancelled = "cancelled"

class TaskPriority(enum.Enum):
    low = "low"
    medium = "medium"
    high = "high"
    critical = "critical"

class Task(Base):
    __tablename__ = 'tasks'
    
    id = Column(UUID(as_uuid=True), primary_key=True, default=uuid.uuid4)
    workflow_id = Column(UUID(as_uuid=True), ForeignKey('workflows.id', ondelete='SET NULL'), nullable=True)
    title = Column(String(255), nullable=False)
    description = Column(Text, nullable=False)
    task_type = Column(SQLEnum(TaskType), nullable=False)
    status = Column(SQLEnum(TaskStatus), nullable=False, default=TaskStatus.pending)
    priority = Column(SQLEnum(TaskPriority), nullable=False, default=TaskPriority.medium)
    assigned_to = Column(String(255), nullable=True)
    instructions = Column(JSON, nullable=True, default=dict)
    created_at = Column(DateTime(timezone=True), server_default=func.now())
    completed_at = Column(DateTime(timezone=True), nullable=True)
    task_metadata = Column(JSON, nullable=True, default=dict)
    
    workflow = relationship("Workflow", backref="tasks", foreign_keys=[workflow_id])
    
    def __repr__(self):
        return f"<Task(id={self.id}, title='{self.title}', status='{self.status.value}')>"
    
    def to_dict(self):
        return {
            'id': str(self.id),
            'workflow_id': str(self.workflow_id) if self.workflow_id else None,
            'title': self.title,
            'description': self.description,
            'task_type': self.task_type.value,
            'status': self.status.value,
            'priority': self.priority.value,
            'assigned_to': self.assigned_to,
            'instructions': self.instructions,
            'created_at': self.created_at.isoformat() if self.created_at else None,
            'completed_at': self.completed_at.isoformat() if self.completed_at else None,
            'task_metadata': self.task_metadata
        }
