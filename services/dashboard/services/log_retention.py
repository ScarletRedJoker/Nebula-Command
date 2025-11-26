"""
Log Retention Service
Manage log retention policies, cleanup old logs, and archive important data
"""
import logging
from datetime import datetime, timedelta
from typing import Dict, List, Optional

from services.db_service import db_service

logger = logging.getLogger(__name__)


class LogRetentionService:
    """
    Service for managing log retention policies
    
    Features:
    - Configurable retention periods for different log types
    - Automatic cleanup of old logs
    - Archive important logs before deletion
    - Generate retention reports
    """
    
    DEFAULT_RETENTION_DAYS = {
        'system_logs': 90,
        'activity_logs': 90,
        'audit_logs': 365,
        'unified_logs': 30,
        'anomaly_events': 90,
        'remediation_history': 180,
        'model_usage': 90,
        'deployment_logs': 60,
        'request_queue': 7,
    }
    
    def __init__(self, retention_config: Dict[str, int] = None):
        """
        Initialize the log retention service
        
        Args:
            retention_config: Optional custom retention days per log type
        """
        self.retention_days = self.DEFAULT_RETENTION_DAYS.copy()
        if retention_config:
            self.retention_days.update(retention_config)
    
    def get_retention_config(self) -> Dict[str, int]:
        """Get current retention configuration"""
        return self.retention_days.copy()
    
    def set_retention_days(self, log_type: str, days: int):
        """
        Set retention days for a specific log type
        
        Args:
            log_type: Type of logs
            days: Number of days to retain
        """
        if days < 1:
            raise ValueError("Retention days must be at least 1")
        self.retention_days[log_type] = days
        logger.info(f"Set retention for {log_type} to {days} days")
    
    def get_log_counts(self) -> Dict[str, Dict]:
        """
        Get counts of logs by type and age
        
        Returns:
            Dict with log counts and size estimates
        """
        counts = {}
        
        table_configs = [
            ('system_logs', 'SystemLog', 'timestamp'),
            ('activity_logs', 'ActivityLog', 'timestamp'),
            ('audit_logs', 'AuditLog', 'timestamp'),
            ('unified_logs', 'UnifiedLog', 'timestamp'),
            ('anomaly_events', 'AnomalyEvent', 'timestamp'),
            ('remediation_history', 'RemediationHistory', 'started_at'),
            ('model_usage', 'ModelUsage', 'timestamp'),
            ('deployment_logs', 'DeploymentLog', 'timestamp'),
            ('request_queue', 'RequestQueue', 'created_at'),
        ]
        
        for table_name, model_name, timestamp_col in table_configs:
            try:
                counts[table_name] = self._get_table_counts(model_name, timestamp_col)
            except Exception as e:
                logger.debug(f"Could not get counts for {table_name}: {e}")
                counts[table_name] = {'error': str(e)}
        
        return counts
    
    def _get_table_counts(self, model_name: str, timestamp_col: str) -> Dict:
        """Get counts for a specific table"""
        model_mappings = {
            'SystemLog': 'models.system_log',
            'ActivityLog': 'models.system_log',
            'AuditLog': 'models.audit',
            'UnifiedLog': 'models.unified_log',
            'AnomalyEvent': 'models.jarvis_ai',
            'RemediationHistory': 'models.jarvis_ai',
            'ModelUsage': 'models.jarvis_ai',
            'DeploymentLog': 'models.deployment_queue',
            'RequestQueue': 'models.jarvis_ai',
        }
        
        try:
            module_path = model_mappings.get(model_name)
            if not module_path:
                return {'error': 'Model not found'}
            
            import importlib
            module = importlib.import_module(module_path)
            model_class = getattr(module, model_name)
            
            with db_service.get_session() as session:
                from sqlalchemy import func
                
                total = session.query(func.count(model_class.id)).scalar() or 0
                
                timestamp_attr = getattr(model_class, timestamp_col)
                
                now = datetime.utcnow()
                day_ago = now - timedelta(days=1)
                week_ago = now - timedelta(days=7)
                month_ago = now - timedelta(days=30)
                
                last_day = session.query(func.count(model_class.id)).filter(
                    timestamp_attr >= day_ago
                ).scalar() or 0
                
                last_week = session.query(func.count(model_class.id)).filter(
                    timestamp_attr >= week_ago
                ).scalar() or 0
                
                last_month = session.query(func.count(model_class.id)).filter(
                    timestamp_attr >= month_ago
                ).scalar() or 0
                
                return {
                    'total': total,
                    'last_24h': last_day,
                    'last_7d': last_week,
                    'last_30d': last_month,
                    'older_than_30d': total - last_month
                }
        except Exception as e:
            logger.debug(f"Error counting {model_name}: {e}")
            return {'error': str(e)}
    
    def cleanup_old_logs(self, dry_run: bool = False) -> Dict[str, Dict]:
        """
        Clean up logs older than retention period
        
        Args:
            dry_run: If True, only report what would be deleted
            
        Returns:
            Dict with cleanup results per log type
        """
        results = {}
        
        cleanup_configs = [
            ('system_logs', 'SystemLog', 'models.system_log', 'timestamp'),
            ('activity_logs', 'ActivityLog', 'models.system_log', 'timestamp'),
            ('unified_logs', 'UnifiedLog', 'models.unified_log', 'timestamp'),
            ('anomaly_events', 'AnomalyEvent', 'models.jarvis_ai', 'timestamp'),
            ('model_usage', 'ModelUsage', 'models.jarvis_ai', 'timestamp'),
            ('request_queue', 'RequestQueue', 'models.jarvis_ai', 'created_at'),
        ]
        
        for log_type, model_name, module_path, timestamp_col in cleanup_configs:
            retention_days = self.retention_days.get(log_type, 90)
            cutoff_date = datetime.utcnow() - timedelta(days=retention_days)
            
            try:
                result = self._cleanup_table(
                    model_name, module_path, timestamp_col, cutoff_date, dry_run
                )
                result['retention_days'] = retention_days
                result['cutoff_date'] = cutoff_date.isoformat()
                results[log_type] = result
            except Exception as e:
                logger.error(f"Failed to cleanup {log_type}: {e}")
                results[log_type] = {'error': str(e)}
        
        return results
    
    def _cleanup_table(
        self,
        model_name: str,
        module_path: str,
        timestamp_col: str,
        cutoff_date: datetime,
        dry_run: bool
    ) -> Dict:
        """Clean up a specific table"""
        try:
            import importlib
            module = importlib.import_module(module_path)
            model_class = getattr(module, model_name)
            
            with db_service.get_session() as session:
                from sqlalchemy import func
                
                timestamp_attr = getattr(model_class, timestamp_col)
                
                to_delete = session.query(func.count(model_class.id)).filter(
                    timestamp_attr < cutoff_date
                ).scalar() or 0
                
                if dry_run:
                    return {
                        'would_delete': to_delete,
                        'dry_run': True
                    }
                
                if to_delete > 0:
                    deleted = session.query(model_class).filter(
                        timestamp_attr < cutoff_date
                    ).delete(synchronize_session='fetch')
                    
                    logger.info(f"Deleted {deleted} old records from {model_name}")
                    
                    return {
                        'deleted': deleted,
                        'dry_run': False
                    }
                
                return {
                    'deleted': 0,
                    'dry_run': False,
                    'message': 'No old records to delete'
                }
        except Exception as e:
            logger.error(f"Cleanup error for {model_name}: {e}")
            raise
    
    def cleanup_expired_cache(self, dry_run: bool = False) -> Dict:
        """
        Clean up expired response cache entries
        
        Args:
            dry_run: If True, only report what would be deleted
            
        Returns:
            Cleanup result
        """
        try:
            from models.jarvis_ai import ResponseCache
            
            with db_service.get_session() as session:
                from sqlalchemy import func
                
                now = datetime.utcnow()
                
                to_delete = session.query(func.count(ResponseCache.id)).filter(
                    ResponseCache.expires_at < now
                ).scalar() or 0
                
                if dry_run:
                    return {
                        'would_delete': to_delete,
                        'dry_run': True
                    }
                
                if to_delete > 0:
                    deleted = session.query(ResponseCache).filter(
                        ResponseCache.expires_at < now
                    ).delete(synchronize_session='fetch')
                    
                    logger.info(f"Deleted {deleted} expired cache entries")
                    
                    return {
                        'deleted': deleted,
                        'dry_run': False
                    }
                
                return {
                    'deleted': 0,
                    'dry_run': False,
                    'message': 'No expired cache entries'
                }
        except Exception as e:
            logger.error(f"Cache cleanup error: {e}")
            return {'error': str(e)}
    
    def cleanup_processed_requests(self, dry_run: bool = False) -> Dict:
        """
        Clean up processed and expired queued requests
        
        Args:
            dry_run: If True, only report what would be deleted
            
        Returns:
            Cleanup result
        """
        try:
            from models.jarvis_ai import RequestQueue
            
            with db_service.get_session() as session:
                from sqlalchemy import func, or_
                
                now = datetime.utcnow()
                
                to_delete = session.query(func.count(RequestQueue.id)).filter(
                    or_(
                        RequestQueue.status.in_(['completed', 'failed']),
                        RequestQueue.expires_at < now
                    )
                ).scalar() or 0
                
                if dry_run:
                    return {
                        'would_delete': to_delete,
                        'dry_run': True
                    }
                
                if to_delete > 0:
                    deleted = session.query(RequestQueue).filter(
                        or_(
                            RequestQueue.status.in_(['completed', 'failed']),
                            RequestQueue.expires_at < now
                        )
                    ).delete(synchronize_session='fetch')
                    
                    logger.info(f"Deleted {deleted} processed/expired queue entries")
                    
                    return {
                        'deleted': deleted,
                        'dry_run': False
                    }
                
                return {
                    'deleted': 0,
                    'dry_run': False,
                    'message': 'No processed requests to delete'
                }
        except Exception as e:
            logger.error(f"Queue cleanup error: {e}")
            return {'error': str(e)}
    
    def run_full_cleanup(self, dry_run: bool = False) -> Dict:
        """
        Run full cleanup across all log types
        
        Args:
            dry_run: If True, only report what would be deleted
            
        Returns:
            Full cleanup report
        """
        logger.info(f"Starting {'dry-run ' if dry_run else ''}full log cleanup")
        
        results = {
            'started_at': datetime.utcnow().isoformat(),
            'dry_run': dry_run,
            'logs': self.cleanup_old_logs(dry_run),
            'cache': self.cleanup_expired_cache(dry_run),
            'queue': self.cleanup_processed_requests(dry_run),
            'completed_at': datetime.utcnow().isoformat()
        }
        
        total_deleted = 0
        for log_type, result in results.get('logs', {}).items():
            if isinstance(result, dict):
                total_deleted += result.get('deleted', 0) or result.get('would_delete', 0)
        
        if isinstance(results.get('cache'), dict):
            total_deleted += results['cache'].get('deleted', 0) or results['cache'].get('would_delete', 0)
        
        if isinstance(results.get('queue'), dict):
            total_deleted += results['queue'].get('deleted', 0) or results['queue'].get('would_delete', 0)
        
        results['total_records'] = total_deleted
        
        logger.info(f"Cleanup {'would affect' if dry_run else 'affected'} {total_deleted} total records")
        
        return results
    
    def get_retention_report(self) -> Dict:
        """
        Generate a comprehensive retention report
        
        Returns:
            Report with log counts, retention policies, and recommendations
        """
        counts = self.get_log_counts()
        
        report = {
            'generated_at': datetime.utcnow().isoformat(),
            'retention_policies': self.retention_days,
            'log_counts': counts,
            'recommendations': []
        }
        
        for log_type, count_data in counts.items():
            if isinstance(count_data, dict) and 'total' in count_data:
                total = count_data.get('total', 0)
                older_than_30d = count_data.get('older_than_30d', 0)
                
                if total > 100000:
                    report['recommendations'].append({
                        'log_type': log_type,
                        'issue': 'High volume',
                        'current_count': total,
                        'suggestion': f'Consider reducing retention from {self.retention_days.get(log_type, 90)} days'
                    })
                
                if older_than_30d > total * 0.7:
                    report['recommendations'].append({
                        'log_type': log_type,
                        'issue': 'Many old records',
                        'old_records': older_than_30d,
                        'suggestion': 'Consider running cleanup'
                    })
        
        return report


log_retention_service = LogRetentionService()

__all__ = ['LogRetentionService', 'log_retention_service']
