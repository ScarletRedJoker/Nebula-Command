"""
Jarvis Tool Executor - Autonomous command execution for Jarvis AI
Provides tool definitions and execution for OpenAI function calling
"""
import subprocess
import logging
import json
import re
from typing import Dict, List, Optional, Any
from dataclasses import dataclass
from datetime import datetime

logger = logging.getLogger(__name__)

ALLOWED_GIT_COMMANDS = ['status', 'log', 'diff', 'branch', 'show']
ALLOWED_DOCKER_COMMANDS = ['ps', 'logs', 'inspect', 'stats', 'top']
MAX_OUTPUT_LENGTH = 8000
COMMAND_TIMEOUT = 30

@dataclass
class ToolResult:
    success: bool
    output: str
    error: Optional[str] = None
    execution_time: float = 0.0
    command: str = ""
    host: str = "local"

TOOL_DEFINITIONS = [
    {
        "type": "function",
        "function": {
            "name": "git_status",
            "description": "Check git repository status including uncommitted changes, branch info, and staged files",
            "parameters": {
                "type": "object",
                "properties": {
                    "path": {
                        "type": "string",
                        "description": "Path to git repository (default: current directory)"
                    }
                },
                "required": []
            }
        }
    },
    {
        "type": "function",
        "function": {
            "name": "git_log",
            "description": "View recent git commit history",
            "parameters": {
                "type": "object",
                "properties": {
                    "count": {
                        "type": "integer",
                        "description": "Number of commits to show (default: 10)"
                    },
                    "oneline": {
                        "type": "boolean",
                        "description": "Show compact one-line format"
                    }
                },
                "required": []
            }
        }
    },
    {
        "type": "function",
        "function": {
            "name": "docker_containers",
            "description": "List all Docker containers with their status, names, and resource usage",
            "parameters": {
                "type": "object",
                "properties": {
                    "all": {
                        "type": "boolean",
                        "description": "Show all containers including stopped ones"
                    },
                    "host": {
                        "type": "string",
                        "enum": ["local", "linode", "ubuntu"],
                        "description": "Which host to check (local=current, linode=cloud, ubuntu=local server)"
                    }
                },
                "required": []
            }
        }
    },
    {
        "type": "function",
        "function": {
            "name": "docker_logs",
            "description": "Get logs from a specific Docker container",
            "parameters": {
                "type": "object",
                "properties": {
                    "container": {
                        "type": "string",
                        "description": "Container name or ID"
                    },
                    "tail": {
                        "type": "integer",
                        "description": "Number of lines from end (default: 50)"
                    },
                    "host": {
                        "type": "string",
                        "enum": ["local", "linode", "ubuntu"],
                        "description": "Which host the container is on"
                    }
                },
                "required": ["container"]
            }
        }
    },
    {
        "type": "function",
        "function": {
            "name": "check_service_health",
            "description": "Check health and status of homelab services including response times and error rates",
            "parameters": {
                "type": "object",
                "properties": {
                    "service": {
                        "type": "string",
                        "description": "Specific service to check (e.g., dashboard, discord-bot, plex) or 'all'"
                    }
                },
                "required": []
            }
        }
    },
    {
        "type": "function",
        "function": {
            "name": "analyze_logs",
            "description": "Search and analyze logs for errors, warnings, or specific patterns",
            "parameters": {
                "type": "object",
                "properties": {
                    "service": {
                        "type": "string",
                        "description": "Service name to analyze logs for"
                    },
                    "pattern": {
                        "type": "string",
                        "description": "Pattern or keyword to search for (e.g., 'error', 'failed', 'timeout')"
                    },
                    "lines": {
                        "type": "integer",
                        "description": "Number of log lines to analyze (default: 100)"
                    }
                },
                "required": ["service"]
            }
        }
    },
    {
        "type": "function",
        "function": {
            "name": "system_resources",
            "description": "Check system resource usage including CPU, memory, disk space",
            "parameters": {
                "type": "object",
                "properties": {
                    "host": {
                        "type": "string",
                        "enum": ["local", "linode", "ubuntu"],
                        "description": "Which host to check"
                    }
                },
                "required": []
            }
        }
    },
    {
        "type": "function",
        "function": {
            "name": "fleet_command",
            "description": "Execute a command on a remote fleet host via SSH",
            "parameters": {
                "type": "object",
                "properties": {
                    "host": {
                        "type": "string",
                        "enum": ["linode", "ubuntu"],
                        "description": "Target host"
                    },
                    "command": {
                        "type": "string",
                        "description": "Command to execute (limited to safe read-only operations)"
                    }
                },
                "required": ["host", "command"]
            }
        }
    },
    {
        "type": "function",
        "function": {
            "name": "restart_container",
            "description": "Restart a Docker container to fix issues",
            "parameters": {
                "type": "object",
                "properties": {
                    "container": {
                        "type": "string",
                        "description": "Container name to restart"
                    },
                    "host": {
                        "type": "string",
                        "enum": ["local", "linode", "ubuntu"],
                        "description": "Host where container is running"
                    }
                },
                "required": ["container"]
            }
        }
    },
    {
        "type": "function",
        "function": {
            "name": "network_check",
            "description": "Check network connectivity and DNS resolution",
            "parameters": {
                "type": "object",
                "properties": {
                    "target": {
                        "type": "string",
                        "description": "Target to check (IP, hostname, or URL)"
                    }
                },
                "required": []
            }
        }
    }
]


