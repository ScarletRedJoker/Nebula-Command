import os
import tempfile
import zipfile
import shutil
import logging
from datetime import datetime
from celery import Task
from celery_app import celery_app
from services.deployment_analyzer import deployment_analyzer
from services.upload_service import upload_service
from services.db_service import db_service
from services.websocket_service import websocket_service
from models.artifact import Artifact, AnalysisStatus

logger = logging.getLogger(__name__)


class AnalysisTask(Task):
    """Base class for analysis tasks with error handling"""
    
    autoretry_for = (Exception,)
    retry_kwargs = {'max_retries': 3, 'countdown': 5}
    retry_backoff = True
    retry_backoff_max = 600
    retry_jitter = True
    
    def on_failure(self, exc, task_id, args, kwargs, einfo):
        """Handle task failure"""
        artifact_id = kwargs.get('artifact_id') or (args[0] if args else None)
        if artifact_id and db_service.is_available:
            try:
                with db_service.get_session() as db_session:
                    artifact = db_session.query(Artifact).filter_by(id=artifact_id).first()
                    if artifact:
                        artifact.analysis_status = AnalysisStatus.failed
                        artifact.analysis_result = {'error': str(exc), 'timestamp': datetime.utcnow().isoformat()}
                        
                        websocket_service.publish_event('analysis_update', {
                            'type': 'analysis_failed',
                            'artifact_id': str(artifact_id),
                            'error': str(exc),
                            'timestamp': datetime.utcnow().isoformat()
                        })
            except Exception as e:
                logger.error(f"Failed to update artifact status on failure: {e}")
        logger.error(f"Analysis task {task_id} failed: {exc}")
    
    def on_success(self, retval, task_id, args, kwargs):
        """Handle task success"""
        artifact_id = kwargs.get('artifact_id') or (args[0] if args else None)
        if artifact_id:
            try:
                websocket_service.publish_event('analysis_update', {
                    'type': 'analysis_completed',
                    'artifact_id': str(artifact_id),
                    'result': retval,
                    'timestamp': datetime.utcnow().isoformat()
                })
            except Exception as e:
                logger.error(f"Failed to publish success event: {e}")
        logger.info(f"Analysis task {task_id} completed successfully")


