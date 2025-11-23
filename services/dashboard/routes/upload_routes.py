import os
import tempfile
import logging
from flask import Blueprint, request, jsonify, send_file, session
from werkzeug.utils import secure_filename
from functools import wraps
from datetime import datetime
from uuid import uuid4

from config import Config
from services.upload_service import upload_service
from services.file_validator import file_validator
from services.db_service import db_service
from models.artifact import Artifact, FileType

logger = logging.getLogger(__name__)

upload_bp = Blueprint('upload', __name__)

def login_required(f):
    """Decorator to require login for routes"""
    @wraps(f)
    def decorated_function(*args, **kwargs):
        if not session.get('authenticated'):
            return jsonify({'error': 'Authentication required'}), 401
        return f(*args, **kwargs)
    return decorated_function


@upload_bp.route('/api/upload/file', methods=['POST'])
@login_required
def upload_file():
    """
    Upload a single file
    
    Form data:
        file: File to upload
        bucket: Target bucket (optional, default: artifacts)
        description: File description (optional)
    
    Returns:
        JSON with upload information and artifact ID
    """
    try:
        # Check if file is present
        if 'file' not in request.files:
            return jsonify({'error': 'No file provided'}), 400
        
        file = request.files['file']
        
        if not file.filename or file.filename == '':
            return jsonify({'error': 'No file selected'}), 400
        
        bucket = request.form.get('bucket', 'artifacts')
        description = request.form.get('description', '')
        
        # Create temp directory if it doesn't exist
        os.makedirs(Config.UPLOAD_FOLDER, exist_ok=True)
        
        # Save file temporarily
        filename = str(file.filename)
        temp_path = os.path.join(Config.UPLOAD_FOLDER, f"{uuid4()}_{secure_filename(filename)}")
        file.save(temp_path)
        
        try:
            # Upload to MinIO
            upload_info = upload_service.upload_file(
                temp_path,
                filename,
                bucket=bucket
            )
            
            # Create artifact record in database if available
            artifact_id = None
            if db_service.is_available:
                try:
                    from models.artifact import AnalysisStatus
                    artifact = Artifact(
                        filename=upload_info['safe_filename'],
                        original_filename=upload_info['original_filename'],
                        file_type=FileType.single_file,
                        storage_path=upload_info['storage_path'],
                        file_size=upload_info['file_size'],
                        checksum_sha256=upload_info['checksum_sha256'],
                        uploaded_by=session.get('username', 'unknown'),
                        artifact_metadata={'description': description, 'bucket': bucket},
                        analysis_status=AnalysisStatus.pending
                    )
                    
                    db_session = db_service.get_session()
                    db_session.add(artifact)
                    db_session.commit()
                    artifact_id = str(artifact.id)
                    db_session.close()
                    
                    logger.info(f"Created artifact record: {artifact_id}")
                    
                    from workers.analysis_worker import analyze_artifact_task
                    task = analyze_artifact_task.delay(artifact_id)
                    logger.info(f"Triggered analysis for artifact {artifact_id}, task ID: {task.id}")
                except Exception as e:
                    logger.error(f"Failed to create artifact record or trigger analysis: {e}")
            
            return jsonify({
                'success': True,
                'message': 'File uploaded successfully',
                'artifact_id': artifact_id,
                'upload_info': upload_info
            }), 200
        
        finally:
            # Clean up temp file
            if os.path.exists(temp_path):
                os.remove(temp_path)
    
    except ValueError as e:
        return jsonify({'error': str(e)}), 400
    except Exception as e:
        logger.error(f"Upload error: {e}", exc_info=True)
        return jsonify({'error': f'Upload failed: {str(e)}'}), 500


