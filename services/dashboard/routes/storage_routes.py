"""Storage Monitoring and Unified Storage Management API Routes"""
import logging
import io
from datetime import datetime, timedelta
from flask import Blueprint, request, jsonify, session, render_template, send_file, Response

from services.storage_monitor import storage_monitor
from services.storage_service import storage_service
from services.db_service import db_service
from services.cache_service import cache_service
from workers.storage_worker import (
    collect_storage_metrics,
    scan_plex_directories,
    check_database_sizes,
    check_alert_thresholds
)
from utils.auth import require_auth, require_web_auth

logger = logging.getLogger(__name__)

storage_bp = Blueprint('storage', __name__)


def login_required(f):
    """Decorator for API routes - supports both session and API key auth"""
    return require_auth(f)


@storage_bp.route('/storage')
@login_required
def storage_page():
    """Render storage monitoring page"""
    return render_template('storage.html')


@storage_bp.route('/api/storage/metrics', methods=['GET'])
@login_required
def get_current_metrics():
    """
    Get current storage usage across all types
    
    Returns:
        JSON with current metrics for Plex, databases, Docker, and MinIO
    """
    try:
        # Try to get from cache first
        cache_key = 'storage:metrics:current'
        cached = cache_service.get(cache_key)
        if cached:
            logger.debug("Returning cached storage metrics")
            return jsonify(cached)
        
        # Query database if not cached
        metrics = storage_monitor.get_current_metrics()
        
        result = {
            'success': True,
            'metrics': metrics,
            'timestamp': datetime.utcnow().isoformat()
        }
        
        # Cache for 5 minutes
        cache_service.set(cache_key, result, ttl=cache_service.TTL_5_MIN)
        
        return jsonify(result)
    
    except Exception as e:
        logger.error(f"Error getting current metrics: {e}")
        return jsonify({
            'success': False,
            'error': str(e)
        }), 500


@storage_bp.route('/api/storage/trends', methods=['GET'])
@login_required
def get_storage_trends():
    """
    Get historical storage data for trend analysis
    
    Query params:
        days: Number of days to retrieve (default: 7, max: 90)
        metric_type: Filter by metric type (optional)
        
    Returns:
        JSON with historical metrics
    """
    try:
        days = int(request.args.get('days', 7))
        days = min(days, 90)  # Cap at 90 days
        metric_type = request.args.get('metric_type')
        
        if not db_service.is_available:
            return jsonify({
                'success': False,
                'error': 'Database service not available'
            }), 503
        
        from models.storage import StorageMetric
        from sqlalchemy import select, and_
        
        with db_service.get_session() as session:
            cutoff_date = datetime.utcnow() - timedelta(days=days)
            
            query = select(StorageMetric).where(
                StorageMetric.timestamp >= cutoff_date
            )
            
            if metric_type:
                query = query.where(StorageMetric.metric_type == metric_type)
            
            query = query.order_by(StorageMetric.timestamp.asc())
            
            metrics = session.execute(query).scalars().all()
            
            # Group by metric type and name for easier charting
            grouped_data = {}
            for metric in metrics:
                key = f"{metric.metric_type}_{metric.metric_name}"
                if key not in grouped_data:
                    grouped_data[key] = {
                        'metric_type': metric.metric_type,
                        'metric_name': metric.metric_name,
                        'data_points': []
                    }
                
                grouped_data[key]['data_points'].append({
                    'timestamp': metric.timestamp.isoformat(),
                    'size_bytes': metric.size_bytes,
                    'size_gb': metric.to_dict()['size_gb'],
                    'usage_percent': metric.usage_percent
                })
            
            return jsonify({
                'success': True,
                'days': days,
                'trends': list(grouped_data.values()),
                'total_data_points': len(metrics)
            })
    
    except Exception as e:
        logger.error(f"Error getting storage trends: {e}")
        return jsonify({
            'success': False,
            'error': str(e)
        }), 500


@storage_bp.route('/api/storage/plex', methods=['GET'])
@login_required
def get_plex_breakdown():
    """
    Get detailed Plex media storage breakdown
    
    Returns:
        JSON with Plex media usage by type
    """
    try:
        plex_data = storage_monitor.scan_plex_media()
        
        # Add growth trends for each media type
        for media_type in plex_data.keys():
            trend = storage_monitor.calculate_growth_trend('plex_media', media_type, days=7)
            plex_data[media_type]['trend'] = trend
        
        return jsonify({
            'success': True,
            'plex_media': plex_data,
            'timestamp': datetime.utcnow().isoformat()
        })
    
    except Exception as e:
        logger.error(f"Error getting Plex breakdown: {e}")
        return jsonify({
            'success': False,
            'error': str(e)
        }), 500


