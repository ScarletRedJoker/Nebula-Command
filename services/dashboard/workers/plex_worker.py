"""Plex Media Import Celery Workers"""
import os
import logging
from celery import Task
from datetime import datetime

from celery_app import celery_app
from services.plex_service import plex_service
from services.db_service import db_service
from models.plex import PlexImportJob, PlexImportItem

logger = logging.getLogger(__name__)


class PlexTask(Task):
    """Base class for Plex import tasks with error handling"""
    
    autoretry_for = (Exception,)
    retry_kwargs = {'max_retries': 3, 'countdown': 10}
    retry_backoff = True
    retry_backoff_max = 600
    retry_jitter = True
    
    def on_failure(self, exc, task_id, args, kwargs, einfo):
        """Handle task failure"""
        logger.error(f"Plex task {task_id} failed: {exc}")
        
        # Update job status if job_id in kwargs
        job_id = kwargs.get('job_id')
        if job_id:
            try:
                plex_service.update_job_status(
                    job_id,
                    'failed',
                    error_message=str(exc)
                )
            except Exception as e:
                logger.error(f"Failed to update job status on failure: {e}")


@celery_app.task(base=PlexTask, bind=True, name='workers.plex_worker.process_import_job')
def process_import_job(self, job_id):
    """
    Process import job - move files from MinIO to Plex directories
    
    Args:
        job_id: Import job ID
    """
    logger.info(f"Processing import job {job_id}")
    
    try:
        if not db_service.is_available:
            raise RuntimeError("Database service not available")
        
        # Update job status to running
        plex_service.update_job_status(job_id, 'running')
        
        # Get job and items
        with db_service.get_session() as session:
            job = session.query(PlexImportJob).filter_by(id=job_id).first()
            
            if not job:
                raise ValueError(f"Import job {job_id} not found")
            
            pending_items = [item for item in job.items if item.status == 'pending']
            total_items = len(pending_items)
            
            logger.info(f"Processing {total_items} items for job {job_id}")
        
        # Process each item
        for idx, item in enumerate(pending_items, 1):
            item_id = str(item.id)
            
            try:
                logger.info(f"Processing item {idx}/{total_items}: {item.original_filename}")
                
                # Move file to Plex directory
                plex_service.move_file_to_plex(item_id)
                
                logger.info(f"Successfully processed item {item_id}")
                
            except Exception as e:
                logger.error(f"Failed to process item {item_id}: {e}")
                # Item status already updated in move_file_to_plex
                continue
        
        # Check if all items completed
        with db_service.get_session() as session:
            job = session.query(PlexImportJob).filter_by(id=job_id).first()
            
            if job:
                failed_count = sum(1 for item in job.items if item.status == 'failed')
                completed_count = sum(1 for item in job.items if item.status == 'completed')
                
                if failed_count > 0:
                    job.status = 'completed_with_errors'
                    job.error_message = f"{failed_count} items failed"
                else:
                    job.status = 'completed'
                
                job.completed_at = datetime.utcnow()
                session.commit()
        
        # Trigger Plex library scan
        logger.info(f"Triggering Plex library scan for job {job_id}")
        trigger_plex_scan.delay(job_id)
        
        logger.info(f"Import job {job_id} processing completed")
        
        return {
            'job_id': job_id,
            'total_items': total_items,
            'completed_at': datetime.utcnow().isoformat()
        }
        
    except Exception as e:
        logger.error(f"Import job {job_id} processing failed: {e}")
        plex_service.update_job_status(job_id, 'failed', error_message=str(e))
        raise


@celery_app.task(base=PlexTask, bind=True, name='workers.plex_worker.move_file_to_plex')
def move_file_to_plex(self, item_id):
    """
    Move individual file from MinIO to Plex directory
    
    Args:
        item_id: Import item ID
    """
    logger.info(f"Moving file to Plex for item {item_id}")
    
    try:
        plex_service.move_file_to_plex(item_id)
        
        logger.info(f"Successfully moved file for item {item_id}")
        
        return {
            'item_id': item_id,
            'status': 'completed',
            'completed_at': datetime.utcnow().isoformat()
        }
        
    except Exception as e:
        logger.error(f"Failed to move file for item {item_id}: {e}")
        raise


@celery_app.task(base=PlexTask, bind=True, name='workers.plex_worker.trigger_plex_scan')
def trigger_plex_scan(self, job_id=None, library_type=None):
    """
    Trigger Plex library scan
    
    Args:
        job_id: Optional job ID for logging
        library_type: Optional library type (movie, tv, music)
    """
    logger.info(f"Triggering Plex library scan (job_id={job_id}, library_type={library_type})")
    
    try:
        result = plex_service.trigger_library_scan(library_type=library_type)
        
        if result['success']:
            logger.info(f"Successfully triggered Plex scan for {result['count']} libraries")
            return result
        else:
            logger.error(f"Plex scan failed: {result.get('error')}")
            raise RuntimeError(result.get('error', 'Scan failed'))
        
    except Exception as e:
        logger.error(f"Failed to trigger Plex scan: {e}")
        raise


@celery_app.task(base=PlexTask, bind=True, name='workers.plex_worker.cleanup_old_imports')
def cleanup_old_imports(self, days=30):
    """
    Cleanup old completed import jobs
    
    Args:
        days: Age threshold in days (default: 30)
    """
    logger.info(f"Cleaning up import jobs older than {days} days")
    
    try:
        count = plex_service.cleanup_old_jobs(days=days)
        
        logger.info(f"Cleaned up {count} old import jobs")
        
        return {
            'cleaned_up': count,
            'days_threshold': days,
            'completed_at': datetime.utcnow().isoformat()
        }
        
    except Exception as e:
        logger.error(f"Cleanup task failed: {e}")
        raise


@celery_app.task(base=PlexTask, bind=True, name='workers.plex_worker.batch_import')
def batch_import(self, file_paths, user_id, media_type=None):
    """
    Batch import multiple media files
    
    Args:
        file_paths: List of file paths to import
        user_id: User ID
        media_type: Optional media type override
    """
    logger.info(f"Starting batch import of {len(file_paths)} files for user {user_id}")
    
    try:
        # Create import job
        job = plex_service.create_import_job(
            user_id=user_id,
            job_type=media_type or 'auto',
            metadata={'batch_import': True}
        )
        
        job_id = str(job.id)
        
        # Upload each file
        for file_path in file_paths:
            try:
                filename = os.path.basename(file_path)
                plex_service.upload_media_file(
                    file_path,
                    filename,
                    job_id,
                    media_type=media_type
                )
            except Exception as e:
                logger.error(f"Failed to upload file {file_path}: {e}")
                continue
        
        # Process the job
        process_import_job.delay(job_id)
        
        logger.info(f"Batch import job {job_id} created and queued")
        
        return {
            'job_id': job_id,
            'files_uploaded': len(file_paths),
            'created_at': datetime.utcnow().isoformat()
        }
        
    except Exception as e:
        logger.error(f"Batch import failed: {e}")
        raise
