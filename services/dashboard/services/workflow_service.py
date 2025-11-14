from services.db_service import db_service
from models.workflow import Workflow, WorkflowStatus
from services.websocket_service import websocket_service
from sqlalchemy import desc
import logging
from datetime import datetime
from typing import Optional, Dict, List
import uuid

logger = logging.getLogger(__name__)

class WorkflowService:
    """Service for managing workflows and publishing real-time updates"""
    
    def create_workflow(
        self,
        name: str,
        workflow_type: str,
        created_by: str,
        metadata: Optional[Dict] = None
    ) -> Workflow:
        """
        Create a new workflow
        
        Args:
            name: Name of the workflow
            workflow_type: Type of workflow (deployment, dns_update, artifact_analysis)
            created_by: User who created the workflow
            metadata: Additional metadata for the workflow
        
        Returns:
            Created Workflow object
        """
        if not db_service.is_available:
            raise RuntimeError("Database service not available")
        
        with db_service.get_session() as session:
            workflow = Workflow(
                name=name,
                workflow_type=workflow_type,
                created_by=created_by,
                status=WorkflowStatus.pending,
                workflow_metadata=metadata or {}
            )
            session.add(workflow)
            session.flush()
            
            workflow_dict = workflow.to_dict()
            logger.info(f"Created workflow {workflow.id}: {name}")
            
            # Publish creation event
            self.publish_workflow_event(str(workflow.id), {
                'type': 'workflow_created',
                'workflow': workflow_dict,
                'timestamp': datetime.utcnow().isoformat()
            })
            
            return workflow
    
    def get_workflow(self, workflow_id: str) -> Optional[Workflow]:
        """Get a workflow by ID"""
        if not db_service.is_available:
            raise RuntimeError("Database service not available")
        
        with db_service.get_session() as session:
            workflow = session.query(Workflow).filter(
                Workflow.id == uuid.UUID(workflow_id)
            ).first()
            return workflow
    
    def get_workflow_status(self, workflow_id: str) -> Optional[Dict]:
        """Get workflow status as dictionary"""
        workflow = self.get_workflow(workflow_id)
        return workflow.to_dict() if workflow else None
    
    def update_workflow_status(
        self,
        workflow_id: str,
        status: WorkflowStatus,
        error_message: Optional[str] = None
    ) -> bool:
        """
        Update workflow status
        
        Args:
            workflow_id: UUID of the workflow
            status: New status
            error_message: Optional error message if status is failed
        
        Returns:
            True if updated successfully
        """
        if not db_service.is_available:
            raise RuntimeError("Database service not available")
        
        try:
            with db_service.get_session() as session:
                workflow = session.query(Workflow).filter(
                    Workflow.id == uuid.UUID(workflow_id)
                ).first()
                
                if not workflow:
                    logger.error(f"Workflow {workflow_id} not found")
                    return False
                
                old_status = workflow.status
                workflow.status = status
                
                if status == WorkflowStatus.completed:
                    workflow.completed_at = datetime.utcnow()
                
                if error_message:
                    workflow.error_message = error_message
                
                session.flush()
                
                logger.info(f"Updated workflow {workflow_id} status: {old_status.value} -> {status.value}")
                
                # Publish status change event
                self.publish_workflow_event(workflow_id, {
                    'type': 'workflow_status_changed',
                    'workflow_id': workflow_id,
                    'old_status': old_status.value,
                    'new_status': status.value,
                    'error_message': error_message,
                    'timestamp': datetime.utcnow().isoformat()
                })
                
                return True
        except Exception as e:
            logger.error(f"Failed to update workflow status: {e}")
            return False
    
    def update_workflow_progress(
        self,
        workflow_id: str,
        current_step: int,
        total_steps: int,
        message: str
    ) -> bool:
        """
        Update workflow progress
        
        Args:
            workflow_id: UUID of the workflow
            current_step: Current step number
            total_steps: Total number of steps
            message: Progress message
        
        Returns:
            True if updated successfully
        """
        if not db_service.is_available:
            raise RuntimeError("Database service not available")
        
        try:
            with db_service.get_session() as session:
                workflow = session.query(Workflow).filter(
                    Workflow.id == uuid.UUID(workflow_id)
                ).first()
                
                if not workflow:
                    logger.error(f"Workflow {workflow_id} not found")
                    return False
                
                workflow.current_step = current_step
                workflow.total_steps = total_steps
                
                if not workflow.workflow_metadata:
                    workflow.workflow_metadata = {}
                workflow.workflow_metadata['last_message'] = message
                
                session.flush()
                
                logger.debug(f"Updated workflow {workflow_id} progress: {current_step}/{total_steps} - {message}")
                
                return True
        except Exception as e:
            logger.error(f"Failed to update workflow progress: {e}")
            return False
    
    def cancel_workflow(self, workflow_id: str) -> bool:
        """Cancel a running workflow"""
        return self.update_workflow_status(workflow_id, WorkflowStatus.paused)
    
    def list_workflows(
        self,
        limit: int = 50,
        offset: int = 0,
        workflow_type: Optional[str] = None,
        status: Optional[WorkflowStatus] = None
    ) -> List[Dict]:
        """
        List workflows with optional filtering
        
        Args:
            limit: Maximum number of workflows to return
            offset: Offset for pagination
            workflow_type: Filter by workflow type
            status: Filter by status
        
        Returns:
            List of workflow dictionaries
        """
        if not db_service.is_available:
            raise RuntimeError("Database service not available")
        
        with db_service.get_session() as session:
            query = session.query(Workflow)
            
            if workflow_type:
                query = query.filter(Workflow.workflow_type == workflow_type)
            
            if status:
                query = query.filter(Workflow.status == status)
            
            query = query.order_by(desc(Workflow.started_at))
            query = query.limit(limit).offset(offset)
            
            workflows = query.all()
            return [w.to_dict() for w in workflows]
    
    def publish_workflow_event(self, workflow_id: str, event: Dict):
        """
        Publish a workflow event via WebSocket
        
        Args:
            workflow_id: UUID of the workflow
            event: Event data to publish
        """
        try:
            websocket_service.broadcast_to_workflow(workflow_id, event)
            logger.debug(f"Published workflow event: {event.get('type')} for {workflow_id}")
        except Exception as e:
            logger.error(f"Failed to publish workflow event: {e}")
    
    def publish_task_notification(self, notification: Dict):
        """Publish a task notification"""
        try:
            websocket_service.broadcast_to_tasks(notification)
            logger.debug(f"Published task notification: {notification.get('type')}")
        except Exception as e:
            logger.error(f"Failed to publish task notification: {e}")
    
    def publish_deployment_event(self, deployment_id: str, event: Dict):
        """Publish a deployment event"""
        try:
            websocket_service.broadcast_to_deployment(deployment_id, event)
            logger.debug(f"Published deployment event: {event.get('type')} for {deployment_id}")
        except Exception as e:
            logger.error(f"Failed to publish deployment event: {e}")
    
    def publish_system_event(self, event: Dict):
        """Publish a system event"""
        try:
            websocket_service.broadcast_to_system(event)
            logger.debug(f"Published system event: {event.get('type')}")
        except Exception as e:
            logger.error(f"Failed to publish system event: {e}")

workflow_service = WorkflowService()

__all__ = ['workflow_service', 'WorkflowService']