@storage_bp.route('/api/storage/databases', methods=['GET'])
@login_required
def get_database_sizes():
    """
    Get PostgreSQL database sizes
    
    Returns:
        JSON with database sizes
    """
    try:
        db_sizes = storage_monitor.get_database_sizes()
        
        # Add growth trends for each database
        for db_name in db_sizes.keys():
            trend = storage_monitor.calculate_growth_trend('postgres_db', db_name, days=7)
            db_sizes[db_name]['trend'] = trend
        
        return jsonify({
            'success': True,
            'databases': db_sizes,
            'timestamp': datetime.utcnow().isoformat()
        })
    
    except Exception as e:
        logger.error(f"Error getting database sizes: {e}")
        return jsonify({
            'success': False,
            'error': str(e)
        }), 500


@storage_bp.route('/api/storage/alerts', methods=['GET'])
@login_required
def get_alert_configurations():
    """
    Get all storage alert configurations
    
    Query params:
        page: Page number (default: 1)
        per_page: Items per page (default: 50, max: 100)
    
    Returns:
        JSON with alert configurations
    """
    try:
        if not db_service.is_available:
            return jsonify({
                'success': False,
                'error': 'Database service not available'
            }), 503
        
        from models.storage import StorageAlert
        from sqlalchemy import select, func
        
        # Get pagination parameters
        page = int(request.args.get('page', 1))
        per_page = min(int(request.args.get('per_page', 50)), 100)
        
        with db_service.get_session() as session:
            # Get total count
            total = session.execute(
                select(func.count()).select_from(StorageAlert)
            ).scalar()
            
            # Get paginated results
            alerts = session.execute(
                select(StorageAlert)
                .order_by(StorageAlert.created_at.desc())
                .offset((page - 1) * per_page)
                .limit(per_page)
            ).scalars().all()
            
            return jsonify({
                'success': True,
                'alerts': [alert.to_dict() for alert in alerts],
                'pagination': {
                    'page': page,
                    'per_page': per_page,
                    'total': total,
                    'pages': (total + per_page - 1) // per_page
                }
            })
    
    except Exception as e:
        logger.error(f"Error getting alert configurations: {e}")
        return jsonify({
            'success': False,
            'error': str(e)
        }), 500


@storage_bp.route('/api/storage/alerts', methods=['POST'])
@login_required
def create_or_update_alert():
    """
    Create or update storage alert threshold
    
    JSON body:
        metric_type: Type of metric (e.g., 'plex_media', 'postgres_db')
        metric_name: Name of specific metric
        threshold_percent: Alert threshold percentage (0-100)
        alert_enabled: Whether alert is enabled (boolean)
        
    Returns:
        JSON with created/updated alert
    """
    try:
        # Invalidate alerts cache on mutation
        cache_service.delete_pattern('storage:alerts:*')
        data = request.get_json()
        
        if not data:
            return jsonify({
                'success': False,
                'error': 'No data provided'
            }), 400
        
        required_fields = ['metric_type', 'metric_name', 'threshold_percent']
        for field in required_fields:
            if field not in data:
                return jsonify({
                    'success': False,
                    'error': f'Missing required field: {field}'
                }), 400
        
        if not db_service.is_available:
            return jsonify({
                'success': False,
                'error': 'Database service not available'
            }), 503
        
        from models.storage import StorageAlert
        from sqlalchemy import select, and_
        
        with db_service.get_session() as session:
            # Check if alert already exists
            existing_alert = session.execute(
                select(StorageAlert).where(
                    and_(
                        StorageAlert.metric_type == data['metric_type'],
                        StorageAlert.metric_name == data['metric_name']
                    )
                )
            ).scalar_one_or_none()
            
            if existing_alert:
                # Update existing alert
                existing_alert.threshold_percent = float(data['threshold_percent'])
                existing_alert.alert_enabled = data.get('alert_enabled', True)
                existing_alert.updated_at = datetime.utcnow()
                alert = existing_alert
            else:
                # Create new alert
                alert = StorageAlert(
                    metric_type=data['metric_type'],
                    metric_name=data['metric_name'],
                    threshold_percent=float(data['threshold_percent']),
                    alert_enabled=data.get('alert_enabled', True)
                )
                session.add(alert)
            
            session.commit()
            
            return jsonify({
                'success': True,
                'alert': alert.to_dict(),
                'message': 'Alert configuration saved'
            })
    
    except Exception as e:
        logger.error(f"Error creating/updating alert: {e}")
        return jsonify({
            'success': False,
            'error': str(e)
        }), 500


