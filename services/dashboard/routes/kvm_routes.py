"""
KVM Gaming Management Routes
Windows VM control with GPU passthrough for gaming/productivity mode switching

Communication priority:
1. Windows HTTP Agent (port 8765) - fastest, most reliable
2. SSH fallback - if agent unavailable
3. Manual instructions - if nothing works
"""
import os
import logging
import re
import json
import subprocess
from typing import Optional, Dict, Any, Tuple
from urllib.request import urlopen, Request
from urllib.error import URLError, HTTPError

from flask import Blueprint, jsonify, request, render_template
from utils.auth import require_auth, require_web_auth
from utils.rbac import require_permission
from models.rbac import Permission
from services.fleet_service import fleet_manager

logger = logging.getLogger(__name__)

kvm_bp = Blueprint('kvm', __name__, url_prefix='/kvm')

HOST_ID = 'local'
AGENT_PORT = int(os.environ.get('KVM_AGENT_PORT', '8765'))
AGENT_TIMEOUT = 5
CONFIG_FILE = os.environ.get('KVM_CONFIG_FILE', '/etc/kvm-orchestrator.conf')


def load_kvm_config() -> Dict[str, str]:
    """Load KVM configuration from file or environment"""
    config = {
        'vm_name': os.environ.get('KVM_VM_NAME', ''),
        'vm_ip': os.environ.get('WINDOWS_VM_IP', ''),
    }
    
    for config_path in [CONFIG_FILE, os.path.expanduser('~/.kvm-orchestrator.conf')]:
        if os.path.exists(config_path):
            try:
                with open(config_path, 'r') as f:
                    for line in f:
                        line = line.strip()
                        if line and not line.startswith('#') and '=' in line:
                            key, value = line.split('=', 1)
                            key = key.strip().lower()
                            value = value.strip().strip('"\'')
                            if key == 'vm_name' and value:
                                config['vm_name'] = value
                            elif key == 'vm_ip' and value:
                                config['vm_ip'] = value
            except Exception as e:
                logger.warning(f"Could not read config from {config_path}: {e}")
    
    if not config['vm_name']:
        config['vm_name'] = 'win11'
    
    return config


def get_windows_ssh_config() -> Dict[str, str]:
    """Get Windows VM SSH configuration from environment"""
    config = load_kvm_config()
    return {
        'ip': config['vm_ip'] or os.environ.get('WINDOWS_VM_IP', '192.168.122.250'),
        'user': os.environ.get('WINDOWS_VM_USER', 'Administrator'),
        'ssh_key': os.environ.get('WINDOWS_VM_SSH_KEY', '~/.ssh/id_rsa'),
        'known_hosts': os.environ.get('WINDOWS_VM_KNOWN_HOSTS', '~/.ssh/known_hosts'),
    }


def call_windows_agent(endpoint: str, method: str = 'GET', timeout: int = AGENT_TIMEOUT) -> Tuple[bool, Optional[Dict], str]:
    """
    Call the Windows HTTP agent
    Returns: (success, data, message)
    """
    config = load_kvm_config()
    vm_ip = config.get('vm_ip')
    
    if not vm_ip:
        return False, None, "VM IP not configured"
    
    url = f"http://{vm_ip}:{AGENT_PORT}{endpoint}"
    
    try:
        req = Request(url, method=method)
        req.add_header('Content-Type', 'application/json')
        
        with urlopen(req, timeout=timeout) as response:
            data = json.loads(response.read().decode('utf-8'))
            return True, data, "Agent responded"
            
    except HTTPError as e:
        try:
            error_data = json.loads(e.read().decode('utf-8'))
            return False, error_data, f"Agent error: {e.code}"
        except:
            return False, None, f"Agent HTTP error: {e.code}"
    except URLError as e:
        return False, None, f"Agent unreachable: {e.reason}"
    except Exception as e:
        return False, None, f"Agent error: {str(e)}"


def check_agent_status() -> Dict[str, Any]:
    """Check if Windows agent is responding"""
    success, data, message = call_windows_agent('/health')
    return {
        'available': success,
        'data': data,
        'message': message
    }


