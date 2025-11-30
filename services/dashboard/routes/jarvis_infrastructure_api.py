"""
Jarvis Infrastructure API Routes
Endpoints for IaC generation, deployment planning, cost estimation, and multi-host orchestration
"""
from flask import Blueprint, jsonify, request
from datetime import datetime
import logging
import json

logger = logging.getLogger(__name__)

jarvis_infrastructure_bp = Blueprint('jarvis_infrastructure', __name__, url_prefix='/api/jarvis/infrastructure')


@jarvis_infrastructure_bp.route('/stacks', methods=['GET'])
def list_available_stacks():
    """
    GET /api/jarvis/infrastructure/stacks
    
    List all available stack templates for deployment
    
    Query params:
    - category: Filter by category (web, database, infrastructure, etc.)
    - multi_host: Filter for multi-host capable stacks
    """
    try:
        from jarvis.infrastructure_orchestrator import infrastructure_orchestrator
        
        category = request.args.get('category')
        multi_host = request.args.get('multi_host', 'false').lower() == 'true'
        
        if multi_host:
            from jarvis.stack_templates import get_multi_host_stacks
            stacks = get_multi_host_stacks()
        elif category:
            from jarvis.stack_templates import get_stack_by_category
            stacks = get_stack_by_category(category)
        else:
            stacks = infrastructure_orchestrator.get_available_stacks()
        
        return jsonify({
            'success': True,
            'stacks': stacks,
            'count': len(stacks),
            'timestamp': datetime.utcnow().isoformat()
        })
        
    except Exception as e:
        logger.error(f"Error listing stacks: {e}")
        return jsonify({
            'success': False,
            'error': str(e)
        }), 500


@jarvis_infrastructure_bp.route('/stacks/<stack_name>', methods=['GET'])
def get_stack_details(stack_name):
    """
    GET /api/jarvis/infrastructure/stacks/{stack_name}
    
    Get detailed information about a specific stack template
    """
    try:
        from jarvis.stack_templates import get_stack_template
        
        template = get_stack_template(stack_name)
        
        if not template:
            return jsonify({
                'success': False,
                'error': f'Stack template "{stack_name}" not found'
            }), 404
        
        return jsonify({
            'success': True,
            'stack': {
                'id': stack_name,
                **template
            }
        })
        
    except Exception as e:
        logger.error(f"Error getting stack details: {e}")
        return jsonify({
            'success': False,
            'error': str(e)
        }), 500


@jarvis_infrastructure_bp.route('/services', methods=['GET'])
def list_available_services():
    """
    GET /api/jarvis/infrastructure/services
    
    List all available single service templates
    """
    try:
        from jarvis.infrastructure_orchestrator import infrastructure_orchestrator
        
        services = infrastructure_orchestrator.get_available_services()
        
        return jsonify({
            'success': True,
            'services': services,
            'count': len(services),
            'timestamp': datetime.utcnow().isoformat()
        })
        
    except Exception as e:
        logger.error(f"Error listing services: {e}")
        return jsonify({
            'success': False,
            'error': str(e)
        }), 500


@jarvis_infrastructure_bp.route('/generate/compose', methods=['POST'])
def generate_compose_from_stack():
    """
    POST /api/jarvis/infrastructure/generate/compose
    
    Generate docker-compose.yml from a stack template
    
    Request body:
    {
        "stack_name": "wordpress",
        "config": {
            "project_name": "my-wordpress",
            "port": 8080,
            "domain": "wordpress.example.com"
        },
        "include_caddy": true
    }
    """
    try:
        from jarvis.infrastructure_orchestrator import infrastructure_orchestrator
        
        data = request.get_json() or {}
        
        stack_name = data.get('stack_name')
        if not stack_name:
            return jsonify({
                'success': False,
                'error': 'stack_name is required'
            }), 400
        
        config = data.get('config', {})
        include_caddy = data.get('include_caddy', True)
        
        compose_yaml, generated_secrets = infrastructure_orchestrator.generate_compose_from_template(
            stack_name=stack_name,
            config=config,
            include_caddy=include_caddy
        )
        
        return jsonify({
            'success': True,
            'compose_yaml': compose_yaml,
            'generated_secrets': generated_secrets,
            'stack_name': stack_name,
            'config_used': config,
            'timestamp': datetime.utcnow().isoformat()
        })
        
    except ValueError as e:
        return jsonify({
            'success': False,
            'error': str(e)
        }), 400
    except Exception as e:
        logger.error(f"Error generating compose: {e}")
        return jsonify({
            'success': False,
            'error': str(e)
        }), 500


