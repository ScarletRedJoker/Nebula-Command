"""
Setup Wizard Routes
Comprehensive configuration wizard for all required services
"""
from flask import Blueprint, jsonify, request, render_template
from utils.auth import require_auth, require_web_auth
import logging
import os
import re
import requests
from datetime import datetime

logger = logging.getLogger(__name__)

setup_bp = Blueprint('setup', __name__)

TAILSCALE_IP_PATTERN = re.compile(r'^100\.\d{1,3}\.\d{1,3}\.\d{1,3}$')
PRIVATE_IP_PATTERN = re.compile(r'^(10\.\d{1,3}\.\d{1,3}\.\d{1,3}|172\.(1[6-9]|2\d|3[01])\.\d{1,3}\.\d{1,3}|192\.168\.\d{1,3}\.\d{1,3})$')
ALLOWED_HOST_IDS = ['linode', 'local']
ALLOWED_STORAGE_ENDPOINTS = [
    'play.min.io',
    's3.amazonaws.com',
    's3.backblazeb2.com',
]

SETUP_SERVICES = {
    'cloudflare': {
        'name': 'Cloudflare DNS',
        'icon': 'bi-cloud',
        'description': 'Manage DNS records for your domains',
        'required': False,
        'fields': ['api_token']
    },
    'tailscale': {
        'name': 'Tailscale VPN',
        'icon': 'bi-diagram-3',
        'description': 'Secure mesh network for fleet management',
        'required': False,
        'fields': ['linode_ip', 'local_ip']
    },
    'fleet_ssh': {
        'name': 'Fleet SSH Keys',
        'icon': 'bi-key',
        'description': 'SSH authentication for remote server management',
        'required': False,
        'fields': ['key_path', 'linode_user', 'local_user']
    },
    'cloud_storage': {
        'name': 'Cloud Storage',
        'icon': 'bi-cloud-arrow-up',
        'description': 'Backblaze B2 or S3-compatible object storage',
        'required': False,
        'fields': ['endpoint', 'access_key', 'secret_key', 'provider']
    },
    'openai': {
        'name': 'OpenAI API',
        'icon': 'bi-robot',
        'description': 'AI features for Jarvis assistant and chat',
        'required': True,
        'fields': ['api_key']
    }
}


def is_valid_tailscale_or_private_ip(ip: str) -> bool:
    """Check if IP is a valid Tailscale or private network IP"""
    if not ip:
        return False
    return bool(TAILSCALE_IP_PATTERN.match(ip) or PRIVATE_IP_PATTERN.match(ip))


def is_safe_storage_endpoint(endpoint: str) -> bool:
    """Check if storage endpoint is from allowed list or user's own domain"""
    if not endpoint:
        return False
    try:
        from urllib.parse import urlparse
        parsed = urlparse(endpoint)
        host = parsed.netloc or parsed.path
        host = host.split(':')[0]
        for allowed in ALLOWED_STORAGE_ENDPOINTS:
            if host.endswith(allowed):
                return True
        if is_valid_tailscale_or_private_ip(host):
            return True
        if host.endswith('.evindrake.net') or host.endswith('.rig-city.com'):
            return True
        return False
    except Exception:
        return False


def make_response(success: bool, data=None, message=None, status_code=200):
    """Create consistent JSON response"""
    response = {'success': success}
    if data is not None:
        response['data'] = data
    if message is not None:
        response['message'] = message
    return jsonify(response), status_code


def get_db_setting(key: str, default=None):
    """Get a setting from the database"""
    try:
        from services.db_service import db_service
        from models.settings import SystemSetting
        
        if db_service.is_available:
            with db_service.get_session() as session:
                setting = session.query(SystemSetting).filter(
                    SystemSetting.key == key
                ).first()
                return setting.value if setting else default
    except Exception as e:
        logger.warning(f"Could not get DB setting {key}: {e}")
    return default