def build_secure_ssh_cmd(command: str) -> str:
    """Build a secure SSH command with proper host key checking"""
    cfg = get_windows_ssh_config()
    return f'''ssh -o ConnectTimeout=10 -o UserKnownHostsFile={cfg["known_hosts"]} -i {cfg["ssh_key"]} {cfg["user"]}@{cfg["ip"]} "{command}" 2>&1'''


def make_response(success: bool, data=None, message=None, status_code=200):
    """Create consistent JSON response"""
    response = {'success': success}
    if data is not None:
        response['data'] = data
    if message is not None:
        response['message'] = message
    return jsonify(response), status_code


@kvm_bp.route('/')
@require_web_auth
def kvm_management():
    """Render KVM management page"""
    return render_template('kvm_management.html')


@kvm_bp.route('/api/config', methods=['GET'])
@require_auth
def get_config():
    """Get current KVM configuration"""
    config = load_kvm_config()
    agent_status = check_agent_status()
    
    return make_response(True, {
        'vm_name': config['vm_name'],
        'vm_ip': config['vm_ip'],
        'agent_port': AGENT_PORT,
        'agent_available': agent_status['available'],
        'agent_message': agent_status['message'],
        'config_sources': {
            'file': CONFIG_FILE if os.path.exists(CONFIG_FILE) else None,
            'user_file': os.path.expanduser('~/.kvm-orchestrator.conf') if os.path.exists(os.path.expanduser('~/.kvm-orchestrator.conf')) else None,
        }
    })


@kvm_bp.route('/api/status', methods=['GET'])
@require_auth
def get_vm_status():
    """Get comprehensive Windows VM status"""
    try:
        config = load_kvm_config()
        vm_name = config['vm_name']
        vm_ip = config['vm_ip']
        
        result = fleet_manager.execute_command(
            HOST_ID,
            f'virsh list --all | grep -E "\\s{vm_name}\\s|\\s{vm_name}$"',
            bypass_whitelist=True
        )
        
        output = result.get('output', '').strip()
        vm_state = 'unknown'
        if 'running' in output.lower():
            vm_state = 'running'
        elif 'shut off' in output.lower():
            vm_state = 'stopped'
        elif 'paused' in output.lower():
            vm_state = 'paused'
        elif not output:
            vm_state = 'not_found'
        
        status_data = {
            'vm_name': vm_name,
            'vm_state': vm_state,
            'vm_ip': vm_ip,
            'agent': {'available': False, 'message': 'Not checked'},
            'sunshine': {'responding': False},
            'rdp': {'responding': False},
            'communication_method': 'none',
            'raw_output': output
        }
        
        if vm_state == 'running' and vm_ip:
            agent_check = check_agent_status()
            status_data['agent'] = agent_check
            
            if agent_check['available'] and agent_check.get('data'):
                status_data['communication_method'] = 'http_agent'
                agent_data = agent_check['data']
                
                if 'sunshine' in agent_data:
                    status_data['sunshine'] = {
                        'responding': agent_data['sunshine'].get('running', False),
                        'details': agent_data['sunshine']
                    }
                
                if 'rdp' in agent_data:
                    status_data['rdp'] = {
                        'responding': agent_data['rdp'].get('service_running', False),
                        'enabled': agent_data['rdp'].get('enabled', False),
                        'details': agent_data['rdp']
                    }
                
                if 'gpu' in agent_data:
                    status_data['gpu'] = agent_data['gpu']
            else:
                sunshine_check = fleet_manager.execute_command(
                    HOST_ID,
                    f'nc -z -w 2 {vm_ip} 47989 && echo "open" || echo "closed"',
                    bypass_whitelist=True
                )
                status_data['sunshine']['responding'] = 'open' in sunshine_check.get('output', '')
                
                rdp_check = fleet_manager.execute_command(
                    HOST_ID,
                    f'nc -z -w 2 {vm_ip} 3389 && echo "open" || echo "closed"',
                    bypass_whitelist=True
                )
                status_data['rdp']['responding'] = 'open' in rdp_check.get('output', '')
                status_data['communication_method'] = 'port_scan'
        
        return make_response(True, status_data)
        
    except Exception as e:
        logger.error(f"Error getting VM status: {e}")
        return make_response(False, message=str(e), status_code=500)


