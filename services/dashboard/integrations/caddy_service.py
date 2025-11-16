"""Caddy Integration Service

This module provides integration with Caddy reverse proxy for:
- Certificate status monitoring
- Caddyfile validation
- Safe Caddy restarts with health checks
"""

import logging
import subprocess
import time
from typing import Dict, Optional, Tuple
from datetime import datetime
import re

logger = logging.getLogger(__name__)


class CaddyService:
    """Caddy reverse proxy integration"""
    
    def __init__(self, container_name: str = "caddy"):
        """Initialize Caddy service
        
        Args:
            container_name: Name of Caddy Docker container
        """
        self.container_name = container_name
        self.health_check_timeout = 30
        self.restart_timeout = 60
    
    def _is_container_running(self) -> bool:
        """Check if Caddy container is running
        
        Returns:
            True if container is running
        """
        try:
            result = subprocess.run(
                ['docker', 'inspect', '-f', '{{.State.Running}}', self.container_name],
                capture_output=True,
                text=True,
                timeout=5
            )
            
            return result.returncode == 0 and result.stdout.strip() == 'true'
            
        except Exception as e:
            logger.error(f"Failed to check container status: {e}")
            return False
    
    def get_certificate_status(self, domain: str) -> Tuple[bool, Dict]:
        """Parse docker logs for certificate status
        
        Args:
            domain: Domain to check certificate for
            
        Returns:
            Tuple of (has_valid_cert, cert_info)
        """
        logger.info(f"Checking certificate status for {domain}")
        
        try:
            result = subprocess.run(
                ['docker', 'logs', self.container_name, '--tail', '500'],
                capture_output=True,
                text=True,
                timeout=10
            )
            
            if result.returncode != 0:
                logger.error(f"Failed to get Caddy logs: {result.stderr}")
                return False, {
                    'domain': domain,
                    'status': 'error',
                    'error': 'Failed to retrieve logs',
                    'checked_at': datetime.utcnow().isoformat()
                }
            
            logs = result.stdout + result.stderr
            
            obtained_pattern = rf"certificate.*obtained.*{re.escape(domain)}"
            renewed_pattern = rf"certificate.*renewed.*{re.escape(domain)}"
            error_pattern = rf"error.*{re.escape(domain)}.*certificate"
            
            has_obtained = bool(re.search(obtained_pattern, logs, re.IGNORECASE))
            has_renewed = bool(re.search(renewed_pattern, logs, re.IGNORECASE))
            has_error = bool(re.search(error_pattern, logs, re.IGNORECASE))
            
            recent_logs = logs.split('\n')[-100:]
            cert_logs = [
                line for line in recent_logs
                if domain in line and any(
                    keyword in line.lower()
                    for keyword in ['certificate', 'cert', 'tls', 'ssl']
                )
            ]
            
            status = 'unknown'
            if has_error:
                status = 'error'
            elif has_renewed:
                status = 'renewed'
            elif has_obtained:
                status = 'obtained'
            
            has_valid_cert = (has_obtained or has_renewed) and not has_error
            
            logger.info(
                f"Certificate status for {domain}: {status} "
                f"(valid={has_valid_cert})"
            )
            
            return has_valid_cert, {
                'domain': domain,
                'status': status,
                'has_certificate': has_valid_cert,
                'obtained': has_obtained,
                'renewed': has_renewed,
                'has_errors': has_error,
                'recent_cert_logs': cert_logs[-10:] if cert_logs else [],
                'checked_at': datetime.utcnow().isoformat()
            }
            
        except Exception as e:
            logger.error(f"Certificate status check failed: {e}")
            return False, {
                'domain': domain,
                'status': 'error',
                'error': str(e),
                'checked_at': datetime.utcnow().isoformat()
            }
    
    def validate_caddyfile(self, config_path: str = "/etc/caddy/Caddyfile") -> Tuple[bool, str]:
        """Run docker exec caddy caddy validate
        
        Args:
            config_path: Path to Caddyfile inside container
            
        Returns:
            Tuple of (is_valid, message)
        """
        logger.info(f"Validating Caddyfile at {config_path}")
        
        if not self._is_container_running():
            return False, "Caddy container is not running"
        
        try:
            result = subprocess.run(
                [
                    'docker', 'exec', self.container_name,
                    'caddy', 'validate', '--config', config_path
                ],
                capture_output=True,
                text=True,
                timeout=15
            )
            
            if result.returncode == 0:
                logger.info("Caddyfile validation passed")
                return True, "Caddyfile validation successful"
            else:
                error_msg = result.stderr or result.stdout
                logger.error(f"Caddyfile validation failed: {error_msg}")
                return False, f"Validation failed: {error_msg}"
                
        except subprocess.TimeoutExpired:
            logger.error("Caddyfile validation timed out")
            return False, "Validation timeout"
            
        except Exception as e:
            logger.error(f"Caddyfile validation error: {e}")
            return False, f"Validation error: {str(e)}"
    
    def restart_caddy(self, wait_for_healthy: bool = True) -> Tuple[bool, str]:
        """Safe restart with health check
        
        Args:
            wait_for_healthy: Whether to wait for container to be healthy
            
        Returns:
            Tuple of (success, message)
        """
        logger.info(f"Restarting Caddy container: {self.container_name}")
        
        is_valid, validation_msg = self.validate_caddyfile()
        if not is_valid:
            logger.error(f"Cannot restart - Caddyfile invalid: {validation_msg}")
            return False, f"Restart aborted - invalid config: {validation_msg}"
        
        try:
            result = subprocess.run(
                ['docker', 'restart', self.container_name],
                capture_output=True,
                text=True,
                timeout=self.restart_timeout
            )
            
            if result.returncode != 0:
                error_msg = result.stderr or result.stdout
                logger.error(f"Caddy restart failed: {error_msg}")
                return False, f"Restart failed: {error_msg}"
            
            logger.info(f"Caddy restart command executed successfully")
            
            if wait_for_healthy:
                logger.info("Waiting for Caddy to become healthy...")
                
                for attempt in range(10):
                    time.sleep(3)
                    
                    if self._is_container_running():
                        logger.info("Caddy container is running")
                        
                        health_result = subprocess.run(
                            ['docker', 'logs', self.container_name, '--tail', '50'],
                            capture_output=True,
                            text=True,
                            timeout=5
                        )
                        
                        logs = health_result.stdout + health_result.stderr
                        
                        if 'serving' in logs.lower() or 'started' in logs.lower():
                            logger.info("Caddy is healthy and serving")
                            return True, "Caddy restarted successfully and is healthy"
                        
                        if 'error' in logs.lower() or 'fatal' in logs.lower():
                            logger.error("Caddy started but has errors in logs")
                            return False, "Caddy restarted but reported errors"
                
                logger.warning("Caddy restarted but health check timed out")
                return True, "Caddy restarted (health check timeout)"
            
            return True, "Caddy restarted successfully"
            
        except subprocess.TimeoutExpired:
            logger.error("Caddy restart timed out")
            return False, "Restart timeout"
            
        except Exception as e:
            logger.error(f"Caddy restart error: {e}")
            return False, f"Restart error: {str(e)}"
    
    def get_caddy_status(self) -> Dict:
        """Get comprehensive Caddy status
        
        Returns:
            Dictionary with Caddy status information
        """
        logger.info("Getting comprehensive Caddy status")
        
        is_running = self._is_container_running()
        
        status = {
            'container_name': self.container_name,
            'is_running': is_running,
            'checked_at': datetime.utcnow().isoformat()
        }
        
        if is_running:
            is_valid, validation_msg = self.validate_caddyfile()
            status['config_valid'] = is_valid
            status['validation_message'] = validation_msg
            
            domains_to_check = ['rig-city.com', 'www.rig-city.com']
            status['certificates'] = {}
            
            for domain in domains_to_check:
                has_cert, cert_info = self.get_certificate_status(domain)
                status['certificates'][domain] = cert_info
        
        else:
            status['config_valid'] = False
            status['validation_message'] = 'Container not running'
            status['certificates'] = {}
        
        logger.info(f"Caddy status: running={is_running}")
        
        return status