@upload_bp.route('/api/upload/zip', methods=['POST'])
@login_required
def upload_zip():
    """
    Upload a zip file
    
    Form data:
        file: Zip file to upload
        extract: Whether to extract contents (optional, default: false)
        bucket: Target bucket (optional, default: artifacts)
    
    Returns:
        JSON with upload information
    """
    try:
        if 'file' not in request.files:
            return jsonify({'error': 'No file provided'}), 400
        
        file = request.files['file']
        
        if not file.filename or file.filename == '':
            return jsonify({'error': 'No file selected'}), 400
        
        filename = str(file.filename)
        
        if not filename.lower().endswith('.zip'):
            return jsonify({'error': 'File must be a zip archive'}), 400
        
        extract = request.form.get('extract', 'false').lower() == 'true'
        bucket = request.form.get('bucket', 'artifacts')
        
        # Create temp directory
        os.makedirs(Config.UPLOAD_FOLDER, exist_ok=True)
        
        # Save file temporarily
        temp_path = os.path.join(Config.UPLOAD_FOLDER, f"{uuid4()}_{secure_filename(filename)}")
        file.save(temp_path)
        
        try:
            # Upload zip
            upload_info = upload_service.upload_zip(
                temp_path,
                filename,
                extract=extract,
                bucket=bucket
            )
            
            # Create artifact record
            artifact_id = None
            if db_service.is_available and not extract:
                try:
                    from models.artifact import AnalysisStatus
                    artifact = Artifact(
                        filename=upload_info['safe_filename'],
                        original_filename=upload_info['original_filename'],
                        file_type=FileType.zip,
                        storage_path=upload_info['storage_path'],
                        file_size=upload_info['file_size'],
                        checksum_sha256=upload_info['checksum_sha256'],
                        uploaded_by=session.get('username', 'unknown'),
                        artifact_metadata={'bucket': bucket, 'extracted': extract},
                        analysis_status=AnalysisStatus.pending
                    )
                    
                    db_session = db_service.get_session()
                    db_session.add(artifact)
                    db_session.commit()
                    artifact_id = str(artifact.id)
                    db_session.close()
                    
                    from workers.analysis_worker import analyze_artifact_task
                    task = analyze_artifact_task.delay(artifact_id)
                    logger.info(f"Triggered analysis for artifact {artifact_id}, task ID: {task.id}")
                except Exception as e:
                    logger.error(f"Failed to create artifact record or trigger analysis: {e}")
            
            return jsonify({
                'success': True,
                'message': 'Zip file uploaded successfully',
                'artifact_id': artifact_id,
                'upload_info': upload_info
            }), 200
        
        finally:
            # Clean up temp file
            if os.path.exists(temp_path):
                os.remove(temp_path)
    
    except ValueError as e:
        return jsonify({'error': str(e)}), 400
    except Exception as e:
        logger.error(f"Zip upload error: {e}", exc_info=True)
        return jsonify({'error': f'Upload failed: {str(e)}'}), 500


@upload_bp.route('/api/artifacts', methods=['GET'])
@login_required
def list_artifacts():
    """
    List all artifacts
    
    Query params:
        bucket: Filter by bucket (optional)
        limit: Maximum number of results (optional)
    
    Returns:
        JSON with list of artifacts
    """
    try:
        bucket = request.args.get('bucket', 'artifacts')
        limit = int(request.args.get('limit', 100))
        
        # Get from MinIO
        minio_artifacts = upload_service.list_artifacts(bucket=bucket)
        
        # Get from database if available
        db_artifacts = []
        if db_service.is_available:
            try:
                db_session = db_service.get_session()
                artifacts = db_session.query(Artifact).order_by(Artifact.uploaded_at.desc()).limit(limit).all()
                db_artifacts = [artifact.to_dict() for artifact in artifacts]
                db_session.close()
            except Exception as e:
                logger.error(f"Failed to fetch artifacts from database: {e}")
        
        return jsonify({
            'success': True,
            'artifacts': db_artifacts if db_artifacts else minio_artifacts[:limit]
        }), 200
    
    except Exception as e:
        logger.error(f"Error listing artifacts: {e}", exc_info=True)
        return jsonify({'error': f'Failed to list artifacts: {str(e)}'}), 500


@upload_bp.route('/api/artifacts/<artifact_id>', methods=['GET'])
@login_required
def get_artifact(artifact_id):
    """
    Get artifact details
    
    Args:
        artifact_id: UUID of the artifact
    
    Returns:
        JSON with artifact information
    """
    try:
        if not db_service.is_available:
            return jsonify({'error': 'Database not available'}), 503
        
        db_session = db_service.get_session()
        artifact = db_session.query(Artifact).filter_by(id=artifact_id).first()
        
        if not artifact:
            db_session.close()
            return jsonify({'error': 'Artifact not found'}), 404
        
        artifact_data = artifact.to_dict()
        db_session.close()
        
        return jsonify({
            'success': True,
            'artifact': artifact_data
        }), 200
    
    except Exception as e:
        logger.error(f"Error fetching artifact: {e}", exc_info=True)
        return jsonify({'error': f'Failed to fetch artifact: {str(e)}'}), 500


