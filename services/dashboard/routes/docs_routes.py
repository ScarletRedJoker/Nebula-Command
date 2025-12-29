"""
API Documentation Routes
Provides interactive API documentation portal
"""
from flask import Blueprint, jsonify, request, render_template
import logging

logger = logging.getLogger(__name__)

docs_bp = Blueprint('docs', __name__)

try:
    from utils.auth import require_auth
except ImportError:
    def require_auth(f):
        return f

API_ENDPOINTS = {
    'monitoring': {
        'name': 'System Monitoring',
        'description': 'Real-time system metrics and performance monitoring',
        'base_path': '/api/monitoring',
        'endpoints': [
            {
                'method': 'GET',
                'path': '/api/monitoring/metrics',
                'description': 'Get all current system metrics (CPU, memory, disk, network)',
                'auth_required': True,
                'response_example': {
                    'success': True,
                    'data': {
                        'timestamp': '2024-12-29T10:00:00',
                        'cpu': {'total_percent': 25.5, 'per_core': [20, 30, 25, 27]},
                        'memory': {'ram': {'percent': 65.2, 'used_gb': 12.5}},
                        'disk': {'partitions': []},
                        'network': {'total': {'sent_gb': 1.5, 'recv_gb': 10.2}}
                    }
                }
            },
            {
                'method': 'GET',
                'path': '/api/monitoring/metrics/cpu',
                'description': 'Get CPU usage metrics including per-core usage',
                'auth_required': True,
                'response_example': {
                    'success': True,
                    'data': {
                        'total_percent': 25.5,
                        'per_core': [20, 30, 25, 27],
                        'cores_physical': 4,
                        'cores_logical': 8
                    },
                    'timestamp': '2024-12-29T10:00:00'
                }
            },
            {
                'method': 'GET',
                'path': '/api/monitoring/metrics/memory',
                'description': 'Get RAM and swap memory usage',
                'auth_required': True,
                'response_example': {
                    'success': True,
                    'data': {
                        'ram': {'total_gb': 32, 'used_gb': 20, 'percent': 62.5},
                        'swap': {'total_gb': 8, 'used_gb': 1, 'percent': 12.5}
                    }
                }
            },
            {
                'method': 'GET',
                'path': '/api/monitoring/metrics/disk',
                'description': 'Get disk usage for all mount points',
                'auth_required': True,
                'response_example': {
                    'success': True,
                    'data': {
                        'partitions': [
                            {'mountpoint': '/', 'total_gb': 500, 'used_gb': 250, 'percent': 50}
                        ],
                        'io': {'read_gb': 100, 'write_gb': 50}
                    }
                }
            },
            {
                'method': 'GET',
                'path': '/api/monitoring/metrics/network',
                'description': 'Get network I/O metrics for all interfaces',
                'auth_required': True,
                'response_example': {
                    'success': True,
                    'data': {
                        'total': {'sent_gb': 1.5, 'recv_gb': 10.2},
                        'interfaces': [{'name': 'eth0', 'sent_mb': 1500, 'recv_mb': 10200}],
                        'connections': 125
                    }
                }
            },
            {
                'method': 'GET',
                'path': '/api/monitoring/metrics/processes',
                'description': 'Get top consuming processes by CPU and memory',
                'auth_required': True,
                'params': [
                    {'name': 'limit', 'type': 'int', 'default': 15, 'description': 'Number of processes to return'}
                ],
                'response_example': {
                    'success': True,
                    'data': {
                        'top_cpu': [{'pid': 1234, 'name': 'python', 'cpu_percent': 25.5}],
                        'top_memory': [{'pid': 1234, 'name': 'chrome', 'memory_percent': 15.2}],
                        'total_count': 256
                    }
                }
            },
            {
                'method': 'GET',
                'path': '/api/monitoring/stream',
                'description': 'SSE endpoint for real-time metrics streaming (2s interval)',
                'auth_required': True,
                'response_example': 'Server-Sent Events stream with JSON data every 2 seconds'
            },
            {
                'method': 'GET',
                'path': '/api/monitoring/hosts',
                'description': 'List all hosts available for monitoring',
                'auth_required': True,
                'response_example': {
                    'success': True,
                    'hosts': [],
                    'local': {'hostname': 'localhost', 'available': True}
                }
            },
            {
                'method': 'GET',
                'path': '/api/monitoring/remote/{host_id}/metrics',
                'description': 'Get metrics from a remote host via SSH',
                'auth_required': True,
                'params': [
                    {'name': 'host_id', 'type': 'string', 'required': True, 'description': 'Remote host identifier'}
                ]
            }
        ]
    },
    'alerts': {
        'name': 'Monitoring Alerts',
        'description': 'Threshold-based alerting and notification management',
        'base_path': '/api/alerts',
        'endpoints': [
            {
                'method': 'GET',
                'path': '/api/alerts',
                'description': 'List all monitoring alerts',
                'auth_required': True,
                'params': [
                    {'name': 'enabled_only', 'type': 'boolean', 'default': False, 'description': 'Filter to enabled alerts only'}
                ],
                'response_example': {
                    'success': True,
                    'alerts': [
                        {'id': 'uuid', 'name': 'High CPU', 'alert_type': 'cpu', 'threshold': 80, 'enabled': True}
                    ]
                }
            },
            {
                'method': 'POST',
                'path': '/api/alerts',
                'description': 'Create a new monitoring alert',
                'auth_required': True,
                'request_body': {
                    'name': 'High CPU Usage',
                    'description': 'Alert when CPU exceeds 80%',
                    'alert_type': 'cpu',
                    'condition': 'gt',
                    'threshold': 80.0,
                    'enabled': True,
                    'cooldown_minutes': 5,
                    'notifications': [
                        {'notification_type': 'discord_webhook', 'destination': 'https://...', 'enabled': True}
                    ]
                },
                'response_example': {'success': True, 'alert': {'id': 'uuid', 'name': 'High CPU Usage'}}
            },
            {
                'method': 'GET',
                'path': '/api/alerts/{alert_id}',
                'description': 'Get a specific alert by ID',
                'auth_required': True
            },
            {
                'method': 'PUT',
                'path': '/api/alerts/{alert_id}',
                'description': 'Update an existing alert',
                'auth_required': True
            },
            {
                'method': 'DELETE',
                'path': '/api/alerts/{alert_id}',
                'description': 'Delete an alert',
                'auth_required': True
            },
            {
                'method': 'POST',
                'path': '/api/alerts/{alert_id}/toggle',
                'description': 'Toggle an alert enabled/disabled status',
                'auth_required': True
            },
            {
                'method': 'POST',
                'path': '/api/alerts/{alert_id}/test',
                'description': 'Send a test notification for an alert',
                'auth_required': True
            },
            {
                'method': 'GET',
                'path': '/api/alerts/history',
                'description': 'Get alert trigger history',
                'auth_required': True,
                'params': [
                    {'name': 'alert_id', 'type': 'string', 'description': 'Filter by specific alert'},
                    {'name': 'limit', 'type': 'int', 'default': 100, 'description': 'Max results'}
                ]
            },
            {
                'method': 'POST',
                'path': '/api/alerts/history/{history_id}/acknowledge',
                'description': 'Acknowledge an alert history entry',
                'auth_required': True,
                'request_body': {'user': 'admin'}
            },
            {
                'method': 'POST',
                'path': '/api/alerts/history/{history_id}/resolve',
                'description': 'Mark an alert as resolved',
                'auth_required': True
            },
            {
                'method': 'POST',
                'path': '/api/alerts/check',
                'description': 'Manually trigger an alert check cycle',
                'auth_required': True
            },
            {
                'method': 'GET',
                'path': '/api/alerts/stats',
                'description': 'Get alert statistics',
                'auth_required': True
            },
            {
                'method': 'POST',
                'path': '/api/alerts/monitor/start',
                'description': 'Start the background alert monitoring thread',
                'auth_required': True,
                'request_body': {'interval': 60}
            },
            {
                'method': 'POST',
                'path': '/api/alerts/monitor/stop',
                'description': 'Stop the background alert monitoring thread',
                'auth_required': True
            },
            {
                'method': 'GET',
                'path': '/api/alerts/monitor/status',
                'description': 'Get the status of the background monitor',
                'auth_required': True
            }
        ]
    },
    'studio': {
        'name': 'Nebula Studio',
        'description': 'Project workspace management, code editing, builds, and deployments',
        'base_path': '/api/studio',
        'endpoints': [
            {
                'method': 'GET',
                'path': '/api/studio/projects',
                'description': 'List all studio projects',
                'auth_required': True,
                'response_example': {
                    'success': True,
                    'projects': [
                        {'id': 'uuid', 'name': 'My Project', 'project_type': 'web', 'language': 'python', 'status': 'ready'}
                    ]
                }
            },
            {
                'method': 'POST',
                'path': '/api/studio/projects',
                'description': 'Create a new studio project',
                'auth_required': True,
                'request_body': {
                    'name': 'My Project',
                    'description': 'Project description',
                    'project_type': 'web',
                    'language': 'python'
                },
                'response_example': {'success': True, 'project': {'id': 'uuid', 'name': 'My Project'}}
            },
            {
                'method': 'GET',
                'path': '/api/studio/projects/{project_id}',
                'description': 'Get project details with files, builds, and deployments',
                'auth_required': True
            },
            {
                'method': 'PUT',
                'path': '/api/studio/projects/{project_id}',
                'description': 'Update project details',
                'auth_required': True
            },
            {
                'method': 'DELETE',
                'path': '/api/studio/projects/{project_id}',
                'description': 'Delete a project and all associated data',
                'auth_required': True
            },
            {
                'method': 'GET',
                'path': '/api/studio/projects/{project_id}/files',
                'description': 'List all files in a project',
                'auth_required': True
            },
            {
                'method': 'POST',
                'path': '/api/studio/projects/{project_id}/files',
                'description': 'Create a new file in a project',
                'auth_required': True,
                'request_body': {
                    'file_path': 'src/main.py',
                    'content': '# Python code',
                    'language': 'python'
                }
            },
            {
                'method': 'GET',
                'path': '/api/studio/projects/{project_id}/files/{file_id}',
                'description': 'Get a specific file content',
                'auth_required': True
            },
            {
                'method': 'PUT',
                'path': '/api/studio/projects/{project_id}/files/{file_id}',
                'description': 'Update file content',
                'auth_required': True
            },
            {
                'method': 'DELETE',
                'path': '/api/studio/projects/{project_id}/files/{file_id}',
                'description': 'Delete a file',
                'auth_required': True
            },
            {
                'method': 'POST',
                'path': '/api/studio/projects/{project_id}/build',
                'description': 'Trigger a new build for a project',
                'auth_required': True,
                'request_body': {'build_type': 'build'},
                'response_example': {'success': True, 'build': {'id': 'uuid', 'status': 'success'}}
            },
            {
                'method': 'GET',
                'path': '/api/studio/projects/{project_id}/build/stream',
                'description': 'Stream build logs via SSE',
                'auth_required': True,
                'params': [
                    {'name': 'build_type', 'type': 'string', 'default': 'build', 'description': 'Type of build'}
                ]
            }
        ]
    },
    'backups': {
        'name': 'Backup Management',
        'description': 'Create, restore, and manage backups with scheduling',
        'base_path': '/api/backups',
        'endpoints': [
            {
                'method': 'GET',
                'path': '/api/backups',
                'description': 'List all backups with pagination',
                'auth_required': True,
                'params': [
                    {'name': 'backup_type', 'type': 'string', 'description': 'Filter by type (database, files, docker_volume)'},
                    {'name': 'status', 'type': 'string', 'description': 'Filter by status (pending, running, completed, failed)'},
                    {'name': 'limit', 'type': 'int', 'default': 50, 'description': 'Results per page'},
                    {'name': 'offset', 'type': 'int', 'default': 0, 'description': 'Pagination offset'}
                ]
            },
            {
                'method': 'POST',
                'path': '/api/backups',
                'description': 'Create a new backup',
                'auth_required': True,
                'request_body': {
                    'name': 'Daily Backup',
                    'backup_type': 'database',
                    'source': 'jarvis_db',
                    'destination_type': 'local',
                    'compression': 'gzip'
                }
            },
            {
                'method': 'GET',
                'path': '/api/backups/{backup_id}',
                'description': 'Get backup details',
                'auth_required': True
            },
            {
                'method': 'POST',
                'path': '/api/backups/{backup_id}/restore',
                'description': 'Restore from a backup',
                'auth_required': True,
                'request_body': {'target_path': '/optional/custom/path'}
            },
            {
                'method': 'DELETE',
                'path': '/api/backups/{backup_id}',
                'description': 'Delete a backup',
                'auth_required': True,
                'params': [
                    {'name': 'delete_file', 'type': 'boolean', 'default': True, 'description': 'Also delete backup file'}
                ]
            },
            {
                'method': 'GET',
                'path': '/api/backups/{backup_id}/download',
                'description': 'Download a backup file',
                'auth_required': True
            },
            {
                'method': 'GET',
                'path': '/api/backups/storage',
                'description': 'Get backup storage statistics',
                'auth_required': True
            },
            {
                'method': 'GET',
                'path': '/api/backups/sources',
                'description': 'Get available backup sources (databases, volumes, projects)',
                'auth_required': True
            },
            {
                'method': 'POST',
                'path': '/api/backups/cleanup',
                'description': 'Clean up old backups based on retention policies',
                'auth_required': True
            },
            {
                'method': 'GET',
                'path': '/api/backups/minio/status',
                'description': 'Get MinIO/S3 configuration status',
                'auth_required': True
            },
            {
                'method': 'GET',
                'path': '/api/backups/minio',
                'description': 'List backups stored in MinIO/S3',
                'auth_required': True
            },
            {
                'method': 'GET',
                'path': '/api/backups/schedules',
                'description': 'List all backup schedules',
                'auth_required': True
            },
            {
                'method': 'POST',
                'path': '/api/backups/schedules',
                'description': 'Create a new backup schedule',
                'auth_required': True,
                'request_body': {
                    'name': 'Daily DB Backup',
                    'backup_type': 'database',
                    'source': 'jarvis_db',
                    'cron_expression': '0 2 * * *',
                    'retention_days': 30
                }
            },
            {
                'method': 'GET',
                'path': '/api/backups/schedules/{schedule_id}',
                'description': 'Get schedule details',
                'auth_required': True
            },
            {
                'method': 'PUT',
                'path': '/api/backups/schedules/{schedule_id}',
                'description': 'Update a backup schedule',
                'auth_required': True
            },
            {
                'method': 'DELETE',
                'path': '/api/backups/schedules/{schedule_id}',
                'description': 'Delete a backup schedule',
                'auth_required': True
            },
            {
                'method': 'POST',
                'path': '/api/backups/schedules/{schedule_id}/run',
                'description': 'Manually trigger a scheduled backup',
                'auth_required': True
            }
        ]
    },
    'activity': {
        'name': 'Activity Feed',
        'description': 'Unified activity logging and real-time event streaming',
        'base_path': '/api/activity',
        'endpoints': [
            {
                'method': 'GET',
                'path': '/api/activity',
                'description': 'List activity events with filters and pagination',
                'auth_required': True,
                'params': [
                    {'name': 'limit', 'type': 'int', 'default': 50, 'description': 'Max results'},
                    {'name': 'offset', 'type': 'int', 'default': 0, 'description': 'Pagination offset'},
                    {'name': 'source', 'type': 'string', 'description': 'Filter by source (dashboard, discord, stream, docker)'},
                    {'name': 'type', 'type': 'string', 'description': 'Filter by event type'},
                    {'name': 'severity', 'type': 'string', 'description': 'Filter by severity (info, warning, error, success)'},
                    {'name': 'grouped', 'type': 'boolean', 'description': 'Group by date for timeline view'}
                ]
            },
            {
                'method': 'POST',
                'path': '/api/activity',
                'description': 'Log a new activity event',
                'auth_required': True,
                'request_body': {
                    'event_type': 'deployment',
                    'source_service': 'docker',
                    'title': 'Container started',
                    'description': 'nginx container started successfully',
                    'severity': 'success',
                    'metadata': {'container_id': 'abc123'}
                }
            },
            {
                'method': 'GET',
                'path': '/api/activity/stream',
                'description': 'SSE endpoint for real-time activity feed',
                'auth_required': False,
                'response_example': 'Server-Sent Events stream with activity updates'
            },
            {
                'method': 'GET',
                'path': '/api/activity/types',
                'description': 'Get list of available event types',
                'auth_required': True
            },
            {
                'method': 'GET',
                'path': '/api/activity/sources',
                'description': 'Get list of available source services',
                'auth_required': True
            },
            {
                'method': 'GET',
                'path': '/api/activity/statistics',
                'description': 'Get activity statistics',
                'auth_required': True
            },
            {
                'method': 'GET',
                'path': '/api/activity/summary',
                'description': 'Get activity summary with charts data',
                'auth_required': True,
                'params': [
                    {'name': 'days', 'type': 'int', 'default': 7, 'description': 'Number of days to include'}
                ]
            },
            {
                'method': 'POST',
                'path': '/api/activity/webhook',
                'description': 'Webhook endpoint for external services (Discord Bot, Stream Bot)',
                'auth_required': False,
                'request_body': {
                    'event_type': 'command_used',
                    'source_service': 'discord',
                    'title': 'User executed !play command',
                    'actor': 'user123',
                    'metadata': {'guild_id': '123456'}
                },
                'notes': 'Requires X-API-Key header or X-Service-Token for authentication'
            },
            {
                'method': 'GET',
                'path': '/api/activity/config',
                'description': 'Get webhook configuration info for external services',
                'auth_required': True
            },
            {
                'method': 'POST',
                'path': '/api/activity/clear',
                'description': 'Clear in-memory activity cache',
                'auth_required': True
            }
        ]
    },
    'workflows': {
        'name': 'Workflow Builder',
        'description': 'Visual automation workflow creation and execution',
        'base_path': '/api/workflows',
        'endpoints': [
            {
                'method': 'GET',
                'path': '/api/workflows',
                'description': 'List all automation workflows',
                'auth_required': True,
                'response_example': {
                    'success': True,
                    'workflows': [
                        {'id': 'uuid', 'name': 'Auto Deploy', 'enabled': True, 'trigger_type': 'webhook'}
                    ]
                }
            },
            {
                'method': 'POST',
                'path': '/api/workflows',
                'description': 'Create a new automation workflow',
                'auth_required': True,
                'request_body': {
                    'name': 'Auto Deploy',
                    'description': 'Automatically deploy on push',
                    'trigger_type': 'webhook',
                    'nodes': [],
                    'edges': []
                }
            },
            {
                'method': 'GET',
                'path': '/api/workflows/{workflow_id}',
                'description': 'Get workflow details with recent executions',
                'auth_required': True
            },
            {
                'method': 'PUT',
                'path': '/api/workflows/{workflow_id}',
                'description': 'Update workflow',
                'auth_required': True
            },
            {
                'method': 'DELETE',
                'path': '/api/workflows/{workflow_id}',
                'description': 'Delete workflow',
                'auth_required': True
            },
            {
                'method': 'POST',
                'path': '/api/workflows/{workflow_id}/execute',
                'description': 'Manually trigger workflow execution',
                'auth_required': True,
                'request_body': {'trigger_data': {'key': 'value'}}
            },
            {
                'method': 'GET',
                'path': '/api/workflows/{workflow_id}/executions',
                'description': 'Get execution history for a workflow',
                'auth_required': True,
                'params': [
                    {'name': 'limit', 'type': 'int', 'default': 50},
                    {'name': 'offset', 'type': 'int', 'default': 0}
                ]
            },
            {
                'method': 'POST',
                'path': '/api/workflows/{workflow_id}/toggle',
                'description': 'Enable/disable workflow',
                'auth_required': True
            },
            {
                'method': 'POST',
                'path': '/api/workflows/{workflow_id}/duplicate',
                'description': 'Create a copy of an existing workflow',
                'auth_required': True
            },
            {
                'method': 'GET',
                'path': '/api/workflows/node-types',
                'description': 'Get all available node types and their schemas',
                'auth_required': True
            },
            {
                'method': 'POST',
                'path': '/api/workflows/validate',
                'description': 'Validate workflow structure before saving',
                'auth_required': True,
                'request_body': {'nodes': [], 'edges': []}
            }
        ]
    }
}


