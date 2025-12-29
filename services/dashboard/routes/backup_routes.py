"""Backup Management API Routes"""
import logging
from datetime import datetime
from flask import Blueprint, request, jsonify, render_template
from utils.auth import require_auth

logger = logging.getLogger(__name__)

backup_bp = Blueprint('backup', __name__)


def login_required(f):
    """Decorator for API routes - supports both session and API key auth"""
    return require_auth(f)


@backup_bp.route('/backups')
@login_required
def backups_page():
    """Render backups management page"""
    return render_template('backups.html')


@backup_bp.route('/api/backups', methods=['GET'])
@login_required
def list_backups():
    """
    List all backups
    
    Query params:
        backup_type: Filter by type (database, files, docker_volume, studio_project)
        status: Filter by status (pending, running, completed, failed)
        limit: Number of results (default: 50, max: 100)
        offset: Pagination offset (default: 0)
    
    Returns:
        JSON with backups list and pagination info
    """
    try:
        from services.backup_service import backup_service
        
        backup_type = request.args.get('backup_type')
        status = request.args.get('status')
        limit = min(int(request.args.get('limit', 50)), 100)
        offset = int(request.args.get('offset', 0))
        
        result = backup_service.list_backups(
            backup_type=backup_type,
            status=status,
            limit=limit,
            offset=offset
        )
        
        return jsonify(result)
        
    except Exception as e:
        logger.error(f"Error listing backups: {e}")
        return jsonify({'success': False, 'error': str(e)}), 500


@backup_bp.route('/api/backups', methods=['POST'])
@login_required
def create_backup():
    """
    Create a new backup
    
    JSON body:
        name: Backup name/label (required)
        backup_type: Type (database, files, docker_volume, studio_project, full) (required)
        source: Source path or database name (required)
        destination: Custom destination path (optional)
        destination_type: Storage type - 'local', 'minio', or 's3' (default: 'local')
        compression: 'gzip' or 'none' (default: 'gzip')
        metadata: Additional metadata object (optional)
    
    Returns:
        JSON with backup details
    """
    try:
        from services.backup_service import backup_service
        
        data = request.get_json()
        
        if not data:
            return jsonify({'success': False, 'error': 'No data provided'}), 400
        
        required_fields = ['name', 'backup_type', 'source']
        for field in required_fields:
            if field not in data:
                return jsonify({'success': False, 'error': f'Missing required field: {field}'}), 400
        
        valid_types = ['database', 'files', 'docker_volume', 'studio_project', 'full', 'incremental', 'configs']
        if data['backup_type'] not in valid_types:
            return jsonify({
                'success': False, 
                'error': f"Invalid backup_type. Must be one of: {', '.join(valid_types)}"
            }), 400
        
        destination_type = data.get('destination_type', 'local')
        if destination_type not in ('local', 'minio', 's3'):
            return jsonify({
                'success': False,
                'error': "Invalid destination_type. Must be 'local', 'minio', or 's3'"
            }), 400
        
        result = backup_service.create_backup(
            name=data['name'],
            backup_type=data['backup_type'],
            source=data['source'],
            destination=data.get('destination'),
            destination_type=destination_type,
            compression=data.get('compression', 'gzip'),
            metadata=data.get('metadata')
        )
        
        if result['success']:
            return jsonify(result), 201
        else:
            return jsonify(result), 400
        
    except Exception as e:
        logger.error(f"Error creating backup: {e}")
        return jsonify({'success': False, 'error': str(e)}), 500


@backup_bp.route('/api/backups/minio/status', methods=['GET'])
@login_required
def get_minio_status():
    """
    Get MinIO/S3 configuration status
    
    Returns:
        JSON with MinIO availability and configuration
    """
    try:
        from services.backup_service import backup_service
        
        is_available = backup_service.is_minio_available()
        
        return jsonify({
            'success': True,
            'minio_available': is_available,
            'bucket': backup_service.minio_client and 'backups' or None
        })
        
    except Exception as e:
        logger.error(f"Error checking MinIO status: {e}")
        return jsonify({'success': False, 'error': str(e)}), 500