@kvm_bp.route('/api/start', methods=['POST'])
@require_auth
@require_permission(Permission.MANAGE_DOCKER)
def start_vm():
    """Start the Windows VM"""
    try:
        config = load_kvm_config()
        vm_name = config['vm_name']
        
        result = fleet_manager.execute_command(
            HOST_ID,
            f'virsh start {vm_name}',
            bypass_whitelist=True
        )
        
        if result.get('success') or 'already active' in result.get('output', '').lower():
            return make_response(True, message=f'VM {vm_name} started successfully')
        else:
            error_msg = result.get('error') or result.get('output', 'Unknown error')
            
            suggestions = []
            if 'already active' in error_msg.lower():
                return make_response(True, message=f'VM {vm_name} is already running')
            if 'domain' in error_msg.lower() and 'not found' in error_msg.lower():
                suggestions.append(f"Run 'kvm-orchestrator.sh discover' to find available VMs")
            if 'gpu' in error_msg.lower() or 'vfio' in error_msg.lower():
                suggestions.append("GPU may be in use. Try: echo 1 | sudo tee /sys/bus/pci/devices/0000:XX:00.0/reset")
            
            return make_response(False, data={'suggestions': suggestions}, message=error_msg, status_code=400)
            
    except Exception as e:
        logger.error(f"Error starting VM: {e}")
        return make_response(False, message=str(e), status_code=500)


@kvm_bp.route('/api/stop', methods=['POST'])
@require_auth
@require_permission(Permission.MANAGE_DOCKER)
def stop_vm():
    """Gracefully shutdown the Windows VM"""
    try:
        config = load_kvm_config()
        vm_name = config['vm_name']
        
        agent_status = check_agent_status()
        if agent_status['available']:
            success, data, msg = call_windows_agent('/shutdown', method='POST', timeout=10)
            if success:
                logger.info("Shutdown initiated via Windows agent")
        
        result = fleet_manager.execute_command(
            HOST_ID,
            f'virsh shutdown {vm_name}',
            bypass_whitelist=True
        )
        
        if result.get('success'):
            return make_response(True, message=f'VM {vm_name} shutdown initiated')
        else:
            return make_response(False, message=result.get('error') or result.get('output'), status_code=400)
            
    except Exception as e:
        logger.error(f"Error stopping VM: {e}")
        return make_response(False, message=str(e), status_code=500)


@kvm_bp.route('/api/force-stop', methods=['POST'])
@require_auth
@require_permission(Permission.MANAGE_DOCKER)
def force_stop_vm():
    """Force stop the Windows VM"""
    try:
        config = load_kvm_config()
        vm_name = config['vm_name']
        
        result = fleet_manager.execute_command(
            HOST_ID,
            f'virsh destroy {vm_name}',
            bypass_whitelist=True
        )
        
        if result.get('success'):
            return make_response(True, message=f'VM {vm_name} force stopped')
        else:
            return make_response(False, message=result.get('error') or result.get('output'), status_code=400)
            
    except Exception as e:
        logger.error(f"Error force stopping VM: {e}")
        return make_response(False, message=str(e), status_code=500)


@kvm_bp.route('/api/restart', methods=['POST'])
@require_auth
@require_permission(Permission.MANAGE_DOCKER)
def restart_vm():
    """Restart the Windows VM"""
    try:
        config = load_kvm_config()
        vm_name = config['vm_name']
        
        result = fleet_manager.execute_command(
            HOST_ID,
            f'virsh reboot {vm_name}',
            bypass_whitelist=True
        )
        
        if result.get('success'):
            return make_response(True, message=f'VM {vm_name} reboot initiated')
        else:
            return make_response(False, message=result.get('error') or result.get('output'), status_code=400)
            
    except Exception as e:
        logger.error(f"Error restarting VM: {e}")
        return make_response(False, message=str(e), status_code=500)


