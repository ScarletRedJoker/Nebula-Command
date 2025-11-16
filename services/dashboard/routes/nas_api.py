"""
NAS Integration API Routes
"""

from flask import Blueprint, jsonify, request
from utils.auth import require_auth
from services.nas_service import (
    NASDiscoveryService,
    NASMountService,
    PlexAutomationService,
    NASBackupService
)
from services.dns_service import LocalDNSService
from models import get_session
from models.nas_models import NASDevice, NASMount, BackupJob
from models.dyndns_host import DynDNSHost
from datetime import datetime
import logging

logger = logging.getLogger(__name__)

nas_bp = Blueprint('nas', __name__, url_prefix='/api/nas')

discovery_service = NASDiscoveryService()
mount_service = NASMountService()
plex_service = PlexAutomationService()
backup_service = NASBackupService()
dns_service = LocalDNSService()


@nas_bp.route('/scan', methods=['POST'])
@require_auth
def scan_network():
    """Scan network for NAS devices"""
    try:
        data = request.get_json() or {}
        network_range = data.get('network_range', '192.168.1.0/24')
        
        logger.info(f"Scanning network: {network_range}")
        
        devices = discovery_service.scan_network(network_range)
        
        session = get_session()
        
        for device in devices:
            existing = session.query(NASDevice).filter_by(
                ip_address=device['ip_address']
            ).first()
            
            if existing:
                existing.last_seen = datetime.utcnow()
                existing.status = 'online'
                existing.device_type = device.get('device_type', 'generic')
            else:
                nas_device = NASDevice(
                    name=device.get('name', f"NAS-{device['ip_address']}"),
                    ip_address=device['ip_address'],
                    device_type=device.get('device_type', 'generic'),
                    status='online',
                    last_seen=datetime.utcnow()
                )
                session.add(nas_device)
        
        session.commit()
        session.close()
        
        return jsonify({
            'success': True,
            'devices': devices,
            'count': len(devices)
        })
    
    except Exception as e:
        logger.error(f"Network scan error: {e}")
        return jsonify({'success': False, 'message': str(e)}), 500


@nas_bp.route('/devices', methods=['GET'])
@require_auth
def list_devices():
    """List discovered NAS devices"""
    try:
        session = get_session()
        devices = session.query(NASDevice).all()
        
        result = [device.to_dict() for device in devices]
        
        session.close()
        
        return jsonify({
            'success': True,
            'devices': result
        })
    
    except Exception as e:
        logger.error(f"List devices error: {e}")
        return jsonify({'success': False, 'message': str(e)}), 500


@nas_bp.route('/devices/<int:device_id>', methods=['DELETE'])
@require_auth
def delete_device(device_id):
    """Delete NAS device"""
    try:
        session = get_session()
        device = session.query(NASDevice).filter_by(id=device_id).first()
        
        if not device:
            session.close()
            return jsonify({'success': False, 'message': 'Device not found'}), 404
        
        session.delete(device)
        session.commit()
        session.close()
        
        return jsonify({
            'success': True,
            'message': f'Deleted device {device_id}'
        })
    
    except Exception as e:
        logger.error(f"Delete device error: {e}")
        return jsonify({'success': False, 'message': str(e)}), 500


@nas_bp.route('/mount', methods=['POST'])
@require_auth
def mount_share():
    """Mount NAS share"""
    try:
        data = request.get_json()
        
        nas_device_id = data.get('nas_device_id')
        protocol = data.get('protocol')
        remote_path = data.get('remote_path')
        mount_point = data.get('mount_point')
        username = data.get('username')
        password = data.get('password')
        auto_mount = data.get('auto_mount', True)
        
        if not all([nas_device_id, protocol, remote_path, mount_point]):
            return jsonify({
                'success': False,
                'message': 'Missing required fields'
            }), 400
        
        session = get_session()
        nas_device = session.query(NASDevice).filter_by(id=nas_device_id).first()
        
        if not nas_device:
            session.close()
            return jsonify({'success': False, 'message': 'NAS device not found'}), 404
        
        if protocol == 'nfs':
            success, message = mount_service.mount_nfs_share(
                nas_device.ip_address,
                remote_path,
                mount_point
            )
        elif protocol == 'smb':
            share_name = remote_path.strip('/')
            success, message = mount_service.mount_smb_share(
                nas_device.ip_address,
                share_name,
                mount_point,
                username,
                password
            )
        else:
            session.close()
            return jsonify({
                'success': False,
                'message': f'Unsupported protocol: {protocol}'
            }), 400
        
        if success:
            nas_mount = NASMount(
                nas_device_id=nas_device_id,
                protocol=protocol,
                remote_path=remote_path,
                mount_point=mount_point,
                status='mounted',
                auto_mount=auto_mount,
                username=username
            )
            session.add(nas_mount)
            session.commit()
            
            mount_id = nas_mount.id
            session.close()
            
            return jsonify({
                'success': True,
                'message': message,
                'mount_id': mount_id
            })
        else:
            session.close()
            return jsonify({
                'success': False,
                'message': message
            }), 500
    
    except Exception as e:
        logger.error(f"Mount share error: {e}")
        return jsonify({'success': False, 'message': str(e)}), 500