@upload_bp.route('/api/artifacts/<artifact_id>/download', methods=['GET'])
@login_required
def download_artifact(artifact_id):
    """
    Download an artifact
    
    Args:
        artifact_id: UUID of the artifact
    
    Returns:
        Pre-signed download URL or file stream
    """
    try:
        if not db_service.is_available:
            return jsonify({'error': 'Database not available'}), 503
        
        db_session = db_service.get_session()
        artifact = db_session.query(Artifact).filter_by(id=artifact_id).first()
        
        if not artifact:
            db_session.close()
            return jsonify({'error': 'Artifact not found'}), 404
        
        # Parse storage path
        parts = artifact.storage_path.split('/', 1)
        if len(parts) != 2:
            db_session.close()
            return jsonify({'error': 'Invalid storage path'}), 500
        
        bucket, object_name = parts
        
        # Generate pre-signed URL
        download_url = upload_service.get_artifact_url(bucket, object_name)
        
        db_session.close()
        
        return jsonify({
            'success': True,
            'download_url': download_url,
            'filename': artifact.original_filename
        }), 200
    
    except Exception as e:
        logger.error(f"Error generating download URL: {e}", exc_info=True)
        return jsonify({'error': f'Failed to generate download URL: {str(e)}'}), 500


@upload_bp.route('/api/artifacts/<artifact_id>', methods=['DELETE'])
@login_required
def delete_artifact(artifact_id):
    """
    Delete an artifact
    
    Args:
        artifact_id: UUID of the artifact
    
    Returns:
        JSON confirmation
    """
    try:
        if not db_service.is_available:
            return jsonify({'error': 'Database not available'}), 503
        
        db_session = db_service.get_session()
        artifact = db_session.query(Artifact).filter_by(id=artifact_id).first()
        
        if not artifact:
            db_session.close()
            return jsonify({'error': 'Artifact not found'}), 404
        
        # Parse storage path
        parts = artifact.storage_path.split('/', 1)
        if len(parts) == 2:
            bucket, object_name = parts
            
            # Delete from MinIO
            try:
                upload_service.delete_artifact(bucket, object_name)
            except Exception as e:
                logger.warning(f"Failed to delete from MinIO: {e}")
        
        # Delete from database
        db_session.delete(artifact)
        db_session.commit()
        db_session.close()
        
        logger.info(f"Deleted artifact: {artifact_id}")
        
        return jsonify({
            'success': True,
            'message': 'Artifact deleted successfully'
        }), 200
    
    except Exception as e:
        logger.error(f"Error deleting artifact: {e}", exc_info=True)
        return jsonify({'error': f'Failed to delete artifact: {str(e)}'}), 500


@upload_bp.route('/api/upload/validate', methods=['POST'])
@login_required
def validate_file_endpoint():
    """
    Validate a file without uploading
    
    Form data:
        file: File to validate
    
    Returns:
        JSON with validation result
    """
    try:
        if 'file' not in request.files:
            return jsonify({'error': 'No file provided'}), 400
        
        file = request.files['file']
        
        if not file.filename or file.filename == '':
            return jsonify({'error': 'No file selected'}), 400
        
        filename = str(file.filename)
        
        # Create temp file
        os.makedirs(Config.UPLOAD_FOLDER, exist_ok=True)
        temp_path = os.path.join(Config.UPLOAD_FOLDER, f"{uuid4()}_{secure_filename(filename)}")
        file.save(temp_path)
        
        try:
            file_size = os.path.getsize(temp_path)
            is_valid, error = file_validator.validate_file(temp_path, filename, file_size)
            
            return jsonify({
                'success': True,
                'valid': is_valid,
                'error': error,
                'file_size': file_size,
                'filename': filename
            }), 200
        
        finally:
            if os.path.exists(temp_path):
                os.remove(temp_path)
    
    except Exception as e:
        logger.error(f"Validation error: {e}", exc_info=True)
        return jsonify({'error': f'Validation failed: {str(e)}'}), 500


@upload_bp.route('/uploads', methods=['GET'])
@login_required
def uploads_page():
    """Render uploads page"""
    from flask import render_template
    return render_template('upload.html')
