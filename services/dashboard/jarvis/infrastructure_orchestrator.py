"""
Infrastructure Orchestrator Service
Core service for IaC generation, deployment planning, cost estimation, and security scanning
"""

import os
import re
import yaml
import json
import secrets
import string
import logging
from datetime import datetime
from typing import Dict, List, Optional, Any, Tuple
from dataclasses import dataclass, field

from .stack_templates import (
    STACK_TEMPLATES,
    SINGLE_SERVICE_TEMPLATES,
    get_stack_template,
    get_single_service_template,
    list_available_stacks,
    list_available_services
)
from .compose_templates import generate_compose_spec, compose_to_yaml

logger = logging.getLogger(__name__)


@dataclass
class DeploymentPlan:
    """Represents a deployment plan with steps and validations"""
    id: str
    name: str
    description: str
    stack_type: str
    target_host: str
    steps: List[Dict[str, Any]] = field(default_factory=list)
    compose_yaml: str = ""
    dockerfile: str = ""
    environment_vars: Dict[str, str] = field(default_factory=dict)
    estimated_time_minutes: int = 5
    estimated_cost: Optional[Dict[str, Any]] = None
    security_recommendations: List[Dict[str, Any]] = field(default_factory=list)
    status: str = "draft"
    created_at: str = field(default_factory=lambda: datetime.utcnow().isoformat())


@dataclass
class InfrastructureAnalysis:
    """Result of infrastructure analysis"""
    host_id: str
    containers: List[Dict[str, Any]]
    resource_usage: Dict[str, Any]
    recommendations: List[Dict[str, Any]]
    security_issues: List[Dict[str, Any]]
    optimization_suggestions: List[Dict[str, Any]]
    analyzed_at: str = field(default_factory=lambda: datetime.utcnow().isoformat())


CLOUD_PRICING = {
    "linode": {
        "nanode_1gb": {"cpu": 1, "memory_gb": 1, "storage_gb": 25, "price_monthly": 5},
        "linode_2gb": {"cpu": 1, "memory_gb": 2, "storage_gb": 50, "price_monthly": 12},
        "linode_4gb": {"cpu": 2, "memory_gb": 4, "storage_gb": 80, "price_monthly": 24},
        "linode_8gb": {"cpu": 4, "memory_gb": 8, "storage_gb": 160, "price_monthly": 48},
        "linode_16gb": {"cpu": 6, "memory_gb": 16, "storage_gb": 320, "price_monthly": 96},
        "linode_32gb": {"cpu": 8, "memory_gb": 32, "storage_gb": 640, "price_monthly": 192},
    },
    "digitalocean": {
        "s-1vcpu-1gb": {"cpu": 1, "memory_gb": 1, "storage_gb": 25, "price_monthly": 6},
        "s-1vcpu-2gb": {"cpu": 1, "memory_gb": 2, "storage_gb": 50, "price_monthly": 12},
        "s-2vcpu-4gb": {"cpu": 2, "memory_gb": 4, "storage_gb": 80, "price_monthly": 24},
        "s-4vcpu-8gb": {"cpu": 4, "memory_gb": 8, "storage_gb": 160, "price_monthly": 48},
        "s-8vcpu-16gb": {"cpu": 8, "memory_gb": 16, "storage_gb": 320, "price_monthly": 96},
    },
    "aws_ec2": {
        "t3.micro": {"cpu": 2, "memory_gb": 1, "storage_gb": 0, "price_monthly": 7.59},
        "t3.small": {"cpu": 2, "memory_gb": 2, "storage_gb": 0, "price_monthly": 15.18},
        "t3.medium": {"cpu": 2, "memory_gb": 4, "storage_gb": 0, "price_monthly": 30.37},
        "t3.large": {"cpu": 2, "memory_gb": 8, "storage_gb": 0, "price_monthly": 60.74},
        "t3.xlarge": {"cpu": 4, "memory_gb": 16, "storage_gb": 0, "price_monthly": 121.47},
    },
    "hetzner": {
        "cx11": {"cpu": 1, "memory_gb": 2, "storage_gb": 20, "price_monthly": 3.79},
        "cx21": {"cpu": 2, "memory_gb": 4, "storage_gb": 40, "price_monthly": 5.83},
        "cx31": {"cpu": 2, "memory_gb": 8, "storage_gb": 80, "price_monthly": 10.59},
        "cx41": {"cpu": 4, "memory_gb": 16, "storage_gb": 160, "price_monthly": 18.59},
        "cx51": {"cpu": 8, "memory_gb": 32, "storage_gb": 240, "price_monthly": 35.59},
    }
}

