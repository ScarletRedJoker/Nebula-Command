"""
Storage Monitoring Celery Workers
Background tasks for collecting storage metrics and monitoring alerts
"""

from celery import Task
from celery_app import celery_app
from services.storage_monitor import storage_monitor
from services.db_service import db_service
from services.notification_service import notification_service
from config import Config
from datetime import datetime, timedelta
import logging

logger = logging.getLogger(__name__)


class StorageTask(Task):
    """Base task with error handling for storage operations"""
    
    autoretry_for = (Exception,)
    retry_kwargs = {'max_retries': 3}
    retry_backoff = True
    retry_backoff_max = 600
    retry_jitter = True


@celery_app.task(base=StorageTask, name='workers.storage_worker.collect_storage_metrics')
def collect_storage_metrics():
    """
    Periodic task to collect comprehensive storage metrics
    Runs hourly via Celery Beat
    
    Collects metrics from:
    - Plex media directories
    - PostgreSQL databases
    - Docker volumes
    - MinIO buckets
    
    Stores all metrics in the database for historical tracking
    """
    logger.info("Starting storage metrics collection cycle")
    
    if not db_service.is_available:
        logger.warning("Database not available, skipping storage metrics collection")
        return {
            'success': False,
            'error': 'Database service not available'
        }
    
    collected = {
        'plex': 0,
        'databases': 0,
        'docker_volumes': 0,
        'minio_buckets': 0
    }
    
    try:
        from models.storage import StorageMetric
        
        with db_service.get_session() as session:
            timestamp = datetime.utcnow()
            
            # Collect Plex media metrics
            try:
                plex_data = storage_monitor.scan_plex_media()
                for media_type, data in plex_data.items():
                    metric = StorageMetric(
                        metric_type='plex_media',
                        metric_name=media_type,
                        path=data['path'],
                        size_bytes=data['size_bytes'],
                        file_count=data['file_count'],
                        timestamp=timestamp
                    )
                    session.add(metric)
                    collected['plex'] += 1
                logger.info(f"Collected {collected['plex']} Plex media metrics")
            except Exception as e:
                logger.error(f"Error collecting Plex metrics: {e}")
            
            # Collect database metrics
            try:
                db_sizes = storage_monitor.get_database_sizes()
                for db_name, data in db_sizes.items():
                    metric = StorageMetric(
                        metric_type='postgres_db',
                        metric_name=db_name,
                        size_bytes=data['size_bytes'],
                        timestamp=timestamp
                    )
                    session.add(metric)
                    collected['databases'] += 1
                logger.info(f"Collected {collected['databases']} database metrics")
            except Exception as e:
                logger.error(f"Error collecting database metrics: {e}")
            
            # Collect Docker volume metrics
            try:
                volume_data = storage_monitor.get_docker_volume_sizes()
                for volume_name, data in volume_data.items():
                    metric = StorageMetric(
                        metric_type='docker_volume',
                        metric_name=volume_name,
                        path=data.get('mountpoint'),
                        size_bytes=data['size_bytes'],
                        file_count=data.get('file_count'),
                        timestamp=timestamp
                    )
                    session.add(metric)
                    collected['docker_volumes'] += 1
                logger.info(f"Collected {collected['docker_volumes']} Docker volume metrics")
            except Exception as e:
                logger.error(f"Error collecting Docker volume metrics: {e}")
            
            # Collect MinIO bucket metrics
            try:
                bucket_data = storage_monitor.get_minio_bucket_sizes()
                for bucket_name, data in bucket_data.items():
                    metric = StorageMetric(
                        metric_type='minio_bucket',
                        metric_name=bucket_name,
                        size_bytes=data['size_bytes'],
                        file_count=data.get('object_count'),
                        metadata={'created': data.get('created')},
                        timestamp=timestamp
                    )
                    session.add(metric)
                    collected['minio_buckets'] += 1
                logger.info(f"Collected {collected['minio_buckets']} MinIO bucket metrics")
            except Exception as e:
                logger.error(f"Error collecting MinIO metrics: {e}")
            
            session.commit()
        
        total_collected = sum(collected.values())
        logger.info(f"Storage metrics collection complete: {total_collected} metrics stored")
        
        return {
            'success': True,
            'collected': collected,
            'total': total_collected,
            'timestamp': timestamp.isoformat()
        }
    
    except Exception as e:
        logger.error(f"Storage metrics collection failed: {e}")
        raise


