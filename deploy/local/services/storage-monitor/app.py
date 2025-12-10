#!/usr/bin/env python3
"""
Storage Monitor Service
Monitors disk health via SMART, ZFS pools, and sends alerts
"""

import os
import json
import subprocess
import time
import threading
import logging
from datetime import datetime
from flask import Flask, jsonify
from prometheus_client import Counter, Gauge, generate_latest, CONTENT_TYPE_LATEST
import requests
import schedule

app = Flask(__name__)
logging.basicConfig(level=logging.INFO, format='%(asctime)s - %(levelname)s - %(message)s')
logger = logging.getLogger(__name__)

DISCORD_WEBHOOK_URL = os.environ.get('DISCORD_WEBHOOK_URL', '')
EMAIL_ALERTS = os.environ.get('EMAIL_ALERTS', '')
CHECK_INTERVAL = int(os.environ.get('CHECK_INTERVAL', 3600))
SMART_THRESHOLD_REALLOCATED = int(os.environ.get('SMART_THRESHOLD_REALLOCATED', 5))
SMART_THRESHOLD_PENDING = int(os.environ.get('SMART_THRESHOLD_PENDING', 1))
ZFS_ENABLED = os.environ.get('ZFS_ENABLED', 'false').lower() == 'true'

disk_health_gauge = Gauge('storage_disk_health', 'Disk health status (1=healthy, 0=warning, -1=failing)', ['device', 'model'])
disk_temperature_gauge = Gauge('storage_disk_temperature_celsius', 'Disk temperature in Celsius', ['device'])
disk_reallocated_sectors = Gauge('storage_disk_reallocated_sectors', 'Count of reallocated sectors', ['device'])
disk_pending_sectors = Gauge('storage_disk_pending_sectors', 'Count of pending sectors', ['device'])
zfs_pool_health = Gauge('storage_zfs_pool_health', 'ZFS pool health (1=online, 0=degraded, -1=faulted)', ['pool'])
alert_count = Counter('storage_alerts_total', 'Total storage alerts sent', ['severity'])

disk_status = {}
last_check = None


def run_command(cmd):
    """Run shell command and return output"""
    try:
        result = subprocess.run(cmd, shell=True, capture_output=True, text=True, timeout=60)
        return result.stdout, result.stderr, result.returncode
    except subprocess.TimeoutExpired:
        return '', 'Command timed out', 1
    except Exception as e:
        return '', str(e), 1


def get_disk_list():
    """Discover all disks using lsblk"""
    disks = []
    stdout, _, rc = run_command("lsblk -d -o NAME,TYPE,SIZE,MODEL -J 2>/dev/null")
    if rc == 0 and stdout:
        try:
            data = json.loads(stdout)
            for device in data.get('blockdevices', []):
                if device.get('type') == 'disk':
                    name = device.get('name', '')
                    if name and not name.startswith('loop') and not name.startswith('ram'):
                        disks.append({
                            'name': f"/dev/{name}",
                            'model': device.get('model', 'Unknown').strip() if device.get('model') else 'Unknown',
                            'size': device.get('size', 'Unknown')
                        })
        except json.JSONDecodeError:
            pass

    stdout, _, rc = run_command("ls /dev/disk/by-id/ 2>/dev/null | grep -E '^(ata|scsi|nvme|usb)' | head -20")
    if rc == 0 and stdout:
        for line in stdout.strip().split('\n'):
            if line:
                path = f"/dev/disk/by-id/{line}"
                if not any(d['name'] == path for d in disks):
                    disks.append({'name': path, 'model': line, 'size': 'Unknown'})

    return disks


def check_smart_status(device):
    """Check SMART status for a device"""
    result = {
        'device': device['name'],
        'model': device.get('model', 'Unknown'),
        'size': device.get('size', 'Unknown'),
        'healthy': True,
        'smart_enabled': False,
        'temperature': None,
        'reallocated_sectors': 0,
        'pending_sectors': 0,
        'power_on_hours': None,
        'errors': [],
        'raw_output': ''
    }

    stdout, stderr, rc = run_command(f"smartctl -H {device['name']} 2>/dev/null")
    result['raw_output'] = stdout

    if 'SMART support is: Unavailable' in stdout or 'Device does not support SMART' in stdout:
        result['smart_enabled'] = False
        return result

    result['smart_enabled'] = True

    if 'PASSED' in stdout:
        result['healthy'] = True
    elif 'FAILED' in stdout:
        result['healthy'] = False
        result['errors'].append('SMART overall health test FAILED')

    stdout_attrs, _, _ = run_command(f"smartctl -A {device['name']} 2>/dev/null")

    for line in stdout_attrs.split('\n'):
        if 'Temperature' in line and 'Celsius' in line:
            try:
                parts = line.split()
                for i, part in enumerate(parts):
                    if part.isdigit() and int(part) < 100:
                        result['temperature'] = int(part)
                        break
            except:
                pass

        if 'Reallocated_Sector' in line or 'Reallocated_Event' in line:
            try:
                parts = line.split()
                raw_value = int(parts[-1])
                result['reallocated_sectors'] = raw_value
                if raw_value > SMART_THRESHOLD_REALLOCATED:
                    result['healthy'] = False
                    result['errors'].append(f'High reallocated sectors: {raw_value}')
            except:
                pass

        if 'Current_Pending_Sector' in line:
            try:
                parts = line.split()
                raw_value = int(parts[-1])
                result['pending_sectors'] = raw_value
                if raw_value > SMART_THRESHOLD_PENDING:
                    result['healthy'] = False
                    result['errors'].append(f'Pending sectors detected: {raw_value}')
            except:
                pass

        if 'Power_On_Hours' in line:
            try:
                parts = line.split()
                result['power_on_hours'] = int(parts[-1])
            except:
                pass

    return result


