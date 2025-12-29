"""Backup Service - Handles backup creation, restoration, and management"""
import os
import logging
import subprocess
import tarfile
import hashlib
import shutil
from datetime import datetime, timedelta
from pathlib import Path
from typing import Optional, Dict, List, Any
import uuid

logger = logging.getLogger(__name__)

BACKUP_BASE_DIR = os.environ.get('BACKUP_BASE_DIR', '/home/runner/edrake-homelab/services/dashboard/var/backups')
DATABASE_URL = os.environ.get('JARVIS_DATABASE_URL', '')

# MinIO/S3 Configuration
MINIO_ENDPOINT = os.environ.get('MINIO_ENDPOINT', '')
MINIO_ACCESS_KEY = os.environ.get('MINIO_ACCESS_KEY', '')
MINIO_SECRET_KEY = os.environ.get('MINIO_SECRET_KEY', '')
MINIO_BUCKET = os.environ.get('MINIO_BACKUP_BUCKET', 'backups')
MINIO_SECURE = os.environ.get('MINIO_SECURE', 'false').lower() == 'true'


class BackupService:
    """Service for managing system backups"""
    
    def __init__(self):
        self.backup_dir = Path(BACKUP_BASE_DIR)
        self.backup_dir.mkdir(parents=True, exist_ok=True)
        
        self.subdirs = ['databases', 'files', 'docker', 'studio', 'configs']
        for subdir in self.subdirs:
            (self.backup_dir / subdir).mkdir(exist_ok=True)
        
        self._minio_client = None
    
    @property
    def minio_client(self):
        """Lazy-load MinIO client"""
        if self._minio_client is None and MINIO_ENDPOINT:
            try:
                from minio import Minio
                self._minio_client = Minio(
                    MINIO_ENDPOINT,
                    access_key=MINIO_ACCESS_KEY,
                    secret_key=MINIO_SECRET_KEY,
                    secure=MINIO_SECURE
                )
                if not self._minio_client.bucket_exists(MINIO_BUCKET):
                    self._minio_client.make_bucket(MINIO_BUCKET)
                logger.info(f"MinIO client initialized for bucket: {MINIO_BUCKET}")
            except Exception as e:
                logger.warning(f"Failed to initialize MinIO client: {e}")
                self._minio_client = None
        return self._minio_client
    
    def is_minio_available(self) -> bool:
        """Check if MinIO/S3 is configured and available"""
        return self.minio_client is not None
    
    def upload_to_minio(self, local_path: str, remote_path: Optional[str] = None) -> Dict[str, Any]:
        """Upload a backup file to MinIO/S3"""
        if not self.is_minio_available():
            return {'success': False, 'error': 'MinIO/S3 not configured'}
        
        try:
            file_path = Path(local_path)
            if not file_path.exists():
                return {'success': False, 'error': f'File not found: {local_path}'}
            
            object_name = remote_path or file_path.name
            file_size = file_path.stat().st_size
            
            self.minio_client.fput_object(
                MINIO_BUCKET,
                object_name,
                str(file_path)
            )
            
            logger.info(f"Uploaded backup to MinIO: {object_name}")
            
            return {
                'success': True,
                'bucket': MINIO_BUCKET,
                'object_name': object_name,
                'size_bytes': file_size,
                'remote_url': f"s3://{MINIO_BUCKET}/{object_name}"
            }
            
        except Exception as e:
            logger.error(f"MinIO upload failed: {e}")
            return {'success': False, 'error': str(e)}
    
    def download_from_minio(self, object_name: str, local_path: str) -> Dict[str, Any]:
        """Download a backup file from MinIO/S3"""
        if not self.is_minio_available():
            return {'success': False, 'error': 'MinIO/S3 not configured'}
        
        try:
            Path(local_path).parent.mkdir(parents=True, exist_ok=True)
            
            self.minio_client.fget_object(
                MINIO_BUCKET,
                object_name,
                local_path
            )
            
            logger.info(f"Downloaded backup from MinIO: {object_name}")
            
            return {
                'success': True,
                'local_path': local_path,
                'object_name': object_name
            }
            
        except Exception as e:
            logger.error(f"MinIO download failed: {e}")
            return {'success': False, 'error': str(e)}
    
    def delete_from_minio(self, object_name: str) -> Dict[str, Any]:
        """Delete a backup file from MinIO/S3"""
        if not self.is_minio_available():
            return {'success': False, 'error': 'MinIO/S3 not configured'}
        
        try:
            self.minio_client.remove_object(MINIO_BUCKET, object_name)
            logger.info(f"Deleted backup from MinIO: {object_name}")
            return {'success': True}
            
        except Exception as e:
            logger.error(f"MinIO delete failed: {e}")
            return {'success': False, 'error': str(e)}
    
    def list_minio_backups(self) -> Dict[str, Any]:
        """List all backups in MinIO/S3 bucket"""
        if not self.is_minio_available():
            return {'success': False, 'error': 'MinIO/S3 not configured', 'backups': []}
        
        try:
            objects = self.minio_client.list_objects(MINIO_BUCKET, recursive=True)
            backups = []
            
            for obj in objects:
                backups.append({
                    'name': obj.object_name,
                    'size_bytes': obj.size,
                    'size_human': self._format_size(obj.size) if obj.size else None,
                    'last_modified': obj.last_modified.isoformat() if obj.last_modified else None,
                    'storage': 'minio'
                })
            
            return {
                'success': True,
                'backups': backups,
                'bucket': MINIO_BUCKET,
                'total': len(backups)
            }
            
        except Exception as e:
            logger.error(f"Failed to list MinIO backups: {e}")
            return {'success': False, 'error': str(e), 'backups': []}
    
    def create_backup(self, 
                      name: str,
                      backup_type: str,
                      source: str,
                      destination: Optional[str] = None,
                      destination_type: str = 'local',
                      compression: str = 'gzip',
                      metadata: Optional[Dict] = None) -> Dict[str, Any]:
        """
        Create a new backup
        
        Args:
            name: Backup name/label
            backup_type: Type of backup (database, files, docker_volume, studio_project, full)
            source: Source path or database name
            destination: Custom destination path (optional)
            destination_type: Storage type - 'local', 'minio', or 's3'
            compression: Compression type (gzip, none)
            metadata: Additional metadata
            
        Returns:
            Dict with backup result and details
        """
        from services.db_service import db_service
        from models.backups import Backup
        
        backup_id = uuid.uuid4()
        timestamp = datetime.utcnow().strftime('%Y%m%d_%H%M%S')
        
        type_dir = {
            'database': 'databases',
            'files': 'files',
            'docker_volume': 'docker',
            'studio_project': 'studio',
            'full': 'files',
            'incremental': 'files',
            'configs': 'configs'
        }.get(backup_type, 'files')
        
        safe_name = name.replace(' ', '_').replace('/', '_')
        ext = '.sql.gz' if backup_type == 'database' else '.tar.gz'
        local_destination = str(self.backup_dir / type_dir / f"{safe_name}_{timestamp}{ext}")
        
        if not destination:
            destination = local_destination
        
        backup_record = None
        if db_service.is_available:
            try:
                with db_service.get_session() as session:
                    backup_record = Backup(
                        id=backup_id,
                        name=name,
                        backup_type=backup_type,
                        source=source,
                        destination=destination,
                        status='running',
                        started_at=datetime.utcnow(),
                        compression=compression,
                        backup_metadata=metadata or {}
                    )
                    session.add(backup_record)
                    session.commit()
            except Exception as e:
                logger.error(f"Failed to create backup record: {e}")
        
        try:
            if backup_type == 'database':
                result = self._backup_database(source, local_destination, compression)
            elif backup_type == 'docker_volume':
                result = self._backup_docker_volume(source, local_destination, compression)
            elif backup_type == 'studio_project':
                result = self._backup_studio_project(source, local_destination, compression)
            else:
                result = self._backup_files(source, local_destination, compression)
            
            minio_result = None
            remote_url = None
            final_destination = local_destination
            
            if result['success'] and destination_type in ('minio', 's3'):
                object_name = f"{type_dir}/{safe_name}_{timestamp}{ext}"
                minio_result = self.upload_to_minio(local_destination, object_name)
                
                if minio_result['success']:
                    remote_url = minio_result.get('remote_url')
                    final_destination = remote_url
                    logger.info(f"Backup uploaded to MinIO: {remote_url}")
                else:
                    logger.warning(f"MinIO upload failed, keeping local copy: {minio_result.get('error')}")
            
            if db_service.is_available and backup_record:
                with db_service.get_session() as session:
                    from sqlalchemy import select
                    record = session.execute(
                        select(Backup).where(Backup.id == backup_id)
                    ).scalar_one_or_none()
                    
                    if record:
                        record.status = 'completed' if result['success'] else 'failed'
                        record.completed_at = datetime.utcnow()
                        record.size_bytes = result.get('size_bytes', 0)
                        record.checksum = result.get('checksum')
                        record.error = result.get('error')
                        record.destination = final_destination
                        
                        backup_meta = record.backup_metadata or {}
                        backup_meta['destination_type'] = destination_type
                        backup_meta['local_path'] = local_destination
                        if remote_url:
                            backup_meta['remote_url'] = remote_url
                        if result.get('metadata'):
                            backup_meta.update(result['metadata'])
                        record.backup_metadata = backup_meta
                        
                        session.commit()
            
            return {
                'success': result['success'],
                'backup_id': str(backup_id),
                'name': name,
                'destination': final_destination,
                'local_path': local_destination,
                'remote_url': remote_url,
                'destination_type': destination_type,
                'size_bytes': result.get('size_bytes', 0),
                'checksum': result.get('checksum'),
                'error': result.get('error'),
                'duration_seconds': (datetime.utcnow() - (backup_record.started_at if backup_record else datetime.utcnow())).total_seconds() if backup_record else 0
            }
            
        except Exception as e:
            logger.error(f"Backup failed: {e}")
            
            if db_service.is_available and backup_record:
                try:
                    with db_service.get_session() as session:
                        from sqlalchemy import select
                        record = session.execute(
                            select(Backup).where(Backup.id == backup_id)
                        ).scalar_one_or_none()
                        
                        if record:
                            record.status = 'failed'
                            record.completed_at = datetime.utcnow()
                            record.error = str(e)
                            session.commit()
                except Exception as db_error:
                    logger.error(f"Failed to update backup record: {db_error}")
            
            return {
                'success': False,
                'backup_id': str(backup_id),
                'error': str(e)
            }
    
    def _backup_database(self, database_name: str, destination: str, compression: str) -> Dict[str, Any]:
        """Create a PostgreSQL database dump"""
        try:
            if not DATABASE_URL:
                return {'success': False, 'error': 'Database URL not configured'}
            
            from urllib.parse import urlparse
            parsed = urlparse(DATABASE_URL)
            
            env = os.environ.copy()
            env['PGPASSWORD'] = parsed.password or ''
            
            pg_dump_cmd = [
                'pg_dump',
                '-h', parsed.hostname or 'localhost',
                '-p', str(parsed.port or 5432),
                '-U', parsed.username or 'postgres',
                '-d', database_name if database_name != 'default' else parsed.path.lstrip('/'),
                '--no-owner',
                '--no-acl'
            ]
            
            dest_path = Path(destination)
            dest_path.parent.mkdir(parents=True, exist_ok=True)
            
            if compression == 'gzip':
                with open(destination, 'wb') as f:
                    dump_proc = subprocess.Popen(
                        pg_dump_cmd,
                        stdout=subprocess.PIPE,
                        stderr=subprocess.PIPE,
                        env=env
                    )
                    
                    import gzip
                    with gzip.GzipFile(fileobj=f, mode='wb') as gz:
                        for chunk in iter(lambda: dump_proc.stdout.read(8192), b''):
                            gz.write(chunk)
                    
                    _, stderr = dump_proc.communicate()
                    
                    if dump_proc.returncode != 0:
                        return {
                            'success': False,
                            'error': stderr.decode() if stderr else 'pg_dump failed'
                        }
            else:
                with open(destination, 'wb') as f:
                    result = subprocess.run(
                        pg_dump_cmd,
                        stdout=f,
                        stderr=subprocess.PIPE,
                        env=env
                    )
                    
                    if result.returncode != 0:
                        return {
                            'success': False,
                            'error': result.stderr.decode() if result.stderr else 'pg_dump failed'
                        }
            
            size_bytes = os.path.getsize(destination)
            checksum = self._calculate_checksum(destination)
            
            return {
                'success': True,
                'size_bytes': size_bytes,
                'checksum': checksum,
                'metadata': {'database': database_name}
            }
            
        except Exception as e:
            logger.error(f"Database backup failed: {e}")
            return {'success': False, 'error': str(e)}
    
    def _backup_files(self, source: str, destination: str, compression: str) -> Dict[str, Any]:
        """Create a tar archive of files/directories"""
        try:
            source_path = Path(source)
            if not source_path.exists():
                return {'success': False, 'error': f'Source path does not exist: {source}'}
            
            dest_path = Path(destination)
            dest_path.parent.mkdir(parents=True, exist_ok=True)
            
            mode = 'w:gz' if compression == 'gzip' else 'w'
            file_count = 0
            
            with tarfile.open(destination, mode) as tar:
                if source_path.is_dir():
                    for item in source_path.rglob('*'):
                        if item.is_file():
                            arcname = item.relative_to(source_path.parent)
                            tar.add(str(item), arcname=str(arcname))
                            file_count += 1
                else:
                    tar.add(str(source_path), arcname=source_path.name)
                    file_count = 1
            
            size_bytes = os.path.getsize(destination)
            checksum = self._calculate_checksum(destination)
            
            return {
                'success': True,
                'size_bytes': size_bytes,
                'checksum': checksum,
                'metadata': {'file_count': file_count, 'source_path': source}
            }
            
        except Exception as e:
            logger.error(f"File backup failed: {e}")
            return {'success': False, 'error': str(e)}
    
    def _backup_docker_volume(self, volume_name: str, destination: str, compression: str) -> Dict[str, Any]:
        """Backup a Docker volume"""
        try:
            import docker
            client = docker.from_env()
            
            try:
                client.volumes.get(volume_name)
            except docker.errors.NotFound:
                return {'success': False, 'error': f'Docker volume not found: {volume_name}'}
            
            dest_path = Path(destination)
            dest_path.parent.mkdir(parents=True, exist_ok=True)
            
            container = client.containers.run(
                'alpine',
                f'tar czf /backup/backup.tar.gz -C /data .',
                volumes={
                    volume_name: {'bind': '/data', 'mode': 'ro'},
                    str(dest_path.parent): {'bind': '/backup', 'mode': 'rw'}
                },
                remove=True,
                detach=False
            )
            
            temp_backup = dest_path.parent / 'backup.tar.gz'
            if temp_backup.exists():
                shutil.move(str(temp_backup), destination)
            
            size_bytes = os.path.getsize(destination)
            checksum = self._calculate_checksum(destination)
            
            return {
                'success': True,
                'size_bytes': size_bytes,
                'checksum': checksum,
                'metadata': {'volume_name': volume_name}
            }
            
        except ImportError:
            return {'success': False, 'error': 'Docker SDK not available'}
        except Exception as e:
            logger.error(f"Docker volume backup failed: {e}")
            return {'success': False, 'error': str(e)}
    
    def _backup_studio_project(self, project_path: str, destination: str, compression: str) -> Dict[str, Any]:
        """Backup a Nebula Studio project"""
        try:
            from services.db_service import db_service
            
            source_path = Path(project_path)
            if not source_path.exists():
                return {'success': False, 'error': f'Project path does not exist: {project_path}'}
            
            dest_path = Path(destination)
            dest_path.parent.mkdir(parents=True, exist_ok=True)
            
            mode = 'w:gz' if compression == 'gzip' else 'w'
            file_count = 0
            
            exclude_patterns = {'.git', 'node_modules', '__pycache__', '.env', 'venv', '.venv'}
            
            with tarfile.open(destination, mode) as tar:
                for item in source_path.rglob('*'):
                    if any(excl in item.parts for excl in exclude_patterns):
                        continue
                    if item.is_file():
                        arcname = item.relative_to(source_path.parent)
                        tar.add(str(item), arcname=str(arcname))
                        file_count += 1
            
            size_bytes = os.path.getsize(destination)
            checksum = self._calculate_checksum(destination)
            
            return {
                'success': True,
                'size_bytes': size_bytes,
                'checksum': checksum,
                'metadata': {'file_count': file_count, 'project_path': project_path}
            }
            
        except Exception as e:
            logger.error(f"Studio project backup failed: {e}")
            return {'success': False, 'error': str(e)}
    
    def restore_backup(self, backup_id: str, target_path: Optional[str] = None) -> Dict[str, Any]:
        """
        Restore a backup
        
        Args:
            backup_id: ID of the backup to restore
            target_path: Optional custom target path (defaults to original source)
            
        Returns:
            Dict with restore result
        """
        from services.db_service import db_service
        from models.backups import Backup
        from sqlalchemy import select
        
        if not db_service.is_available:
            return {'success': False, 'error': 'Database service not available'}
        
        try:
            with db_service.get_session() as session:
                backup = session.execute(
                    select(Backup).where(Backup.id == uuid.UUID(backup_id))
                ).scalar_one_or_none()
                
                if not backup:
                    return {'success': False, 'error': 'Backup not found'}
                
                if not os.path.exists(backup.destination):
                    return {'success': False, 'error': 'Backup file not found on disk'}
                
                backup.status = 'restoring'
                session.commit()
                
                restore_target = target_path or backup.source
                
                try:
                    if backup.backup_type == 'database':
                        result = self._restore_database(backup.destination, restore_target, backup.compression)
                    elif backup.backup_type == 'docker_volume':
                        result = self._restore_docker_volume(backup.destination, restore_target)
                    else:
                        result = self._restore_files(backup.destination, restore_target)
                    
                    backup.status = 'completed'
                    session.commit()
                    
                    return {
                        'success': result['success'],
                        'backup_id': backup_id,
                        'restored_to': restore_target,
                        'error': result.get('error')
                    }
                    
                except Exception as e:
                    backup.status = 'completed'
                    session.commit()
                    raise e
                    
        except Exception as e:
            logger.error(f"Restore failed: {e}")
            return {'success': False, 'error': str(e)}
    
    def _restore_database(self, backup_path: str, database_name: str, compression: str) -> Dict[str, Any]:
        """Restore a PostgreSQL database from backup"""
        try:
            if not DATABASE_URL:
                return {'success': False, 'error': 'Database URL not configured'}
            
            from urllib.parse import urlparse
            parsed = urlparse(DATABASE_URL)
            
            env = os.environ.copy()
            env['PGPASSWORD'] = parsed.password or ''
            
            psql_cmd = [
                'psql',
                '-h', parsed.hostname or 'localhost',
                '-p', str(parsed.port or 5432),
                '-U', parsed.username or 'postgres',
                '-d', database_name if database_name != 'default' else parsed.path.lstrip('/'),
            ]
            
            if compression == 'gzip' or backup_path.endswith('.gz'):
                import gzip
                with gzip.open(backup_path, 'rb') as f:
                    result = subprocess.run(
                        psql_cmd,
                        stdin=f,
                        stdout=subprocess.PIPE,
                        stderr=subprocess.PIPE,
                        env=env
                    )
            else:
                with open(backup_path, 'rb') as f:
                    result = subprocess.run(
                        psql_cmd,
                        stdin=f,
                        stdout=subprocess.PIPE,
                        stderr=subprocess.PIPE,
                        env=env
                    )
            
            if result.returncode != 0:
                return {
                    'success': False,
                    'error': result.stderr.decode() if result.stderr else 'psql restore failed'
                }
            
            return {'success': True}
            
        except Exception as e:
            logger.error(f"Database restore failed: {e}")
            return {'success': False, 'error': str(e)}
    
    def _restore_files(self, backup_path: str, target_path: str) -> Dict[str, Any]:
        """Restore files from a tar archive"""
        try:
            target = Path(target_path)
            target.mkdir(parents=True, exist_ok=True)
            
            with tarfile.open(backup_path, 'r:*') as tar:
                tar.extractall(path=str(target.parent))
            
            return {'success': True}
            
        except Exception as e:
            logger.error(f"File restore failed: {e}")
            return {'success': False, 'error': str(e)}
    
    def _restore_docker_volume(self, backup_path: str, volume_name: str) -> Dict[str, Any]:
        """Restore a Docker volume from backup"""
        try:
            import docker
            client = docker.from_env()
            
            try:
                client.volumes.get(volume_name)
            except docker.errors.NotFound:
                client.volumes.create(volume_name)
            
            backup_dir = str(Path(backup_path).parent)
            backup_file = Path(backup_path).name
            
            container = client.containers.run(
                'alpine',
                f'tar xzf /backup/{backup_file} -C /data',
                volumes={
                    volume_name: {'bind': '/data', 'mode': 'rw'},
                    backup_dir: {'bind': '/backup', 'mode': 'ro'}
                },
                remove=True,
                detach=False
            )
            
            return {'success': True}
            
        except ImportError:
            return {'success': False, 'error': 'Docker SDK not available'}
        except Exception as e:
            logger.error(f"Docker volume restore failed: {e}")
            return {'success': False, 'error': str(e)}
    
    def list_backups(self, 
                     backup_type: Optional[str] = None,
                     status: Optional[str] = None,
                     limit: int = 50,
                     offset: int = 0) -> Dict[str, Any]:
        """List backups from database"""
        from services.db_service import db_service
        from models.backups import Backup
        from sqlalchemy import select, func, desc
        
        if not db_service.is_available:
            return self._list_backups_from_disk()
        
        try:
            with db_service.get_session() as session:
                query = select(Backup)
                count_query = select(func.count()).select_from(Backup)
                
                if backup_type:
                    query = query.where(Backup.backup_type == backup_type)
                    count_query = count_query.where(Backup.backup_type == backup_type)
                
                if status:
                    query = query.where(Backup.status == status)
                    count_query = count_query.where(Backup.status == status)
                
                total = session.execute(count_query).scalar()
                
                backups = session.execute(
                    query.order_by(desc(Backup.created_at))
                    .offset(offset)
                    .limit(limit)
                ).scalars().all()
                
                return {
                    'success': True,
                    'backups': [b.to_dict() for b in backups],
                    'total': total,
                    'limit': limit,
                    'offset': offset
                }
                
        except Exception as e:
            logger.error(f"Failed to list backups: {e}")
            return {'success': False, 'error': str(e)}
    
    def _list_backups_from_disk(self) -> Dict[str, Any]:
        """Fallback: list backup files from disk"""
        backups = []
        
        for subdir in self.subdirs:
            dir_path = self.backup_dir / subdir
            if dir_path.exists():
                for backup_file in dir_path.glob('*'):
                    if backup_file.is_file():
                        stat = backup_file.stat()
                        backups.append({
                            'id': str(uuid.uuid4()),
                            'name': backup_file.stem,
                            'backup_type': subdir,
                            'destination': str(backup_file),
                            'size_bytes': stat.st_size,
                            'size_human': self._format_size(stat.st_size),
                            'created_at': datetime.fromtimestamp(stat.st_mtime).isoformat(),
                            'status': 'completed'
                        })
        
        backups.sort(key=lambda x: x['created_at'], reverse=True)
        
        return {
            'success': True,
            'backups': backups,
            'total': len(backups),
            'source': 'disk'
        }
    
    def delete_backup(self, backup_id: str, delete_file: bool = True) -> Dict[str, Any]:
        """Delete a backup record and optionally the file"""
        from services.db_service import db_service
        from models.backups import Backup
        from sqlalchemy import select
        
        if not db_service.is_available:
            return {'success': False, 'error': 'Database service not available'}
        
        try:
            with db_service.get_session() as session:
                backup = session.execute(
                    select(Backup).where(Backup.id == uuid.UUID(backup_id))
                ).scalar_one_or_none()
                
                if not backup:
                    return {'success': False, 'error': 'Backup not found'}
                
                if delete_file and backup.destination:
                    try:
                        if os.path.exists(backup.destination):
                            os.remove(backup.destination)
                    except Exception as e:
                        logger.warning(f"Failed to delete backup file: {e}")
                
                session.delete(backup)
                session.commit()
                
                return {'success': True, 'message': 'Backup deleted'}
                
        except Exception as e:
            logger.error(f"Failed to delete backup: {e}")
            return {'success': False, 'error': str(e)}
    
    def cleanup_old_backups(self, schedule_id: Optional[str] = None) -> Dict[str, Any]:
        """Delete backups older than retention period"""
        from services.db_service import db_service
        from models.backups import Backup, BackupSchedule
        from sqlalchemy import select, and_
        
        if not db_service.is_available:
            return {'success': False, 'error': 'Database service not available'}
        
        deleted_count = 0
        freed_bytes = 0
        
        try:
            with db_service.get_session() as session:
                if schedule_id:
                    schedule = session.execute(
                        select(BackupSchedule).where(BackupSchedule.id == uuid.UUID(schedule_id))
                    ).scalar_one_or_none()
                    
                    if not schedule:
                        return {'success': False, 'error': 'Schedule not found'}
                    
                    schedules = [schedule]
                else:
                    schedules = session.execute(select(BackupSchedule)).scalars().all()
                
                for schedule in schedules:
                    cutoff_date = datetime.utcnow() - timedelta(days=schedule.retention_days)
                    
                    old_backups = session.execute(
                        select(Backup).where(
                            and_(
                                Backup.schedule_id == schedule.id,
                                Backup.created_at < cutoff_date
                            )
                        )
                    ).scalars().all()
                    
                    for backup in old_backups:
                        if backup.destination and os.path.exists(backup.destination):
                            try:
                                freed_bytes += os.path.getsize(backup.destination)
                                os.remove(backup.destination)
                            except Exception as e:
                                logger.warning(f"Failed to delete file: {e}")
                        
                        session.delete(backup)
                        deleted_count += 1
                
                session.commit()
                
                return {
                    'success': True,
                    'deleted_count': deleted_count,
                    'freed_bytes': freed_bytes,
                    'freed_human': self._format_size(freed_bytes)
                }
                
        except Exception as e:
            logger.error(f"Cleanup failed: {e}")
            return {'success': False, 'error': str(e)}
    
    def get_storage_stats(self) -> Dict[str, Any]:
        """Get backup storage statistics"""
        try:
            total_size = 0
            backup_counts = {}
            
            for subdir in self.subdirs:
                dir_path = self.backup_dir / subdir
                subdir_size = 0
                subdir_count = 0
                
                if dir_path.exists():
                    for backup_file in dir_path.glob('*'):
                        if backup_file.is_file():
                            subdir_size += backup_file.stat().st_size
                            subdir_count += 1
                
                backup_counts[subdir] = {
                    'count': subdir_count,
                    'size_bytes': subdir_size,
                    'size_human': self._format_size(subdir_size)
                }
                total_size += subdir_size
            
            disk_usage = shutil.disk_usage(self.backup_dir)
            
            return {
                'success': True,
                'total_backup_size': total_size,
                'total_backup_size_human': self._format_size(total_size),
                'by_type': backup_counts,
                'disk': {
                    'total': disk_usage.total,
                    'used': disk_usage.used,
                    'free': disk_usage.free,
                    'percent_used': round((disk_usage.used / disk_usage.total) * 100, 1)
                },
                'backup_directory': str(self.backup_dir)
            }
            
        except Exception as e:
            logger.error(f"Failed to get storage stats: {e}")
            return {'success': False, 'error': str(e)}
    
    def _calculate_checksum(self, file_path: str) -> str:
        """Calculate SHA256 checksum of a file"""
        sha256_hash = hashlib.sha256()
        with open(file_path, 'rb') as f:
            for chunk in iter(lambda: f.read(8192), b''):
                sha256_hash.update(chunk)
        return sha256_hash.hexdigest()
    
    def _format_size(self, size_bytes: int) -> str:
        """Format bytes to human readable string"""
        for unit in ['B', 'KB', 'MB', 'GB', 'TB']:
            if size_bytes < 1024:
                return f"{size_bytes:.2f} {unit}"
            size_bytes /= 1024
        return f"{size_bytes:.2f} PB"
    
    def list_schedules(self) -> Dict[str, Any]:
        """List all backup schedules"""
        from services.db_service import db_service
        from models.backups import BackupSchedule
        from sqlalchemy import select
        
        if not db_service.is_available:
            return {'success': False, 'error': 'Database service not available'}
        
        try:
            with db_service.get_session() as session:
                schedules = session.execute(
                    select(BackupSchedule).order_by(BackupSchedule.name)
                ).scalars().all()
                
                return {
                    'success': True,
                    'schedules': [s.to_dict() for s in schedules]
                }
                
        except Exception as e:
            logger.error(f"Failed to list schedules: {e}")
            return {'success': False, 'error': str(e)}
    
    def create_schedule(self, data: Dict[str, Any]) -> Dict[str, Any]:
        """Create a new backup schedule"""
        from services.db_service import db_service
        from models.backups import BackupSchedule
        
        if not db_service.is_available:
            return {'success': False, 'error': 'Database service not available'}
        
        required_fields = ['name', 'backup_type', 'source', 'cron_expression']
        for field in required_fields:
            if field not in data:
                return {'success': False, 'error': f'Missing required field: {field}'}
        
        try:
            with db_service.get_session() as session:
                schedule = BackupSchedule(
                    name=data['name'],
                    backup_type=data['backup_type'],
                    source=data['source'],
                    destination=data.get('destination', ''),
                    cron_expression=data['cron_expression'],
                    enabled=data.get('enabled', True),
                    retention_days=data.get('retention_days', 30),
                    retention_count=data.get('retention_count'),
                    compression=data.get('compression', 'gzip'),
                    schedule_metadata=data.get('metadata')
                )
                
                session.add(schedule)
                session.commit()
                
                return {
                    'success': True,
                    'schedule': schedule.to_dict()
                }
                
        except Exception as e:
            logger.error(f"Failed to create schedule: {e}")
            return {'success': False, 'error': str(e)}
    
    def update_schedule(self, schedule_id: str, data: Dict[str, Any]) -> Dict[str, Any]:
        """Update a backup schedule"""
        from services.db_service import db_service
        from models.backups import BackupSchedule
        from sqlalchemy import select
        
        if not db_service.is_available:
            return {'success': False, 'error': 'Database service not available'}
        
        try:
            with db_service.get_session() as session:
                schedule = session.execute(
                    select(BackupSchedule).where(BackupSchedule.id == uuid.UUID(schedule_id))
                ).scalar_one_or_none()
                
                if not schedule:
                    return {'success': False, 'error': 'Schedule not found'}
                
                updatable_fields = [
                    'name', 'backup_type', 'source', 'destination', 
                    'cron_expression', 'enabled', 'retention_days', 
                    'retention_count', 'compression'
                ]
                
                for field in updatable_fields:
                    if field in data:
                        setattr(schedule, field, data[field])
                
                if 'metadata' in data:
                    schedule.schedule_metadata = data['metadata']
                
                session.commit()
                
                return {
                    'success': True,
                    'schedule': schedule.to_dict()
                }
                
        except Exception as e:
            logger.error(f"Failed to update schedule: {e}")
            return {'success': False, 'error': str(e)}
    
    def delete_schedule(self, schedule_id: str) -> Dict[str, Any]:
        """Delete a backup schedule"""
        from services.db_service import db_service
        from models.backups import BackupSchedule
        from sqlalchemy import select
        
        if not db_service.is_available:
            return {'success': False, 'error': 'Database service not available'}
        
        try:
            with db_service.get_session() as session:
                schedule = session.execute(
                    select(BackupSchedule).where(BackupSchedule.id == uuid.UUID(schedule_id))
                ).scalar_one_or_none()
                
                if not schedule:
                    return {'success': False, 'error': 'Schedule not found'}
                
                session.delete(schedule)
                session.commit()
                
                return {'success': True, 'message': 'Schedule deleted'}
                
        except Exception as e:
            logger.error(f"Failed to delete schedule: {e}")
            return {'success': False, 'error': str(e)}
    
    def get_backup_sources(self) -> Dict[str, Any]:
        """Get available backup sources (databases, volumes, projects)"""
        sources = {
            'databases': [],
            'docker_volumes': [],
            'studio_projects': [],
            'directories': []
        }
        
        if DATABASE_URL:
            from urllib.parse import urlparse
            parsed = urlparse(DATABASE_URL)
            db_name = parsed.path.lstrip('/')
            sources['databases'].append({
                'name': db_name,
                'type': 'postgresql',
                'host': parsed.hostname
            })
        
        try:
            import docker
            client = docker.from_env()
            volumes = client.volumes.list()
            for vol in volumes:
                sources['docker_volumes'].append({
                    'name': vol.name,
                    'driver': vol.attrs.get('Driver', 'local'),
                    'created': vol.attrs.get('CreatedAt')
                })
        except Exception:
            pass
        
        try:
            from services.db_service import db_service
            if db_service.is_available:
                from models.studio import StudioProject
                from sqlalchemy import select
                
                with db_service.get_session() as session:
                    projects = session.execute(select(StudioProject)).scalars().all()
                    for project in projects:
                        sources['studio_projects'].append({
                            'id': str(project.id),
                            'name': project.name,
                            'path': project.workspace_path
                        })
        except Exception:
            pass
        
        common_dirs = [
            '/home/runner/edrake-homelab/config',
            '/home/runner/edrake-homelab/services/dashboard/data',
            '/home/runner/edrake-homelab/services/dashboard/static/uploads'
        ]
        
        for dir_path in common_dirs:
            if os.path.exists(dir_path):
                sources['directories'].append({
                    'path': dir_path,
                    'name': os.path.basename(dir_path)
                })
        
        return {'success': True, 'sources': sources}


backup_service = BackupService()