@kvm_bp.route('/api/gpu-status', methods=['GET'])
@require_auth
def get_gpu_status():
    """Get GPU status from Windows agent or host"""
    try:
        agent_status = check_agent_status()
        if agent_status['available'] and agent_status.get('data', {}).get('gpu'):
            gpu_data = agent_status['data']['gpu']
            gpu_data['source'] = 'windows_agent'
            return make_response(True, gpu_data)
        
        result = fleet_manager.execute_command(
            HOST_ID,
            'nvidia-smi --query-gpu=name,temperature.gpu,utilization.gpu,utilization.memory,memory.used,memory.total,power.draw,fan.speed --format=csv,noheader,nounits',
            bypass_whitelist=True
        )
        
        gpu_data = {
            'available': False,
            'source': 'host',
            'name': 'Unknown',
            'temperature': 0,
            'gpu_utilization': 0,
            'memory_utilization': 0,
            'memory_used_mb': 0,
            'memory_total_mb': 0,
            'power_draw_w': 0,
            'fan_speed': 0,
            'vfio_bound': False
        }
        
        if result.get('success') and result.get('output'):
            output = result.get('output', '').strip()
            parts = [p.strip() for p in output.split(',')]
            
            if len(parts) >= 7:
                gpu_data['available'] = True
                gpu_data['name'] = parts[0]
                gpu_data['temperature'] = int(parts[1]) if parts[1].isdigit() else 0
                gpu_data['gpu_utilization'] = int(parts[2]) if parts[2].isdigit() else 0
                gpu_data['memory_utilization'] = int(parts[3]) if parts[3].isdigit() else 0
                gpu_data['memory_used_mb'] = int(float(parts[4])) if parts[4].replace('.', '').isdigit() else 0
                gpu_data['memory_total_mb'] = int(float(parts[5])) if parts[5].replace('.', '').isdigit() else 0
                gpu_data['power_draw_w'] = float(parts[6]) if parts[6].replace('.', '').isdigit() else 0
                if len(parts) >= 8:
                    gpu_data['fan_speed'] = int(parts[7]) if parts[7].isdigit() else 0
        
        vfio_result = fleet_manager.execute_command(
            HOST_ID,
            'lspci -nnk | grep -A3 "NVIDIA" | grep "vfio-pci"',
            bypass_whitelist=True
        )
        gpu_data['vfio_bound'] = bool(vfio_result.get('output', '').strip())
        
        return make_response(True, gpu_data)
        
    except Exception as e:
        logger.error(f"Error getting GPU status: {e}")
        return make_response(False, message=str(e), status_code=500)


@kvm_bp.route('/api/mode', methods=['GET'])
@require_auth
def get_current_mode():
    """Get current mode (gaming/productivity/idle)"""
    try:
        config = load_kvm_config()
        vm_ip = config.get('vm_ip')
        
        mode_data = {
            'mode': 'unknown',
            'sunshine_running': False,
            'rdp_enabled': False,
            'rdp_connected': False,
            'moonlight_connected': False,
            'source': 'none'
        }
        
        if vm_ip:
            agent_status = check_agent_status()
            if agent_status['available'] and agent_status.get('data'):
                mode_data['source'] = 'windows_agent'
                agent_data = agent_status['data']
                
                mode_data['sunshine_running'] = agent_data.get('sunshine', {}).get('running', False)
                mode_data['rdp_enabled'] = agent_data.get('rdp', {}).get('enabled', False)
                mode_data['rdp_connected'] = agent_data.get('rdp', {}).get('active_sessions', 0) > 0
                
                if mode_data['sunshine_running']:
                    mode_data['mode'] = 'gaming'
                elif mode_data['rdp_connected']:
                    mode_data['mode'] = 'productivity'
                else:
                    mode_data['mode'] = 'idle'
                    
                return make_response(True, mode_data)
        
        mode_data['source'] = 'host_detection'
        
        sunshine_result = fleet_manager.execute_command(
            HOST_ID,
            'ss -un | grep ":47998\\|:47999\\|:48000" || echo ""',
            bypass_whitelist=True
        )
        mode_data['moonlight_connected'] = bool(sunshine_result.get('output', '').strip())
        
        if vm_ip:
            sunshine_check = fleet_manager.execute_command(
                HOST_ID,
                f'nc -z -w 2 {vm_ip} 47989 && echo "open" || echo ""',
                bypass_whitelist=True
            )
            mode_data['sunshine_running'] = 'open' in sunshine_check.get('output', '')
            
            rdp_check = fleet_manager.execute_command(
                HOST_ID,
                f'nc -z -w 2 {vm_ip} 3389 && echo "open" || echo ""',
                bypass_whitelist=True
            )
            mode_data['rdp_enabled'] = 'open' in rdp_check.get('output', '')
        
        if mode_data['moonlight_connected'] or mode_data['sunshine_running']:
            mode_data['mode'] = 'gaming'
        elif mode_data['rdp_connected']:
            mode_data['mode'] = 'productivity'
        else:
            mode_data['mode'] = 'idle'
        
        return make_response(True, mode_data)
        
    except Exception as e:
        logger.error(f"Error getting current mode: {e}")
        return make_response(False, message=str(e), status_code=500)


