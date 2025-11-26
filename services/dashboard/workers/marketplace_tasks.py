"""
Marketplace Celery Tasks
Background tasks for marketplace app installation and management with queue support
"""

import logging
import subprocess
from pathlib import Path
from datetime import datetime
from celery_app import celery_app
from services.db_service import db_service

logger = logging.getLogger(__name__)


def broadcast_deployment_progress(deployment_id: str, status: str, progress: float, 
                                   step: str, message: str = None):
    """Broadcast deployment progress via WebSocket"""
    try:
        from services.websocket_service import websocket_service
        websocket_service.broadcast_to_deployment(deployment_id, {
            'type': 'deployment_progress',
            'deployment_id': deployment_id,
            'status': status,
            'progress': progress,
            'current_step': step,
            'message': message,
            'timestamp': datetime.utcnow().isoformat()
        })
    except Exception as e:
        logger.warning(f"Failed to broadcast deployment progress: {e}")


def log_deployment_step(deployment_id: str, level: str, message: str, step: str = None):
    """Log a deployment step to the database"""
    try:
        if not db_service.is_available:
            return
        
        from models.deployment_queue import DeploymentLog
        
        with db_service.get_session() as session:
            log_entry = DeploymentLog(
                deployment_id=deployment_id,
                level=level,
                message=message,
                step=step,
                timestamp=datetime.utcnow()
            )
            session.add(log_entry)
    except Exception as e:
        logger.error(f"Failed to log deployment step: {e}")


def update_deployment_status(deployment_id: str, status: str, progress: float = None,
                              step: str = None, error: str = None, container_id: str = None):
    """Update deployment status in the queue"""
    try:
        if not db_service.is_available:
            return
        
        from models.deployment_queue import DeploymentQueue, DeploymentStatus
        from sqlalchemy import select
        
        with db_service.get_session() as session:
            deployment = session.execute(
                select(DeploymentQueue).where(DeploymentQueue.deployment_id == deployment_id)
            ).scalar_one_or_none()
            
            if deployment:
                try:
                    deployment.status = DeploymentStatus(status)
                except ValueError:
                    deployment.status = DeploymentStatus.FAILED
                
                if progress is not None:
                    deployment.progress = progress
                if step:
                    deployment.current_step = step
                if error:
                    deployment.error_message = error
                if container_id:
                    deployment.container_id = container_id
                
                if status == 'completed':
                    deployment.completed_at = datetime.utcnow()
                    deployment.rollback_available = True
                elif status == 'failed':
                    deployment.completed_at = datetime.utcnow()
                elif status in ['pulling_image', 'creating_container']:
                    if not deployment.started_at:
                        deployment.started_at = datetime.utcnow()
                        
    except Exception as e:
        logger.error(f"Failed to update deployment status: {e}")


