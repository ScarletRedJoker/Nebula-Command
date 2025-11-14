from flask import Blueprint, request, session
from services.websocket_service import websocket_service
from config import Config
import logging
import json

logger = logging.getLogger(__name__)

ws_bp = Blueprint('websocket', __name__, url_prefix='/ws')

def authenticate_websocket(ws) -> tuple:
    """
    Authenticate WebSocket connection using token or session
    
    Returns:
        (is_authenticated, user_id)
    """
    token = request.args.get('token')
    if token:
        user_id = websocket_service.validate_auth_token(token)
        if user_id:
            return True, user_id
        logger.warning(f"Invalid WebSocket token provided")
        return False, None
    
    if session.get('authenticated'):
        user_id = session.get('user_id', 'session_user')
        return True, user_id
    
    api_key = request.headers.get('X-API-Key')
    if api_key:
        if api_key == Config.DASHBOARD_API_KEY:
            return True, 'api_user'
        else:
            logger.warning(f"Invalid API key provided for WebSocket connection")
            return False, None
    
    logger.warning("WebSocket connection attempted without valid authentication")
    return False, None

@ws_bp.route('/workflows/<workflow_id>')
def workflow_updates(workflow_id):
    """WebSocket endpoint for workflow-specific updates (per-user rooms)"""
    ws = websocket_service.sock.accept()
    
    is_authenticated, user_id = authenticate_websocket(ws)
    if not is_authenticated:
        ws.send(json.dumps({
            'type': 'error',
            'message': 'Authentication required. Provide token or valid session.'
        }))
        ws.close()
        return ''
    
    logger.info(f"User {user_id} connected to workflow {workflow_id} updates")
    
    ws.send(json.dumps({
        'type': 'connected',
        'workflow_id': workflow_id,
        'user_id': user_id,
        'message': f'Subscribed to workflow {workflow_id} updates'
    }))
    
    websocket_service.add_connection('workflows', ws, user_id, workflow_id)
    
    try:
        while True:
            data = ws.receive()
            if data:
                try:
                    message = json.loads(data)
                    if message.get('type') == 'ping':
                        websocket_service.update_ping_time(ws)
                        ws.send(json.dumps({'type': 'pong', 'timestamp': message.get('timestamp')}))
                    elif message.get('type') == 'pong':
                        websocket_service.update_ping_time(ws)
                except json.JSONDecodeError:
                    logger.warning(f"Invalid JSON received: {data}")
    except Exception as e:
        logger.info(f"WebSocket connection closed for workflow {workflow_id}, user {user_id}: {e}")
    finally:
        websocket_service.remove_connection('workflows', ws, workflow_id)
    
    return ''

@ws_bp.route('/tasks')
def task_notifications():
    """WebSocket endpoint for general task notifications (per-user)"""
    ws = websocket_service.sock.accept()
    
    is_authenticated, user_id = authenticate_websocket(ws)
    if not is_authenticated:
        ws.send(json.dumps({
            'type': 'error',
            'message': 'Authentication required. Provide token or valid session.'
        }))
        ws.close()
        return ''
    
    logger.info(f"User {user_id} connected to task notifications")
    
    ws.send(json.dumps({
        'type': 'connected',
        'user_id': user_id,
        'message': 'Subscribed to task notifications'
    }))
    
    websocket_service.add_connection('tasks', ws, user_id)
    
    try:
        while True:
            data = ws.receive()
            if data:
                try:
                    message = json.loads(data)
                    if message.get('type') == 'ping':
                        websocket_service.update_ping_time(ws)
                        ws.send(json.dumps({'type': 'pong', 'timestamp': message.get('timestamp')}))
                    elif message.get('type') == 'pong':
                        websocket_service.update_ping_time(ws)
                except json.JSONDecodeError:
                    logger.warning(f"Invalid JSON received: {data}")
    except Exception as e:
        logger.info(f"WebSocket connection closed for tasks, user {user_id}: {e}")
    finally:
        websocket_service.remove_connection('tasks', ws)
    
    return ''

@ws_bp.route('/deployments/<deployment_id>')
def deployment_progress(deployment_id):
    """WebSocket endpoint for deployment-specific progress updates (per-user rooms)"""
    ws = websocket_service.sock.accept()
    
    is_authenticated, user_id = authenticate_websocket(ws)
    if not is_authenticated:
        ws.send(json.dumps({
            'type': 'error',
            'message': 'Authentication required. Provide token or valid session.'
        }))
        ws.close()
        return ''
    
    logger.info(f"User {user_id} connected to deployment {deployment_id} progress")
    
    ws.send(json.dumps({
        'type': 'connected',
        'deployment_id': deployment_id,
        'user_id': user_id,
        'message': f'Subscribed to deployment {deployment_id} progress'
    }))
    
    websocket_service.add_connection('deployments', ws, user_id, deployment_id)
    
    try:
        while True:
            data = ws.receive()
            if data:
                try:
                    message = json.loads(data)
                    if message.get('type') == 'ping':
                        websocket_service.update_ping_time(ws)
                        ws.send(json.dumps({'type': 'pong', 'timestamp': message.get('timestamp')}))
                    elif message.get('type') == 'pong':
                        websocket_service.update_ping_time(ws)
                except json.JSONDecodeError:
                    logger.warning(f"Invalid JSON received: {data}")
    except Exception as e:
        logger.info(f"WebSocket connection closed for deployment {deployment_id}, user {user_id}: {e}")
    finally:
        websocket_service.remove_connection('deployments', ws, deployment_id)
    
    return ''

@ws_bp.route('/system')
def system_events():
    """WebSocket endpoint for system-wide events (per-user)"""
    ws = websocket_service.sock.accept()
    
    is_authenticated, user_id = authenticate_websocket(ws)
    if not is_authenticated:
        ws.send(json.dumps({
            'type': 'error',
            'message': 'Authentication required. Provide token or valid session.'
        }))
        ws.close()
        return ''
    
    logger.info(f"User {user_id} connected to system events")
    
    ws.send(json.dumps({
        'type': 'connected',
        'user_id': user_id,
        'message': 'Subscribed to system events'
    }))
    
    websocket_service.add_connection('system', ws, user_id)
    
    try:
        while True:
            data = ws.receive()
            if data:
                try:
                    message = json.loads(data)
                    if message.get('type') == 'ping':
                        websocket_service.update_ping_time(ws)
                        ws.send(json.dumps({'type': 'pong', 'timestamp': message.get('timestamp')}))
                    elif message.get('type') == 'pong':
                        websocket_service.update_ping_time(ws)
                except json.JSONDecodeError:
                    logger.warning(f"Invalid JSON received: {data}")
    except Exception as e:
        logger.info(f"WebSocket connection closed for system events, user {user_id}: {e}")
    finally:
        websocket_service.remove_connection('system', ws)
    
    return ''

__all__ = ['ws_bp']
