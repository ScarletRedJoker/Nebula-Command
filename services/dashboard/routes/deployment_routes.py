"""Deployment Executor API routes - Jarvis deployment system"""
from flask import Blueprint, request, jsonify
from jarvis.deployment_executor import DeploymentExecutor
from models.jarvis import Project
from services.db_service import db_service
import logging

logger = logging.getLogger(__name__)

# Use different blueprint name to avoid conflict with existing deployment_api
jarvis_deployment_bp = Blueprint('jarvis_deployments', __name__, url_prefix='/api/jarvis/deployments')
executor = DeploymentExecutor()


@jarvis_deployment_bp.route('/deploy', methods=['POST'])
def create_deployment():
    """Create a new Jarvis deployment
    
    Request body:
        project_id: UUID of the project
        image_ref: Docker image reference
        domain: Optional domain for reverse proxy
        container_port: Port inside container (default: 80)
        host_port: Port on host (None = use Caddy)
        environment: Optional environment variables dict
        strategy: Deployment strategy (rolling, blue-green, recreate)
        
    Returns:
        JSON with deployment details
    """
    try:
        data = request.json
        if not data:
            return jsonify({'error': 'Request body is required'}), 400
            
        project_id = data.get('project_id')
        image_ref = data.get('image_ref')
        domain = data.get('domain')
        container_port = data.get('container_port', 80)
        host_port = data.get('host_port')
        environment = data.get('environment', {})
        strategy = data.get('strategy', 'rolling')
        
        if not project_id or not image_ref:
            return jsonify({'error': 'project_id and image_ref are required'}), 400
        
        # Verify project exists
        with db_service.get_session() as session:
            project = session.query(Project).filter_by(id=project_id).first()
            if not project:
                return jsonify({'error': 'Project not found'}), 404
        
        # Pass project_id instead of ORM object to avoid detached instance errors
        deployment = executor.create_deployment(
            project_id=project_id,
            image_ref=image_ref,
            domain=domain,
            container_port=container_port,
            host_port=host_port,
            environment=environment,
            strategy=strategy
        )
        
        logger.info(f"Created deployment {deployment.id} for project {project_id}")
        return jsonify(deployment.to_dict()), 201
        
    except ValueError as e:
        logger.error(f"Validation error: {e}")
        return jsonify({'error': str(e)}), 400
    except Exception as e:
        logger.error(f"Error creating deployment: {e}")
        return jsonify({'error': str(e)}), 500


@jarvis_deployment_bp.route('/<deployment_id>/stop', methods=['POST'])
def stop_deployment(deployment_id):
    """Stop a running deployment
    
    Args:
        deployment_id: UUID of the deployment
        
    Returns:
        JSON with status
    """
    try:
        executor.stop_deployment(deployment_id)
        logger.info(f"Stopped deployment {deployment_id}")
        return jsonify({'status': 'stopped', 'deployment_id': deployment_id}), 200
        
    except ValueError as e:
        logger.error(f"Deployment not found: {e}")
        return jsonify({'error': str(e)}), 404
    except Exception as e:
        logger.error(f"Error stopping deployment: {e}")
        return jsonify({'error': str(e)}), 500


@jarvis_deployment_bp.route('/<deployment_id>/logs', methods=['GET'])
def get_logs(deployment_id):
    """Get deployment logs
    
    Args:
        deployment_id: UUID of the deployment
        
    Query params:
        tail: Number of log lines to return (default: 100)
        
    Returns:
        JSON with logs
    """
    try:
        tail = request.args.get('tail', 100, type=int)
        
        logs = executor.get_deployment_logs(deployment_id, tail)
        return jsonify({
            'logs': logs,
            'deployment_id': deployment_id,
            'tail': tail
        }), 200
        
    except Exception as e:
        logger.error(f"Error getting deployment logs: {e}")
        return jsonify({'error': str(e)}), 500
