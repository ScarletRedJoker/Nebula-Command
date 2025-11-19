"""
Service Operations API Routes
Provides REST API for service monitoring and management
"""

from flask import Blueprint, jsonify, request
from services.service_ops import service_ops
from config import Config
import logging

logger = logging.getLogger(__name__)

service_ops_bp = Blueprint('service_ops', __name__, url_prefix='/api/services')


@service_ops_bp.route('/status', methods=['GET'])
def get_all_statuses():
    """
    GET /api/services/status
    Get current status of all configured services
    
    Returns:
        JSON array of service status objects
    """
    try:
        statuses = service_ops.get_all_service_statuses()
        return jsonify({
            'success': True,
            'services': statuses,
            'count': len(statuses)
        }), 200
    except Exception as e:
        logger.error(f"Error getting service statuses: {e}")
        return jsonify({
            'success': False,
            'error': str(e)
        }), 500


@service_ops_bp.route('/<service_name>/stats', methods=['GET'])
def get_service_stats(service_name):
    """
    GET /api/services/<name>/stats
    Get detailed resource usage statistics for a specific service
    
    Args:
        service_name: Service identifier
        
    Returns:
        JSON object with CPU, memory, network stats
    """
    try:
        # Find container name for service
        container_name = None
        for key, info in Config.SERVICES.items():
            if key == service_name:
                container_name = info.get('container')
                break
        
        if not container_name:
            return jsonify({
                'success': False,
                'error': f'Service {service_name} not found'
            }), 404
        
        stats = service_ops.collect_container_stats(service_name, container_name)
        
        if not stats:
            return jsonify({
                'success': False,
                'error': f'Could not collect stats for {service_name}'
            }), 404
        
        return jsonify({
            'success': True,
            'service': service_name,
            'stats': stats
        }), 200
        
    except Exception as e:
        logger.error(f"Error getting stats for {service_name}: {e}")
        return jsonify({
            'success': False,
            'error': str(e)
        }), 500


@service_ops_bp.route('/<service_name>/restart', methods=['POST'])
def restart_service(service_name):
    """
    POST /api/services/<name>/restart
    Restart a specific service
    
    Args:
        service_name: Service identifier
        
    Returns:
        JSON object with success status
    """
    try:
        # Find container name for service
        container_name = None
        for key, info in Config.SERVICES.items():
            if key == service_name:
                container_name = info.get('container')
                break
        
        if not container_name:
            return jsonify({
                'success': False,
                'error': f'Service {service_name} not found'
            }), 404
        
        logger.info(f"Restart request for service: {service_name} (container: {container_name})")
        result = service_ops.restart_service(service_name, container_name)
        
        status_code = 200 if result.get('success') else 500
        return jsonify(result), status_code
        
    except Exception as e:
        logger.error(f"Error restarting {service_name}: {e}")
        return jsonify({
            'success': False,
            'error': str(e)
        }), 500


@service_ops_bp.route('/<service_name>/logs', methods=['GET'])
def get_service_logs(service_name):
    """
    GET /api/services/<name>/logs
    Get recent logs from a service
    
    Query params:
        lines: Number of log lines to retrieve (default: 50, max: 500)
        
    Returns:
        JSON object with log text
    """
    try:
        # Get lines parameter
        lines = request.args.get('lines', 50, type=int)
        lines = min(lines, 500)  # Cap at 500 lines
        
        # Find container name for service
        container_name = None
        for key, info in Config.SERVICES.items():
            if key == service_name:
                container_name = info.get('container')
                break
        
        if not container_name:
            return jsonify({
                'success': False,
                'error': f'Service {service_name} not found'
            }), 404
        
        logs = service_ops.get_service_logs(container_name, lines=lines)
        
        if logs is None:
            return jsonify({
                'success': False,
                'error': f'Could not retrieve logs for {service_name}'
            }), 404
        
        return jsonify({
            'success': True,
            'service': service_name,
            'logs': logs,
            'lines': lines
        }), 200
        
    except Exception as e:
        logger.error(f"Error getting logs for {service_name}: {e}")
        return jsonify({
            'success': False,
            'error': str(e)
        }), 500


@service_ops_bp.route('/<service_name>/history', methods=['GET'])
def get_service_history(service_name):
    """
    GET /api/services/<name>/history
    Get 24-hour status history for a service
    
    Query params:
        hours: Number of hours to look back (default: 24, max: 168)
        
    Returns:
        JSON array of historical telemetry data
    """
    try:
        # Get hours parameter
        hours = request.args.get('hours', 24, type=int)
        hours = min(hours, 168)  # Cap at 7 days
        
        history = service_ops.get_status_history(service_name, hours=hours)
        
        return jsonify({
            'success': True,
            'service': service_name,
            'history': history,
            'hours': hours,
            'count': len(history)
        }), 200
        
    except Exception as e:
        logger.error(f"Error getting history for {service_name}: {e}")
        return jsonify({
            'success': False,
            'error': str(e)
        }), 500


@service_ops_bp.route('/health-check', methods=['POST'])
def run_health_checks():
    """
    POST /api/services/health-check
    Run health checks on all configured services
    
    Returns:
        JSON object with health check results for all services
    """
    try:
        results = []
        
        for service_key, service_info in Config.SERVICES.items():
            container_name = service_info.get('container')
            if not container_name:
                continue
            
            health = service_ops.execute_health_check(service_key, container_name)
            health['display_name'] = service_info.get('name')
            results.append(health)
        
        # Calculate summary
        healthy_count = sum(1 for r in results if r.get('healthy'))
        total_count = len(results)
        
        return jsonify({
            'success': True,
            'results': results,
            'summary': {
                'total': total_count,
                'healthy': healthy_count,
                'unhealthy': total_count - healthy_count,
                'health_percentage': (healthy_count / total_count * 100) if total_count > 0 else 0
            }
        }), 200
        
    except Exception as e:
        logger.error(f"Error running health checks: {e}")
        return jsonify({
            'success': False,
            'error': str(e)
        }), 500


@service_ops_bp.route('/telemetry', methods=['GET'])
def get_latest_telemetry():
    """
    GET /api/services/telemetry
    Get latest telemetry data for all services
    
    Returns:
        JSON object with latest telemetry for each service
    """
    try:
        telemetry_data = {}
        
        for service_key, service_info in Config.SERVICES.items():
            latest = service_ops.get_latest_telemetry(service_key)
            if latest:
                telemetry_data[service_key] = latest
        
        return jsonify({
            'success': True,
            'telemetry': telemetry_data,
            'count': len(telemetry_data)
        }), 200
        
    except Exception as e:
        logger.error(f"Error getting telemetry: {e}")
        return jsonify({
            'success': False,
            'error': str(e)
        }), 500
