"""Docker Compose template generator - Enhanced for multi-service and stack deployments"""
import yaml
import secrets
import string
import re
from typing import Dict, List, Optional, Any, Tuple
from datetime import datetime


def generate_compose_spec(
    project_name: str,
    image_ref: str,
    container_port: int = 80,
    host_port: Optional[int] = None,
    environment: Optional[Dict[str, str]] = None,
    volumes: Optional[List[str]] = None,
    networks: Optional[List[str]] = None,
    domain: Optional[str] = None,
    healthcheck: Optional[Dict[str, Any]] = None,
    depends_on: Optional[List[str]] = None,
    command: Optional[str] = None,
    deploy_config: Optional[Dict[str, Any]] = None
) -> Dict:
    """Generate docker-compose.yml structure for a single service
    
    Args:
        project_name: Name of the project
        image_ref: Docker image reference (e.g., localhost:5000/app:latest)
        container_port: Port inside container (default: 80)
        host_port: Port on host (None = use Caddy reverse proxy)
        environment: Environment variables dict
        volumes: List of volume mounts
        networks: List of networks to attach
        domain: Optional domain for Caddy reverse proxy
        healthcheck: Optional healthcheck configuration
        depends_on: Optional list of service dependencies
        command: Optional command override
        deploy_config: Optional deploy configuration for resource limits
        
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
                    'com.jarvis.project': project_name,
                    'com.jarvis.created': datetime.utcnow().isoformat()
                }
            }
        },
        'networks': {
            'jarvis-net': {
                'driver': 'bridge'
            }
        }
    }
    
    service_config = compose_spec['services'][service_name]
    
    if host_port and not domain:
        service_config['ports'] = [f'{host_port}:{container_port}']
    
    if volumes:
        service_config['volumes'] = volumes
        compose_spec['volumes'] = {}
        for vol in volumes:
            if ':' in vol:
                vol_name = vol.split(':')[0]
                if not vol_name.startswith('/') and not vol_name.startswith('.'):
                    compose_spec['volumes'][vol_name] = {}
    
    if networks:
        service_config['networks'] = networks
    else:
        service_config['networks'] = ['jarvis-net']
    
    if domain:
        service_config['labels'].update({
            'caddy': domain,
            'caddy.reverse_proxy': f'{service_name}:{container_port}'
        })
    
    if healthcheck:
        service_config['healthcheck'] = healthcheck
    
    if depends_on:
        service_config['depends_on'] = depends_on
    
    if command:
        service_config['command'] = command
    
    if deploy_config:
        service_config['deploy'] = deploy_config
    
    return compose_spec


def generate_multi_service_compose(
    project_name: str,
    services: List[Dict[str, Any]],
    networks: Optional[Dict[str, Any]] = None,
    volumes: Optional[Dict[str, Any]] = None
) -> Dict:
    """Generate docker-compose.yml for multiple services
    
    Args:
        project_name: Name of the project
        services: List of service configurations
        networks: Optional network configurations
        volumes: Optional volume configurations
        
    Returns:
        Dictionary representing docker-compose.yml structure
    """
    compose_spec = {
        'version': '3.8',
        'services': {},
        'networks': networks or {
            'internal': {'driver': 'bridge'},
            'web': {'external': True, 'name': 'homelab'}
        },
        'volumes': volumes or {}
    }
    
    for service in services:
        service_name = service.get('name', '').lower().replace(' ', '-').replace('_', '-')
        if not service_name:
            continue
        
        service_config = {
            'container_name': f"{project_name}-{service_name}",
            'restart': 'unless-stopped',
            'labels': {
                'com.jarvis.managed': 'true',
                'com.jarvis.project': project_name,
                'com.jarvis.service': service_name
            }
        }
        
        if 'image' in service:
            service_config['image'] = service['image']
        elif 'build' in service:
            service_config['build'] = service['build']
        
        if 'environment' in service:
            service_config['environment'] = service['environment']
        
        if 'ports' in service:
            service_config['ports'] = service['ports']
        
        if 'volumes' in service:
            service_config['volumes'] = service['volumes']
            for vol in service['volumes']:
                if ':' in vol:
                    vol_name = vol.split(':')[0]
                    if not vol_name.startswith('/') and not vol_name.startswith('.'):
                        compose_spec['volumes'][vol_name] = {}
        
        if 'networks' in service:
            service_config['networks'] = service['networks']
        else:
            service_config['networks'] = ['internal']
        
        if 'depends_on' in service:
            service_config['depends_on'] = service['depends_on']
        
        if 'command' in service:
            service_config['command'] = service['command']
        
        if 'healthcheck' in service:
            service_config['healthcheck'] = service['healthcheck']
        
        if 'deploy' in service:
            service_config['deploy'] = service['deploy']
        
        if 'domain' in service:
            service_config['labels']['caddy'] = service['domain']
            port = service.get('container_port', 80)
            service_config['labels']['caddy.reverse_proxy'] = f"{project_name}-{service_name}:{port}"
        
        compose_spec['services'][service_name] = service_config
    
    return compose_spec


def generate_production_compose(
    project_name: str,
    services: List[Dict[str, Any]],
    include_monitoring: bool = False,
    include_logging: bool = False,
    include_backup: bool = False
) -> Dict:
    """Generate production-ready docker-compose with optional monitoring, logging, and backup
    
    Args:
        project_name: Name of the project
        services: List of service configurations
        include_monitoring: Include Prometheus/Grafana monitoring
        include_logging: Include Loki logging stack
        include_backup: Include backup container
        
    Returns:
        Dictionary representing production docker-compose.yml
    """
    compose = generate_multi_service_compose(project_name, services)
    
    if include_monitoring:
        compose['services']['prometheus'] = {
            'image': 'prom/prometheus:latest',
            'container_name': f'{project_name}-prometheus',
            'restart': 'unless-stopped',
            'volumes': [
                f'{project_name}_prometheus_data:/prometheus',
                './prometheus.yml:/etc/prometheus/prometheus.yml:ro'
            ],
            'command': [
                '--config.file=/etc/prometheus/prometheus.yml',
                '--storage.tsdb.path=/prometheus',
                '--storage.tsdb.retention.time=30d'
            ],
            'networks': ['internal'],
            'labels': {
                'com.jarvis.managed': 'true',
                'com.jarvis.role': 'monitoring'
            }
        }
        compose['services']['grafana'] = {
            'image': 'grafana/grafana:latest',
            'container_name': f'{project_name}-grafana',
            'restart': 'unless-stopped',
            'environment': {
                'GF_SECURITY_ADMIN_PASSWORD': '${GRAFANA_PASSWORD}',
                'GF_USERS_ALLOW_SIGN_UP': 'false'
            },
            'volumes': [f'{project_name}_grafana_data:/var/lib/grafana'],
            'depends_on': ['prometheus'],
            'networks': ['internal', 'web'],
            'labels': {
                'com.jarvis.managed': 'true',
                'com.jarvis.role': 'monitoring'
            }
        }
        compose['volumes'][f'{project_name}_prometheus_data'] = {}
        compose['volumes'][f'{project_name}_grafana_data'] = {}
    
    if include_logging:
        compose['services']['loki'] = {
            'image': 'grafana/loki:latest',
            'container_name': f'{project_name}-loki',
            'restart': 'unless-stopped',
            'volumes': [f'{project_name}_loki_data:/loki'],
            'networks': ['internal'],
            'labels': {
                'com.jarvis.managed': 'true',
                'com.jarvis.role': 'logging'
            }
        }
        compose['services']['promtail'] = {
            'image': 'grafana/promtail:latest',
            'container_name': f'{project_name}-promtail',
            'restart': 'unless-stopped',
            'volumes': [
                '/var/log:/var/log:ro',
                '/var/lib/docker/containers:/var/lib/docker/containers:ro',
                './promtail.yml:/etc/promtail/config.yml:ro'
            ],
            'command': ['-config.file=/etc/promtail/config.yml'],
            'depends_on': ['loki'],
            'networks': ['internal'],
            'labels': {
                'com.jarvis.managed': 'true',
                'com.jarvis.role': 'logging'
            }
        }
        compose['volumes'][f'{project_name}_loki_data'] = {}
    
    if include_backup:
        compose['services']['backup'] = {
            'image': 'restic/restic:latest',
            'container_name': f'{project_name}-backup',
            'environment': {
                'RESTIC_REPOSITORY': '${BACKUP_REPOSITORY}',
                'RESTIC_PASSWORD': '${BACKUP_PASSWORD}',
                'AWS_ACCESS_KEY_ID': '${AWS_ACCESS_KEY_ID}',
                'AWS_SECRET_ACCESS_KEY': '${AWS_SECRET_ACCESS_KEY}'
            },
            'volumes': list(compose.get('volumes', {}).keys()),
            'networks': ['internal'],
            'labels': {
                'com.jarvis.managed': 'true',
                'com.jarvis.role': 'backup'
            }
        }
    
    return compose


def generate_database_compose(
    db_type: str,
    project_name: str,
    config: Dict[str, Any]
) -> Dict:
    """Generate docker-compose for database services
    
    Args:
        db_type: Type of database (postgres, mysql, mongodb, redis, etc.)
        project_name: Name of the project
        config: Database configuration
        
    Returns:
        Dictionary representing docker-compose.yml for the database
    """
    templates = {
        'postgres': {
            'image': 'postgres:15',
            'environment': {
                'POSTGRES_USER': config.get('user', 'postgres'),
                'POSTGRES_PASSWORD': config.get('password', '${DB_PASSWORD}'),
                'POSTGRES_DB': config.get('database', project_name)
            },
            'volumes': [f'{project_name}_postgres_data:/var/lib/postgresql/data'],
            'healthcheck': {
                'test': ['CMD-SHELL', f"pg_isready -U {config.get('user', 'postgres')}"],
                'interval': '10s',
                'timeout': '5s',
                'retries': 5
            }
        },
        'mysql': {
            'image': 'mysql:8.0',
            'environment': {
                'MYSQL_ROOT_PASSWORD': config.get('root_password', '${DB_ROOT_PASSWORD}'),
                'MYSQL_DATABASE': config.get('database', project_name),
                'MYSQL_USER': config.get('user', 'app'),
                'MYSQL_PASSWORD': config.get('password', '${DB_PASSWORD}')
            },
            'volumes': [f'{project_name}_mysql_data:/var/lib/mysql'],
            'healthcheck': {
                'test': ['CMD', 'mysqladmin', 'ping', '-h', 'localhost'],
                'interval': '10s',
                'timeout': '5s',
                'retries': 5
            }
        },
        'mongodb': {
            'image': 'mongo:7',
            'environment': {
                'MONGO_INITDB_ROOT_USERNAME': config.get('user', 'admin'),
                'MONGO_INITDB_ROOT_PASSWORD': config.get('password', '${MONGO_PASSWORD}'),
                'MONGO_INITDB_DATABASE': config.get('database', project_name)
            },
            'volumes': [f'{project_name}_mongo_data:/data/db']
        },
        'redis': {
            'image': 'redis:7-alpine',
            'command': config.get('command', 'redis-server --appendonly yes'),
            'volumes': [f'{project_name}_redis_data:/data'],
            'healthcheck': {
                'test': ['CMD', 'redis-cli', 'ping'],
                'interval': '10s',
                'timeout': '5s',
                'retries': 5
            }
        },
        'elasticsearch': {
            'image': 'docker.elastic.co/elasticsearch/elasticsearch:8.11.0',
            'environment': {
                'discovery.type': 'single-node',
                'ES_JAVA_OPTS': config.get('java_opts', '-Xms512m -Xmx512m'),
                'xpack.security.enabled': str(config.get('security', False)).lower()
            },
            'volumes': [f'{project_name}_es_data:/usr/share/elasticsearch/data']
        }
    }
    
    if db_type not in templates:
        raise ValueError(f"Unknown database type: {db_type}")
    
    db_template = templates[db_type]
    service_name = f"{project_name}-{db_type}"
    
    compose = {
        'version': '3.8',
        'services': {
            db_type: {
                'image': db_template['image'],
                'container_name': service_name,
                'restart': 'unless-stopped',
                'environment': db_template.get('environment', {}),
                'volumes': db_template.get('volumes', []),
                'networks': ['internal'],
                'labels': {
                    'com.jarvis.managed': 'true',
                    'com.jarvis.project': project_name,
                    'com.jarvis.role': 'database'
                }
            }
        },
        'volumes': {},
        'networks': {
            'internal': {'driver': 'bridge'}
        }
    }
    
    if 'healthcheck' in db_template:
        compose['services'][db_type]['healthcheck'] = db_template['healthcheck']
    
    if 'command' in db_template:
        compose['services'][db_type]['command'] = db_template['command']
    
    for vol in db_template.get('volumes', []):
        if ':' in vol:
            vol_name = vol.split(':')[0]
            compose['volumes'][vol_name] = {}
    
    return compose


def generate_env_file(config: Dict[str, str]) -> str:
    """Generate .env file content from configuration
    
    Args:
        config: Dictionary of environment variable key-value pairs
        
    Returns:
        .env file content as string
    """
    lines = [
        f"# Generated by Jarvis Infrastructure Orchestrator",
        f"# {datetime.utcnow().isoformat()}",
        ""
    ]
    
    for key, value in config.items():
        if any(special in str(value) for special in [' ', '"', "'", '$', '#']):
            lines.append(f'{key}="{value}"')
        else:
            lines.append(f'{key}={value}')
    
    return '\n'.join(lines)


def generate_secure_password(length: int = 24) -> str:
    """Generate a secure random password"""
    alphabet = string.ascii_letters + string.digits + "!@#$%^&*"
    return ''.join(secrets.choice(alphabet) for _ in range(length))


def substitute_variables(template: str, variables: Dict[str, Any]) -> str:
    """Substitute ${VAR} and {var} placeholders in a template string
    
    Args:
        template: Template string with placeholders
        variables: Dictionary of variable values
        
    Returns:
        String with placeholders replaced
    """
    result = template
    
    for pattern in [r'\$\{([^}]+)\}', r'\{([^}]+)\}']:
        def replace(match):
            key = match.group(1)
            return str(variables.get(key, match.group(0)))
        result = re.sub(pattern, replace, result)
    
    return result


def merge_compose_files(base: Dict, overlay: Dict) -> Dict:
    """Merge two docker-compose configurations
    
    Args:
        base: Base compose configuration
        overlay: Overlay to merge on top of base
        
    Returns:
        Merged compose configuration
    """
    result = base.copy()
    
    if 'services' in overlay:
        if 'services' not in result:
            result['services'] = {}
        for service_name, service_config in overlay['services'].items():
            if service_name in result['services']:
                result['services'][service_name].update(service_config)
            else:
                result['services'][service_name] = service_config
    
    if 'volumes' in overlay:
        if 'volumes' not in result:
            result['volumes'] = {}
        result['volumes'].update(overlay['volumes'])
    
    if 'networks' in overlay:
        if 'networks' not in result:
            result['networks'] = {}
        result['networks'].update(overlay['networks'])
    
    return result


def compose_to_yaml(compose_dict: Dict) -> str:
    """Convert compose dict to YAML string
    
    Args:
        compose_dict: Dictionary representing docker-compose structure
        
    Returns:
        YAML-formatted string
    """
    return yaml.dump(compose_dict, default_flow_style=False, sort_keys=False)


def yaml_to_compose(yaml_content: str) -> Dict:
    """Parse YAML string to compose dictionary
    
    Args:
        yaml_content: YAML-formatted docker-compose content
        
    Returns:
        Dictionary representing docker-compose structure
    """
    return yaml.safe_load(yaml_content)


def validate_compose(compose_dict: Dict) -> Tuple[bool, List[str]]:
    """Validate a docker-compose configuration
    
    Args:
        compose_dict: Dictionary representing docker-compose structure
        
    Returns:
        Tuple of (is_valid, list of errors)
    """
    errors = []
    
    if 'version' not in compose_dict:
        errors.append("Missing 'version' field")
    
    if 'services' not in compose_dict or not compose_dict['services']:
        errors.append("Missing or empty 'services' field")
    else:
        for service_name, service_config in compose_dict['services'].items():
            if not isinstance(service_config, dict):
                errors.append(f"Service '{service_name}' must be a dictionary")
                continue
            
            if 'image' not in service_config and 'build' not in service_config:
                errors.append(f"Service '{service_name}' must have either 'image' or 'build'")
    
    if 'networks' in compose_dict:
        if not isinstance(compose_dict['networks'], dict):
            errors.append("'networks' must be a dictionary")
    
    if 'volumes' in compose_dict:
        if not isinstance(compose_dict['volumes'], dict):
            errors.append("'volumes' must be a dictionary")
    
    return len(errors) == 0, errors
