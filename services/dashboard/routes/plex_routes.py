"""Plex Media Import Routes"""
import os
import logging
import tempfile
from uuid import uuid4
from flask import Blueprint, request, jsonify, session, render_template
from werkzeug.utils import secure_filename
from functools import wraps

from config import Config
from services.plex_service import plex_service
from workers.plex_worker import process_import_job, cleanup_old_imports

logger = logging.getLogger(__name__)

plex_bp = Blueprint('plex', __name__)


def login_required(f):
    """Decorator to require login for routes"""
    @wraps(f)
    def decorated_function(*args, **kwargs):
        if 'logged_in' not in session:
            return jsonify({'error': 'Authentication required'}), 401
        return f(*args, **kwargs)
    return decorated_function


@plex_bp.route('/plex')
@login_required
def plex_import_page():
    """Render Plex import page"""
    return render_template('plex_import.html')


@plex_bp.route('/api/plex/import', methods=['POST'])
@login_required
def import_media():
    """
    Upload media files for import
    
    Form data:
        files: Media files to upload (multiple)
        media_type: Media type (movie/tv_show/music) - optional, auto-detected
    
    Returns:
        JSON with job information
    """
    try:
        if 'files' not in request.files:
            return jsonify({'error': 'No files provided'}), 400
        
        files = request.files.getlist('files')
        
        if not files or len(files) == 0:
            return jsonify({'error': 'No files selected'}), 400
        
        # Get media type override (optional)
        media_type_override = request.form.get('media_type')
        user_id = session.get('username', 'unknown')
        
        # Create import job
        job_type = media_type_override or 'auto'
        job = plex_service.create_import_job(
            user_id=user_id,
            job_type=job_type,
            metadata={'manual_type': media_type_override}
        )
        
        job_id = str(job.id)
        uploaded_files = []
        
        # Create temp directory
        os.makedirs(Config.UPLOAD_FOLDER, exist_ok=True)
        
        # Upload each file
        for file in files:
            if not file.filename or file.filename == '':
                continue
            
            filename = str(file.filename)
            
            # Save to temp location
            temp_path = os.path.join(
                Config.UPLOAD_FOLDER,
                f"{uuid4()}_{secure_filename(filename)}"
            )
            file.save(temp_path)
            
            try:
                # Upload to MinIO and create import item
                upload_info = plex_service.upload_media_file(
                    temp_path,
                    filename,
                    job_id,
                    media_type=media_type_override
                )
                
                uploaded_files.append({
                    'filename': filename,
                    'item_id': upload_info['item_id'],
                    'media_type': upload_info['media_type'],
                    'metadata': upload_info['metadata']
                })
                
            except Exception as e:
                logger.error(f"Failed to upload file {filename}: {e}")
                uploaded_files.append({
                    'filename': filename,
                    'error': str(e)
                })
            
            finally:
                # Cleanup temp file
                if os.path.exists(temp_path):
                    os.remove(temp_path)
        
        # Trigger async processing
        process_import_job.delay(job_id)
        
        return jsonify({
            'success': True,
            'message': f'Import job created with {len(uploaded_files)} files',
            'job_id': job_id,
            'uploaded_files': uploaded_files
        }), 200
    
    except Exception as e:
        logger.error(f"Import error: {e}", exc_info=True)
        return jsonify({'error': f'Import failed: {str(e)}'}), 500


@plex_bp.route('/api/plex/jobs', methods=['GET'])
@login_required
def list_jobs():
    """
    List import jobs
    
    Query params:
        limit: Maximum number of jobs (default: 50)
    
    Returns:
        JSON with list of jobs
    """
    try:
        user_id = session.get('username')
        limit = int(request.args.get('limit', 50))
        
        jobs = plex_service.list_import_jobs(user_id=user_id, limit=limit)
        
        return jsonify({
            'success': True,
            'jobs': [job.to_dict() for job in jobs]
        }), 200
    
    except Exception as e:
        logger.error(f"Error listing jobs: {e}", exc_info=True)
        return jsonify({'error': str(e)}), 500


