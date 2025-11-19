"""Game Streaming API Routes"""
import logging
from flask import Blueprint, request, jsonify, session, render_template
from functools import wraps

from services.game_streaming_service import game_streaming_service
from workers.gaming_worker import (
    discover_sunshine_hosts,
    check_sunshine_health,
    monitor_active_sessions
)

logger = logging.getLogger(__name__)

game_streaming_bp = Blueprint('game_streaming', __name__)


def login_required(f):
    """Decorator to require login for routes"""
    @wraps(f)
    def decorated_function(*args, **kwargs):
        if 'logged_in' not in session:
            return jsonify({'error': 'Authentication required'}), 401
        return f(*args, **kwargs)
    return decorated_function


@game_streaming_bp.route('/game-streaming')
@login_required
def game_streaming_page():
    """Render game streaming page"""
    from config import Config
    return render_template(
        'game_streaming.html',
        windows_kvm_ip=Config.WINDOWS_KVM_IP or Config.SUNSHINE_HOST or 'Not configured'
    )


@game_streaming_bp.route('/api/gaming/hosts', methods=['GET'])
@login_required
def get_hosts():
    """
    Get all configured Sunshine hosts
    
    Returns:
        JSON array of hosts
    """
    try:
        hosts = game_streaming_service.get_hosts()
        return jsonify({
            'success': True,
            'hosts': hosts,
            'count': len(hosts)
        })
    except Exception as e:
        logger.error(f"Failed to get hosts: {e}")
        return jsonify({
            'success': False,
            'error': str(e)
        }), 500


@game_streaming_bp.route('/api/gaming/hosts/discover', methods=['POST'])
@login_required
def discover_hosts():
    """
    Trigger network discovery for Sunshine hosts
    
    JSON body (optional):
        network_range: Network range to scan (e.g., "192.168.1.0/24")
        async: Run async in background (default: true)
    
    Returns:
        JSON with discovered hosts or task ID
    """
    try:
        data = request.get_json() or {}
        network_range = data.get('network_range')
        run_async = data.get('async', True)
        
        if run_async:
            # Run discovery in background
            task = discover_sunshine_hosts.delay(network_range)
            
            return jsonify({
                'success': True,
                'message': 'Discovery started in background',
                'task_id': task.id,
                'async': True
            })
        else:
            # Run discovery synchronously
            discovered = game_streaming_service.auto_discover_hosts(network_range)
            
            # Save discovered hosts to database
            saved_hosts = []
            for host_info in discovered:
                try:
                    host = game_streaming_service.add_host_manual(
                        host_info['host_ip'],
                        host_info.get('host_name')
                    )
                    saved_hosts.append(host)
                except Exception as e:
                    logger.error(f"Failed to save discovered host {host_info['host_ip']}: {e}")
            
            return jsonify({
                'success': True,
                'discovered': discovered,
                'saved': saved_hosts,
                'count': len(saved_hosts),
                'async': False
            })
            
    except Exception as e:
        logger.error(f"Host discovery failed: {e}")
        return jsonify({
            'success': False,
            'error': str(e)
        }), 500


@game_streaming_bp.route('/api/gaming/hosts', methods=['POST'])
@login_required
def add_host():
    """
    Manually add a Sunshine host
    
    JSON body:
        host_ip: Host IP address (required)
        host_name: Host name (optional)
    
    Returns:
        JSON with added host information
    """
    try:
        data = request.get_json()
        
        if not data or 'host_ip' not in data:
            return jsonify({
                'success': False,
                'error': 'host_ip is required'
            }), 400
        
        host_ip = data['host_ip']
        host_name = data.get('host_name')
        
        host = game_streaming_service.add_host_manual(host_ip, host_name)
        
        return jsonify({
            'success': True,
            'message': f'Host {host_ip} added successfully',
            'host': host
        })
        
    except ValueError as e:
        return jsonify({
            'success': False,
            'error': str(e)
        }), 400
    except Exception as e:
        logger.error(f"Failed to add host: {e}")
        return jsonify({
            'success': False,
            'error': str(e)
        }), 500