@jarvis_infrastructure_bp.route('/generate/dockerfile', methods=['POST'])
def generate_dockerfile():
    """
    POST /api/jarvis/infrastructure/generate/dockerfile
    
    Generate a Dockerfile for a project
    
    Request body:
    {
        "project_type": "flask",
        "config": {
            "python_version": "3.11",
            "entry_point": "app:app",
            "requirements_file": "requirements.txt"
        }
    }
    """
    try:
        from jarvis.infrastructure_orchestrator import infrastructure_orchestrator
        
        data = request.get_json() or {}
        
        project_type = data.get('project_type')
        if not project_type:
            return jsonify({
                'success': False,
                'error': 'project_type is required'
            }), 400
        
        config = data.get('config', {})
        
        dockerfile = infrastructure_orchestrator.generate_dockerfile(
            project_type=project_type,
            config=config
        )
        
        return jsonify({
            'success': True,
            'dockerfile': dockerfile,
            'project_type': project_type,
            'timestamp': datetime.utcnow().isoformat()
        })
        
    except Exception as e:
        logger.error(f"Error generating Dockerfile: {e}")
        return jsonify({
            'success': False,
            'error': str(e)
        }), 500


@jarvis_infrastructure_bp.route('/plan', methods=['POST'])
def create_deployment_plan():
    """
    POST /api/jarvis/infrastructure/plan
    
    Create a deployment plan from a natural language request
    
    Request body:
    {
        "request": "Deploy a WordPress site with SSL on my Linode server",
        "target_host": "linode",
        "context": {
            "existing_services": ["nginx", "postgres"]
        }
    }
    """
    try:
        from jarvis.infrastructure_orchestrator import infrastructure_orchestrator
        
        data = request.get_json() or {}
        
        deployment_request = data.get('request')
        if not deployment_request:
            return jsonify({
                'success': False,
                'error': 'request is required'
            }), 400
        
        target_host = data.get('target_host', 'local')
        user_context = data.get('context')
        
        plan = infrastructure_orchestrator.create_deployment_plan(
            request=deployment_request,
            target_host=target_host,
            user_context=user_context
        )
        
        return jsonify({
            'success': True,
            'plan': {
                'id': plan.id,
                'name': plan.name,
                'description': plan.description,
                'stack_type': plan.stack_type,
                'target_host': plan.target_host,
                'steps': plan.steps,
                'compose_yaml': plan.compose_yaml,
                'dockerfile': plan.dockerfile,
                'environment_vars': plan.environment_vars,
                'estimated_time_minutes': plan.estimated_time_minutes,
                'estimated_cost': plan.estimated_cost,
                'security_recommendations': plan.security_recommendations,
                'status': plan.status,
                'created_at': plan.created_at
            },
            'timestamp': datetime.utcnow().isoformat()
        })
        
    except Exception as e:
        logger.error(f"Error creating deployment plan: {e}")
        return jsonify({
            'success': False,
            'error': str(e)
        }), 500


@jarvis_infrastructure_bp.route('/estimate', methods=['POST'])
def estimate_cost():
    """
    POST /api/jarvis/infrastructure/estimate
    
    Estimate monthly cost for deployment
    
    Request body:
    {
        "resources": {
            "cpu_cores": 2,
            "memory_gb": 4,
            "storage_gb": 50
        },
        "provider": "linode"
    }
    """
    try:
        from jarvis.infrastructure_orchestrator import infrastructure_orchestrator
        
        data = request.get_json() or {}
        
        resources = data.get('resources', {})
        provider = data.get('provider', 'linode')
        
        estimation = infrastructure_orchestrator.estimate_deployment_cost(
            resources=resources,
            provider=provider
        )
        
        return jsonify({
            'success': True,
            'estimation': estimation,
            'timestamp': datetime.utcnow().isoformat()
        })
        
    except Exception as e:
        logger.error(f"Error estimating cost: {e}")
        return jsonify({
            'success': False,
            'error': str(e)
        }), 500


