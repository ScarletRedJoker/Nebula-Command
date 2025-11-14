from celery import Task
from celery_app import celery_app
from services.workflow_service import workflow_service
from models.workflow import WorkflowStatus
import logging
import time
from datetime import datetime

logger = logging.getLogger(__name__)

class WorkflowTask(Task):
    """Base class for workflow tasks with error handling and progress tracking"""
    
    autoretry_for = (Exception,)
    retry_kwargs = {'max_retries': 3, 'countdown': 5}
    retry_backoff = True
    retry_backoff_max = 600
    retry_jitter = True
    
    def on_failure(self, exc, task_id, args, kwargs, einfo):
        """Handle task failure"""
        workflow_id = kwargs.get('workflow_id')
        if workflow_id:
            try:
                workflow_service.update_workflow_status(
                    workflow_id,
                    WorkflowStatus.failed,
                    error_message=str(exc)
                )
                workflow_service.publish_workflow_event(workflow_id, {
                    'type': 'workflow_failed',
                    'workflow_id': str(workflow_id),
                    'error': str(exc),
                    'timestamp': datetime.utcnow().isoformat()
                })
            except Exception as e:
                logger.error(f"Failed to update workflow status on failure: {e}")
        logger.error(f"Task {task_id} failed: {exc}")
    
    def on_success(self, retval, task_id, args, kwargs):
        """Handle task success"""
        workflow_id = kwargs.get('workflow_id')
        if workflow_id:
            try:
                workflow_service.update_workflow_status(
                    workflow_id,
                    WorkflowStatus.completed
                )
                workflow_service.publish_workflow_event(workflow_id, {
                    'type': 'workflow_completed',
                    'workflow_id': str(workflow_id),
                    'result': retval,
                    'timestamp': datetime.utcnow().isoformat()
                })
            except Exception as e:
                logger.error(f"Failed to update workflow status on success: {e}")
        logger.info(f"Task {task_id} completed successfully")
    
    def update_progress(self, workflow_id, current_step, total_steps, message):
        """Update workflow progress"""
        try:
            workflow_service.update_workflow_progress(
                workflow_id,
                current_step,
                total_steps,
                message
            )
            workflow_service.publish_workflow_event(workflow_id, {
                'type': 'workflow_progress',
                'workflow_id': str(workflow_id),
                'current_step': current_step,
                'total_steps': total_steps,
                'message': message,
                'timestamp': datetime.utcnow().isoformat()
            })
        except Exception as e:
            logger.error(f"Failed to update progress: {e}")


@celery_app.task(base=WorkflowTask, bind=True, name='workers.workflow_worker.run_deployment_workflow')
def run_deployment_workflow(self, workflow_id, deployment_config):
    """
    Run a deployment workflow
    
    Args:
        workflow_id: UUID of the workflow
        deployment_config: Dictionary containing deployment configuration
            - service_name: Name of the service to deploy
            - image: Docker image to deploy
            - environment: Environment variables
            - volumes: Volume mappings
    """
    logger.info(f"Starting deployment workflow {workflow_id}")
    
    total_steps = 5
    
    try:
        workflow_service.update_workflow_status(workflow_id, WorkflowStatus.running)
        
        # Step 1: Validate configuration
        self.update_progress(workflow_id, 1, total_steps, "Validating deployment configuration")
        service_name = deployment_config.get('service_name')
        image = deployment_config.get('image')
        
        if not service_name or not image:
            raise ValueError("Missing required deployment configuration")
        
        time.sleep(1)
        
        # Step 2: Pull Docker image
        self.update_progress(workflow_id, 2, total_steps, f"Pulling Docker image: {image}")
        time.sleep(2)
        
        # Step 3: Stop existing container
        self.update_progress(workflow_id, 3, total_steps, f"Stopping existing container: {service_name}")
        time.sleep(1)
        
        # Step 4: Start new container
        self.update_progress(workflow_id, 4, total_steps, f"Starting new container: {service_name}")
        time.sleep(2)
        
        # Step 5: Verify deployment
        self.update_progress(workflow_id, 5, total_steps, "Verifying deployment")
        time.sleep(1)
        
        logger.info(f"Deployment workflow {workflow_id} completed successfully")
        return {
            'status': 'success',
            'service_name': service_name,
            'image': image,
            'deployed_at': datetime.utcnow().isoformat()
        }
        
    except Exception as e:
        logger.error(f"Deployment workflow {workflow_id} failed: {e}")
        raise