@game_streaming_bp.route('/api/gaming/hosts/<host_id>', methods=['PUT'])
@login_required
def update_host(host_id):
    """
    Update host configuration
    
    JSON body:
        host_name: New host name (optional)
        host_ip: New IP address (optional)
    
    Returns:
        JSON with updated host information
    """
    try:
        data = request.get_json()
        
        if not data:
            return jsonify({
                'success': False,
                'error': 'No update data provided'
            }), 400
        
        host = game_streaming_service.update_host(host_id, data)
        
        return jsonify({
            'success': True,
            'message': 'Host updated successfully',
            'host': host
        })
        
    except ValueError as e:
        return jsonify({
            'success': False,
            'error': str(e)
        }), 404
    except Exception as e:
        logger.error(f"Failed to update host {host_id}: {e}")
        return jsonify({
            'success': False,
            'error': str(e)
        }), 500


@game_streaming_bp.route('/api/gaming/hosts/<host_id>', methods=['DELETE'])
@login_required
def delete_host(host_id):
    """
    Delete a Sunshine host
    
    Returns:
        JSON confirmation
    """
    try:
        game_streaming_service.delete_host(host_id)
        
        return jsonify({
            'success': True,
            'message': 'Host deleted successfully'
        })
        
    except ValueError as e:
        return jsonify({
            'success': False,
            'error': str(e)
        }), 404
    except Exception as e:
        logger.error(f"Failed to delete host {host_id}: {e}")
        return jsonify({
            'success': False,
            'error': str(e)
        }), 500


@game_streaming_bp.route('/api/gaming/pair', methods=['POST'])
@login_required
def pair_host():
    """
    Pair with a Sunshine host using PIN
    
    JSON body:
        host_id: Host UUID (required)
        pin: 4-digit PIN from Moonlight (required)
    
    Returns:
        JSON with pairing result
    """
    try:
        data = request.get_json()
        
        if not data or 'host_id' not in data or 'pin' not in data:
            return jsonify({
                'success': False,
                'error': 'host_id and pin are required'
            }), 400
        
        host_id = data['host_id']
        pin = data['pin']
        
        result = game_streaming_service.initiate_pairing(host_id, pin)
        
        if result['success']:
            return jsonify(result)
        else:
            return jsonify(result), 400
            
    except ValueError as e:
        return jsonify({
            'success': False,
            'error': str(e)
        }), 404
    except Exception as e:
        logger.error(f"Pairing failed: {e}")
        return jsonify({
            'success': False,
            'error': str(e)
        }), 500


@game_streaming_bp.route('/api/gaming/sessions', methods=['GET'])
@login_required
def get_sessions():
    """
    Get game streaming sessions
    
    Query params:
        status: Filter by status (optional)
        limit: Max sessions to return (default: 50)
    
    Returns:
        JSON array of sessions
    """
    try:
        status = request.args.get('status')
        limit = int(request.args.get('limit', 50))
        
        sessions = game_streaming_service.get_sessions(status, limit)
        
        return jsonify({
            'success': True,
            'sessions': sessions,
            'count': len(sessions)
        })
        
    except Exception as e:
        logger.error(f"Failed to get sessions: {e}")
        return jsonify({
            'success': False,
            'error': str(e)
        }), 500


@game_streaming_bp.route('/api/gaming/sessions', methods=['POST'])
@login_required
def create_session():
    """
    Create a new game streaming session
    
    JSON body:
        host_ip: Host IP (required)
        host_name: Host name (optional)
        session_type: Type of streaming (default: moonlight)
        client_device: Client device name (optional)
        game_name: Game being played (optional)
        resolution: Stream resolution (optional)
        fps: Stream FPS (optional)
        bitrate_mbps: Stream bitrate (optional)
    
    Returns:
        JSON with created session
    """
    try:
        data = request.get_json()
        
        if not data or 'host_ip' not in data:
            return jsonify({
                'success': False,
                'error': 'host_ip is required'
            }), 400
        
        # Add user info
        data['user_id'] = session.get('username', 'unknown')
        
        session_obj = game_streaming_service.create_session(data)
        
        return jsonify({
            'success': True,
            'message': 'Session created',
            'session': session_obj
        })
        
    except Exception as e:
        logger.error(f"Failed to create session: {e}")
        return jsonify({
            'success': False,
            'error': str(e)
        }), 500


