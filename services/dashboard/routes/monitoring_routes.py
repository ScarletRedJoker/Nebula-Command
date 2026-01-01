"""
System Monitoring Dashboard Routes
Real-time system metrics with SSE streaming support
"""
from flask import Blueprint, jsonify, request, render_template, Response
from datetime import datetime
import logging
import json
import time
import threading
import os

logger = logging.getLogger(__name__)

monitoring_bp = Blueprint('monitoring', __name__, url_prefix='/api/monitoring')
monitoring_web_bp = Blueprint('monitoring_web', __name__)

try:
    from utils.auth import require_auth
except ImportError:
    def require_auth(f):
        return f

try:
    import psutil
    PSUTIL_AVAILABLE = True
except ImportError:
    PSUTIL_AVAILABLE = False
    logger.warning("psutil not available - local metrics disabled")


def get_cpu_metrics():
    """Get CPU usage metrics"""
    if not PSUTIL_AVAILABLE:
        return {'error': 'psutil not available'}
    
    try:
        cpu_percent = psutil.cpu_percent(interval=0.1)
        cpu_per_core = psutil.cpu_percent(interval=0.1, percpu=True)
        cpu_freq = psutil.cpu_freq()
        cpu_count = psutil.cpu_count()
        cpu_count_logical = psutil.cpu_count(logical=True)
        
        return {
            'total_percent': cpu_percent,
            'per_core': cpu_per_core,
            'frequency': {
                'current': cpu_freq.current if cpu_freq else 0,
                'min': cpu_freq.min if cpu_freq else 0,
                'max': cpu_freq.max if cpu_freq else 0
            } if cpu_freq else None,
            'cores_physical': cpu_count,
            'cores_logical': cpu_count_logical,
            'load_avg': list(psutil.getloadavg()) if hasattr(psutil, 'getloadavg') else None
        }
    except Exception as e:
        logger.error(f"Error getting CPU metrics: {e}")
        return {'error': str(e)}


def get_memory_metrics():
    """Get RAM usage metrics"""
    if not PSUTIL_AVAILABLE:
        return {'error': 'psutil not available'}
    
    try:
        mem = psutil.virtual_memory()
        swap = psutil.swap_memory()
        
        return {
            'ram': {
                'total': mem.total,
                'available': mem.available,
                'used': mem.used,
                'free': mem.free,
                'percent': mem.percent,
                'total_gb': round(mem.total / (1024**3), 2),
                'used_gb': round(mem.used / (1024**3), 2),
                'available_gb': round(mem.available / (1024**3), 2)
            },
            'swap': {
                'total': swap.total,
                'used': swap.used,
                'free': swap.free,
                'percent': swap.percent,
                'total_gb': round(swap.total / (1024**3), 2),
                'used_gb': round(swap.used / (1024**3), 2)
            }
        }
    except Exception as e:
        logger.error(f"Error getting memory metrics: {e}")
        return {'error': str(e)}


def get_disk_metrics():
    """Get disk usage metrics for all mount points"""
    if not PSUTIL_AVAILABLE:
        return {'error': 'psutil not available'}
    
    try:
        disks = []
        partitions = psutil.disk_partitions(all=False)
        
        for partition in partitions:
            try:
                usage = psutil.disk_usage(partition.mountpoint)
                disks.append({
                    'device': partition.device,
                    'mountpoint': partition.mountpoint,
                    'fstype': partition.fstype,
                    'total': usage.total,
                    'used': usage.used,
                    'free': usage.free,
                    'percent': usage.percent,
                    'total_gb': round(usage.total / (1024**3), 2),
                    'used_gb': round(usage.used / (1024**3), 2),
                    'free_gb': round(usage.free / (1024**3), 2)
                })
            except (PermissionError, OSError):
                continue
        
        disk_io = psutil.disk_io_counters()
        io_stats = None
        if disk_io:
            io_stats = {
                'read_bytes': disk_io.read_bytes,
                'write_bytes': disk_io.write_bytes,
                'read_count': disk_io.read_count,
                'write_count': disk_io.write_count,
                'read_gb': round(disk_io.read_bytes / (1024**3), 2),
                'write_gb': round(disk_io.write_bytes / (1024**3), 2)
            }
        
        return {
            'partitions': disks,
            'io': io_stats
        }
    except Exception as e:
        logger.error(f"Error getting disk metrics: {e}")
        return {'error': str(e)}


