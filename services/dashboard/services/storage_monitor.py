"""
Storage Monitoring Service
Comprehensive storage monitoring for Plex, databases, Docker volumes, and MinIO
"""

import os
import logging
from datetime import datetime, timedelta
from typing import Dict, List, Optional, Tuple
from sqlalchemy import text
from minio import Minio
from minio.error import S3Error
import docker

from config import Config
from services.db_service import db_service

logger = logging.getLogger(__name__)


class StorageMonitorService:
    """Service for monitoring storage usage across all homelab components"""
    
    def __init__(self):
        self.docker_client = None
        self.minio_client = None
        self._init_clients()
    
    def _init_clients(self):
        """Initialize Docker and MinIO clients"""
        try:
            self.docker_client = docker.from_env()
            logger.info("Docker client initialized for storage monitoring")
        except Exception as e:
            logger.warning(f"Failed to initialize Docker client: {e}")
        
        try:
            self.minio_client = Minio(
                Config.MINIO_ENDPOINT,
                access_key=Config.MINIO_ACCESS_KEY,
                secret_key=Config.MINIO_SECRET_KEY,
                secure=Config.MINIO_SECURE
            )
            logger.info("MinIO client initialized for storage monitoring")
        except Exception as e:
            logger.warning(f"Failed to initialize MinIO client: {e}")
    
    def scan_directory(self, path: str) -> Tuple[int, int]:
        """
        Recursively scan directory and calculate total size and file count
        
        Args:
            path: Directory path to scan
            
        Returns:
            Tuple of (total_bytes, file_count)
        """
        total_size = 0
        file_count = 0
        
        try:
            if not os.path.exists(path):
                logger.warning(f"Directory does not exist: {path}")
                return 0, 0
            
            for dirpath, dirnames, filenames in os.walk(path):
                for filename in filenames:
                    filepath = os.path.join(dirpath, filename)
                    try:
                        if os.path.exists(filepath) and not os.path.islink(filepath):
                            total_size += os.path.getsize(filepath)
                            file_count += 1
                    except (OSError, PermissionError) as e:
                        logger.debug(f"Cannot access file {filepath}: {e}")
                        continue
            
            return total_size, file_count
            
        except Exception as e:
            logger.error(f"Error scanning directory {path}: {e}")
            return 0, 0
    
    def scan_plex_media(self) -> Dict[str, Dict]:
        """
        Scan all Plex media directories
        
        Returns:
            Dict with media type as key and size/count info as value
        """
        results = {}
        
        media_paths = {
            'movies': Config.PLEX_MOVIES_PATH,
            'tv_shows': Config.PLEX_TV_PATH,
            'music': Config.PLEX_MUSIC_PATH
        }
        
        for media_type, path in media_paths.items():
            size_bytes, file_count = self.scan_directory(path)
            results[media_type] = {
                'path': path,
                'size_bytes': size_bytes,
                'file_count': file_count,
                'size_gb': round(size_bytes / (1024**3), 2)
            }
            logger.info(f"Scanned {media_type}: {results[media_type]['size_gb']} GB, {file_count} files")
        
        return results
    
    def get_database_sizes(self) -> Dict[str, Dict]:
        """
        Query PostgreSQL for database sizes
        
        Returns:
            Dict with database names and their sizes
        """
        if not db_service.is_available:
            logger.warning("Database service not available for size queries")
            return {}
        
        results = {}
        
        try:
            with db_service.get_session() as session:
                # Query all databases and their sizes
                query = text("""
                    SELECT 
                        datname as database_name,
                        pg_database_size(datname) as size_bytes
                    FROM pg_database
                    WHERE datistemplate = false
                    ORDER BY pg_database_size(datname) DESC
                """)
                
                result = session.execute(query)
                
                for row in result:
                    db_name = row[0]
                    size_bytes = row[1]
                    results[db_name] = {
                        'size_bytes': size_bytes,
                        'size_mb': round(size_bytes / (1024**2), 2),
                        'size_gb': round(size_bytes / (1024**3), 2)
                    }
                    logger.info(f"Database {db_name}: {results[db_name]['size_gb']} GB")
        
        except Exception as e:
            logger.error(f"Error querying database sizes: {e}")
        
        return results
    
    def get_docker_volume_sizes(self) -> Dict[str, Dict]:
        """
        Get Docker volume usage information
        
        Returns:
            Dict with volume names and usage info
        """
        if not self.docker_client:
            logger.warning("Docker client not available for volume queries")
            return {}
        
        results = {}
        
        try:
            volumes = self.docker_client.volumes.list()
            
            for volume in volumes:
                try:
                    # Get volume inspect info
                    volume_data = self.docker_client.api.inspect_volume(volume.name)
                    mountpoint = volume_data.get('Mountpoint', '')
                    
                    if mountpoint and os.path.exists(mountpoint):
                        size_bytes, file_count = self.scan_directory(mountpoint)
                        results[volume.name] = {
                            'mountpoint': mountpoint,
                            'size_bytes': size_bytes,
                            'file_count': file_count,
                            'size_gb': round(size_bytes / (1024**3), 2)
                        }
                        logger.debug(f"Volume {volume.name}: {results[volume.name]['size_gb']} GB")
                except Exception as e:
                    logger.debug(f"Cannot scan volume {volume.name}: {e}")
                    continue
        
        except Exception as e:
            logger.error(f"Error getting Docker volume sizes: {e}")
        
        return results
    
    def get_minio_bucket_sizes(self) -> Dict[str, Dict]:
        """
        Get MinIO bucket sizes and object counts
        
        Returns:
            Dict with bucket names and usage info
        """
        if not self.minio_client:
            logger.warning("MinIO client not available for bucket queries")
            return {}
        
        results = {}
        
        try:
            buckets = self.minio_client.list_buckets()
            
            for bucket in buckets:
                try:
                    total_size = 0
                    object_count = 0
                    
                    # List all objects in bucket
                    objects = self.minio_client.list_objects(bucket.name, recursive=True)
                    
                    for obj in objects:
                        total_size += obj.size
                        object_count += 1
                    
                    results[bucket.name] = {
                        'size_bytes': total_size,
                        'object_count': object_count,
                        'size_gb': round(total_size / (1024**3), 2),
                        'created': bucket.creation_date.isoformat() if bucket.creation_date else None
                    }
                    logger.info(f"Bucket {bucket.name}: {results[bucket.name]['size_gb']} GB, {object_count} objects")
                
                except S3Error as e:
                    logger.error(f"Error accessing bucket {bucket.name}: {e}")
                    continue
        
        except Exception as e:
            logger.error(f"Error listing MinIO buckets: {e}")
        
        return results
    
    def calculate_growth_trend(self, metric_type: str, metric_name: str, days: int = 7) -> Dict:
        """
        Calculate storage growth trend over specified days
        
        Args:
            metric_type: Type of metric (e.g., 'plex_media', 'postgres_db')
            metric_name: Name of specific metric
            days: Number of days to analyze
            
        Returns:
            Dict with growth statistics
        """
        if not db_service.is_available:
            return {
                'trend': 'unknown',
                'growth_bytes': 0,
                'growth_percent': 0
            }
        
        try:
            from models.storage import StorageMetric
            from sqlalchemy import select, and_
            
            with db_service.get_session() as session:
                cutoff_date = datetime.utcnow() - timedelta(days=days)
                
                # Get oldest and newest metrics in the time range
                query = select(StorageMetric).where(
                    and_(
                        StorageMetric.metric_type == metric_type,
                        StorageMetric.metric_name == metric_name,
                        StorageMetric.timestamp >= cutoff_date
                    )
                ).order_by(StorageMetric.timestamp.asc())
                
                metrics = session.execute(query).scalars().all()
                
                if len(metrics) < 2:
                    return {
                        'trend': 'insufficient_data',
                        'growth_bytes': 0,
                        'growth_percent': 0,
                        'data_points': len(metrics)
                    }
                
                oldest = metrics[0]
                newest = metrics[-1]
                
                growth_bytes = newest.size_bytes - oldest.size_bytes
                growth_percent = (growth_bytes / oldest.size_bytes * 100) if oldest.size_bytes > 0 else 0
                
                # Determine trend direction
                if growth_percent > 5:
                    trend = 'increasing'
                elif growth_percent < -5:
                    trend = 'decreasing'
                else:
                    trend = 'stable'
                
                return {
                    'trend': trend,
                    'growth_bytes': growth_bytes,
                    'growth_percent': round(growth_percent, 2),
                    'oldest_size': oldest.size_bytes,
                    'newest_size': newest.size_bytes,
                    'days_analyzed': days,
                    'data_points': len(metrics)
                }
        
        except Exception as e:
            logger.error(f"Error calculating growth trend: {e}")
            return {
                'trend': 'error',
                'growth_bytes': 0,
                'growth_percent': 0,
                'error': str(e)
            }
    
    def check_alert_thresholds(self) -> List[Dict]:
        """
        Check all storage metrics against configured alert thresholds
        
        Returns:
            List of alerts that have been triggered
        """
        if not db_service.is_available:
            return []
        
        triggered_alerts = []
        
        try:
            from models.storage import StorageMetric, StorageAlert
            from sqlalchemy import select, and_
            
            with db_service.get_session() as session:
                # Get all enabled alerts
                alerts = session.execute(
                    select(StorageAlert).where(StorageAlert.alert_enabled == True)
                ).scalars().all()
                
                for alert in alerts:
                    # Get latest metric for this alert
                    latest_metric = session.execute(
                        select(StorageMetric).where(
                            and_(
                                StorageMetric.metric_type == alert.metric_type,
                                StorageMetric.metric_name == alert.metric_name
                            )
                        ).order_by(StorageMetric.timestamp.desc()).limit(1)
                    ).scalar_one_or_none()
                    
                    if not latest_metric:
                        continue
                    
                    # Check if usage exceeds threshold
                    if latest_metric.usage_percent and latest_metric.usage_percent >= alert.threshold_percent:
                        # Check if we haven't alerted recently (within last hour)
                        if alert.last_alerted_at:
                            time_since_alert = datetime.utcnow() - alert.last_alerted_at
                            if time_since_alert < timedelta(hours=1):
                                continue
                        
                        triggered_alerts.append({
                            'alert_id': str(alert.id),
                            'metric_type': alert.metric_type,
                            'metric_name': alert.metric_name,
                            'threshold_percent': alert.threshold_percent,
                            'current_percent': latest_metric.usage_percent,
                            'size_bytes': latest_metric.size_bytes,
                            'size_gb': round(latest_metric.size_bytes / (1024**3), 2)
                        })
                        
                        # Update last alerted timestamp
                        alert.last_alerted_at = datetime.utcnow()
                
                session.commit()
        
        except Exception as e:
            logger.error(f"Error checking alert thresholds: {e}")
        
        return triggered_alerts
    
    def generate_cleanup_suggestions(self) -> List[Dict]:
        """
        Generate intelligent cleanup suggestions based on storage patterns
        
        Returns:
            List of cleanup suggestions
        """
        suggestions = []
        
        try:
            # Check for old temp files
            temp_dirs = [Config.UPLOAD_FOLDER, '/tmp']
            for temp_dir in temp_dirs:
                if os.path.exists(temp_dir):
                    size_bytes, file_count = self.scan_directory(temp_dir)
                    if size_bytes > 100 * 1024 * 1024:  # More than 100MB
                        suggestions.append({
                            'type': 'temp_files',
                            'location': temp_dir,
                            'potential_savings_gb': round(size_bytes / (1024**3), 2),
                            'description': f'Temporary directory contains {file_count} files ({round(size_bytes / (1024**3), 2)} GB)',
                            'action': f'Clean up old temporary files in {temp_dir}',
                            'priority': 'medium'
                        })
            
            # Check for old storage metrics (older than 90 days)
            if db_service.is_available:
                from models.storage import StorageMetric
                from sqlalchemy import select, func
                
                with db_service.get_session() as session:
                    cutoff = datetime.utcnow() - timedelta(days=90)
                    old_count = session.execute(
                        select(func.count(StorageMetric.id)).where(
                            StorageMetric.timestamp < cutoff
                        )
                    ).scalar()
                    
                    if old_count > 1000:
                        suggestions.append({
                            'type': 'old_metrics',
                            'location': 'storage_metrics table',
                            'potential_savings_gb': round(old_count * 0.001, 2),  # Rough estimate
                            'description': f'{old_count} storage metrics older than 90 days',
                            'action': 'Run cleanup task to remove old metrics',
                            'priority': 'low'
                        })
            
            # Check Docker volumes for unused volumes
            if self.docker_client:
                try:
                    unused_volumes = self.docker_client.volumes.prune()
                    if unused_volumes and unused_volumes.get('VolumesDeleted'):
                        suggestions.append({
                            'type': 'docker_volumes',
                            'location': 'Docker',
                            'potential_savings_gb': 0,  # Unknown until pruned
                            'description': f'Unused Docker volumes detected',
                            'action': 'Run docker volume prune to remove unused volumes',
                            'priority': 'medium'
                        })
                except:
                    pass
        
        except Exception as e:
            logger.error(f"Error generating cleanup suggestions: {e}")
        
        return suggestions
    
    def get_current_metrics(self) -> Dict:
        """
        Get current storage metrics across all types
        
        Returns:
            Dict with current metrics for all storage types
        """
        metrics = {
            'plex': self.scan_plex_media(),
            'databases': self.get_database_sizes(),
            'docker_volumes': self.get_docker_volume_sizes(),
            'minio_buckets': self.get_minio_bucket_sizes(),
            'timestamp': datetime.utcnow().isoformat()
        }
        
        # Calculate totals
        total_bytes = 0
        for category in ['plex', 'docker_volumes', 'minio_buckets']:
            for item in metrics[category].values():
                total_bytes += item.get('size_bytes', 0)
        
        for db_info in metrics['databases'].values():
            total_bytes += db_info.get('size_bytes', 0)
        
        metrics['total'] = {
            'size_bytes': total_bytes,
            'size_gb': round(total_bytes / (1024**3), 2),
            'size_tb': round(total_bytes / (1024**4), 2)
        }
        
        return metrics


storage_monitor = StorageMonitorService()

__all__ = ['storage_monitor', 'StorageMonitorService']
