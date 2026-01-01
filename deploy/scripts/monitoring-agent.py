#!/usr/bin/env python3
"""
Homelab Monitoring Agent
Lightweight agent that reports server metrics to the Dashboard
Deploy to any server: curl -sSL https://your-dashboard/agent/install.sh | bash
"""
import os
import sys
import json
import time
import socket
import logging
import argparse
import subprocess
from datetime import datetime
from typing import Dict, Any, Optional

try:
    import psutil
    PSUTIL_AVAILABLE = True
except ImportError:
    PSUTIL_AVAILABLE = False

try:
    import requests
    REQUESTS_AVAILABLE = True
except ImportError:
    REQUESTS_AVAILABLE = False

logging.basicConfig(
    level=logging.INFO,
    format='%(asctime)s [%(levelname)s] %(message)s',
    datefmt='%Y-%m-%d %H:%M:%S'
)
logger = logging.getLogger(__name__)

AGENT_VERSION = "1.0.0"
DEFAULT_INTERVAL = 60
DEFAULT_DASHBOARD_URL = os.environ.get('DASHBOARD_URL', 'http://localhost:5000')
DEFAULT_API_KEY = os.environ.get('MONITORING_API_KEY', '')


def get_hostname() -> str:
    """Get the server hostname"""
    return socket.gethostname()