def set_db_setting(key: str, value: str, category: str = 'setup', is_secret: bool = False):
    """Set a setting in the database"""
    try:
        from services.db_service import db_service
        from models.settings import SystemSetting
        
        if db_service.is_available:
            with db_service.get_session() as session:
                SystemSetting.set_value(
                    session, key, value, 
                    category=category, 
                    is_secret=is_secret
                )
            return True
    except Exception as e:
        logger.error(f"Could not set DB setting {key}: {e}")
    return False


def update_validation_status(key: str, status: str, message: str = None):
    """Update validation status for a setting"""
    try:
        from services.db_service import db_service
        from models.settings import SystemSetting
        
        if db_service.is_available:
            with db_service.get_session() as session:
                SystemSetting.update_validation(session, key, status, message)
    except Exception as e:
        logger.warning(f"Could not update validation status for {key}: {e}")


def get_service_configured_status(service_key: str) -> dict:
    """Get configuration status for a specific service"""
    db_configured = False
    env_configured = False
    
    if service_key == 'cloudflare':
        env_configured = bool(os.environ.get('CLOUDFLARE_API_TOKEN'))
        db_configured = bool(get_db_setting('setup.cloudflare.api_token'))
        return {
            'configured': env_configured or db_configured,
            'source': 'env' if env_configured else ('db' if db_configured else None)
        }
    
    elif service_key == 'tailscale':
        env_linode = os.environ.get('TAILSCALE_LINODE_HOST', '')
        env_local = os.environ.get('TAILSCALE_LOCAL_HOST', '')
        db_linode = get_db_setting('setup.tailscale.linode_ip', '')
        db_local = get_db_setting('setup.tailscale.local_ip', '')
        
        env_configured = bool(env_linode or env_local)
        db_configured = bool(db_linode or db_local)
        
        return {
            'configured': env_configured or db_configured,
            'linode_ip': env_linode or db_linode,
            'local_ip': env_local or db_local,
            'source': 'env' if env_configured else ('db' if db_configured else None)
        }
    
    elif service_key == 'fleet_ssh':
        env_configured = bool(os.environ.get('FLEET_SSH_KEY_PATH'))
        db_configured = bool(get_db_setting('setup.fleet_ssh.key_path'))
        
        return {
            'configured': env_configured or db_configured,
            'key_path': os.environ.get('FLEET_SSH_KEY_PATH') or get_db_setting('setup.fleet_ssh.key_path', '~/.ssh/id_rsa'),
            'linode_user': os.environ.get('FLEET_LINODE_SSH_USER') or get_db_setting('setup.fleet_ssh.linode_user', 'root'),
            'local_user': os.environ.get('FLEET_LOCAL_SSH_USER') or get_db_setting('setup.fleet_ssh.local_user', 'evin'),
            'source': 'env' if env_configured else ('db' if db_configured else None)
        }
    
    elif service_key == 'cloud_storage':
        env_endpoint = os.environ.get('MINIO_ENDPOINT') or os.environ.get('B2_ENDPOINT', '')
        env_access = os.environ.get('MINIO_ACCESS_KEY') or os.environ.get('B2_ACCESS_KEY_ID', '')
        db_endpoint = get_db_setting('setup.cloud_storage.endpoint', '')
        
        env_configured = bool(env_endpoint and env_access)
        db_configured = bool(db_endpoint)
        
        return {
            'configured': env_configured or db_configured,
            'endpoint': env_endpoint or db_endpoint,
            'access_key_set': bool(env_access) or bool(get_db_setting('setup.cloud_storage.access_key')),
            'provider': get_db_setting('setup.cloud_storage.provider', 'minio'),
            'source': 'env' if env_configured else ('db' if db_configured else None)
        }
    
    elif service_key == 'openai':
        env_configured = bool(os.environ.get('AI_INTEGRATIONS_OPENAI_API_KEY') or os.environ.get('OPENAI_API_KEY'))
        db_configured = bool(get_db_setting('setup.openai.api_key'))
        
        return {
            'configured': env_configured or db_configured,
            'using_integration': bool(os.environ.get('AI_INTEGRATIONS_OPENAI_API_KEY')),
            'source': 'env' if env_configured else ('db' if db_configured else None)
        }
    
    return {'configured': False, 'source': None}


