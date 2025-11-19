"""Game Streaming Service - Sunshine/Moonlight Integration"""
import os
import re
import socket
import subprocess
import logging
import requests
import uuid
from typing import Dict, List, Optional, Tuple, Any
from datetime import datetime, timedelta
from config import Config

logger = logging.getLogger(__name__)


class GameStreamingService:
    """Service for managing Sunshine game streaming hosts and sessions"""
    
    # Sunshine API endpoints
    SUNSHINE_API_VERSION = "v1"
    SUNSHINE_DEFAULT_PORTS = {
        'https': 47984,
        'http': 47990,
        'webui': 47990,
        'video': 47998,
        'control': 47999,
        'audio': 48000,
        'mic': 48010
    }
    
    def __init__(self, db_service=None):
        """Initialize game streaming service"""
        self.db_service = db_service
        self.sunshine_host = Config.SUNSHINE_HOST
        self.sunshine_port = Config.SUNSHINE_PORT
        self.sunshine_api_key = Config.SUNSHINE_API_KEY
        self.auto_discover = Config.SUNSHINE_AUTO_DISCOVER
        
        logger.info("╔══════════════════════════════════════════════════════════════╗")
        logger.info("║ Game Streaming Service - INITIALIZING                        ║")
        logger.info("╠══════════════════════════════════════════════════════════════╣")
        logger.info(f"║ Sunshine Host: {self.sunshine_host or 'Not configured':<44} ║")
        logger.info(f"║ Sunshine Port: {self.sunshine_port:<44} ║")
        logger.info(f"║ Auto-Discovery: {str(self.auto_discover):<43} ║")
        logger.info("╚══════════════════════════════════════════════════════════════╝")
    
    def _get_sunshine_url(self, host_ip: str, port: Optional[int] = None, use_https: bool = False) -> str:
        """
        Build Sunshine API URL
        
        Args:
            host_ip: Host IP address
            port: Port number (defaults to configured port)
            use_https: Use HTTPS instead of HTTP
            
        Returns:
            Full URL to Sunshine API
        """
        protocol = 'https' if use_https else 'http'
        port = port or self.sunshine_port
        return f"{protocol}://{host_ip}:{port}"
    
    def auto_discover_hosts(self, network_range: Optional[str] = None) -> List[Dict]:
        """
        Auto-discover Sunshine hosts on the network using ARP/nmap
        
        Args:
            network_range: Network range to scan (e.g., "192.168.1.0/24")
            
        Returns:
            List of discovered hosts with their info
        """
        discovered_hosts = []
        
        try:
            # If no network range specified, try to determine from local IP
            if not network_range:
                network_range = self._get_local_network_range()
            
            logger.info(f"Starting network scan on {network_range}")
            
            # Method 1: Try nmap first (most reliable)
            hosts = self._scan_with_nmap(network_range)
            
            # Method 2: Fallback to ARP scan if nmap not available
            if not hosts:
                logger.info("nmap not available, falling back to ARP scan")
                hosts = self._scan_with_arp()
            
            # Test each host for Sunshine service
            for host_ip in hosts:
                try:
                    if self._test_sunshine_connection(host_ip):
                        host_info = self._get_sunshine_info(host_ip)
                        if host_info:
                            discovered_hosts.append(host_info)
                            logger.info(f"Discovered Sunshine host: {host_ip} - {host_info.get('host_name', 'Unknown')}")
                except Exception as e:
                    logger.debug(f"Host {host_ip} is not a Sunshine server: {e}")
                    continue
            
            logger.info(f"Discovery complete. Found {len(discovered_hosts)} Sunshine hosts")
            
        except Exception as e:
            logger.error(f"Host discovery failed: {e}")
        
        return discovered_hosts
    
    def _get_local_network_range(self) -> str:
        """
        Get local network range from current IP
        
        Returns:
            Network range in CIDR notation (e.g., "192.168.1.0/24")
        """
        try:
            # Get local IP
            s = socket.socket(socket.AF_INET, socket.SOCK_DGRAM)
            s.connect(("8.8.8.8", 80))
            local_ip = s.getsockname()[0]
            s.close()
            
            # Convert to /24 network
            ip_parts = local_ip.split('.')
            network_range = f"{ip_parts[0]}.{ip_parts[1]}.{ip_parts[2]}.0/24"
            
            logger.info(f"Detected local network range: {network_range}")
            return network_range
            
        except Exception as e:
            logger.error(f"Failed to detect local network: {e}")
            return "192.168.1.0/24"  # Default fallback
    
    def _scan_with_nmap(self, network_range: str) -> List[str]:
        """
        Scan network using nmap for Sunshine ports
        
        Args:
            network_range: Network range in CIDR notation
            
        Returns:
            List of IP addresses with Sunshine ports open
        """
        try:
            # Scan for Sunshine's HTTP port (47990)
            cmd = [
                'nmap',
                '-p', str(self.SUNSHINE_DEFAULT_PORTS['http']),
                '--open',
                '-T4',
                '-oG', '-',
                network_range
            ]
            
            result = subprocess.run(
                cmd,
                capture_output=True,
                text=True,
                timeout=60
            )
            
            # Parse nmap output
            hosts = []
            for line in result.stdout.split('\n'):
                if 'Host:' in line and 'Ports:' in line:
                    match = re.search(r'Host: (\d+\.\d+\.\d+\.\d+)', line)
                    if match:
                        hosts.append(match.group(1))
            
            logger.info(f"nmap found {len(hosts)} hosts with port {self.SUNSHINE_DEFAULT_PORTS['http']} open")
            return hosts
            
        except FileNotFoundError:
            logger.warning("nmap not installed, skipping nmap scan")
            return []
        except subprocess.TimeoutExpired:
            logger.error("nmap scan timed out")
            return []
        except Exception as e:
            logger.error(f"nmap scan failed: {e}")
            return []
    
    def _scan_with_arp(self) -> List[str]:
        """
        Scan network using ARP table
        
        Returns:
            List of IP addresses from ARP table
        """
        try:
            # Get ARP table
            result = subprocess.run(
                ['arp', '-a'],
                capture_output=True,
                text=True,
                timeout=10
            )
            
            # Parse ARP output
            hosts = []
            for line in result.stdout.split('\n'):
                match = re.search(r'(\d+\.\d+\.\d+\.\d+)', line)
                if match:
                    hosts.append(match.group(1))
            
            logger.info(f"ARP scan found {len(hosts)} hosts")
            return hosts
            
        except Exception as e:
            logger.error(f"ARP scan failed: {e}")
            return []
    
    def _test_sunshine_connection(self, host_ip: str, timeout: int = 2) -> bool:
        """
        Test if host is running Sunshine
        
        Args:
            host_ip: Host IP address
            timeout: Connection timeout in seconds
            
        Returns:
            True if Sunshine is accessible, False otherwise
        """
        try:
            url = self._get_sunshine_url(host_ip)
            response = requests.get(
                f"{url}/api/ping",
                timeout=timeout,
                verify=False
            )
            return response.status_code == 200
        except:
            # Also try the web UI endpoint
            try:
                url = self._get_sunshine_url(host_ip)
                response = requests.get(url, timeout=timeout, verify=False)
                # Check if response contains "Sunshine" in HTML
                return response.status_code == 200 and 'sunshine' in response.text.lower()
            except:
                return False
    
    def _get_sunshine_info(self, host_ip: str) -> Optional[Dict]:
        """
        Get Sunshine server information
        
        Args:
            host_ip: Host IP address
            
        Returns:
            Dictionary with host information or None
        """
        try:
            url = self._get_sunshine_url(host_ip)
            
            # Try to get system info from API
            try:
                response = requests.get(
                    f"{url}/api/config",
                    timeout=5,
                    verify=False
                )
                
                if response.status_code == 200:
                    config_data = response.json()
                    
                    return {
                        'host_ip': host_ip,
                        'host_name': config_data.get('hostname', self._get_hostname(host_ip)),
                        'api_url': url,
                        'gpu_model': config_data.get('gpu', {}).get('name'),
                        'version': config_data.get('version'),
                        'last_online': datetime.utcnow().isoformat()
                    }
            except:
                pass
            
            # Fallback: basic info
            return {
                'host_ip': host_ip,
                'host_name': self._get_hostname(host_ip),
                'api_url': url,
                'last_online': datetime.utcnow().isoformat()
            }
            
        except Exception as e:
            logger.error(f"Failed to get Sunshine info from {host_ip}: {e}")
            return None
    
    def _get_hostname(self, host_ip: str) -> str:
        """
        Get hostname from IP address
        
        Args:
            host_ip: IP address
            
        Returns:
            Hostname or IP if lookup fails
        """
        try:
            return socket.gethostbyaddr(host_ip)[0]
        except:
            return host_ip
    
    def add_host_manual(self, host_ip: str, host_name: Optional[str] = None) -> Dict:
        """
        Manually add a Sunshine host
        
        Args:
            host_ip: Host IP address
            host_name: Optional hostname
            
        Returns:
            Host information dictionary
        """
        from models.gaming import SunshineHost
        
        if not self.db_service or not self.db_service.is_available:
            raise RuntimeError("Database service not available")
        
        # Test connection first
        if not self._test_sunshine_connection(host_ip):
            raise ValueError(f"Cannot connect to Sunshine at {host_ip}")
        
        # Get host info
        host_info = self._get_sunshine_info(host_ip)
        if not host_info:
            raise ValueError(f"Failed to get info from Sunshine host {host_ip}")
        
        # Override hostname if provided
        if host_name:
            host_info['host_name'] = host_name
        
        # Save to database
        with self.db_service.get_session() as session:
            # Check if already exists
            existing = session.query(SunshineHost).filter_by(host_ip=host_ip).first()
            
            if existing:
                # Update existing
                existing.host_name = host_info.get('host_name')
                existing.api_url = host_info.get('api_url')
                existing.last_online = datetime.utcnow()
                existing.gpu_model = host_info.get('gpu_model')
                session.commit()
                host = existing
            else:
                # Create new
                host = SunshineHost(
                    id=uuid.uuid4(),
                    host_ip=host_ip,
                    host_name=host_info.get('host_name'),
                    api_url=host_info.get('api_url'),
                    gpu_model=host_info.get('gpu_model'),
                    last_online=datetime.utcnow()
                )
                session.add(host)
                session.commit()
            
            return host.to_dict()
    
    def get_hosts(self) -> List[Dict]:
        """
        Get all configured Sunshine hosts
        
        Returns:
            List of host dictionaries
        """
        from models.gaming import SunshineHost
        
        if not self.db_service or not self.db_service.is_available:
            return []
        
        with self.db_service.get_session() as session:
            hosts = session.query(SunshineHost).all()
            return [host.to_dict() for host in hosts]
    
    def update_host(self, host_id: str, updates: Dict) -> Dict:
        """
        Update host configuration
        
        Args:
            host_id: Host UUID
            updates: Dictionary of fields to update
            
        Returns:
            Updated host dictionary
        """
        from models.gaming import SunshineHost
        
        if not self.db_service or not self.db_service.is_available:
            raise RuntimeError("Database service not available")
        
        with self.db_service.get_session() as session:
            host = session.query(SunshineHost).filter_by(id=host_id).first()
            
            if not host:
                raise ValueError(f"Host {host_id} not found")
            
            # Update allowed fields
            allowed_fields = ['host_name', 'host_ip', 'api_url']
            for field, value in updates.items():
                if field in allowed_fields:
                    setattr(host, field, value)
            
            host.updated_at = datetime.utcnow()
            session.commit()
            
            return host.to_dict()
    
    def delete_host(self, host_id: str) -> bool:
        """
        Delete a Sunshine host
        
        Args:
            host_id: Host UUID
            
        Returns:
            True if deleted successfully
        """
        from models.gaming import SunshineHost
        
        if not self.db_service or not self.db_service.is_available:
            raise RuntimeError("Database service not available")
        
        with self.db_service.get_session() as session:
            host = session.query(SunshineHost).filter_by(id=host_id).first()
            
            if not host:
                raise ValueError(f"Host {host_id} not found")
            
            session.delete(host)
            session.commit()
            
            return True
    
    def initiate_pairing(self, host_id: str, pin: str) -> Dict:
        """
        Initiate pairing with a Sunshine host using PIN
        
        Args:
            host_id: Host UUID
            pin: 4-digit PIN from Moonlight client
            
        Returns:
            Pairing result dictionary
        """
        from models.gaming import SunshineHost
        
        if not self.db_service or not self.db_service.is_available:
            raise RuntimeError("Database service not available")
        
        with self.db_service.get_session() as session:
            host = session.query(SunshineHost).filter_by(id=host_id).first()
            
            if not host:
                raise ValueError(f"Host {host_id} not found")
            
            try:
                # Call Sunshine pairing API
                url = f"{host.api_url}/api/pin"
                response = requests.post(
                    url,
                    json={'pin': pin},
                    timeout=10,
                    verify=False
                )
                
                if response.status_code == 200:
                    # Pairing successful
                    host.is_paired = True
                    host.pairing_pin = None
                    host.last_online = datetime.utcnow()
                    session.commit()
                    
                    return {
                        'success': True,
                        'message': 'Pairing successful',
                        'host': host.to_dict()
                    }
                else:
                    return {
                        'success': False,
                        'message': f'Pairing failed: {response.text}',
                        'error_code': response.status_code
                    }
                    
            except Exception as e:
                logger.error(f"Pairing failed for host {host_id}: {e}")
                return {
                    'success': False,
                    'message': f'Pairing error: {str(e)}'
                }
    
    def get_applications(self, host_id: str) -> List[Dict]:
        """
        Get list of available applications/games from Sunshine host
        
        Args:
            host_id: Host UUID
            
        Returns:
            List of application dictionaries
        """
        from models.gaming import SunshineHost
        
        if not self.db_service or not self.db_service.is_available:
            raise RuntimeError("Database service not available")
        
        with self.db_service.get_session() as session:
            host = session.query(SunshineHost).filter_by(id=host_id).first()
            
            if not host:
                raise ValueError(f"Host {host_id} not found")
            
            try:
                # Get apps from Sunshine API
                url = f"{host.api_url}/api/apps"
                response = requests.get(url, timeout=10, verify=False)
                
                if response.status_code == 200:
                    apps_data = response.json()
                    
                    # Update host with applications
                    host.applications = apps_data
                    host.last_online = datetime.utcnow()
                    session.commit()
                    
                    return apps_data
                else:
                    logger.error(f"Failed to get apps from {host.host_ip}: {response.status_code}")
                    return host.applications or []
                    
            except Exception as e:
                logger.error(f"Failed to get applications from host {host_id}: {e}")
                # Return cached applications if available
                return host.applications or []
    
    def check_health(self, host_id: str) -> Dict:
        """
        Check health of Sunshine host
        
        Args:
            host_id: Host UUID
            
        Returns:
            Health status dictionary
        """
        from models.gaming import SunshineHost
        
        if not self.db_service or not self.db_service.is_available:
            raise RuntimeError("Database service not available")
        
        with self.db_service.get_session() as session:
            host = session.query(SunshineHost).filter_by(id=host_id).first()
            
            if not host:
                raise ValueError(f"Host {host_id} not found")
            
            # Test connection
            is_online = self._test_sunshine_connection(host.host_ip)
            
            health = {
                'host_id': str(host.id),
                'host_ip': host.host_ip,
                'is_online': is_online,
                'is_paired': host.is_paired,
                'last_online': host.last_online.isoformat() if host.last_online else None,
                'checked_at': datetime.utcnow().isoformat()
            }
            
            if is_online:
                # Update last_online timestamp
                host.last_online = datetime.utcnow()
                session.commit()
                
                # Try to get GPU info
                try:
                    info = self._get_sunshine_info(host.host_ip)
                    if info and info.get('gpu_model'):
                        health['gpu_model'] = info['gpu_model']
                        host.gpu_model = info['gpu_model']
                        session.commit()
                except:
                    pass
            
            return health
    
    def run_diagnostics(self, host_id: str) -> Dict:
        """
        Run comprehensive diagnostics on Sunshine host
        
        Args:
            host_id: Host UUID
            
        Returns:
            Diagnostics results dictionary
        """
        from models.gaming import SunshineHost
        
        if not self.db_service or not self.db_service.is_available:
            raise RuntimeError("Database service not available")
        
        with self.db_service.get_session() as session:
            host = session.query(SunshineHost).filter_by(id=host_id).first()
            
            if not host:
                raise ValueError(f"Host {host_id} not found")
            
            diagnostics = {
                'host_id': str(host.id),
                'host_ip': host.host_ip,
                'host_name': host.host_name,
                'timestamp': datetime.utcnow().isoformat(),
                'tests': {}
            }
            
            # Test 1: Ping test
            diagnostics['tests']['ping'] = self._test_ping(host.host_ip)
            
            # Test 2: Port connectivity tests
            diagnostics['tests']['ports'] = self._test_ports(host.host_ip)
            
            # Test 3: Sunshine API test
            diagnostics['tests']['api'] = self._test_sunshine_api(host.host_ip)
            
            # Test 4: Network latency
            diagnostics['tests']['latency'] = self._test_latency(host.host_ip)
            
            # Overall status
            all_passed = all(
                test.get('success', False) 
                for test in diagnostics['tests'].values()
            )
            diagnostics['overall_status'] = 'healthy' if all_passed else 'issues_detected'
            
            return diagnostics
    
    def _test_ping(self, host_ip: str) -> Dict:
        """Test basic ping connectivity"""
        try:
            result = subprocess.run(
                ['ping', '-c', '3', '-W', '2', host_ip],
                capture_output=True,
                text=True,
                timeout=10
            )
            
            success = result.returncode == 0
            
            # Parse average latency from ping output
            latency = None
            if success:
                match = re.search(r'avg = ([\d.]+)', result.stdout)
                if match:
                    latency = float(match.group(1))
            
            return {
                'success': success,
                'latency_ms': latency,
                'message': 'Ping successful' if success else 'Ping failed'
            }
        except Exception as e:
            return {
                'success': False,
                'error': str(e),
                'message': 'Ping test failed'
            }
    
    def _test_ports(self, host_ip: str) -> Dict:
        """Test Sunshine port connectivity"""
        results = {}
        
        for port_name, port_num in self.SUNSHINE_DEFAULT_PORTS.items():
            try:
                sock = socket.socket(socket.AF_INET, socket.SOCK_STREAM)
                sock.settimeout(2)
                result = sock.connect_ex((host_ip, port_num))
                sock.close()
                
                results[port_name] = {
                    'port': port_num,
                    'open': result == 0,
                    'success': result == 0
                }
            except Exception as e:
                results[port_name] = {
                    'port': port_num,
                    'open': False,
                    'success': False,
                    'error': str(e)
                }
        
        all_success = all(r.get('success', False) for r in results.values())
        
        return {
            'success': all_success,
            'ports': results,
            'message': 'All ports accessible' if all_success else 'Some ports blocked'
        }
    
    def _test_sunshine_api(self, host_ip: str) -> Dict:
        """Test Sunshine API availability"""
        try:
            url = self._get_sunshine_url(host_ip)
            response = requests.get(f"{url}/api/config", timeout=5, verify=False)
            
            success = response.status_code == 200
            
            return {
                'success': success,
                'status_code': response.status_code,
                'message': 'API accessible' if success else f'API returned {response.status_code}'
            }
        except Exception as e:
            return {
                'success': False,
                'error': str(e),
                'message': 'API not accessible'
            }
    
    def _test_latency(self, host_ip: str) -> Dict:
        """Test network latency with multiple samples"""
        try:
            latencies = []
            url = self._get_sunshine_url(host_ip)
            
            for _ in range(5):
                start = datetime.utcnow()
                try:
                    requests.get(f"{url}/api/ping", timeout=2, verify=False)
                    latency = (datetime.utcnow() - start).total_seconds() * 1000
                    latencies.append(latency)
                except:
                    pass
            
            if latencies:
                avg_latency = sum(latencies) / len(latencies)
                max_latency = max(latencies)
                min_latency = min(latencies)
                
                # Determine quality
                if avg_latency < 10:
                    quality = 'excellent'
                elif avg_latency < 30:
                    quality = 'good'
                elif avg_latency < 100:
                    quality = 'fair'
                else:
                    quality = 'poor'
                
                return {
                    'success': True,
                    'avg_ms': round(avg_latency, 2),
                    'min_ms': round(min_latency, 2),
                    'max_ms': round(max_latency, 2),
                    'quality': quality,
                    'message': f'Average latency: {avg_latency:.1f}ms ({quality})'
                }
            else:
                return {
                    'success': False,
                    'message': 'Could not measure latency'
                }
                
        except Exception as e:
            return {
                'success': False,
                'error': str(e),
                'message': 'Latency test failed'
            }
    
    def get_sessions(self, status: Optional[str] = None, limit: int = 50) -> List[Dict]:
        """
        Get game streaming sessions
        
        Args:
            status: Filter by status ('active', 'disconnected', etc.)
            limit: Maximum number of sessions to return
            
        Returns:
            List of session dictionaries
        """
        from models.gaming import GameSession
        
        if not self.db_service or not self.db_service.is_available:
            return []
        
        with self.db_service.get_session() as session:
            query = session.query(GameSession)
            
            if status:
                query = query.filter_by(status=status)
            
            sessions = query.order_by(GameSession.started_at.desc()).limit(limit).all()
            return [s.to_dict() for s in sessions]
    
    def create_session(self, session_data: Dict) -> Dict:
        """
        Create a new game streaming session
        
        Args:
            session_data: Session information dictionary
            
        Returns:
            Created session dictionary
        """
        from models.gaming import GameSession
        
        if not self.db_service or not self.db_service.is_available:
            raise RuntimeError("Database service not available")
        
        with self.db_service.get_session() as session:
            game_session = GameSession(
                id=uuid.uuid4(),
                session_type=session_data.get('session_type', 'moonlight'),
                user_id=session_data.get('user_id'),
                host_ip=session_data.get('host_ip'),
                host_name=session_data.get('host_name'),
                status='active',
                client_device=session_data.get('client_device'),
                resolution=session_data.get('resolution'),
                fps=session_data.get('fps'),
                bitrate_mbps=session_data.get('bitrate_mbps'),
                game_name=session_data.get('game_name'),
                metadata=session_data.get('metadata', {})
            )
            
            session.add(game_session)
            session.commit()
            
            return game_session.to_dict()
    
    def update_session(self, session_id: str, updates: Dict) -> Dict:
        """
        Update game streaming session
        
        Args:
            session_id: Session UUID
            updates: Dictionary of fields to update
            
        Returns:
            Updated session dictionary
        """
        from models.gaming import GameSession
        
        if not self.db_service or not self.db_service.is_available:
            raise RuntimeError("Database service not available")
        
        with self.db_service.get_session() as db_session:
            game_session = db_session.query(GameSession).filter_by(id=session_id).first()
            
            if not game_session:
                raise ValueError(f"Session {session_id} not found")
            
            # Update allowed fields
            allowed_fields = ['status', 'latency_ms', 'fps', 'bitrate_mbps', 'resolution', 'game_name']
            for field, value in updates.items():
                if field in allowed_fields:
                    setattr(game_session, field, value)
            
            # Set ended_at if status is disconnected
            if updates.get('status') in ['disconnected', 'error']:
                game_session.ended_at = datetime.utcnow()
            
            db_session.commit()
            
            return game_session.to_dict()


# Global service instance (will be initialized with db_service in __init__.py or when imported)
try:
    from services.db_service import db_service
    game_streaming_service = GameStreamingService(db_service=db_service)
except ImportError:
    # Fallback for module initialization
    game_streaming_service = GameStreamingService(db_service=None)
