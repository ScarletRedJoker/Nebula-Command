"""Jarvis Task Management System - Database Models

This module defines the JarvisTask model for managing tasks that Jarvis
creates for user clarification, approval, or action.
"""

from sqlalchemy import String, Text, DateTime, ForeignKey
from sqlalchemy.dialects.postgresql import UUID, JSONB
from sqlalchemy.orm import Mapped, mapped_column, relationship
from typing import Optional
import uuid
from datetime import datetime
from . import Base


class JarvisTask(Base):
    """Tasks that Jarvis creates for user clarification or action"""
    __tablename__ = 'jarvis_tasks'
    
    id: Mapped[uuid.UUID] = mapped_column(UUID(as_uuid=True), primary_key=True, default=uuid.uuid4)
    title: Mapped[str] = mapped_column(String(255), nullable=False)
    description: Mapped[str] = mapped_column(Text, nullable=False)
    task_type: Mapped[str] = mapped_column(String(50), nullable=False)  # 'clarification', 'approval', 'action', 'review'
    priority: Mapped[str] = mapped_column(String(20), default='medium')  # 'low', 'medium', 'high', 'critical'
    status: Mapped[str] = mapped_column(String(50), default='pending')  # 'pending', 'in_progress', 'blocked_waiting_user', 'completed', 'cancelled'
    
    # Context for the task
    context: Mapped[Optional[dict]] = mapped_column(JSONB, nullable=True)  # Additional context, files, code snippets
    blocking_task_id: Mapped[Optional[uuid.UUID]] = mapped_column(UUID(as_uuid=True), ForeignKey('jarvis_tasks.id'), nullable=True)  # Task this is blocking
    
    # Code review specific
    code_changes: Mapped[Optional[dict]] = mapped_column(JSONB, nullable=True)  # {"file": "path", "old": "...", "new": "..."}
    approval_status: Mapped[Optional[str]] = mapped_column(String(50), nullable=True)  # 'pending', 'approved', 'rejected', 'changes_requested'
    
    # User response
    user_response: Mapped[Optional[str]] = mapped_column(Text, nullable=True)
    user_response_data: Mapped[Optional[dict]] = mapped_column(JSONB, nullable=True)
    
    # Timestamps
    created_at: Mapped[datetime] = mapped_column(DateTime(timezone=True), default=datetime.utcnow)
    updated_at: Mapped[Optional[datetime]] = mapped_column(DateTime(timezone=True), onupdate=datetime.utcnow)
    completed_at: Mapped[Optional[datetime]] = mapped_column(DateTime(timezone=True), nullable=True)
    
    # Relationships
    created_by: Mapped[str] = mapped_column(String(100), default='jarvis')
    assigned_to: Mapped[str] = mapped_column(String(100), default='user')
    
    # Self-referential relationship for blocking tasks
    blocking_task: Mapped[Optional["JarvisTask"]] = relationship(
        "JarvisTask",
        remote_side=[id],
        backref="blocked_by_tasks"
    )
    
    def __repr__(self):
        return f"<JarvisTask(id={self.id}, title='{self.title}', status='{self.status}', type='{self.task_type}')>"
    
    def to_dict(self):
        """Convert to dictionary for JSON serialization"""
        return {
            'id': str(self.id),
            'title': self.title,
            'description': self.description,
            'task_type': self.task_type,
            'priority': self.priority,
            'status': self.status,
            'context': self.context,
            'blocking_task_id': str(self.blocking_task_id) if self.blocking_task_id else None,
            'code_changes': self.code_changes,
            'approval_status': self.approval_status,
            'user_response': self.user_response,
            'user_response_data': self.user_response_data,
            'created_at': self.created_at.isoformat() if self.created_at else None,
            'updated_at': self.updated_at.isoformat() if self.updated_at else None,
            'completed_at': self.completed_at.isoformat() if self.completed_at else None,
            'created_by': self.created_by,
            'assigned_to': self.assigned_to
        }