@setup_bp.route('/setup-wizard')
@require_web_auth
def setup_wizard_page():
    """Render Setup Wizard page"""
    return render_template('setup_wizard.html')


@setup_bp.route('/api/setup/status', methods=['GET'])
@require_auth
def get_setup_status():
    """
    GET /api/setup/status
    Get configuration status for all services with database persistence
    """
    try:
        status = {}
        
        for service_key, service_info in SETUP_SERVICES.items():
            svc_status = get_service_configured_status(service_key)
            status[service_key] = {
                **svc_status,
                'name': service_info['name'],
                'icon': service_info['icon'],
                'description': service_info['description'],
                'required': service_info['required']
            }
        
        configured_count = sum(1 for s in status.values() if s.get('configured'))
        total_count = len(status)
        required_configured = sum(1 for k, s in status.items() 
                                   if SETUP_SERVICES[k]['required'] and s.get('configured'))
        required_total = sum(1 for s in SETUP_SERVICES.values() if s['required'])
        
        return make_response(True, {
            'services': status,
            'summary': {
                'configured': configured_count,
                'total': total_count,
                'percentage': int((configured_count / total_count) * 100) if total_count > 0 else 0,
                'required_configured': required_configured,
                'required_total': required_total,
                'setup_complete': configured_count == total_count,
                'minimum_complete': required_configured >= required_total
            }
        })
        
    except Exception as e:
        logger.error(f"Error getting setup status: {e}")
        return make_response(False, message=str(e), status_code=500)


@setup_bp.route('/api/setup/test/cloudflare', methods=['POST'])
@require_auth
def test_cloudflare():
    """
    POST /api/setup/test/cloudflare
    Test Cloudflare API connection
    """
    try:
        data = request.get_json() or {}
        api_token = data.get('api_token') or get_db_setting('setup.cloudflare.api_token') or os.environ.get('CLOUDFLARE_API_TOKEN')
        
        if not api_token:
            return make_response(False, message="API token is required. Enter your Cloudflare API token above.", status_code=400)
        
        response = requests.get(
            "https://api.cloudflare.com/client/v4/user/tokens/verify",
            headers={
                "Authorization": f"Bearer {api_token}",
                "Content-Type": "application/json"
            },
            timeout=10
        )
        
        result = response.json()
        
        if result.get('success'):
            zones_response = requests.get(
                "https://api.cloudflare.com/client/v4/zones",
                headers={
                    "Authorization": f"Bearer {api_token}",
                    "Content-Type": "application/json"
                },
                timeout=10
            )
            zones_result = zones_response.json()
            zone_count = len(zones_result.get('result', [])) if zones_result.get('success') else 0
            zone_names = [z.get('name') for z in zones_result.get('result', [])[:5]]
            
            update_validation_status('setup.cloudflare.api_token', 'success', f'Found {zone_count} zones')
            
            return make_response(True, {
                'status': 'active',
                'zones_count': zone_count,
                'zones': zone_names,
                'message': f'Connected successfully. Found {zone_count} DNS zones.'
            })
        else:
            errors = result.get('errors', [])
            error_msg = errors[0].get('message') if errors else 'Invalid token'
            update_validation_status('setup.cloudflare.api_token', 'error', error_msg)
            return make_response(False, message=f"Verification failed: {error_msg}", status_code=401)
            
    except requests.exceptions.Timeout:
        return make_response(False, message="Connection timed out. Please check your network connection.", status_code=504)
    except requests.exceptions.ConnectionError:
        return make_response(False, message="Could not connect to Cloudflare API. Please check your network.", status_code=503)
    except Exception as e:
        logger.error(f"Error testing Cloudflare: {e}")
        return make_response(False, message=f"Unexpected error: {str(e)}", status_code=500)


