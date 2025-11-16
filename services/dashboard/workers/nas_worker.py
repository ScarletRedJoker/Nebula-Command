"""
NAS Integration Celery Workers
"""

from celery_app import celery_app
from services.nas_service import NASMountService, NASBackupService
from models import get_session
from models.nas_models import NASDevice, NASMount, BackupJob
from datetime import datetime
import logging

logger = logging.getLogger(__name__)

mount_service = NASMountService()
backup_service = NASBackupService()


@celery_app.task(name='run_backup_job', bind=True)
def run_backup_job(self, job_id: int):
    """
    Execute backup job
    
    Args:
        job_id: Backup job ID
    """
    logger.info(f"Running backup job: {job_id}")
    
    try:
        session = get_session()
        job = session.query(BackupJob).filter_by(id=job_id).first()
        
        if not job:
            logger.error(f"Backup job {job_id} not found")
            session.close()
            return {'success': False, 'message': 'Job not found'}
        
        if not job.enabled:
            logger.info(f"Backup job {job_id} is disabled, skipping")
            session.close()
            return {'success': False, 'message': 'Job is disabled'}
        
        job.last_run = datetime.utcnow()
        session.commit()
        
        success = False
        message = ''
        
        if job.source_type == 'database':
            success, message = backup_service.backup_database(
                job.source,
                job.destination
            )
        
        elif job.source_type == 'docker_volume':
            success, message = backup_service.backup_docker_volume(
                job.source,
                job.destination
            )
        
        else:
            message = f"Unsupported source type: {job.source_type}"
            logger.error(message)
        
        job.last_status = 'success' if success else 'failed'
        session.commit()
        session.close()
        
        logger.info(f"Backup job {job_id} completed: {message}")
        
        return {
            'success': success,
            'job_id': job_id,
            'message': message
        }
    
    except Exception as e:
        logger.error(f"Backup job {job_id} error: {e}")
        
        try:
            session = get_session()
            job = session.query(BackupJob).filter_by(id=job_id).first()
            if job:
                job.last_status = 'error'
                session.commit()
            session.close()
        except:
            pass
        
        raise


@celery_app.task(name='check_nas_devices')
def check_nas_devices():
    """
    Periodic task to check NAS device status
    Runs every 5 minutes
    """
    logger.info("Checking NAS device status")
    
    try:
        from services.nas_service import NASDiscoveryService
        
        discovery_service = NASDiscoveryService()
        session = get_session()
        
        devices = session.query(NASDevice).all()
        
        checked_count = 0
        online_count = 0
        
        for device in devices:
            try:
                is_reachable = discovery_service._check_port(device.ip_address, 445) or \
                              discovery_service._check_port(device.ip_address, 2049)
                
                if is_reachable:
                    device.status = 'online'
                    device.last_seen = datetime.utcnow()
                    online_count += 1
                else:
                    device.status = 'offline'
                
                checked_count += 1
            
            except Exception as e:
                logger.error(f"Error checking device {device.ip_address}: {e}")
                device.status = 'error'
        
        session.commit()
        session.close()
        
        logger.info(f"Checked {checked_count} NAS devices, {online_count} online")
        
        return {
            'success': True,
            'checked': checked_count,
            'online': online_count
        }
    
    except Exception as e:
        logger.error(f"Check NAS devices error: {e}")
        return {'success': False, 'message': str(e)}


@celery_app.task(name='auto_mount_nas_shares')
def auto_mount_nas_shares():
    """
    Auto-mount NAS shares on system startup
    Checks for unmounted auto_mount shares and remounts them
    """
    logger.info("Auto-mounting NAS shares")
    
    try:
        session = get_session()
        
        mounts = session.query(NASMount).filter_by(
            auto_mount=True,
            status='unmounted'
        ).all()
        
        mounted_count = 0
        failed_count = 0
        
        for mount in mounts:
            try:
                nas_device = session.query(NASDevice).filter_by(
                    id=mount.nas_device_id
                ).first()
                
                if not nas_device:
                    logger.error(f"NAS device {mount.nas_device_id} not found for mount {mount.id}")
                    failed_count += 1
                    continue
                
                if mount.protocol == 'nfs':
                    success, message = mount_service.mount_nfs_share(
                        nas_device.ip_address,
                        mount.remote_path,
                        mount.mount_point
                    )
                elif mount.protocol == 'smb':
                    share_name = mount.remote_path.strip('/')
                    success, message = mount_service.mount_smb_share(
                        nas_device.ip_address,
                        share_name,
                        mount.mount_point,
                        mount.username
                    )
                else:
                    logger.error(f"Unsupported protocol: {mount.protocol}")
                    failed_count += 1
                    continue
                
                if success:
                    mount.status = 'mounted'
                    mounted_count += 1
                    logger.info(f"Successfully mounted {mount.mount_point}")
                else:
                    failed_count += 1
                    logger.error(f"Failed to mount {mount.mount_point}: {message}")
            
            except Exception as e:
                logger.error(f"Error mounting share {mount.id}: {e}")
                failed_count += 1
        
        session.commit()
        session.close()
        
        logger.info(f"Auto-mount complete: {mounted_count} mounted, {failed_count} failed")
        
        return {
            'success': True,
            'mounted': mounted_count,
            'failed': failed_count
        }
    
    except Exception as e:
        logger.error(f"Auto-mount NAS shares error: {e}")
        return {'success': False, 'message': str(e)}
