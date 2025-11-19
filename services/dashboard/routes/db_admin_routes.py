"""Database Administration API Routes"""
import logging
import uuid
from datetime import datetime
from io import BytesIO
from flask import Blueprint, request, jsonify, session, render_template
from functools import wraps

from services.db_admin_service import db_admin_service
from services.db_service import db_service
from models.db_admin import DBCredential, DBBackupJob
from sqlalchemy import select
from config import Config

logger = logging.getLogger(__name__)

db_admin_bp = Blueprint('db_admin', __name__)


def login_required(f):
    """Decorator to require login for routes"""
    @wraps(f)
    def decorated_function(*args, **kwargs):
        if 'logged_in' not in session:
            return jsonify({'error': 'Authentication required'}), 401
        return f(*args, **kwargs)
    return decorated_function


@db_admin_bp.route('/databases')
@login_required
def databases_page():
    """Render database management page"""
    return render_template('db_management.html')


@db_admin_bp.route('/api/databases', methods=['GET'])
@login_required
def list_databases():
    """
    List all managed database credentials
    
    Returns:
        JSON with list of database credentials (passwords excluded)
    """
    try:
        if not db_service.is_available:
            return jsonify({
                'success': False,
                'error': 'Database service not available'
            }), 503
        
        with db_service.get_session() as db_session:
            credentials = db_session.execute(
                select(DBCredential).order_by(DBCredential.db_name)
            ).scalars().all()
            
            return jsonify({
                'success': True,
                'databases': [cred.to_dict(include_password=False) for cred in credentials],
                'total': len(credentials)
            })
    
    except Exception as e:
        logger.error(f"Error listing databases: {e}")
        return jsonify({
            'success': False,
            'error': str(e)
        }), 500


@db_admin_bp.route('/api/databases', methods=['POST'])
@login_required
def add_database():
    """
    Add new database credential
    
    JSON body:
        db_name: Database name
        username: Database username
        password: Database password (will be encrypted)
        host: Database host
        port: Database port (default: 5432)
        metadata: Optional metadata dict
        
    Returns:
        JSON with created credential
    """
    try:
        data = request.get_json()
        
        if not data:
            return jsonify({
                'success': False,
                'error': 'No data provided'
            }), 400
        
        required_fields = ['db_name', 'username', 'password', 'host']
        for field in required_fields:
            if field not in data:
                return jsonify({
                    'success': False,
                    'error': f'Missing required field: {field}'
                }), 400
        
        host = data['host']
        if host not in Config.DB_ADMIN_ALLOWED_HOSTS:
            return jsonify({
                'success': False,
                'error': f'Host {host} not in allowed hosts list'
            }), 403
        
        if not db_service.is_available:
            return jsonify({
                'success': False,
                'error': 'Database service not available'
            }), 503
        
        encrypted_password = db_admin_service.encrypt_password(data['password'])
        
        with db_service.get_session() as db_session:
            credential = DBCredential(
                db_name=data['db_name'],
                username=data['username'],
                password_hash=encrypted_password,
                host=host,
                port=data.get('port', 5432),
                metadata=data.get('metadata')
            )
            
            db_session.add(credential)
            db_session.commit()
            db_session.refresh(credential)
            
            logger.info(f"Added database credential: {credential.db_name}@{credential.host}")
            
            return jsonify({
                'success': True,
                'database': credential.to_dict(include_password=False),
                'message': 'Database credential added successfully'
            }), 201
    
    except Exception as e:
        logger.error(f"Error adding database credential: {e}")
        return jsonify({
            'success': False,
            'error': str(e)
        }), 500