@storage_bp.route('/api/storage/alerts/<alert_id>', methods=['DELETE'])
@login_required
def delete_alert(alert_id):
    """
    Delete a storage alert configuration
    
    Returns:
        JSON with success status
    """
    try:
        if not db_service.is_available:
            return jsonify({
                'success': False,
                'error': 'Database service not available'
            }), 503
        
        from models.storage import StorageAlert
        from sqlalchemy import select
        import uuid
        
        with db_service.get_session() as session:
            alert = session.execute(
                select(StorageAlert).where(StorageAlert.id == uuid.UUID(alert_id))
            ).scalar_one_or_none()
            
            if not alert:
                return jsonify({
                    'success': False,
                    'error': 'Alert not found'
                }), 404
            
            session.delete(alert)
            session.commit()
            
            return jsonify({
                'success': True,
                'message': 'Alert deleted successfully'
            })
    
    except Exception as e:
        logger.error(f"Error deleting alert: {e}")
        return jsonify({
            'success': False,
            'error': str(e)
        }), 500


@storage_bp.route('/api/storage/scan', methods=['POST'])
@login_required
def trigger_manual_scan():
    """
    Trigger a manual storage scan
    
    Query params:
        scan_type: Type of scan (all, plex, databases, docker, minio) - default: all
        
    Returns:
        JSON with task IDs
    """
    try:
        scan_type = request.args.get('scan_type', 'all')
        
        task_ids = {}
        
        if scan_type in ['all', 'plex']:
            task = scan_plex_directories.delay()
            task_ids['plex_scan'] = task.id
        
        if scan_type in ['all', 'databases']:
            task = check_database_sizes.delay()
            task_ids['database_scan'] = task.id
        
        if scan_type == 'all':
            task = collect_storage_metrics.delay()
            task_ids['full_scan'] = task.id
        
        return jsonify({
            'success': True,
            'message': 'Storage scan triggered',
            'scan_type': scan_type,
            'task_ids': task_ids
        })
    
    except Exception as e:
        logger.error(f"Error triggering manual scan: {e}")
        return jsonify({
            'success': False,
            'error': str(e)
        }), 500


@storage_bp.route('/api/storage/cleanup-suggestions', methods=['GET'])
@login_required
def get_cleanup_suggestions():
    """
    Get intelligent cleanup suggestions
    
    Returns:
        JSON with cleanup recommendations
    """
    try:
        suggestions = storage_monitor.generate_cleanup_suggestions()
        
        # Sort by priority
        priority_order = {'high': 0, 'medium': 1, 'low': 2}
        suggestions.sort(key=lambda x: priority_order.get(x['priority'], 3))
        
        return jsonify({
            'success': True,
            'suggestions': suggestions,
            'total_suggestions': len(suggestions)
        })
    
    except Exception as e:
        logger.error(f"Error getting cleanup suggestions: {e}")
        return jsonify({
            'success': False,
            'error': str(e)
        }), 500


@storage_bp.route('/storage/management')
@login_required
def storage_management_page():
    """Render unified storage management page"""
    return render_template('storage_management.html')


