"""
Log Viewer/Aggregator Routes
Real-time log streaming, querying, and management
"""
from flask import Blueprint, jsonify, request, render_template, Response
from datetime import datetime, timedelta
import logging
import json
import time
import uuid

logger = logging.getLogger(__name__)

log_bp = Blueprint('logs', __name__, url_prefix='/api/logs')
log_web_bp = Blueprint('logs_web', __name__)

try:
    from utils.auth import require_auth
except ImportError:
    def require_auth(f):
        return f

try:
    from services.log_service import log_service
except ImportError:
    log_service = None
    logger.warning("Log service not available")


@log_web_bp.route('/logs')
@require_auth
def logs_page():
    """Render the log viewer page"""
    return render_template('logs.html')


@log_bp.route('', methods=['GET'])
@require_auth
def query_logs():
    """
    GET /api/logs
    Query logs with filters
    """
    try:
        source = request.args.get('source')
        level = request.args.get('level')
        search = request.args.get('search')
        start_time = request.args.get('start_time')
        end_time = request.args.get('end_time')
        container = request.args.get('container')
        limit = request.args.get('limit', 100, type=int)
        offset = request.args.get('offset', 0, type=int)
        stream_id = request.args.get('stream_id', type=int)
        
        start_dt = None
        end_dt = None
        if start_time:
            try:
                start_dt = datetime.fromisoformat(start_time.replace('Z', '+00:00'))
            except ValueError:
                pass
        if end_time:
            try:
                end_dt = datetime.fromisoformat(end_time.replace('Z', '+00:00'))
            except ValueError:
                pass
        
        if not log_service:
            return jsonify({
                'success': False,
                'error': 'Log service not available'
            }), 503
        
        result = log_service.query_logs(
            source=source,
            level=level,
            search=search,
            start_time=start_dt,
            end_time=end_dt,
            container_name=container,
            limit=min(limit, 1000),
            offset=offset,
            stream_id=stream_id
        )
        
        return jsonify({
            'success': True,
            **result
        })
    except Exception as e:
        logger.error(f"Query logs error: {e}")
        return jsonify({
            'success': False,
            'error': str(e)
        }), 500


@log_bp.route('/stream', methods=['GET'])
@require_auth
def stream_logs():
    """
    GET /api/logs/stream
    Server-Sent Events endpoint for real-time log streaming
    """
    if not log_service:
        return jsonify({'error': 'Log service not available'}), 503
    
    source = request.args.get('source')
    level = request.args.get('level')
    search = request.args.get('search')
    
    filters = {}
    if source:
        filters['source'] = source
    if level:
        filters['level'] = level.split(',') if ',' in level else level
    if search:
        filters['search'] = search
    
    client_id = str(uuid.uuid4())
    client = log_service.register_sse_client(client_id, filters)
    
    def generate():
        try:
            yield f"data: {json.dumps({'type': 'connected', 'client_id': client_id})}\n\n"
            
            recent_logs = log_service.get_buffered_logs(
                source=source,
                level=level,
                search=search,
                limit=50
            )
            for log in reversed(recent_logs):
                yield f"data: {json.dumps({'type': 'log', 'data': log})}\n\n"
            
            while client.connected:
                try:
                    entry = client.queue.get(timeout=30)
                    yield f"data: {json.dumps({'type': 'log', 'data': entry})}\n\n"
                except Exception:
                    yield f"data: {json.dumps({'type': 'heartbeat', 'timestamp': datetime.now().isoformat()})}\n\n"
        except GeneratorExit:
            pass
        finally:
            log_service.unregister_sse_client(client_id)
    
    return Response(
        generate(),
        mimetype='text/event-stream',
        headers={
            'Cache-Control': 'no-cache',
            'Connection': 'keep-alive',
            'X-Accel-Buffering': 'no'
        }
    )


@log_bp.route('/search', methods=['GET'])
@require_auth
def search_logs():
    """
    GET /api/logs/search
    Full-text search in logs
    """
    try:
        query = request.args.get('q', '')
        source = request.args.get('source')
        level = request.args.get('level')
        limit = request.args.get('limit', 100, type=int)
        regex = request.args.get('regex', 'false').lower() == 'true'
        
        if not query:
            return jsonify({
                'success': False,
                'error': 'Query parameter "q" is required'
            }), 400
        
        if not log_service:
            return jsonify({
                'success': False,
                'error': 'Log service not available'
            }), 503
        
        result = log_service.full_text_search(
            query=query,
            source=source,
            level=level,
            limit=min(limit, 500),
            regex=regex
        )
        
        return jsonify({
            'success': True,
            **result
        })
    except Exception as e:
        logger.error(f"Search logs error: {e}")
        return jsonify({
            'success': False,
            'error': str(e)
        }), 500