@kvm_bp.route('/api/mode/gaming', methods=['POST'])
@require_auth
@require_permission(Permission.MANAGE_DOCKER)
def switch_to_gaming():
    """Switch to Gaming Mode (Sunshine)"""
    try:
        config = load_kvm_config()
        vm_ip = config.get('vm_ip')
        
        result_data = {
            'mode': 'gaming',
            'method': 'none',
            'actions': [],
            'manual_steps': []
        }
        
        if vm_ip:
            success, data, msg = call_windows_agent('/mode/gaming', method='POST', timeout=15)
            if success:
                result_data['method'] = 'windows_agent'
                result_data['actions'].append('Switched mode via Windows agent')
                result_data['agent_response'] = data
                
                return make_response(True, result_data, message='Switched to Gaming Mode via agent')
        
        script_path = '/opt/homelab/deploy/local/scripts/kvm-orchestrator.sh'
        alt_script_path = os.path.expanduser('~/homelab/deploy/local/scripts/kvm-orchestrator.sh')
        
        for path in [script_path, alt_script_path]:
            script_result = fleet_manager.execute_command(
                HOST_ID,
                f'test -f {path} && bash {path} gaming 2>&1',
                timeout=120,
                bypass_whitelist=True
            )
            
            if script_result.get('success') and script_result.get('output', '').strip():
                result_data['method'] = 'orchestrator_script'
                result_data['actions'].append('Executed kvm-orchestrator.sh gaming')
                result_data['script_output'] = script_result.get('output', '')
                
                return make_response(True, result_data, message='Switched to Gaming Mode via script')
        
        result_data['method'] = 'manual'
        result_data['manual_steps'] = [
            'Windows agent not responding and orchestrator script not found',
            'On your Windows VM:',
            '  1. Disconnect any RDP sessions',
            '  2. Start Sunshine (right-click tray icon → Start)',
            '  3. Connect with Moonlight',
            '',
            f'Install Windows agent for automatic control: http://{vm_ip}:8765/ (if agent installed)',
            'Or run on Windows (Admin PowerShell):',
            '  iwr https://your-server/install-windows-agent.ps1 | iex'
        ]
        
        return make_response(True, result_data, message='Manual steps required - see instructions')
        
    except Exception as e:
        logger.error(f"Error switching to gaming mode: {e}")
        return make_response(False, message=str(e), status_code=500)