@storage_bp.route('/api/storage/buckets', methods=['GET'])
@login_required
def list_buckets():
    """
    List all buckets across local and cloud storage
    
    Query params:
        backend: 'local', 'cloud', or 'all' (default: 'all')
        
    Returns:
        JSON with buckets from specified backends
    """
    try:
        backend = request.args.get('backend', 'all')
        buckets = storage_service.list_buckets(backend)
        
        result = {
            'success': True,
            'local': [
                {
                    'name': b.name,
                    'backend': b.backend,
                    'creation_date': b.creation_date.isoformat() if b.creation_date else None,
                    'size_bytes': b.size_bytes,
                    'object_count': b.object_count,
                    'size_human': storage_service._format_size(b.size_bytes)
                }
                for b in buckets.get('local', [])
            ],
            'cloud': [
                {
                    'name': b.name,
                    'backend': b.backend,
                    'creation_date': b.creation_date.isoformat() if b.creation_date else None,
                    'size_bytes': b.size_bytes,
                    'object_count': b.object_count,
                    'size_human': storage_service._format_size(b.size_bytes)
                }
                for b in buckets.get('cloud', [])
            ],
            'local_available': storage_service.is_local_available(),
            'cloud_available': storage_service.is_cloud_available(),
            'timestamp': datetime.utcnow().isoformat()
        }
        
        return jsonify(result)
    
    except Exception as e:
        logger.error(f"Error listing buckets: {e}")
        return jsonify({
            'success': False,
            'error': str(e)
        }), 500


@storage_bp.route('/api/storage/buckets', methods=['POST'])
@login_required
def create_bucket():
    """
    Create a new bucket
    
    JSON body:
        name: Bucket name
        backend: 'local' or 'cloud' (default: 'local')
        location: Optional region/location
        
    Returns:
        JSON with creation result
    """
    try:
        data = request.get_json()
        
        if not data or 'name' not in data:
            return jsonify({
                'success': False,
                'error': 'Bucket name is required'
            }), 400
        
        name = data['name']
        backend = data.get('backend', 'local')
        location = data.get('location')
        
        result = storage_service.create_bucket(name, backend, location)
        
        if result['success']:
            return jsonify(result)
        else:
            return jsonify(result), 400
    
    except Exception as e:
        logger.error(f"Error creating bucket: {e}")
        return jsonify({
            'success': False,
            'error': str(e)
        }), 500


@storage_bp.route('/api/storage/buckets/<bucket_name>', methods=['DELETE'])
@login_required
def delete_bucket(bucket_name):
    """
    Delete a bucket
    
    Query params:
        backend: 'local' or 'cloud'
        force: 'true' to delete all objects first
        
    Returns:
        JSON with deletion result
    """
    try:
        backend = request.args.get('backend', 'local')
        force = request.args.get('force', 'false').lower() == 'true'
        
        result = storage_service.delete_bucket(bucket_name, backend, force)
        
        if result['success']:
            return jsonify(result)
        else:
            return jsonify(result), 400
    
    except Exception as e:
        logger.error(f"Error deleting bucket: {e}")
        return jsonify({
            'success': False,
            'error': str(e)
        }), 500


@storage_bp.route('/api/storage/buckets/<bucket_name>/objects', methods=['GET'])
@login_required
def list_objects(bucket_name):
    """
    List objects in a bucket
    
    Query params:
        backend: 'local' or 'cloud'
        prefix: Optional prefix filter
        recursive: Whether to list recursively (default: false)
        max_keys: Maximum number of objects (default: 1000)
        
    Returns:
        JSON with objects list
    """
    try:
        backend = request.args.get('backend', 'local')
        prefix = request.args.get('prefix', '')
        recursive = request.args.get('recursive', 'false').lower() == 'true'
        max_keys = int(request.args.get('max_keys', 1000))
        
        result = storage_service.list_objects(
            bucket_name, 
            backend, 
            prefix=prefix, 
            recursive=recursive,
            max_keys=max_keys
        )
        
        return jsonify(result)
    
    except Exception as e:
        logger.error(f"Error listing objects: {e}")
        return jsonify({
            'success': False,
            'error': str(e)
        }), 500


@storage_bp.route('/api/storage/upload', methods=['POST'])
@login_required
def upload_file():
    """
    Upload a file to storage
    
    Form data:
        file: File to upload
        bucket: Bucket name
        key: Optional object key (defaults to filename)
        backend: 'local' or 'cloud' (default: 'local')
        
    Returns:
        JSON with upload result
    """
    try:
        if 'file' not in request.files:
            return jsonify({
                'success': False,
                'error': 'No file provided'
            }), 400
        
        file = request.files['file']
        bucket = request.form.get('bucket')
        key = request.form.get('key', file.filename)
        backend = request.form.get('backend', 'local')
        
        if not bucket:
            return jsonify({
                'success': False,
                'error': 'Bucket name is required'
            }), 400
        
        file_data = file.read()
        content_type = file.content_type or 'application/octet-stream'
        
        result = storage_service.upload_file(
            bucket,
            key,
            file_data,
            backend,
            content_type=content_type
        )
        
        if result['success']:
            return jsonify(result)
        else:
            return jsonify(result), 400
    
    except Exception as e:
        logger.error(f"Error uploading file: {e}")
        return jsonify({
            'success': False,
            'error': str(e)
        }), 500