def get_network_metrics():
    """Get network I/O metrics"""
    if not PSUTIL_AVAILABLE:
        return {'error': 'psutil not available'}
    
    try:
        net_io = psutil.net_io_counters()
        net_io_per_nic = psutil.net_io_counters(pernic=True)
        
        interfaces = []
        for nic, stats in net_io_per_nic.items():
            interfaces.append({
                'name': nic,
                'bytes_sent': stats.bytes_sent,
                'bytes_recv': stats.bytes_recv,
                'packets_sent': stats.packets_sent,
                'packets_recv': stats.packets_recv,
                'sent_mb': round(stats.bytes_sent / (1024**2), 2),
                'recv_mb': round(stats.bytes_recv / (1024**2), 2)
            })
        
        connections = len(psutil.net_connections(kind='inet'))
        
        return {
            'total': {
                'bytes_sent': net_io.bytes_sent,
                'bytes_recv': net_io.bytes_recv,
                'packets_sent': net_io.packets_sent,
                'packets_recv': net_io.packets_recv,
                'sent_gb': round(net_io.bytes_sent / (1024**3), 2),
                'recv_gb': round(net_io.bytes_recv / (1024**3), 2)
            },
            'interfaces': interfaces,
            'connections': connections
        }
    except Exception as e:
        logger.error(f"Error getting network metrics: {e}")
        return {'error': str(e)}


def get_process_metrics(limit=15):
    """Get top consuming processes"""
    if not PSUTIL_AVAILABLE:
        return {'error': 'psutil not available'}
    
    try:
        processes = []
        for proc in psutil.process_iter(['pid', 'name', 'username', 'cpu_percent', 'memory_percent', 'status', 'create_time']):
            try:
                pinfo = proc.info
                pinfo['memory_mb'] = round(proc.memory_info().rss / (1024**2), 2) if hasattr(proc, 'memory_info') else 0
                processes.append(pinfo)
            except (psutil.NoSuchProcess, psutil.AccessDenied, psutil.ZombieProcess):
                continue
        
        processes.sort(key=lambda x: x.get('cpu_percent', 0), reverse=True)
        top_cpu = processes[:limit]
        
        processes.sort(key=lambda x: x.get('memory_percent', 0), reverse=True)
        top_memory = processes[:limit]
        
        return {
            'top_cpu': top_cpu,
            'top_memory': top_memory,
            'total_count': len(processes)
        }
    except Exception as e:
        logger.error(f"Error getting process metrics: {e}")
        return {'error': str(e)}


def get_system_info():
    """Get general system information"""
    if not PSUTIL_AVAILABLE:
        return {'error': 'psutil not available'}
    
    try:
        boot_time = datetime.fromtimestamp(psutil.boot_time())
        uptime = datetime.now() - boot_time
        
        import platform
        return {
            'hostname': platform.node(),
            'platform': platform.system(),
            'platform_release': platform.release(),
            'platform_version': platform.version(),
            'architecture': platform.machine(),
            'processor': platform.processor(),
            'boot_time': boot_time.isoformat(),
            'uptime_seconds': uptime.total_seconds(),
            'uptime_human': str(uptime).split('.')[0]
        }
    except Exception as e:
        logger.error(f"Error getting system info: {e}")
        return {'error': str(e)}


def get_all_metrics():
    """Get all system metrics"""
    return {
        'timestamp': datetime.now().isoformat(),
        'system': get_system_info(),
        'cpu': get_cpu_metrics(),
        'memory': get_memory_metrics(),
        'disk': get_disk_metrics(),
        'network': get_network_metrics(),
        'processes': get_process_metrics()
    }