def check_zfs_pools():
    """Check ZFS pool status if enabled"""
    pools = []
    if not ZFS_ENABLED:
        return pools

    stdout, _, rc = run_command("zpool list -H -o name,health,size,alloc,free 2>/dev/null")
    if rc != 0:
        return pools

    for line in stdout.strip().split('\n'):
        if not line:
            continue
        parts = line.split('\t')
        if len(parts) >= 2:
            pool = {
                'name': parts[0],
                'health': parts[1],
                'size': parts[2] if len(parts) > 2 else 'Unknown',
                'allocated': parts[3] if len(parts) > 3 else 'Unknown',
                'free': parts[4] if len(parts) > 4 else 'Unknown'
            }
            pools.append(pool)

            health_value = 1 if pool['health'] == 'ONLINE' else (0 if pool['health'] == 'DEGRADED' else -1)
            zfs_pool_health.labels(pool=pool['name']).set(health_value)

    return pools


def send_discord_alert(title, message, severity='warning'):
    """Send alert to Discord webhook"""
    if not DISCORD_WEBHOOK_URL:
        return

    color = 0xFF0000 if severity == 'critical' else (0xFFA500 if severity == 'warning' else 0x00FF00)

    payload = {
        'embeds': [{
            'title': f"🔴 Storage Alert: {title}" if severity == 'critical' else f"⚠️ Storage Warning: {title}",
            'description': message,
            'color': color,
            'timestamp': datetime.utcnow().isoformat(),
            'footer': {'text': 'HomeLabHub Storage Monitor'}
        }]
    }

    try:
        response = requests.post(DISCORD_WEBHOOK_URL, json=payload, timeout=10)
        if response.status_code == 204:
            alert_count.labels(severity=severity).inc()
            logger.info(f"Discord alert sent: {title}")
        else:
            logger.error(f"Discord alert failed: {response.status_code}")
    except Exception as e:
        logger.error(f"Failed to send Discord alert: {e}")


def run_health_check():
    """Run full storage health check"""
    global disk_status, last_check
    logger.info("Running storage health check...")

    disks = get_disk_list()
    results = []

    for disk in disks:
        status = check_smart_status(disk)
        results.append(status)

        health_value = 1 if status['healthy'] else (-1 if status['errors'] else 0)
        disk_health_gauge.labels(device=status['device'], model=status['model']).set(health_value)

        if status['temperature']:
            disk_temperature_gauge.labels(device=status['device']).set(status['temperature'])

        disk_reallocated_sectors.labels(device=status['device']).set(status['reallocated_sectors'])
        disk_pending_sectors.labels(device=status['device']).set(status['pending_sectors'])

        if not status['healthy']:
            send_discord_alert(
                f"Disk Health Issue: {status['model']}",
                f"**Device:** {status['device']}\n**Issues:**\n" + '\n'.join(f"- {e}" for e in status['errors']),
                'critical' if 'FAILED' in str(status.get('raw_output', '')) else 'warning'
            )

    zfs_pools = check_zfs_pools()
    for pool in zfs_pools:
        if pool['health'] not in ['ONLINE']:
            send_discord_alert(
                f"ZFS Pool Degraded: {pool['name']}",
                f"**Pool:** {pool['name']}\n**Status:** {pool['health']}\n**Size:** {pool['size']}",
                'critical' if pool['health'] == 'FAULTED' else 'warning'
            )

    disk_status = {
        'disks': results,
        'zfs_pools': zfs_pools,
        'timestamp': datetime.utcnow().isoformat()
    }
    last_check = datetime.utcnow()

    logger.info(f"Health check complete. {len(results)} disks, {len(zfs_pools)} ZFS pools checked.")
    return disk_status


def schedule_thread():
    """Background thread for scheduled health checks"""
    schedule.every(CHECK_INTERVAL).seconds.do(run_health_check)
    while True:
        schedule.run_pending()
        time.sleep(60)


@app.route('/health')
def health():
    """Health check endpoint"""
    return jsonify({'status': 'ok', 'last_check': last_check.isoformat() if last_check else None})


@app.route('/status')
def status():
    """Get current disk status"""
    if not disk_status:
        run_health_check()
    return jsonify(disk_status)


@app.route('/check')
def force_check():
    """Force a health check"""
    result = run_health_check()
    return jsonify(result)


@app.route('/disks')
def list_disks():
    """List detected disks"""
    disks = get_disk_list()
    return jsonify({'disks': disks})


@app.route('/metrics')
def metrics():
    """Prometheus metrics endpoint"""
    return generate_latest(), 200, {'Content-Type': CONTENT_TYPE_LATEST}


if __name__ == '__main__':
    logger.info("Starting Storage Monitor Service...")
    run_health_check()

    scheduler = threading.Thread(target=schedule_thread, daemon=True)
    scheduler.start()

    app.run(host='0.0.0.0', port=9634)
