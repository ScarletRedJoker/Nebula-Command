"""Game Streaming Celery Workers"""
import logging
from celery import Task
from datetime import datetime, timedelta

from celery_app import celery_app
from services.game_streaming_service import game_streaming_service
from services.db_service import db_service

logger = logging.getLogger(__name__)


class GamingTask(Task):
    """Base class for gaming tasks with error handling"""
    
    autoretry_for = (Exception,)
    retry_kwargs = {'max_retries': 3, 'countdown': 10}
    retry_backoff = True
    retry_backoff_max = 600
    retry_jitter = True
    
    def on_failure(self, exc, task_id, args, kwargs, einfo):
        """Handle task failure"""
        logger.error(f"Gaming task {task_id} failed: {exc}")


@celery_app.task(base=GamingTask, bind=True, name='workers.gaming_worker.discover_sunshine_hosts')
def discover_sunshine_hosts(self, network_range=None):
    """
    Discover Sunshine hosts on the network
    
    Args:
        network_range: Network range to scan (optional)
    
    Returns:
        Dictionary with discovery results
    """
    logger.info(f"Starting Sunshine host discovery on {network_range or 'local network'}")
    
    try:
        # Run discovery
        discovered = game_streaming_service.auto_discover_hosts(network_range)
        
        logger.info(f"Discovery complete. Found {len(discovered)} Sunshine hosts")
        
        # Save discovered hosts to database
        saved_hosts = []
        for host_info in discovered:
            try:
                host = game_streaming_service.add_host_manual(
                    host_info['host_ip'],
                    host_info.get('host_name')
                )
                saved_hosts.append(host)
                logger.info(f"Saved discovered host: {host_info['host_ip']}")
            except Exception as e:
                logger.error(f"Failed to save discovered host {host_info['host_ip']}: {e}")
        
        return {
            'task_id': self.request.id,
            'discovered_count': len(discovered),
            'saved_count': len(saved_hosts),
            'hosts': saved_hosts,
            'completed_at': datetime.utcnow().isoformat()
        }
        
    except Exception as e:
        logger.error(f"Host discovery failed: {e}")
        raise


@celery_app.task(base=GamingTask, bind=True, name='workers.gaming_worker.check_sunshine_health')
def check_sunshine_health(self):
    """
    Check health of all configured Sunshine hosts
    
    Returns:
        Dictionary with health check results
    """
    logger.info("Running health checks on all Sunshine hosts")
    
    try:
        if not db_service.is_available:
            raise RuntimeError("Database service not available")
        
        hosts = game_streaming_service.get_hosts()
        
        results = []
        for host in hosts:
            try:
                host_id = host['id']
                health = game_streaming_service.check_health(host_id)
                results.append(health)
                
                status = "ONLINE" if health['is_online'] else "OFFLINE"
                logger.info(f"Host {host['host_ip']}: {status}")
                
            except Exception as e:
                logger.error(f"Health check failed for host {host.get('host_ip')}: {e}")
                results.append({
                    'host_id': host.get('id'),
                    'host_ip': host.get('host_ip'),
                    'is_online': False,
                    'error': str(e)
                })
        
        online_count = sum(1 for r in results if r.get('is_online'))
        offline_count = len(results) - online_count
        
        logger.info(f"Health check complete: {online_count} online, {offline_count} offline")
        
        return {
            'task_id': self.request.id,
            'total_hosts': len(results),
            'online_count': online_count,
            'offline_count': offline_count,
            'results': results,
            'completed_at': datetime.utcnow().isoformat()
        }
        
    except Exception as e:
        logger.error(f"Health check task failed: {e}")
        raise


@celery_app.task(base=GamingTask, bind=True, name='workers.gaming_worker.monitor_active_sessions')
def monitor_active_sessions(self):
    """
    Monitor active game streaming sessions and update metrics
    
    Returns:
        Dictionary with monitoring results
    """
    logger.info("Monitoring active game streaming sessions")
    
    try:
        from models.gaming import GameSession
        
        if not db_service.is_available:
            raise RuntimeError("Database service not available")
        
        # Get active sessions
        with db_service.get_session() as session:
            active_sessions = session.query(GameSession).filter_by(status='active').all()
            
            updated_count = 0
            stale_count = 0
            
            for game_session in active_sessions:
                try:
                    # Check if session is still active (no update in last 5 minutes)
                    if game_session.started_at:
                        session_age = datetime.utcnow() - game_session.started_at
                        
                        # Mark as disconnected if session is very old (> 24 hours) with no updates
                        if session_age > timedelta(hours=24):
                            game_session.status = 'disconnected'
                            game_session.ended_at = datetime.utcnow()
                            stale_count += 1
                            logger.info(f"Marked stale session {game_session.id} as disconnected")
                        else:
                            # Could add logic here to ping the host and check if still streaming
                            updated_count += 1
                    
                except Exception as e:
                    logger.error(f"Failed to monitor session {game_session.id}: {e}")
            
            session.commit()
            
            logger.info(f"Session monitoring complete: {updated_count} active, {stale_count} marked stale")
            
            return {
                'task_id': self.request.id,
                'total_sessions': len(active_sessions),
                'updated_count': updated_count,
                'stale_count': stale_count,
                'completed_at': datetime.utcnow().isoformat()
            }
        
    except Exception as e:
        logger.error(f"Session monitoring failed: {e}")
        raise


@celery_app.task(base=GamingTask, bind=True, name='workers.gaming_worker.cleanup_stale_sessions')
def cleanup_stale_sessions(self):
    """
    Clean up stale game streaming sessions (older than 30 days)
    
    Returns:
        Dictionary with cleanup results
    """
    logger.info("Cleaning up stale game streaming sessions")
    
    try:
        from models.gaming import GameSession
        
        if not db_service.is_available:
            raise RuntimeError("Database service not available")
        
        cutoff_date = datetime.utcnow() - timedelta(days=30)
        
        with db_service.get_session() as session:
            # Delete sessions older than 30 days
            old_sessions = session.query(GameSession).filter(
                GameSession.started_at < cutoff_date
            ).all()
            
            deleted_count = len(old_sessions)
            
            for game_session in old_sessions:
                session.delete(game_session)
            
            session.commit()
            
            logger.info(f"Cleanup complete: Deleted {deleted_count} old sessions")
            
            return {
                'task_id': self.request.id,
                'deleted_count': deleted_count,
                'cutoff_date': cutoff_date.isoformat(),
                'completed_at': datetime.utcnow().isoformat()
            }
        
    except Exception as e:
        logger.error(f"Session cleanup failed: {e}")
        raise


@celery_app.task(base=GamingTask, bind=True, name='workers.gaming_worker.refresh_host_applications')
def refresh_host_applications(self, host_id):
    """
    Refresh the list of applications for a specific host
    
    Args:
        host_id: Host UUID
    
    Returns:
        Dictionary with refresh results
    """
    logger.info(f"Refreshing applications for host {host_id}")
    
    try:
        apps = game_streaming_service.get_applications(host_id)
        
        logger.info(f"Refreshed {len(apps)} applications for host {host_id}")
        
        return {
            'task_id': self.request.id,
            'host_id': host_id,
            'app_count': len(apps),
            'applications': apps,
            'completed_at': datetime.utcnow().isoformat()
        }
        
    except Exception as e:
        logger.error(f"Application refresh failed for host {host_id}: {e}")
        raise
