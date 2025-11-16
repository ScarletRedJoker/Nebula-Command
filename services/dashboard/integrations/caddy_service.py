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
import os
from pathlib import Path
import shutil

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
    
    def generate_domain_config(
        self,
        domain: str,
        target_url: str,
        ssl_enabled: bool = True,
        custom_config: str = None
    ) -> str:
        """Generate Caddyfile snippet for a domain
        
        Args:
            domain: Domain name
            target_url: Target URL for reverse proxy
            ssl_enabled: Enable automatic SSL
            custom_config: Custom Caddy directives
            
        Returns:
            Caddyfile configuration string
        """
        logger.info(f"Generating Caddy config for {domain}")
        
        config_lines = [f"{domain} {{"]
        
        config_lines.append(f"    reverse_proxy {target_url}")
        config_lines.append("    encode gzip")
        config_lines.append("    log {")
        config_lines.append(f"        output file /var/log/caddy/{domain}.log")
        config_lines.append("    }")
        
        if custom_config:
            config_lines.append("")
            config_lines.append("    # Custom configuration")
            for line in custom_config.strip().split('\n'):
                config_lines.append(f"    {line}")
        
        config_lines.append("}")
        
        return '\n'.join(config_lines)
    
    def backup_caddyfile(self, config_path: str = "/etc/caddy/Caddyfile") -> Tuple[bool, str]:
        """Backup Caddyfile with timestamp
        
        Args:
            config_path: Path to Caddyfile inside container
            
        Returns:
            Tuple of (success, backup_path)
        """
        logger.info("Creating Caddyfile backup")
        
        try:
            backup_dir = Path("/tmp/caddy_backups")
            backup_dir.mkdir(exist_ok=True)
            
            timestamp = datetime.utcnow().strftime("%Y%m%d_%H%M%S")
            backup_filename = f"Caddyfile.backup.{timestamp}"
            backup_path = backup_dir / backup_filename
            
            result = subprocess.run(
                ['docker', 'cp', f'{self.container_name}:{config_path}', str(backup_path)],
                capture_output=True,
                text=True,
                timeout=10
            )
            
            if result.returncode != 0:
                logger.error(f"Backup failed: {result.stderr}")
                return False, ""
            
            existing_backups = sorted(backup_dir.glob("Caddyfile.backup.*"))
            if len(existing_backups) > 10:
                for old_backup in existing_backups[:-10]:
                    old_backup.unlink()
                    logger.info(f"Removed old backup: {old_backup}")
            
            logger.info(f"Caddyfile backed up to {backup_path}")
            return True, str(backup_path)
            
        except Exception as e:
            logger.error(f"Backup error: {e}")
            return False, ""
    
    def add_domain_to_caddyfile(
        self,
        domain: str,
        target_url: str,
        ssl_enabled: bool = True,
        custom_config: str = None,
        config_path: str = "/etc/caddy/Caddyfile"
    ) -> Tuple[bool, str]:
        """Add domain configuration to Caddyfile
        
        Args:
            domain: Domain name
            target_url: Target URL for reverse proxy
            ssl_enabled: Enable automatic SSL
            custom_config: Custom Caddy directives
            config_path: Path to Caddyfile inside container
            
        Returns:
            Tuple of (success, message)
        """
        logger.info(f"Adding {domain} to Caddyfile")
        
        backup_success, backup_path = self.backup_caddyfile(config_path)
        if not backup_success:
            return False, "Failed to create backup"
        
        try:
            temp_caddyfile = Path("/tmp/Caddyfile.temp")
            
            result = subprocess.run(
                ['docker', 'cp', f'{self.container_name}:{config_path}', str(temp_caddyfile)],
                capture_output=True,
                text=True,
                timeout=10
            )
            
            if result.returncode != 0:
                logger.error(f"Failed to retrieve Caddyfile: {result.stderr}")
                return False, "Failed to retrieve Caddyfile"
            
            with open(temp_caddyfile, 'r') as f:
                existing_content = f.read()
            
            if domain in existing_content:
                logger.warning(f"Domain {domain} already exists in Caddyfile")
                return False, f"Domain {domain} already configured"
            
            new_config = self.generate_domain_config(domain, target_url, ssl_enabled, custom_config)
            
            updated_content = existing_content.rstrip() + "\n\n" + new_config + "\n"
            
            with open(temp_caddyfile, 'w') as f:
                f.write(updated_content)
            
            copy_result = subprocess.run(
                ['docker', 'cp', str(temp_caddyfile), f'{self.container_name}:{config_path}'],
                capture_output=True,
                text=True,
                timeout=10
            )
            
            if copy_result.returncode != 0:
                logger.error(f"Failed to copy updated Caddyfile: {copy_result.stderr}")
                return False, "Failed to update Caddyfile"
            
            is_valid, validation_msg = self.validate_caddyfile(config_path)
            if not is_valid:
                logger.error(f"New configuration invalid: {validation_msg}")
                self.rollback_caddyfile(backup_path, config_path)
                return False, f"Invalid configuration: {validation_msg}"
            
            temp_caddyfile.unlink()
            
            with open('/tmp/jarvis_audit.log', 'a') as f:
                f.write(f"{datetime.utcnow().isoformat()} - Added domain to Caddy: {domain} -> {target_url}\n")
            
            logger.info(f"Successfully added {domain} to Caddyfile")
            return True, f"Domain {domain} added successfully"
            
        except Exception as e:
            logger.error(f"Error adding domain: {e}")
            if backup_path:
                self.rollback_caddyfile(backup_path, config_path)
            return False, f"Error: {str(e)}"
    
    def remove_domain_from_caddyfile(
        self,
        domain: str,
        config_path: str = "/etc/caddy/Caddyfile"
    ) -> Tuple[bool, str]:
        """Remove domain configuration from Caddyfile
        
        Args:
            domain: Domain name to remove
            config_path: Path to Caddyfile inside container
            
        Returns:
            Tuple of (success, message)
        """
        logger.info(f"Removing {domain} from Caddyfile")
        
        backup_success, backup_path = self.backup_caddyfile(config_path)
        if not backup_success:
            return False, "Failed to create backup"
        
        try:
            temp_caddyfile = Path("/tmp/Caddyfile.temp")
            
            result = subprocess.run(
                ['docker', 'cp', f'{self.container_name}:{config_path}', str(temp_caddyfile)],
                capture_output=True,
                text=True,
                timeout=10
            )
            
            if result.returncode != 0:
                logger.error(f"Failed to retrieve Caddyfile: {result.stderr}")
                return False, "Failed to retrieve Caddyfile"
            
            with open(temp_caddyfile, 'r') as f:
                lines = f.readlines()
            
            new_lines = []
            in_domain_block = False
            brace_count = 0
            removed = False
            
            for line in lines:
                if domain in line and '{' in line:
                    in_domain_block = True
                    removed = True
                    brace_count = 1
                    continue
                
                if in_domain_block:
                    brace_count += line.count('{')
                    brace_count -= line.count('}')
                    
                    if brace_count == 0:
                        in_domain_block = False
                    continue
                
                new_lines.append(line)
            
            if not removed:
                logger.warning(f"Domain {domain} not found in Caddyfile")
                return False, f"Domain {domain} not found"
            
            with open(temp_caddyfile, 'w') as f:
                f.writelines(new_lines)
            
            copy_result = subprocess.run(
                ['docker', 'cp', str(temp_caddyfile), f'{self.container_name}:{config_path}'],
                capture_output=True,
                text=True,
                timeout=10
            )
            
            if copy_result.returncode != 0:
                logger.error(f"Failed to copy updated Caddyfile: {copy_result.stderr}")
                return False, "Failed to update Caddyfile"
            
            is_valid, validation_msg = self.validate_caddyfile(config_path)
            if not is_valid:
                logger.error(f"Configuration invalid after removal: {validation_msg}")
                self.rollback_caddyfile(backup_path, config_path)
                return False, f"Invalid configuration: {validation_msg}"
            
            temp_caddyfile.unlink()
            
            with open('/tmp/jarvis_audit.log', 'a') as f:
                f.write(f"{datetime.utcnow().isoformat()} - Removed domain from Caddy: {domain}\n")
            
            logger.info(f"Successfully removed {domain} from Caddyfile")
            return True, f"Domain {domain} removed successfully"
            
        except Exception as e:
            logger.error(f"Error removing domain: {e}")
            if backup_path:
                self.rollback_caddyfile(backup_path, config_path)
            return False, f"Error: {str(e)}"
    
    def rollback_caddyfile(
        self,
        backup_path: str,
        config_path: str = "/etc/caddy/Caddyfile"
    ) -> Tuple[bool, str]:
        """Restore Caddyfile from backup
        
        Args:
            backup_path: Path to backup file
            config_path: Path to Caddyfile inside container
            
        Returns:
            Tuple of (success, message)
        """
        logger.info(f"Rolling back Caddyfile from {backup_path}")
        
        try:
            if not Path(backup_path).exists():
                return False, "Backup file not found"
            
            result = subprocess.run(
                ['docker', 'cp', backup_path, f'{self.container_name}:{config_path}'],
                capture_output=True,
                text=True,
                timeout=10
            )
            
            if result.returncode != 0:
                logger.error(f"Rollback failed: {result.stderr}")
                return False, f"Rollback failed: {result.stderr}"
            
            is_valid, validation_msg = self.validate_caddyfile(config_path)
            if not is_valid:
                logger.error(f"Rolled back config is invalid: {validation_msg}")
                return False, f"Backup config invalid: {validation_msg}"
            
            logger.info("Caddyfile successfully rolled back")
            return True, "Rollback successful"
            
        except Exception as e:
            logger.error(f"Rollback error: {e}")
            return False, f"Rollback error: {str(e)}"
    
    def reload_caddy(self, config_path: str = "/etc/caddy/Caddyfile") -> Tuple[bool, str]:
        """Reload Caddy configuration without restart
        
        Args:
            config_path: Path to Caddyfile inside container
            
        Returns:
            Tuple of (success, message)
        """
        logger.info("Reloading Caddy configuration")
        
        if not self._is_container_running():
            return False, "Caddy container is not running"
        
        is_valid, validation_msg = self.validate_caddyfile(config_path)
        if not is_valid:
            logger.error(f"Cannot reload - config invalid: {validation_msg}")
            return False, f"Reload aborted - invalid config: {validation_msg}"
        
        try:
            result = subprocess.run(
                ['docker', 'exec', self.container_name, 'caddy', 'reload', '--config', config_path],
                capture_output=True,
                text=True,
                timeout=30
            )
            
            if result.returncode == 0:
                logger.info("Caddy reloaded successfully")
                
                time.sleep(2)
                
                health_check = subprocess.run(
                    ['docker', 'logs', self.container_name, '--tail', '20'],
                    capture_output=True,
                    text=True,
                    timeout=5
                )
                
                logs = health_check.stdout + health_check.stderr
                
                if 'error' in logs.lower() or 'fatal' in logs.lower():
                    logger.warning("Caddy reloaded but has errors in logs")
                    return True, "Reloaded with warnings (check logs)"
                
                return True, "Caddy reloaded successfully"
            else:
                error_msg = result.stderr or result.stdout
                logger.error(f"Caddy reload failed: {error_msg}")
                return False, f"Reload failed: {error_msg}"
                
        except subprocess.TimeoutExpired:
            logger.error("Caddy reload timed out")
            return False, "Reload timeout"
            
        except Exception as e:
            logger.error(f"Caddy reload error: {e}")
            return False, f"Reload error: {str(e)}"
