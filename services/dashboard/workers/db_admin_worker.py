"""
Database Administration Celery Workers
Background tasks for database backup, restore, and maintenance operations
"""

from celery import Task
from celery_app import celery_app
from services.db_admin_service import db_admin_service
from services.db_service import db_service
from config import Config
from models.db_admin import DBCredential, DBBackupJob
from sqlalchemy import select
from datetime import datetime, timedelta
import logging
import uuid

logger = logging.getLogger(__name__)


class DBAdminTask(Task):
    """Base task with error handling for DB admin operations"""
    
    autoretry_for = (Exception,)
    retry_kwargs = {'max_retries': 2}
    retry_backoff = True
    retry_backoff_max = 600
    retry_jitter = True


@celery_app.task(base=DBAdminTask, name='workers.db_admin_worker.backup_database_async')
def backup_database_async(backup_job_id: uuid.UUID):
    """
    Async task to execute database backup
    
    Args:
        backup_job_id: UUID of backup job
        
    Returns:
        Dict with backup result
    """
    logger.info(f"Starting async backup for job {backup_job_id}")
    
    try:
        result = db_admin_service.execute_backup(backup_job_id)
        
        if result['success']:
            logger.info(f"Backup completed successfully: {backup_job_id}")
        else:
            logger.error(f"Backup failed for job {backup_job_id}: {result.get('error')}")
        
        return result
    
    except Exception as e:
        logger.error(f"Async backup failed for job {backup_job_id}: {e}")
        
        if db_service.is_available:
            try:
                with db_service.get_session() as session:
                    backup_job = session.execute(
                        select(DBBackupJob).where(DBBackupJob.id == backup_job_id)
                    ).scalar_one_or_none()
                    
                    if backup_job:
                        backup_job.status = 'failed'
                        backup_job.error_message = str(e)
                        backup_job.completed_at = datetime.utcnow()
                        session.commit()
            except Exception as db_error:
                logger.error(f"Error updating backup job status: {db_error}")
        
        raise


@celery_app.task(base=DBAdminTask, name='workers.db_admin_worker.restore_database_async')
def restore_database_async(backup_job_id: uuid.UUID, target_db_credential_id: uuid.UUID):
    """
    Async task to restore database from backup
    
    Args:
        backup_job_id: UUID of backup job to restore from
        target_db_credential_id: UUID of target database credential
        
    Returns:
        Dict with restore result
    """
    logger.info(f"Starting async restore from backup {backup_job_id} to credential {target_db_credential_id}")
    
    try:
        result = db_admin_service.restore_database(
            backup_job_id=backup_job_id,
            target_db_credential_id=target_db_credential_id
        )
        
        if result['success']:
            logger.info(f"Restore completed successfully from backup {backup_job_id}")
        else:
            logger.error(f"Restore failed from backup {backup_job_id}: {result.get('error')}")
        
        return result
    
    except Exception as e:
        logger.error(f"Async restore failed: {e}")
        raise


@celery_app.task(base=DBAdminTask, name='workers.db_admin_worker.test_connection_async')
def test_connection_async(db_credential_id: uuid.UUID):
    """
    Async task to test database connection
    
    Args:
        db_credential_id: UUID of database credential
        
    Returns:
        Dict with connection test result
    """
    logger.info(f"Testing connection for credential {db_credential_id}")
    
    try:
        if not db_service.is_available:
            return {
                'success': False,
                'error': 'Database service not available'
            }
        
        with db_service.get_session() as session:
            credential = session.execute(
                select(DBCredential).where(DBCredential.id == db_credential_id)
            ).scalar_one_or_none()
            
            if not credential:
                return {
                    'success': False,
                    'error': 'Database credential not found'
                }
            
            password = db_admin_service.decrypt_password(credential.password_hash)
            
            result = db_admin_service.test_connection(
                host=credential.host,
                port=credential.port,
                database=credential.db_name,
                username=credential.username,
                password=password
            )
            
            credential.last_tested_at = datetime.utcnow()
            credential.test_status = result['status']
            session.commit()
            
            logger.info(f"Connection test {'succeeded' if result['success'] else 'failed'} for {credential.db_name}")
            
            return result
    
    except Exception as e:
        logger.error(f"Connection test failed: {e}")
        raise


@celery_app.task(base=DBAdminTask, name='workers.db_admin_worker.scheduled_backups')
def scheduled_backups():
    """
    Periodic task to run scheduled backups
    Runs daily at 2 AM via Celery Beat
    
    Creates backups for all active database credentials
    
    Returns:
        Dict with scheduled backup results
    """
    logger.info("Starting scheduled backup cycle")
    
    if not db_service.is_available:
        logger.warning("Database not available, skipping scheduled backups")
        return {
            'success': False,
            'error': 'Database service not available'
        }
    
    try:
        with db_service.get_session() as session:
            active_credentials = session.execute(
                select(DBCredential).where(DBCredential.is_active == True)
            ).scalars().all()
            
            if not active_credentials:
                logger.info("No active database credentials found for scheduled backup")
                return {
                    'success': True,
                    'message': 'No active databases to backup',
                    'backup_count': 0
                }
            
            backup_jobs = []
            
            for credential in active_credentials:
                try:
                    result = db_admin_service.backup_database(
                        db_credential_id=credential.id,
                        backup_type='full',
                        compression='gzip'
                    )
                    
                    if result['success']:
                        task = backup_database_async.delay(uuid.UUID(result['backup_job_id']))
                        backup_jobs.append({
                            'db_name': credential.db_name,
                            'backup_job_id': result['backup_job_id'],
                            'task_id': task.id
                        })
                        logger.info(f"Scheduled backup for {credential.db_name}: {result['backup_job_id']}")
                    else:
                        logger.error(f"Failed to create backup job for {credential.db_name}: {result.get('error')}")
                
                except Exception as e:
                    logger.error(f"Error scheduling backup for {credential.db_name}: {e}")
            
            logger.info(f"Scheduled {len(backup_jobs)} backups")
            
            return {
                'success': True,
                'backup_jobs': backup_jobs,
                'backup_count': len(backup_jobs),
                'total_databases': len(active_credentials)
            }
    
    except Exception as e:
        logger.error(f"Scheduled backup cycle failed: {e}")
        raise