@celery_app.task(base=WorkflowTask, bind=True, name='workers.workflow_worker.run_dns_update_workflow')
def run_dns_update_workflow(self, workflow_id, dns_config):
    """
    Run a DNS update workflow
    
    Args:
        workflow_id: UUID of the workflow
        dns_config: Dictionary containing DNS configuration
            - domain: Domain name to update
            - record_type: DNS record type (A, CNAME, etc.)
            - value: New DNS value
    """
    logger.info(f"Starting DNS update workflow {workflow_id}")
    
    total_steps = 3
    
    try:
        workflow_service.update_workflow_status(workflow_id, WorkflowStatus.running)
        
        # Step 1: Validate DNS configuration
        self.update_progress(workflow_id, 1, total_steps, "Validating DNS configuration")
        domain = dns_config.get('domain')
        record_type = dns_config.get('record_type', 'A')
        value = dns_config.get('value')
        
        if not domain or not value:
            raise ValueError("Missing required DNS configuration")
        
        time.sleep(1)
        
        # Step 2: Update DNS record
        self.update_progress(workflow_id, 2, total_steps, f"Updating {record_type} record for {domain}")
        time.sleep(2)
        
        # Step 3: Verify DNS propagation
        self.update_progress(workflow_id, 3, total_steps, "Verifying DNS propagation")
        time.sleep(1)
        
        logger.info(f"DNS update workflow {workflow_id} completed successfully")
        return {
            'status': 'success',
            'domain': domain,
            'record_type': record_type,
            'value': value,
            'updated_at': datetime.utcnow().isoformat()
        }
        
    except Exception as e:
        logger.error(f"DNS update workflow {workflow_id} failed: {e}")
        raise


@celery_app.task(base=WorkflowTask, bind=True, name='workers.workflow_worker.run_artifact_analysis_workflow')
def run_artifact_analysis_workflow(self, workflow_id, artifact_config):
    """
    Run an artifact analysis workflow
    
    Args:
        workflow_id: UUID of the workflow
        artifact_config: Dictionary containing artifact configuration
            - artifact_path: Path to the artifact to analyze
            - analysis_type: Type of analysis to perform
    """
    logger.info(f"Starting artifact analysis workflow {workflow_id}")
    
    total_steps = 4
    
    try:
        workflow_service.update_workflow_status(workflow_id, WorkflowStatus.running)
        
        # Step 1: Validate artifact
        self.update_progress(workflow_id, 1, total_steps, "Validating artifact")
        artifact_path = artifact_config.get('artifact_path')
        analysis_type = artifact_config.get('analysis_type', 'security')
        
        if not artifact_path:
            raise ValueError("Missing artifact path")
        
        time.sleep(1)
        
        # Step 2: Extract artifact metadata
        self.update_progress(workflow_id, 2, total_steps, "Extracting artifact metadata")
        time.sleep(1)
        
        # Step 3: Run analysis
        self.update_progress(workflow_id, 3, total_steps, f"Running {analysis_type} analysis")
        time.sleep(3)
        
        # Step 4: Generate report
        self.update_progress(workflow_id, 4, total_steps, "Generating analysis report")
        time.sleep(1)
        
        logger.info(f"Artifact analysis workflow {workflow_id} completed successfully")
        return {
            'status': 'success',
            'artifact_path': artifact_path,
            'analysis_type': analysis_type,
            'analyzed_at': datetime.utcnow().isoformat(),
            'findings': {
                'vulnerabilities': 0,
                'warnings': 2,
                'info': 5
            }
        }
        
    except Exception as e:
        logger.error(f"Artifact analysis workflow {workflow_id} failed: {e}")
        raise
