from flask import Blueprint, render_template, jsonify, request
from services.nas_service import NASService
from services.db_service import db_service
from models.nas import NASMount, NASBackupJob
from utils.auth import require_auth
from datetime import datetime
import logging

logger = logging.getLogger(__name__)

nas_bp = Blueprint('nas', __name__, url_prefix='/nas')


@nas_bp.route('/')
@require_auth
def nas_management():
    """Render NAS management page"""
    return render_template('nas_management.html')


@nas_bp.route('/api/discover', methods=['POST'])
@require_auth
def discover_nas():
    """Discover NAS on local network"""
    try:
        nas_service = NASService()
        result = nas_service.discover_nas()
        
        if result:
            return jsonify({
                'success': True,
                'nas': result
            })
        else:
            return jsonify({
                'success': False,
                'error': 'NAS not found on network'
            }), 404

    except Exception as e:
        logger.error(f"NAS discovery error: {e}")
        return jsonify({
            'success': False,
            'error': str(e)
        }), 500


@nas_bp.route('/api/test-connection', methods=['POST'])
@require_auth
def test_connection():
    """Test connection to NAS"""
    try:
        nas_service = NASService()
        result = nas_service.test_connection()
        
        return jsonify(result), 200 if result.get('success') else 500

    except Exception as e:
        logger.error(f"Connection test error: {e}")
        return jsonify({
            'success': False,
            'error': str(e)
        }), 500


@nas_bp.route('/api/mounts', methods=['GET'])
@require_auth
def list_mounts():
    """List all NAS mounts
    
    Query params:
        page: Page number (default: 1)
        per_page: Items per page (default: 50, max: 100)
    """
    try:
        from sqlalchemy import func
        
        nas_service = NASService()
        mounts = nas_service.list_mounts()
        
        # Get pagination parameters
        page = int(request.args.get('page', 1))
        per_page = min(int(request.args.get('per_page', 50)), 100)
        
        with db_service.get_session() as db:
            # Get total count from both sources
            db_count = db.query(func.count(NASMount.id)).scalar()
            system_mounts_count = len(mounts) if mounts else 0
            total = db_count + system_mounts_count
            
            # Get paginated DB mounts
            db_mounts = db.query(NASMount)\
                .order_by(NASMount.created_at.desc())\
                .offset((page - 1) * per_page)\
                .limit(per_page)\
                .all()
        
            # Apply pagination offset to system mounts
            start_idx = (page - 1) * per_page
            end_idx = start_idx + per_page
            mounts_with_info = []
            for mount in mounts[start_idx:end_idx]:
                storage_info = nas_service.get_mount_storage_info(mount['mount_point'])
                mount['storage'] = storage_info
                mounts_with_info.append(mount)
            
            return jsonify({
                'success': True,
                'mounts': mounts_with_info,
                'configured_mounts': [
                    {
                        'id': m.id,
                        'share_name': m.share_name,
                        'mount_point': m.mount_point,
                        'is_active': m.is_active,
                        'created_at': m.created_at.isoformat()
                    }
                    for m in db_mounts
                ],
                'pagination': {
                    'page': page,
                    'per_page': per_page,
                    'total': total,
                    'pages': (total + per_page - 1) // per_page if total > 0 else 1
                }
            })

    except Exception as e:
        logger.error(f"Error listing mounts: {e}")
        return jsonify({
            'success': False,
            'error': str(e)
        }), 500


@nas_bp.route('/api/mount', methods=['POST'])
@require_auth
def mount_share():
    """Mount NAS share"""
    try:
        data = request.get_json()
        share_name = data.get('share_name')
        mount_point = data.get('mount_point')
        username = data.get('username')
        password = data.get('password')

        if not all([share_name, mount_point]):
            return jsonify({
                'success': False,
                'error': 'Missing required fields'
            }), 400

        with db_service.get_session() as db:
            existing_mount_point = db.query(NASMount).filter_by(mount_point=mount_point).first()
            if existing_mount_point:
                return jsonify({
                    'success': False,
                    'error': f'Mount point {mount_point} is already in use'
                }), 400
            
            existing_share = db.query(NASMount).filter_by(share_name=share_name).first()
            if existing_share:
                return jsonify({
                    'success': False,
                    'error': f'Share {share_name} is already mounted at {existing_share.mount_point}'
                }), 400

        nas_service = NASService()
        result = nas_service.mount_smb_share(share_name, mount_point, username, password)

        if result.get('success'):
            with db_service.get_session() as db:
                nas_mount = NASMount(
                    share_name=share_name,
                    mount_point=mount_point,
                    is_active=True
                )
                db.add(nas_mount)
                db.commit()

        return jsonify(result), 200 if result.get('success') else 500

    except Exception as e:
        logger.error(f"Error mounting share: {e}")
        return jsonify({
            'success': False,
            'error': str(e)
        }), 500


@nas_bp.route('/api/unmount', methods=['POST'])
@require_auth
def unmount_share():
    """Unmount NAS share"""
    try:
        data = request.get_json()
        mount_point = data.get('mount_point')

        if not mount_point:
            return jsonify({
                'success': False,
                'error': 'Missing mount_point'
            }), 400

        nas_service = NASService()
        result = nas_service.unmount_share(mount_point)

        if result.get('success'):
            with db_service.get_session() as db:
                mount = db.query(NASMount).filter_by(mount_point=mount_point).first()
                if mount:
                    mount.is_active = False

        return jsonify(result), 200 if result.get('success') else 500

    except Exception as e:
        logger.error(f"Error unmounting share: {e}")
        return jsonify({
            'success': False,
            'error': str(e)
        }), 500


