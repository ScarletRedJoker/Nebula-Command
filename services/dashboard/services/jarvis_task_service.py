"""Jarvis Task Management Service

This service manages tasks that Jarvis creates for user clarification,
approval, or action. It provides methods for CRUD operations and
specialized task creation.
"""

import logging
from typing import List, Optional, Dict, Any
from datetime import datetime
import uuid

from models import get_session, JarvisTask
from sqlalchemy import and_, or_

logger = logging.getLogger(__name__)


class JarvisTaskService:
    """Service for managing Jarvis tasks"""
    
    def create_task(
        self,
        title: str,
        description: str,
        task_type: str,
        context: Optional[Dict] = None,
        priority: str = 'medium',
        blocking_task_id: Optional[str] = None
    ) -> Optional[JarvisTask]:
        """Create a new Jarvis task
        
        Args:
            title: Task title
            description: Detailed description
            task_type: Type of task ('clarification', 'approval', 'action', 'review')
            context: Additional context data
            priority: Priority level ('low', 'medium', 'high', 'critical')
            blocking_task_id: ID of task this is blocking
            
        Returns:
            Created JarvisTask or None if failed
        """
        try:
            session = get_session()
            try:
                task = JarvisTask(
                    title=title,
                    description=description,
                    task_type=task_type,
                    priority=priority,
                    status='pending',
                    context=context or {},
                    blocking_task_id=uuid.UUID(blocking_task_id) if blocking_task_id else None,
                    created_at=datetime.utcnow()
                )
                
                session.add(task)
                session.commit()
                session.refresh(task)
                
                logger.info(f"Created Jarvis task: {task.id} - {title} ({task_type})")
                return task
                
            finally:
                session.close()
                
        except Exception as e:
            logger.error(f"Failed to create Jarvis task: {e}", exc_info=True)
            return None
    
    def create_code_review_task(
        self,
        file_path: str,
        old_code: str,
        new_code: str,
        reason: str,
        priority: str = 'high'
    ) -> Optional[JarvisTask]:
        """Create a code review task
        
        Args:
            file_path: Path to file being modified
            old_code: Original code
            new_code: Proposed new code
            reason: Reason for the change
            priority: Priority level
            
        Returns:
            Created code review task or None if failed
        """
        context = {
            'file_path': file_path,
            'reason': reason,
            'code_change_type': 'modification'
        }
        
        code_changes = {
            'file': file_path,
            'old': old_code,
            'new': new_code,
            'reason': reason
        }
        
        try:
            session = get_session()
            try:
                task = JarvisTask(
                    title=f"Code Review: {file_path}",
                    description=f"Review proposed changes to {file_path}\n\nReason: {reason}",
                    task_type='review',
                    priority=priority,
                    status='pending',
                    context=context,
                    code_changes=code_changes,
                    approval_status='pending',
                    created_at=datetime.utcnow()
                )
                
                session.add(task)
                session.commit()
                session.refresh(task)
                
                logger.info(f"Created code review task: {task.id} for {file_path}")
                return task
                
            finally:
                session.close()
                
        except Exception as e:
            logger.error(f"Failed to create code review task: {e}", exc_info=True)
            return None
    
    def get_tasks(
        self,
        status: Optional[str] = None,
        task_type: Optional[str] = None,
        priority: Optional[str] = None,
        limit: int = 100
    ) -> List[JarvisTask]:
        """Get tasks with optional filtering
        
        Args:
            status: Filter by status
            task_type: Filter by task type
            priority: Filter by priority
            limit: Maximum number of tasks to return
            
        Returns:
            List of matching tasks
        """
        try:
            session = get_session()
            try:
                query = session.query(JarvisTask)
                
                # Apply filters
                if status:
                    query = query.filter(JarvisTask.status == status)
                if task_type:
                    query = query.filter(JarvisTask.task_type == task_type)
                if priority:
                    query = query.filter(JarvisTask.priority == priority)
                
                # Order by created_at descending (newest first)
                query = query.order_by(JarvisTask.created_at.desc())
                
                # Apply limit
                query = query.limit(limit)
                
                tasks = query.all()
                logger.info(f"Retrieved {len(tasks)} Jarvis tasks")
                return tasks
                
            finally:
                session.close()
                
        except Exception as e:
            logger.error(f"Failed to get Jarvis tasks: {e}", exc_info=True)
            return []
    
    def get_pending_tasks(self) -> List[JarvisTask]:
        """Get all pending tasks waiting for user action
        
        Returns:
            List of pending tasks
        """
        return self.get_tasks(status='pending')
    
    def get_blocked_tasks(self) -> List[JarvisTask]:
        """Get all tasks blocked waiting for user input
        
        Returns:
            List of blocked tasks
        """
        return self.get_tasks(status='blocked_waiting_user')
    
    def get_active_tasks(self) -> List[JarvisTask]:
        """Get all tasks currently in progress
        
        Returns:
            List of in-progress tasks
        """
        return self.get_tasks(status='in_progress')
    
    def get_task_by_id(self, task_id: str) -> Optional[JarvisTask]:
        """Get task by ID
        
        Args:
            task_id: Task ID
            
        Returns:
            JarvisTask or None if not found
        """
        try:
            session = get_session()
            try:
                task = session.query(JarvisTask).filter(
                    JarvisTask.id == uuid.UUID(task_id)
                ).first()
                
                if task:
                    logger.info(f"Retrieved task: {task_id}")
                else:
                    logger.warning(f"Task not found: {task_id}")
                
                return task
                
            finally:
                session.close()
                
        except Exception as e:
            logger.error(f"Failed to get task {task_id}: {e}", exc_info=True)
            return None
    
    def update_task_status(
        self,
        task_id: str,
        status: str,
        update_data: Optional[Dict] = None
    ) -> bool:
        """Update task status
        
        Args:
            task_id: Task ID
            status: New status
            update_data: Additional data to update
            
        Returns:
            True if successful
        """
        try:
            session = get_session()
            try:
                task = session.query(JarvisTask).filter(
                    JarvisTask.id == uuid.UUID(task_id)
                ).first()
                
                if not task:
                    logger.warning(f"Task not found: {task_id}")
                    return False
                
                task.status = status
                task.updated_at = datetime.utcnow()
                
                # If completing, set completion timestamp
                if status == 'completed':
                    task.completed_at = datetime.utcnow()
                
                # Update additional fields if provided
                if update_data:
                    for key, value in update_data.items():
                        if hasattr(task, key):
                            setattr(task, key, value)
                
                session.commit()
                logger.info(f"Updated task {task_id} status to {status}")
                return True
                
            finally:
                session.close()
                
        except Exception as e:
            logger.error(f"Failed to update task status: {e}", exc_info=True)
            return False
    
    def complete_task(
        self,
        task_id: str,
        user_response: str,
        user_response_data: Optional[Dict] = None
    ) -> bool:
        """Complete a task with user response
        
        Args:
            task_id: Task ID
            user_response: User's response text
            user_response_data: Structured response data
            
        Returns:
            True if successful
        """
        update_data = {
            'user_response': user_response,
            'user_response_data': user_response_data or {}
        }
        
        return self.update_task_status(task_id, 'completed', update_data)
    
    def approve_task(self, task_id: str, comments: Optional[str] = None) -> dict:
        """Approve a code review task and apply the code safely
        
        Args:
            task_id: Task ID
            comments: Optional approval comments
            
        Returns:
            Dictionary with success status, message, and details
        """
        task = self.get_task_by_id(task_id)
        
        if not task:
            raise ValueError(f"Task {task_id} not found")
        
        if task.task_type != 'review':
            raise ValueError(f"Task {task_id} is not a code review task")
        
        # Apply the approved code
        if task.code_changes:
            from jarvis.code_workspace import JarvisCodeWorkspace
            workspace = JarvisCodeWorkspace()
            
            try:
                session = get_session()
                try:
                    file_path = task.code_changes.get('file')
                    new_code = task.code_changes.get('new')
                    
                    # Use safe write method
                    result = workspace.write_file_safe(file_path, new_code, create_backup=True)
                    
                    if not result['success']:
                        raise Exception(result['error'])
                    
                    # Mark task as approved
                    task.approval_status = 'approved'
                    task.user_response = comments
                    task.status = 'completed'
                    task.completed_at = datetime.utcnow()
                    
                    # Add backup info to context
                    task.context['backup_created'] = result.get('backup')
                    task.context['file_modified'] = file_path
                    
                    session.commit()
                    
                    return {
                        'success': True,
                        'message': 'Code approved and applied successfully',
                        'file_modified': file_path,
                        'backup_path': result.get('backup')
                    }
                
                finally:
                    session.close()
            
            except Exception as e:
                session = get_session()
                try:
                    logger.error(f"Failed to apply approved code: {str(e)}")
                    
                    # Mark task as rejected due to error
                    task.approval_status = 'error'
                    task.user_response = f"Error applying code: {str(e)}"
                    session.commit()
                    
                    return {
                        'success': False,
                        'error': f"Failed to apply code: {str(e)}"
                    }
                finally:
                    session.close()
        
        return {'success': False, 'error': 'No code changes to apply'}
    
    def reject_task(self, task_id: str, reason: str) -> bool:
        """Reject a task
        
        Args:
            task_id: Task ID
            reason: Rejection reason
            
        Returns:
            True if successful
        """
        update_data = {
            'approval_status': 'rejected',
            'user_response': reason
        }
        
        return self.update_task_status(task_id, 'completed', update_data)
    
    def request_changes(self, task_id: str, changes_needed: str) -> bool:
        """Request changes to a task
        
        Args:
            task_id: Task ID
            changes_needed: Description of needed changes
            
        Returns:
            True if successful
        """
        update_data = {
            'approval_status': 'changes_requested',
            'user_response': changes_needed
        }
        
        return self.update_task_status(task_id, 'in_progress', update_data)
    
    def count_pending_tasks(self) -> int:
        """Count pending tasks
        
        Returns:
            Number of pending tasks
        """
        return len(self.get_pending_tasks())
    
    def count_blocked_tasks(self) -> int:
        """Count blocked tasks
        
        Returns:
            Number of blocked tasks
        """
        return len(self.get_blocked_tasks())
    
    def get_current_task(self) -> Optional[Dict[str, Any]]:
        """Get the current task Jarvis is working on
        
        Returns:
            Task dict or None
        """
        active_tasks = self.get_active_tasks()
        if active_tasks:
            return active_tasks[0].to_dict()
        return None
    
    def get_statistics(self) -> Dict[str, Any]:
        """Get task statistics
        
        Returns:
            Dictionary of statistics
        """
        try:
            session = get_session()
            try:
                total = session.query(JarvisTask).count()
                pending = session.query(JarvisTask).filter(JarvisTask.status == 'pending').count()
                in_progress = session.query(JarvisTask).filter(JarvisTask.status == 'in_progress').count()
                completed = session.query(JarvisTask).filter(JarvisTask.status == 'completed').count()
                blocked = session.query(JarvisTask).filter(JarvisTask.status == 'blocked_waiting_user').count()
                
                # Count by type
                clarification = session.query(JarvisTask).filter(JarvisTask.task_type == 'clarification').count()
                approval = session.query(JarvisTask).filter(JarvisTask.task_type == 'approval').count()
                review = session.query(JarvisTask).filter(JarvisTask.task_type == 'review').count()
                action = session.query(JarvisTask).filter(JarvisTask.task_type == 'action').count()
                
                return {
                    'total': total,
                    'by_status': {
                        'pending': pending,
                        'in_progress': in_progress,
                        'completed': completed,
                        'blocked': blocked
                    },
                    'by_type': {
                        'clarification': clarification,
                        'approval': approval,
                        'review': review,
                        'action': action
                    }
                }
                
            finally:
                session.close()
                
        except Exception as e:
            logger.error(f"Failed to get statistics: {e}", exc_info=True)
            return {}


# Global instance
jarvis_task_service = JarvisTaskService()
