"""
Remediation API Routes - Expose JarvisRemediator functionality via REST API
AI-powered service remediation with automatic detection, diagnosis, and fixes
"""
from flask import Blueprint, jsonify, request
from services.jarvis_remediator import JarvisRemediator
from utils.auth import require_auth
from utils.rbac import require_permission
from models.rbac import Permission
import logging

logger = logging.getLogger(__name__)

remediation_bp = Blueprint('remediation', __name__)

jarvis_remediator = JarvisRemediator()


def make_response(success: bool, data=None, message=None, status_code=200):
    """Create consistent JSON response"""
    response = {'success': success}
    if data is not None:
        response['data'] = data
    if message is not None:
        response['message'] = message
    return jsonify(response), status_code


@remediation_bp.route('/api/remediation/failures', methods=['GET'])
@require_auth
@require_permission(Permission.MANAGE_DOCKER)
def get_failures():
    """
    GET /api/remediation/failures
    Detect current service failures
    
    Returns:
        JSON object with list of unhealthy services and severity
    """
    try:
        failures = jarvis_remediator.detect_failures()
        
        return make_response(True, {
            'failures': failures,
            'count': len(failures),
            'has_critical': any(f.get('severity') == 'critical' for f in failures),
            'has_high': any(f.get('severity') == 'high' for f in failures)
        }, message=f'Detected {len(failures)} service failures' if failures else 'All services healthy')
        
    except Exception as e:
        logger.error(f"Error detecting failures: {e}")
        return make_response(False, message=str(e), status_code=500)


@remediation_bp.route('/api/remediation/diagnose/<service_name>', methods=['POST'])
@require_auth
@require_permission(Permission.MANAGE_DOCKER)
def diagnose_service(service_name):
    """
    POST /api/remediation/diagnose/<service_name>
    Perform AI-powered diagnosis of a service issue
    
    Args:
        service_name: Name of the service to diagnose
        
    Returns:
        JSON object with AI diagnosis, health status, and recommendations
    """
    try:
        result = jarvis_remediator.diagnose_service(service_name)
        
        if not result.get('success'):
            return make_response(False, message=result.get('error', 'Diagnosis failed'), status_code=400)
        
        return make_response(True, {
            'service_name': result.get('service_name'),
            'health': result.get('health'),
            'stats': result.get('stats'),
            'diagnosis': result.get('diagnosis'),
            'logs_analyzed': result.get('logs_analyzed'),
            'diagnosed_at': result.get('diagnosed_at')
        }, message='Diagnosis completed')
        
    except Exception as e:
        logger.error(f"Error diagnosing service {service_name}: {e}")
        return make_response(False, message=str(e), status_code=500)


@remediation_bp.route('/api/remediation/plan/<service_name>', methods=['POST'])
@require_auth
@require_permission(Permission.MANAGE_DOCKER)
def generate_plan(service_name):
    """
    POST /api/remediation/plan/<service_name>
    Generate AI-powered remediation plan for a service
    
    Args:
        service_name: Name of the service
        
    Request body (optional):
        {
            "issue_description": "Optional description of the issue"
        }
        
    Returns:
        JSON object with AI-generated remediation plan
    """
    try:
        data = request.get_json() or {}
        issue_description = data.get('issue_description')
        
        result = jarvis_remediator.generate_remediation_plan(service_name, issue_description)
        
        if not result.get('success'):
            return make_response(False, message=result.get('error', 'Plan generation failed'), status_code=400)
        
        return make_response(True, {
            'service_name': result.get('service_name'),
            'plan': result.get('plan'),
            'diagnosis': result.get('diagnosis'),
            'generated_at': result.get('generated_at')
        }, message='Remediation plan generated')
        
    except Exception as e:
        logger.error(f"Error generating remediation plan for {service_name}: {e}")
        return make_response(False, message=str(e), status_code=500)


@remediation_bp.route('/api/remediation/execute/<service_name>', methods=['POST'])
@require_auth
@require_permission(Permission.MANAGE_DOCKER)
def execute_remediation(service_name):
    """
    POST /api/remediation/execute/<service_name>
    Execute remediation plan for a service
    
    Args:
        service_name: Name of the service
        
    Request body (optional):
        {
            "plan": { ... },  // Optional pre-generated plan
            "dry_run": false  // If true, simulate actions without executing
        }
        
    Returns:
        JSON object with execution results
    """
    try:
        data = request.get_json() or {}
        plan = data.get('plan')
        dry_run = data.get('dry_run', False)
        
        logger.info(f"[Jarvis] Executing remediation for {service_name} (dry_run={dry_run})")
        
        result = jarvis_remediator.execute_remediation(service_name, plan, dry_run)
        
        if not result.get('success'):
            return make_response(False, {
                'service_name': result.get('service_name'),
                'dry_run': result.get('dry_run'),
                'plan': result.get('plan'),
                'actions_taken': result.get('actions_taken'),
                'health_after': result.get('health_after'),
                'remediation_id': result.get('remediation_id'),
                'completed_at': result.get('completed_at')
            }, message=result.get('error', 'Remediation failed'), status_code=400)
        
        return make_response(True, {
            'service_name': result.get('service_name'),
            'dry_run': result.get('dry_run'),
            'plan': result.get('plan'),
            'actions_taken': result.get('actions_taken'),
            'actions_count': result.get('actions_count'),
            'health_after': result.get('health_after'),
            'remediation_id': result.get('remediation_id'),
            'completed_at': result.get('completed_at')
        }, message='Remediation executed successfully' if not dry_run else 'Dry run completed')
        
    except Exception as e:
        logger.error(f"Error executing remediation for {service_name}: {e}")
        return make_response(False, message=str(e), status_code=500)


@remediation_bp.route('/api/remediation/history', methods=['GET'])
@require_auth
@require_permission(Permission.MANAGE_DOCKER)
def get_history():
    """
    GET /api/remediation/history
    Get remediation history for services
    
    Query params:
        service_name: Optional service name filter
        limit: Maximum number of records (default: 10)
        
    Returns:
        JSON object with list of past remediations
    """
    try:
        service_name = request.args.get('service_name')
        limit = request.args.get('limit', 10, type=int)
        
        if limit < 1:
            limit = 1
        elif limit > 100:
            limit = 100
        
        history = jarvis_remediator.get_remediation_history(service_name, limit)
        
        return make_response(True, {
            'history': history,
            'count': len(history),
            'service_name': service_name,
            'limit': limit
        }, message=f'Retrieved {len(history)} remediation records')
        
    except Exception as e:
        logger.error(f"Error getting remediation history: {e}")
        return make_response(False, message=str(e), status_code=500)