@celery_app.task(bind=True, name='marketplace.install_app')
def install_marketplace_app(self, deployment_id: str):
    """
    Background task to install marketplace app from template with progress tracking
    
    Args:
        deployment_id: UUID of the deployment record
    
    Returns:
        dict: Result with success status and details
    """
    steps = [
        ('queued', 'Queued for installation', 5),
        ('pulling_image', 'Pulling Docker images', 25),
        ('creating_container', 'Creating containers', 50),
        ('configuring', 'Configuring services', 75),
        ('starting', 'Starting services', 90),
        ('completed', 'Installation complete', 100)
    ]
    
    try:
        logger.info(f"Starting marketplace installation for deployment {deployment_id}")
        broadcast_deployment_progress(deployment_id, 'queued', 5, 'Queued', 'Installation started')
        update_deployment_status(deployment_id, 'queued', 5, 'Queued for installation')
        log_deployment_step(deployment_id, 'info', 'Installation task started', 'queued')
        
        if not db_service.is_available:
            error_msg = "Database service not available"
            logger.error(error_msg)
            broadcast_deployment_progress(deployment_id, 'failed', 0, 'Error', error_msg)
            return {'success': False, 'error': error_msg}
        
        from models.deployment_queue import DeploymentQueue, DeploymentStatus
        from sqlalchemy import select
        
        with db_service.get_session() as session:
            deployment = session.execute(
                select(DeploymentQueue).where(DeploymentQueue.deployment_id == deployment_id)
            ).scalar_one_or_none()
            
            if not deployment:
                from models.marketplace import MarketplaceDeployment
                deployment = session.get(MarketplaceDeployment, deployment_id)
            
            if not deployment:
                error_msg = f"Deployment {deployment_id} not found"
                logger.error(error_msg)
                broadcast_deployment_progress(deployment_id, 'failed', 0, 'Error', error_msg)
                return {'success': False, 'error': error_msg}
            
            compose_path = Path(deployment.compose_path)
            deployment_dir = compose_path.parent
            app_name = getattr(deployment, 'app_name', None) or deployment_id
            
            if not compose_path.exists():
                error_msg = f"Docker compose file not found: {compose_path}"
                logger.error(error_msg)
                update_deployment_status(deployment_id, 'failed', 0, 'Error', error_msg)
                broadcast_deployment_progress(deployment_id, 'failed', 0, 'Error', error_msg)
                log_deployment_step(deployment_id, 'error', error_msg, 'validation')
                return {'success': False, 'error': error_msg}
            
            broadcast_deployment_progress(deployment_id, 'pulling_image', 25, 
                                          'Pulling Images', f'Pulling Docker images for {app_name}')
            update_deployment_status(deployment_id, 'pulling_image', 25, 'Pulling Docker images')
            log_deployment_step(deployment_id, 'info', 'Pulling Docker images', 'pulling_image')
            
            pull_result = subprocess.run(
                ['docker-compose', 'pull'],
                cwd=deployment_dir,
                capture_output=True,
                text=True,
                timeout=600
            )
            
            if pull_result.returncode != 0:
                logger.warning(f"Docker pull had issues: {pull_result.stderr}")
                log_deployment_step(deployment_id, 'warning', f'Pull warning: {pull_result.stderr}', 'pulling_image')
            
            broadcast_deployment_progress(deployment_id, 'creating_container', 50,
                                          'Creating Containers', 'Creating and configuring containers')
            update_deployment_status(deployment_id, 'creating_container', 50, 'Creating containers')
            log_deployment_step(deployment_id, 'info', 'Creating containers', 'creating_container')
            
            create_result = subprocess.run(
                ['docker-compose', 'create'],
                cwd=deployment_dir,
                capture_output=True,
                text=True,
                timeout=300
            )
            
            broadcast_deployment_progress(deployment_id, 'configuring', 75,
                                          'Configuring', 'Applying configuration')
            update_deployment_status(deployment_id, 'configuring', 75, 'Configuring services')
            log_deployment_step(deployment_id, 'info', 'Configuring services', 'configuring')
            
            broadcast_deployment_progress(deployment_id, 'starting', 90,
                                          'Starting', 'Starting services')
            update_deployment_status(deployment_id, 'starting', 90, 'Starting services')
            log_deployment_step(deployment_id, 'info', 'Starting services', 'starting')
            
            up_result = subprocess.run(
                ['docker-compose', 'up', '-d'],
                cwd=deployment_dir,
                capture_output=True,
                text=True,
                timeout=300
            )
            
            if up_result.returncode == 0:
                logger.info(f"Successfully installed deployment {deployment_id}")
                
                ps_result = subprocess.run(
                    ['docker-compose', 'ps', '-q'],
                    cwd=deployment_dir,
                    capture_output=True,
                    text=True
                )
                container_ids = ps_result.stdout.strip().split('\n') if ps_result.stdout else []
                container_id = container_ids[0][:12] if container_ids else None
                
                update_deployment_status(deployment_id, 'completed', 100, 'Installation complete',
                                         container_id=container_id)
                broadcast_deployment_progress(deployment_id, 'completed', 100,
                                              'Completed', f'{app_name} installed successfully')
                log_deployment_step(deployment_id, 'info', 'Installation completed successfully', 'completed')
                
                try:
                    if hasattr(deployment, 'status'):
                        deployment.status = 'running'
                        deployment.error_message = None
                except Exception:
                    pass
                
                return {
                    'success': True,
                    'deployment_id': deployment_id,
                    'container_id': container_id,
                    'message': 'Installation completed successfully'
                }
            else:
                error_msg = f"docker-compose up failed: {up_result.stderr}"
                logger.error(error_msg)
                update_deployment_status(deployment_id, 'failed', 0, 'Installation failed', error_msg)
                broadcast_deployment_progress(deployment_id, 'failed', 0, 'Failed', error_msg[:200])
                log_deployment_step(deployment_id, 'error', error_msg, 'starting')
                
                if hasattr(deployment, 'status'):
                    deployment.status = 'error'
                    deployment.error_message = error_msg
                
                return {'success': False, 'error': error_msg}
    
    except subprocess.TimeoutExpired as e:
        error_msg = f"Installation timed out: {str(e)}"
        logger.error(error_msg)
        update_deployment_status(deployment_id, 'failed', 0, 'Timeout', error_msg)
        broadcast_deployment_progress(deployment_id, 'failed', 0, 'Timeout', error_msg)
        log_deployment_step(deployment_id, 'error', error_msg, 'timeout')
        return {'success': False, 'error': error_msg}
    
    except Exception as e:
        error_msg = f"Error installing marketplace app: {str(e)}"
        logger.error(error_msg, exc_info=True)
        
        update_deployment_status(deployment_id, 'failed', 0, 'Error', error_msg)
        broadcast_deployment_progress(deployment_id, 'failed', 0, 'Error', str(e)[:200])
        log_deployment_step(deployment_id, 'error', error_msg, 'exception')
        
        try:
            if db_service.is_available:
                from models.marketplace import MarketplaceDeployment
                with db_service.get_session() as session:
                    deployment = session.get(MarketplaceDeployment, deployment_id)
                    if deployment:
                        deployment.status = 'error'
                        deployment.error_message = error_msg
        except Exception as db_error:
            logger.error(f"Failed to update deployment status: {db_error}")
        
        return {'success': False, 'error': error_msg}


