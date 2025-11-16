"""
Service Registry for Demo Mode
Provides mock services when demo mode is enabled
"""
from typing import Protocol, Dict, List, Any
import os

DEMO_MODE = os.getenv('DEMO_MODE', 'true').lower() == 'true'

class DockerServiceProtocol(Protocol):
    def list_containers(self) -> List[Dict]:
        ...
    def get_stats(self) -> Dict:
        ...

class MockDockerService:
    """Mock Docker service for demo mode"""
    
    def list_containers(self) -> List[Dict]:
        return [
            {
                'id': 'demo-container-1',
                'name': 'nextcloud',
                'status': 'running',
                'image': 'nextcloud:latest',
                'ports': ['8080:80']
            },
            {
                'id': 'demo-container-2',
                'name': 'jellyfin',
                'status': 'running',
                'image': 'jellyfin/jellyfin:latest',
                'ports': ['8096:8096']
            }
        ]
    
    def get_stats(self) -> Dict:
        return {
            'containers_running': 12,
            'containers_stopped': 2,
            'images': 15,
            'cpu_usage': 45.2,
            'memory_usage': 62.8
        }

class MockPowerDNSService:
    """Mock PowerDNS for demo mode"""
    
    def list_zones(self) -> List[Dict]:
        return [
            {'name': 'homelab.local', 'records': 15, 'status': 'active'},
            {'name': 'demo.local', 'records': 8, 'status': 'active'}
        ]
    
    def create_zone(self, zone_name: str) -> Dict:
        return {'success': True, 'zone': zone_name, 'message': 'Demo: Zone would be created'}

class MockHomeAssistantService:
    """Mock Home Assistant for demo mode"""
    
    def is_available(self) -> bool:
        return True
    
    def get_devices(self) -> List[Dict]:
        return [
            {'id': 'light.living_room', 'name': 'Living Room Light', 'state': 'on', 'type': 'light'},
            {'id': 'switch.bedroom', 'name': 'Bedroom Switch', 'state': 'off', 'type': 'switch'},
            {'id': 'sensor.temperature', 'name': 'Temperature Sensor', 'state': '72°F', 'type': 'sensor'}
        ]
    
    def get_automations(self) -> List[Dict]:
        return [
            {'id': 'auto1', 'name': 'Motion Light', 'enabled': True},
            {'id': 'auto2', 'name': 'Night Mode', 'enabled': True}
        ]
    
    def get_energy_stats(self) -> Dict:
        return {
            'daily_consumption': 45.2,
            'weekly_consumption': 312.5,
            'cost_today': 5.42,
            'peak_hour': '6 PM'
        }
    
    def control_device(self, entity_id: str, action: str) -> Dict:
        return {
            'success': True,
            'entity_id': entity_id,
            'action': action,
            'message': f'[Demo Mode] Simulated {action} for {entity_id}'
        }

class MockNASService:
    """Mock NAS for demo mode"""
    
    def scan_network(self) -> List[Dict]:
        return [
            {'ip': '192.168.1.100', 'name': 'QNAP-NAS', 'shares': 5},
            {'ip': '192.168.1.101', 'name': 'Synology-DS920', 'shares': 8}
        ]
    
    def mount_share(self, ip: str, share_name: str) -> Dict:
        return {'success': True, 'message': f'Demo: Would mount {share_name} from {ip}'}

class MockOllamaService:
    """Mock Ollama for demo"""
    
    def is_available(self) -> bool:
        return True
    
    def list_models(self):
        return [
            {'name': 'llama2:7b', 'size': '3.8GB', 'status': 'downloaded'},
            {'name': 'mistral:latest', 'size': '4.1GB', 'status': 'downloading', 'progress': 65},
            {'name': 'codellama:latest', 'size': '3.5GB', 'status': 'available'}
        ]
    
    def chat(self, model: str, message: str) -> str:
        return f"[Demo Mode] AI Response to: {message}. This is a simulated response for investor demos. In production, this would use real Ollama models."

def get_docker_service():
    """Get Docker service (mock in demo mode)"""
    if DEMO_MODE:
        return MockDockerService()
    else:
        from services.docker_service import DockerService
        return DockerService()

def get_powerdns_service():
    """Get PowerDNS service (mock in demo mode)"""
    if DEMO_MODE:
        return MockPowerDNSService()
    else:
        from services.powerdns_service import PowerDNSService
        return PowerDNSService()

def get_homeassistant_service():
    """Get Home Assistant service - real if available, else mock"""
    if DEMO_MODE:
        return MockHomeAssistantService()
    else:
        from services.homeassistant_service import HomeAssistantService
        service = HomeAssistantService()
        
        if service.is_available():
            return service
        else:
            import structlog
            logger = structlog.get_logger()
            logger.warning("Home Assistant not available, using mock service")
            return MockHomeAssistantService()

def get_ollama_service():
    """Get Ollama service - real if available, else mock"""
    if DEMO_MODE:
        return MockOllamaService()
    else:
        from services.ollama_service import OllamaService
        service = OllamaService()
        
        if service.is_available():
            return service
        else:
            import structlog
            logger = structlog.get_logger()
            logger.warning("Ollama not available, using mock service")
            return MockOllamaService()

def get_nas_service():
    """Get NAS service (mock in demo mode)"""
    if DEMO_MODE:
        return MockNASService()
    else:
        from services.nas_service import NASDiscoveryService
        return NASDiscoveryService()