@setup_bp.route('/api/setup/test/tailscale', methods=['POST'])
@require_auth
def test_tailscale():
    """
    POST /api/setup/test/tailscale
    Test Tailscale connectivity to configured hosts (only Tailscale/private IPs)
    """
    try:
        data = request.get_json() or {}
        linode_ip = data.get('linode_ip') or get_db_setting('setup.tailscale.linode_ip') or os.environ.get('TAILSCALE_LINODE_HOST', '')
        local_ip = data.get('local_ip') or get_db_setting('setup.tailscale.local_ip') or os.environ.get('TAILSCALE_LOCAL_HOST', '')
        
        if not linode_ip and not local_ip:
            return make_response(False, message="Please enter at least one Tailscale IP address.", status_code=400)
        
        results = {
            'linode': {'ip': linode_ip, 'reachable': False, 'status': 'not_tested'},
            'local': {'ip': local_ip, 'reachable': False, 'status': 'not_tested'}
        }
        
        import socket
        
        for host_key, ip in [('linode', linode_ip), ('local', local_ip)]:
            if ip:
                if not is_valid_tailscale_or_private_ip(ip):
                    results[host_key]['error'] = 'Invalid IP format. Use Tailscale (100.x.x.x) or private network IP.'
                    results[host_key]['status'] = 'invalid'
                    continue
                    
                try:
                    sock = socket.socket(socket.AF_INET, socket.SOCK_STREAM)
                    sock.settimeout(5)
                    result = sock.connect_ex((ip, 22))
                    sock.close()
                    results[host_key]['reachable'] = (result == 0)
                    results[host_key]['status'] = 'reachable' if result == 0 else 'unreachable'
                except socket.timeout:
                    results[host_key]['error'] = 'Connection timed out'
                    results[host_key]['status'] = 'timeout'
                except Exception as e:
                    results[host_key]['error'] = str(e)
                    results[host_key]['status'] = 'error'
        
        success = any(r.get('reachable') for r in results.values())
        
        if success:
            message = "Connectivity test passed. "
            reachable = [k for k, r in results.items() if r.get('reachable')]
            message += f"{', '.join(reachable).title()} host(s) reachable via SSH on port 22."
        else:
            message = "No hosts are reachable. Make sure Tailscale is running and hosts are online."
        
        return make_response(success, data=results, message=message)
        
    except Exception as e:
        logger.error(f"Error testing Tailscale: {e}")
        return make_response(False, message=f"Unexpected error: {str(e)}", status_code=500)


@setup_bp.route('/api/setup/test/ssh', methods=['POST'])
@require_auth
def test_ssh():
    """
    POST /api/setup/test/ssh
    Test SSH connection to fleet hosts (only 'linode' or 'local' allowed)
    """
    try:
        data = request.get_json() or {}
        host_id = data.get('host_id', 'linode')
        
        if host_id not in ALLOWED_HOST_IDS:
            return make_response(False, message=f"Invalid host. Choose from: {', '.join(ALLOWED_HOST_IDS)}", status_code=400)
        
        try:
            from services.fleet_service import fleet_manager
            
            result = fleet_manager.execute_command(host_id, 'echo "SSH connection successful" && hostname', timeout=15)
            
            if result.get('success'):
                hostname = result.get('stdout', '').strip().split('\n')[-1]
                update_validation_status(f'setup.fleet_ssh.{host_id}', 'success', f'Connected to {hostname}')
                
                return make_response(True, {
                    'host_id': host_id,
                    'connected': True,
                    'hostname': hostname,
                    'output': result.get('stdout', '').strip()
                }, message=f"SSH connection to {host_id} ({hostname}) successful!")
            else:
                error = result.get('error', 'Unknown error')
                update_validation_status(f'setup.fleet_ssh.{host_id}', 'error', error)
                
                error_hints = {
                    'No Tailscale IP': 'Configure Tailscale IP addresses first.',
                    'Connection refused': 'SSH service may not be running on the host.',
                    'Permission denied': 'Check SSH key permissions or user credentials.',
                    'timeout': 'Host may be offline or firewall blocking connection.'
                }
                
                hint = next((v for k, v in error_hints.items() if k.lower() in error.lower()), '')
                
                return make_response(False, {
                    'host_id': host_id,
                    'connected': False,
                    'error': error,
                    'hint': hint
                }, message=f"SSH connection failed: {error}. {hint}")
                
        except ImportError:
            return make_response(False, message="Fleet service not available. Restart the dashboard.", status_code=503)
            
    except Exception as e:
        logger.error(f"Error testing SSH: {e}")
        return make_response(False, message=f"Unexpected error: {str(e)}", status_code=500)


