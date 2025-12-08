"""Celery Periodic Tasks for Autonomous Operations"""
from celery import shared_task
from celery.schedules import crontab
import logging
import time
from datetime import datetime

from services.dashboard.services.autonomous_monitor import AutonomousMonitor
from services.dashboard.services.continuous_optimizer import ContinuousOptimizer
from services.dashboard.services.autonomous_security import AutonomousSecurity
from services.dashboard.services.jarvis_remediator import jarvis_remediator

logger = logging.getLogger(__name__)


# Initialize autonomous services
autonomous_monitor = AutonomousMonitor()
continuous_optimizer = ContinuousOptimizer()
autonomous_security = AutonomousSecurity()

# In-memory cache to track last remediation time per service
# Format: { 'service_name': timestamp_of_last_remediation }
_remediation_cache = {}
REMEDIATION_COOLDOWN_SECONDS = 30 * 60  # 30 minutes


@shared_task(name='autonomous.health_check')
def autonomous_health_check():
    """
    Quick health check - runs every 2 minutes
    Checks critical systems and creates immediate alerts
    """
    logger.info("Running autonomous health check...")
    
    try:
        summary = autonomous_monitor.get_system_summary()
        logger.info(f"System summary: {summary}")
        return {
            'success': True,
            'summary': summary
        }
    except Exception as e:
        logger.error(f"Health check failed: {e}", exc_info=True)
        return {
            'success': False,
            'error': str(e)
        }


@shared_task(name='autonomous.monitoring')
def autonomous_monitoring_task():
    """
    Comprehensive monitoring - runs every 5 minutes
    Performs deep health checks and creates repair tasks
    """
    logger.info("Running autonomous monitoring task...")
    
    try:
        results = autonomous_monitor.run_health_check()
        
        issues_count = len(results.get('issues_detected', []))
        tasks_count = len(results.get('tasks_created', []))
        
        logger.info(f"Monitoring complete. Issues: {issues_count}, Tasks created: {tasks_count}")
        
        return {
            'success': True,
            'issues_detected': issues_count,
            'tasks_created': tasks_count,
            'timestamp': results.get('timestamp')
        }
    except Exception as e:
        logger.error(f"Autonomous monitoring failed: {e}", exc_info=True)
        return {
            'success': False,
            'error': str(e)
        }


@shared_task(name='autonomous.optimization')
def autonomous_optimization_task():
    """
    Performance optimization - runs every 30 minutes
    Analyzes system performance and suggests improvements
    """
    logger.info("Running autonomous optimization task...")
    
    try:
        results = continuous_optimizer.run_optimization_analysis()
        
        recommendations_count = len(results.get('recommendations', []))
        
        logger.info(f"Optimization analysis complete. Recommendations: {recommendations_count}")
        
        return {
            'success': True,
            'recommendations': recommendations_count,
            'efficiency_score': results.get('resource_optimization', {}).get('efficiency_score', 0),
            'timestamp': results.get('timestamp')
        }
    except Exception as e:
        logger.error(f"Autonomous optimization failed: {e}", exc_info=True)
        return {
            'success': False,
            'error': str(e)
        }


@shared_task(name='autonomous.security_scan')
def autonomous_security_scan_task():
    """
    Security scanning - runs every hour
    Scans for vulnerabilities and security issues
    """
    logger.info("Running autonomous security scan...")
    
    try:
        results = autonomous_security.run_security_scan()
        
        security_issues = len(results.get('security_issues', []))
        
        logger.info(f"Security scan complete. Issues: {security_issues}")
        
        return {
            'success': True,
            'security_issues': security_issues,
            'timestamp': results.get('timestamp')
        }
    except Exception as e:
        logger.error(f"Autonomous security scan failed: {e}", exc_info=True)
        return {
            'success': False,
            'error': str(e)
        }


@shared_task(name='autonomous.efficiency_report')
def autonomous_efficiency_report():
    """
    Generate efficiency trends report - runs daily
    Analyzes performance trends over time
    """
    logger.info("Generating efficiency trends report...")
    
    try:
        trends = continuous_optimizer.get_efficiency_trends()
        
        logger.info(f"Efficiency trends: {trends}")
        
        return {
            'success': True,
            'trends': trends
        }
    except Exception as e:
        logger.error(f"Efficiency report failed: {e}", exc_info=True)
        return {
            'success': False,
            'error': str(e)
        }


@shared_task(name='autonomous.security_summary')
def autonomous_security_summary():
    """
    Generate security summary - runs daily
    Provides overview of security posture
    """
    logger.info("Generating security summary...")
    
    try:
        summary = autonomous_security.get_security_summary()
        
        logger.info(f"Security summary: {summary}")
        
        return {
            'success': True,
            'summary': summary
        }
    except Exception as e:
        logger.error(f"Security summary failed: {e}", exc_info=True)
        return {
            'success': False,
            'error': str(e)
        }