@storage_bp.route('/api/storage/download/<bucket>/<path:key>', methods=['GET'])
@login_required
def download_file(bucket, key):
    """
    Download a file from storage
    
    Query params:
        backend: 'local' or 'cloud'
        
    Returns:
        File data with appropriate content type
    """
    try:
        backend = request.args.get('backend', 'local')
        
        result = storage_service.download_file(bucket, key, backend)
        
        if not result['success']:
            return jsonify(result), 404
        
        filename = key.split('/')[-1]
        
        return Response(
            result['data'],
            mimetype=result.get('content_type', 'application/octet-stream'),
            headers={
                'Content-Disposition': f'attachment; filename="{filename}"',
                'Content-Length': str(result['size'])
            }
        )
    
    except Exception as e:
        logger.error(f"Error downloading file: {e}")
        return jsonify({
            'success': False,
            'error': str(e)
        }), 500


@storage_bp.route('/api/storage/objects/<bucket>/<path:key>', methods=['DELETE'])
@login_required
def delete_object(bucket, key):
    """
    Delete an object from storage
    
    Query params:
        backend: 'local' or 'cloud'
        
    Returns:
        JSON with deletion result
    """
    try:
        backend = request.args.get('backend', 'local')
        
        result = storage_service.delete_object(bucket, key, backend)
        
        if result['success']:
            return jsonify(result)
        else:
            return jsonify(result), 400
    
    except Exception as e:
        logger.error(f"Error deleting object: {e}")
        return jsonify({
            'success': False,
            'error': str(e)
        }), 500


@storage_bp.route('/api/storage/copy', methods=['POST'])
@login_required
def copy_object():
    """
    Copy an object between buckets/backends
    
    JSON body:
        src_bucket: Source bucket name
        src_key: Source object key
        dst_bucket: Destination bucket name
        dst_key: Destination object key
        src_backend: Source backend ('local' or 'cloud')
        dst_backend: Destination backend ('local' or 'cloud')
        
    Returns:
        JSON with copy result
    """
    try:
        data = request.get_json()
        
        required_fields = ['src_bucket', 'src_key', 'dst_bucket', 'dst_key', 'src_backend', 'dst_backend']
        for field in required_fields:
            if field not in data:
                return jsonify({
                    'success': False,
                    'error': f'Missing required field: {field}'
                }), 400
        
        result = storage_service.copy_object(
            data['src_bucket'],
            data['src_key'],
            data['dst_bucket'],
            data['dst_key'],
            data['src_backend'],
            data['dst_backend']
        )
        
        if result['success']:
            return jsonify(result)
        else:
            return jsonify(result), 400
    
    except Exception as e:
        logger.error(f"Error copying object: {e}")
        return jsonify({
            'success': False,
            'error': str(e)
        }), 500


@storage_bp.route('/api/storage/sync', methods=['POST'])
@login_required
def sync_bucket():
    """
    Sync a bucket between local and cloud storage
    
    JSON body:
        bucket: Bucket name
        source: Source backend ('local' or 'cloud')
        destination: Destination backend ('local' or 'cloud')
        delete_extra: Whether to delete objects that exist only in destination (default: false)
        
    Returns:
        JSON with sync results
    """
    try:
        data = request.get_json()
        
        if not data or 'bucket' not in data:
            return jsonify({
                'success': False,
                'error': 'Bucket name is required'
            }), 400
        
        bucket = data['bucket']
        source = data.get('source', 'local')
        destination = data.get('destination', 'cloud')
        delete_extra = data.get('delete_extra', False)
        
        result = storage_service.sync_bucket(bucket, source, destination, delete_extra)
        
        return jsonify(result)
    
    except Exception as e:
        logger.error(f"Error syncing bucket: {e}")
        return jsonify({
            'success': False,
            'error': str(e)
        }), 500