@docs_bp.route('/docs')
@require_auth
def docs_page():
    """Render the API documentation page"""
    return render_template('api_docs.html')


@docs_bp.route('/api/docs/endpoints', methods=['GET'])
@require_auth
def get_endpoints():
    """
    GET /api/docs/endpoints
    Return all API endpoints as JSON for search/filtering
    """
    try:
        category = request.args.get('category')
        search = request.args.get('search', '').lower()
        
        result = {}
        
        for cat_key, cat_data in API_ENDPOINTS.items():
            if category and cat_key != category:
                continue
            
            endpoints = cat_data['endpoints']
            
            if search:
                endpoints = [
                    ep for ep in endpoints
                    if search in ep['path'].lower() or 
                       search in ep['description'].lower() or
                       search in ep['method'].lower()
                ]
            
            if endpoints:
                result[cat_key] = {
                    'name': cat_data['name'],
                    'description': cat_data['description'],
                    'base_path': cat_data['base_path'],
                    'endpoints': endpoints
                }
        
        return jsonify({
            'success': True,
            'categories': result,
            'total_endpoints': sum(len(cat['endpoints']) for cat in result.values())
        })
        
    except Exception as e:
        logger.error(f"Error getting endpoints: {e}")
        return jsonify({
            'success': False,
            'error': str(e)
        }), 500


@docs_bp.route('/api/docs/categories', methods=['GET'])
@require_auth
def get_categories():
    """
    GET /api/docs/categories
    Return list of API categories
    """
    try:
        categories = [
            {
                'key': key,
                'name': data['name'],
                'description': data['description'],
                'base_path': data['base_path'],
                'endpoint_count': len(data['endpoints'])
            }
            for key, data in API_ENDPOINTS.items()
        ]
        
        return jsonify({
            'success': True,
            'categories': categories
        })
        
    except Exception as e:
        logger.error(f"Error getting categories: {e}")
        return jsonify({
            'success': False,
            'error': str(e)
        }), 500