@backup_bp.route('/api/backups/minio', methods=['GET'])
@login_required
def list_minio_backups():
    """
    List backups stored in MinIO/S3
    
    Returns:
        JSON with list of remote backups
    """
    try:
        from services.backup_service import backup_service
        
        result = backup_service.list_minio_backups()
        return jsonify(result)
        
    except Exception as e:
        logger.error(f"Error listing MinIO backups: {e}")
        return jsonify({'success': False, 'error': str(e)}), 500


@backup_bp.route('/api/backups/<backup_id>', methods=['GET'])
@login_required
def get_backup(backup_id):
    """
    Get backup details
    
    Returns:
        JSON with backup details
    """
    try:
        from services.db_service import db_service
        from models.backups import Backup
        from sqlalchemy import select
        import uuid
        
        if not db_service.is_available:
            return jsonify({'success': False, 'error': 'Database service not available'}), 503
        
        with db_service.get_session() as session:
            backup = session.execute(
                select(Backup).where(Backup.id == uuid.UUID(backup_id))
            ).scalar_one_or_none()
            
            if not backup:
                return jsonify({'success': False, 'error': 'Backup not found'}), 404
            
            return jsonify({
                'success': True,
                'backup': backup.to_dict()
            })
        
    except Exception as e:
        logger.error(f"Error getting backup: {e}")
        return jsonify({'success': False, 'error': str(e)}), 500


@backup_bp.route('/api/backups/<backup_id>/restore', methods=['POST'])
@login_required
def restore_backup(backup_id):
    """
    Restore from a backup
    
    JSON body:
        target_path: Optional custom target path (defaults to original source)
    
    Returns:
        JSON with restore result
    """
    try:
        from services.backup_service import backup_service
        
        data = request.get_json() or {}
        target_path = data.get('target_path')
        
        result = backup_service.restore_backup(backup_id, target_path)
        
        if result['success']:
            return jsonify(result)
        else:
            return jsonify(result), 400
        
    except Exception as e:
        logger.error(f"Error restoring backup: {e}")
        return jsonify({'success': False, 'error': str(e)}), 500


@backup_bp.route('/api/backups/<backup_id>', methods=['DELETE'])
@login_required
def delete_backup(backup_id):
    """
    Delete a backup
    
    Query params:
        delete_file: Whether to delete the backup file (default: true)
    
    Returns:
        JSON with deletion result
    """
    try:
        from services.backup_service import backup_service
        
        delete_file = request.args.get('delete_file', 'true').lower() == 'true'
        
        result = backup_service.delete_backup(backup_id, delete_file)
        
        if result['success']:
            return jsonify(result)
        else:
            return jsonify(result), 400
        
    except Exception as e:
        logger.error(f"Error deleting backup: {e}")
        return jsonify({'success': False, 'error': str(e)}), 500


@backup_bp.route('/api/backups/storage', methods=['GET'])
@login_required
def get_storage_stats():
    """
    Get backup storage statistics
    
    Returns:
        JSON with storage usage by type and disk info
    """
    try:
        from services.backup_service import backup_service
        
        result = backup_service.get_storage_stats()
        return jsonify(result)
        
    except Exception as e:
        logger.error(f"Error getting storage stats: {e}")
        return jsonify({'success': False, 'error': str(e)}), 500


@backup_bp.route('/api/backups/sources', methods=['GET'])
@login_required
def get_backup_sources():
    """
    Get available backup sources
    
    Returns:
        JSON with available databases, Docker volumes, Studio projects, and directories
    """
    try:
        from services.backup_service import backup_service
        
        result = backup_service.get_backup_sources()
        return jsonify(result)
        
    except Exception as e:
        logger.error(f"Error getting backup sources: {e}")
        return jsonify({'success': False, 'error': str(e)}), 500