@monitoring_web_bp.route('/monitoring')
@require_auth
def monitoring_page():
    """Render the monitoring dashboard page"""
    return render_template('monitoring.html')


@monitoring_bp.route('/metrics', methods=['GET'])
@require_auth
def get_metrics():
    """
    GET /api/monitoring/metrics
    Get all current system metrics
    """
    try:
        metrics = get_all_metrics()
        return jsonify({
            'success': True,
            'data': metrics
        })
    except Exception as e:
        logger.error(f"Error getting metrics: {e}")
        return jsonify({
            'success': False,
            'error': str(e)
        }), 500


@monitoring_bp.route('/metrics/cpu', methods=['GET'])
@require_auth
def get_cpu():
    """GET /api/monitoring/metrics/cpu - Get CPU metrics"""
    return jsonify({
        'success': True,
        'data': get_cpu_metrics(),
        'timestamp': datetime.now().isoformat()
    })


@monitoring_bp.route('/metrics/memory', methods=['GET'])
@require_auth
def get_memory():
    """GET /api/monitoring/metrics/memory - Get memory metrics"""
    return jsonify({
        'success': True,
        'data': get_memory_metrics(),
        'timestamp': datetime.now().isoformat()
    })


@monitoring_bp.route('/metrics/disk', methods=['GET'])
@require_auth
def get_disk():
    """GET /api/monitoring/metrics/disk - Get disk metrics"""
    return jsonify({
        'success': True,
        'data': get_disk_metrics(),
        'timestamp': datetime.now().isoformat()
    })


@monitoring_bp.route('/metrics/network', methods=['GET'])
@require_auth
def get_network():
    """GET /api/monitoring/metrics/network - Get network metrics"""
    return jsonify({
        'success': True,
        'data': get_network_metrics(),
        'timestamp': datetime.now().isoformat()
    })


@monitoring_bp.route('/metrics/processes', methods=['GET'])
@require_auth
def get_processes():
    """GET /api/monitoring/metrics/processes - Get process list"""
    limit = request.args.get('limit', 15, type=int)
    return jsonify({
        'success': True,
        'data': get_process_metrics(limit=limit),
        'timestamp': datetime.now().isoformat()
    })


@monitoring_bp.route('/stream', methods=['GET'])
@require_auth
def stream_metrics():
    """
    GET /api/monitoring/stream
    Server-Sent Events endpoint for real-time metrics streaming
    """
    def generate():
        while True:
            try:
                metrics = {
                    'timestamp': datetime.now().isoformat(),
                    'cpu': get_cpu_metrics(),
                    'memory': get_memory_metrics(),
                    'network': get_network_metrics()
                }
                yield f"data: {json.dumps(metrics)}\n\n"
                time.sleep(2)
            except GeneratorExit:
                break
            except Exception as e:
                logger.error(f"SSE stream error: {e}")
                yield f"data: {json.dumps({'error': str(e)})}\n\n"
                time.sleep(5)
    
    return Response(
        generate(),
        mimetype='text/event-stream',
        headers={
            'Cache-Control': 'no-cache',
            'Connection': 'keep-alive',
            'X-Accel-Buffering': 'no'
        }
    )