@celery_app.task(base=DBAdminTask, name='workers.db_admin_worker.cleanup_old_backups')
def cleanup_old_backups(retention_days: int = None):
    """
    Periodic task to clean up old backups
    Runs daily via Celery Beat
    
    Args:
        retention_days: Number of days to retain backups (default from config)
        
    Returns:
        Dict with cleanup results
    """
    retention_days = retention_days or Config.DB_BACKUP_RETENTION_DAYS
    
    logger.info(f"Starting backup cleanup (retention: {retention_days} days)")
    
    try:
        result = db_admin_service.cleanup_old_backups(retention_days=retention_days)
        
        if result['success']:
            logger.info(
                f"Cleanup complete: deleted {result['deleted_count']} backups, "
                f"freed {result['freed_mb']} MB"
            )
        else:
            logger.error(f"Cleanup failed: {result.get('error')}")
        
        return result
    
    except Exception as e:
        logger.error(f"Backup cleanup failed: {e}")
        raise


@celery_app.task(base=DBAdminTask, name='workers.db_admin_worker.test_all_connections')
def test_all_connections():
    """
    Test all database connections
    Useful for health monitoring
    
    Returns:
        Dict with connection test results
    """
    logger.info("Testing all database connections")
    
    if not db_service.is_available:
        logger.warning("Database not available, skipping connection tests")
        return {
            'success': False,
            'error': 'Database service not available'
        }
    
    try:
        with db_service.get_session() as session:
            all_credentials = session.execute(
                select(DBCredential).where(DBCredential.is_active == True)
            ).scalars().all()
            
            results = []
            success_count = 0
            failed_count = 0
            
            for credential in all_credentials:
                try:
                    password = db_admin_service.decrypt_password(credential.password_hash)
                    
                    test_result = db_admin_service.test_connection(
                        host=credential.host,
                        port=credential.port,
                        database=credential.db_name,
                        username=credential.username,
                        password=password
                    )
                    
                    credential.last_tested_at = datetime.utcnow()
                    credential.test_status = test_result['status']
                    
                    results.append({
                        'db_name': credential.db_name,
                        'host': credential.host,
                        'status': test_result['status'],
                        'success': test_result['success']
                    })
                    
                    if test_result['success']:
                        success_count += 1
                    else:
                        failed_count += 1
                
                except Exception as e:
                    logger.error(f"Connection test failed for {credential.db_name}: {e}")
                    failed_count += 1
                    results.append({
                        'db_name': credential.db_name,
                        'host': credential.host,
                        'status': 'failed',
                        'success': False,
                        'error': str(e)
                    })
            
            session.commit()
            
            logger.info(
                f"Connection tests complete: {success_count} successful, "
                f"{failed_count} failed"
            )
            
            return {
                'success': True,
                'results': results,
                'success_count': success_count,
                'failed_count': failed_count,
                'total': len(all_credentials)
            }
    
    except Exception as e:
        logger.error(f"Connection test cycle failed: {e}")
        raise


@celery_app.task(base=DBAdminTask, name='workers.db_admin_worker.discover_and_add_databases')
def discover_and_add_databases(host: str, port: int, admin_username: str, admin_password: str):
    """
    Discover databases on a server and optionally add them
    
    Args:
        host: Database host
        port: Database port
        admin_username: Admin username
        admin_password: Admin password (will be encrypted for storage)
        
    Returns:
        Dict with discovered databases
    """
    logger.info(f"Discovering databases on {host}:{port}")
    
    try:
        databases = db_admin_service.discover_databases(
            host=host,
            port=port,
            username=admin_username,
            password=admin_password
        )
        
        logger.info(f"Discovered {len(databases)} databases on {host}")
        
        return {
            'success': True,
            'databases': databases,
            'total': len(databases),
            'host': host,
            'port': port
        }
    
    except Exception as e:
        logger.error(f"Database discovery failed: {e}")
        raise


# Celery Beat schedule configuration
DB_ADMIN_BEAT_SCHEDULE = {
    'scheduled-database-backups': {
        'task': 'workers.db_admin_worker.scheduled_backups',
        'schedule': Config.DB_BACKUP_SCHEDULE if hasattr(Config, 'DB_BACKUP_SCHEDULE') else 7200.0,
        'options': {
            'queue': 'db_admin'
        }
    },
    'cleanup-old-backups-daily': {
        'task': 'workers.db_admin_worker.cleanup_old_backups',
        'schedule': 86400.0,
        'options': {
            'queue': 'db_admin'
        }
    },
    'test-database-connections-hourly': {
        'task': 'workers.db_admin_worker.test_all_connections',
        'schedule': 3600.0,
        'options': {
            'queue': 'db_admin'
        }
    }
}


__all__ = [
    'backup_database_async',
    'restore_database_async',
    'test_connection_async',
    'scheduled_backups',
    'cleanup_old_backups',
    'test_all_connections',
    'discover_and_add_databases',
    'DB_ADMIN_BEAT_SCHEDULE'
]