@setup_bp.route('/api/setup/test/storage', methods=['POST'])
@require_auth
def test_storage():
    """
    POST /api/setup/test/storage
    Test cloud storage connection (MinIO/S3/B2) - only allowed endpoints
    """
    try:
        data = request.get_json() or {}
        endpoint = data.get('endpoint') or get_db_setting('setup.cloud_storage.endpoint') or os.environ.get('MINIO_ENDPOINT') or os.environ.get('B2_ENDPOINT')
        access_key = data.get('access_key') or get_db_setting('setup.cloud_storage.access_key') or os.environ.get('MINIO_ACCESS_KEY') or os.environ.get('B2_ACCESS_KEY_ID')
        secret_key = data.get('secret_key') or get_db_setting('setup.cloud_storage.secret_key') or os.environ.get('MINIO_SECRET_KEY') or os.environ.get('B2_SECRET_ACCESS_KEY')
        
        if not endpoint:
            return make_response(False, message="Storage endpoint URL is required.", status_code=400)
        if not access_key:
            return make_response(False, message="Access key is required.", status_code=400)
        if not secret_key:
            return make_response(False, message="Secret key is required.", status_code=400)
        
        if not is_safe_storage_endpoint(endpoint):
            return make_response(False, message="Storage endpoint not allowed. Use AWS S3, Backblaze B2, or local MinIO on private network.", status_code=400)
        
        try:
            from minio import Minio
            from urllib.parse import urlparse
            
            parsed = urlparse(endpoint)
            host = parsed.netloc or parsed.path
            secure = parsed.scheme == 'https' if parsed.scheme else True
            
            client = Minio(
                host,
                access_key=access_key,
                secret_key=secret_key,
                secure=secure
            )
            
            buckets = list(client.list_buckets())
            bucket_names = [b.name for b in buckets[:10]]
            
            update_validation_status('setup.cloud_storage.endpoint', 'success', f'Found {len(buckets)} buckets')
            
            return make_response(True, {
                'connected': True,
                'buckets_count': len(buckets),
                'buckets': bucket_names,
                'endpoint': host
            }, message=f"Connected to {host}. Found {len(buckets)} buckets.")
            
        except ImportError:
            return make_response(False, message="MinIO client not installed. Contact administrator.", status_code=503)
        except Exception as e:
            error_msg = str(e)
            if 'Access denied' in error_msg or 'AccessDenied' in error_msg:
                return make_response(False, message="Access denied. Check your access key and secret key.", status_code=401)
            elif 'connection' in error_msg.lower():
                return make_response(False, message=f"Could not connect to {endpoint}. Check the endpoint URL.", status_code=503)
            return make_response(False, message=f"Connection failed: {error_msg}", status_code=400)
            
    except Exception as e:
        logger.error(f"Error testing storage: {e}")
        return make_response(False, message=f"Unexpected error: {str(e)}", status_code=500)


