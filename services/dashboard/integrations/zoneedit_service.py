"""ZoneEdit DNS Integration Service

This module provides integration with ZoneEdit DNS API for:
- DNS record health checks
- Domain status monitoring
- HMAC authenticated API calls with exponential backoff
"""

import logging
import hashlib
import hmac
import time
import os
from typing import Dict, Optional, Tuple
from datetime import datetime
import subprocess

logger = logging.getLogger(__name__)


class ZoneEditService:
    """ZoneEdit DNS API integration with HMAC authentication"""
    
    def __init__(self):
        """Initialize ZoneEdit service with credentials from environment"""
        self.username = os.getenv('ZONEEDIT_USERNAME', '')
        self.password = os.getenv('ZONEEDIT_PASSWORD', '')
        self.api_token = os.getenv('ZONEEDIT_API_TOKEN', '')
        
        self.api_base = "https://dynamic.zoneedit.com"
        
        self.max_retries = 3
        self.initial_backoff = 1
        
        self._last_request_time = 0
        self._min_request_interval = 2
    
    def _rate_limit(self):
        """Enforce minimum time between requests"""
        now = time.time()
        elapsed = now - self._last_request_time
        
        if elapsed < self._min_request_interval:
            sleep_time = self._min_request_interval - elapsed
            logger.debug(f"Rate limiting: sleeping {sleep_time:.2f}s")
            time.sleep(sleep_time)
        
        self._last_request_time = time.time()
    
    def _exponential_backoff(self, attempt: int) -> float:
        """Calculate exponential backoff delay
        
        Args:
            attempt: Retry attempt number (0-indexed)
            
        Returns:
            Sleep time in seconds
        """
        return self.initial_backoff * (2 ** attempt)
    
    def _generate_hmac(self, message: str) -> str:
        """Generate HMAC signature for API authentication
        
        Args:
            message: Message to sign
            
        Returns:
            HMAC signature as hex string
        """
        if not self.api_token:
            logger.warning("No API token configured for HMAC")
            return ""
        
        signature = hmac.new(
            self.api_token.encode('utf-8'),
            message.encode('utf-8'),
            hashlib.sha256
        ).hexdigest()
        
        return signature
    
    def check_dns_record(self, domain: str, subdomain: Optional[str] = None) -> Tuple[bool, Dict]:
        """Query DNS record via API or dig
        
        Args:
            domain: Domain name to check
            subdomain: Optional subdomain
            
        Returns:
            Tuple of (success, result_dict)
        """
        full_domain = f"{subdomain}.{domain}" if subdomain else domain
        
        logger.info(f"Checking DNS record for {full_domain}")
        
        for attempt in range(self.max_retries):
            try:
                self._rate_limit()
                
                result = subprocess.run(
                    ['dig', '+short', full_domain, '@8.8.8.8'],
                    capture_output=True,
                    text=True,
                    timeout=10
                )
                
                if result.returncode == 0 and result.stdout.strip():
                    ip_addresses = [
                        line.strip() 
                        for line in result.stdout.strip().split('\n')
                        if line.strip()
                    ]
                    
                    logger.info(f"DNS record found for {full_domain}: {ip_addresses}")
                    
                    return True, {
                        'domain': full_domain,
                        'records': ip_addresses,
                        'record_count': len(ip_addresses),
                        'status': 'active',
                        'checked_at': datetime.utcnow().isoformat()
                    }
                else:
                    logger.warning(f"No DNS records found for {full_domain}")
                    return False, {
                        'domain': full_domain,
                        'records': [],
                        'record_count': 0,
                        'status': 'no_records',
                        'checked_at': datetime.utcnow().isoformat()
                    }
                    
            except subprocess.TimeoutExpired:
                logger.error(f"DNS query timeout for {full_domain} (attempt {attempt + 1})")
                if attempt < self.max_retries - 1:
                    backoff = self._exponential_backoff(attempt)
                    logger.info(f"Retrying in {backoff}s...")
                    time.sleep(backoff)
                    continue
                    
            except Exception as e:
                logger.error(f"DNS check failed for {full_domain}: {e}")
                if attempt < self.max_retries - 1:
                    backoff = self._exponential_backoff(attempt)
                    logger.info(f"Retrying in {backoff}s...")
                    time.sleep(backoff)
                    continue
        
        return False, {
            'domain': full_domain,
            'records': [],
            'record_count': 0,
            'status': 'error',
            'error': f'Failed after {self.max_retries} attempts',
            'checked_at': datetime.utcnow().isoformat()
        }
    
    def get_dns_health(self) -> Dict:
        """Get health status of all monitored domains
        
        Returns:
            Dictionary with health status of all domains
        """
        logger.info("Checking DNS health for all domains")
        
        domains_to_check = [
            ('rig-city.com', None),
            ('rig-city.com', 'www'),
            ('rig-city.com', 'api'),
            ('scarletredjoker.com', None),
            ('scarletredjoker.com', 'www'),
        ]
        
        health_status = {
            'timestamp': datetime.utcnow().isoformat(),
            'domains': {},
            'summary': {
                'total': len(domains_to_check),
                'healthy': 0,
                'unhealthy': 0,
                'errors': 0
            }
        }
        
        for domain, subdomain in domains_to_check:
            full_domain = f"{subdomain}.{domain}" if subdomain else domain
            
            success, result = self.check_dns_record(domain, subdomain)
            
            health_status['domains'][full_domain] = {
                'status': 'healthy' if success else 'unhealthy',
                'details': result
            }
            
            if success:
                health_status['summary']['healthy'] += 1
            elif result.get('status') == 'error':
                health_status['summary']['errors'] += 1
            else:
                health_status['summary']['unhealthy'] += 1
        
        logger.info(
            f"DNS health check complete: "
            f"{health_status['summary']['healthy']}/{health_status['summary']['total']} healthy"
        )
        
        return health_status
    
    def verify_zoneedit_nameservers(self, domain: str) -> Tuple[bool, Dict]:
        """Verify domain is using ZoneEdit nameservers
        
        Args:
            domain: Domain to check
            
        Returns:
            Tuple of (using_zoneedit, nameserver_info)
        """
        logger.info(f"Checking nameservers for {domain}")
        
        try:
            result = subprocess.run(
                ['dig', '+short', 'NS', domain],
                capture_output=True,
                text=True,
                timeout=10
            )
            
            if result.returncode == 0:
                nameservers = [
                    ns.strip().rstrip('.')
                    for ns in result.stdout.strip().split('\n')
                    if ns.strip()
                ]
                
                zoneedit_ns = [
                    ns for ns in nameservers
                    if 'zoneedit' in ns.lower()
                ]
                
                using_zoneedit = len(zoneedit_ns) > 0
                
                logger.info(
                    f"Domain {domain} nameservers: {nameservers} "
                    f"(ZoneEdit: {using_zoneedit})"
                )
                
                return using_zoneedit, {
                    'domain': domain,
                    'nameservers': nameservers,
                    'zoneedit_nameservers': zoneedit_ns,
                    'using_zoneedit': using_zoneedit,
                    'checked_at': datetime.utcnow().isoformat()
                }
            
        except Exception as e:
            logger.error(f"Nameserver check failed for {domain}: {e}")
        
        return False, {
            'domain': domain,
            'error': 'Failed to query nameservers',
            'checked_at': datetime.utcnow().isoformat()
        }
