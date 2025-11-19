"""
Service Operations - Quick Actions and Monitoring
Handles real-time service health checks, telemetry collection, and management operations
"""

import logging
from typing import Dict, List, Optional
from datetime import datetime, timedelta
from services.docker_service import DockerService
from models.service_ops import ServiceTelemetry
from services.db_service import db_service
from config import Config
from sqlalchemy import and_

logger = logging.getLogger(__name__)


class ServiceOpsService:
    """Service operations manager for Docker containers"""
    
    def __init__(self):
        self.docker = DockerService()
        self.config = Config()
    
    def collect_container_stats(self, service_name: str, container_name: str) -> Optional[Dict]:
        """
        Collect comprehensive Docker container statistics
        
        Args:
            service_name: Logical service name
            container_name: Docker container name
            
        Returns:
            Dict with CPU, memory, network stats or None if container not found
        """
        try:
            status = self.docker.get_container_status(container_name)
            if not status:
                logger.warning(f"Container {container_name} not found")
                return None
            
            # Extract stats
            stats = {
                'service_name': service_name,
                'container_id': status.get('id'),
                'status': status.get('status', 'unknown'),
                'cpu_percent': status.get('cpu_percent', 0.0),
                'memory_usage': int(status.get('memory_usage_mb', 0) * 1024 * 1024),  # Convert to bytes
                'memory_limit': int(status.get('memory_limit_mb', 0) * 1024 * 1024),  # Convert to bytes
                'health_status': self._determine_health_status(status),
                'uptime_seconds': self._calculate_uptime(status.get('state', {})),
                'restart_count': status.get('state', {}).get('RestartCount', 0),
                'metadata': {
                    'image': status.get('image'),
                    'ports': status.get('ports', {}),
                    'labels': status.get('labels', {})
                }
            }
            
            return stats
            
        except Exception as e:
            logger.error(f"Error collecting stats for {container_name}: {e}")
            return None
    
    def execute_health_check(self, service_name: str, container_name: str) -> Dict:
        """
        Execute comprehensive health check on a service
        
        Returns:
            Dict with health status and details
        """
        try:
            status = self.docker.get_container_status(container_name)
            if not status:
                return {
                    'service_name': service_name,
                    'healthy': False,
                    'status': 'not_found',
                    'message': f'Container {container_name} not found'
                }
            
            is_running = status.get('status') == 'running'
            health_status = self._determine_health_status(status)
            
            return {
                'service_name': service_name,
                'healthy': is_running and health_status == 'healthy',
                'status': status.get('status'),
                'health_status': health_status,
                'cpu_percent': status.get('cpu_percent', 0),
                'memory_percent': status.get('memory_percent', 0),
                'uptime_seconds': self._calculate_uptime(status.get('state', {})),
                'restart_count': status.get('state', {}).get('RestartCount', 0),
                'message': 'Service is healthy' if is_running else f'Service is {status.get("status")}'
            }
            
        except Exception as e:
            logger.error(f"Health check failed for {service_name}: {e}")
            return {
                'service_name': service_name,
                'healthy': False,
                'status': 'error',
                'message': str(e)
            }
    
    def restart_service(self, service_name: str, container_name: str) -> Dict:
        """
        Restart a Docker container service
        
        Returns:
            Dict with success status and message
        """
        try:
            logger.info(f"Restarting service {service_name} (container: {container_name})")
            result = self.docker.restart_container(container_name)
            
            if result.get('success'):
                logger.info(f"Successfully restarted {service_name}")
            else:
                logger.error(f"Failed to restart {service_name}: {result.get('message')}")
            
            return result
            
        except Exception as e:
            logger.error(f"Error restarting {service_name}: {e}")
            return {'success': False, 'message': str(e)}
    
    def get_service_logs(self, container_name: str, lines: int = 50) -> Optional[str]:
        """
        Get recent logs from a container
        
        Args:
            container_name: Docker container name
            lines: Number of log lines to retrieve (default: 50)
            
        Returns:
            Log string or None if error
        """
        try:
            logs = self.docker.get_container_logs(container_name, lines=lines)
            return logs
        except Exception as e:
            logger.error(f"Error getting logs for {container_name}: {e}")
            return None
    
    def get_status_history(self, service_name: str, hours: int = 24) -> List[Dict]:
        """
        Get service status history from telemetry data
        
        Args:
            service_name: Service name
            hours: Number of hours to look back (default: 24)
            
        Returns:
            List of telemetry records
        """
        try:
            session = db_service.get_session()
            cutoff_time = datetime.utcnow() - timedelta(hours=hours)
            
            records = session.query(ServiceTelemetry).filter(
                and_(
                    ServiceTelemetry.service_name == service_name,
                    ServiceTelemetry.timestamp >= cutoff_time
                )
            ).order_by(ServiceTelemetry.timestamp.desc()).all()
            
            session.close()
            
            return [record.to_dict() for record in records]
            
        except Exception as e:
            logger.error(f"Error getting status history for {service_name}: {e}")
            return []
    
    def store_telemetry(self, service_name: str, container_name: str) -> bool:
        """
        Collect and store telemetry data for a service
        
        Returns:
            True if successful, False otherwise
        """
        try:
            stats = self.collect_container_stats(service_name, container_name)
            if not stats:
                return False
            
            session = db_service.get_session()
            
            telemetry = ServiceTelemetry(
                service_name=stats['service_name'],
                container_id=stats['container_id'],
                status=stats['status'],
                cpu_percent=stats['cpu_percent'],
                memory_usage=stats['memory_usage'],
                memory_limit=stats['memory_limit'],
                health_status=stats['health_status'],
                uptime_seconds=stats['uptime_seconds'],
                restart_count=stats['restart_count'],
                service_metadata=stats['metadata']
            )
            
            session.add(telemetry)
            session.commit()
            session.close()
            
            logger.debug(f"Stored telemetry for {service_name}")
            return True
            
        except Exception as e:
            logger.error(f"Error storing telemetry for {service_name}: {e}")
            return False
    
    def get_all_service_statuses(self) -> List[Dict]:
        """
        Get current status of all configured services
        
        Returns:
            List of service status dicts
        """
        statuses = []
        
        for service_key, service_info in self.config.SERVICES.items():
            container_name = service_info.get('container')
            if not container_name:
                continue
            
            health_check = self.execute_health_check(service_key, container_name)
            health_check['url'] = service_info.get('url')
            health_check['description'] = service_info.get('description')
            health_check['favicon'] = service_info.get('favicon')
            health_check['display_name'] = service_info.get('name')
            
            statuses.append(health_check)
        
        return statuses
    
    def get_latest_telemetry(self, service_name: str) -> Optional[Dict]:
        """
        Get the most recent telemetry record for a service
        
        Returns:
            Telemetry dict or None
        """
        try:
            session = db_service.get_session()
            
            record = session.query(ServiceTelemetry).filter(
                ServiceTelemetry.service_name == service_name
            ).order_by(ServiceTelemetry.timestamp.desc()).first()
            
            session.close()
            
            return record.to_dict() if record else None
            
        except Exception as e:
            logger.error(f"Error getting latest telemetry for {service_name}: {e}")
            return None
    
    def _determine_health_status(self, container_status: Dict) -> str:
        """
        Determine container health status from Docker inspect data
        
        Returns:
            'healthy', 'unhealthy', 'starting', or 'unknown'
        """
        state = container_status.get('state', {})
        
        # Check if container is running
        if not state.get('Running', False):
            return 'unhealthy'
        
        # Check Docker health status if available
        health = state.get('Health', {})
        if health:
            docker_health = health.get('Status', '').lower()
            if docker_health == 'healthy':
                return 'healthy'
            elif docker_health == 'unhealthy':
                return 'unhealthy'
            elif docker_health == 'starting':
                return 'starting'
        
        # If no health check defined, consider running = healthy
        if state.get('Running'):
            return 'healthy'
        
        return 'unknown'
    
    def _calculate_uptime(self, state: Dict) -> int:
        """
        Calculate container uptime in seconds
        
        Returns:
            Uptime in seconds
        """
        try:
            started_at = state.get('StartedAt')
            if not started_at or started_at == '0001-01-01T00:00:00Z':
                return 0
            
            # Parse ISO format datetime
            start_time = datetime.fromisoformat(started_at.replace('Z', '+00:00'))
            uptime = (datetime.now(start_time.tzinfo) - start_time).total_seconds()
            
            return int(max(0, uptime))
            
        except Exception as e:
            logger.debug(f"Error calculating uptime: {e}")
            return 0


# Global instance
service_ops = ServiceOpsService()
