from flask import Blueprint, render_template, jsonify, request
from services.nas_service import NASService
from services.db_service import db_service
from services.fleet_service import fleet_manager
from models.nas import NASMount, NASBackupJob
from models.rbac import Permission
from utils.auth import require_auth
from utils.rbac import require_permission
from datetime import datetime
import logging

logger = logging.getLogger(__name__)

nas_bp = Blueprint('nas', __name__, url_prefix='/nas')

NAS_IP = "192.168.0.176"
MOUNT_POINTS = {
    'video': '/srv/media/video',
    'music': '/srv/media/music',
    'photo': '/srv/media/photo',
    'games': '/srv/media/games'
}


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


@nas_bp.route('/api/mount-status', methods=['GET'])
@require_auth
def get_mount_status():
    """Get real-time NAS mount status via Fleet Manager"""
    try:
        status = {
            'nas_ip': NAS_IP,
            'nas_reachable': False,
            'mounts': {},
            'nfs_mount_active': False,
            'timestamp': datetime.now().isoformat()
        }
        
        ping_result = fleet_manager.execute_command(
            'local',
            f'ping -c 1 -W 2 {NAS_IP}',
            timeout=10,
            bypass_whitelist=True
        )
        status['nas_reachable'] = ping_result.get('success', False)
        
        mount_result = fleet_manager.execute_command(
            'local',
            'mount | grep -E "(nas|nfs)" || echo "no_mounts"',
            timeout=10,
            bypass_whitelist=True
        )
        if mount_result.get('success'):
            mount_output = mount_result.get('output', '')
            status['nfs_mount_active'] = 'nfs' in mount_output.lower() and 'no_mounts' not in mount_output
            status['raw_mounts'] = mount_output.strip()
        
        for share_name, mount_path in MOUNT_POINTS.items():
            mount_info = {
                'path': mount_path,
                'status': 'unknown',
                'is_mounted': False,
                'has_content': False,
                'file_count': 0,
                'error': None
            }
            
            mountpoint_result = fleet_manager.execute_command(
                'local',
                f'mountpoint -q {mount_path} && echo "mounted" || echo "not_mounted"',
                timeout=5,
                bypass_whitelist=True
            )
            
            if mountpoint_result.get('success'):
                is_mounted = 'mounted' in mountpoint_result.get('output', '') and 'not_mounted' not in mountpoint_result.get('output', '')
                mount_info['is_mounted'] = is_mounted
                
                if is_mounted:
                    ls_result = fleet_manager.execute_command(
                        'local',
                        f'timeout 3 ls -1 {mount_path} 2>/dev/null | head -20 | wc -l',
                        timeout=10,
                        bypass_whitelist=True
                    )
                    
                    if ls_result.get('success'):
                        try:
                            file_count = int(ls_result.get('output', '0').strip())
                            mount_info['file_count'] = file_count
                            mount_info['has_content'] = file_count > 0
                            mount_info['status'] = 'mounted_with_content' if file_count > 0 else 'mounted_empty'
                        except ValueError:
                            mount_info['status'] = 'mounted_unknown'
                    else:
                        mount_info['status'] = 'stale'
                        mount_info['error'] = 'Mount may be stale - unable to list contents'
                else:
                    mount_info['status'] = 'not_mounted'
            else:
                mount_info['status'] = 'error'
                mount_info['error'] = mountpoint_result.get('error', 'Failed to check mount status')
            
            status['mounts'][share_name] = mount_info
        
        return jsonify({
            'success': True,
            **status
        })

    except Exception as e:
        logger.error(f"Error getting mount status: {e}")
        return jsonify({
            'success': False,
            'error': str(e)
        }), 500