@log_bp.route('/sources', methods=['GET'])
@require_auth
def list_sources():
    """
    GET /api/logs/sources
    List all available log sources
    """
    try:
        if not log_service:
            return jsonify({
                'success': False,
                'error': 'Log service not available'
            }), 503
        
        sources = log_service.get_sources()
        
        return jsonify({
            'success': True,
            'sources': sources
        })
    except Exception as e:
        logger.error(f"List sources error: {e}")
        return jsonify({
            'success': False,
            'error': str(e)
        }), 500


@log_bp.route('/sources', methods=['POST'])
@require_auth
def create_source():
    """
    POST /api/logs/sources
    Create a new log source/stream
    """
    try:
        data = request.get_json() or {}
        
        name = data.get('name')
        source_type = data.get('source_type')
        
        if not name or not source_type:
            return jsonify({
                'success': False,
                'error': 'name and source_type are required'
            }), 400
        
        if source_type not in ['file', 'docker', 'systemd', 'application']:
            return jsonify({
                'success': False,
                'error': 'Invalid source_type. Must be one of: file, docker, systemd, application'
            }), 400
        
        if not log_service:
            return jsonify({
                'success': False,
                'error': 'Log service not available'
            }), 503
        
        result = log_service.create_log_stream(
            name=name,
            source_type=source_type,
            source_path=data.get('source_path'),
            container_name=data.get('container_name'),
            systemd_unit=data.get('systemd_unit'),
            description=data.get('description'),
            filter_pattern=data.get('filter_pattern'),
            retention_days=data.get('retention_days', 30)
        )
        
        if 'error' in result:
            return jsonify({
                'success': False,
                'error': result['error']
            }), 400
        
        return jsonify({
            'success': True,
            'stream': result.get('stream')
        }), 201
    except Exception as e:
        logger.error(f"Create source error: {e}")
        return jsonify({
            'success': False,
            'error': str(e)
        }), 500


@log_bp.route('/sources/<int:source_id>', methods=['DELETE'])
@require_auth
def delete_source(source_id):
    """
    DELETE /api/logs/sources/<id>
    Delete a log source/stream
    """
    try:
        if not log_service:
            return jsonify({
                'success': False,
                'error': 'Log service not available'
            }), 503
        
        result = log_service.delete_log_stream(source_id)
        
        if 'error' in result:
            return jsonify({
                'success': False,
                'error': result['error']
            }), 400
        
        return jsonify({
            'success': True,
            'deleted': source_id
        })
    except Exception as e:
        logger.error(f"Delete source error: {e}")
        return jsonify({
            'success': False,
            'error': str(e)
        }), 500


@log_bp.route('/docker/<container_name>', methods=['GET'])
@require_auth
def get_docker_logs(container_name):
    """
    GET /api/logs/docker/<container_name>
    Get logs from a specific Docker container
    """
    try:
        lines = request.args.get('lines', 100, type=int)
        since = request.args.get('since')
        
        if not log_service:
            return jsonify({
                'success': False,
                'error': 'Log service not available'
            }), 503
        
        since_dt = None
        if since:
            try:
                since_dt = datetime.fromisoformat(since.replace('Z', '+00:00'))
            except ValueError:
                pass
        
        logs = list(log_service.get_docker_logs(
            container_name=container_name,
            lines=min(lines, 1000),
            since=since_dt
        ))
        
        if logs and 'error' in logs[0]:
            return jsonify({
                'success': False,
                'error': logs[0]['error']
            }), 400
        
        return jsonify({
            'success': True,
            'container': container_name,
            'logs': logs,
            'count': len(logs)
        })
    except Exception as e:
        logger.error(f"Get Docker logs error: {e}")
        return jsonify({
            'success': False,
            'error': str(e)
        }), 500


@log_bp.route('/systemd/<unit_name>', methods=['GET'])
@require_auth
def get_systemd_logs(unit_name):
    """
    GET /api/logs/systemd/<unit_name>
    Get logs from a specific systemd unit
    """
    try:
        lines = request.args.get('lines', 100, type=int)
        since = request.args.get('since', '1 hour ago')
        priority = request.args.get('priority')
        
        if not log_service:
            return jsonify({
                'success': False,
                'error': 'Log service not available'
            }), 503
        
        logs = list(log_service.get_systemd_logs(
            unit=unit_name,
            lines=min(lines, 1000),
            since=since,
            priority=priority
        ))
        
        if logs and 'error' in logs[0]:
            return jsonify({
                'success': False,
                'error': logs[0]['error']
            }), 400
        
        return jsonify({
            'success': True,
            'unit': unit_name,
            'logs': logs,
            'count': len(logs)
        })
    except Exception as e:
        logger.error(f"Get systemd logs error: {e}")
        return jsonify({
            'success': False,
            'error': str(e)
        }), 500