def get_uptime() -> Dict[str, Any]:
    """Get system uptime"""
    if not PSUTIL_AVAILABLE:
        return {'error': 'psutil not available'}
    
    boot_time = datetime.fromtimestamp(psutil.boot_time())
    uptime_seconds = (datetime.now() - boot_time).total_seconds()
    
    days = int(uptime_seconds // 86400)
    hours = int((uptime_seconds % 86400) // 3600)
    minutes = int((uptime_seconds % 3600) // 60)
    
    return {
        'boot_time': boot_time.isoformat(),
        'uptime_seconds': uptime_seconds,
        'uptime_human': f"{days}d {hours}h {minutes}m"
    }


def get_cpu_metrics() -> Dict[str, Any]:
    """Get CPU usage metrics"""
    if not PSUTIL_AVAILABLE:
        return {'error': 'psutil not available'}
    
    cpu_percent = psutil.cpu_percent(interval=1)
    cpu_per_core = psutil.cpu_percent(interval=0.1, percpu=True)
    cpu_freq = psutil.cpu_freq()
    load_avg = psutil.getloadavg() if hasattr(psutil, 'getloadavg') else (0, 0, 0)
    
    return {
        'percent': cpu_percent,
        'per_core': cpu_per_core,
        'cores': psutil.cpu_count(),
        'cores_logical': psutil.cpu_count(logical=True),
        'frequency_mhz': cpu_freq.current if cpu_freq else 0,
        'load_avg_1m': load_avg[0],
        'load_avg_5m': load_avg[1],
        'load_avg_15m': load_avg[2]
    }


def get_memory_metrics() -> Dict[str, Any]:
    """Get RAM usage metrics"""
    if not PSUTIL_AVAILABLE:
        return {'error': 'psutil not available'}
    
    mem = psutil.virtual_memory()
    swap = psutil.swap_memory()
    
    return {
        'ram': {
            'total_gb': round(mem.total / (1024**3), 2),
            'used_gb': round(mem.used / (1024**3), 2),
            'available_gb': round(mem.available / (1024**3), 2),
            'percent': mem.percent
        },
        'swap': {
            'total_gb': round(swap.total / (1024**3), 2),
            'used_gb': round(swap.used / (1024**3), 2),
            'percent': swap.percent
        }
    }


def get_disk_metrics() -> Dict[str, Any]:
    """Get disk usage metrics"""
    if not PSUTIL_AVAILABLE:
        return {'error': 'psutil not available'}
    
    disks = []
    for partition in psutil.disk_partitions(all=False):
        try:
            usage = psutil.disk_usage(partition.mountpoint)
            disks.append({
                'device': partition.device,
                'mountpoint': partition.mountpoint,
                'fstype': partition.fstype,
                'total_gb': round(usage.total / (1024**3), 2),
                'used_gb': round(usage.used / (1024**3), 2),
                'free_gb': round(usage.free / (1024**3), 2),
                'percent': usage.percent
            })
        except (PermissionError, OSError):
            continue
    
    return {'partitions': disks}


def get_network_metrics() -> Dict[str, Any]:
    """Get network I/O metrics"""
    if not PSUTIL_AVAILABLE:
        return {'error': 'psutil not available'}
    
    net_io = psutil.net_io_counters()
    
    return {
        'bytes_sent': net_io.bytes_sent,
        'bytes_recv': net_io.bytes_recv,
        'packets_sent': net_io.packets_sent,
        'packets_recv': net_io.packets_recv,
        'errors_in': net_io.errin,
        'errors_out': net_io.errout
    }


def get_docker_status() -> Dict[str, Any]:
    """Get Docker container status"""
    try:
        result = subprocess.run(
            ['docker', 'ps', '--format', '{{json .}}'],
            capture_output=True, text=True, timeout=10
        )
        if result.returncode != 0:
            return {'error': 'Docker not available or not running'}
        
        containers = []
        for line in result.stdout.strip().split('\n'):
            if line:
                try:
                    container = json.loads(line)
                    containers.append({
                        'id': container.get('ID', ''),
                        'name': container.get('Names', ''),
                        'image': container.get('Image', ''),
                        'status': container.get('Status', ''),
                        'ports': container.get('Ports', '')
                    })
                except json.JSONDecodeError:
                    continue
        
        return {
            'running': len(containers),
            'containers': containers
        }
    except Exception as e:
        return {'error': str(e)}


def get_service_status(services: list) -> Dict[str, Any]:
    """Check status of specific systemd services"""
    results = {}
    for service in services:
        try:
            result = subprocess.run(
                ['systemctl', 'is-active', service],
                capture_output=True, text=True, timeout=5
            )
            results[service] = result.stdout.strip() == 'active'
        except Exception:
            results[service] = None
    return results


def get_temperatures() -> Dict[str, Any]:
    """Get CPU/system temperatures"""
    if not PSUTIL_AVAILABLE:
        return {'error': 'psutil not available'}
    
    try:
        temps = psutil.sensors_temperatures()
        if not temps:
            return {'available': False}
        
        result = {'available': True, 'sensors': {}}
        for name, entries in temps.items():
            result['sensors'][name] = [
                {
                    'label': entry.label or 'Unknown',
                    'current': entry.current,
                    'high': entry.high,
                    'critical': entry.critical
                }
                for entry in entries
            ]
        return result
    except Exception as e:
        return {'error': str(e)}


def collect_all_metrics(include_docker: bool = True) -> Dict[str, Any]:
    """Collect all system metrics"""
    metrics = {
        'timestamp': datetime.utcnow().isoformat(),
        'hostname': get_hostname(),
        'agent_version': AGENT_VERSION,
        'uptime': get_uptime(),
        'cpu': get_cpu_metrics(),
        'memory': get_memory_metrics(),
        'disk': get_disk_metrics(),
        'network': get_network_metrics(),
        'temperatures': get_temperatures()
    }
    
    if include_docker:
        metrics['docker'] = get_docker_status()
    
    return metrics


def send_to_dashboard(metrics: Dict[str, Any], dashboard_url: str, api_key: str) -> bool:
    """Send metrics to the dashboard API"""
    if not REQUESTS_AVAILABLE:
        logger.error("requests library not available - cannot send metrics")
        return False
    
    try:
        headers = {
            'Content-Type': 'application/json',
            'X-API-Key': api_key,
            'X-Agent-Version': AGENT_VERSION
        }
        
        response = requests.post(
            f"{dashboard_url}/api/monitoring/agent/report",
            json=metrics,
            headers=headers,
            timeout=30
        )
        
        if response.status_code == 200:
            logger.info(f"Metrics sent successfully to {dashboard_url}")
            return True
        else:
            logger.error(f"Failed to send metrics: {response.status_code} - {response.text}")
            return False
    except Exception as e:
        logger.error(f"Error sending metrics: {e}")
        return False


def run_agent(dashboard_url: str, api_key: str, interval: int = DEFAULT_INTERVAL):
    """Run the monitoring agent in a loop"""
    logger.info(f"Starting monitoring agent v{AGENT_VERSION}")
    logger.info(f"Hostname: {get_hostname()}")
    logger.info(f"Dashboard URL: {dashboard_url}")
    logger.info(f"Report interval: {interval} seconds")
    
    if not PSUTIL_AVAILABLE:
        logger.error("psutil is not installed. Run: pip install psutil")
        sys.exit(1)
    
    while True:
        try:
            metrics = collect_all_metrics()
            send_to_dashboard(metrics, dashboard_url, api_key)
        except Exception as e:
            logger.error(f"Error collecting/sending metrics: {e}")
        
        time.sleep(interval)


def main():
    parser = argparse.ArgumentParser(description='Homelab Monitoring Agent')
    parser.add_argument('--url', default=DEFAULT_DASHBOARD_URL, help='Dashboard URL')
    parser.add_argument('--key', default=DEFAULT_API_KEY, help='API key for authentication')
    parser.add_argument('--interval', type=int, default=DEFAULT_INTERVAL, help='Report interval in seconds')
    parser.add_argument('--once', action='store_true', help='Collect and print metrics once, then exit')
    parser.add_argument('--json', action='store_true', help='Output as JSON (with --once)')
    
    args = parser.parse_args()
    
    if args.once:
        metrics = collect_all_metrics()
        if args.json:
            print(json.dumps(metrics, indent=2))
        else:
            print(f"Hostname: {metrics['hostname']}")
            print(f"Uptime: {metrics['uptime'].get('uptime_human', 'N/A')}")
            print(f"CPU: {metrics['cpu'].get('percent', 'N/A')}%")
            print(f"Memory: {metrics['memory']['ram'].get('percent', 'N/A')}%")
            for disk in metrics['disk'].get('partitions', []):
                print(f"Disk {disk['mountpoint']}: {disk['percent']}% used")
            if metrics.get('docker', {}).get('running'):
                print(f"Docker containers: {metrics['docker']['running']} running")
        return
    
    if not args.key:
        logger.warning("No API key provided. Set MONITORING_API_KEY env var or use --key")
    
    run_agent(args.url, args.key, args.interval)


if __name__ == '__main__':
    main()