@nas_bp.route('/api/remount', methods=['POST'])
@require_auth
@require_permission(Permission.MANAGE_DOCKER)
def remount_nas():
    """Remount NAS shares via Fleet Manager"""
    try:
        logs = []
        
        logs.append("Starting NAS remount process...")
        
        stop_result = fleet_manager.execute_command(
            'local',
            'sudo /usr/local/bin/nas-bind-mounts.sh stop 2>&1',
            timeout=30,
            bypass_whitelist=True
        )
        logs.append(f"Stop bind mounts: {stop_result.get('output', stop_result.get('error', 'No output'))}")
        
        start_result = fleet_manager.execute_command(
            'local',
            'sudo /usr/local/bin/nas-bind-mounts.sh start 2>&1',
            timeout=60,
            bypass_whitelist=True
        )
        logs.append(f"Start bind mounts: {start_result.get('output', start_result.get('error', 'No output'))}")
        
        success = start_result.get('success', False)
        
        return jsonify({
            'success': success,
            'message': 'NAS remount completed' if success else 'Remount may have failed',
            'logs': logs
        })

    except Exception as e:
        logger.error(f"Error remounting NAS: {e}")
        return jsonify({
            'success': False,
            'error': str(e)
        }), 500


@nas_bp.route('/api/setup-mounts', methods=['POST'])
@require_auth
@require_permission(Permission.MANAGE_DOCKER)
def setup_nas_mounts():
    """Run the full NAS setup script"""
    try:
        logs = []
        
        logs.append("Running NAS resilient mount setup script...")
        logs.append("This may take a minute...")
        
        result = fleet_manager.execute_command(
            'local',
            'sudo /opt/homelab/HomeLabHub/deploy/local/scripts/setup-nas-resilient.sh 2>&1',
            timeout=300,
            bypass_whitelist=True
        )
        
        output = result.get('output', '')
        if output:
            logs.extend(output.strip().split('\n'))
        
        if result.get('error'):
            logs.append(f"Errors: {result.get('error')}")
        
        return jsonify({
            'success': result.get('success', False),
            'message': 'Setup script completed' if result.get('success') else 'Setup script failed',
            'logs': logs,
            'exit_code': result.get('exit_code', -1)
        })

    except Exception as e:
        logger.error(f"Error running setup script: {e}")
        return jsonify({
            'success': False,
            'error': str(e)
        }), 500