SECURITY_CHECKS = [
    {
        "id": "exposed_ports",
        "name": "Exposed Ports Check",
        "description": "Check for unnecessarily exposed ports",
        "severity": "medium"
    },
    {
        "id": "default_credentials",
        "name": "Default Credentials Check",
        "description": "Check for default or weak credentials",
        "severity": "critical"
    },
    {
        "id": "volume_permissions",
        "name": "Volume Permissions Check",
        "description": "Check for overly permissive volume mounts",
        "severity": "high"
    },
    {
        "id": "privileged_mode",
        "name": "Privileged Mode Check",
        "description": "Check for containers running in privileged mode",
        "severity": "critical"
    },
    {
        "id": "network_isolation",
        "name": "Network Isolation Check",
        "description": "Check for proper network segmentation",
        "severity": "medium"
    },
    {
        "id": "image_vulnerabilities",
        "name": "Image Vulnerability Check",
        "description": "Check for known vulnerabilities in container images",
        "severity": "high"
    },
    {
        "id": "secrets_exposure",
        "name": "Secrets Exposure Check",
        "description": "Check for exposed secrets in environment variables",
        "severity": "critical"
    },
    {
        "id": "resource_limits",
        "name": "Resource Limits Check",
        "description": "Check for missing resource limits (CPU/memory)",
        "severity": "low"
    }
]