@celery_app.task(base=StorageTask, name='workers.storage_worker.scan_plex_directories')
def scan_plex_directories():
    """
    Deep scan of Plex media directories
    More thorough than regular metrics collection
    
    Returns:
        Dict with scan results
    """
    logger.info("Starting deep Plex directory scan")
    
    try:
        plex_data = storage_monitor.scan_plex_media()
        
        total_size = sum(data['size_bytes'] for data in plex_data.values())
        total_files = sum(data['file_count'] for data in plex_data.values())
        
        # Store results in database
        if db_service.is_available:
            from models.storage import StorageMetric
            
            with db_service.get_session() as session:
                timestamp = datetime.utcnow()
                
                for media_type, data in plex_data.items():
                    metric = StorageMetric(
                        metric_type='plex_media',
                        metric_name=media_type,
                        path=data['path'],
                        size_bytes=data['size_bytes'],
                        file_count=data['file_count'],
                        metadata={'scan_type': 'deep'},
                        timestamp=timestamp
                    )
                    session.add(metric)
                
                session.commit()
        
        logger.info(f"Plex scan complete: {total_files} files, {round(total_size / (1024**3), 2)} GB")
        
        return {
            'success': True,
            'plex_data': plex_data,
            'totals': {
                'size_bytes': total_size,
                'size_gb': round(total_size / (1024**3), 2),
                'file_count': total_files
            }
        }
    
    except Exception as e:
        logger.error(f"Plex directory scan failed: {e}")
        raise


@celery_app.task(base=StorageTask, name='workers.storage_worker.check_database_sizes')
def check_database_sizes():
    """
    Query PostgreSQL database sizes using pg_database_size
    
    Returns:
        Dict with database size information
    """
    logger.info("Checking PostgreSQL database sizes")
    
    try:
        db_sizes = storage_monitor.get_database_sizes()
        
        # Store results
        if db_service.is_available:
            from models.storage import StorageMetric
            
            with db_service.get_session() as session:
                timestamp = datetime.utcnow()
                
                for db_name, data in db_sizes.items():
                    metric = StorageMetric(
                        metric_type='postgres_db',
                        metric_name=db_name,
                        size_bytes=data['size_bytes'],
                        timestamp=timestamp
                    )
                    session.add(metric)
                
                session.commit()
        
        total_size = sum(data['size_bytes'] for data in db_sizes.values())
        
        logger.info(f"Database sizes checked: {len(db_sizes)} databases, {round(total_size / (1024**3), 2)} GB total")
        
        return {
            'success': True,
            'databases': db_sizes,
            'total_size_gb': round(total_size / (1024**3), 2)
        }
    
    except Exception as e:
        logger.error(f"Database size check failed: {e}")
        raise


