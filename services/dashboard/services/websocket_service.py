from flask_sock import Sock
import json
import logging
import time
import secrets
from typing import Dict, Set, Optional, Tuple
from threading import Lock, Thread
from datetime import datetime, timedelta
from enum import Enum

logger = logging.getLogger(__name__)


class ConnectionState(Enum):
    """WebSocket connection state"""
    CONNECTING = "connecting"
    CONNECTED = "connected"
    RECONNECTING = "reconnecting"
    DISCONNECTED = "disconnected"
    ERROR = "error"


class WebSocketService:
    """WebSocket service for real-time workflow and system updates with authentication"""
    
    def __init__(self):
        self.sock = None
        self.connections: Dict[str, Dict] = {
            'workflows': {},
            'tasks': {},
            'deployments': {},
            'system': {}
        }
        self.lock = Lock()
        self.auth_tokens: Dict[str, Dict] = {}
        self.heartbeat_interval = 30
        self.heartbeat_thread = None
        self.running = False
        self.connection_states: Dict[str, Dict] = {}
        self.reconnect_attempts: Dict[str, int] = {}
        self.max_reconnect_attempts = 5
        self.reconnect_delay_base = 1
        self.reconnect_delay_max = 30
        
    def init_app(self, app):
        """Initialize Flask-Sock with the Flask app"""
        self.sock = Sock(app)
        self.running = True
        self.start_heartbeat()
        self._start_state_broadcaster()
        logger.info("WebSocket service initialized with authentication, heartbeat, and state broadcasting")
    
    def generate_auth_token(self, user_id: str, expires_in: int = 3600) -> str:
        """Generate authentication token for WebSocket connections"""
        token = secrets.token_urlsafe(32)
        with self.lock:
            self.auth_tokens[token] = {
                'user_id': user_id,
                'created_at': datetime.utcnow(),
                'expires_at': datetime.utcnow() + timedelta(seconds=expires_in)
            }
        logger.info(f"Generated auth token for user {user_id}")
        return token
    
    def validate_auth_token(self, token: str) -> Optional[str]:
        """Validate authentication token and return user_id if valid"""
        with self.lock:
            if token not in self.auth_tokens:
                return None
            
            token_data = self.auth_tokens[token]
            if datetime.utcnow() > token_data['expires_at']:
                del self.auth_tokens[token]
                logger.warning(f"Expired token removed: {token[:8]}...")
                return None
            
            return token_data['user_id']
    
    def add_connection(self, room_type: str, ws, user_id: str, room_id: str = None):
        """Add an authenticated WebSocket connection to a room"""
        with self.lock:
            conn_data = {
                'ws': ws,
                'user_id': user_id,
                'connected_at': datetime.utcnow(),
                'last_ping': datetime.utcnow()
            }
            
            if room_type in ['workflows', 'deployments']:
                if room_id not in self.connections[room_type]:
                    self.connections[room_type][room_id] = []
                self.connections[room_type][room_id].append(conn_data)
                logger.info(f"Added connection for user {user_id} to {room_type}/{room_id}")
            else:
                if room_type not in self.connections:
                    self.connections[room_type] = []
                if not isinstance(self.connections[room_type], list):
                    self.connections[room_type] = []
                self.connections[room_type].append(conn_data)
                logger.info(f"Added connection for user {user_id} to {room_type}")
    
    def remove_connection(self, room_type: str, ws, room_id: str = None):
        """Remove a WebSocket connection from a room"""
        with self.lock:
            try:
                if room_type in ['workflows', 'deployments']:
                    if room_id in self.connections[room_type]:
                        self.connections[room_type][room_id] = [
                            conn for conn in self.connections[room_type][room_id]
                            if conn['ws'] != ws
                        ]
                        if not self.connections[room_type][room_id]:
                            del self.connections[room_type][room_id]
                        logger.info(f"Removed connection from {room_type}/{room_id}")
                else:
                    if isinstance(self.connections[room_type], list):
                        self.connections[room_type] = [
                            conn for conn in self.connections[room_type]
                            if conn['ws'] != ws
                        ]
                    logger.info(f"Removed connection from {room_type}")
            except Exception as e:
                logger.error(f"Error removing connection: {e}")
    
    def broadcast_to_workflow(self, workflow_id: str, message: dict):
        """Broadcast message to all connections subscribed to a workflow"""
        self._broadcast('workflows', message, room_id=workflow_id)
    
    def broadcast_to_deployment(self, deployment_id: str, message: dict):
        """Broadcast message to all connections subscribed to a deployment"""
        self._broadcast('deployments', message, room_id=deployment_id)
    
    def broadcast_to_tasks(self, message: dict):
        """Broadcast message to all connections subscribed to tasks"""
        self._broadcast('tasks', message)
    
    def broadcast_to_system(self, message: dict):
        """Broadcast message to all connections subscribed to system events"""
        self._broadcast('system', message)
    
    def _broadcast(self, room_type: str, message: dict, room_id: str = None, user_filter: Optional[str] = None):
        """Internal method to broadcast messages to a room with optional user filtering"""
        with self.lock:
            try:
                message_json = json.dumps(message)
                
                if room_type in ['workflows', 'deployments']:
                    if room_id in self.connections[room_type]:
                        connections = list(self.connections[room_type][room_id])
                        dead_connections = []
                        successful = 0
                        
                        for conn_data in connections:
                            if user_filter and conn_data['user_id'] != user_filter:
                                continue
                            
                            try:
                                conn_data['ws'].send(message_json)
                                successful += 1
                            except Exception as e:
                                logger.warning(f"Failed to send to connection: {e}")
                                dead_connections.append(conn_data['ws'])
                        
                        self.connections[room_type][room_id] = [
                            conn for conn in connections
                            if conn['ws'] not in dead_connections
                        ]
                        
                        if not self.connections[room_type][room_id]:
                            del self.connections[room_type][room_id]
                        
                        logger.debug(f"Broadcast to {room_type}/{room_id}: {successful}/{len(connections)} connections")
                else:
                    if not isinstance(self.connections[room_type], list):
                        return
                    
                    connections = list(self.connections[room_type])
                    dead_connections = []
                    successful = 0
                    
                    for conn_data in connections:
                        if user_filter and conn_data['user_id'] != user_filter:
                            continue
                        
                        try:
                            conn_data['ws'].send(message_json)
                            successful += 1
                        except Exception as e:
                            logger.warning(f"Failed to send to connection: {e}")
                            dead_connections.append(conn_data['ws'])
                    
                    self.connections[room_type] = [
                        conn for conn in connections
                        if conn['ws'] not in dead_connections
                    ]
                    
                    logger.debug(f"Broadcast to {room_type}: {successful}/{len(connections)} connections")
                    
            except Exception as e:
                logger.error(f"Error broadcasting message: {e}")
    
    def start_heartbeat(self):
        """Start heartbeat thread to ping connections and clean up stale ones"""
        if self.heartbeat_thread is None or not self.heartbeat_thread.is_alive():
            self.heartbeat_thread = Thread(target=self._heartbeat_loop, daemon=True)
            self.heartbeat_thread.start()
            logger.info("Heartbeat thread started")
    
    def _heartbeat_loop(self):
        """Heartbeat loop to send pings and cleanup stale connections"""
        while self.running:
            try:
                time.sleep(self.heartbeat_interval)
                self._send_heartbeat()
                self._cleanup_stale_connections()
            except Exception as e:
                logger.error(f"Error in heartbeat loop: {e}")
    
    def _send_heartbeat(self):
        """Send ping to all connections"""
        ping_message = json.dumps({'type': 'ping', 'timestamp': datetime.utcnow().isoformat()})
        
        with self.lock:
            for room_type in self.connections:
                if isinstance(self.connections[room_type], dict):
                    for room_id, connections in list(self.connections[room_type].items()):
                        for conn_data in connections:
                            try:
                                conn_data['ws'].send(ping_message)
                            except Exception as e:
                                logger.debug(f"Failed to send ping: {e}")
                elif isinstance(self.connections[room_type], list):
                    for conn_data in self.connections[room_type]:
                        try:
                            conn_data['ws'].send(ping_message)
                        except Exception as e:
                            logger.debug(f"Failed to send ping: {e}")
    
    def _cleanup_stale_connections(self):
        """Remove connections that haven't responded to pings"""
        stale_threshold = datetime.utcnow() - timedelta(seconds=self.heartbeat_interval * 3)
        
        with self.lock:
            for room_type in self.connections:
                if isinstance(self.connections[room_type], dict):
                    for room_id in list(self.connections[room_type].keys()):
                        self.connections[room_type][room_id] = [
                            conn for conn in self.connections[room_type][room_id]
                            if conn['last_ping'] > stale_threshold
                        ]
                        if not self.connections[room_type][room_id]:
                            del self.connections[room_type][room_id]
                elif isinstance(self.connections[room_type], list):
                    self.connections[room_type] = [
                        conn for conn in self.connections[room_type]
                        if conn['last_ping'] > stale_threshold
                    ]
    
    def update_ping_time(self, ws):
        """Update last ping time for a connection"""
        with self.lock:
            for room_type in self.connections:
                if isinstance(self.connections[room_type], dict):
                    for connections in self.connections[room_type].values():
                        for conn_data in connections:
                            if conn_data['ws'] == ws:
                                conn_data['last_ping'] = datetime.utcnow()
                                return
                elif isinstance(self.connections[room_type], list):
                    for conn_data in self.connections[room_type]:
                        if conn_data['ws'] == ws:
                            conn_data['last_ping'] = datetime.utcnow()
                            return
    
    def get_connection_count(self) -> dict:
        """Get the number of active connections per room type"""
        with self.lock:
            workflows_count = sum(len(conns) for conns in self.connections.get('workflows', {}).values()) if isinstance(self.connections.get('workflows'), dict) else 0
            tasks_count = len(self.connections.get('tasks', [])) if isinstance(self.connections.get('tasks'), list) else 0
            deployments_count = sum(len(conns) for conns in self.connections.get('deployments', {}).values()) if isinstance(self.connections.get('deployments'), dict) else 0
            system_count = len(self.connections.get('system', [])) if isinstance(self.connections.get('system'), list) else 0
            
            return {
                'workflows': workflows_count,
                'tasks': tasks_count,
                'deployments': deployments_count,
                'system': system_count
            }
    
    def shutdown(self):
        """Shutdown the WebSocket service"""
        self.running = False
        self._broadcast_connection_state('all', ConnectionState.DISCONNECTED, 'Service shutting down')
        logger.info("WebSocket service shutdown")
    
    def _start_state_broadcaster(self):
        """Start background thread for periodic state broadcasts"""
        if not hasattr(self, 'state_broadcast_thread') or self.state_broadcast_thread is None or not self.state_broadcast_thread.is_alive():
            self.state_broadcast_thread = Thread(target=self._state_broadcast_loop, daemon=True)
            self.state_broadcast_thread.start()
            logger.info("State broadcast thread started")
    
    def _state_broadcast_loop(self):
        """Periodically broadcast connection state to all clients"""
        while self.running:
            try:
                time.sleep(60)
                self._broadcast_system_state()
            except Exception as e:
                logger.error(f"Error in state broadcast loop: {e}")
    
    def _broadcast_system_state(self):
        """Broadcast current system state to all connected clients"""
        connection_counts = self.get_connection_count()
        
        state_message = {
            'type': 'system_state',
            'connections': connection_counts,
            'server_time': datetime.utcnow().isoformat(),
            'healthy': True
        }
        
        self.broadcast_to_system(state_message)
    
    def _broadcast_connection_state(self, room_type: str, state: ConnectionState, message: str = None):
        """Broadcast connection state change to relevant clients"""
        state_message = {
            'type': 'connection_state',
            'state': state.value,
            'room_type': room_type,
            'message': message,
            'timestamp': datetime.utcnow().isoformat()
        }
        
        if room_type == 'all':
            self.broadcast_to_system(state_message)
        else:
            self._broadcast(room_type, state_message)
    
    def update_connection_state(self, ws, user_id: str, state: ConnectionState):
        """Update and track connection state for a specific client"""
        with self.lock:
            conn_id = f"{user_id}_{id(ws)}"
            self.connection_states[conn_id] = {
                'state': state,
                'user_id': user_id,
                'updated_at': datetime.utcnow()
            }
            
            if state == ConnectionState.CONNECTED:
                self.reconnect_attempts[conn_id] = 0
            elif state == ConnectionState.RECONNECTING:
                self.reconnect_attempts[conn_id] = self.reconnect_attempts.get(conn_id, 0) + 1
    
    def get_reconnect_delay(self, ws, user_id: str) -> float:
        """
        Calculate reconnection delay using exponential backoff
        
        Returns:
            float: Delay in seconds before next reconnection attempt
        """
        conn_id = f"{user_id}_{id(ws)}"
        attempts = self.reconnect_attempts.get(conn_id, 0)
        
        if attempts >= self.max_reconnect_attempts:
            return -1
        
        delay = min(
            self.reconnect_delay_base * (2 ** attempts),
            self.reconnect_delay_max
        )
        
        return delay
    
    def should_reconnect(self, ws, user_id: str) -> bool:
        """Check if client should attempt reconnection"""
        conn_id = f"{user_id}_{id(ws)}"
        attempts = self.reconnect_attempts.get(conn_id, 0)
        return attempts < self.max_reconnect_attempts
    
    def handle_reconnection(self, ws, user_id: str, room_type: str, room_id: str = None):
        """
        Handle client reconnection with proper state management
        
        Args:
            ws: WebSocket connection
            user_id: User ID
            room_type: Type of room to reconnect to
            room_id: Specific room ID (for workflows/deployments)
        """
        conn_id = f"{user_id}_{id(ws)}"
        
        self.update_connection_state(ws, user_id, ConnectionState.RECONNECTING)
        
        delay = self.get_reconnect_delay(ws, user_id)
        
        if delay < 0:
            logger.warning(f"Max reconnection attempts reached for {conn_id}")
            self.update_connection_state(ws, user_id, ConnectionState.ERROR)
            try:
                ws.send(json.dumps({
                    'type': 'reconnect_failed',
                    'message': 'Maximum reconnection attempts reached',
                    'timestamp': datetime.utcnow().isoformat()
                }))
            except Exception:
                pass
            return False
        
        logger.info(f"Reconnection attempt {self.reconnect_attempts.get(conn_id, 0) + 1} "
                    f"for {conn_id}, delay: {delay}s")
        
        time.sleep(delay)
        
        try:
            self.add_connection(room_type, ws, user_id, room_id)
            self.update_connection_state(ws, user_id, ConnectionState.CONNECTED)
            
            ws.send(json.dumps({
                'type': 'reconnected',
                'room_type': room_type,
                'room_id': room_id,
                'user_id': user_id,
                'timestamp': datetime.utcnow().isoformat()
            }))
            
            return True
            
        except Exception as e:
            logger.error(f"Reconnection failed for {conn_id}: {e}")
            return self.handle_reconnection(ws, user_id, room_type, room_id)
    
    def get_all_connection_states(self) -> Dict:
        """Get state information for all connections"""
        with self.lock:
            return {
                'total_connections': self.get_connection_count(),
                'connection_states': {
                    conn_id: {
                        'state': state['state'].value,
                        'user_id': state['user_id'],
                        'updated_at': state['updated_at'].isoformat()
                    }
                    for conn_id, state in self.connection_states.items()
                },
                'reconnect_attempts': dict(self.reconnect_attempts)
            }
    
    def send_to_user(self, user_id: str, message: dict):
        """Send a message to all connections for a specific user"""
        with self.lock:
            message_json = json.dumps(message)
            sent_count = 0
            
            for room_type in self.connections:
                if isinstance(self.connections[room_type], dict):
                    for room_id, connections in self.connections[room_type].items():
                        for conn_data in connections:
                            if conn_data['user_id'] == user_id:
                                try:
                                    conn_data['ws'].send(message_json)
                                    sent_count += 1
                                except Exception as e:
                                    logger.warning(f"Failed to send to user {user_id}: {e}")
                elif isinstance(self.connections[room_type], list):
                    for conn_data in self.connections[room_type]:
                        if conn_data['user_id'] == user_id:
                            try:
                                conn_data['ws'].send(message_json)
                                sent_count += 1
                            except Exception as e:
                                logger.warning(f"Failed to send to user {user_id}: {e}")
            
            return sent_count


websocket_service = WebSocketService()

__all__ = ['websocket_service', 'WebSocketService', 'ConnectionState']
