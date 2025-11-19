"""
Service Operations Celery Workers
Background tasks for telemetry collection and service management
"""

from celery import Task
from celery_app import celery_app
from services.service_ops import service_ops
from config import Config
import logging

logger = logging.getLogger(__name__)


class ServiceOpsTask(Task):
    """Base task with error handling for service operations"""
    
    autoretry_for = (Exception,)
    retry_kwargs = {'max_retries': 3}
    retry_backoff = True
    retry_backoff_max = 600
    retry_jitter = True


@celery_app.task(base=ServiceOpsTask, name='workers.service_ops_worker.collect_telemetry')
def collect_telemetry():
    """
    Periodic task to collect telemetry from all configured services
    Runs every 30 seconds via Celery Beat
    
    Collects CPU, memory, network stats and stores in database
    """
    logger.info("Starting telemetry collection cycle")
    
    collected_count = 0
    failed_count = 0
    
    try:
        for service_key, service_info in Config.SERVICES.items():
            container_name = service_info.get('container')
            if not container_name:
                logger.debug(f"Skipping {service_key}: no container defined")
                continue
            
            try:
                success = service_ops.store_telemetry(service_key, container_name)
                if success:
                    collected_count += 1
                    logger.debug(f"Collected telemetry for {service_key}")
                else:
                    failed_count += 1
                    logger.warning(f"Failed to collect telemetry for {service_key}")
            except Exception as e:
                failed_count += 1
                logger.error(f"Error collecting telemetry for {service_key}: {e}")
        
        logger.info(f"Telemetry collection complete: {collected_count} succeeded, {failed_count} failed")
        
        return {
            'success': True,
            'collected': collected_count,
            'failed': failed_count
        }
        
    except Exception as e:
        logger.error(f"Telemetry collection cycle failed: {e}")
        raise


@celery_app.task(base=ServiceOpsTask, name='workers.service_ops_worker.restart_service_async')
def restart_service_async(service_name: str, container_name: str):
    """
    Asynchronous service restart task
    
    Args:
        service_name: Logical service name
        container_name: Docker container name
        
    Returns:
        Dict with success status and message
    """
    logger.info(f"Async restart requested for {service_name} (container: {container_name})")
    
    try:
        result = service_ops.restart_service(service_name, container_name)
        
        if result.get('success'):
            logger.info(f"Successfully restarted {service_name}")
        else:
            logger.error(f"Failed to restart {service_name}: {result.get('message')}")
        
        return result
        
    except Exception as e:
        logger.error(f"Async restart failed for {service_name}: {e}")
        return {
            'success': False,
            'message': str(e)
        }


@celery_app.task(base=ServiceOpsTask, name='workers.service_ops_worker.health_check_all')
def health_check_all():
    """
    Run health checks on all configured services
    
    Returns:
        Dict with health check results
    """
    logger.info("Running health checks on all services")
    
    results = []
    healthy_count = 0
    
    try:
        for service_key, service_info in Config.SERVICES.items():
            container_name = service_info.get('container')
            if not container_name:
                continue
            
            try:
                health = service_ops.execute_health_check(service_key, container_name)
                health['display_name'] = service_info.get('name')
                results.append(health)
                
                if health.get('healthy'):
                    healthy_count += 1
                    
            except Exception as e:
                logger.error(f"Health check failed for {service_key}: {e}")
                results.append({
                    'service_name': service_key,
                    'healthy': False,
                    'status': 'error',
                    'message': str(e)
                })
        
        total = len(results)
        logger.info(f"Health checks complete: {healthy_count}/{total} services healthy")
        
        return {
            'success': True,
            'results': results,
            'summary': {
                'total': total,
                'healthy': healthy_count,
                'unhealthy': total - healthy_count,
                'health_percentage': (healthy_count / total * 100) if total > 0 else 0
            }
        }
        
    except Exception as e:
        logger.error(f"Health check cycle failed: {e}")
        raise


@celery_app.task(base=ServiceOpsTask, name='workers.service_ops_worker.cleanup_old_telemetry')
def cleanup_old_telemetry(days: int = 7):
    """
    Clean up telemetry data older than specified days
    
    Args:
        days: Number of days to retain (default: 7)
        
    Returns:
        Dict with cleanup results
    """
    from datetime import datetime, timedelta
    from services.db_service import db_service
    from models.service_ops import ServiceTelemetry
    
    logger.info(f"Starting telemetry cleanup (retention: {days} days)")
    
    try:
        session = db_service.get_session()
        cutoff_date = datetime.utcnow() - timedelta(days=days)
        
        # Delete old records
        deleted = session.query(ServiceTelemetry).filter(
            ServiceTelemetry.timestamp < cutoff_date
        ).delete()
        
        session.commit()
        session.close()
        
        logger.info(f"Cleaned up {deleted} old telemetry records")
        
        return {
            'success': True,
            'deleted': deleted,
            'retention_days': days
        }
        
    except Exception as e:
        logger.error(f"Telemetry cleanup failed: {e}")
        raise


# Configure Celery Beat schedule
celery_app.conf.beat_schedule = {
    'collect-service-telemetry': {
        'task': 'workers.service_ops_worker.collect_telemetry',
        'schedule': 30.0,  # Every 30 seconds
    },
    'health-check-all-services': {
        'task': 'workers.service_ops_worker.health_check_all',
        'schedule': 300.0,  # Every 5 minutes
    },
    'cleanup-old-telemetry': {
        'task': 'workers.service_ops_worker.cleanup_old_telemetry',
        'schedule': 86400.0,  # Once per day
        'kwargs': {'days': 7}
    },
}

logger.info("Service Operations worker initialized with beat schedule")