@db_admin_bp.route('/api/databases/<credential_id>', methods=['PUT'])
@login_required
def update_database(credential_id):
    """
    Update database credential
    
    JSON body:
        username: Optional new username
        password: Optional new password
        port: Optional new port
        is_active: Optional active status
        metadata: Optional metadata
        
    Returns:
        JSON with updated credential
    """
    try:
        data = request.get_json()
        
        if not data:
            return jsonify({
                'success': False,
                'error': 'No data provided'
            }), 400
        
        if not db_service.is_available:
            return jsonify({
                'success': False,
                'error': 'Database service not available'
            }), 503
        
        with db_service.get_session() as db_session:
            credential = db_session.execute(
                select(DBCredential).where(DBCredential.id == uuid.UUID(credential_id))
            ).scalar_one_or_none()
            
            if not credential:
                return jsonify({
                    'success': False,
                    'error': 'Database credential not found'
                }), 404
            
            if 'username' in data:
                credential.username = data['username']
            
            if 'password' in data:
                credential.password_hash = db_admin_service.encrypt_password(data['password'])
            
            if 'port' in data:
                credential.port = data['port']
            
            if 'is_active' in data:
                credential.is_active = data['is_active']
            
            if 'metadata' in data:
                credential.metadata = data['metadata']
            
            credential.updated_at = datetime.utcnow()
            
            db_session.commit()
            db_session.refresh(credential)
            
            logger.info(f"Updated database credential: {credential.db_name}")
            
            return jsonify({
                'success': True,
                'database': credential.to_dict(include_password=False),
                'message': 'Database credential updated successfully'
            })
    
    except Exception as e:
        logger.error(f"Error updating database credential: {e}")
        return jsonify({
            'success': False,
            'error': str(e)
        }), 500


@db_admin_bp.route('/api/databases/<credential_id>', methods=['DELETE'])
@login_required
def delete_database(credential_id):
    """
    Delete database credential
    
    Returns:
        JSON with success status
    """
    try:
        if not db_service.is_available:
            return jsonify({
                'success': False,
                'error': 'Database service not available'
            }), 503
        
        with db_service.get_session() as db_session:
            credential = db_session.execute(
                select(DBCredential).where(DBCredential.id == uuid.UUID(credential_id))
            ).scalar_one_or_none()
            
            if not credential:
                return jsonify({
                    'success': False,
                    'error': 'Database credential not found'
                }), 404
            
            db_name = credential.db_name
            
            db_session.delete(credential)
            db_session.commit()
            
            logger.info(f"Deleted database credential: {db_name}")
            
            return jsonify({
                'success': True,
                'message': f'Database credential {db_name} deleted successfully'
            })
    
    except Exception as e:
        logger.error(f"Error deleting database credential: {e}")
        return jsonify({
            'success': False,
            'error': str(e)
        }), 500


@db_admin_bp.route('/api/databases/<credential_id>/test', methods=['POST'])
@login_required
def test_connection(credential_id):
    """
    Test database connection
    
    Returns:
        JSON with connection test result
    """
    try:
        if not db_service.is_available:
            return jsonify({
                'success': False,
                'error': 'Database service not available'
            }), 503
        
        with db_service.get_session() as db_session:
            credential = db_session.execute(
                select(DBCredential).where(DBCredential.id == uuid.UUID(credential_id))
            ).scalar_one_or_none()
            
            if not credential:
                return jsonify({
                    'success': False,
                    'error': 'Database credential not found'
                }), 404
            
            password = db_admin_service.decrypt_password(credential.password_hash)
            
            result = db_admin_service.test_connection(
                host=credential.host,
                port=credential.port,
                database=credential.db_name,
                username=credential.username,
                password=password
            )
            
            credential.last_tested_at = datetime.utcnow()
            credential.test_status = result['status']
            
            db_session.commit()
            
            return jsonify(result)
    
    except Exception as e:
        logger.error(f"Error testing connection: {e}")
        return jsonify({
            'success': False,
            'error': str(e)
        }), 500