@monitoring_bp.route('/remote/<host_id>/metrics', methods=['GET'])
@require_auth
def get_remote_metrics(host_id):
    """
    GET /api/monitoring/remote/<host_id>/metrics
    Get metrics from a remote host via SSH (Tailscale)
    """
    try:
        from services.fleet_service import fleet_service
        
        host = fleet_service.get_host(host_id)
        if not host:
            return jsonify({
                'success': False,
                'error': f'Host {host_id} not found'
            }), 404
        
        ssh_command = '''python3 -c "
import json, psutil
from datetime import datetime
data = {
    'timestamp': datetime.now().isoformat(),
    'cpu': {
        'percent': psutil.cpu_percent(interval=0.1),
        'per_core': psutil.cpu_percent(interval=0.1, percpu=True),
        'cores': psutil.cpu_count()
    },
    'memory': {
        'percent': psutil.virtual_memory().percent,
        'total_gb': round(psutil.virtual_memory().total / (1024**3), 2),
        'used_gb': round(psutil.virtual_memory().used / (1024**3), 2)
    },
    'disk': {
        'percent': psutil.disk_usage('/').percent,
        'total_gb': round(psutil.disk_usage('/').total / (1024**3), 2)
    }
}
print(json.dumps(data))
"'''
        
        result = fleet_service.execute_ssh_command(host_id, ssh_command)
        
        if result.get('success'):
            metrics = json.loads(result.get('output', '{}'))
            return jsonify({
                'success': True,
                'host_id': host_id,
                'data': metrics
            })
        else:
            return jsonify({
                'success': False,
                'error': result.get('error', 'SSH command failed')
            }), 500
            
    except ImportError:
        return jsonify({
            'success': False,
            'error': 'Fleet service not available'
        }), 503
    except json.JSONDecodeError as e:
        return jsonify({
            'success': False,
            'error': f'Failed to parse remote metrics: {e}'
        }), 500
    except Exception as e:
        logger.error(f"Error getting remote metrics: {e}")
        return jsonify({
            'success': False,
            'error': str(e)
        }), 500


_agent_metrics_cache = {}

@monitoring_bp.route('/agent/report', methods=['POST'])
def receive_agent_metrics():
    """
    POST /api/monitoring/agent/report
    Receive metrics from remote monitoring agents
    """
    try:
        api_key = request.headers.get('X-API-Key', '')
        expected_key = os.environ.get('MONITORING_API_KEY', '')
        
        if expected_key and api_key != expected_key:
            return jsonify({'success': False, 'error': 'Invalid API key'}), 401
        
        data = request.get_json()
        if not data:
            return jsonify({'success': False, 'error': 'No data provided'}), 400
        
        hostname = data.get('hostname', 'unknown')
        data['received_at'] = datetime.utcnow().isoformat()
        data['agent_ip'] = request.remote_addr
        
        _agent_metrics_cache[hostname] = data
        
        logger.info(f"Received metrics from agent: {hostname}")
        
        check_agent_thresholds(hostname, data)
        
        return jsonify({'success': True, 'message': f'Metrics received from {hostname}'})
    except Exception as e:
        logger.error(f"Error receiving agent metrics: {e}")
        return jsonify({'success': False, 'error': str(e)}), 500


@monitoring_bp.route('/agents', methods=['GET'])
@require_auth
def list_agents():
    """
    GET /api/monitoring/agents
    List all reporting monitoring agents
    """
    agents = []
    for hostname, data in _agent_metrics_cache.items():
        agents.append({
            'hostname': hostname,
            'last_seen': data.get('received_at'),
            'agent_version': data.get('agent_version'),
            'cpu_percent': data.get('cpu', {}).get('percent'),
            'memory_percent': data.get('memory', {}).get('ram', {}).get('percent'),
            'uptime': data.get('uptime', {}).get('uptime_human')
        })
    
    return jsonify({
        'success': True,
        'agents': agents,
        'count': len(agents)
    })


@monitoring_bp.route('/agents/<hostname>', methods=['GET'])
@require_auth
def get_agent_metrics(hostname):
    """
    GET /api/monitoring/agents/<hostname>
    Get full metrics from a specific agent
    """
    if hostname not in _agent_metrics_cache:
        return jsonify({'success': False, 'error': f'Agent {hostname} not found'}), 404
    
    return jsonify({
        'success': True,
        'hostname': hostname,
        'data': _agent_metrics_cache[hostname]
    })


