"""
Unified Storage Service
Provides abstraction over local MinIO and cloud S3 storage with dual backend support.
"""

import os
import io
import logging
from datetime import datetime, timedelta
from typing import Dict, List, Optional, Union, BinaryIO, Tuple
from dataclasses import dataclass
from enum import Enum
from minio import Minio
from minio.error import S3Error
try:
    from minio.lifecycleconfig import LifecycleConfig, Rule, Expiration
    from minio.commonconfig import ENABLED, Filter
    LIFECYCLE_SUPPORT = True
except ImportError:
    try:
        from minio.lifecycleconfig import LifecycleConfig, Rule, Expiration, Filter
        from minio.commonconfig import ENABLED
        LIFECYCLE_SUPPORT = True
    except ImportError:
        LIFECYCLE_SUPPORT = False

from config import Config

logger = logging.getLogger(__name__)


class StorageBackend(Enum):
    LOCAL = "local"
    CLOUD = "cloud"
    ALL = "all"


@dataclass
class BucketInfo:
    name: str
    backend: str
    creation_date: Optional[datetime] = None
    size_bytes: int = 0
    object_count: int = 0


@dataclass
class ObjectInfo:
    key: str
    bucket: str
    backend: str
    size: int
    last_modified: Optional[datetime] = None
    etag: Optional[str] = None
    content_type: Optional[str] = None


@dataclass
class StorageStats:
    backend: str
    total_buckets: int
    total_objects: int
    total_size_bytes: int
    buckets: List[Dict]