@db_admin_bp.route('/api/databases/<credential_id>/password', methods=['POST'])
@login_required
def reset_password(credential_id):
    """
    Reset database user password
    
    JSON body:
        new_password: New password for the database user
        target_username: Optional target user (defaults to credential username)
        
    Returns:
        JSON with password reset result
    """
    try:
        data = request.get_json()
        
        if not data or 'new_password' not in data:
            return jsonify({
                'success': False,
                'error': 'New password required'
            }), 400
        
        if not db_service.is_available:
            return jsonify({
                'success': False,
                'error': 'Database service not available'
            }), 503
        
        with db_service.get_session() as db_session:
            credential = db_session.execute(
                select(DBCredential).where(DBCredential.id == uuid.UUID(credential_id))
            ).scalar_one_or_none()
            
            if not credential:
                return jsonify({
                    'success': False,
                    'error': 'Database credential not found'
                }), 404
            
            admin_password = db_admin_service.decrypt_password(credential.password_hash)
            target_username = data.get('target_username', credential.username)
            
            result = db_admin_service.reset_user_password(
                host=credential.host,
                port=credential.port,
                admin_username=credential.username,
                admin_password=admin_password,
                target_username=target_username,
                new_password=data['new_password']
            )
            
            if result['success'] and target_username == credential.username:
                credential.password_hash = db_admin_service.encrypt_password(data['new_password'])
                credential.updated_at = datetime.utcnow()
                db_session.commit()
            
            return jsonify(result)
    
    except Exception as e:
        logger.error(f"Error resetting password: {e}")
        return jsonify({
            'success': False,
            'error': str(e)
        }), 500


@db_admin_bp.route('/api/databases/<credential_id>/backup', methods=['POST'])
@login_required
def create_backup(credential_id):
    """
    Create database backup
    
    JSON body:
        backup_type: Type of backup ('full', 'schema_only', 'data_only')
        compression: Compression type ('gzip', 'none') - default: gzip
        async: Whether to run async (default: true)
        
    Returns:
        JSON with backup job information
    """
    try:
        data = request.get_json() or {}
        
        backup_type = data.get('backup_type', 'full')
        compression = data.get('compression', 'gzip')
        run_async = data.get('async', True)
        
        if backup_type not in ['full', 'schema_only', 'data_only']:
            return jsonify({
                'success': False,
                'error': 'Invalid backup type'
            }), 400
        
        result = db_admin_service.backup_database(
            db_credential_id=uuid.UUID(credential_id),
            backup_type=backup_type,
            compression=compression
        )
        
        if not result['success']:
            return jsonify(result), 500
        
        if run_async:
            from workers.db_admin_worker import backup_database_async
            task = backup_database_async.delay(uuid.UUID(result['backup_job_id']))
            
            return jsonify({
                'success': True,
                'backup_job': result['backup_job'],
                'task_id': task.id,
                'message': 'Backup job created and queued'
            })
        else:
            exec_result = db_admin_service.execute_backup(uuid.UUID(result['backup_job_id']))
            return jsonify(exec_result)
    
    except Exception as e:
        logger.error(f"Error creating backup: {e}")
        return jsonify({
            'success': False,
            'error': str(e)
        }), 500


@db_admin_bp.route('/api/databases/<credential_id>/restore', methods=['POST'])
@login_required
def restore_backup(credential_id):
    """
    Restore database from backup
    
    JSON body:
        backup_job_id: ID of backup job to restore from
        async: Whether to run async (default: true)
        
    Returns:
        JSON with restore result
    """
    try:
        data = request.get_json()
        
        if not data or 'backup_job_id' not in data:
            return jsonify({
                'success': False,
                'error': 'Backup job ID required'
            }), 400
        
        run_async = data.get('async', True)
        
        if run_async:
            from workers.db_admin_worker import restore_database_async
            task = restore_database_async.delay(
                uuid.UUID(data['backup_job_id']),
                uuid.UUID(credential_id)
            )
            
            return jsonify({
                'success': True,
                'task_id': task.id,
                'message': 'Restore job queued'
            })
        else:
            result = db_admin_service.restore_database(
                backup_job_id=uuid.UUID(data['backup_job_id']),
                target_db_credential_id=uuid.UUID(credential_id)
            )
            return jsonify(result)
    
    except Exception as e:
        logger.error(f"Error restoring backup: {e}")
        return jsonify({
            'success': False,
            'error': str(e)
        }), 500