@nas_bp.route('/api/diagnose', methods=['POST'])
@require_auth
def diagnose_nas():
    """Run NAS diagnostics"""
    try:
        diagnostics = {
            'timestamp': datetime.now().isoformat(),
            'checks': [],
            'overall_status': 'unknown'
        }
        
        ping_result = fleet_manager.execute_command(
            'local',
            f'ping -c 3 -W 2 {NAS_IP} 2>&1',
            timeout=15,
            bypass_whitelist=True
        )
        diagnostics['checks'].append({
            'name': 'NAS Ping Test',
            'description': f'Ping {NAS_IP} (3 packets)',
            'passed': ping_result.get('success', False),
            'output': ping_result.get('output', ping_result.get('error', 'No output'))[:500]
        })
        
        nfs_result = fleet_manager.execute_command(
            'local',
            'showmount -e ' + NAS_IP + ' 2>&1 || echo "NFS exports check failed"',
            timeout=15,
            bypass_whitelist=True
        )
        diagnostics['checks'].append({
            'name': 'NFS Exports',
            'description': f'Check NFS exports from {NAS_IP}',
            'passed': nfs_result.get('success', False) and 'failed' not in nfs_result.get('output', '').lower(),
            'output': nfs_result.get('output', nfs_result.get('error', 'No output'))[:500]
        })
        
        mount_result = fleet_manager.execute_command(
            'local',
            'mount | grep -E "(nas|nfs|' + NAS_IP + ')" 2>&1 || echo "No NAS mounts found"',
            timeout=10,
            bypass_whitelist=True
        )
        has_mounts = mount_result.get('success', False) and 'No NAS mounts found' not in mount_result.get('output', '')
        diagnostics['checks'].append({
            'name': 'Active NFS Mounts',
            'description': 'Check for active NAS/NFS mounts',
            'passed': has_mounts,
            'output': mount_result.get('output', mount_result.get('error', 'No output'))[:500]
        })
        
        for share_name, mount_path in MOUNT_POINTS.items():
            ls_result = fleet_manager.execute_command(
                'local',
                f'timeout 5 ls -la {mount_path} 2>&1 | head -10',
                timeout=15,
                bypass_whitelist=True
            )
            diagnostics['checks'].append({
                'name': f'Mount Point: {share_name}',
                'description': f'List contents of {mount_path}',
                'passed': ls_result.get('success', False),
                'output': ls_result.get('output', ls_result.get('error', 'No output'))[:300]
            })
        
        bind_script_result = fleet_manager.execute_command(
            'local',
            'test -x /usr/local/bin/nas-bind-mounts.sh && echo "Script exists and is executable" || echo "Script missing or not executable"',
            timeout=5,
            bypass_whitelist=True
        )
        diagnostics['checks'].append({
            'name': 'Bind Mount Script',
            'description': 'Check if nas-bind-mounts.sh exists',
            'passed': 'exists and is executable' in bind_script_result.get('output', ''),
            'output': bind_script_result.get('output', bind_script_result.get('error', 'No output'))
        })
        
        log_result = fleet_manager.execute_command(
            'local',
            'tail -20 /var/log/nas-bind-mounts.log 2>/dev/null || echo "No mount log found"',
            timeout=10,
            bypass_whitelist=True
        )
        diagnostics['checks'].append({
            'name': 'Recent Mount Logs',
            'description': 'Last 20 lines of NAS bind mount log',
            'passed': 'No mount log found' not in log_result.get('output', ''),
            'output': log_result.get('output', log_result.get('error', 'No output'))[:1000]
        })
        
        passed_count = sum(1 for check in diagnostics['checks'] if check['passed'])
        total_count = len(diagnostics['checks'])
        
        if passed_count == total_count:
            diagnostics['overall_status'] = 'healthy'
        elif passed_count >= total_count * 0.6:
            diagnostics['overall_status'] = 'degraded'
        else:
            diagnostics['overall_status'] = 'unhealthy'
        
        diagnostics['summary'] = f"{passed_count}/{total_count} checks passed"
        
        return jsonify({
            'success': True,
            **diagnostics
        })

    except Exception as e:
        logger.error(f"Error running diagnostics: {e}")
        return jsonify({
            'success': False,
            'error': str(e)
        }), 500


@nas_bp.route('/api/mount-logs', methods=['GET'])
@require_auth
def get_mount_logs():
    """Get NAS mount logs"""
    try:
        lines = request.args.get('lines', 50, type=int)
        lines = min(lines, 500)
        
        logs = {}
        
        bind_log_result = fleet_manager.execute_command(
            'local',
            f'tail -{lines} /var/log/nas-bind-mounts.log 2>/dev/null || echo "Log file not found"',
            timeout=10,
            bypass_whitelist=True
        )
        logs['bind_mounts'] = bind_log_result.get('output', bind_log_result.get('error', 'Failed to retrieve'))
        
        watchdog_result = fleet_manager.execute_command(
            'local',
            f'tail -{lines} /var/log/nas-watchdog.log 2>/dev/null || echo "Log file not found"',
            timeout=10,
            bypass_whitelist=True
        )
        logs['watchdog'] = watchdog_result.get('output', watchdog_result.get('error', 'Failed to retrieve'))
        
        systemd_result = fleet_manager.execute_command(
            'local',
            f'journalctl -u mnt-nas-all.mount -n {lines} --no-pager 2>/dev/null || echo "No systemd logs available"',
            timeout=15,
            bypass_whitelist=True
        )
        logs['systemd_mount'] = systemd_result.get('output', systemd_result.get('error', 'Failed to retrieve'))
        
        return jsonify({
            'success': True,
            'logs': logs
        })

    except Exception as e:
        logger.error(f"Error getting mount logs: {e}")
        return jsonify({
            'success': False,
            'error': str(e)
        }), 500