@setup_bp.route('/api/setup/test/openai', methods=['POST'])
@require_auth
def test_openai():
    """
    POST /api/setup/test/openai
    Test OpenAI API connection
    """
    try:
        data = request.get_json() or {}
        api_key = data.get('api_key') or get_db_setting('setup.openai.api_key') or os.environ.get('AI_INTEGRATIONS_OPENAI_API_KEY') or os.environ.get('OPENAI_API_KEY')
        
        if not api_key:
            return make_response(False, message="OpenAI API key is required. Enter your API key or set up the Replit OpenAI integration.", status_code=400)
        
        base_url = os.environ.get('AI_INTEGRATIONS_OPENAI_BASE_URL', 'https://api.openai.com/v1')
        
        response = requests.get(
            f"{base_url}/models",
            headers={
                "Authorization": f"Bearer {api_key}",
                "Content-Type": "application/json"
            },
            timeout=10
        )
        
        if response.status_code == 200:
            result = response.json()
            models = result.get('data', [])
            gpt4_available = any('gpt-4' in m.get('id', '') for m in models)
            gpt4o_available = any('gpt-4o' in m.get('id', '') for m in models)
            
            update_validation_status('setup.openai.api_key', 'success', f'{len(models)} models available')
            
            features = []
            if gpt4o_available:
                features.append('GPT-4o')
            elif gpt4_available:
                features.append('GPT-4')
            features.append(f'{len(models)} models')
            
            return make_response(True, {
                'connected': True,
                'models_count': len(models),
                'gpt4_available': gpt4_available,
                'gpt4o_available': gpt4o_available,
                'using_integration': bool(os.environ.get('AI_INTEGRATIONS_OPENAI_API_KEY'))
            }, message=f"Connected successfully! Available: {', '.join(features)}")
        elif response.status_code == 401:
            update_validation_status('setup.openai.api_key', 'error', 'Invalid API key')
            return make_response(False, message="Invalid API key. Check your key at platform.openai.com", status_code=401)
        elif response.status_code == 429:
            return make_response(False, message="Rate limited. Wait a moment and try again.", status_code=429)
        else:
            return make_response(False, message=f"API error: {response.status_code}. Check your API key.", status_code=response.status_code)
            
    except requests.exceptions.Timeout:
        return make_response(False, message="Connection timed out. Check your network.", status_code=504)
    except requests.exceptions.ConnectionError:
        return make_response(False, message="Could not connect to OpenAI API. Check your network.", status_code=503)
    except Exception as e:
        logger.error(f"Error testing OpenAI: {e}")
        return make_response(False, message=f"Unexpected error: {str(e)}", status_code=500)


@setup_bp.route('/api/setup/save', methods=['POST'])
@require_auth
def save_config():
    """
    POST /api/setup/save
    Save configuration to database
    """
    try:
        data = request.get_json() or {}
        service = data.get('service')
        config = data.get('config', {})
        
        if not service:
            return make_response(False, message="Service name is required", status_code=400)
        
        if service not in SETUP_SERVICES:
            return make_response(False, message=f"Unknown service: {service}", status_code=400)
        
        try:
            from services.db_service import db_service
            from models.settings import SystemSetting
            
            if not db_service.is_available:
                return make_response(False, message="Database not available. Check your database connection.", status_code=503)
            
            with db_service.get_session() as session:
                saved_count = 0
                
                for key, value in config.items():
                    if value:
                        setting_key = f"setup.{service}.{key}"
                        is_secret = key in ['api_token', 'api_key', 'secret_key', 'access_key']
                        
                        SystemSetting.set_value(
                            session, 
                            setting_key, 
                            str(value), 
                            category='setup',
                            is_secret=is_secret
                        )
                        saved_count += 1
                
                session.commit()
            
            logger.info(f"Saved {saved_count} settings for {service}")
            
            return make_response(True, {
                'service': service,
                'saved_count': saved_count
            }, message=f"Configuration saved for {SETUP_SERVICES[service]['name']}")
                
        except Exception as e:
            logger.error(f"Database error saving config: {e}")
            return make_response(False, message=f"Failed to save: {str(e)}", status_code=500)
            
    except Exception as e:
        logger.error(f"Error saving config: {e}")
        return make_response(False, message=f"Unexpected error: {str(e)}", status_code=500)


