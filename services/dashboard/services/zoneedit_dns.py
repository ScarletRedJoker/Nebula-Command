"""ZoneEdit Dynamic DNS Integration"""
import os
import requests
import logging
from typing import Dict, Optional, List
from datetime import datetime

logger = logging.getLogger(__name__)


class ZoneEditDNS:
    """
    ZoneEdit DNS management service for automatic DNS updates
    Supports dynamic DNS updates for homelab domains
    """
    
    def __init__(self):
        self.username = os.getenv('ZONEEDIT_USERNAME', '')
        self.api_token = os.getenv('ZONEEDIT_API_TOKEN', '')
        self.base_url = 'https://dynamic.zoneedit.com/auth/dynamic.html'
        self.enabled = bool(self.username and self.api_token)
        
        if not self.enabled:
            logger.warning("ZoneEdit DNS not configured - set ZONEEDIT_USERNAME and ZONEEDIT_API_TOKEN")
    
    def update_ip(self, host: str, ip_address: Optional[str] = None) -> Dict:
        """
        Update DNS record with current IP address
        
        Args:
            host: Hostname to update (e.g., 'host.evindrake.net')
            ip_address: IP address (optional, auto-detects if not provided)
        
        Returns:
            Dict with success status and message
        """
        if not self.enabled:
            return {
                'success': False,
                'error': 'ZoneEdit credentials not configured'
            }
        
        try:
            params = {'host': host}
            if ip_address:
                params['dnsto'] = ip_address
            
            response = requests.get(
                self.base_url,
                params=params,
                auth=(self.username, self.api_token),
                timeout=30
            )
            
            response_text = response.text.strip()
            
            if response.status_code == 200:
                if 'SUCCESS' in response_text.upper() or 'UPDATE' in response_text.upper():
                    return {
                        'success': True,
                        'message': f'DNS record updated for {host}',
                        'response': response_text,
                        'timestamp': datetime.utcnow().isoformat()
                    }
                else:
                    return {
                        'success': False,
                        'error': f'Unexpected response: {response_text}'
                    }
            else:
                return {
                    'success': False,
                    'error': f'HTTP {response.status_code}: {response_text}'
                }
        
        except requests.exceptions.Timeout:
            logger.error(f"Timeout updating DNS for {host}")
            return {
                'success': False,
                'error': 'Request timeout - ZoneEdit API not responding'
            }
        except Exception as e:
            logger.error(f"Error updating DNS for {host}: {e}")
            return {
                'success': False,
                'error': str(e)
            }
    
    def bulk_update(self, hosts: List[str], ip_address: Optional[str] = None) -> Dict:
        """
        Update multiple DNS records at once
        
        Args:
            hosts: List of hostnames to update
            ip_address: IP address (optional, auto-detects if not provided)
        
        Returns:
            Dict with results for each host
        """
        if not self.enabled:
            return {
                'success': False,
                'error': 'ZoneEdit credentials not configured'
            }
        
        results = {}
        for host in hosts:
            results[host] = self.update_ip(host, ip_address)
        
        successful = sum(1 for r in results.values() if r.get('success'))
        
        return {
            'success': successful == len(hosts),
            'total': len(hosts),
            'successful': successful,
            'failed': len(hosts) - successful,
            'results': results
        }
    
    def get_current_ip(self) -> Optional[str]:
        """Get current public IP address"""
        try:
            response = requests.get('https://api.ipify.org', timeout=10)
            if response.status_code == 200:
                return response.text.strip()
        except Exception as e:
            logger.error(f"Error getting current IP: {e}")
        return None
    
    def test_connection(self) -> Dict:
        """Test ZoneEdit API connection"""
        if not self.enabled:
            return {
                'success': False,
                'error': 'ZoneEdit credentials not configured',
                'configured': False
            }
        
        try:
            response = requests.get(
                self.base_url,
                auth=(self.username, self.api_token),
                timeout=10
            )
            
            return {
                'success': response.status_code == 200,
                'status_code': response.status_code,
                'configured': True,
                'message': 'ZoneEdit API connection successful' if response.status_code == 200 else 'Authentication failed'
            }
        except Exception as e:
            return {
                'success': False,
                'error': str(e),
                'configured': True
            }
