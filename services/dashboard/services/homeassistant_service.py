"""
Real Home Assistant Service Integration
"""
import requests
from typing import List, Dict, Optional
import structlog
import os

logger = structlog.get_logger()

class HomeAssistantService:
    """Real Home Assistant service"""
    
    def __init__(self):
        self.base_url = os.getenv('HOME_ASSISTANT_URL', 'http://localhost:8123')
        self.token = os.getenv('HOME_ASSISTANT_TOKEN')
        self.timeout = 10
        self.session = requests.Session()
        if self.token:
            self.session.headers.update({
                'Authorization': f'Bearer {self.token}',
                'Content-Type': 'application/json'
            })
    
    def is_available(self) -> bool:
        """Check if Home Assistant is available"""
        if not self.token:
            return False
        try:
            resp = self.session.get(f"{self.base_url}/api/", timeout=self.timeout)
            return resp.status_code == 200
        except:
            return False
    
    def get_devices(self) -> List[Dict]:
        """Get all Home Assistant entities"""
        try:
            resp = self.session.get(f"{self.base_url}/api/states", timeout=self.timeout)
            if resp.ok:
                states = resp.json()
                devices = []
                for entity in states:
                    entity_id = entity.get('entity_id', '')
                    domain = entity_id.split('.')[0] if '.' in entity_id else 'unknown'
                    
                    devices.append({
                        'id': entity_id,
                        'name': entity.get('attributes', {}).get('friendly_name', entity_id),
                        'state': entity.get('state'),
                        'type': domain
                    })
                
                return devices
            return []
        except Exception as e:
            logger.error(f"Failed to get devices: {e}")
            return []
    
    def get_automations(self) -> List[Dict]:
        """Get all automations"""
        try:
            resp = self.session.get(f"{self.base_url}/api/states")
            if resp.ok:
                states = resp.json()
                automations = []
                for entity in states:
                    if entity.get('entity_id', '').startswith('automation.'):
                        automations.append({
                            'id': entity.get('entity_id'),
                            'name': entity.get('attributes', {}).get('friendly_name'),
                            'enabled': entity.get('state') == 'on'
                        })
                return automations
            return []
        except Exception as e:
            logger.error(f"Failed to get automations: {e}")
            return []
    
    def get_energy_stats(self) -> Dict:
        """Get energy statistics"""
        return {
            'daily_consumption': 0.0,
            'weekly_consumption': 0.0,
            'cost_today': 0.0,
            'peak_hour': 'N/A - Configure energy monitoring'
        }
    
    def control_device(self, entity_id: str, action: str) -> Dict:
        """Control a device (turn on/off, etc)"""
        try:
            domain = entity_id.split('.')[0] if '.' in entity_id else ''
            
            if action == 'toggle':
                service = 'toggle'
            elif action == 'turn_on':
                service = 'turn_on'
            elif action == 'turn_off':
                service = 'turn_off'
            else:
                return {'success': False, 'message': f'Unknown action: {action}'}
            
            resp = self.session.post(
                f"{self.base_url}/api/services/{domain}/{service}",
                json={'entity_id': entity_id}
            )
            
            if resp.ok:
                return {
                    'success': True,
                    'entity_id': entity_id,
                    'action': action,
                    'message': f'Successfully {action} {entity_id}'
                }
            else:
                return {
                    'success': False,
                    'message': f'Failed: {resp.status_code} - {resp.text}'
                }
                
        except Exception as e:
            logger.error(f"Control device failed: {e}")
            return {
                'success': False,
                'message': f'Error: {str(e)}'
            }
