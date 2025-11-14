import os
import shutil
import hashlib
import logging
import zipfile
import time
from datetime import timedelta
from typing import Optional, Dict, List, BinaryIO
from minio import Minio
from minio.error import S3Error
from werkzeug.utils import secure_filename
from config import Config
from services.file_validator import file_validator

logger = logging.getLogger(__name__)

class UploadService:
    """Handles file uploads to MinIO object storage with lazy initialization"""
    
    BUCKETS = ['artifacts', 'deployments', 'backups']
    MAX_RETRIES = 5
    INITIAL_RETRY_DELAY = 1
    MAX_RETRY_DELAY = 30
    
    def __init__(self):
        """Initialize upload service with lazy MinIO client initialization"""
        self.minio_client = None
        self.initialized = False
        self.init_attempted = False
        self.last_init_attempt = 0
        logger.info("Upload service created (MinIO client will be initialized on first use)")
    
    def _initialize_client(self, force: bool = False):
        """
        Initialize MinIO client with retry logic and exponential backoff
        
        Args:
            force: Force re-initialization even if already attempted
        """
        if self.initialized and not force:
            return True
        
        if self.init_attempted and not force:
            if time.time() - self.last_init_attempt < 60:
                return self.initialized
        
        self.init_attempted = True
        self.last_init_attempt = time.time()
        retry_delay = self.INITIAL_RETRY_DELAY
        
        for attempt in range(1, self.MAX_RETRIES + 1):
            try:
                logger.info(f"Attempting to initialize MinIO client (attempt {attempt}/{self.MAX_RETRIES})...")
                
                self.minio_client = Minio(
                    Config.MINIO_ENDPOINT,
                    access_key=Config.MINIO_ACCESS_KEY,
                    secret_key=Config.MINIO_SECRET_KEY,
                    secure=Config.MINIO_SECURE
                )
                
                # Test connection
                self.minio_client.list_buckets()
                
                # Create buckets if they don't exist
                for bucket in self.BUCKETS:
                    if not self.minio_client.bucket_exists(bucket):
                        self.minio_client.make_bucket(bucket)
                        logger.info(f"Created MinIO bucket: {bucket}")
                    else:
                        logger.debug(f"MinIO bucket exists: {bucket}")
                
                self.initialized = True
                logger.info("✓ MinIO upload service initialized successfully")
                return True
                
            except Exception as e:
                logger.warning(f"MinIO initialization attempt {attempt} failed: {e}")
                
                if attempt < self.MAX_RETRIES:
                    logger.info(f"Retrying in {retry_delay} seconds...")
                    time.sleep(retry_delay)
                    retry_delay = min(retry_delay * 2, self.MAX_RETRY_DELAY)
                else:
                    logger.error(f"Failed to initialize MinIO after {self.MAX_RETRIES} attempts. Service will retry on next operation.")
                    self.initialized = False
                    return False
        
        return False
    
    def _ensure_initialized(self):
        """Ensure MinIO client is initialized before operations"""
        if not self.initialized:
            success = self._initialize_client()
            if not success:
                raise RuntimeError(
                    "MinIO client not initialized and initialization failed. "
                    "Please check that MinIO is running and accessible."
                )
    
    def calculate_checksum(self, file_path: str) -> str:
        """
        Calculate SHA256 checksum of a file
        
        Args:
            file_path: Path to the file
            
        Returns:
            Hex digest of SHA256 hash
        """
        sha256_hash = hashlib.sha256()
        with open(file_path, "rb") as f:
            for byte_block in iter(lambda: f.read(4096), b""):
                sha256_hash.update(byte_block)
        return sha256_hash.hexdigest()
    
    def upload_file(
        self,
        file_path: str,
        original_filename: str,
        bucket: str = 'artifacts',
        object_name: Optional[str] = None
    ) -> Dict:
        """
        Upload a file to MinIO with automatic initialization
        
        Args:
            file_path: Path to the file to upload
            original_filename: Original name of the file
            bucket: Target bucket (default: artifacts)
            object_name: Custom object name (optional)
            
        Returns:
            Dictionary with upload information
        """
        self._ensure_initialized()
        
        # Validate file
        file_size = os.path.getsize(file_path)
        is_valid, error = file_validator.validate_file(file_path, original_filename, file_size)
        if not is_valid:
            raise ValueError(f"File validation failed: {error}")
        
        # Sanitize filename
        safe_filename = file_validator.sanitize_filename(original_filename)
        
        # Generate object name if not provided
        if object_name is None:
            checksum = self.calculate_checksum(file_path)
            ext = os.path.splitext(safe_filename)[1]
            object_name = f"{checksum[:16]}_{safe_filename}"
        
        try:
            # Upload file
            self.minio_client.fput_object(
                bucket,
                object_name,
                file_path
            )
            
            checksum = self.calculate_checksum(file_path)
            
            logger.info(f"Uploaded file to MinIO: {bucket}/{object_name}")
            
            return {
                'bucket': bucket,
                'object_name': object_name,
                'original_filename': original_filename,
                'safe_filename': safe_filename,
                'file_size': file_size,
                'checksum_sha256': checksum,
                'storage_path': f"{bucket}/{object_name}"
            }
        
        except S3Error as e:
            logger.error(f"MinIO upload error: {e}")
            raise RuntimeError(f"Failed to upload file to storage: {str(e)}")
    
    def upload_zip(
        self,
        zip_path: str,
        original_filename: str,
        extract: bool = False,
        bucket: str = 'artifacts'
    ) -> Dict:
        """
        Upload a zip file, optionally extracting contents
        
        Args:
            zip_path: Path to zip file
            original_filename: Original filename
            extract: Whether to extract contents (default: False)
            bucket: Target bucket
            
        Returns:
            Dictionary with upload information
        """
        # Validate zip
        is_valid, error, file_list = file_validator.validate_zip_contents(zip_path)
        if not is_valid:
            raise ValueError(f"Zip validation failed: {error}")
        
        if not extract:
            # Upload zip as-is
            return self.upload_file(zip_path, original_filename, bucket)
        
        # Extract and upload contents
        extracted_files = []
        temp_extract_dir = f"{Config.UPLOAD_FOLDER}/extracted_{os.path.basename(zip_path)}"
        
        try:
            os.makedirs(temp_extract_dir, exist_ok=True)
            
            with zipfile.ZipFile(zip_path, 'r') as zip_ref:
                zip_ref.extractall(temp_extract_dir)
            
            # Upload each extracted file
            for root, dirs, files in os.walk(temp_extract_dir):
                for filename in files:
                    file_path = os.path.join(root, filename)
                    rel_path = os.path.relpath(file_path, temp_extract_dir)
                    
                    upload_info = self.upload_file(
                        file_path,
                        filename,
                        bucket,
                        object_name=f"extracted/{rel_path}"
                    )
                    extracted_files.append(upload_info)
            
            return {
                'zip_uploaded': False,
                'extracted': True,
                'files': extracted_files,
                'total_files': len(extracted_files)
            }
        
        finally:
            # Cleanup temp directory
            if os.path.exists(temp_extract_dir):
                shutil.rmtree(temp_extract_dir)
    
    def upload_directory(
        self,
        directory_path: str,
        bucket: str = 'artifacts',
        prefix: Optional[str] = None
    ) -> Dict:
        """
        Upload entire directory to MinIO
        
        Args:
            directory_path: Path to directory
            bucket: Target bucket
            prefix: Optional prefix for object names
            
        Returns:
            Dictionary with upload information
        """
        if not os.path.isdir(directory_path):
            raise ValueError(f"Not a directory: {directory_path}")
        
        uploaded_files = []
        
        for root, dirs, files in os.walk(directory_path):
            for filename in files:
                file_path = os.path.join(root, filename)
                rel_path = os.path.relpath(file_path, directory_path)
                
                object_name = f"{prefix}/{rel_path}" if prefix else rel_path
                
                try:
                    upload_info = self.upload_file(file_path, filename, bucket, object_name)
                    uploaded_files.append(upload_info)
                except Exception as e:
                    logger.error(f"Failed to upload {file_path}: {e}")
        
        return {
            'directory': directory_path,
            'files': uploaded_files,
            'total_files': len(uploaded_files)
        }
    
    def list_artifacts(self, bucket: str = 'artifacts', prefix: str = '') -> List[Dict]:
        """
        List artifacts in a bucket
        
        Args:
            bucket: Bucket name
            prefix: Object prefix filter
            
        Returns:
            List of artifact information
        """
        self._ensure_initialized()
        
        artifacts = []
        try:
            objects = self.minio_client.list_objects(bucket, prefix=prefix, recursive=True)
            
            for obj in objects:
                artifacts.append({
                    'bucket': bucket,
                    'object_name': obj.object_name,
                    'size': obj.size,
                    'last_modified': obj.last_modified.isoformat() if obj.last_modified else None,
                    'etag': obj.etag
                })
            
            return artifacts
        
        except S3Error as e:
            logger.error(f"Error listing artifacts: {e}")
            raise RuntimeError(f"Failed to list artifacts: {str(e)}")
    
    def delete_artifact(self, bucket: str, object_name: str) -> bool:
        """
        Delete an artifact from MinIO
        
        Args:
            bucket: Bucket name
            object_name: Object name
            
        Returns:
            True if successful
        """
        self._ensure_initialized()
        
        try:
            self.minio_client.remove_object(bucket, object_name)
            logger.info(f"Deleted artifact: {bucket}/{object_name}")
            return True
        
        except S3Error as e:
            logger.error(f"Error deleting artifact: {e}")
            raise RuntimeError(f"Failed to delete artifact: {str(e)}")
    
    def get_artifact_url(
        self,
        bucket: str,
        object_name: str,
        expires: timedelta = timedelta(hours=1)
    ) -> str:
        """
        Generate pre-signed download URL for an artifact
        
        Args:
            bucket: Bucket name
            object_name: Object name
            expires: URL expiration time
            
        Returns:
            Pre-signed URL
        """
        self._ensure_initialized()
        
        try:
            url = self.minio_client.presigned_get_object(bucket, object_name, expires=expires)
            return url
        
        except S3Error as e:
            logger.error(f"Error generating artifact URL: {e}")
            raise RuntimeError(f"Failed to generate download URL: {str(e)}")
    
    def get_artifact(self, bucket: str, object_name: str, download_path: str) -> str:
        """
        Download an artifact from MinIO
        
        Args:
            bucket: Bucket name
            object_name: Object name
            download_path: Local path to save file
            
        Returns:
            Path to downloaded file
        """
        self._ensure_initialized()
        
        try:
            self.minio_client.fget_object(bucket, object_name, download_path)
            logger.info(f"Downloaded artifact: {bucket}/{object_name} to {download_path}")
            return download_path
        
        except S3Error as e:
            logger.error(f"Error downloading artifact: {e}")
            raise RuntimeError(f"Failed to download artifact: {str(e)}")


# Singleton instance
upload_service = UploadService()