@log_bp.route('/file', methods=['GET'])
@require_auth
def get_file_logs():
    """
    GET /api/logs/file
    Tail a log file
    """
    try:
        file_path = request.args.get('path')
        lines = request.args.get('lines', 100, type=int)
        
        if not file_path:
            return jsonify({
                'success': False,
                'error': 'path parameter is required'
            }), 400
        
        if not log_service:
            return jsonify({
                'success': False,
                'error': 'Log service not available'
            }), 503
        
        logs = list(log_service.tail_file(
            file_path=file_path,
            lines=min(lines, 1000)
        ))
        
        if logs and 'error' in logs[0]:
            return jsonify({
                'success': False,
                'error': logs[0]['error']
            }), 400
        
        return jsonify({
            'success': True,
            'file': file_path,
            'logs': logs,
            'count': len(logs)
        })
    except Exception as e:
        logger.error(f"Get file logs error: {e}")
        return jsonify({
            'success': False,
            'error': str(e)
        }), 500


@log_bp.route('/stats', methods=['GET'])
@require_auth
def get_stats():
    """
    GET /api/logs/stats
    Get log service statistics
    """
    try:
        if not log_service:
            return jsonify({
                'success': False,
                'error': 'Log service not available'
            }), 503
        
        stats = log_service.get_stats()
        
        return jsonify({
            'success': True,
            'stats': stats
        })
    except Exception as e:
        logger.error(f"Get stats error: {e}")
        return jsonify({
            'success': False,
            'error': str(e)
        }), 500


@log_bp.route('/containers', methods=['GET'])
@require_auth
def list_containers():
    """
    GET /api/logs/containers
    List Docker containers available for logging
    """
    try:
        if not log_service:
            return jsonify({
                'success': False,
                'error': 'Log service not available'
            }), 503
        
        containers = log_service.get_docker_containers()
        
        return jsonify({
            'success': True,
            'containers': containers
        })
    except Exception as e:
        logger.error(f"List containers error: {e}")
        return jsonify({
            'success': False,
            'error': str(e)
        }), 500


@log_bp.route('/units', methods=['GET'])
@require_auth
def list_systemd_units():
    """
    GET /api/logs/units
    List systemd units available for logging
    """
    try:
        if not log_service:
            return jsonify({
                'success': False,
                'error': 'Log service not available'
            }), 503
        
        units = log_service.get_systemd_units()
        
        return jsonify({
            'success': True,
            'units': units
        })
    except Exception as e:
        logger.error(f"List units error: {e}")
        return jsonify({
            'success': False,
            'error': str(e)
        }), 500


@log_bp.route('/download', methods=['GET'])
@require_auth
def download_logs():
    """
    GET /api/logs/download
    Download logs as a file
    """
    try:
        source = request.args.get('source')
        level = request.args.get('level')
        search = request.args.get('search')
        format_type = request.args.get('format', 'json')
        limit = request.args.get('limit', 1000, type=int)
        
        if not log_service:
            return jsonify({
                'success': False,
                'error': 'Log service not available'
            }), 503
        
        result = log_service.query_logs(
            source=source,
            level=level,
            search=search,
            limit=min(limit, 10000)
        )
        
        logs = result.get('logs', [])
        
        if format_type == 'json':
            content = json.dumps(logs, indent=2)
            mimetype = 'application/json'
            filename = 'logs.json'
        else:
            lines = []
            for log in logs:
                ts = log.get('timestamp', '')
                level = log.get('level', 'INFO').upper()
                source = log.get('source', '')
                message = log.get('message', '')
                lines.append(f"[{ts}] [{level}] [{source}] {message}")
            content = '\n'.join(lines)
            mimetype = 'text/plain'
            filename = 'logs.txt'
        
        return Response(
            content,
            mimetype=mimetype,
            headers={
                'Content-Disposition': f'attachment; filename={filename}'
            }
        )
    except Exception as e:
        logger.error(f"Download logs error: {e}")
        return jsonify({
            'success': False,
            'error': str(e)
        }), 500


__all__ = ['log_bp', 'log_web_bp']
