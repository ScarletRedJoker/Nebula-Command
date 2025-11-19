"""
Database Administration Service
Handles database credential management, backup/restore, and schema operations
"""

import os
import logging
import psycopg2
import subprocess
from datetime import datetime, timedelta
from cryptography.fernet import Fernet
from base64 import urlsafe_b64encode
from hashlib import sha256
from minio import Minio
from minio.error import S3Error
from io import BytesIO
from config import Config
from services.db_service import db_service
from models.db_admin import DBCredential, DBBackupJob
from sqlalchemy import select, text
import uuid

logger = logging.getLogger(__name__)


class DBAdminService:
    """Database Administration Service"""
    
    def __init__(self):
        """Initialize DB Admin Service with encryption"""
        self._cipher = None
        self._minio_client = None
        self._backup_bucket = 'database-backups'
    
    @property
    def cipher(self):
        """Lazy load Fernet cipher from SECRET_KEY"""
        if not self._cipher:
            secret_key = Config.SECRET_KEY.encode() if isinstance(Config.SECRET_KEY, str) else Config.SECRET_KEY
            key = urlsafe_b64encode(sha256(secret_key).digest())
            self._cipher = Fernet(key)
        return self._cipher
    
    @property
    def minio_client(self):
        """Lazy load MinIO client"""
        if not self._minio_client:
            self._minio_client = Minio(
                Config.MINIO_ENDPOINT,
                access_key=Config.MINIO_ACCESS_KEY,
                secret_key=Config.MINIO_SECRET_KEY,
                secure=Config.MINIO_SECURE
            )
            self._ensure_backup_bucket()
        return self._minio_client
    
    def _ensure_backup_bucket(self):
        """Ensure backup bucket exists in MinIO"""
        try:
            if not self.minio_client.bucket_exists(self._backup_bucket):
                self.minio_client.make_bucket(self._backup_bucket)
                logger.info(f"Created MinIO bucket: {self._backup_bucket}")
        except S3Error as e:
            logger.error(f"Error ensuring backup bucket: {e}")
    
    def encrypt_password(self, password: str) -> str:
        """
        Encrypt a password using Fernet
        
        Args:
            password: Plain text password
            
        Returns:
            Encrypted password as string
        """
        try:
            encrypted = self.cipher.encrypt(password.encode())
            return encrypted.decode()
        except Exception as e:
            logger.error(f"Error encrypting password: {e}")
            raise
    
    def decrypt_password(self, encrypted_password: str) -> str:
        """
        Decrypt a password using Fernet
        
        Args:
            encrypted_password: Encrypted password string
            
        Returns:
            Decrypted password as string
        """
        try:
            decrypted = self.cipher.decrypt(encrypted_password.encode())
            return decrypted.decode()
        except Exception as e:
            logger.error(f"Error decrypting password: {e}")
            raise
    
    def test_connection(self, host: str, port: int, database: str, username: str, password: str) -> dict:
        """
        Test database connection
        
        Args:
            host: Database host
            port: Database port
            database: Database name
            username: Database username
            password: Database password (plaintext)
            
        Returns:
            Dict with connection test result
        """
        conn = None
        try:
            if host not in Config.DB_ADMIN_ALLOWED_HOSTS:
                return {
                    'success': False,
                    'error': f'Host {host} not in allowed hosts list',
                    'status': 'failed'
                }
            
            conn = psycopg2.connect(
                host=host,
                port=port,
                database=database,
                user=username,
                password=password,
                connect_timeout=5
            )
            
            with conn.cursor() as cursor:
                cursor.execute('SELECT version();')
                version = cursor.fetchone()[0]
            
            logger.info(f"Successfully connected to {database}@{host}")
            
            return {
                'success': True,
                'status': 'success',
                'message': 'Connection successful',
                'version': version
            }
        
        except psycopg2.Error as e:
            logger.error(f"Connection test failed for {database}@{host}: {e}")
            return {
                'success': False,
                'status': 'failed',
                'error': str(e)
            }
        
        finally:
            if conn:
                conn.close()
    
    def discover_databases(self, host: str, port: int, username: str, password: str) -> list:
        """
        Discover all databases on a PostgreSQL server
        
        Args:
            host: Database host
            port: Database port
            username: Database username
            password: Database password (plaintext)
            
        Returns:
            List of database names
        """
        conn = None
        try:
            if host not in Config.DB_ADMIN_ALLOWED_HOSTS:
                logger.warning(f"Host {host} not in allowed hosts")
                return []
            
            conn = psycopg2.connect(
                host=host,
                port=port,
                database='postgres',
                user=username,
                password=password,
                connect_timeout=5
            )
            
            with conn.cursor() as cursor:
                cursor.execute("""
                    SELECT datname 
                    FROM pg_database 
                    WHERE datistemplate = false 
                    AND datname NOT IN ('postgres')
                    ORDER BY datname;
                """)
                databases = [row[0] for row in cursor.fetchall()]
            
            logger.info(f"Discovered {len(databases)} databases on {host}")
            return databases
        
        except psycopg2.Error as e:
            logger.error(f"Database discovery failed for {host}: {e}")
            return []
        
        finally:
            if conn:
                conn.close()
    
    def create_database_user(self, host: str, port: int, admin_username: str, admin_password: str, 
                           new_username: str, new_password: str, database: str = None) -> dict:
        """
        Create a new PostgreSQL user
        
        Args:
            host: Database host
            port: Database port
            admin_username: Admin username
            admin_password: Admin password
            new_username: New user to create
            new_password: Password for new user
            database: Optional database to grant access to
            
        Returns:
            Dict with creation result
        """
        conn = None
        try:
            if host not in Config.DB_ADMIN_ALLOWED_HOSTS:
                return {
                    'success': False,
                    'error': f'Host {host} not in allowed hosts'
                }
            
            conn = psycopg2.connect(
                host=host,
                port=port,
                database='postgres',
                user=admin_username,
                password=admin_password
            )
            conn.autocommit = True
            
            with conn.cursor() as cursor:
                cursor.execute(
                    "CREATE USER %s WITH PASSWORD %s;",
                    (new_username, new_password)
                )
                
                if database:
                    cursor.execute(
                        "GRANT ALL PRIVILEGES ON DATABASE %s TO %s;",
                        (database, new_username)
                    )
            
            logger.info(f"Created user {new_username} on {host}")
            
            return {
                'success': True,
                'message': f'User {new_username} created successfully'
            }
        
        except psycopg2.Error as e:
            logger.error(f"User creation failed: {e}")
            return {
                'success': False,
                'error': str(e)
            }
        
        finally:
            if conn:
                conn.close()
    
    def reset_user_password(self, host: str, port: int, admin_username: str, admin_password: str,
                          target_username: str, new_password: str) -> dict:
        """
        Reset a PostgreSQL user's password
        
        Args:
            host: Database host
            port: Database port
            admin_username: Admin username
            admin_password: Admin password
            target_username: User whose password to reset
            new_password: New password
            
        Returns:
            Dict with reset result
        """
        conn = None
        try:
            if host not in Config.DB_ADMIN_ALLOWED_HOSTS:
                return {
                    'success': False,
                    'error': f'Host {host} not in allowed hosts'
                }
            
            conn = psycopg2.connect(
                host=host,
                port=port,
                database='postgres',
                user=admin_username,
                password=admin_password
            )
            conn.autocommit = True
            
            with conn.cursor() as cursor:
                cursor.execute(
                    "ALTER USER %s WITH PASSWORD %s;",
                    (target_username, new_password)
                )
            
            logger.info(f"Reset password for user {target_username} on {host}")
            
            return {
                'success': True,
                'message': f'Password reset for {target_username}'
            }
        
        except psycopg2.Error as e:
            logger.error(f"Password reset failed: {e}")
            return {
                'success': False,
                'error': str(e)
            }
        
        finally:
            if conn:
                conn.close()
    
    def backup_database(self, db_credential_id: uuid.UUID, backup_type: str = 'full', 
                       compression: str = 'gzip') -> dict:
        """
        Create a database backup using pg_dump
        
        Args:
            db_credential_id: ID of database credential
            backup_type: Type of backup ('full', 'schema_only', 'data_only')
            compression: Compression type ('gzip', 'none')
            
        Returns:
            Dict with backup job information
        """
        try:
            if not db_service.is_available:
                return {
                    'success': False,
                    'error': 'Database service not available'
                }
            
            with db_service.get_session() as session:
                credential = session.execute(
                    select(DBCredential).where(DBCredential.id == db_credential_id)
                ).scalar_one_or_none()
                
                if not credential:
                    return {
                        'success': False,
                        'error': 'Database credential not found'
                    }
                
                backup_job = DBBackupJob(
                    db_name=credential.db_name,
                    backup_type=backup_type,
                    status='pending',
                    compression=compression,
                    metadata={
                        'db_credential_id': str(db_credential_id),
                        'host': credential.host,
                        'port': credential.port
                    }
                )
                
                session.add(backup_job)
                session.commit()
                session.refresh(backup_job)
                
                logger.info(f"Created backup job {backup_job.id} for {credential.db_name}")
                
                return {
                    'success': True,
                    'backup_job_id': str(backup_job.id),
                    'backup_job': backup_job.to_dict()
                }
        
        except Exception as e:
            logger.error(f"Error creating backup job: {e}")
            return {
                'success': False,
                'error': str(e)
            }
    
    def execute_backup(self, backup_job_id: uuid.UUID) -> dict:
        """
        Execute pg_dump and upload to MinIO
        
        Args:
            backup_job_id: ID of backup job
            
        Returns:
            Dict with execution result
        """
        try:
            if not db_service.is_available:
                return {
                    'success': False,
                    'error': 'Database service not available'
                }
            
            with db_service.get_session() as session:
                backup_job = session.execute(
                    select(DBBackupJob).where(DBBackupJob.id == backup_job_id)
                ).scalar_one_or_none()
                
                if not backup_job:
                    return {
                        'success': False,
                        'error': 'Backup job not found'
                    }
                
                backup_job.status = 'running'
                backup_job.started_at = datetime.utcnow()
                session.commit()
                
                db_credential_id = uuid.UUID(backup_job.metadata['db_credential_id'])
                credential = session.execute(
                    select(DBCredential).where(DBCredential.id == db_credential_id)
                ).scalar_one_or_none()
                
                if not credential:
                    backup_job.status = 'failed'
                    backup_job.error_message = 'Database credential not found'
                    session.commit()
                    return {
                        'success': False,
                        'error': 'Database credential not found'
                    }
                
                password = self.decrypt_password(credential.password_hash)
                
                timestamp = datetime.utcnow().strftime('%Y%m%d_%H%M%S')
                filename = f"{credential.db_name}_{backup_job.backup_type}_{timestamp}.sql"
                if backup_job.compression == 'gzip':
                    filename += '.gz'
                
                pg_dump_cmd = [
                    'pg_dump',
                    '-h', credential.host,
                    '-p', str(credential.port),
                    '-U', credential.username,
                    '-d', credential.db_name,
                    '-F', 'c'
                ]
                
                if backup_job.backup_type == 'schema_only':
                    pg_dump_cmd.append('--schema-only')
                elif backup_job.backup_type == 'data_only':
                    pg_dump_cmd.append('--data-only')
                
                env = os.environ.copy()
                env['PGPASSWORD'] = password
                
                result = subprocess.run(
                    pg_dump_cmd,
                    env=env,
                    capture_output=True,
                    timeout=3600
                )
                
                if result.returncode != 0:
                    error_msg = result.stderr.decode() if result.stderr else 'Unknown error'
                    backup_job.status = 'failed'
                    backup_job.error_message = error_msg
                    backup_job.completed_at = datetime.utcnow()
                    session.commit()
                    return {
                        'success': False,
                        'error': error_msg
                    }
                
                backup_data = result.stdout
                
                if backup_job.compression == 'gzip':
                    import gzip
                    backup_data = gzip.compress(backup_data)
                
                storage_path = f"{credential.db_name}/{filename}"
                
                self.minio_client.put_object(
                    self._backup_bucket,
                    storage_path,
                    BytesIO(backup_data),
                    len(backup_data),
                    content_type='application/octet-stream'
                )
                
                backup_job.status = 'completed'
                backup_job.storage_path = storage_path
                backup_job.file_size = len(backup_data)
                backup_job.completed_at = datetime.utcnow()
                session.commit()
                
                logger.info(f"Backup completed: {storage_path} ({len(backup_data)} bytes)")
                
                return {
                    'success': True,
                    'backup_job': backup_job.to_dict()
                }
        
        except subprocess.TimeoutExpired:
            logger.error(f"Backup timeout for job {backup_job_id}")
            if db_service.is_available:
                with db_service.get_session() as session:
                    backup_job = session.execute(
                        select(DBBackupJob).where(DBBackupJob.id == backup_job_id)
                    ).scalar_one_or_none()
                    if backup_job:
                        backup_job.status = 'failed'
                        backup_job.error_message = 'Backup timeout (>1 hour)'
                        backup_job.completed_at = datetime.utcnow()
                        session.commit()
            return {
                'success': False,
                'error': 'Backup timeout'
            }
        
        except Exception as e:
            logger.error(f"Backup execution failed: {e}")
            if db_service.is_available:
                with db_service.get_session() as session:
                    backup_job = session.execute(
                        select(DBBackupJob).where(DBBackupJob.id == backup_job_id)
                    ).scalar_one_or_none()
                    if backup_job:
                        backup_job.status = 'failed'
                        backup_job.error_message = str(e)
                        backup_job.completed_at = datetime.utcnow()
                        session.commit()
            return {
                'success': False,
                'error': str(e)
            }
    
    def restore_database(self, backup_job_id: uuid.UUID, target_db_credential_id: uuid.UUID = None) -> dict:
        """
        Restore database from backup using pg_restore
        
        Args:
            backup_job_id: ID of backup job to restore from
            target_db_credential_id: Optional different target database
            
        Returns:
            Dict with restore result
        """
        try:
            if not db_service.is_available:
                return {
                    'success': False,
                    'error': 'Database service not available'
                }
            
            with db_service.get_session() as session:
                backup_job = session.execute(
                    select(DBBackupJob).where(DBBackupJob.id == backup_job_id)
                ).scalar_one_or_none()
                
                if not backup_job or backup_job.status != 'completed':
                    return {
                        'success': False,
                        'error': 'Backup job not found or not completed'
                    }
                
                db_credential_id = target_db_credential_id or uuid.UUID(backup_job.metadata['db_credential_id'])
                
                credential = session.execute(
                    select(DBCredential).where(DBCredential.id == db_credential_id)
                ).scalar_one_or_none()
                
                if not credential:
                    return {
                        'success': False,
                        'error': 'Database credential not found'
                    }
                
                password = self.decrypt_password(credential.password_hash)
                
                response = self.minio_client.get_object(
                    self._backup_bucket,
                    backup_job.storage_path
                )
                backup_data = response.read()
                response.close()
                response.release_conn()
                
                if backup_job.compression == 'gzip':
                    import gzip
                    backup_data = gzip.decompress(backup_data)
                
                pg_restore_cmd = [
                    'pg_restore',
                    '-h', credential.host,
                    '-p', str(credential.port),
                    '-U', credential.username,
                    '-d', credential.db_name,
                    '--clean',
                    '--if-exists'
                ]
                
                env = os.environ.copy()
                env['PGPASSWORD'] = password
                
                result = subprocess.run(
                    pg_restore_cmd,
                    env=env,
                    input=backup_data,
                    capture_output=True,
                    timeout=3600
                )
                
                if result.returncode != 0:
                    error_msg = result.stderr.decode() if result.stderr else 'Unknown error'
                    logger.error(f"Restore failed: {error_msg}")
                    return {
                        'success': False,
                        'error': error_msg
                    }
                
                logger.info(f"Database restored from {backup_job.storage_path}")
                
                return {
                    'success': True,
                    'message': f'Database {credential.db_name} restored successfully'
                }
        
        except Exception as e:
            logger.error(f"Restore failed: {e}")
            return {
                'success': False,
                'error': str(e)
            }
    
    def run_alembic_migration(self, db_credential_id: uuid.UUID, migration_path: str = None) -> dict:
        """
        Run Alembic migrations on a database
        
        Args:
            db_credential_id: ID of database credential
            migration_path: Path to alembic migrations (default: current dir)
            
        Returns:
            Dict with migration result
        """
        try:
            if not db_service.is_available:
                return {
                    'success': False,
                    'error': 'Database service not available'
                }
            
            with db_service.get_session() as session:
                credential = session.execute(
                    select(DBCredential).where(DBCredential.id == db_credential_id)
                ).scalar_one_or_none()
                
                if not credential:
                    return {
                        'success': False,
                        'error': 'Database credential not found'
                    }
                
                password = self.decrypt_password(credential.password_hash)
                
                database_url = f"postgresql://{credential.username}:{password}@{credential.host}:{credential.port}/{credential.db_name}"
                
                env = os.environ.copy()
                env['DATABASE_URL'] = database_url
                
                alembic_cmd = ['alembic', 'upgrade', 'head']
                
                if migration_path:
                    result = subprocess.run(
                        alembic_cmd,
                        cwd=migration_path,
                        env=env,
                        capture_output=True,
                        timeout=300
                    )
                else:
                    result = subprocess.run(
                        alembic_cmd,
                        env=env,
                        capture_output=True,
                        timeout=300
                    )
                
                if result.returncode != 0:
                    error_msg = result.stderr.decode() if result.stderr else 'Unknown error'
                    logger.error(f"Migration failed: {error_msg}")
                    return {
                        'success': False,
                        'error': error_msg
                    }
                
                output = result.stdout.decode() if result.stdout else ''
                
                logger.info(f"Migration completed for {credential.db_name}")
                
                return {
                    'success': True,
                    'message': 'Migrations applied successfully',
                    'output': output
                }
        
        except Exception as e:
            logger.error(f"Migration failed: {e}")
            return {
                'success': False,
                'error': str(e)
            }
    
    def list_backups(self, db_name: str = None, days: int = 90) -> list:
        """
        List all backup jobs
        
        Args:
            db_name: Optional filter by database name
            days: Number of days to look back
            
        Returns:
            List of backup jobs
        """
        try:
            if not db_service.is_available:
                return []
            
            with db_service.get_session() as session:
                cutoff_date = datetime.utcnow() - timedelta(days=days)
                
                query = select(DBBackupJob).where(
                    DBBackupJob.created_at >= cutoff_date
                )
                
                if db_name:
                    query = query.where(DBBackupJob.db_name == db_name)
                
                query = query.order_by(DBBackupJob.created_at.desc())
                
                backups = session.execute(query).scalars().all()
                
                return [backup.to_dict() for backup in backups]
        
        except Exception as e:
            logger.error(f"Error listing backups: {e}")
            return []
    
    def cleanup_old_backups(self, retention_days: int = None) -> dict:
        """
        Delete old backups based on retention policy
        
        Args:
            retention_days: Days to retain (default from config)
            
        Returns:
            Dict with cleanup result
        """
        try:
            retention_days = retention_days or Config.DB_BACKUP_RETENTION_DAYS
            
            if not db_service.is_available:
                return {
                    'success': False,
                    'error': 'Database service not available'
                }
            
            with db_service.get_session() as session:
                cutoff_date = datetime.utcnow() - timedelta(days=retention_days)
                
                old_backups = session.execute(
                    select(DBBackupJob).where(
                        DBBackupJob.created_at < cutoff_date,
                        DBBackupJob.status == 'completed'
                    )
                ).scalars().all()
                
                deleted_count = 0
                freed_bytes = 0
                
                for backup in old_backups:
                    try:
                        if backup.storage_path:
                            self.minio_client.remove_object(
                                self._backup_bucket,
                                backup.storage_path
                            )
                            freed_bytes += backup.file_size or 0
                        
                        session.delete(backup)
                        deleted_count += 1
                    
                    except S3Error as e:
                        logger.error(f"Error deleting backup {backup.id} from MinIO: {e}")
                
                session.commit()
                
                logger.info(f"Cleaned up {deleted_count} old backups, freed {freed_bytes} bytes")
                
                return {
                    'success': True,
                    'deleted_count': deleted_count,
                    'freed_bytes': freed_bytes,
                    'freed_mb': round(freed_bytes / (1024 * 1024), 2)
                }
        
        except Exception as e:
            logger.error(f"Cleanup failed: {e}")
            return {
                'success': False,
                'error': str(e)
            }


db_admin_service = DBAdminService()

__all__ = ['db_admin_service', 'DBAdminService']