@game_streaming_bp.route('/api/gaming/sessions/<session_id>', methods=['PUT'])
@login_required
def update_session(session_id):
    """
    Update a game streaming session
    
    JSON body:
        status: Session status (optional)
        latency_ms: Latency in ms (optional)
        fps: Current FPS (optional)
        bitrate_mbps: Current bitrate (optional)
        resolution: Resolution (optional)
        game_name: Game name (optional)
    
    Returns:
        JSON with updated session
    """
    try:
        data = request.get_json()
        
        if not data:
            return jsonify({
                'success': False,
                'error': 'No update data provided'
            }), 400
        
        session_obj = game_streaming_service.update_session(session_id, data)
        
        return jsonify({
            'success': True,
            'message': 'Session updated',
            'session': session_obj
        })
        
    except ValueError as e:
        return jsonify({
            'success': False,
            'error': str(e)
        }), 404
    except Exception as e:
        logger.error(f"Failed to update session {session_id}: {e}")
        return jsonify({
            'success': False,
            'error': str(e)
        }), 500


@game_streaming_bp.route('/api/gaming/diagnostics', methods=['POST'])
@login_required
def run_diagnostics():
    """
    Run diagnostics on a Sunshine host
    
    JSON body:
        host_id: Host UUID (required)
    
    Returns:
        JSON with diagnostic results
    """
    try:
        data = request.get_json()
        
        if not data or 'host_id' not in data:
            return jsonify({
                'success': False,
                'error': 'host_id is required'
            }), 400
        
        host_id = data['host_id']
        
        diagnostics = game_streaming_service.run_diagnostics(host_id)
        
        return jsonify({
            'success': True,
            'diagnostics': diagnostics
        })
        
    except ValueError as e:
        return jsonify({
            'success': False,
            'error': str(e)
        }), 404
    except Exception as e:
        logger.error(f"Diagnostics failed: {e}")
        return jsonify({
            'success': False,
            'error': str(e)
        }), 500


@game_streaming_bp.route('/api/gaming/apps', methods=['GET'])
@login_required
def get_applications():
    """
    Get available applications/games from a Sunshine host
    
    Query params:
        host_id: Host UUID (required)
    
    Returns:
        JSON array of applications
    """
    try:
        host_id = request.args.get('host_id')
        
        if not host_id:
            return jsonify({
                'success': False,
                'error': 'host_id parameter is required'
            }), 400
        
        apps = game_streaming_service.get_applications(host_id)
        
        return jsonify({
            'success': True,
            'applications': apps,
            'count': len(apps)
        })
        
    except ValueError as e:
        return jsonify({
            'success': False,
            'error': str(e)
        }), 404
    except Exception as e:
        logger.error(f"Failed to get applications: {e}")
        return jsonify({
            'success': False,
            'error': str(e)
        }), 500


@game_streaming_bp.route('/api/gaming/health/<host_id>', methods=['GET'])
@login_required
def check_host_health(host_id):
    """
    Check health status of a Sunshine host
    
    Returns:
        JSON with health status
    """
    try:
        health = game_streaming_service.check_health(host_id)
        
        return jsonify({
            'success': True,
            'health': health
        })
        
    except ValueError as e:
        return jsonify({
            'success': False,
            'error': str(e)
        }), 404
    except Exception as e:
        logger.error(f"Health check failed: {e}")
        return jsonify({
            'success': False,
            'error': str(e)
        }), 500
