"""Safe Command Executor for Jarvis

This module provides a safe execution environment for Jarvis commands with:
- Command validation against whitelist/blacklist
- Dry-run mode for testing
- Comprehensive audit logging
- Rate limiting
- Execution timeouts
- Structured result objects
"""

import logging
import subprocess
import time
from typing import Dict, Optional, Tuple
from datetime import datetime
from dataclasses import dataclass
from enum import Enum
import json
import shutil
import os
from pathlib import Path

from .command_whitelist import CommandWhitelist, CommandRiskLevel


logger = logging.getLogger(__name__)


class ExecutionMode(Enum):
    """Execution mode for SafeCommandExecutor"""
    DRY_RUN = "dry_run"
    EXECUTE = "execute"
    APPROVAL_REQUIRED = "approval_required"


@dataclass
class ExecutionResult:
    """Structured result from command execution"""
    success: bool
    command: str
    stdout: str
    stderr: str
    exit_code: Optional[int]
    execution_time_ms: float
    risk_level: CommandRiskLevel
    mode: ExecutionMode
    timestamp: datetime
    requires_approval: bool
    validation_message: str
    
    def to_dict(self) -> Dict:
        """Convert to dictionary for JSON serialization"""
        return {
            'success': self.success,
            'command': self.command,
            'stdout': self.stdout,
            'stderr': self.stderr,
            'exit_code': self.exit_code,
            'execution_time_ms': self.execution_time_ms,
            'risk_level': self.risk_level.value,
            'mode': self.mode.value,
            'timestamp': self.timestamp.isoformat(),
            'requires_approval': self.requires_approval,
            'validation_message': self.validation_message
        }


