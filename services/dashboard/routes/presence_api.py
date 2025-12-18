"""
Homelab Presence API
Provides condensed homelab status for Discord Rich Presence integration.
"""

from flask import Blueprint, jsonify, request
import os
import psutil
from datetime import datetime
from functools import wraps

presence_bp = Blueprint('presence', __name__, url_prefix='/api/homelab')

SERVICE_AUTH_TOKEN = os.environ.get('SERVICE_AUTH_TOKEN', 'dev-token')

def require_service_auth(f):
    """Require valid service auth token for inter-service communication."""
    @wraps(f)
    def decorated(*args, **kwargs):
        token = request.headers.get('X-Service-Auth')
        if not token or token != SERVICE_AUTH_TOKEN:
            return jsonify({'error': 'Unauthorized'}), 401
        return f(*args, **kwargs)
    return decorated


def get_system_stats():
    """Get current system statistics."""
    try:
        cpu_percent = psutil.cpu_percent(interval=0.1)
        memory = psutil.virtual_memory()
        disk = psutil.disk_usage('/')
        boot_time = datetime.fromtimestamp(psutil.boot_time())
        uptime = datetime.now() - boot_time
        
        uptime_str = ""
        days = uptime.days
        hours = uptime.seconds // 3600
        if days > 0:
            uptime_str = f"{days}d {hours}h"
        else:
            minutes = (uptime.seconds % 3600) // 60
            uptime_str = f"{hours}h {minutes}m"
        
        return {
            'cpu': round(cpu_percent, 1),
            'memory': round(memory.percent, 1),
            'disk': round(disk.percent, 1),
            'uptime': uptime_str
        }
    except Exception as e:
        return {
            'cpu': 0,
            'memory': 0,
            'disk': 0,
            'uptime': 'unknown',
            'error': str(e)
        }


def get_service_status():
    """Get status of key homelab services."""
    services = []
    
    try:
        import docker
        client = docker.from_env()
        containers = client.containers.list(all=True)
        
        key_services = ['plex', 'homeassistant', 'jellyfin', 'sonarr', 'radarr', 'minio']
        
        for container in containers:
            name = container.name.lower()
            for service in key_services:
                if service in name:
                    status = 'online' if container.status == 'running' else 'offline'
                    services.append({
                        'name': container.name,
                        'status': status
                    })
                    break
        
    except Exception as e:
        pass
    
    return services


def get_active_mode():
    """Determine the current homelab mode."""
    try:
        import docker
        client = docker.from_env()
        containers = client.containers.list()
        
        running_names = [c.name.lower() for c in containers]
        
        if any('sunshine' in name or 'gaming' in name for name in running_names):
            return 'Gaming Mode'
        elif any('plex' in name for name in running_names):
            return 'Media Server'
        elif any('dev' in name or 'code' in name for name in running_names):
            return 'Development'
        else:
            return 'Homelab Active'
            
    except:
        return 'Homelab Active'


@presence_bp.route('/presence', methods=['GET'])
@require_service_auth
def get_presence():
    """
    Get condensed homelab status for Discord Rich Presence.
    
    Returns:
        {
            "status": "healthy" | "degraded" | "offline",
            "mode": "Gaming Mode" | "Media Server" | "Development" | "Homelab Active",
            "stats": {
                "cpu": 42.5,
                "memory": 68.2,
                "disk": 45.0,
                "uptime": "5d 12h"
            },
            "services": {
                "online": 5,
                "offline": 1,
                "key_services": ["Plex", "Home Assistant", "Sonarr"]
            },
            "activities": [
                {"type": "watching", "text": "Plex: 2 active streams"},
                {"type": "playing", "text": "CPU 42%"}
            ]
        }
    """
    stats = get_system_stats()
    services = get_service_status()
    mode = get_active_mode()
    
    online_services = [s for s in services if s['status'] == 'online']
    offline_services = [s for s in services if s['status'] == 'offline']
    
    if len(offline_services) > len(online_services):
        status = 'degraded'
    elif len(online_services) == 0 and len(services) > 0:
        status = 'offline'
    else:
        status = 'healthy'
    
    activities = []
    
    if mode == 'Gaming Mode':
        activities.append({'type': 'playing', 'text': 'Gaming Mode Active'})
    elif len(online_services) > 0:
        activities.append({'type': 'watching', 'text': f"{len(online_services)} services online"})
    
    if stats['cpu'] > 0:
        activities.append({'type': 'playing', 'text': f"CPU {stats['cpu']}% | RAM {stats['memory']}%"})
    
    if stats['uptime'] != 'unknown':
        activities.append({'type': 'custom', 'text': f"Uptime: {stats['uptime']}"})
    
    return jsonify({
        'status': status,
        'mode': mode,
        'stats': stats,
        'services': {
            'online': len(online_services),
            'offline': len(offline_services),
            'key_services': [s['name'] for s in online_services[:5]]
        },
        'activities': activities,
        'timestamp': datetime.utcnow().isoformat()
    })


@presence_bp.route('/presence/public', methods=['GET'])
def get_public_presence():
    """
    Public version of presence data (no auth required, limited info).
    Used for public status pages.
    """
    stats = get_system_stats()
    mode = get_active_mode()
    
    return jsonify({
        'mode': mode,
        'status': 'online',
        'uptime': stats.get('uptime', 'unknown'),
        'timestamp': datetime.utcnow().isoformat()
    })