def check_agent_thresholds(hostname: str, data: dict):
    """Check agent metrics against alert thresholds and trigger notifications"""
    try:
        from services.alert_service import alert_service
        
        cpu_percent = data.get('cpu', {}).get('percent', 0)
        memory_percent = data.get('memory', {}).get('ram', {}).get('percent', 0)
        
        for disk in data.get('disk', {}).get('partitions', []):
            disk_percent = disk.get('percent', 0)
            if disk_percent > 90:
                alert_service.trigger_alert_for_host(
                    hostname=hostname,
                    alert_type='disk',
                    value=disk_percent,
                    details=f"Disk {disk.get('mountpoint')} at {disk_percent}%"
                )
        
        if cpu_percent > 90:
            alert_service.trigger_alert_for_host(
                hostname=hostname,
                alert_type='cpu',
                value=cpu_percent,
                details=f"CPU usage at {cpu_percent}%"
            )
        
        if memory_percent > 90:
            alert_service.trigger_alert_for_host(
                hostname=hostname,
                alert_type='memory',
                value=memory_percent,
                details=f"Memory usage at {memory_percent}%"
            )
    except Exception as e:
        logger.error(f"Error checking thresholds for {hostname}: {e}")


@monitoring_bp.route('/agent/script', methods=['GET'])
def serve_agent_script():
    """
    GET /api/monitoring/agent/script
    Serve the monitoring agent Python script for remote installation
    """
    try:
        import os
        routes_dir = os.path.dirname(os.path.abspath(__file__))
        dashboard_dir = os.path.dirname(routes_dir)
        services_dir = os.path.dirname(dashboard_dir)
        project_root = os.path.dirname(services_dir)
        script_path = os.path.join(project_root, 'deploy', 'scripts', 'monitoring-agent.py')
        
        if os.path.exists(script_path):
            with open(script_path, 'r') as f:
                content = f.read()
            return Response(content, mimetype='text/plain', headers={
                'Content-Disposition': 'attachment; filename="monitoring-agent.py"'
            })
        else:
            return jsonify({'success': False, 'error': 'Agent script not found'}), 404
    except Exception as e:
        logger.error(f"Error serving agent script: {e}")
        return jsonify({'success': False, 'error': str(e)}), 500


@monitoring_bp.route('/agent/install', methods=['GET'])
def serve_install_script():
    """
    GET /api/monitoring/agent/install
    Serve the monitoring agent installer script
    """
    try:
        import os
        routes_dir = os.path.dirname(os.path.abspath(__file__))
        dashboard_dir = os.path.dirname(routes_dir)
        services_dir = os.path.dirname(dashboard_dir)
        project_root = os.path.dirname(services_dir)
        script_path = os.path.join(project_root, 'deploy', 'scripts', 'install-monitoring-agent.sh')
        
        if os.path.exists(script_path):
            with open(script_path, 'r') as f:
                content = f.read()
            return Response(content, mimetype='text/plain', headers={
                'Content-Disposition': 'attachment; filename="install.sh"'
            })
        else:
            return jsonify({'success': False, 'error': 'Install script not found'}), 404
    except Exception as e:
        logger.error(f"Error serving install script: {e}")
        return jsonify({'success': False, 'error': str(e)}), 500


@monitoring_bp.route('/hosts', methods=['GET'])
@require_auth
def list_monitored_hosts():
    """
    GET /api/monitoring/hosts
    List all hosts available for monitoring
    """
    try:
        from services.fleet_service import fleet_service
        hosts = fleet_service.list_hosts()
        return jsonify({
            'success': True,
            'hosts': hosts,
            'local': {
                'hostname': get_system_info().get('hostname', 'localhost'),
                'available': PSUTIL_AVAILABLE
            }
        })
    except ImportError:
        return jsonify({
            'success': True,
            'hosts': [],
            'local': {
                'hostname': get_system_info().get('hostname', 'localhost'),
                'available': PSUTIL_AVAILABLE
            }
        })
    except Exception as e:
        logger.error(f"Error listing hosts: {e}")
        return jsonify({
            'success': False,
            'error': str(e)
        }), 500