@nas_bp.route('/unmount/<int:mount_id>', methods=['POST'])
@require_auth
def unmount_share(mount_id):
    """Unmount NAS share"""
    try:
        session = get_session()
        nas_mount = session.query(NASMount).filter_by(id=mount_id).first()
        
        if not nas_mount:
            session.close()
            return jsonify({'success': False, 'message': 'Mount not found'}), 404
        
        success, message = mount_service.unmount_share(nas_mount.mount_point)
        
        if success:
            nas_mount.status = 'unmounted'
            session.commit()
        
        session.close()
        
        return jsonify({
            'success': success,
            'message': message
        })
    
    except Exception as e:
        logger.error(f"Unmount share error: {e}")
        return jsonify({'success': False, 'message': str(e)}), 500


@nas_bp.route('/mounts', methods=['GET'])
@require_auth
def list_mounts():
    """List all NAS mounts"""
    try:
        session = get_session()
        mounts = session.query(NASMount).all()
        
        result = []
        for mount in mounts:
            mount_dict = mount.to_dict()
            
            stats = mount_service.get_mount_stats(mount.mount_point)
            mount_dict['stats'] = stats
            
            result.append(mount_dict)
        
        session.close()
        
        system_mounts = mount_service.list_mounts()
        
        return jsonify({
            'success': True,
            'mounts': result,
            'system_mounts': system_mounts
        })
    
    except Exception as e:
        logger.error(f"List mounts error: {e}")
        return jsonify({'success': False, 'message': str(e)}), 500


@nas_bp.route('/plex/setup', methods=['POST'])
@require_auth
def setup_plex():
    """
    Automated Plex setup with NAS
    """
    try:
        data = request.get_json()
        
        nas_ip = data.get('nas_ip')
        movie_path = data.get('movie_path')
        tv_path = data.get('tv_path')
        music_path = data.get('music_path')
        
        if not all([nas_ip, movie_path, tv_path]):
            return jsonify({
                'success': False,
                'message': 'Missing required fields: nas_ip, movie_path, tv_path'
            }), 400
        
        logger.info(f"Starting Plex automation for NAS {nas_ip}")
        
        results = plex_service.setup_plex_with_nas(
            nas_ip,
            movie_path,
            tv_path,
            music_path
        )
        
        session = get_session()
        
        nas_device = session.query(NASDevice).filter_by(ip_address=nas_ip).first()
        
        if not nas_device and results.get('nas_detected'):
            nas_info = results.get('nas_info', {})
            nas_device = NASDevice(
                name=nas_info.get('name', f'NAS-{nas_ip}'),
                ip_address=nas_ip,
                device_type=nas_info.get('device_type', 'generic'),
                status='online',
                last_seen=datetime.utcnow()
            )
            session.add(nas_device)
            session.commit()
        
        for mount_info in results.get('mounts_created', []):
            if mount_info['status'] == 'success':
                existing_mount = session.query(NASMount).filter_by(
                    mount_point=mount_info['mount_point']
                ).first()
                
                if not existing_mount and nas_device:
                    nas_mount = NASMount(
                        nas_device_id=nas_device.id,
                        protocol='nfs',
                        remote_path=mount_info.get('remote_path', ''),
                        mount_point=mount_info['mount_point'],
                        status='mounted',
                        auto_mount=True
                    )
                    session.add(nas_mount)
        
        session.commit()
        session.close()
        
        return jsonify({
            'success': len(results.get('errors', [])) == 0,
            'results': results
        })
    
    except Exception as e:
        logger.error(f"Plex setup error: {e}")
        return jsonify({'success': False, 'message': str(e)}), 500


