from flask_sock import Sock
import json
import logging
import time
import secrets
from typing import Dict, Set, Optional, Tuple
from threading import Lock, Thread
from datetime import datetime, timedelta

logger = logging.getLogger(__name__)

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
        
    def init_app(self, app):
        """Initialize Flask-Sock with the Flask app"""
        self.sock = Sock(app)
        self.running = True
        self.start_heartbeat()
        logger.info("WebSocket service initialized with authentication and heartbeat")
    
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
        logger.info("WebSocket service shutdown")

websocket_service = WebSocketService()

__all__ = ['websocket_service', 'WebSocketService']