@setup_bp.route('/api/setup/validate', methods=['POST'])
@require_auth
def validate_setup():
    """
    POST /api/setup/validate
    Validate all configurations and return overall setup status
    """
    try:
        validation_results = {}
        all_valid = True
        required_valid = True
        
        for service_key, service_info in SETUP_SERVICES.items():
            status = get_service_configured_status(service_key)
            is_configured = status.get('configured', False)
            
            validation_results[service_key] = {
                'name': service_info['name'],
                'configured': is_configured,
                'required': service_info['required'],
                'status': 'configured' if is_configured else ('required' if service_info['required'] else 'optional')
            }
            
            if not is_configured:
                all_valid = False
                if service_info['required']:
                    required_valid = False
        
        configured_count = sum(1 for v in validation_results.values() if v['configured'])
        total_count = len(validation_results)
        
        if all_valid:
            message = "All services are configured. Setup is complete!"
        elif required_valid:
            unconfigured = [v['name'] for v in validation_results.values() if not v['configured']]
            message = f"Required services configured. Optional: {', '.join(unconfigured)} not configured."
        else:
            required_missing = [v['name'] for v in validation_results.values() if v['required'] and not v['configured']]
            message = f"Required services not configured: {', '.join(required_missing)}"
        
        return make_response(required_valid, {
            'services': validation_results,
            'summary': {
                'all_configured': all_valid,
                'required_configured': required_valid,
                'configured_count': configured_count,
                'total_count': total_count,
                'percentage': int((configured_count / total_count) * 100) if total_count > 0 else 0
            }
        }, message=message)
        
    except Exception as e:
        logger.error(f"Error validating setup: {e}")
        return make_response(False, message=f"Validation error: {str(e)}", status_code=500)


@setup_bp.route('/api/setup/complete', methods=['POST'])
@require_auth
def complete_setup():
    """
    POST /api/setup/complete
    Mark setup as complete and log the event
    """
    try:
        validation_response = validate_setup()
        validation_data = validation_response[0].get_json()
        
        if not validation_data.get('success'):
            return validation_response
        
        try:
            from services.db_service import db_service
            from models.settings import SystemSetting
            
            if db_service.is_available:
                with db_service.get_session() as session:
                    SystemSetting.set_value(
                        session,
                        'setup.completed',
                        datetime.utcnow().isoformat(),
                        category='setup'
                    )
                    SystemSetting.set_value(
                        session,
                        'setup.completed_percentage',
                        str(validation_data['data']['summary']['percentage']),
                        category='setup'
                    )
                    session.commit()
        except Exception as e:
            logger.warning(f"Could not mark setup complete in DB: {e}")
        
        try:
            from services.activity_service import activity_service
            activity_service.log_activity(
                'system',
                f"Setup wizard completed ({validation_data['data']['summary']['percentage']}% configured)",
                'gear-wide-connected',
                'success'
            )
        except Exception as e:
            logger.warning(f"Could not log setup completion: {e}")
        
        return make_response(True, {
            'completed_at': datetime.utcnow().isoformat(),
            'summary': validation_data['data']['summary']
        }, message="Setup completed successfully! Your dashboard is ready to use.")
        
    except Exception as e:
        logger.error(f"Error completing setup: {e}")
        return make_response(False, message=f"Error completing setup: {str(e)}", status_code=500)


@setup_bp.route('/api/setup/reset/<service>', methods=['POST'])
@require_auth
def reset_service_config(service):
    """
    POST /api/setup/reset/<service>
    Reset configuration for a specific service
    """
    try:
        if service not in SETUP_SERVICES:
            return make_response(False, message=f"Unknown service: {service}", status_code=400)
        
        try:
            from services.db_service import db_service
            from models.settings import SystemSetting
            
            if db_service.is_available:
                with db_service.get_session() as session:
                    settings = session.query(SystemSetting).filter(
                        SystemSetting.key.like(f'setup.{service}.%')
                    ).all()
                    
                    for setting in settings:
                        session.delete(setting)
                    
                    session.commit()
                    
                    return make_response(True, {
                        'service': service,
                        'deleted_count': len(settings)
                    }, message=f"Configuration reset for {SETUP_SERVICES[service]['name']}")
            else:
                return make_response(False, message="Database not available", status_code=503)
                
        except Exception as e:
            logger.error(f"Error resetting config: {e}")
            return make_response(False, message=f"Reset failed: {str(e)}", status_code=500)
            
    except Exception as e:
        logger.error(f"Error in reset_service_config: {e}")
        return make_response(False, message=f"Unexpected error: {str(e)}", status_code=500)


__all__ = ['setup_bp']