@kvm_bp.route('/api/mode/productivity', methods=['POST'])
@require_auth
@require_permission(Permission.MANAGE_DOCKER)
def switch_to_productivity():
    """Switch to Productivity Mode (RDP)"""
    try:
        config = load_kvm_config()
        vm_ip = config.get('vm_ip')
        
        result_data = {
            'mode': 'productivity',
            'method': 'none',
            'actions': [],
            'manual_steps': []
        }
        
        if vm_ip:
            success, data, msg = call_windows_agent('/mode/desktop', method='POST', timeout=15)
            if success:
                result_data['method'] = 'windows_agent'
                result_data['actions'].append('Switched mode via Windows agent')
                result_data['agent_response'] = data
                
                return make_response(True, result_data, message='Switched to Productivity Mode via agent')
        
        script_path = '/opt/homelab/deploy/local/scripts/kvm-orchestrator.sh'
        alt_script_path = os.path.expanduser('~/homelab/deploy/local/scripts/kvm-orchestrator.sh')
        
        for path in [script_path, alt_script_path]:
            script_result = fleet_manager.execute_command(
                HOST_ID,
                f'test -f {path} && bash {path} desktop 2>&1',
                timeout=120,
                bypass_whitelist=True
            )
            
            if script_result.get('success') and script_result.get('output', '').strip():
                result_data['method'] = 'orchestrator_script'
                result_data['actions'].append('Executed kvm-orchestrator.sh desktop')
                result_data['script_output'] = script_result.get('output', '')
                
                return make_response(True, result_data, message='Switched to Productivity Mode via script')
        
        result_data['method'] = 'manual'
        result_data['manual_steps'] = [
            'Windows agent not responding and orchestrator script not found',
            'On your Windows VM:',
            '  1. Stop Sunshine (right-click tray icon → Exit)',
            '  2. Connect via RDP',
            '',
            f'RDP address: {vm_ip or "<vm-ip>"}',
            '',
            'Install Windows agent for automatic control (Admin PowerShell):',
            '  iwr https://your-server/install-windows-agent.ps1 | iex'
        ]
        
        return make_response(True, result_data, message='Manual steps required - see instructions')
        
    except Exception as e:
        logger.error(f"Error switching to productivity mode: {e}")
        return make_response(False, message=str(e), status_code=500)


@kvm_bp.route('/api/diagnose', methods=['POST'])
@require_auth
def diagnose_kvm():
    """Run comprehensive KVM diagnostics"""
    try:
        config = load_kvm_config()
        vm_ip = config.get('vm_ip')
        
        diagnostics: Dict[str, Any] = {
            'checks': [],
            'warnings': [],
            'errors': [],
            'sources': []
        }
        
        if vm_ip:
            success, data, msg = call_windows_agent('/diagnostics', timeout=30)
            if success and data:
                diagnostics['sources'].append('windows_agent')
                diagnostics['windows'] = data
                
                if data.get('hags_enabled'):
                    diagnostics['warnings'].append({
                        'name': 'HAGS Enabled',
                        'status': 'warning',
                        'detail': 'Hardware-Accelerated GPU Scheduling can cause streaming issues'
                    })
                
                if data.get('game_dvr_enabled'):
                    diagnostics['warnings'].append({
                        'name': 'Game DVR Enabled',
                        'status': 'warning',
                        'detail': 'Xbox Game Bar/DVR can interfere with streaming'
                    })
                
                if not data.get('is_high_performance'):
                    diagnostics['warnings'].append({
                        'name': 'Power Plan',
                        'status': 'warning',
                        'detail': 'Not using High Performance power plan'
                    })
            else:
                diagnostics['sources'].append('host_only')
                diagnostics['warnings'].append({
                    'name': 'Windows Agent',
                    'status': 'warning',
                    'detail': f'Agent not responding at {vm_ip}:{AGENT_PORT}. Install for full diagnostics.'
                })
        
        vfio_result = fleet_manager.execute_command(
            HOST_ID,
            'lspci -nnk | grep -A3 "NVIDIA"',
            bypass_whitelist=True
        )
        if vfio_result.get('success'):
            output = vfio_result.get('output', '')
            if 'vfio-pci' in output:
                diagnostics['checks'].append({'name': 'VFIO Binding', 'status': 'ok', 'detail': 'GPU bound to vfio-pci'})
            elif 'nvidia' in output.lower():
                diagnostics['warnings'].append({'name': 'VFIO Binding', 'status': 'warning', 'detail': 'GPU using nvidia driver (not passed through)'})
            else:
                diagnostics['checks'].append({'name': 'VFIO Binding', 'status': 'ok', 'detail': output[:200]})
        
        hugepages_result = fleet_manager.execute_command(
            HOST_ID,
            'cat /proc/meminfo | grep -i huge',
            bypass_whitelist=True
        )
        if hugepages_result.get('success'):
            output = hugepages_result.get('output', '')
            match = re.search(r'HugePages_Total:\s+(\d+)', output)
            if match and int(match.group(1)) > 0:
                diagnostics['checks'].append({'name': 'Hugepages', 'status': 'ok', 'detail': f'Configured: {match.group(1)}'})
            else:
                diagnostics['warnings'].append({'name': 'Hugepages', 'status': 'warning', 'detail': 'Not configured (may affect performance)'})
        
        iommu_result = fleet_manager.execute_command(
            HOST_ID,
            'dmesg | grep -i iommu | head -5',
            bypass_whitelist=True
        )
        if iommu_result.get('success'):
            output = iommu_result.get('output', '').strip()
            if 'iommu' in output.lower():
                diagnostics['checks'].append({'name': 'IOMMU', 'status': 'ok', 'detail': 'IOMMU enabled'})
            else:
                diagnostics['errors'].append({'name': 'IOMMU', 'status': 'error', 'detail': 'IOMMU may not be enabled'})
        
        gpu_result = fleet_manager.execute_command(
            HOST_ID,
            'nvidia-smi --query-gpu=temperature.gpu --format=csv,noheader,nounits 2>/dev/null || echo "N/A"',
            bypass_whitelist=True
        )
        if gpu_result.get('success'):
            temp = gpu_result.get('output', '').strip()
            if temp.isdigit():
                temp_int = int(temp)
                if temp_int < 70:
                    diagnostics['checks'].append({'name': 'GPU Temperature', 'status': 'ok', 'detail': f'{temp}°C'})
                elif temp_int < 85:
                    diagnostics['warnings'].append({'name': 'GPU Temperature', 'status': 'warning', 'detail': f'{temp}°C (getting warm)'})
                else:
                    diagnostics['errors'].append({'name': 'GPU Temperature', 'status': 'error', 'detail': f'{temp}°C (too hot!)'})
        
        return make_response(True, diagnostics)
        
    except Exception as e:
        logger.error(f"Error running diagnostics: {e}")
        return make_response(False, message=str(e), status_code=500)