@shared_task(name='autonomous.self_heal')
def autonomous_self_heal():
    """
    Self-healing task - runs every 10 minutes
    Detects service failures and automatically remediates critical/high severity issues
    Prevents repeated remediation within 30 minutes per service
    """
    logger.info("Running autonomous self-heal task...")
    
    global _remediation_cache
    current_time = time.time()
    
    remediations_attempted = []
    remediations_skipped = []
    
    try:
        failures = jarvis_remediator.detect_failures()
        
        if not failures:
            logger.info("No service failures detected")
            return {
                'success': True,
                'failures_detected': 0,
                'remediations_attempted': 0,
                'remediations_skipped': 0,
                'details': [],
                'timestamp': datetime.utcnow().isoformat()
            }
        
        logger.info(f"Detected {len(failures)} service failures")
        
        for failure in failures:
            service_name = failure.get('service_name')
            severity = failure.get('severity', 'low')
            
            if severity not in ('critical', 'high'):
                logger.info(f"Skipping {service_name} - severity '{severity}' not critical/high")
                remediations_skipped.append({
                    'service_name': service_name,
                    'severity': severity,
                    'reason': 'Severity not critical or high'
                })
                continue
            
            last_remediation = _remediation_cache.get(service_name, 0)
            time_since_last = current_time - last_remediation
            
            if time_since_last < REMEDIATION_COOLDOWN_SECONDS:
                remaining_cooldown = int(REMEDIATION_COOLDOWN_SECONDS - time_since_last)
                logger.info(f"Skipping {service_name} - remediated {int(time_since_last)}s ago, cooldown {remaining_cooldown}s remaining")
                remediations_skipped.append({
                    'service_name': service_name,
                    'severity': severity,
                    'reason': f'Remediated recently, {remaining_cooldown}s cooldown remaining'
                })
                continue
            
            logger.info(f"Auto-remediating {service_name} (severity: {severity})")
            
            try:
                result = jarvis_remediator.execute_remediation(service_name)
                
                _remediation_cache[service_name] = current_time
                
                remediation_summary = {
                    'service_name': service_name,
                    'severity': severity,
                    'success': result.get('success', False),
                    'actions_count': result.get('actions_count', 0),
                    'health_after': result.get('health_after', {}).get('healthy', False),
                    'remediation_id': result.get('remediation_id'),
                    'completed_at': result.get('completed_at')
                }
                remediations_attempted.append(remediation_summary)
                
                if result.get('success'):
                    logger.info(f"Successfully remediated {service_name}")
                else:
                    logger.warning(f"Remediation of {service_name} completed but service still unhealthy")
                    
            except Exception as e:
                logger.error(f"Failed to remediate {service_name}: {e}", exc_info=True)
                remediations_attempted.append({
                    'service_name': service_name,
                    'severity': severity,
                    'success': False,
                    'error': str(e)
                })
        
        return {
            'success': True,
            'failures_detected': len(failures),
            'remediations_attempted': len(remediations_attempted),
            'remediations_skipped': len(remediations_skipped),
            'attempted_details': remediations_attempted,
            'skipped_details': remediations_skipped,
            'timestamp': datetime.utcnow().isoformat()
        }
        
    except Exception as e:
        logger.error(f"Autonomous self-heal failed: {e}", exc_info=True)
        return {
            'success': False,
            'error': str(e),
            'timestamp': datetime.utcnow().isoformat()
        }


# Celery Beat schedule configuration
# Add this to your celery_app configuration
AUTONOMOUS_BEAT_SCHEDULE = {
    'health-check-every-2-minutes': {
        'task': 'autonomous.health_check',
        'schedule': 120.0,  # Every 2 minutes
    },
    'monitoring-every-5-minutes': {
        'task': 'autonomous.monitoring',
        'schedule': 300.0,  # Every 5 minutes
    },
    'optimization-every-30-minutes': {
        'task': 'autonomous.optimization',
        'schedule': 1800.0,  # Every 30 minutes
    },
    'security-scan-every-hour': {
        'task': 'autonomous.security_scan',
        'schedule': 3600.0,  # Every hour
    },
    'efficiency-report-daily': {
        'task': 'autonomous.efficiency_report',
        'schedule': crontab(hour=2, minute=0),  # Daily at 2 AM
    },
    'security-summary-daily': {
        'task': 'autonomous.security_summary',
        'schedule': crontab(hour=3, minute=0),  # Daily at 3 AM
    },
    'self-heal-every-10-minutes': {
        'task': 'autonomous.self_heal',
        'schedule': 600.0,  # Every 10 minutes
    },
}


__all__ = [
    'autonomous_health_check',
    'autonomous_monitoring_task',
    'autonomous_optimization_task',
    'autonomous_security_scan_task',
    'autonomous_efficiency_report',
    'autonomous_security_summary',
    'autonomous_self_heal',
    'AUTONOMOUS_BEAT_SCHEDULE'
]