class JarvisToolExecutor:
    """Executes tools called by Jarvis AI"""
    
    def __init__(self):
        self.fleet_manager = None
        self.docker_service = None
        self._init_services()
    
    def _init_services(self):
        """Initialize required services"""
        try:
            from services.fleet_manager import FleetManager
            self.fleet_manager = FleetManager()
        except Exception as e:
            logger.warning(f"Fleet manager not available: {e}")
        
        try:
            from services.docker_service import DockerService
            self.docker_service = DockerService()
        except Exception as e:
            logger.warning(f"Docker service not available: {e}")
    
    def get_tool_definitions(self) -> List[Dict]:
        """Return OpenAI-compatible tool definitions"""
        return TOOL_DEFINITIONS
    
    def execute_tool(self, tool_name: str, arguments: Dict[str, Any]) -> ToolResult:
        """Execute a tool and return the result"""
        start_time = datetime.now()
        
        try:
            if tool_name == "git_status":
                result = self._git_status(arguments)
            elif tool_name == "git_log":
                result = self._git_log(arguments)
            elif tool_name == "docker_containers":
                result = self._docker_containers(arguments)
            elif tool_name == "docker_logs":
                result = self._docker_logs(arguments)
            elif tool_name == "check_service_health":
                result = self._check_service_health(arguments)
            elif tool_name == "analyze_logs":
                result = self._analyze_logs(arguments)
            elif tool_name == "system_resources":
                result = self._system_resources(arguments)
            elif tool_name == "fleet_command":
                result = self._fleet_command(arguments)
            elif tool_name == "restart_container":
                result = self._restart_container(arguments)
            elif tool_name == "network_check":
                result = self._network_check(arguments)
            else:
                result = ToolResult(
                    success=False,
                    output="",
                    error=f"Unknown tool: {tool_name}"
                )
            
            result.execution_time = (datetime.now() - start_time).total_seconds()
            return result
            
        except Exception as e:
            logger.error(f"Tool execution error for {tool_name}: {e}", exc_info=True)
            return ToolResult(
                success=False,
                output="",
                error=str(e),
                execution_time=(datetime.now() - start_time).total_seconds()
            )
    
    def _run_command(self, cmd: List[str], timeout: int = COMMAND_TIMEOUT) -> ToolResult:
        """Run a local command safely"""
        try:
            result = subprocess.run(
                cmd,
                capture_output=True,
                text=True,
                timeout=timeout,
                cwd="/app" if self._in_docker() else None
            )
            output = result.stdout + result.stderr
            output = self._truncate_output(output)
            output = self._scrub_secrets(output)
            
            return ToolResult(
                success=result.returncode == 0,
                output=output,
                command=" ".join(cmd)
            )
        except subprocess.TimeoutExpired:
            return ToolResult(success=False, output="", error="Command timed out")
        except Exception as e:
            return ToolResult(success=False, output="", error=str(e))
    
    def _in_docker(self) -> bool:
        """Check if running inside Docker"""
        import os
        return os.path.exists('/.dockerenv') or bool(os.environ.get('DOCKER_CONTAINER'))
    
    def _truncate_output(self, output: str) -> str:
        """Truncate output to max length"""
        if len(output) > MAX_OUTPUT_LENGTH:
            return output[:MAX_OUTPUT_LENGTH] + f"\n... (truncated, {len(output) - MAX_OUTPUT_LENGTH} more chars)"
        return output
    
    def _scrub_secrets(self, output: str) -> str:
        """Remove sensitive information from output"""
        patterns = [
            (r'(password|passwd|pwd|secret|token|key|api_key)[\s]*[=:][\s]*[^\s]+', r'\1=***REDACTED***'),
            (r'sk-[a-zA-Z0-9]{20,}', 'sk-***REDACTED***'),
            (r'[a-f0-9]{32,}', '***HASH_REDACTED***'),
        ]
        for pattern, replacement in patterns:
            output = re.sub(pattern, replacement, output, flags=re.IGNORECASE)
        return output
    
    def _git_status(self, args: Dict) -> ToolResult:
        """Execute git status"""
        path = args.get('path', '.')
        return self._run_command(['git', 'status', '-sb'])
    
    def _git_log(self, args: Dict) -> ToolResult:
        """Execute git log"""
        count = args.get('count', 10)
        oneline = args.get('oneline', True)
        
        cmd = ['git', 'log', f'-{count}']
        if oneline:
            cmd.append('--oneline')
        return self._run_command(cmd)
    
    def _docker_containers(self, args: Dict) -> ToolResult:
        """List Docker containers"""
        show_all = args.get('all', True)
        host = args.get('host', 'local')
        
        if host in ['linode', 'ubuntu'] and self.fleet_manager:
            cmd = 'docker ps --format "table {{.Names}}\t{{.Status}}\t{{.Image}}"'
            if show_all:
                cmd = 'docker ps -a --format "table {{.Names}}\t{{.Status}}\t{{.Image}}"'
            return self._fleet_command({'host': host, 'command': cmd})
        else:
            cmd = ['docker', 'ps', '--format', 'table {{.Names}}\t{{.Status}}\t{{.Image}}']
            if show_all:
                cmd.insert(2, '-a')
            return self._run_command(cmd)
    
    def _docker_logs(self, args: Dict) -> ToolResult:
        """Get Docker container logs"""
        container = args.get('container')
        tail = args.get('tail', 50)
        host = args.get('host', 'local')
        
        if not container:
            return ToolResult(success=False, output="", error="Container name required")
        
        if host in ['linode', 'ubuntu'] and self.fleet_manager:
            return self._fleet_command({'host': host, 'command': f'docker logs --tail {tail} {container}'})
        else:
            return self._run_command(['docker', 'logs', '--tail', str(tail), container])
    
    def _check_service_health(self, args: Dict) -> ToolResult:
        """Check service health"""
        service = args.get('service', 'all')
        
        try:
            import requests
            
            services = {
                'dashboard': 'http://localhost:5000/health',
                'discord-bot': 'http://discord-bot:5000/health',
                'stream-bot': 'http://stream-bot:5000/health',
            }
            
            if service != 'all':
                services = {k: v for k, v in services.items() if k == service}
            
            output = "SERVICE HEALTH CHECK\n" + "=" * 40 + "\n"
            
            for name, url in services.items():
                try:
                    resp = requests.get(url, timeout=5)
                    status = "HEALTHY" if resp.ok else f"UNHEALTHY ({resp.status_code})"
                    output += f"{name}: {status}\n"
                except Exception as e:
                    output += f"{name}: UNREACHABLE ({str(e)[:50]})\n"
            
            return ToolResult(success=True, output=output)
        except Exception as e:
            return ToolResult(success=False, output="", error=str(e))
    
    def _analyze_logs(self, args: Dict) -> ToolResult:
        """Analyze logs for patterns"""
        service = args.get('service', 'dashboard')
        pattern = args.get('pattern', 'error|failed|exception')
        lines = args.get('lines', 100)
        host = args.get('host', 'linode')
        
        container_map = {
            'dashboard': 'homelab-dashboard',
            'discord-bot': 'discord-bot',
            'stream-bot': 'stream-bot',
            'celery': 'homelab-celery-worker',
            'redis': 'homelab-redis',
            'postgres': 'homelab-postgres',
            'caddy': 'caddy',
        }
        container = container_map.get(service, service)
        
        if host in ['linode', 'ubuntu'] and self.fleet_manager:
            cmd = f'docker logs --tail {lines} {container} 2>&1 | grep -iE "{pattern}" | tail -30 || echo "No matches found for pattern: {pattern}"'
            return self._fleet_command({'host': host, 'command': cmd})
        else:
            result = self._run_command(['docker', 'logs', '--tail', str(lines), container])
            if result.success and pattern:
                import re
                filtered = [l for l in result.output.split('\n') if re.search(pattern, l, re.IGNORECASE)]
                result.output = '\n'.join(filtered[-30:]) if filtered else f"No matches found for pattern: {pattern}"
            return result
    
    def _system_resources(self, args: Dict) -> ToolResult:
        """Check system resources"""
        host = args.get('host', 'local')
        
        cmd = "echo '=== CPU ===' && top -bn1 | head -5 && echo '=== MEMORY ===' && free -h && echo '=== DISK ===' && df -h /"
        
        if host in ['linode', 'ubuntu'] and self.fleet_manager:
            return self._fleet_command({'host': host, 'command': cmd})
        else:
            container_cmd = (
                "echo '=== DOCKER STATS ===' && docker stats --no-stream --format 'table {{.Name}}\t{{.CPUPerc}}\t{{.MemUsage}}' 2>/dev/null | head -15 && "
                "echo '=== DISK ===' && df -h / 2>/dev/null || echo 'Disk info unavailable'"
            )
            return self._run_command(['bash', '-c', container_cmd])
    
    def _fleet_command(self, args: Dict) -> ToolResult:
        """Execute command on fleet host"""
        host = args.get('host')
        command = args.get('command')
        
        if not host or not command:
            return ToolResult(success=False, output="", error="Host and command required")
        
        dangerous_patterns = ['rm -rf', 'mkfs', 'dd if=', ':(){', 'chmod 777', '> /dev/', 'shutdown', 'reboot']
        for pattern in dangerous_patterns:
            if pattern in command.lower():
                return ToolResult(success=False, output="", error=f"Blocked dangerous command pattern: {pattern}")
        
        if self.fleet_manager:
            try:
                result = self.fleet_manager.execute_command(host, command)
                return ToolResult(
                    success=result.get('success', False),
                    output=self._truncate_output(self._scrub_secrets(result.get('output', ''))),
                    error=result.get('error'),
                    host=host,
                    command=command
                )
            except Exception as e:
                return ToolResult(success=False, output="", error=str(e), host=host)
        else:
            return ToolResult(success=False, output="", error="Fleet manager not available")
    
    def _restart_container(self, args: Dict) -> ToolResult:
        """Restart a Docker container"""
        container = args.get('container')
        host = args.get('host', 'local')
        
        if not container:
            return ToolResult(success=False, output="", error="Container name required")
        
        allowed_containers = [
            'homelab-dashboard', 'homelab-celery-worker', 'homelab-celery-beat',
            'discord-bot', 'stream-bot', 'homelab-redis', 'caddy'
        ]
        
        if container not in allowed_containers and not container.startswith('homelab-'):
            return ToolResult(success=False, output="", error=f"Container '{container}' not in allowed list")
        
        if host in ['linode', 'ubuntu'] and self.fleet_manager:
            return self._fleet_command({'host': host, 'command': f'docker restart {container}'})
        else:
            return self._run_command(['docker', 'restart', container])
    
    def _network_check(self, args: Dict) -> ToolResult:
        """Check network connectivity"""
        target = args.get('target', '8.8.8.8')
        
        output = ""
        ping_result = self._run_command(['ping', '-c', '3', '-W', '2', target])
        output += f"=== PING {target} ===\n{ping_result.output}\n"
        
        if '.' in target or target.startswith('http'):
            host = target.replace('http://', '').replace('https://', '').split('/')[0].split(':')[0]
            dns_result = self._run_command(['nslookup', host])
            output += f"\n=== DNS {host} ===\n{dns_result.output}\n"
        
        return ToolResult(success=ping_result.success, output=output)


jarvis_tool_executor = JarvisToolExecutor()
