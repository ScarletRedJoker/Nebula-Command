"""Artifact Builder API routes"""
import logging
from flask import Blueprint, request, jsonify, session
from functools import wraps

from jarvis.artifact_builder import ArtifactBuilder
from models.jarvis import Project, ArtifactBuild
from services.db_service import db_service

logger = logging.getLogger(__name__)

artifact_bp = Blueprint('artifacts', __name__, url_prefix='/api/artifacts')


def login_required(f):
    """Decorator to require login for routes"""
    @wraps(f)
    def decorated_function(*args, **kwargs):
        if not session.get('authenticated'):
            return jsonify({'error': 'Authentication required'}), 401
        return f(*args, **kwargs)
    return decorated_function


@artifact_bp.route('/build', methods=['POST'])
@login_required
def build_artifact():
    """Build artifact for a project
    
    Request JSON:
        {
            "project_id": "uuid",
            "workflow_id": "uuid" (optional)
        }
    
    Returns:
        JSON with build information
    """
    try:
        if not db_service.is_available:
            return jsonify({'error': 'Database not available'}), 503
        
        data = request.json
        project_id = data.get('project_id')
        workflow_id = data.get('workflow_id')
        
        if not project_id:
            return jsonify({'error': 'project_id is required'}), 400
        
        with db_service.get_session() as session:
            project = session.query(Project).filter_by(id=project_id).first()
            if not project:
                return jsonify({'error': 'Project not found'}), 404
            
            # Initialize builder
            builder = ArtifactBuilder()
            
            # Build project
            build = builder.build_project(project, workflow_id)
            
            logger.info(f"Successfully built artifact for project {project.name}")
            
            return jsonify(build.to_dict()), 201
            
    except Exception as e:
        logger.error(f"Error building artifact: {e}", exc_info=True)
        return jsonify({'error': str(e)}), 500


@artifact_bp.route('/build/<build_id>', methods=['GET'])
@login_required
def get_build_status(build_id):
    """Get build status
    
    Args:
        build_id: UUID of the build
        
    Returns:
        JSON with build status information
    """
    try:
        if not db_service.is_available:
            return jsonify({'error': 'Database not available'}), 503
        
        builder = ArtifactBuilder()
        status = builder.get_build_status(build_id)
        
        return jsonify(status)
        
    except Exception as e:
        logger.error(f"Error getting build status: {e}", exc_info=True)
        return jsonify({'error': str(e)}), 500


@artifact_bp.route('/build/<build_id>/logs', methods=['GET'])
@login_required
def get_build_logs(build_id):
    """Get build logs
    
    Args:
        build_id: UUID of the build
        
    Returns:
        JSON with build logs and status
    """
    try:
        if not db_service.is_available:
            return jsonify({'error': 'Database not available'}), 503
        
        with db_service.get_session() as session:
            build = session.query(ArtifactBuild).filter_by(id=build_id).first()
            if not build:
                return jsonify({'error': 'Build not found'}), 404
                
            return jsonify({
                'logs': build.build_logs,
                'status': build.status,
                'image_ref': build.image_ref,
                'build_duration_ms': build.build_duration_ms
            })
            
    except Exception as e:
        logger.error(f"Error getting build logs: {e}", exc_info=True)
        return jsonify({'error': str(e)}), 500


@artifact_bp.route('/builds', methods=['GET'])
@login_required
def list_builds():
    """List recent builds
    
    Query parameters:
        project_id: Filter by project (optional)
        limit: Number of builds to return (default: 10, max: 100)
        
    Returns:
        JSON array of builds
    """
    try:
        if not db_service.is_available:
            return jsonify({'error': 'Database not available'}), 503
        
        project_id = request.args.get('project_id')
        limit = min(int(request.args.get('limit', 10)), 100)
        
        builder = ArtifactBuilder()
        builds = builder.list_builds(project_id=project_id, limit=limit)
        
        return jsonify(builds)
        
    except Exception as e:
        logger.error(f"Error listing builds: {e}", exc_info=True)
        return jsonify({'error': str(e)}), 500


@artifact_bp.route('/templates', methods=['GET'])
@login_required
def list_templates():
    """List available Dockerfile templates
    
    Returns:
        JSON object with template names
    """
    from jarvis.dockerfile_templates import TEMPLATES
    
    return jsonify({
        'templates': list(TEMPLATES.keys()),
        'count': len(TEMPLATES)
    })