@celery_app.task(bind=True, name='marketplace.uninstall_app')
def uninstall_marketplace_app(self, deployment_id: str, remove_volumes: bool = False):
    """
    Background task to uninstall marketplace app with rollback snapshot creation
    
    Args:
        deployment_id: UUID of the deployment record
        remove_volumes: Whether to remove Docker volumes
    
    Returns:
        dict: Result with success status and details
    """
    try:
        logger.info(f"Starting marketplace uninstall for deployment {deployment_id}")
        broadcast_deployment_progress(deployment_id, 'stopping', 20, 'Stopping', 'Stopping services')
        log_deployment_step(deployment_id, 'info', 'Uninstallation started', 'stopping')
        
        if not db_service.is_available:
            error_msg = "Database service not available"
            logger.error(error_msg)
            return {'success': False, 'error': error_msg}
        
        from models.deployment_queue import DeploymentQueue
        from models.marketplace import MarketplaceDeployment
        from sqlalchemy import select
        import shutil
        import json
        
        with db_service.get_session() as session:
            deployment = session.execute(
                select(DeploymentQueue).where(DeploymentQueue.deployment_id == deployment_id)
            ).scalar_one_or_none()
            
            if not deployment:
                deployment = session.get(MarketplaceDeployment, deployment_id)
            
            if not deployment:
                error_msg = f"Deployment {deployment_id} not found"
                logger.error(error_msg)
                return {'success': False, 'error': error_msg}
            
            compose_path = Path(deployment.compose_path)
            deployment_dir = compose_path.parent
            
            rollback_snapshot = None
            if compose_path.exists():
                try:
                    rollback_snapshot = {
                        'compose_content': compose_path.read_text(),
                        'deployment_dir': str(deployment_dir),
                        'variables': getattr(deployment, 'variables', None),
                        'created_at': datetime.utcnow().isoformat()
                    }
                    
                    ps_result = subprocess.run(
                        ['docker-compose', 'ps', '--format', 'json'],
                        cwd=deployment_dir,
                        capture_output=True,
                        text=True
                    )
                    if ps_result.returncode == 0:
                        rollback_snapshot['containers'] = ps_result.stdout
                        
                except Exception as e:
                    logger.warning(f"Failed to create rollback snapshot: {e}")
            
            if hasattr(deployment, 'rollback_snapshot'):
                deployment.rollback_snapshot = rollback_snapshot
            
            if compose_path.exists():
                broadcast_deployment_progress(deployment_id, 'stopping', 40, 
                                              'Stopping', 'Running docker-compose down')
                logger.info(f"Running docker-compose down for {deployment_id}")
                log_deployment_step(deployment_id, 'info', 'Running docker-compose down', 'stopping')
                
                cmd = ['docker-compose', 'down']
                if remove_volumes:
                    cmd.append('-v')
                
                result = subprocess.run(
                    cmd,
                    cwd=deployment_dir,
                    capture_output=True,
                    text=True,
                    timeout=120
                )
                
                if result.returncode != 0:
                    logger.warning(f"docker-compose down returned non-zero: {result.stderr}")
                    log_deployment_step(deployment_id, 'warning', f'Warning: {result.stderr}', 'stopping')
            
            broadcast_deployment_progress(deployment_id, 'removing', 70,
                                          'Removing', 'Removing deployment files')
            
            if deployment_dir.exists():
                logger.info(f"Removing deployment directory: {deployment_dir}")
                log_deployment_step(deployment_id, 'info', f'Removing directory: {deployment_dir}', 'removing')
                shutil.rmtree(deployment_dir)
            
            session.delete(deployment)
            
            broadcast_deployment_progress(deployment_id, 'completed', 100,
                                          'Completed', 'Uninstallation complete')
            log_deployment_step(deployment_id, 'info', 'Uninstallation completed', 'completed')
            
            logger.info(f"Successfully uninstalled deployment {deployment_id}")
            return {
                'success': True,
                'deployment_id': deployment_id,
                'rollback_available': rollback_snapshot is not None,
                'message': 'Uninstallation completed successfully'
            }
    
    except subprocess.TimeoutExpired as e:
        error_msg = f"Uninstallation timed out: {str(e)}"
        logger.error(error_msg)
        return {'success': False, 'error': error_msg}
    
    except Exception as e:
        error_msg = f"Error uninstalling marketplace app: {str(e)}"
        logger.error(error_msg, exc_info=True)
        log_deployment_step(deployment_id, 'error', error_msg, 'exception')
        return {'success': False, 'error': error_msg}