@backup_bp.route('/api/backups/cleanup', methods=['POST'])
@login_required
def cleanup_old_backups():
    """
    Clean up old backups based on retention policies
    
    JSON body:
        schedule_id: Optional schedule ID to clean up (cleans all if not provided)
    
    Returns:
        JSON with cleanup results
    """
    try:
        from services.backup_service import backup_service
        
        data = request.get_json() or {}
        schedule_id = data.get('schedule_id')
        
        result = backup_service.cleanup_old_backups(schedule_id)
        return jsonify(result)
        
    except Exception as e:
        logger.error(f"Error cleaning up backups: {e}")
        return jsonify({'success': False, 'error': str(e)}), 500


@backup_bp.route('/api/backups/schedules', methods=['GET'])
@login_required
def list_schedules():
    """
    List all backup schedules
    
    Returns:
        JSON with schedules list
    """
    try:
        from services.backup_service import backup_service
        
        result = backup_service.list_schedules()
        return jsonify(result)
        
    except Exception as e:
        logger.error(f"Error listing schedules: {e}")
        return jsonify({'success': False, 'error': str(e)}), 500


@backup_bp.route('/api/backups/schedules', methods=['POST'])
@login_required
def create_schedule():
    """
    Create a new backup schedule
    
    JSON body:
        name: Schedule name (required)
        backup_type: Backup type (required)
        source: Source path/database (required)
        cron_expression: Cron schedule (required)
        destination: Custom destination (optional)
        enabled: Whether schedule is active (default: true)
        retention_days: Days to keep backups (default: 30)
        retention_count: Max backups to keep (optional)
        compression: 'gzip' or 'none' (default: 'gzip')
        metadata: Additional metadata (optional)
    
    Returns:
        JSON with created schedule
    """
    try:
        from services.backup_service import backup_service
        
        data = request.get_json()
        
        if not data:
            return jsonify({'success': False, 'error': 'No data provided'}), 400
        
        result = backup_service.create_schedule(data)
        
        if result['success']:
            return jsonify(result), 201
        else:
            return jsonify(result), 400
        
    except Exception as e:
        logger.error(f"Error creating schedule: {e}")
        return jsonify({'success': False, 'error': str(e)}), 500


@backup_bp.route('/api/backups/schedules/<schedule_id>', methods=['GET'])
@login_required
def get_schedule(schedule_id):
    """
    Get schedule details
    
    Returns:
        JSON with schedule details
    """
    try:
        from services.db_service import db_service
        from models.backups import BackupSchedule
        from sqlalchemy import select
        import uuid
        
        if not db_service.is_available:
            return jsonify({'success': False, 'error': 'Database service not available'}), 503
        
        with db_service.get_session() as session:
            schedule = session.execute(
                select(BackupSchedule).where(BackupSchedule.id == uuid.UUID(schedule_id))
            ).scalar_one_or_none()
            
            if not schedule:
                return jsonify({'success': False, 'error': 'Schedule not found'}), 404
            
            return jsonify({
                'success': True,
                'schedule': schedule.to_dict()
            })
        
    except Exception as e:
        logger.error(f"Error getting schedule: {e}")
        return jsonify({'success': False, 'error': str(e)}), 500


@backup_bp.route('/api/backups/schedules/<schedule_id>', methods=['PUT'])
@login_required
def update_schedule(schedule_id):
    """
    Update a backup schedule
    
    JSON body:
        name, backup_type, source, destination, cron_expression, 
        enabled, retention_days, retention_count, compression, metadata
    
    Returns:
        JSON with updated schedule
    """
    try:
        from services.backup_service import backup_service
        
        data = request.get_json()
        
        if not data:
            return jsonify({'success': False, 'error': 'No data provided'}), 400
        
        result = backup_service.update_schedule(schedule_id, data)
        
        if result['success']:
            return jsonify(result)
        else:
            return jsonify(result), 400
        
    except Exception as e:
        logger.error(f"Error updating schedule: {e}")
        return jsonify({'success': False, 'error': str(e)}), 500