class UnifiedStorageService:
    """
    Unified storage service providing abstraction over local MinIO and cloud S3 storage.
    Supports automatic failover, cross-backend operations, and lifecycle policies.
    """
    
    def __init__(self):
        self.local_client: Optional[Minio] = None
        self.cloud_client: Optional[Minio] = None
        self._init_clients()
    
    def _init_clients(self):
        """Initialize MinIO clients for local and cloud storage"""
        try:
            self.local_client = Minio(
                Config.MINIO_ENDPOINT,
                access_key=Config.MINIO_ACCESS_KEY,
                secret_key=Config.MINIO_SECRET_KEY,
                secure=Config.MINIO_SECURE
            )
            logger.info(f"✓ Local MinIO client initialized: {Config.MINIO_ENDPOINT}")
        except Exception as e:
            logger.warning(f"⚠ Failed to initialize local MinIO client: {e}")
        
        try:
            if Config.CLOUD_S3_ENDPOINT and Config.CLOUD_S3_ACCESS_KEY:
                self.cloud_client = Minio(
                    Config.CLOUD_S3_ENDPOINT,
                    access_key=Config.CLOUD_S3_ACCESS_KEY,
                    secret_key=Config.CLOUD_S3_SECRET_KEY,
                    secure=Config.CLOUD_S3_SECURE,
                    region=Config.CLOUD_S3_REGION
                )
                logger.info(f"✓ Cloud S3 client initialized: {Config.CLOUD_S3_ENDPOINT}")
            else:
                logger.info("Cloud S3 not configured - cloud storage disabled")
        except Exception as e:
            logger.warning(f"⚠ Failed to initialize cloud S3 client: {e}")
    
    def _get_client(self, backend: str) -> Optional[Minio]:
        """Get the appropriate client for the specified backend"""
        if backend == StorageBackend.LOCAL.value or backend == "local":
            return self.local_client
        elif backend == StorageBackend.CLOUD.value or backend == "cloud":
            return self.cloud_client
        return None
    
    def is_local_available(self) -> bool:
        """Check if local storage is available"""
        if not self.local_client:
            return False
        try:
            self.local_client.list_buckets()
            return True
        except:
            return False
    
    def is_cloud_available(self) -> bool:
        """Check if cloud storage is available"""
        if not self.cloud_client:
            return False
        try:
            self.cloud_client.list_buckets()
            return True
        except:
            return False
    
    def list_buckets(self, backend: str = "all") -> Dict[str, List[BucketInfo]]:
        """
        List buckets from specified backend(s)
        
        Args:
            backend: 'local', 'cloud', or 'all'
            
        Returns:
            Dict with backend as key and list of BucketInfo as value
        """
        results = {"local": [], "cloud": []}
        
        if backend in ["local", "all"] and self.local_client:
            try:
                buckets = self.local_client.list_buckets()
                for bucket in buckets:
                    bucket_info = BucketInfo(
                        name=bucket.name,
                        backend="local",
                        creation_date=bucket.creation_date
                    )
                    size_bytes, object_count = self._get_bucket_stats(bucket.name, "local")
                    bucket_info.size_bytes = size_bytes
                    bucket_info.object_count = object_count
                    results["local"].append(bucket_info)
                logger.debug(f"Found {len(results['local'])} local buckets")
            except S3Error as e:
                logger.error(f"Error listing local buckets: {e}")
        
        if backend in ["cloud", "all"] and self.cloud_client:
            try:
                buckets = self.cloud_client.list_buckets()
                for bucket in buckets:
                    bucket_info = BucketInfo(
                        name=bucket.name,
                        backend="cloud",
                        creation_date=bucket.creation_date
                    )
                    size_bytes, object_count = self._get_bucket_stats(bucket.name, "cloud")
                    bucket_info.size_bytes = size_bytes
                    bucket_info.object_count = object_count
                    results["cloud"].append(bucket_info)
                logger.debug(f"Found {len(results['cloud'])} cloud buckets")
            except S3Error as e:
                logger.error(f"Error listing cloud buckets: {e}")
        
        return results
    
    def _get_bucket_stats(self, bucket: str, backend: str) -> Tuple[int, int]:
        """Get total size and object count for a bucket"""
        client = self._get_client(backend)
        if not client:
            return 0, 0
        
        total_size = 0
        object_count = 0
        
        try:
            objects = client.list_objects(bucket, recursive=True)
            for obj in objects:
                total_size += obj.size
                object_count += 1
        except S3Error as e:
            logger.debug(f"Error getting stats for {bucket}: {e}")
        
        return total_size, object_count
    
    def create_bucket(self, name: str, backend: str = "local", location: Optional[str] = None) -> Dict:
        """
        Create a new bucket
        
        Args:
            name: Bucket name
            backend: 'local' or 'cloud'
            location: Optional region/location
            
        Returns:
            Dict with success status and message
        """
        client = self._get_client(backend)
        if not client:
            return {"success": False, "error": f"{backend} storage not available"}
        
        try:
            if client.bucket_exists(name):
                return {"success": False, "error": f"Bucket '{name}' already exists"}
            
            if location:
                client.make_bucket(name, location=location)
            else:
                client.make_bucket(name)
            
            logger.info(f"Created bucket '{name}' on {backend} storage")
            return {"success": True, "message": f"Bucket '{name}' created successfully", "backend": backend}
        except S3Error as e:
            logger.error(f"Error creating bucket '{name}': {e}")
            return {"success": False, "error": str(e)}
    
    def delete_bucket(self, name: str, backend: str, force: bool = False) -> Dict:
        """
        Delete a bucket
        
        Args:
            name: Bucket name
            backend: 'local' or 'cloud'
            force: If True, delete all objects first
            
        Returns:
            Dict with success status
        """
        client = self._get_client(backend)
        if not client:
            return {"success": False, "error": f"{backend} storage not available"}
        
        try:
            if force:
                objects = client.list_objects(name, recursive=True)
                for obj in objects:
                    client.remove_object(name, obj.object_name)
            
            client.remove_bucket(name)
            logger.info(f"Deleted bucket '{name}' from {backend} storage")
            return {"success": True, "message": f"Bucket '{name}' deleted successfully"}
        except S3Error as e:
            logger.error(f"Error deleting bucket '{name}': {e}")
            return {"success": False, "error": str(e)}
    
    def list_objects(
        self, 
        bucket: str, 
        backend: str,
        prefix: str = "",
        recursive: bool = False,
        max_keys: int = 1000
    ) -> Dict:
        """
        List objects in a bucket
        
        Args:
            bucket: Bucket name
            backend: 'local' or 'cloud'
            prefix: Optional prefix filter
            recursive: Whether to list recursively
            max_keys: Maximum number of objects to return
            
        Returns:
            Dict with objects list
        """
        client = self._get_client(backend)
        if not client:
            return {"success": False, "error": f"{backend} storage not available", "objects": []}
        
        try:
            objects = []
            folders = set()
            count = 0
            
            for obj in client.list_objects(bucket, prefix=prefix, recursive=recursive):
                if count >= max_keys:
                    break
                
                if not recursive and obj.is_dir:
                    folders.add(obj.object_name)
                else:
                    objects.append(ObjectInfo(
                        key=obj.object_name,
                        bucket=bucket,
                        backend=backend,
                        size=obj.size,
                        last_modified=obj.last_modified,
                        etag=obj.etag,
                        content_type=obj.content_type
                    ))
                    count += 1
            
            return {
                "success": True,
                "bucket": bucket,
                "backend": backend,
                "prefix": prefix,
                "objects": [self._object_to_dict(obj) for obj in objects],
                "folders": list(folders),
                "count": len(objects)
            }
        except S3Error as e:
            logger.error(f"Error listing objects in '{bucket}': {e}")
            return {"success": False, "error": str(e), "objects": [], "folders": []}
    
    def _object_to_dict(self, obj: ObjectInfo) -> Dict:
        """Convert ObjectInfo to dict"""
        return {
            "key": obj.key,
            "bucket": obj.bucket,
            "backend": obj.backend,
            "size": obj.size,
            "size_human": self._format_size(obj.size),
            "last_modified": obj.last_modified.isoformat() if obj.last_modified else None,
            "etag": obj.etag,
            "content_type": obj.content_type
        }
    
    def _format_size(self, size_bytes: int) -> str:
        """Format size in human-readable format"""
        for unit in ['B', 'KB', 'MB', 'GB', 'TB']:
            if size_bytes < 1024:
                return f"{size_bytes:.2f} {unit}"
            size_bytes /= 1024
        return f"{size_bytes:.2f} PB"
    
    def upload_file(
        self,
        bucket: str,
        key: str,
        file_data: Union[BinaryIO, bytes],
        backend: str = "local",
        content_type: Optional[str] = None,
        metadata: Optional[Dict] = None
    ) -> Dict:
        """
        Upload a file to storage
        
        Args:
            bucket: Bucket name
            key: Object key/path
            file_data: File data (file-like object or bytes)
            backend: 'local' or 'cloud'
            content_type: Optional content type
            metadata: Optional metadata dict
            
        Returns:
            Dict with upload result
        """
        client = self._get_client(backend)
        if not client:
            return {"success": False, "error": f"{backend} storage not available"}
        
        try:
            if not client.bucket_exists(bucket):
                client.make_bucket(bucket)
            
            if isinstance(file_data, bytes):
                data = io.BytesIO(file_data)
                length = len(file_data)
            else:
                file_data.seek(0, 2)
                length = file_data.tell()
                file_data.seek(0)
                data = file_data
            
            result = client.put_object(
                bucket,
                key,
                data,
                length,
                content_type=content_type or "application/octet-stream",
                metadata=metadata
            )
            
            logger.info(f"Uploaded '{key}' to {bucket} ({backend})")
            return {
                "success": True,
                "bucket": bucket,
                "key": key,
                "backend": backend,
                "etag": result.etag,
                "version_id": result.version_id
            }
        except S3Error as e:
            logger.error(f"Error uploading '{key}' to {bucket}: {e}")
            return {"success": False, "error": str(e)}
    
    def download_file(self, bucket: str, key: str, backend: str) -> Dict:
        """
        Download a file from storage
        
        Args:
            bucket: Bucket name
            key: Object key/path
            backend: 'local' or 'cloud'
            
        Returns:
            Dict with file data and metadata
        """
        client = self._get_client(backend)
        if not client:
            return {"success": False, "error": f"{backend} storage not available"}
        
        try:
            response = client.get_object(bucket, key)
            data = response.read()
            
            stat = client.stat_object(bucket, key)
            
            return {
                "success": True,
                "data": data,
                "bucket": bucket,
                "key": key,
                "backend": backend,
                "size": stat.size,
                "content_type": stat.content_type,
                "last_modified": stat.last_modified.isoformat() if stat.last_modified else None,
                "etag": stat.etag
            }
        except S3Error as e:
            logger.error(f"Error downloading '{key}' from {bucket}: {e}")
            return {"success": False, "error": str(e)}
        finally:
            try:
                response.close()
                response.release_conn()
            except:
                pass
    
    def delete_object(self, bucket: str, key: str, backend: str) -> Dict:
        """
        Delete an object from storage
        
        Args:
            bucket: Bucket name
            key: Object key/path
            backend: 'local' or 'cloud'
            
        Returns:
            Dict with deletion result
        """
        client = self._get_client(backend)
        if not client:
            return {"success": False, "error": f"{backend} storage not available"}
        
        try:
            client.remove_object(bucket, key)
            logger.info(f"Deleted '{key}' from {bucket} ({backend})")
            return {
                "success": True,
                "message": f"Object '{key}' deleted successfully",
                "bucket": bucket,
                "key": key,
                "backend": backend
            }
        except S3Error as e:
            logger.error(f"Error deleting '{key}' from {bucket}: {e}")
            return {"success": False, "error": str(e)}
    
    def copy_object(
        self,
        src_bucket: str,
        src_key: str,
        dst_bucket: str,
        dst_key: str,
        src_backend: str,
        dst_backend: str
    ) -> Dict:
        """
        Copy an object between buckets/backends
        
        Args:
            src_bucket: Source bucket name
            src_key: Source object key
            dst_bucket: Destination bucket name
            dst_key: Destination object key
            src_backend: Source backend ('local' or 'cloud')
            dst_backend: Destination backend ('local' or 'cloud')
            
        Returns:
            Dict with copy result
        """
        if src_backend == dst_backend:
            client = self._get_client(src_backend)
            if not client:
                return {"success": False, "error": f"{src_backend} storage not available"}
            
            try:
                from minio.commonconfig import CopySource
                result = client.copy_object(
                    dst_bucket,
                    dst_key,
                    CopySource(src_bucket, src_key)
                )
                logger.info(f"Copied '{src_key}' to '{dst_key}' on {src_backend}")
                return {
                    "success": True,
                    "message": "Object copied successfully",
                    "src_bucket": src_bucket,
                    "src_key": src_key,
                    "dst_bucket": dst_bucket,
                    "dst_key": dst_key,
                    "backend": src_backend
                }
            except S3Error as e:
                logger.error(f"Error copying object: {e}")
                return {"success": False, "error": str(e)}
        else:
            download_result = self.download_file(src_bucket, src_key, src_backend)
            if not download_result["success"]:
                return download_result
            
            upload_result = self.upload_file(
                dst_bucket,
                dst_key,
                download_result["data"],
                dst_backend,
                content_type=download_result.get("content_type")
            )
            
            if upload_result["success"]:
                return {
                    "success": True,
                    "message": f"Object copied from {src_backend} to {dst_backend}",
                    "src_bucket": src_bucket,
                    "src_key": src_key,
                    "dst_bucket": dst_bucket,
                    "dst_key": dst_key,
                    "src_backend": src_backend,
                    "dst_backend": dst_backend
                }
            return upload_result
    
    def sync_bucket(
        self,
        bucket: str,
        source: str,
        destination: str,
        delete_extra: bool = False
    ) -> Dict:
        """
        Sync a bucket between local and cloud storage
        
        Args:
            bucket: Bucket name
            source: Source backend ('local' or 'cloud')
            destination: Destination backend ('local' or 'cloud')
            delete_extra: Whether to delete objects that exist only in destination
            
        Returns:
            Dict with sync results
        """
        src_client = self._get_client(source)
        dst_client = self._get_client(destination)
        
        if not src_client:
            return {"success": False, "error": f"Source {source} storage not available"}
        if not dst_client:
            return {"success": False, "error": f"Destination {destination} storage not available"}
        
        try:
            if not dst_client.bucket_exists(bucket):
                dst_client.make_bucket(bucket)
            
            src_objects = {}
            for obj in src_client.list_objects(bucket, recursive=True):
                src_objects[obj.object_name] = {
                    "size": obj.size,
                    "etag": obj.etag,
                    "last_modified": obj.last_modified
                }
            
            dst_objects = {}
            if dst_client.bucket_exists(bucket):
                for obj in dst_client.list_objects(bucket, recursive=True):
                    dst_objects[obj.object_name] = {
                        "size": obj.size,
                        "etag": obj.etag,
                        "last_modified": obj.last_modified
                    }
            
            copied = 0
            skipped = 0
            deleted = 0
            errors = []
            
            for key, src_info in src_objects.items():
                if key in dst_objects:
                    if dst_objects[key]["etag"] == src_info["etag"]:
                        skipped += 1
                        continue
                
                try:
                    response = src_client.get_object(bucket, key)
                    data = response.read()
                    
                    dst_client.put_object(
                        bucket,
                        key,
                        io.BytesIO(data),
                        len(data)
                    )
                    copied += 1
                    
                    response.close()
                    response.release_conn()
                except Exception as e:
                    errors.append({"key": key, "error": str(e)})
            
            if delete_extra:
                for key in dst_objects:
                    if key not in src_objects:
                        try:
                            dst_client.remove_object(bucket, key)
                            deleted += 1
                        except Exception as e:
                            errors.append({"key": key, "error": str(e)})
            
            logger.info(f"Synced bucket '{bucket}' from {source} to {destination}: {copied} copied, {skipped} skipped, {deleted} deleted")
            
            return {
                "success": True,
                "bucket": bucket,
                "source": source,
                "destination": destination,
                "copied": copied,
                "skipped": skipped,
                "deleted": deleted,
                "errors": errors,
                "total_source_objects": len(src_objects),
                "total_dest_objects": len(dst_objects) + copied - deleted
            }
        except S3Error as e:
            logger.error(f"Error syncing bucket '{bucket}': {e}")
            return {"success": False, "error": str(e)}
    
    def mirror_to_cloud(self, bucket: str, create_if_missing: bool = True) -> Dict:
        """
        Mirror a local bucket to cloud storage
        
        Args:
            bucket: Bucket name to mirror
            create_if_missing: Create bucket in cloud if it doesn't exist
            
        Returns:
            Dict with mirror results
        """
        if not self.cloud_client:
            return {"success": False, "error": "Cloud storage not configured"}
        
        if not self.local_client:
            return {"success": False, "error": "Local storage not available"}
        
        try:
            if not self.local_client.bucket_exists(bucket):
                return {"success": False, "error": f"Local bucket '{bucket}' does not exist"}
        except S3Error as e:
            return {"success": False, "error": f"Cannot access local bucket: {e}"}
        
        return self.sync_bucket(bucket, "local", "cloud", delete_extra=False)
    
    def get_storage_stats(self, backend: str = "all") -> Dict:
        """
        Get storage usage statistics
        
        Args:
            backend: 'local', 'cloud', or 'all'
            
        Returns:
            Dict with storage statistics
        """
        stats = {"local": None, "cloud": None}
        
        if backend in ["local", "all"] and self.local_client:
            try:
                local_stats = StorageStats(
                    backend="local",
                    total_buckets=0,
                    total_objects=0,
                    total_size_bytes=0,
                    buckets=[]
                )
                
                buckets = self.local_client.list_buckets()
                for bucket in buckets:
                    size_bytes, object_count = self._get_bucket_stats(bucket.name, "local")
                    local_stats.total_buckets += 1
                    local_stats.total_objects += object_count
                    local_stats.total_size_bytes += size_bytes
                    local_stats.buckets.append({
                        "name": bucket.name,
                        "size_bytes": size_bytes,
                        "size_human": self._format_size(size_bytes),
                        "object_count": object_count,
                        "created": bucket.creation_date.isoformat() if bucket.creation_date else None
                    })
                
                stats["local"] = {
                    "backend": "local",
                    "available": True,
                    "endpoint": Config.MINIO_ENDPOINT,
                    "total_buckets": local_stats.total_buckets,
                    "total_objects": local_stats.total_objects,
                    "total_size_bytes": local_stats.total_size_bytes,
                    "total_size_human": self._format_size(local_stats.total_size_bytes),
                    "buckets": local_stats.buckets
                }
            except Exception as e:
                stats["local"] = {
                    "backend": "local",
                    "available": False,
                    "error": str(e)
                }
        
        if backend in ["cloud", "all"] and self.cloud_client:
            try:
                cloud_stats = StorageStats(
                    backend="cloud",
                    total_buckets=0,
                    total_objects=0,
                    total_size_bytes=0,
                    buckets=[]
                )
                
                buckets = self.cloud_client.list_buckets()
                for bucket in buckets:
                    size_bytes, object_count = self._get_bucket_stats(bucket.name, "cloud")
                    cloud_stats.total_buckets += 1
                    cloud_stats.total_objects += object_count
                    cloud_stats.total_size_bytes += size_bytes
                    cloud_stats.buckets.append({
                        "name": bucket.name,
                        "size_bytes": size_bytes,
                        "size_human": self._format_size(size_bytes),
                        "object_count": object_count,
                        "created": bucket.creation_date.isoformat() if bucket.creation_date else None
                    })
                
                stats["cloud"] = {
                    "backend": "cloud",
                    "available": True,
                    "endpoint": Config.CLOUD_S3_ENDPOINT,
                    "total_buckets": cloud_stats.total_buckets,
                    "total_objects": cloud_stats.total_objects,
                    "total_size_bytes": cloud_stats.total_size_bytes,
                    "total_size_human": self._format_size(cloud_stats.total_size_bytes),
                    "buckets": cloud_stats.buckets
                }
            except Exception as e:
                stats["cloud"] = {
                    "backend": "cloud",
                    "available": False,
                    "error": str(e)
                }
        elif backend in ["cloud", "all"]:
            stats["cloud"] = {
                "backend": "cloud",
                "available": False,
                "error": "Cloud storage not configured"
            }
        
        return {
            "success": True,
            "stats": stats,
            "timestamp": datetime.utcnow().isoformat()
        }
    
    def set_lifecycle_policy(
        self,
        bucket: str,
        backend: str,
        expiration_days: int,
        prefix: str = ""
    ) -> Dict:
        """
        Set lifecycle policy for automatic object expiration
        
        Args:
            bucket: Bucket name
            backend: 'local' or 'cloud'
            expiration_days: Days after which objects expire
            prefix: Optional prefix to apply rule to
            
        Returns:
            Dict with result
        """
        if not LIFECYCLE_SUPPORT:
            return {"success": False, "error": "Lifecycle policy not supported in this minio version"}
        
        client = self._get_client(backend)
        if not client:
            return {"success": False, "error": f"{backend} storage not available"}
        
        try:
            rule = Rule(
                ENABLED,
                rule_filter=Filter(prefix=prefix) if prefix else None,
                rule_id=f"auto-expire-{expiration_days}d",
                expiration=Expiration(days=expiration_days)
            )
            
            config = LifecycleConfig([rule])
            client.set_bucket_lifecycle(bucket, config)
            
            logger.info(f"Set lifecycle policy on {bucket} ({backend}): expire after {expiration_days} days")
            return {
                "success": True,
                "message": f"Lifecycle policy set: objects expire after {expiration_days} days",
                "bucket": bucket,
                "backend": backend
            }
        except S3Error as e:
            logger.error(f"Error setting lifecycle policy on {bucket}: {e}")
            return {"success": False, "error": str(e)}
        except Exception as e:
            logger.error(f"Error setting lifecycle policy on {bucket}: {e}")
            return {"success": False, "error": str(e)}
    
    def get_lifecycle_policy(self, bucket: str, backend: str) -> Dict:
        """Get lifecycle policy for a bucket"""
        if not LIFECYCLE_SUPPORT:
            return {"success": False, "error": "Lifecycle policy not supported in this minio version"}
        
        client = self._get_client(backend)
        if not client:
            return {"success": False, "error": f"{backend} storage not available"}
        
        try:
            config = client.get_bucket_lifecycle(bucket)
            rules = []
            if config:
                for rule in config.rules:
                    rules.append({
                        "id": rule.rule_id,
                        "status": rule.status,
                        "expiration_days": rule.expiration.days if rule.expiration else None,
                        "prefix": getattr(rule.rule_filter, 'prefix', '') if rule.rule_filter else ""
                    })
            
            return {
                "success": True,
                "bucket": bucket,
                "backend": backend,
                "rules": rules
            }
        except S3Error as e:
            if "NoSuchLifecycleConfiguration" in str(e):
                return {"success": True, "bucket": bucket, "backend": backend, "rules": []}
            logger.error(f"Error getting lifecycle policy for {bucket}: {e}")
            return {"success": False, "error": str(e)}
        except Exception as e:
            logger.error(f"Error getting lifecycle policy for {bucket}: {e}")
            return {"success": False, "error": str(e)}
    
    def get_presigned_url(
        self,
        bucket: str,
        key: str,
        backend: str,
        expires: int = 3600,
        method: str = "GET"
    ) -> Dict:
        """
        Generate a presigned URL for object access
        
        Args:
            bucket: Bucket name
            key: Object key
            backend: 'local' or 'cloud'
            expires: Expiration time in seconds
            method: 'GET' or 'PUT'
            
        Returns:
            Dict with presigned URL
        """
        client = self._get_client(backend)
        if not client:
            return {"success": False, "error": f"{backend} storage not available"}
        
        try:
            if method.upper() == "GET":
                url = client.presigned_get_object(bucket, key, expires=timedelta(seconds=expires))
            else:
                url = client.presigned_put_object(bucket, key, expires=timedelta(seconds=expires))
            
            return {
                "success": True,
                "url": url,
                "bucket": bucket,
                "key": key,
                "backend": backend,
                "expires_in": expires,
                "method": method.upper()
            }
        except S3Error as e:
            logger.error(f"Error generating presigned URL: {e}")
            return {"success": False, "error": str(e)}


storage_service = UnifiedStorageService()

__all__ = ['storage_service', 'UnifiedStorageService', 'StorageBackend', 'BucketInfo', 'ObjectInfo']