@kvm_bp.route('/api/logs', methods=['GET'])
@require_auth
def get_vm_logs():
    """Get recent VM-related logs"""
    try:
        result = fleet_manager.execute_command(
            HOST_ID,
            'journalctl -u libvirtd --no-pager -n 50 2>/dev/null || echo "No logs available"',
            bypass_whitelist=True
        )
        
        return make_response(True, {
            'logs': result.get('output', 'No logs available')
        })
        
    except Exception as e:
        logger.error(f"Error getting VM logs: {e}")
        return make_response(False, message=str(e), status_code=500)


@kvm_bp.route('/api/sunshine/restart', methods=['POST'])
@require_auth
@require_permission(Permission.MANAGE_DOCKER)
def restart_sunshine():
    """Restart Sunshine service on Windows VM"""
    try:
        config = load_kvm_config()
        vm_ip = config.get('vm_ip')
        
        if vm_ip:
            success, data, msg = call_windows_agent('/restart-sunshine', method='POST', timeout=30)
            if success:
                return make_response(True, data, message='Sunshine restarted via agent')
        
        ssh_cmd = build_secure_ssh_cmd(
            "powershell -Command \\\"Restart-Service SunshineService -Force; Start-Sleep 3; Get-Service SunshineService | Select-Object Status\\\""
        )
        
        result = fleet_manager.execute_command(
            HOST_ID,
            ssh_cmd,
            timeout=30,
            bypass_whitelist=True
        )
        
        output = result.get('output', '')
        if 'Host key verification failed' in output:
            return make_response(False, 
                data={'suggestions': ['Run: ssh-keyscan -H <WINDOWS_VM_IP> >> ~/.ssh/known_hosts']},
                message='SSH host key not in known_hosts', 
                status_code=400)
        
        if result.get('success'):
            return make_response(True, {'output': output}, message='Sunshine restart initiated via SSH')
        else:
            return make_response(False, 
                data={
                    'manual_steps': [
                        'Could not restart Sunshine automatically',
                        'On Windows, run:',
                        '  Restart-Service SunshineService',
                        'Or right-click Sunshine tray icon → Restart'
                    ]
                },
                message='Manual restart required - see instructions')
            
    except Exception as e:
        logger.error(f"Error restarting Sunshine: {e}")
        return make_response(False, message=str(e), status_code=500)