@backup_bp.route('/api/backups/schedules/<schedule_id>', methods=['DELETE'])
@login_required
def delete_schedule(schedule_id):
    """
    Delete a backup schedule
    
    Returns:
        JSON with deletion result
    """
    try:
        from services.backup_service import backup_service
        
        result = backup_service.delete_schedule(schedule_id)
        
        if result['success']:
            return jsonify(result)
        else:
            return jsonify(result), 400
        
    except Exception as e:
        logger.error(f"Error deleting schedule: {e}")
        return jsonify({'success': False, 'error': str(e)}), 500


@backup_bp.route('/api/backups/schedules/<schedule_id>/run', methods=['POST'])
@login_required
def run_scheduled_backup(schedule_id):
    """
    Manually trigger a scheduled backup
    
    Returns:
        JSON with backup result
    """
    try:
        from services.db_service import db_service
        from services.backup_service import backup_service
        from models.backups import BackupSchedule
        from sqlalchemy import select
        import uuid
        
        if not db_service.is_available:
            return jsonify({'success': False, 'error': 'Database service not available'}), 503
        
        with db_service.get_session() as session:
            schedule = session.execute(
                select(BackupSchedule).where(BackupSchedule.id == uuid.UUID(schedule_id))
            ).scalar_one_or_none()
            
            if not schedule:
                return jsonify({'success': False, 'error': 'Schedule not found'}), 404
            
            result = backup_service.create_backup(
                name=f"{schedule.name} (Manual)",
                backup_type=schedule.backup_type,
                source=schedule.source,
                destination=schedule.destination if schedule.destination else None,
                compression=schedule.compression or 'gzip',
                metadata={'schedule_id': str(schedule.id), 'manual_trigger': True}
            )
            
            schedule.last_run = datetime.utcnow()
            session.commit()
            
            return jsonify(result)
        
    except Exception as e:
        logger.error(f"Error running scheduled backup: {e}")
        return jsonify({'success': False, 'error': str(e)}), 500


@backup_bp.route('/api/backups/<backup_id>/download', methods=['GET'])
@login_required
def download_backup(backup_id):
    """
    Download a backup file
    
    Returns:
        The backup file for download
    """
    try:
        from services.db_service import db_service
        from models.backups import Backup
        from sqlalchemy import select
        from flask import send_file
        import uuid
        import os
        
        if not db_service.is_available:
            return jsonify({'success': False, 'error': 'Database service not available'}), 503
        
        with db_service.get_session() as session:
            backup = session.execute(
                select(Backup).where(Backup.id == uuid.UUID(backup_id))
            ).scalar_one_or_none()
            
            if not backup:
                return jsonify({'success': False, 'error': 'Backup not found'}), 404
            
            if not backup.destination or not os.path.exists(backup.destination):
                return jsonify({'success': False, 'error': 'Backup file not found on disk'}), 404
            
            filename = os.path.basename(backup.destination)
            
            return send_file(
                backup.destination,
                as_attachment=True,
                download_name=filename
            )
        
    except Exception as e:
        logger.error(f"Error downloading backup: {e}")
        return jsonify({'success': False, 'error': str(e)}), 500


@backup_bp.route('/api/backups/history', methods=['GET'])
@login_required
def get_backup_history():
    """
    Get backup history (alias for list_backups with status filter)
    
    Query params:
        status: Filter by status (completed, failed)
        limit: Number of results (default: 100)
        
    Returns:
        JSON with backup history
    """
    try:
        from services.backup_service import backup_service
        
        limit = min(int(request.args.get('limit', 100)), 200)
        status = request.args.get('status')
        
        result = backup_service.list_backups(
            status=status,
            limit=limit,
            offset=0
        )
        
        return jsonify(result)
        
    except Exception as e:
        logger.error(f"Error getting backup history: {e}")
        return jsonify({'success': False, 'error': str(e)}), 500
