"""
Docker Lifecycle API Routes
Complete Docker container management endpoints
"""
from flask import Blueprint, jsonify, request
from services.docker_service import DockerService
from utils.auth import require_auth
from utils.rbac import require_permission
from models.rbac import Permission
import logging
import re

logger = logging.getLogger(__name__)

docker_bp = Blueprint('docker', __name__, url_prefix='/api/docker')

docker_service = DockerService()

ALLOWED_CONTAINER_NAME_PATTERN = re.compile(r'^[a-zA-Z0-9][a-zA-Z0-9_.-]{0,63}$')


def validate_container_id(container_id: str) -> bool:
    """Validate container ID/name format"""
    if not container_id:
        return False
    if len(container_id) > 64:
        return False
    if ALLOWED_CONTAINER_NAME_PATTERN.match(container_id):
        return True
    if re.match(r'^[a-f0-9]{12,64}$', container_id):
        return True
    return False


def make_response(success: bool, data=None, message=None, status_code=200):
    """Create consistent JSON response"""
    response = {'success': success}
    if data is not None:
        response['data'] = data
    if message is not None:
        response['message'] = message
    return jsonify(response), status_code


@docker_bp.route('/containers', methods=['GET'])
@require_auth
@require_permission(Permission.VIEW_DOCKER)
def list_containers():
    """
    GET /api/docker/containers
    List all Docker containers with status
    
    Query params:
        all: bool - Include stopped containers (default: true)
        status: str - Filter by status (running, stopped, paused)
    
    Returns:
        JSON array of container objects with status
    """
    try:
        show_all = request.args.get('all', 'true').lower() == 'true'
        status_filter = request.args.get('status', None)
        
        containers = docker_service.list_all_containers()
        
        if status_filter:
            containers = [c for c in containers if c.get('status', '').lower() == status_filter.lower()]
        
        enriched_containers = []
        for container in containers:
            container_name = container.get('name', '')
            detailed = docker_service.get_container_status(container_name)
            if detailed:
                enriched_containers.append(detailed)
            else:
                enriched_containers.append(container)
        
        return make_response(True, {
            'containers': enriched_containers,
            'count': len(enriched_containers)
        })
        
    except Exception as e:
        logger.error(f"Error listing containers: {e}")
        return make_response(False, message=str(e), status_code=500)


@docker_bp.route('/containers/<container_id>', methods=['GET'])
@require_auth
@require_permission(Permission.VIEW_DOCKER)
def get_container(container_id):
    """
    GET /api/docker/containers/<id>
    Get detailed status of a specific container
    
    Returns:
        JSON object with container details
    """
    try:
        if not validate_container_id(container_id):
            return make_response(False, message='Invalid container ID format', status_code=400)
        
        container = docker_service.get_container_status(container_id)
        
        if not container:
            return make_response(False, message=f'Container {container_id} not found', status_code=404)
        
        return make_response(True, container)
        
    except Exception as e:
        logger.error(f"Error getting container {container_id}: {e}")
        return make_response(False, message=str(e), status_code=500)


@docker_bp.route('/containers/<container_id>/start', methods=['POST'])
@require_auth
@require_permission(Permission.MANAGE_DOCKER)
def start_container(container_id):
    """
    POST /api/docker/containers/<id>/start
    Start a stopped container
    
    Returns:
        JSON object with operation result
    """
    try:
        if not validate_container_id(container_id):
            return make_response(False, message='Invalid container ID format', status_code=400)
        
        logger.info(f"Starting container: {container_id}")
        result = docker_service.start_container(container_id)
        
        if result.get('success'):
            return make_response(True, message=result.get('message'))
        else:
            return make_response(False, message=result.get('message'), status_code=400)
            
    except Exception as e:
        logger.error(f"Error starting container {container_id}: {e}")
        return make_response(False, message=str(e), status_code=500)


@docker_bp.route('/containers/<container_id>/stop', methods=['POST'])
@require_auth
@require_permission(Permission.MANAGE_DOCKER)
def stop_container(container_id):
    """
    POST /api/docker/containers/<id>/stop
    Stop a running container
    
    Query params:
        timeout: int - Seconds to wait before killing (default: 10)
    
    Returns:
        JSON object with operation result
    """
    try:
        if not validate_container_id(container_id):
            return make_response(False, message='Invalid container ID format', status_code=400)
        
        logger.info(f"Stopping container: {container_id}")
        result = docker_service.stop_container(container_id)
        
        if result.get('success'):
            return make_response(True, message=result.get('message'))
        else:
            return make_response(False, message=result.get('message'), status_code=400)
            
    except Exception as e:
        logger.error(f"Error stopping container {container_id}: {e}")
        return make_response(False, message=str(e), status_code=500)