@celery_app.task(base=StorageTask, name='workers.storage_worker.check_alert_thresholds')
def check_alert_thresholds():
    """
    Check storage metrics against configured alert thresholds
    Send notifications for any exceeded thresholds
    
    Returns:
        Dict with triggered alerts
    """
    logger.info("Checking storage alert thresholds")
    
    try:
        triggered_alerts = storage_monitor.check_alert_thresholds()
        
        if triggered_alerts:
            logger.warning(f"⚠️ {len(triggered_alerts)} storage alerts triggered")
            
            # Log each alert and send notifications
            for alert in triggered_alerts:
                logger.warning(
                    f"Storage alert: {alert['metric_type']}/{alert['metric_name']} "
                    f"at {alert['current_percent']:.1f}% (threshold: {alert['threshold_percent']:.1f}%)"
                )
                
                # Send notification for this alert
                # Wrapped in try-except to ensure monitoring continues even if notifications fail
                try:
                    # Prepare alert data for notification
                    alert_data = {
                        'metric_type': alert.get('metric_type', 'unknown'),
                        'metric_name': alert.get('metric_name', 'Unknown'),
                        'mount_point': alert.get('mount_point', alert.get('path', 'N/A')),
                        'current_percent': alert.get('current_percent', 0),
                        'threshold_percent': alert.get('threshold_percent', 0),
                        'size_bytes': alert.get('size_bytes'),
                        'timestamp': datetime.utcnow().isoformat()
                    }
                    
                    # Send to all configured channels (discord, email, webhook)
                    notification_result = notification_service.send_storage_alert(
                        alert_data=alert_data,
                        channels=None  # None = use all configured channels
                    )
                    
                    if notification_result.get('success'):
                        logger.info(
                            f"Notification sent successfully for {alert['metric_name']}: "
                            f"channels={notification_result.get('channels', [])}"
                        )
                    else:
                        logger.warning(
                            f"Notification failed for {alert['metric_name']}: "
                            f"{notification_result.get('error', 'Unknown error')}"
                        )
                
                except Exception as e:
                    # Log notification errors but don't fail the entire task
                    logger.error(
                        f"Failed to send notification for {alert.get('metric_name', 'unknown')}: {e}",
                        exc_info=True
                    )
                    # Continue processing other alerts even if one notification fails
                    continue
        else:
            logger.info("No storage alerts triggered")
        
        return {
            'success': True,
            'triggered_alerts': triggered_alerts,
            'alert_count': len(triggered_alerts)
        }
    
    except Exception as e:
        logger.error(f"Alert threshold check failed: {e}")
        raise


@celery_app.task(base=StorageTask, name='workers.storage_worker.cleanup_old_metrics')
def cleanup_old_metrics(retention_days: int = 90):
    """
    Remove storage metrics older than specified retention period
    
    Args:
        retention_days: Number of days to retain metrics (default: 90)
        
    Returns:
        Dict with cleanup results
    """
    logger.info(f"Starting storage metrics cleanup (retention: {retention_days} days)")
    
    if not db_service.is_available:
        logger.warning("Database not available, skipping cleanup")
        return {
            'success': False,
            'error': 'Database service not available'
        }
    
    try:
        from models.storage import StorageMetric
        from sqlalchemy import select
        
        with db_service.get_session() as session:
            cutoff_date = datetime.utcnow() - timedelta(days=retention_days)
            
            # Get count of old metrics
            old_metrics = session.execute(
                select(StorageMetric).where(StorageMetric.timestamp < cutoff_date)
            ).scalars().all()
            
            count = len(old_metrics)
            
            if count == 0:
                logger.info("No old metrics to clean up")
                return {
                    'success': True,
                    'deleted_count': 0,
                    'message': 'No metrics older than retention period'
                }
            
            # Delete old metrics
            for metric in old_metrics:
                session.delete(metric)
            
            session.commit()
        
        logger.info(f"Cleanup complete: Deleted {count} metrics older than {retention_days} days")
        
        return {
            'success': True,
            'deleted_count': count,
            'cutoff_date': cutoff_date.isoformat(),
            'retention_days': retention_days
        }
    
    except Exception as e:
        logger.error(f"Metrics cleanup failed: {e}")
        raise


# Celery Beat schedule configuration
# Add these tasks to the beat schedule in celery_app.py:
STORAGE_BEAT_SCHEDULE = {
    'collect-storage-metrics-hourly': {
        'task': 'workers.storage_worker.collect_storage_metrics',
        'schedule': 3600.0,  # Every hour
    },
    'check-storage-alerts': {
        'task': 'workers.storage_worker.check_alert_thresholds',
        'schedule': 1800.0,  # Every 30 minutes
    },
    'cleanup-old-storage-metrics': {
        'task': 'workers.storage_worker.cleanup_old_metrics',
        'schedule': 86400.0,  # Daily
        'kwargs': {'retention_days': 90}
    }
}


__all__ = [
    'collect_storage_metrics',
    'scan_plex_directories',
    'check_database_sizes',
    'check_alert_thresholds',
    'cleanup_old_metrics',
    'STORAGE_BEAT_SCHEDULE'
]