@nas_bp.route('/backup/jobs', methods=['GET', 'POST'])
@require_auth
def backup_jobs():
    """List or create backup jobs"""
    if request.method == 'GET':
        try:
            jobs = backup_service.list_backup_jobs()
            
            return jsonify({
                'success': True,
                'jobs': jobs
            })
        
        except Exception as e:
            logger.error(f"List backup jobs error: {e}")
            return jsonify({'success': False, 'message': str(e)}), 500
    
    else:
        try:
            data = request.get_json()
            
            name = data.get('name')
            source_type = data.get('source_type')
            source = data.get('source')
            destination = data.get('destination')
            schedule = data.get('schedule')
            
            if not all([name, source_type, source, destination, schedule]):
                return jsonify({
                    'success': False,
                    'message': 'Missing required fields'
                }), 400
            
            job = backup_service.create_backup_job(
                name, source_type, source, destination, schedule
            )
            
            return jsonify({
                'success': True,
                'job': job
            })
        
        except Exception as e:
            logger.error(f"Create backup job error: {e}")
            return jsonify({'success': False, 'message': str(e)}), 500


@nas_bp.route('/backup/jobs/<int:job_id>', methods=['DELETE'])
@require_auth
def delete_backup_job(job_id):
    """Delete backup job"""
    try:
        session = get_session()
        job = session.query(BackupJob).filter_by(id=job_id).first()
        
        if not job:
            session.close()
            return jsonify({'success': False, 'message': 'Job not found'}), 404
        
        session.delete(job)
        session.commit()
        session.close()
        
        return jsonify({
            'success': True,
            'message': f'Deleted backup job {job_id}'
        })
    
    except Exception as e:
        logger.error(f"Delete backup job error: {e}")
        return jsonify({'success': False, 'message': str(e)}), 500


@nas_bp.route('/backup/run/<int:job_id>', methods=['POST'])
@require_auth
def run_backup_job(job_id):
    """Manually trigger backup job"""
    try:
        from celery_app import celery_app
        
        session = get_session()
        job = session.query(BackupJob).filter_by(id=job_id).first()
        
        if not job:
            session.close()
            return jsonify({'success': False, 'message': 'Job not found'}), 404
        
        session.close()
        
        task = celery_app.send_task('run_backup_job', args=[job_id])
        
        return jsonify({
            'success': True,
            'message': f'Backup job {job_id} started',
            'task_id': task.id
        })
    
    except Exception as e:
        logger.error(f"Run backup job error: {e}")
        return jsonify({'success': False, 'message': str(e)}), 500


@nas_bp.route('/backup/history/<int:job_id>', methods=['GET'])
@require_auth
def get_backup_history(job_id):
    """Get backup job execution history"""
    try:
        history = backup_service.get_backup_history(job_id)
        
        return jsonify({
            'success': True,
            'history': history
        })
    
    except Exception as e:
        logger.error(f"Get backup history error: {e}")
        return jsonify({'success': False, 'message': str(e)}), 500


@nas_bp.route('/dyndns/setup', methods=['POST'])
@require_auth
def setup_nas_dyndns():
    """
    Set up DynDNS for NAS
    """
    try:
        data = request.get_json()
        
        nas_id = data.get('nas_id')
        hostname = data.get('hostname')
        zone = data.get('zone')
        
        if not all([nas_id, hostname, zone]):
            return jsonify({
                'success': False,
                'message': 'Missing required fields: nas_id, hostname, zone'
            }), 400
        
        session = get_session()
        nas_device = session.query(NASDevice).filter_by(id=nas_id).first()
        
        if not nas_device:
            session.close()
            return jsonify({'success': False, 'message': 'NAS device not found'}), 404
        
        full_hostname = f"{hostname}.{zone}"
        
        success, result = dns_service.create_record(
            zone=zone,
            name=full_hostname,
            rtype='A',
            content=nas_device.ip_address,
            ttl=300
        )
        
        if success:
            dyndns_host = DynDNSHost(
                hostname=full_hostname,
                current_ip=nas_device.ip_address,
                enabled=True,
                description=f'DynDNS for NAS {nas_device.name}'
            )
            session.add(dyndns_host)
            
            nas_device.dyndns_hostname = full_hostname
            nas_device.dyndns_enabled = True
            
            session.commit()
        
        session.close()
        
        return jsonify({
            'success': success,
            'message': result if not success else f'DynDNS configured for {full_hostname}',
            'hostname': full_hostname if success else None
        })
    
    except Exception as e:
        logger.error(f"Setup NAS DynDNS error: {e}")
        return jsonify({'success': False, 'message': str(e)}), 500