@celery_app.task(base=AnalysisTask, bind=True, name='workers.analysis_worker.analyze_artifact_task')
def analyze_artifact_task(self, artifact_id: str):
    """
    Background task to analyze uploaded artifact
    
    Args:
        artifact_id: UUID of the artifact to analyze
        
    Returns:
        Dictionary with analysis results
    """
    logger.info(f"Starting analysis for artifact: {artifact_id}")
    
    if not db_service.is_available:
        raise RuntimeError("Database service not available")
    
    temp_dir = None
    
    try:
        with db_service.get_session() as db_session:
            artifact = db_session.query(Artifact).filter_by(id=artifact_id).first()
            
            if not artifact:
                raise ValueError(f"Artifact not found: {artifact_id}")
            
            artifact.analysis_status = AnalysisStatus.analyzing
            
            storage_path = artifact.storage_path
            filename = artifact.filename
        
        websocket_service.publish_event('analysis_update', {
            'type': 'analysis_started',
            'artifact_id': str(artifact_id),
            'timestamp': datetime.utcnow().isoformat()
        })
        
        parts = storage_path.split('/', 1)
        if len(parts) != 2:
            raise ValueError(f"Invalid storage path: {storage_path}")
        
        bucket, object_name = parts
        
        temp_dir = tempfile.mkdtemp(prefix='analysis_')
        logger.info(f"Created temp directory: {temp_dir}")
        
        download_path = os.path.join(temp_dir, filename)
        logger.info(f"Downloading artifact from MinIO: {bucket}/{object_name}")
        upload_service.get_artifact(bucket, object_name, download_path)
        
        extract_path = temp_dir
        if filename.endswith('.zip'):
            logger.info("Extracting zip file...")
            extract_path = os.path.join(temp_dir, 'extracted')
            os.makedirs(extract_path, exist_ok=True)
            
            with zipfile.ZipFile(download_path, 'r') as zip_ref:
                zip_ref.extractall(extract_path)
            
            logger.info(f"Extracted to: {extract_path}")
        elif filename.endswith(('.tar', '.tar.gz', '.tgz')):
            logger.info("Extracting tar file...")
            import tarfile
            extract_path = os.path.join(temp_dir, 'extracted')
            os.makedirs(extract_path, exist_ok=True)
            
            with tarfile.open(download_path, 'r:*') as tar_ref:
                tar_ref.extractall(extract_path)
            
            logger.info(f"Extracted to: {extract_path}")
        
        logger.info("Running deployment analyzer...")
        analysis_result = deployment_analyzer.analyze_artifact(extract_path)
        
        logger.info(f"Analysis complete: {analysis_result.project_type} (confidence: {analysis_result.confidence})")
        
        with db_service.get_session() as db_session:
            artifact = db_session.query(Artifact).filter_by(id=artifact_id).first()
            if artifact:
                artifact.analysis_status = AnalysisStatus.complete
                artifact.analysis_complete = True
                artifact.analysis_result = analysis_result.to_dict()
                artifact.detected_framework = analysis_result.framework
                artifact.requires_database = analysis_result.requires_database
                artifact.detected_service_type = analysis_result.project_type
        
        result = {
            'artifact_id': str(artifact_id),
            'status': 'success',
            'analysis': analysis_result.to_dict(),
            'analyzed_at': datetime.utcnow().isoformat()
        }
        
        logger.info(f"Analysis result saved for artifact: {artifact_id}")
        
        return result
        
    except Exception as e:
        logger.error(f"Error analyzing artifact {artifact_id}: {e}", exc_info=True)
        try:
            with db_service.get_session() as db_session:
                artifact = db_session.query(Artifact).filter_by(id=artifact_id).first()
                if artifact:
                    artifact.analysis_status = AnalysisStatus.failed
                    artifact.analysis_result = {
                        'error': str(e),
                        'timestamp': datetime.utcnow().isoformat()
                    }
        except Exception as commit_error:
            logger.error(f"Failed to update artifact on error: {commit_error}")
        raise
        
    finally:
        if temp_dir and os.path.exists(temp_dir):
            try:
                shutil.rmtree(temp_dir)
                logger.info(f"Cleaned up temp directory: {temp_dir}")
            except Exception as e:
                logger.warning(f"Failed to cleanup temp directory: {e}")


@celery_app.task(base=AnalysisTask, bind=True, name='workers.analysis_worker.analyze_preview_task')
def analyze_preview_task(self, file_path: str):
    """
    Analyze a file for preview without saving to database
    
    Args:
        file_path: Path to the file or directory to analyze
        
    Returns:
        Dictionary with analysis results
    """
    logger.info(f"Starting preview analysis for: {file_path}")
    
    temp_dir = None
    
    try:
        extract_path = file_path
        
        if os.path.isfile(file_path):
            if file_path.endswith('.zip'):
                temp_dir = tempfile.mkdtemp(prefix='preview_')
                extract_path = os.path.join(temp_dir, 'extracted')
                os.makedirs(extract_path, exist_ok=True)
                
                with zipfile.ZipFile(file_path, 'r') as zip_ref:
                    zip_ref.extractall(extract_path)
            elif file_path.endswith(('.tar', '.tar.gz', '.tgz')):
                import tarfile
                temp_dir = tempfile.mkdtemp(prefix='preview_')
                extract_path = os.path.join(temp_dir, 'extracted')
                os.makedirs(extract_path, exist_ok=True)
                
                with tarfile.open(file_path, 'r:*') as tar_ref:
                    tar_ref.extractall(extract_path)
        
        analysis_result = deployment_analyzer.analyze_artifact(extract_path)
        
        return {
            'status': 'success',
            'analysis': analysis_result.to_dict(),
            'analyzed_at': datetime.utcnow().isoformat()
        }
        
    finally:
        if temp_dir and os.path.exists(temp_dir):
            try:
                shutil.rmtree(temp_dir)
            except Exception as e:
                logger.warning(f"Failed to cleanup temp directory: {e}")