@db_admin_bp.route('/api/databases/backups', methods=['GET'])
@login_required
def list_backups():
    """
    List all backup jobs
    
    Query params:
        db_name: Optional filter by database name
        days: Number of days to look back (default: 90)
        
    Returns:
        JSON with list of backups
    """
    try:
        db_name = request.args.get('db_name')
        days = int(request.args.get('days', 90))
        
        backups = db_admin_service.list_backups(db_name=db_name, days=days)
        
        return jsonify({
            'success': True,
            'backups': backups,
            'total': len(backups)
        })
    
    except Exception as e:
        logger.error(f"Error listing backups: {e}")
        return jsonify({
            'success': False,
            'error': str(e)
        }), 500


@db_admin_bp.route('/api/databases/backups/<backup_id>', methods=['DELETE'])
@login_required
def delete_backup(backup_id):
    """
    Delete a backup job and its files
    
    Returns:
        JSON with success status
    """
    try:
        if not db_service.is_available:
            return jsonify({
                'success': False,
                'error': 'Database service not available'
            }), 503
        
        with db_service.get_session() as db_session:
            backup_job = db_session.execute(
                select(DBBackupJob).where(DBBackupJob.id == uuid.UUID(backup_id))
            ).scalar_one_or_none()
            
            if not backup_job:
                return jsonify({
                    'success': False,
                    'error': 'Backup job not found'
                }), 404
            
            if backup_job.storage_path:
                try:
                    db_admin_service.minio_client.remove_object(
                        db_admin_service._backup_bucket,
                        backup_job.storage_path
                    )
                except Exception as e:
                    logger.error(f"Error deleting backup file from MinIO: {e}")
            
            db_session.delete(backup_job)
            db_session.commit()
            
            logger.info(f"Deleted backup job: {backup_id}")
            
            return jsonify({
                'success': True,
                'message': 'Backup deleted successfully'
            })
    
    except Exception as e:
        logger.error(f"Error deleting backup: {e}")
        return jsonify({
            'success': False,
            'error': str(e)
        }), 500


@db_admin_bp.route('/api/databases/discover', methods=['POST'])
@login_required
def discover_databases():
    """
    Discover databases on a PostgreSQL server
    
    JSON body:
        host: Database host
        port: Database port
        username: Admin username
        password: Admin password
        
    Returns:
        JSON with list of discovered databases
    """
    try:
        data = request.get_json()
        
        if not data:
            return jsonify({
                'success': False,
                'error': 'No data provided'
            }), 400
        
        required_fields = ['host', 'port', 'username', 'password']
        for field in required_fields:
            if field not in data:
                return jsonify({
                    'success': False,
                    'error': f'Missing required field: {field}'
                }), 400
        
        databases = db_admin_service.discover_databases(
            host=data['host'],
            port=data['port'],
            username=data['username'],
            password=data['password']
        )
        
        return jsonify({
            'success': True,
            'databases': databases,
            'total': len(databases)
        })
    
    except Exception as e:
        logger.error(f"Error discovering databases: {e}")
        return jsonify({
            'success': False,
            'error': str(e)
        }), 500


@db_admin_bp.route('/api/databases/backups/<backup_id>/download', methods=['GET'])
@login_required
def download_backup(backup_id):
    """
    Download a backup file
    
    Returns:
        Backup file download
    """
    try:
        if not db_service.is_available:
            return jsonify({
                'success': False,
                'error': 'Database service not available'
            }), 503
        
        with db_service.get_session() as db_session:
            backup_job = db_session.execute(
                select(DBBackupJob).where(DBBackupJob.id == uuid.UUID(backup_id))
            ).scalar_one_or_none()
            
            if not backup_job or backup_job.status != 'completed':
                return jsonify({
                    'success': False,
                    'error': 'Backup not found or not completed'
                }), 404
            
            from flask import send_file
            
            response = db_admin_service.minio_client.get_object(
                db_admin_service._backup_bucket,
                backup_job.storage_path
            )
            
            filename = backup_job.storage_path.split('/')[-1]
            
            return send_file(
                BytesIO(response.read()),
                mimetype='application/octet-stream',
                as_attachment=True,
                download_name=filename
            )
    
    except Exception as e:
        logger.error(f"Error downloading backup: {e}")
        return jsonify({
            'success': False,
            'error': str(e)
        }), 500


__all__ = ['db_admin_bp']