class InfrastructureOrchestrator:
    """
    AI-powered infrastructure orchestrator for IaC generation,
    deployment planning, and infrastructure management
    """
    
    def __init__(self):
        self.ai_service = None
        self.fleet_manager = None
        self._init_services()
    
    def _init_services(self):
        """Initialize dependent services"""
        try:
            from services.ai_service import AIService
            self.ai_service = AIService()
        except Exception as e:
            logger.warning(f"AI service not available: {e}")
        
        try:
            from services.fleet_service import FleetManager
            self.fleet_manager = FleetManager()
        except Exception as e:
            logger.warning(f"Fleet manager not available: {e}")
    
    def generate_password(self, length: int = 24) -> str:
        """Generate a secure random password"""
        alphabet = string.ascii_letters + string.digits + "!@#$%^&*"
        password = ''.join(secrets.choice(alphabet) for _ in range(length))
        return password
    
    def generate_compose_from_template(
        self,
        stack_name: str,
        config: Dict[str, Any],
        include_caddy: bool = True
    ) -> Tuple[str, Dict[str, str]]:
        """
        Generate docker-compose.yml from a stack template
        
        Args:
            stack_name: Name of the stack template
            config: Configuration variables for the template
            include_caddy: Whether to include Caddy reverse proxy labels
            
        Returns:
            Tuple of (compose_yaml, generated_secrets)
        """
        template = get_stack_template(stack_name)
        if not template:
            raise ValueError(f"Unknown stack template: {stack_name}")
        
        project_name = config.get("project_name", stack_name)
        
        generated_secrets = {}
        for var in template.get("required_vars", []):
            if var not in config:
                if "password" in var.lower() or "secret" in var.lower():
                    config[var] = self.generate_password()
                    generated_secrets[var] = config[var]
                elif var == "project_name":
                    config[var] = project_name
                elif var == "port":
                    config[var] = template.get("default_port", 8080)
                else:
                    raise ValueError(f"Missing required variable: {var}")
        
        compose_dict = {
            "version": "3.8",
            "services": {},
            "volumes": {},
            "networks": {}
        }
        
        for service_name, service_config in template.get("services", {}).items():
            service_def = self._substitute_vars(service_config, config)
            compose_dict["services"][service_name] = service_def
            
            if include_caddy and config.get("domain"):
                if "labels" not in service_def:
                    service_def["labels"] = {}
                service_def["labels"]["caddy"] = config["domain"]
                port = config.get("port", template.get("default_port", 80))
                service_def["labels"]["caddy.reverse_proxy"] = f"{{{{upstreams {port}}}}}"
        
        for volume_name, volume_config in template.get("volumes", {}).items():
            resolved_name = self._substitute_string(volume_name, config)
            compose_dict["volumes"][resolved_name] = volume_config or {}
        
        for network_name, network_config in template.get("networks", {}).items():
            compose_dict["networks"][network_name] = network_config
        
        yaml_content = yaml.dump(compose_dict, default_flow_style=False, sort_keys=False)
        
        return yaml_content, generated_secrets
    
    def _substitute_vars(self, obj: Any, config: Dict[str, Any]) -> Any:
        """Recursively substitute variables in a config object"""
        if isinstance(obj, str):
            return self._substitute_string(obj, config)
        elif isinstance(obj, dict):
            return {k: self._substitute_vars(v, config) for k, v in obj.items()}
        elif isinstance(obj, list):
            return [self._substitute_vars(item, config) for item in obj]
        return obj
    
    def _substitute_string(self, s: str, config: Dict[str, Any]) -> str:
        """Substitute {var} placeholders in a string"""
        pattern = r'\{([^}]+)\}'
        
        def replace(match):
            key = match.group(1)
            return str(config.get(key, match.group(0)))
        
        return re.sub(pattern, replace, s)
    
    def generate_dockerfile(
        self,
        project_type: str,
        config: Dict[str, Any]
    ) -> str:
        """
        Generate a Dockerfile for a project
        
        Args:
            project_type: Type of project (flask, django, nextjs, etc.)
            config: Configuration for the Dockerfile
            
        Returns:
            Dockerfile content as string
        """
        from .dockerfile_templates import generate_dockerfile
        return generate_dockerfile(project_type, config)
    
    def create_deployment_plan(
        self,
        request: str,
        target_host: str = "local",
        user_context: Optional[Dict[str, Any]] = None
    ) -> DeploymentPlan:
        """
        Create a deployment plan from a natural language request
        
        Args:
            request: Natural language deployment request
            target_host: Target host ID for deployment
            user_context: Additional context about the user's environment
            
        Returns:
            DeploymentPlan with steps and configurations
        """
        request_lower = request.lower()
        
        detected_stack = None
        for stack_name, stack_info in STACK_TEMPLATES.items():
            if stack_name in request_lower or stack_info["name"].lower() in request_lower:
                detected_stack = stack_name
                break
        
        domain_match = re.search(r'(?:on|at|domain[:\s]+)([a-zA-Z0-9.-]+\.[a-zA-Z]{2,})', request)
        domain = domain_match.group(1) if domain_match else None
        
        ssl_required = any(word in request_lower for word in ["ssl", "https", "certificate", "tls", "secure"])
        
        port_match = re.search(r'port[:\s]+(\d+)', request_lower)
        port = int(port_match.group(1)) if port_match else None
        
        if detected_stack:
            return self._create_stack_deployment_plan(
                stack_name=detected_stack,
                target_host=target_host,
                domain=domain,
                ssl_required=ssl_required,
                port=port,
                user_context=user_context
            )
        
        return self._create_ai_deployment_plan(
            request=request,
            target_host=target_host,
            domain=domain,
            ssl_required=ssl_required,
            user_context=user_context
        )
    
    def _create_stack_deployment_plan(
        self,
        stack_name: str,
        target_host: str,
        domain: Optional[str] = None,
        ssl_required: bool = False,
        port: Optional[int] = None,
        user_context: Optional[Dict[str, Any]] = None
    ) -> DeploymentPlan:
        """Create a deployment plan for a known stack template"""
        template = get_stack_template(stack_name)
        if not template:
            raise ValueError(f"Unknown stack: {stack_name}")
        
        project_name = f"{stack_name}-{secrets.token_hex(4)}"
        
        config = {
            "project_name": project_name,
            "port": port or template.get("default_port", 8080),
            "domain": domain or f"{project_name}.local",
        }
        
        generated_secrets = {}
        for var in template.get("required_vars", []):
            if var not in config:
                if "password" in var.lower() or "secret" in var.lower():
                    config[var] = self.generate_password()
                    generated_secrets[var] = config[var]
                elif var == "db_user":
                    config[var] = project_name.replace("-", "_")
                elif var == "db_name":
                    config[var] = project_name.replace("-", "_")
                elif "admin" in var.lower() and "user" in var.lower():
                    config[var] = "admin"
                else:
                    config[var] = project_name
        
        compose_yaml, additional_secrets = self.generate_compose_from_template(
            stack_name=stack_name,
            config=config,
            include_caddy=bool(domain)
        )
        generated_secrets.update(additional_secrets)
        
        steps = self._generate_deployment_steps(
            stack_name=stack_name,
            template=template,
            config=config,
            target_host=target_host,
            ssl_required=ssl_required
        )
        
        estimated_cost = self.estimate_deployment_cost(
            resources=template.get("estimated_resources", {}),
            provider="linode"
        )
        
        security_recommendations = self.generate_security_recommendations(
            compose_yaml=compose_yaml,
            config=config
        )
        
        plan = DeploymentPlan(
            id=secrets.token_hex(8),
            name=f"Deploy {template['name']}",
            description=f"Automated deployment of {template['description']}",
            stack_type=stack_name,
            target_host=target_host,
            steps=steps,
            compose_yaml=compose_yaml,
            environment_vars=config,
            estimated_time_minutes=len(steps) * 2,
            estimated_cost=estimated_cost,
            security_recommendations=security_recommendations,
            status="ready"
        )
        
        return plan
    
    def _create_ai_deployment_plan(
        self,
        request: str,
        target_host: str,
        domain: Optional[str] = None,
        ssl_required: bool = False,
        user_context: Optional[Dict[str, Any]] = None
    ) -> DeploymentPlan:
        """Create a deployment plan using AI for unknown requests"""
        if not self.ai_service or not self.ai_service.enabled:
            raise ValueError("AI service not available for custom deployment planning")
        
        available_stacks = list_available_stacks()
        
        prompt = f"""You are an infrastructure automation expert. Analyze this deployment request and create a deployment plan.

**Deployment Request:** {request}

**Target Host:** {target_host}
**Domain:** {domain or "Not specified"}
**SSL Required:** {ssl_required}

**Available Stack Templates:**
{json.dumps(available_stacks, indent=2)}

**User Context:**
{json.dumps(user_context or {}, indent=2)}

Create a deployment plan with:
1. The best matching stack template (or "custom" if none match)
2. Required configuration variables
3. Step-by-step deployment instructions
4. Security recommendations
5. Estimated resources needed

Respond in JSON format:
{{
    "stack_template": "template_name or custom",
    "services": [
        {{
            "name": "service_name",
            "image": "docker/image:tag",
            "ports": ["8080:80"],
            "environment": {{"KEY": "value"}}
        }}
    ],
    "steps": [
        {{"order": 1, "action": "description", "command": "optional command"}}
    ],
    "security_notes": ["note1", "note2"],
    "estimated_resources": {{"cpu": 2, "memory_gb": 4, "storage_gb": 20}}
}}"""

        response = self.ai_service.chat(prompt)
        
        try:
            if '```json' in response:
                response = response.split('```json')[1].split('```')[0].strip()
            elif '```' in response:
                response = response.split('```')[1].split('```')[0].strip()
            
            ai_plan = json.loads(response)
        except json.JSONDecodeError:
            ai_plan = {
                "stack_template": "custom",
                "services": [],
                "steps": [{"order": 1, "action": "Manual review required", "command": None}],
                "security_notes": ["Review deployment configuration manually"],
                "estimated_resources": {"cpu": 2, "memory_gb": 2, "storage_gb": 10}
            }
        
        if ai_plan.get("stack_template") != "custom" and ai_plan.get("stack_template") in STACK_TEMPLATES:
            return self._create_stack_deployment_plan(
                stack_name=ai_plan["stack_template"],
                target_host=target_host,
                domain=domain,
                ssl_required=ssl_required,
                user_context=user_context
            )
        
        compose_dict = {
            "version": "3.8",
            "services": {},
            "networks": {
                "web": {"external": True, "name": "homelab"}
            }
        }
        
        for service in ai_plan.get("services", []):
            compose_dict["services"][service["name"]] = {
                "image": service.get("image", ""),
                "container_name": service["name"],
                "restart": "unless-stopped",
                "ports": service.get("ports", []),
                "environment": service.get("environment", {}),
                "networks": ["web"]
            }
        
        compose_yaml = yaml.dump(compose_dict, default_flow_style=False)
        
        plan = DeploymentPlan(
            id=secrets.token_hex(8),
            name=f"Custom Deployment: {request[:50]}",
            description=f"AI-generated deployment plan for: {request}",
            stack_type="custom",
            target_host=target_host,
            steps=ai_plan.get("steps", []),
            compose_yaml=compose_yaml,
            environment_vars={},
            estimated_time_minutes=10,
            estimated_cost=self.estimate_deployment_cost(
                resources=ai_plan.get("estimated_resources", {}),
                provider="linode"
            ),
            security_recommendations=[
                {"type": "note", "message": note}
                for note in ai_plan.get("security_notes", [])
            ],
            status="ready"
        )
        
        return plan
    
    def _generate_deployment_steps(
        self,
        stack_name: str,
        template: Dict[str, Any],
        config: Dict[str, Any],
        target_host: str,
        ssl_required: bool
    ) -> List[Dict[str, Any]]:
        """Generate step-by-step deployment instructions"""
        steps = []
        order = 1
        
        steps.append({
            "order": order,
            "action": "validate_host",
            "description": f"Validate target host '{target_host}' is accessible",
            "command": f"ssh {target_host} 'docker --version'",
            "critical": True
        })
        order += 1
        
        steps.append({
            "order": order,
            "action": "create_project_dir",
            "description": f"Create project directory on {target_host}",
            "command": f"ssh {target_host} 'mkdir -p ~/deployments/{config['project_name']}'",
            "critical": True
        })
        order += 1
        
        steps.append({
            "order": order,
            "action": "upload_compose",
            "description": "Upload docker-compose.yml to target host",
            "command": f"scp docker-compose.yml {target_host}:~/deployments/{config['project_name']}/",
            "critical": True
        })
        order += 1
        
        steps.append({
            "order": order,
            "action": "create_env_file",
            "description": "Create environment file with secrets",
            "command": f"ssh {target_host} 'cat > ~/deployments/{config['project_name']}/.env << EOF\n...\nEOF'",
            "critical": True
        })
        order += 1
        
        steps.append({
            "order": order,
            "action": "pull_images",
            "description": "Pull Docker images",
            "command": f"ssh {target_host} 'cd ~/deployments/{config['project_name']} && docker compose pull'",
            "critical": True
        })
        order += 1
        
        steps.append({
            "order": order,
            "action": "start_services",
            "description": "Start all services",
            "command": f"ssh {target_host} 'cd ~/deployments/{config['project_name']} && docker compose up -d'",
            "critical": True
        })
        order += 1
        
        if ssl_required and config.get("domain"):
            steps.append({
                "order": order,
                "action": "configure_ssl",
                "description": f"Configure SSL certificate for {config['domain']}",
                "command": f"Update Caddy configuration for {config['domain']}",
                "critical": False
            })
            order += 1
        
        steps.append({
            "order": order,
            "action": "verify_deployment",
            "description": "Verify all services are running",
            "command": f"ssh {target_host} 'cd ~/deployments/{config['project_name']} && docker compose ps'",
            "critical": True
        })
        order += 1
        
        steps.append({
            "order": order,
            "action": "health_check",
            "description": "Run health checks on deployed services",
            "command": f"curl -s http://{config.get('domain', 'localhost')}:{config['port']}/health || echo 'Health endpoint not available'",
            "critical": False
        })
        
        return steps
    
    def estimate_deployment_cost(
        self,
        resources: Dict[str, Any],
        provider: str = "linode"
    ) -> Dict[str, Any]:
        """
        Estimate monthly cost for deploying infrastructure
        
        Args:
            resources: Required resources (cpu, memory_gb, storage_gb)
            provider: Cloud provider name
            
        Returns:
            Cost estimation with breakdown
        """
        cpu_needed = resources.get("cpu_cores", resources.get("cpu", 1))
        memory_needed = resources.get("memory_gb", 1)
        storage_needed = resources.get("storage_gb", 10)
        
        provider_pricing = CLOUD_PRICING.get(provider, CLOUD_PRICING["linode"])
        
        best_match = None
        best_price = float('inf')
        
        for instance_type, specs in provider_pricing.items():
            if (specs["cpu"] >= cpu_needed and 
                specs["memory_gb"] >= memory_needed and 
                specs["storage_gb"] >= storage_needed):
                if specs["price_monthly"] < best_price:
                    best_match = instance_type
                    best_price = specs["price_monthly"]
        
        if not best_match:
            best_match = list(provider_pricing.keys())[-1]
            best_price = provider_pricing[best_match]["price_monthly"]
        
        comparison = {}
        for prov, pricing in CLOUD_PRICING.items():
            prov_best = None
            prov_price = float('inf')
            for instance_type, specs in pricing.items():
                if (specs["cpu"] >= cpu_needed and 
                    specs["memory_gb"] >= memory_needed and 
                    specs["storage_gb"] >= storage_needed):
                    if specs["price_monthly"] < prov_price:
                        prov_best = instance_type
                        prov_price = specs["price_monthly"]
            if prov_best:
                comparison[prov] = {
                    "instance_type": prov_best,
                    "price_monthly": prov_price
                }
        
        return {
            "recommended_provider": provider,
            "recommended_instance": best_match,
            "estimated_monthly_cost": best_price,
            "estimated_yearly_cost": best_price * 12,
            "resources_needed": resources,
            "provider_comparison": comparison,
            "notes": [
                "Prices are estimates and may vary",
                "Does not include data transfer costs",
                "Storage costs may be additional on some providers"
            ]
        }
    
    def generate_security_recommendations(
        self,
        compose_yaml: str,
        config: Dict[str, Any]
    ) -> List[Dict[str, Any]]:
        """
        Generate security recommendations for a deployment
        
        Args:
            compose_yaml: Docker compose YAML content
            config: Deployment configuration
            
        Returns:
            List of security recommendations
        """
        recommendations = []
        
        try:
            compose_dict = yaml.safe_load(compose_yaml)
        except:
            compose_dict = {}
        
        for service_name, service_config in compose_dict.get("services", {}).items():
            env_vars = service_config.get("environment", {})
            
            if isinstance(env_vars, dict):
                for key, value in env_vars.items():
                    if any(word in key.lower() for word in ["password", "secret", "key", "token"]):
                        if isinstance(value, str) and len(value) < 12:
                            recommendations.append({
                                "severity": "high",
                                "type": "weak_credential",
                                "service": service_name,
                                "message": f"Consider using a stronger password for {key}",
                                "fix": f"Use a password with at least 16 characters"
                            })
            
            if service_config.get("privileged", False):
                recommendations.append({
                    "severity": "critical",
                    "type": "privileged_mode",
                    "service": service_name,
                    "message": f"Service '{service_name}' runs in privileged mode",
                    "fix": "Remove privileged: true unless absolutely necessary"
                })
            
            ports = service_config.get("ports", [])
            for port in ports:
                if isinstance(port, str) and port.startswith("0.0.0.0:"):
                    recommendations.append({
                        "severity": "medium",
                        "type": "exposed_port",
                        "service": service_name,
                        "message": f"Port {port} is exposed on all interfaces",
                        "fix": "Consider binding to 127.0.0.1 or using a reverse proxy"
                    })
            
            if not service_config.get("deploy", {}).get("resources"):
                recommendations.append({
                    "severity": "low",
                    "type": "missing_limits",
                    "service": service_name,
                    "message": f"Service '{service_name}' has no resource limits",
                    "fix": "Add deploy.resources.limits for CPU and memory"
                })
        
        recommendations.append({
            "severity": "info",
            "type": "general",
            "message": "Use Docker secrets or external secret management for sensitive data",
            "fix": "Consider using Docker Swarm secrets or HashiCorp Vault"
        })
        
        recommendations.append({
            "severity": "info",
            "type": "general",
            "message": "Regularly update container images to get security patches",
            "fix": "Set up automated image scanning with Trivy or Snyk"
        })
        
        return recommendations
    
    def analyze_infrastructure(self, host_id: str = "local") -> InfrastructureAnalysis:
        """
        Analyze infrastructure on a target host
        
        Args:
            host_id: Target host to analyze
            
        Returns:
            InfrastructureAnalysis with findings and recommendations
        """
        containers = []
        resource_usage = {}
        recommendations = []
        security_issues = []
        optimization_suggestions = []
        
        try:
            import docker
            client = docker.from_env()
            
            for container in client.containers.list(all=True):
                stats = None
                if container.status == "running":
                    try:
                        stats = container.stats(stream=False)
                    except:
                        pass
                
                container_info = {
                    "id": container.short_id,
                    "name": container.name,
                    "image": container.image.tags[0] if container.image.tags else "unknown",
                    "status": container.status,
                    "created": container.attrs.get("Created"),
                    "ports": container.attrs.get("NetworkSettings", {}).get("Ports", {}),
                }
                
                if stats:
                    cpu_delta = stats["cpu_stats"]["cpu_usage"]["total_usage"] - \
                               stats["precpu_stats"]["cpu_usage"]["total_usage"]
                    system_delta = stats["cpu_stats"]["system_cpu_usage"] - \
                                  stats["precpu_stats"]["system_cpu_usage"]
                    cpu_percent = (cpu_delta / system_delta) * 100 if system_delta > 0 else 0
                    
                    memory_usage = stats["memory_stats"].get("usage", 0)
                    memory_limit = stats["memory_stats"].get("limit", 1)
                    memory_percent = (memory_usage / memory_limit) * 100
                    
                    container_info["cpu_percent"] = round(cpu_percent, 2)
                    container_info["memory_percent"] = round(memory_percent, 2)
                    container_info["memory_usage_mb"] = round(memory_usage / 1024 / 1024, 2)
                
                containers.append(container_info)
                
                if container.status != "running":
                    recommendations.append({
                        "type": "stopped_container",
                        "severity": "low",
                        "container": container.name,
                        "message": f"Container '{container.name}' is not running",
                        "action": "Consider removing or starting this container"
                    })
                
                if container.attrs.get("HostConfig", {}).get("Privileged"):
                    security_issues.append({
                        "type": "privileged_container",
                        "severity": "critical",
                        "container": container.name,
                        "message": f"Container '{container.name}' runs in privileged mode"
                    })
            
            running_containers = [c for c in containers if c["status"] == "running"]
            if running_containers:
                avg_cpu = sum(c.get("cpu_percent", 0) for c in running_containers) / len(running_containers)
                avg_memory = sum(c.get("memory_percent", 0) for c in running_containers) / len(running_containers)
                
                resource_usage = {
                    "total_containers": len(containers),
                    "running_containers": len(running_containers),
                    "average_cpu_percent": round(avg_cpu, 2),
                    "average_memory_percent": round(avg_memory, 2)
                }
                
                if avg_cpu > 80:
                    optimization_suggestions.append({
                        "type": "high_cpu",
                        "message": "Average CPU usage is high. Consider scaling out or optimizing workloads.",
                        "current_value": f"{avg_cpu:.1f}%"
                    })
                
                if avg_memory > 80:
                    optimization_suggestions.append({
                        "type": "high_memory",
                        "message": "Average memory usage is high. Consider adding more memory or optimizing applications.",
                        "current_value": f"{avg_memory:.1f}%"
                    })
            
        except Exception as e:
            logger.error(f"Error analyzing infrastructure: {e}")
            recommendations.append({
                "type": "error",
                "severity": "high",
                "message": f"Could not analyze infrastructure: {str(e)}"
            })
        
        return InfrastructureAnalysis(
            host_id=host_id,
            containers=containers,
            resource_usage=resource_usage,
            recommendations=recommendations,
            security_issues=security_issues,
            optimization_suggestions=optimization_suggestions
        )
    
    def deploy_to_fleet(
        self,
        plan: DeploymentPlan,
        hosts: List[str]
    ) -> Dict[str, Any]:
        """
        Deploy infrastructure across multiple hosts
        
        Args:
            plan: Deployment plan to execute
            hosts: List of host IDs to deploy to
            
        Returns:
            Deployment results for each host
        """
        if not self.fleet_manager:
            raise ValueError("Fleet manager not available")
        
        results = {}
        
        for host_id in hosts:
            try:
                result = self.fleet_manager.execute_command(
                    host_id,
                    f"mkdir -p ~/deployments/{plan.id}"
                )
                
                if result.get("success"):
                    results[host_id] = {
                        "status": "success",
                        "message": f"Deployment initiated on {host_id}"
                    }
                else:
                    results[host_id] = {
                        "status": "failed",
                        "error": result.get("error", "Unknown error")
                    }
                    
            except Exception as e:
                results[host_id] = {
                    "status": "failed",
                    "error": str(e)
                }
        
        return {
            "plan_id": plan.id,
            "hosts": hosts,
            "results": results,
            "deployed_at": datetime.utcnow().isoformat()
        }
    
    def get_available_stacks(self) -> List[Dict[str, Any]]:
        """Get list of available stack templates"""
        return list_available_stacks()
    
    def get_available_services(self) -> List[Dict[str, Any]]:
        """Get list of available single services"""
        return list_available_services()


infrastructure_orchestrator = InfrastructureOrchestrator()

__all__ = [
    'InfrastructureOrchestrator',
    'infrastructure_orchestrator',
    'DeploymentPlan',
    'InfrastructureAnalysis',
    'CLOUD_PRICING',
    'SECURITY_CHECKS'
]