@plex_bp.route('/api/plex/jobs/<job_id>', methods=['GET'])
@login_required
def get_job_status(job_id):
    """
    Get job status and progress
    
    Returns:
        JSON with job details and items
    """
    try:
        job = plex_service.get_import_job(job_id)
        
        if not job:
            return jsonify({'error': 'Job not found'}), 404
        
        # Include items
        items = [item.to_dict() for item in job.items]
        
        job_dict = job.to_dict()
        job_dict['items'] = items
        
        # Calculate progress percentage
        if job.total_files > 0:
            job_dict['progress_percent'] = int((job.processed_files / job.total_files) * 100)
        else:
            job_dict['progress_percent'] = 0
        
        return jsonify({
            'success': True,
            'job': job_dict
        }), 200
    
    except Exception as e:
        logger.error(f"Error getting job status: {e}", exc_info=True)
        return jsonify({'error': str(e)}), 500


@plex_bp.route('/api/plex/jobs/<job_id>/retry', methods=['POST'])
@login_required
def retry_job(job_id):
    """
    Retry failed import job
    
    Returns:
        JSON with retry status
    """
    try:
        job = plex_service.get_import_job(job_id)
        
        if not job:
            return jsonify({'error': 'Job not found'}), 404
        
        if job.status not in ['failed', 'cancelled']:
            return jsonify({'error': 'Only failed or cancelled jobs can be retried'}), 400
        
        # Reset job status
        plex_service.update_job_status(job_id, 'pending')
        
        # Reset failed items
        from services.db_service import db_service
        from models.plex import PlexImportItem
        
        with db_service.get_session() as session:
            failed_items = session.query(PlexImportItem).filter_by(
                job_id=job_id,
                status='failed'
            ).all()
            
            for item in failed_items:
                item.status = 'pending'
                item.error_message = None
            
            session.commit()
        
        # Trigger async processing
        process_import_job.delay(job_id)
        
        return jsonify({
            'success': True,
            'message': 'Job retry triggered',
            'job_id': job_id
        }), 200
    
    except Exception as e:
        logger.error(f"Error retrying job: {e}", exc_info=True)
        return jsonify({'error': str(e)}), 500


@plex_bp.route('/api/plex/jobs/<job_id>', methods=['DELETE'])
@login_required
def delete_job(job_id):
    """
    Cancel and delete import job
    
    Returns:
        JSON with deletion status
    """
    try:
        success = plex_service.delete_import_job(job_id)
        
        if not success:
            return jsonify({'error': 'Job not found or deletion failed'}), 404
        
        return jsonify({
            'success': True,
            'message': 'Job deleted successfully'
        }), 200
    
    except Exception as e:
        logger.error(f"Error deleting job: {e}", exc_info=True)
        return jsonify({'error': str(e)}), 500


@plex_bp.route('/api/plex/scan', methods=['POST'])
@login_required
def trigger_scan():
    """
    Manually trigger Plex library scan
    
    Form data:
        library_type: Optional library type (movie/tv/music)
    
    Returns:
        JSON with scan result
    """
    try:
        library_type = request.form.get('library_type')
        
        result = plex_service.trigger_library_scan(library_type=library_type)
        
        if result['success']:
            return jsonify({
                'success': True,
                'message': f"Scanned {result['count']} libraries",
                'libraries': result['scanned_libraries']
            }), 200
        else:
            return jsonify({
                'success': False,
                'error': result.get('error', 'Scan failed')
            }), 500
    
    except Exception as e:
        logger.error(f"Error triggering scan: {e}", exc_info=True)
        return jsonify({'error': str(e)}), 500


@plex_bp.route('/api/plex/libraries', methods=['GET'])
@login_required
def get_libraries():
    """
    List Plex libraries
    
    Returns:
        JSON with list of libraries
    """
    try:
        libraries = plex_service.get_plex_libraries()
        
        return jsonify({
            'success': True,
            'libraries': libraries
        }), 200
    
    except Exception as e:
        logger.error(f"Error getting libraries: {e}", exc_info=True)
        return jsonify({'error': str(e)}), 500


@plex_bp.route('/api/plex/cleanup', methods=['POST'])
@login_required
def cleanup_jobs():
    """
    Trigger cleanup of old import jobs
    
    Form data:
        days: Age threshold in days (default: 30)
    
    Returns:
        JSON with cleanup result
    """
    try:
        days = int(request.form.get('days', 30))
        
        # Trigger async cleanup
        task = cleanup_old_imports.delay(days)
        
        return jsonify({
            'success': True,
            'message': 'Cleanup task triggered',
            'task_id': task.id,
            'days': days
        }), 200
    
    except Exception as e:
        logger.error(f"Error triggering cleanup: {e}", exc_info=True)
        return jsonify({'error': str(e)}), 500