@celery_app.task(bind=True, name='marketplace.rollback_deployment')
def rollback_deployment(self, deployment_id: str, snapshot_data: dict = None):
    """
    Rollback a deployment to its previous state
    
    Args:
        deployment_id: UUID of the deployment record
        snapshot_data: Optional rollback snapshot data
    
    Returns:
        dict: Result with success status and details
    """
    try:
        logger.info(f"Starting rollback for deployment {deployment_id}")
        broadcast_deployment_progress(deployment_id, 'rolling_back', 10, 
                                      'Rolling Back', 'Starting rollback process')
        
        if not db_service.is_available:
            return {'success': False, 'error': 'Database service not available'}
        
        from models.deployment_queue import DeploymentQueue, DeploymentStatus
        from sqlalchemy import select
        
        with db_service.get_session() as session:
            deployment = session.execute(
                select(DeploymentQueue).where(DeploymentQueue.deployment_id == deployment_id)
            ).scalar_one_or_none()
            
            if not deployment:
                return {'success': False, 'error': f'Deployment {deployment_id} not found'}
            
            snapshot = snapshot_data or deployment.rollback_snapshot
            
            if not snapshot:
                return {'success': False, 'error': 'No rollback snapshot available'}
            
            deployment.status = DeploymentStatus.ROLLING_BACK
            session.flush()
            
            deployment_dir = Path(snapshot.get('deployment_dir', ''))
            compose_content = snapshot.get('compose_content', '')
            
            if not deployment_dir or not compose_content:
                return {'success': False, 'error': 'Invalid rollback snapshot'}
            
            broadcast_deployment_progress(deployment_id, 'rolling_back', 30,
                                          'Restoring', 'Restoring deployment files')
            log_deployment_step(deployment_id, 'info', 'Restoring deployment files', 'restoring')
            
            deployment_dir.mkdir(parents=True, exist_ok=True)
            compose_path = deployment_dir / 'docker-compose.yml'
            compose_path.write_text(compose_content)
            
            broadcast_deployment_progress(deployment_id, 'rolling_back', 60,
                                          'Starting', 'Starting restored services')
            log_deployment_step(deployment_id, 'info', 'Starting restored services', 'starting')
            
            result = subprocess.run(
                ['docker-compose', 'up', '-d'],
                cwd=deployment_dir,
                capture_output=True,
                text=True,
                timeout=300
            )
            
            if result.returncode == 0:
                deployment.status = DeploymentStatus.RUNNING
                deployment.progress = 100
                deployment.current_step = 'Rollback completed'
                deployment.compose_path = str(compose_path)
                deployment.rollback_snapshot = None
                
                broadcast_deployment_progress(deployment_id, 'completed', 100,
                                              'Completed', 'Rollback completed successfully')
                log_deployment_step(deployment_id, 'info', 'Rollback completed', 'completed')
                
                return {
                    'success': True,
                    'deployment_id': deployment_id,
                    'message': 'Rollback completed successfully'
                }
            else:
                error_msg = f"Rollback failed: {result.stderr}"
                deployment.status = DeploymentStatus.FAILED
                deployment.error_message = error_msg
                
                broadcast_deployment_progress(deployment_id, 'failed', 0, 'Failed', error_msg[:200])
                log_deployment_step(deployment_id, 'error', error_msg, 'failed')
                
                return {'success': False, 'error': error_msg}
    
    except Exception as e:
        error_msg = f"Error during rollback: {str(e)}"
        logger.error(error_msg, exc_info=True)
        broadcast_deployment_progress(deployment_id, 'failed', 0, 'Error', str(e)[:200])
        log_deployment_step(deployment_id, 'error', error_msg, 'exception')
        return {'success': False, 'error': error_msg}


