"""Docker Compose template generator"""
import yaml
from typing import Dict, List, Optional

def generate_compose_spec(
    project_name: str,
    image_ref: str,
    container_port: int = 80,
    host_port: Optional[int] = None,
    environment: Optional[Dict[str, str]] = None,
    volumes: Optional[List[str]] = None,
    networks: Optional[List[str]] = None,
    domain: Optional[str] = None
) -> Dict:
    """Generate docker-compose.yml structure
    
    Args:
        project_name: Name of the project
        image_ref: Docker image reference (e.g., localhost:5000/app:latest)
        container_port: Port inside container (default: 80)
        host_port: Port on host (None = use Caddy reverse proxy)
        environment: Environment variables dict
        volumes: List of volume mounts
        networks: List of networks to attach
        domain: Optional domain for Caddy reverse proxy
        
    Returns:
        Dictionary representing docker-compose.yml structure
    """
    
    service_name = project_name.lower().replace(' ', '-').replace('_', '-')
    
    compose_spec = {
        'version': '3.8',
        'services': {
            service_name: {
                'image': image_ref,
                'container_name': service_name,
                'restart': 'unless-stopped',
                'environment': environment or {},
                'labels': {
                    'com.jarvis.managed': 'true',
                    'com.jarvis.project': project_name
                }
            }
        },
        'networks': {
            'jarvis-net': {
                'driver': 'bridge'
            }
        }
    }
    
    # Add port mapping ONLY if no domain (Caddy handles it if domain present)
    if host_port and not domain:
        compose_spec['services'][service_name]['ports'] = [f'{host_port}:{container_port}']
    
    # Add volumes if specified
    if volumes:
        compose_spec['services'][service_name]['volumes'] = volumes
    
    # Add networks
    if networks:
        compose_spec['services'][service_name]['networks'] = networks
    else:
        compose_spec['services'][service_name]['networks'] = ['jarvis-net']
    
    # Add Caddy labels for reverse proxy if domain specified
    if domain:
        # Caddy auto-discovers services on same network
        compose_spec['services'][service_name]['labels'].update({
            'caddy': domain,
            'caddy.reverse_proxy': f'{service_name}:{container_port}'
        })
    
    return compose_spec

def compose_to_yaml(compose_dict: Dict) -> str:
    """Convert compose dict to YAML string
    
    Args:
        compose_dict: Dictionary representing docker-compose structure
        
    Returns:
        YAML-formatted string
    """
    return yaml.dump(compose_dict, default_flow_style=False, sort_keys=False)
