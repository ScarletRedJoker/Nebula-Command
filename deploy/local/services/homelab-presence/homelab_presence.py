#!/usr/bin/env python3
"""
Homelab Discord Rich Presence

Shows your homelab status as your personal Discord Rich Presence.
Rotates through CPU/Memory, uptime, services online, and current mode.

Requirements:
  pip install pypresence psutil requests

Environment Variables:
  DASHBOARD_URL - URL of your homelab dashboard (default: http://localhost:5000)
  SERVICE_AUTH_TOKEN - Auth token for dashboard API
  DISCORD_CLIENT_ID - Your Discord application client ID (create at discord.com/developers)

Run: python homelab_presence.py
"""

import os
import sys
import time
import signal
import psutil
from datetime import datetime
from typing import Optional, Dict, Any, List

try:
    from pypresence import Presence
except ImportError:
    print("Error: pypresence not installed. Run: pip install pypresence")
    sys.exit(1)

try:
    import requests
except ImportError:
    print("Error: requests not installed. Run: pip install requests")
    sys.exit(1)


DISCORD_CLIENT_ID = os.environ.get('DISCORD_CLIENT_ID', '1234567890')
DASHBOARD_URL = os.environ.get('DASHBOARD_URL', 'http://localhost:5000')
SERVICE_AUTH_TOKEN = os.environ.get('SERVICE_AUTH_TOKEN', 'dev-token')
UPDATE_INTERVAL = 15  # seconds between updates
FETCH_INTERVAL = 60   # seconds between API fetches


class HomelabPresence:
    def __init__(self):
        self.rpc: Optional[Presence] = None
        self.running = True
        self.last_data: Optional[Dict[str, Any]] = None
        self.last_fetch_time = 0
        self.activity_index = 0
        
        signal.signal(signal.SIGINT, self._signal_handler)
        signal.signal(signal.SIGTERM, self._signal_handler)
    
    def _signal_handler(self, signum, frame):
        print("\nShutting down...")
        self.running = False
    
    def connect(self) -> bool:
        """Connect to Discord via IPC."""
        try:
            self.rpc = Presence(DISCORD_CLIENT_ID)
            self.rpc.connect()
            print(f"Connected to Discord (Client ID: {DISCORD_CLIENT_ID})")
            return True
        except Exception as e:
            print(f"Failed to connect to Discord: {e}")
            print("Make sure Discord is running on this machine.")
            return False
    
    def disconnect(self):
        """Disconnect from Discord."""
        if self.rpc:
            try:
                self.rpc.close()
            except:
                pass
    
    def get_local_stats(self) -> Dict[str, Any]:
        """Get local system statistics."""
        try:
            cpu_percent = psutil.cpu_percent(interval=0.1)
            memory = psutil.virtual_memory()
            disk = psutil.disk_usage('/')
            boot_time = datetime.fromtimestamp(psutil.boot_time())
            uptime = datetime.now() - boot_time
            
            days = uptime.days
            hours = uptime.seconds // 3600
            if days > 0:
                uptime_str = f"{days}d {hours}h"
            else:
                minutes = (uptime.seconds % 3600) // 60
                uptime_str = f"{hours}h {minutes}m"
            
            return {
                'cpu': round(cpu_percent, 1),
                'memory': round(memory.percent, 1),
                'disk': round(disk.percent, 1),
                'uptime': uptime_str
            }
        except Exception as e:
            print(f"Error getting local stats: {e}")
            return {'cpu': 0, 'memory': 0, 'disk': 0, 'uptime': 'unknown'}
    
    def fetch_dashboard_data(self) -> Optional[Dict[str, Any]]:
        """Fetch presence data from Dashboard API."""
        try:
            response = requests.get(
                f"{DASHBOARD_URL}/api/homelab/presence",
                headers={'X-Service-Auth': SERVICE_AUTH_TOKEN},
                timeout=10
            )
            if response.status_code == 200:
                return response.json()
            else:
                print(f"Dashboard API error: {response.status_code}")
                return None
        except requests.exceptions.ConnectionError:
            return None
        except Exception as e:
            print(f"Error fetching dashboard data: {e}")
            return None
    
    def get_activities(self) -> List[Dict[str, str]]:
        """Generate list of activities to rotate through."""
        activities = []
        
        local_stats = self.get_local_stats()
        
        if self.last_data:
            mode = self.last_data.get('mode', 'Homelab Active')
            services = self.last_data.get('services', {})
            online_count = services.get('online', 0)
            
            activities.append({
                'state': mode,
                'details': f"{online_count} services online",
                'large_image': 'homelab',
                'large_text': 'Homelab Control Center'
            })
        
        activities.append({
            'state': f"CPU {local_stats['cpu']}% | RAM {local_stats['memory']}%",
            'details': f"Disk {local_stats['disk']}%",
            'large_image': 'server',
            'large_text': 'System Resources'
        })
        
        activities.append({
            'state': f"Uptime: {local_stats['uptime']}",
            'details': 'Running smoothly',
            'large_image': 'uptime',
            'large_text': 'System Uptime'
        })
        
        return activities
    
    def update_presence(self):
        """Update Discord presence with current activity."""
        if not self.rpc:
            return
        
        activities = self.get_activities()
        if not activities:
            return
        
        current = activities[self.activity_index % len(activities)]
        self.activity_index += 1
        
        try:
            self.rpc.update(
                state=current.get('state'),
                details=current.get('details'),
                large_image=current.get('large_image', 'homelab'),
                large_text=current.get('large_text', 'Homelab'),
                start=int(datetime.now().timestamp())
            )
        except Exception as e:
            print(f"Error updating presence: {e}")
    
    def run(self):
        """Main run loop."""
        print("=" * 50)
        print("Homelab Discord Rich Presence")
        print("=" * 50)
        print(f"Dashboard URL: {DASHBOARD_URL}")
        print(f"Update interval: {UPDATE_INTERVAL}s")
        print("=" * 50)
        
        if not self.connect():
            return
        
        print("Presence active! Press Ctrl+C to stop.")
        
        while self.running:
            current_time = time.time()
            
            if current_time - self.last_fetch_time > FETCH_INTERVAL:
                self.last_data = self.fetch_dashboard_data()
                self.last_fetch_time = current_time
                if self.last_data:
                    print(f"Updated from dashboard: {self.last_data.get('mode', 'Unknown')}")
            
            self.update_presence()
            
            time.sleep(UPDATE_INTERVAL)
        
        self.disconnect()
        print("Goodbye!")


def main():
    presence = HomelabPresence()
    presence.run()


if __name__ == '__main__':
    main()