@kvm_bp.route('/api/agent/install-instructions', methods=['GET'])
@require_auth
def get_agent_install_instructions():
    """Get Windows agent installation instructions"""
    config = load_kvm_config()
    vm_ip = config.get('vm_ip', '<VM_IP>')
    
    instructions = {
        'overview': 'The Windows Agent enables automatic control of gaming/desktop modes from the dashboard.',
        'requirements': [
            'Windows 10/11',
            'Administrator privileges',
            'PowerShell 5.1+',
            'Network access from Linux host to Windows VM on port 8765'
        ],
        'installation': {
            'one_liner': 'iwr https://your-server/deploy/local/scripts/install-windows-agent.ps1 | iex',
            'manual_steps': [
                '1. Copy windows-agent.ps1 and install-windows-agent.ps1 to Windows VM',
                '2. Open PowerShell as Administrator',
                '3. Run: .\\install-windows-agent.ps1',
                '4. Verify: curl http://localhost:8765/health'
            ]
        },
        'verification': {
            'from_windows': 'Invoke-RestMethod http://localhost:8765/health',
            'from_linux': f'curl http://{vm_ip}:8765/health'
        },
        'endpoints': [
            'GET  /health - Health check',
            'GET  /diagnostics - Full diagnostics',
            'POST /mode/gaming - Switch to gaming mode',
            'POST /mode/desktop - Switch to desktop mode',
            'POST /restart-sunshine - Restart Sunshine',
            'POST /shutdown - Shutdown Windows'
        ]
    }
    
    return make_response(True, instructions)


@kvm_bp.route('/api/vnc/status', methods=['GET'])
@require_auth
def get_vnc_status():
    """Get VNC service status on Ubuntu host"""
    try:
        result = fleet_manager.execute_command(
            HOST_ID,
            '''echo "x11vnc: $(systemctl is-active x11vnc 2>/dev/null || echo 'not installed')"; echo "novnc: $(systemctl is-active novnc 2>/dev/null || echo 'not installed')"; echo "port_6080: $(ss -tlnp | grep :6080 | head -1 || echo 'not listening')"''',
            bypass_whitelist=True
        )
        
        output = result.get('output', '')
        status = {
            'x11vnc': 'unknown',
            'novnc': 'unknown',
            'port_listening': False,
            'url': None
        }
        
        if 'x11vnc: active' in output:
            status['x11vnc'] = 'running'
        elif 'x11vnc: inactive' in output:
            status['x11vnc'] = 'stopped'
        elif 'not installed' in output:
            status['x11vnc'] = 'not_installed'
            
        if 'novnc: active' in output:
            status['novnc'] = 'running'
            status['port_listening'] = True
        elif 'novnc: inactive' in output:
            status['novnc'] = 'stopped'
            
        return make_response(True, status)
        
    except Exception as e:
        logger.error(f"Error getting VNC status: {e}")
        return make_response(False, message=str(e), status_code=500)


@kvm_bp.route('/api/vnc/start', methods=['POST'])
@require_auth
@require_permission(Permission.MANAGE_DOCKER)
def start_vnc():
    """Start VNC services on Ubuntu host"""
    try:
        result = fleet_manager.execute_command(
            HOST_ID,
            'sudo systemctl start x11vnc novnc 2>&1; sleep 2; systemctl is-active x11vnc novnc',
            bypass_whitelist=True
        )
        
        return make_response(True, {
            'output': result.get('output', ''),
        }, message='VNC services started')
        
    except Exception as e:
        logger.error(f"Error starting VNC: {e}")
        return make_response(False, message=str(e), status_code=500)


@kvm_bp.route('/api/vnc/stop', methods=['POST'])
@require_auth
@require_permission(Permission.MANAGE_DOCKER)
def stop_vnc():
    """Stop VNC services on Ubuntu host"""
    try:
        result = fleet_manager.execute_command(
            HOST_ID,
            'sudo systemctl stop x11vnc novnc 2>&1',
            bypass_whitelist=True
        )
        
        return make_response(True, {
            'output': result.get('output', ''),
        }, message='VNC services stopped')
        
    except Exception as e:
        logger.error(f"Error stopping VNC: {e}")
        return make_response(False, message=str(e), status_code=500)


__all__ = ['kvm_bp']
