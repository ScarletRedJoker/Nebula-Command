import os
import tempfile
import logging
from flask import Blueprint, request, jsonify, session, render_template
from werkzeug.utils import secure_filename
from functools import wraps
from uuid import uuid4

from config import Config
from services.db_service import db_service
from models.artifact import Artifact, AnalysisStatus
from workers.analysis_worker import analyze_artifact_task, analyze_preview_task

logger = logging.getLogger(__name__)

analysis_bp = Blueprint('analysis', __name__)


def login_required(f):
    """Decorator to require login for routes"""
    @wraps(f)
    def decorated_function(*args, **kwargs):
        if not session.get('authenticated'):
            return jsonify({'error': 'Authentication required'}), 401
        return f(*args, **kwargs)
    return decorated_function


@analysis_bp.route('/api/analyze/artifact/<artifact_id>', methods=['POST'])
@login_required
def trigger_analysis(artifact_id):
    """
    Trigger analysis for an uploaded artifact
    
    Args:
        artifact_id: UUID of the artifact
        
    Returns:
        JSON with task information
    """
    try:
        if not db_service.is_available:
            return jsonify({'error': 'Database not available'}), 503
        
        db_session = db_service.get_session()
        artifact = db_session.query(Artifact).filter_by(id=artifact_id).first()
        
        if not artifact:
            db_session.close()
            return jsonify({'error': 'Artifact not found'}), 404
        
        if artifact.analysis_status == AnalysisStatus.analyzing:
            db_session.close()
            return jsonify({
                'message': 'Analysis already in progress',
                'artifact_id': str(artifact_id),
                'status': 'analyzing'
            }), 200
        
        artifact.analysis_status = AnalysisStatus.pending
        db_session.commit()
        db_session.close()
        
        task = analyze_artifact_task.delay(str(artifact_id))
        
        logger.info(f"Triggered analysis for artifact {artifact_id}, task ID: {task.id}")
        
        return jsonify({
            'success': True,
            'message': 'Analysis started',
            'artifact_id': str(artifact_id),
            'task_id': task.id,
            'status': 'pending'
        }), 200
    
    except Exception as e:
        logger.error(f"Error triggering analysis: {e}", exc_info=True)
        return jsonify({'error': f'Failed to trigger analysis: {str(e)}'}), 500


@analysis_bp.route('/api/analyze/artifact/<artifact_id>/status', methods=['GET'])
@login_required
def get_analysis_status(artifact_id):
    """
    Get analysis status for an artifact
    
    Args:
        artifact_id: UUID of the artifact
        
    Returns:
        JSON with analysis status
    """
    try:
        if not db_service.is_available:
            return jsonify({'error': 'Database not available'}), 503
        
        db_session = db_service.get_session()
        artifact = db_session.query(Artifact).filter_by(id=artifact_id).first()
        
        if not artifact:
            db_session.close()
            return jsonify({'error': 'Artifact not found'}), 404
        
        response = {
            'success': True,
            'artifact_id': str(artifact_id),
            'status': artifact.analysis_status.value,
            'analysis_complete': artifact.analysis_complete,
            'detected_framework': artifact.detected_framework,
            'requires_database': artifact.requires_database
        }
        
        db_session.close()
        
        return jsonify(response), 200
    
    except Exception as e:
        logger.error(f"Error getting analysis status: {e}", exc_info=True)
        return jsonify({'error': f'Failed to get analysis status: {str(e)}'}), 500


@analysis_bp.route('/api/analyze/artifact/<artifact_id>/result', methods=['GET'])
@login_required
def get_analysis_result(artifact_id):
    """
    Get detailed analysis result for an artifact
    
    Args:
        artifact_id: UUID of the artifact
        
    Returns:
        JSON with complete analysis result
    """
    try:
        if not db_service.is_available:
            return jsonify({'error': 'Database not available'}), 503
        
        db_session = db_service.get_session()
        artifact = db_session.query(Artifact).filter_by(id=artifact_id).first()
        
        if not artifact:
            db_session.close()
            return jsonify({'error': 'Artifact not found'}), 404
        
        if artifact.analysis_status == AnalysisStatus.pending:
            db_session.close()
            return jsonify({
                'message': 'Analysis not started yet',
                'status': 'pending'
            }), 200
        
        if artifact.analysis_status == AnalysisStatus.analyzing:
            db_session.close()
            return jsonify({
                'message': 'Analysis in progress',
                'status': 'analyzing'
            }), 200
        
        if artifact.analysis_status == AnalysisStatus.failed:
            error_msg = artifact.analysis_result.get('error', 'Unknown error') if artifact.analysis_result else 'Unknown error'
            db_session.close()
            return jsonify({
                'success': False,
                'status': 'failed',
                'error': error_msg,
                'analysis_result': artifact.analysis_result
            }), 200
        
        response = {
            'success': True,
            'artifact_id': str(artifact_id),
            'status': 'complete',
            'artifact': artifact.to_dict(),
            'analysis_result': artifact.analysis_result
        }
        
        db_session.close()
        
        return jsonify(response), 200
    
    except Exception as e:
        logger.error(f"Error getting analysis result: {e}", exc_info=True)
        return jsonify({'error': f'Failed to get analysis result: {str(e)}'}), 500


@analysis_bp.route('/api/analyze/preview', methods=['POST'])
@login_required
def analyze_preview():
    """
    Analyze uploaded file without saving to database (for preview)
    
    Form data:
        file: File to analyze
        
    Returns:
        JSON with analysis result
    """
    try:
        if 'file' not in request.files:
            return jsonify({'error': 'No file provided'}), 400
        
        file = request.files['file']
        
        if not file.filename or file.filename == '':
            return jsonify({'error': 'No file selected'}), 400
        
        filename = str(file.filename)
        
        os.makedirs(Config.UPLOAD_FOLDER, exist_ok=True)
        temp_path = os.path.join(Config.UPLOAD_FOLDER, f"{uuid4()}_{secure_filename(filename)}")
        file.save(temp_path)
        
        try:
            task = analyze_preview_task.delay(temp_path)
            result = task.get(timeout=30)
            
            return jsonify({
                'success': True,
                'message': 'Preview analysis complete',
                'result': result
            }), 200
        
        finally:
            if os.path.exists(temp_path):
                os.remove(temp_path)
    
    except Exception as e:
        logger.error(f"Error in preview analysis: {e}", exc_info=True)
        return jsonify({'error': f'Preview analysis failed: {str(e)}'}), 500


@analysis_bp.route('/analysis/result/<artifact_id>', methods=['GET'])
@login_required
def analysis_result_page(artifact_id):
    """
    Render analysis result page
    
    Args:
        artifact_id: UUID of the artifact
        
    Returns:
        Rendered HTML page
    """
    try:
        if not db_service.is_available:
            return render_template('error.html', error='Database not available'), 503
        
        db_session = db_service.get_session()
        artifact = db_session.query(Artifact).filter_by(id=artifact_id).first()
        
        if not artifact:
            db_session.close()
            return render_template('error.html', error='Artifact not found'), 404
        
        artifact_data = artifact.to_dict()
        db_session.close()
        
        return render_template('analysis_result.html', artifact=artifact_data)
    
    except Exception as e:
        logger.error(f"Error rendering analysis result page: {e}", exc_info=True)
        return render_template('error.html', error=str(e)), 500