@jarvis_infrastructure_bp.route('/security/scan', methods=['POST'])
def security_scan():
    """
    POST /api/jarvis/infrastructure/security/scan
    
    Generate security recommendations for a deployment
    
    Request body:
    {
        "compose_yaml": "version: '3.8'...",
        "config": {}
    }
    """
    try:
        from jarvis.infrastructure_orchestrator import infrastructure_orchestrator
        
        data = request.get_json() or {}
        
        compose_yaml = data.get('compose_yaml', '')
        config = data.get('config', {})
        
        recommendations = infrastructure_orchestrator.generate_security_recommendations(
            compose_yaml=compose_yaml,
            config=config
        )
        
        critical = sum(1 for r in recommendations if r.get('severity') == 'critical')
        high = sum(1 for r in recommendations if r.get('severity') == 'high')
        medium = sum(1 for r in recommendations if r.get('severity') == 'medium')
        low = sum(1 for r in recommendations if r.get('severity') == 'low')
        
        return jsonify({
            'success': True,
            'recommendations': recommendations,
            'summary': {
                'total': len(recommendations),
                'critical': critical,
                'high': high,
                'medium': medium,
                'low': low
            },
            'timestamp': datetime.utcnow().isoformat()
        })
        
    except Exception as e:
        logger.error(f"Error performing security scan: {e}")
        return jsonify({
            'success': False,
            'error': str(e)
        }), 500


@jarvis_infrastructure_bp.route('/analyze', methods=['GET'])
def analyze_infrastructure():
    """
    GET /api/jarvis/infrastructure/analyze
    
    Analyze infrastructure on a target host
    
    Query params:
    - host: Target host ID (default: local)
    """
    try:
        from jarvis.infrastructure_orchestrator import infrastructure_orchestrator
        
        host_id = request.args.get('host', 'local')
        
        analysis = infrastructure_orchestrator.analyze_infrastructure(host_id)
        
        return jsonify({
            'success': True,
            'analysis': {
                'host_id': analysis.host_id,
                'containers': analysis.containers,
                'resource_usage': analysis.resource_usage,
                'recommendations': analysis.recommendations,
                'security_issues': analysis.security_issues,
                'optimization_suggestions': analysis.optimization_suggestions,
                'analyzed_at': analysis.analyzed_at
            },
            'timestamp': datetime.utcnow().isoformat()
        })
        
    except Exception as e:
        logger.error(f"Error analyzing infrastructure: {e}")
        return jsonify({
            'success': False,
            'error': str(e)
        }), 500


@jarvis_infrastructure_bp.route('/deploy/fleet', methods=['POST'])
def deploy_to_fleet():
    """
    POST /api/jarvis/infrastructure/deploy/fleet
    
    Deploy infrastructure across multiple hosts
    
    Request body:
    {
        "plan_id": "abc123",
        "hosts": ["linode", "local"],
        "compose_yaml": "version: '3.8'...",
        "stack_name": "wordpress",
        "config": {}
    }
    """
    try:
        from jarvis.infrastructure_orchestrator import infrastructure_orchestrator, DeploymentPlan
        import secrets
        
        data = request.get_json() or {}
        
        hosts = data.get('hosts', [])
        if not hosts:
            return jsonify({
                'success': False,
                'error': 'At least one target host is required'
            }), 400
        
        compose_yaml = data.get('compose_yaml', '')
        stack_name = data.get('stack_name', 'custom')
        config = data.get('config', {})
        
        plan = DeploymentPlan(
            id=data.get('plan_id', secrets.token_hex(8)),
            name=f"Fleet Deployment: {stack_name}",
            description=f"Multi-host deployment to {len(hosts)} hosts",
            stack_type=stack_name,
            target_host=hosts[0],
            compose_yaml=compose_yaml,
            environment_vars=config,
            status="ready"
        )
        
        results = infrastructure_orchestrator.deploy_to_fleet(plan, hosts)
        
        return jsonify({
            'success': True,
            'deployment': results,
            'timestamp': datetime.utcnow().isoformat()
        })
        
    except Exception as e:
        logger.error(f"Error deploying to fleet: {e}")
        return jsonify({
            'success': False,
            'error': str(e)
        }), 500