@celery_app.task(bind=True, name='marketplace.check_deployment_status')
def check_deployment_status(self, deployment_id: str):
    """
    Check the current status of a deployment's containers
    
    Args:
        deployment_id: UUID of the deployment record
    
    Returns:
        dict: Status information about the deployment
    """
    try:
        if not db_service.is_available:
            return {'success': False, 'error': 'Database service not available'}
        
        from models.deployment_queue import DeploymentQueue
        from sqlalchemy import select
        
        with db_service.get_session() as session:
            deployment = session.execute(
                select(DeploymentQueue).where(DeploymentQueue.deployment_id == deployment_id)
            ).scalar_one_or_none()
            
            if not deployment:
                return {'success': False, 'error': f'Deployment {deployment_id} not found'}
            
            compose_path = Path(deployment.compose_path)
            deployment_dir = compose_path.parent
            
            if not compose_path.exists():
                return {
                    'success': True,
                    'deployment_id': deployment_id,
                    'status': 'not_found',
                    'containers': []
                }
            
            ps_result = subprocess.run(
                ['docker-compose', 'ps', '--format', 'json'],
                cwd=deployment_dir,
                capture_output=True,
                text=True
            )
            
            import json
            containers = []
            if ps_result.returncode == 0 and ps_result.stdout:
                try:
                    containers = json.loads(ps_result.stdout)
                except json.JSONDecodeError:
                    for line in ps_result.stdout.strip().split('\n'):
                        if line:
                            try:
                                containers.append(json.loads(line))
                            except json.JSONDecodeError:
                                pass
            
            return {
                'success': True,
                'deployment_id': deployment_id,
                'status': deployment.status.value if deployment.status else 'unknown',
                'containers': containers,
                'progress': deployment.progress,
                'current_step': deployment.current_step
            }
    
    except Exception as e:
        logger.error(f"Error checking deployment status: {e}")
        return {'success': False, 'error': str(e)}


__all__ = [
    'install_marketplace_app',
    'uninstall_marketplace_app',
    'rollback_deployment',
    'check_deployment_status'
]