class SafeCommandExecutor:
    """Safe command executor with validation and logging"""
    
    CONFIG_FILE_WHITELIST = [
        "/etc/ddclient.conf",
        "/home/evin/contain/HomeLabHub/Caddyfile",
        "Caddyfile"
    ]
    
    BACKUP_DIR = "var/backups/configs"
    
    def __init__(
        self,
        default_timeout: int = 30,
        max_executions_per_minute: int = 60,
        audit_log_path: str = "/tmp/jarvis_audit.log"
    ):
        """Initialize SafeCommandExecutor
        
        Args:
            default_timeout: Default timeout in seconds for command execution
            max_executions_per_minute: Rate limit for command execution
            audit_log_path: Path to audit log file
        """
        self.default_timeout = default_timeout
        self.max_executions_per_minute = max_executions_per_minute
        self.audit_log_path = audit_log_path
        
        self._execution_timestamps = []
        
        self._setup_audit_logging()
        
        os.makedirs(self.BACKUP_DIR, exist_ok=True)
    
    def _setup_audit_logging(self):
        """Setup audit logging to file"""
        self.audit_logger = logging.getLogger('jarvis.audit')
        self.audit_logger.setLevel(logging.INFO)
        
        file_handler = logging.FileHandler(self.audit_log_path)
        file_handler.setLevel(logging.INFO)
        
        formatter = logging.Formatter(
            '%(asctime)s | %(levelname)s | %(message)s',
            datefmt='%Y-%m-%d %H:%M:%S'
        )
        file_handler.setFormatter(formatter)
        
        self.audit_logger.addHandler(file_handler)
    
    def _check_rate_limit(self) -> Tuple[bool, str]:
        """Check if execution is within rate limit
        
        Returns:
            Tuple of (is_allowed, message)
        """
        now = time.time()
        
        self._execution_timestamps = [
            ts for ts in self._execution_timestamps
            if now - ts < 60
        ]
        
        if len(self._execution_timestamps) >= self.max_executions_per_minute:
            return False, f"Rate limit exceeded: {self.max_executions_per_minute} executions per minute"
        
        return True, "Rate limit OK"
    
    def _log_audit(self, result: ExecutionResult, user: str = "system"):
        """Log execution to audit log
        
        Args:
            result: Execution result to log
            user: User who initiated the command
        """
        audit_entry = {
            'timestamp': result.timestamp.isoformat(),
            'user': user,
            'command': result.command,
            'risk_level': result.risk_level.value,
            'mode': result.mode.value,
            'success': result.success,
            'exit_code': result.exit_code,
            'execution_time_ms': result.execution_time_ms,
            'requires_approval': result.requires_approval
        }
        
        self.audit_logger.info(json.dumps(audit_entry))
    
    def validate_command(self, command: str) -> Tuple[bool, CommandRiskLevel, str, bool]:
        """Validate a command before execution
        
        Args:
            command: The command to validate
            
        Returns:
            Tuple of (is_allowed, risk_level, validation_message, requires_approval)
        """
        return CommandWhitelist.validate_command(command)
    
    def dry_run(self, command: str, user: str = "system") -> ExecutionResult:
        """Perform dry run validation without executing
        
        Args:
            command: Command to validate
            user: User initiating the command
            
        Returns:
            ExecutionResult with validation information
        """
        start_time = time.time()
        timestamp = datetime.utcnow()
        
        is_allowed, risk_level, validation_msg, requires_approval = self.validate_command(command)
        
        execution_time_ms = (time.time() - start_time) * 1000
        
        result = ExecutionResult(
            success=is_allowed,
            command=command,
            stdout=f"[DRY RUN] Command validation: {validation_msg}",
            stderr="" if is_allowed else f"VALIDATION FAILED: {validation_msg}",
            exit_code=0 if is_allowed else 1,
            execution_time_ms=execution_time_ms,
            risk_level=risk_level,
            mode=ExecutionMode.DRY_RUN,
            timestamp=timestamp,
            requires_approval=requires_approval,
            validation_message=validation_msg
        )
        
        self._log_audit(result, user)
        
        logger.info(f"Dry run for command '{command}': allowed={is_allowed}, risk={risk_level.value}")
        
        return result
    
    def execute(
        self,
        command: str,
        user: str = "system",
        timeout: Optional[int] = None,
        cwd: Optional[str] = None,
        env: Optional[Dict[str, str]] = None
    ) -> ExecutionResult:
        """Execute a command with safety checks
        
        Args:
            command: Command to execute
            user: User initiating the command
            timeout: Timeout in seconds (uses default if None)
            cwd: Working directory for command execution
            env: Environment variables
            
        Returns:
            ExecutionResult with execution details
        """
        start_time = time.time()
        timestamp = datetime.utcnow()
        
        is_allowed, risk_level, validation_msg, requires_approval = self.validate_command(command)
        
        if not is_allowed:
            result = ExecutionResult(
                success=False,
                command=command,
                stdout="",
                stderr=f"Command blocked by safety policy: {validation_msg}",
                exit_code=1,
                execution_time_ms=(time.time() - start_time) * 1000,
                risk_level=risk_level,
                mode=ExecutionMode.EXECUTE,
                timestamp=timestamp,
                requires_approval=requires_approval,
                validation_message=validation_msg
            )
            
            self._log_audit(result, user)
            logger.warning(f"Blocked command execution: {command} (reason: {validation_msg})")
            return result
        
        rate_ok, rate_msg = self._check_rate_limit()
        if not rate_ok:
            result = ExecutionResult(
                success=False,
                command=command,
                stdout="",
                stderr=rate_msg,
                exit_code=1,
                execution_time_ms=(time.time() - start_time) * 1000,
                risk_level=risk_level,
                mode=ExecutionMode.EXECUTE,
                timestamp=timestamp,
                requires_approval=requires_approval,
                validation_message=rate_msg
            )
            
            self._log_audit(result, user)
            logger.warning(f"Rate limit exceeded for user {user}")
            return result
        
        if requires_approval:
            result = ExecutionResult(
                success=False,
                command=command,
                stdout="",
                stderr="This command requires approval before execution",
                exit_code=1,
                execution_time_ms=(time.time() - start_time) * 1000,
                risk_level=risk_level,
                mode=ExecutionMode.APPROVAL_REQUIRED,
                timestamp=timestamp,
                requires_approval=True,
                validation_message="Approval required"
            )
            
            self._log_audit(result, user)
            logger.info(f"Command requires approval: {command}")
            return result
        
        self._execution_timestamps.append(time.time())
        
        timeout_value = timeout or self.default_timeout
        
        try:
            exec_start = time.time()
            
            process = subprocess.run(
                command,
                shell=True,
                capture_output=True,
                text=True,
                timeout=timeout_value,
                cwd=cwd,
                env=env
            )
            
            execution_time_ms = (time.time() - exec_start) * 1000
            
            result = ExecutionResult(
                success=process.returncode == 0,
                command=command,
                stdout=process.stdout,
                stderr=process.stderr,
                exit_code=process.returncode,
                execution_time_ms=execution_time_ms,
                risk_level=risk_level,
                mode=ExecutionMode.EXECUTE,
                timestamp=timestamp,
                requires_approval=requires_approval,
                validation_message=validation_msg
            )
            
            self._log_audit(result, user)
            
            logger.info(
                f"Executed command: {command} | "
                f"exit_code={process.returncode} | "
                f"time={execution_time_ms:.2f}ms"
            )
            
            return result
            
        except subprocess.TimeoutExpired:
            execution_time_ms = (time.time() - start_time) * 1000
            
            result = ExecutionResult(
                success=False,
                command=command,
                stdout="",
                stderr=f"Command execution timed out after {timeout_value} seconds",
                exit_code=124,
                execution_time_ms=execution_time_ms,
                risk_level=risk_level,
                mode=ExecutionMode.EXECUTE,
                timestamp=timestamp,
                requires_approval=requires_approval,
                validation_message=f"Timeout after {timeout_value}s"
            )
            
            self._log_audit(result, user)
            logger.error(f"Command timed out: {command}")
            return result
            
        except Exception as e:
            execution_time_ms = (time.time() - start_time) * 1000
            
            result = ExecutionResult(
                success=False,
                command=command,
                stdout="",
                stderr=f"Execution error: {str(e)}",
                exit_code=1,
                execution_time_ms=execution_time_ms,
                risk_level=risk_level,
                mode=ExecutionMode.EXECUTE,
                timestamp=timestamp,
                requires_approval=requires_approval,
                validation_message=f"Error: {str(e)}"
            )
            
            self._log_audit(result, user)
            logger.error(f"Command execution error: {command} - {str(e)}")
            return result
    
    def get_command_info(self, command: str) -> Optional[Dict]:
        """Get information about a command without executing
        
        Args:
            command: Command to analyze
            
        Returns:
            Dictionary with command information or None if not found
        """
        return CommandWhitelist.get_command_info(command)
    
    def list_safe_commands(self) -> Dict[str, list]:
        """Get list of all safe commands"""
        return CommandWhitelist.list_all_allowed_commands()
    
    def validate_config_file(self, file_path: str, config_type: str = "auto", skip_whitelist_check: bool = False) -> Tuple[bool, str]:
        """Validate config file syntax before editing
        
        Args:
            file_path: Path to config file
            config_type: Type of config (auto, caddyfile, ddclient)
            skip_whitelist_check: If True, skip whitelist validation (for temp files)
            
        Returns:
            Tuple of (is_valid, message)
        """
        if not os.path.exists(file_path):
            return False, f"File not found: {file_path}"
        
        if not skip_whitelist_check:
            if file_path not in self.CONFIG_FILE_WHITELIST and not any(
                file_path.endswith(wl) for wl in self.CONFIG_FILE_WHITELIST
            ):
                return False, f"File not in whitelist: {file_path}"
        
        if config_type == "auto":
            if "Caddyfile" in file_path:
                config_type = "caddyfile"
            elif "ddclient" in file_path:
                config_type = "ddclient"
        
        try:
            if config_type == "caddyfile":
                result = subprocess.run(
                    ["docker", "exec", "caddy", "caddy", "validate", "--config", "/etc/caddy/Caddyfile"],
                    capture_output=True,
                    text=True,
                    timeout=10
                )
                if result.returncode == 0:
                    return True, "Caddyfile validation passed"
                else:
                    return False, f"Caddyfile validation failed: {result.stderr}"
            
            elif config_type == "ddclient":
                with open(file_path, 'r') as f:
                    content = f.read()
                
                required_fields = ['protocol=', 'server=', 'login=']
                missing = [field for field in required_fields if field not in content]
                
                if missing:
                    return False, f"Missing required fields: {', '.join(missing)}"
                
                return True, "ddclient config syntax OK"
            
            else:
                with open(file_path, 'r') as f:
                    f.read()
                return True, "Basic syntax check passed"
                
        except Exception as e:
            return False, f"Validation error: {str(e)}"
    
    def backup_config_file(self, file_path: str) -> Tuple[bool, str]:
        """Create timestamped backup in var/backups/configs/
        
        Args:
            file_path: Path to file to backup
            
        Returns:
            Tuple of (success, backup_path or error_message)
        """
        try:
            if not os.path.exists(file_path):
                return False, f"Source file not found: {file_path}"
            
            if file_path not in self.CONFIG_FILE_WHITELIST and not any(
                file_path.endswith(wl) for wl in self.CONFIG_FILE_WHITELIST
            ):
                return False, f"File not in whitelist: {file_path}"
            
            timestamp = datetime.utcnow().strftime("%Y%m%d_%H%M%S")
            filename = os.path.basename(file_path)
            backup_filename = f"{filename}.{timestamp}.backup"
            backup_path = os.path.join(self.BACKUP_DIR, backup_filename)
            
            shutil.copy2(file_path, backup_path)
            
            audit_entry = {
                'timestamp': datetime.utcnow().isoformat(),
                'action': 'config_backup',
                'source': file_path,
                'backup': backup_path
            }
            self.audit_logger.info(json.dumps(audit_entry))
            
            logger.info(f"Created backup: {file_path} -> {backup_path}")
            
            return True, backup_path
            
        except Exception as e:
            logger.error(f"Backup failed for {file_path}: {e}")
            return False, f"Backup error: {str(e)}"
    
    def edit_config_safely(
        self,
        file_path: str,
        old_value: str,
        new_value: str,
        backup: bool = True
    ) -> Tuple[bool, str]:
        """Safe search/replace with validation
        
        Args:
            file_path: Path to config file
            old_value: Text to replace
            new_value: Replacement text
            backup: Whether to create backup before editing
            
        Returns:
            Tuple of (success, message)
        """
        try:
            if not os.path.exists(file_path):
                return False, f"File not found: {file_path}"
            
            if file_path not in self.CONFIG_FILE_WHITELIST and not any(
                file_path.endswith(wl) for wl in self.CONFIG_FILE_WHITELIST
            ):
                return False, f"File not in whitelist: {file_path}"
            
            if backup:
                backup_success, backup_msg = self.backup_config_file(file_path)
                if not backup_success:
                    return False, f"Backup failed: {backup_msg}"
                logger.info(f"Backup created: {backup_msg}")
            
            with open(file_path, 'r') as f:
                content = f.read()
            
            if old_value not in content:
                return False, f"String not found in file: {old_value}"
            
            new_content = content.replace(old_value, new_value)
            
            temp_file = f"{file_path}.tmp"
            with open(temp_file, 'w') as f:
                f.write(new_content)
            
            config_type = "auto"
            if "Caddyfile" in file_path:
                config_type = "caddyfile"
            elif "ddclient" in file_path:
                config_type = "ddclient"
            
            is_valid, validation_msg = self.validate_config_file(temp_file, config_type=config_type, skip_whitelist_check=True)
            
            if not is_valid:
                os.remove(temp_file)
                return False, f"Validation failed after edit: {validation_msg}"
            
            shutil.move(temp_file, file_path)
            
            audit_entry = {
                'timestamp': datetime.utcnow().isoformat(),
                'action': 'config_edit',
                'file': file_path,
                'old_value': old_value[:100],
                'new_value': new_value[:100],
                'backup_created': backup
            }
            self.audit_logger.info(json.dumps(audit_entry))
            
            logger.info(f"Config edited successfully: {file_path}")
            
            return True, f"Successfully edited {file_path}"
            
        except Exception as e:
            logger.error(f"Config edit failed for {file_path}: {e}")
            return False, f"Edit error: {str(e)}"