@jarvis_infrastructure_bp.route('/ai/deploy', methods=['POST'])
def ai_deploy():
    """
    POST /api/jarvis/infrastructure/ai/deploy
    
    AI-powered one-command deployment from natural language request
    
    Request body:
    {
        "request": "Deploy a Redis cluster with 3 nodes",
        "target_host": "linode",
        "auto_execute": false,
        "dry_run": true
    }
    """
    try:
        from jarvis.infrastructure_orchestrator import infrastructure_orchestrator
        
        data = request.get_json() or {}
        
        deployment_request = data.get('request')
        if not deployment_request:
            return jsonify({
                'success': False,
                'error': 'request is required'
            }), 400
        
        target_host = data.get('target_host', 'local')
        auto_execute = data.get('auto_execute', False)
        dry_run = data.get('dry_run', True)
        
        plan = infrastructure_orchestrator.create_deployment_plan(
            request=deployment_request,
            target_host=target_host,
            user_context=data.get('context')
        )
        
        result = {
            'success': True,
            'plan': {
                'id': plan.id,
                'name': plan.name,
                'description': plan.description,
                'stack_type': plan.stack_type,
                'target_host': plan.target_host,
                'steps': plan.steps,
                'compose_yaml': plan.compose_yaml,
                'estimated_time_minutes': plan.estimated_time_minutes,
                'estimated_cost': plan.estimated_cost,
                'security_recommendations': plan.security_recommendations
            },
            'dry_run': dry_run,
            'executed': False,
            'timestamp': datetime.utcnow().isoformat()
        }
        
        if auto_execute and not dry_run:
            try:
                from services.fleet_service import fleet_manager
                
                execution_result = fleet_manager.execute_command(
                    target_host,
                    f"mkdir -p ~/deployments/{plan.id}",
                    bypass_whitelist=True
                )
                
                result['executed'] = execution_result.get('success', False)
                result['execution_result'] = execution_result
            except Exception as exec_error:
                result['execution_error'] = str(exec_error)
        
        return jsonify(result)
        
    except Exception as e:
        logger.error(f"Error in AI deploy: {e}")
        return jsonify({
            'success': False,
            'error': str(e)
        }), 500


@jarvis_infrastructure_bp.route('/pricing', methods=['GET'])
def get_cloud_pricing():
    """
    GET /api/jarvis/infrastructure/pricing
    
    Get cloud pricing information for all providers
    
    Query params:
    - provider: Filter by provider (linode, digitalocean, aws_ec2, hetzner)
    """
    try:
        from jarvis.infrastructure_orchestrator import CLOUD_PRICING
        
        provider = request.args.get('provider')
        
        if provider:
            if provider not in CLOUD_PRICING:
                return jsonify({
                    'success': False,
                    'error': f'Unknown provider: {provider}'
                }), 404
            pricing = {provider: CLOUD_PRICING[provider]}
        else:
            pricing = CLOUD_PRICING
        
        return jsonify({
            'success': True,
            'pricing': pricing,
            'providers': list(CLOUD_PRICING.keys()),
            'timestamp': datetime.utcnow().isoformat()
        })
        
    except Exception as e:
        logger.error(f"Error getting pricing: {e}")
        return jsonify({
            'success': False,
            'error': str(e)
        }), 500


@jarvis_infrastructure_bp.route('/security/checks', methods=['GET'])
def get_security_checks():
    """
    GET /api/jarvis/infrastructure/security/checks
    
    Get list of available security checks
    """
    try:
        from jarvis.infrastructure_orchestrator import SECURITY_CHECKS
        
        return jsonify({
            'success': True,
            'checks': SECURITY_CHECKS,
            'count': len(SECURITY_CHECKS),
            'timestamp': datetime.utcnow().isoformat()
        })
        
    except Exception as e:
        logger.error(f"Error getting security checks: {e}")
        return jsonify({
            'success': False,
            'error': str(e)
        }), 500


__all__ = ['jarvis_infrastructure_bp']