@storage_bp.route('/api/storage/stats', methods=['GET'])
@login_required
def get_storage_stats():
    """
    Get storage usage statistics
    
    Query params:
        backend: 'local', 'cloud', or 'all' (default: 'all')
        
    Returns:
        JSON with storage statistics
    """
    try:
        backend = request.args.get('backend', 'all')
        
        cache_key = f'storage:unified:stats:{backend}'
        cached = cache_service.get(cache_key)
        if cached:
            return jsonify(cached)
        
        result = storage_service.get_storage_stats(backend)
        
        cache_service.set(cache_key, result, ttl=cache_service.TTL_5_MIN)
        
        return jsonify(result)
    
    except Exception as e:
        logger.error(f"Error getting storage stats: {e}")
        return jsonify({
            'success': False,
            'error': str(e)
        }), 500


@storage_bp.route('/api/storage/mirror', methods=['POST'])
@login_required
def mirror_to_cloud():
    """
    Mirror a local bucket to cloud storage
    
    JSON body:
        bucket: Bucket name to mirror
        
    Returns:
        JSON with mirror results
    """
    try:
        data = request.get_json()
        
        if not data or 'bucket' not in data:
            return jsonify({
                'success': False,
                'error': 'Bucket name is required'
            }), 400
        
        bucket = data['bucket']
        
        result = storage_service.mirror_to_cloud(bucket)
        
        return jsonify(result)
    
    except Exception as e:
        logger.error(f"Error mirroring to cloud: {e}")
        return jsonify({
            'success': False,
            'error': str(e)
        }), 500


@storage_bp.route('/api/storage/presigned-url', methods=['POST'])
@login_required
def get_presigned_url():
    """
    Generate a presigned URL for object access
    
    JSON body:
        bucket: Bucket name
        key: Object key
        backend: 'local' or 'cloud'
        expires: Expiration time in seconds (default: 3600)
        method: 'GET' or 'PUT' (default: 'GET')
        
    Returns:
        JSON with presigned URL
    """
    try:
        data = request.get_json()
        
        if not data or 'bucket' not in data or 'key' not in data:
            return jsonify({
                'success': False,
                'error': 'Bucket and key are required'
            }), 400
        
        bucket = data['bucket']
        key = data['key']
        backend = data.get('backend', 'local')
        expires = int(data.get('expires', 3600))
        method = data.get('method', 'GET')
        
        result = storage_service.get_presigned_url(bucket, key, backend, expires, method)
        
        if result['success']:
            return jsonify(result)
        else:
            return jsonify(result), 400
    
    except Exception as e:
        logger.error(f"Error generating presigned URL: {e}")
        return jsonify({
            'success': False,
            'error': str(e)
        }), 500


@storage_bp.route('/api/storage/lifecycle', methods=['GET'])
@login_required
def get_lifecycle_policy():
    """
    Get lifecycle policy for a bucket
    
    Query params:
        bucket: Bucket name
        backend: 'local' or 'cloud'
        
    Returns:
        JSON with lifecycle rules
    """
    try:
        bucket = request.args.get('bucket')
        backend = request.args.get('backend', 'local')
        
        if not bucket:
            return jsonify({
                'success': False,
                'error': 'Bucket name is required'
            }), 400
        
        result = storage_service.get_lifecycle_policy(bucket, backend)
        
        return jsonify(result)
    
    except Exception as e:
        logger.error(f"Error getting lifecycle policy: {e}")
        return jsonify({
            'success': False,
            'error': str(e)
        }), 500


@storage_bp.route('/api/storage/lifecycle', methods=['POST'])
@login_required
def set_lifecycle_policy():
    """
    Set lifecycle policy for a bucket
    
    JSON body:
        bucket: Bucket name
        backend: 'local' or 'cloud'
        expiration_days: Days after which objects expire
        prefix: Optional prefix to apply rule to
        
    Returns:
        JSON with result
    """
    try:
        data = request.get_json()
        
        if not data or 'bucket' not in data or 'expiration_days' not in data:
            return jsonify({
                'success': False,
                'error': 'Bucket and expiration_days are required'
            }), 400
        
        bucket = data['bucket']
        backend = data.get('backend', 'local')
        expiration_days = int(data['expiration_days'])
        prefix = data.get('prefix', '')
        
        result = storage_service.set_lifecycle_policy(bucket, backend, expiration_days, prefix)
        
        if result['success']:
            return jsonify(result)
        else:
            return jsonify(result), 400
    
    except Exception as e:
        logger.error(f"Error setting lifecycle policy: {e}")
        return jsonify({
            'success': False,
            'error': str(e)
        }), 500


__all__ = ['storage_bp']