@nas_bp.route('/api/storage/<path:mount_point>', methods=['GET'])
@require_auth
def get_storage_info(mount_point):
    """Get storage information for mount point"""
    try:
        nas_service = NASService()
        storage_info = nas_service.get_mount_storage_info(f'/{mount_point}')
        
        if storage_info:
            return jsonify({
                'success': True,
                'storage': storage_info
            })
        else:
            return jsonify({
                'success': False,
                'error': 'Mount point not found or not mounted'
            }), 404

    except Exception as e:
        logger.error(f"Error getting storage info: {e}")
        return jsonify({
            'success': False,
            'error': str(e)
        }), 500


@nas_bp.route('/api/backup', methods=['POST'])
@require_auth
def create_backup():
    """Create backup to NAS"""
    try:
        data = request.get_json()
        source_path = data.get('source_path')
        dest_share = data.get('dest_share')
        backup_name = data.get('backup_name')

        if not all([source_path, dest_share, backup_name]):
            return jsonify({
                'success': False,
                'error': 'Missing required fields'
            }), 400

        with db_service.get_session() as db:
            backup_job = NASBackupJob(
                source_path=source_path,
                dest_share=dest_share,
                backup_name=backup_name,
                status='pending'
            )
            db.add(backup_job)
            db.flush()  # Ensure ID is generated
            job_id = backup_job.id

        from workers.nas_worker import run_nas_backup
        run_nas_backup.delay(job_id)

        return jsonify({
            'success': True,
            'job_id': job_id,
            'message': 'Backup job started'
        })

    except Exception as e:
        logger.error(f"Error creating backup: {e}")
        return jsonify({
            'success': False,
            'error': str(e)
        }), 500


@nas_bp.route('/api/backups', methods=['GET'])
@require_auth
def list_backups():
    """List all backup jobs"""
    try:
        with db_service.get_session() as db:
            backups = db.query(NASBackupJob).order_by(NASBackupJob.created_at.desc()).limit(50).all()
            
            backup_list = [
                {
                    'id': b.id,
                    'source_path': b.source_path,
                    'dest_share': b.dest_share,
                    'backup_name': b.backup_name,
                    'status': b.status,
                    'error_message': b.error_message,
                    'created_at': b.created_at.isoformat(),
                    'completed_at': b.completed_at.isoformat() if b.completed_at is not None else None
                }
                for b in backups
            ]
        
        return jsonify({
            'success': True,
            'backups': backup_list
        })

    except Exception as e:
        logger.error(f"Error listing backups: {e}")
        return jsonify({
            'success': False,
            'error': str(e)
        }), 500


@nas_bp.route('/api/browse', methods=['GET'])
@require_auth
def browse_nas():
    """
    Browse NAS folders and files
    
    Query params:
        path: Relative path to browse (default: root)
    """
    try:
        path = request.args.get('path', '')
        
        nas_service = NASService()
        result = nas_service.browse_path(path)
        
        return jsonify(result), 200 if result.get('success') else 404

    except Exception as e:
        logger.error(f"Error browsing NAS: {e}")
        return jsonify({
            'success': False,
            'error': str(e)
        }), 500


@nas_bp.route('/api/media-folders', methods=['GET'])
@require_auth
def get_media_folders():
    """
    Get categorized media folders for Plex library setup
    
    Returns folders organized by media type (movies, tv_shows, music, photos)
    with suggested Plex library paths
    """
    try:
        nas_service = NASService()
        result = nas_service.get_media_folders()
        
        return jsonify(result), 200 if result.get('success') else 404

    except Exception as e:
        logger.error(f"Error getting media folders: {e}")
        return jsonify({
            'success': False,
            'error': str(e)
        }), 500


@nas_bp.route('/api/copy', methods=['POST'])
@require_auth
def copy_to_nas():
    """
    Copy a file to NAS storage
    
    JSON body:
        source_path: Local source file path
        dest_folder: Destination folder on NAS
        filename: Optional new filename
    """
    try:
        data = request.get_json()
        source_path = data.get('source_path')
        dest_folder = data.get('dest_folder')
        filename = data.get('filename')

        if not source_path or not dest_folder:
            return jsonify({
                'success': False,
                'error': 'Missing required fields: source_path and dest_folder'
            }), 400

        nas_service = NASService()
        result = nas_service.copy_to_nas(source_path, dest_folder, filename)
        
        return jsonify(result), 200 if result.get('success') else 500

    except Exception as e:
        logger.error(f"Error copying to NAS: {e}")
        return jsonify({
            'success': False,
            'error': str(e)
        }), 500


@nas_bp.route('/api/plex-paths', methods=['GET'])
@require_auth
def get_plex_paths():
    """
    Get NAS paths formatted for Plex container access
    
    Returns paths that can be used when configuring Plex libraries
    (maps to /nas inside the Plex container)
    """
    try:
        nas_service = NASService()
        result = nas_service.get_media_folders()
        
        if not result.get('success'):
            return jsonify(result), 404
        
        plex_paths = {
            'mount_info': {
                'host_mount': result.get('mount_base'),
                'container_mount': '/nas',
                'description': 'NAS is mounted at /mnt/nas on host, accessible as /nas inside Plex container'
            },
            'library_suggestions': result.get('plex_library_suggestions', []),
            'all_folders': result.get('folders', {})
        }
        
        return jsonify({
            'success': True,
            **plex_paths
        })

    except Exception as e:
        logger.error(f"Error getting Plex paths: {e}")
        return jsonify({
            'success': False,
            'error': str(e)
        }), 500