@docker_bp.route('/containers/<container_id>/restart', methods=['POST'])
@require_auth
@require_permission(Permission.MANAGE_DOCKER)
def restart_container(container_id):
    """
    POST /api/docker/containers/<id>/restart
    Restart a container
    
    Query params:
        timeout: int - Seconds to wait before killing (default: 10)
    
    Returns:
        JSON object with operation result
    """
    try:
        if not validate_container_id(container_id):
            return make_response(False, message='Invalid container ID format', status_code=400)
        
        logger.info(f"Restarting container: {container_id}")
        result = docker_service.restart_container(container_id)
        
        if result.get('success'):
            return make_response(True, message=result.get('message'))
        else:
            return make_response(False, message=result.get('message'), status_code=400)
            
    except Exception as e:
        logger.error(f"Error restarting container {container_id}: {e}")
        return make_response(False, message=str(e), status_code=500)


@docker_bp.route('/logs/<container_id>', methods=['GET'])
@require_auth
@require_permission(Permission.VIEW_LOGS)
def get_container_logs(container_id):
    """
    GET /api/docker/logs/<id>
    Get logs from a container
    
    Query params:
        lines: int - Number of lines to retrieve (default: 100, max: 1000)
        since: str - Show logs since timestamp (e.g., 2023-01-01T00:00:00)
        follow: bool - Stream logs (not supported via REST, use WebSocket)
    
    Returns:
        JSON object with log text
    """
    try:
        if not validate_container_id(container_id):
            return make_response(False, message='Invalid container ID format', status_code=400)
        
        lines = request.args.get('lines', 100, type=int)
        lines = min(lines, 1000)
        
        logs = docker_service.get_container_logs(container_id, lines=lines)
        
        if logs is None:
            return make_response(False, message=f'Could not retrieve logs for {container_id}', status_code=404)
        
        log_lines = logs.split('\n') if logs else []
        
        return make_response(True, {
            'container_id': container_id,
            'logs': logs,
            'lines': len(log_lines),
            'requested_lines': lines
        })
        
    except Exception as e:
        logger.error(f"Error getting logs for {container_id}: {e}")
        return make_response(False, message=str(e), status_code=500)


@docker_bp.route('/stats', methods=['GET'])
@require_auth
@require_permission(Permission.VIEW_DOCKER)
def get_resource_stats():
    """
    GET /api/docker/stats
    Get resource usage statistics for all containers
    
    Returns:
        JSON object with aggregated stats
    """
    try:
        containers = docker_service.list_all_containers()
        
        stats = []
        total_cpu = 0.0
        total_memory_mb = 0.0
        running_count = 0
        stopped_count = 0
        
        for container in containers:
            container_name = container.get('name', '')
            detailed = docker_service.get_container_status(container_name)
            
            if detailed:
                is_running = detailed.get('status') == 'running'
                if is_running:
                    running_count += 1
                    total_cpu += detailed.get('cpu_percent', 0)
                    total_memory_mb += detailed.get('memory_usage_mb', 0)
                else:
                    stopped_count += 1
                
                stats.append({
                    'name': detailed.get('name'),
                    'id': detailed.get('id'),
                    'status': detailed.get('status'),
                    'cpu_percent': detailed.get('cpu_percent', 0),
                    'memory_usage_mb': detailed.get('memory_usage_mb', 0),
                    'memory_limit_mb': detailed.get('memory_limit_mb', 0),
                    'memory_percent': detailed.get('memory_percent', 0)
                })
        
        return make_response(True, {
            'containers': stats,
            'summary': {
                'total': len(containers),
                'running': running_count,
                'stopped': stopped_count,
                'total_cpu_percent': round(total_cpu, 2),
                'total_memory_mb': round(total_memory_mb, 2)
            }
        })
        
    except Exception as e:
        logger.error(f"Error getting resource stats: {e}")
        return make_response(False, message=str(e), status_code=500)


@docker_bp.route('/stats/<container_id>', methods=['GET'])
@require_auth
@require_permission(Permission.VIEW_DOCKER)
def get_container_stats(container_id):
    """
    GET /api/docker/stats/<id>
    Get resource usage for a specific container
    
    Returns:
        JSON object with container resource usage
    """
    try:
        if not validate_container_id(container_id):
            return make_response(False, message='Invalid container ID format', status_code=400)
        
        detailed = docker_service.get_container_status(container_id)
        
        if not detailed:
            return make_response(False, message=f'Container {container_id} not found', status_code=404)
        
        return make_response(True, {
            'container': {
                'name': detailed.get('name'),
                'id': detailed.get('id'),
                'status': detailed.get('status'),
                'cpu_percent': detailed.get('cpu_percent', 0),
                'memory_usage_mb': detailed.get('memory_usage_mb', 0),
                'memory_limit_mb': detailed.get('memory_limit_mb', 0),
                'memory_percent': detailed.get('memory_percent', 0),
                'ports': detailed.get('ports', {}),
                'image': detailed.get('image'),
                'created': detailed.get('created')
            }
        })
        
    except Exception as e:
        logger.error(f"Error getting stats for {container_id}: {e}")
        return make_response(False, message=str(e), status_code=500)


__all__ = ['docker_bp']
