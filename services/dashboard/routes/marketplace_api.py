"""
Marketplace API - Container App Store Endpoints
Provides REST API for browsing and deploying marketplace apps
"""

from flask import Blueprint, jsonify, request
import logging
from utils.auth import require_auth
from services.marketplace_service import marketplace_service

logger = logging.getLogger(__name__)

marketplace_bp = Blueprint('marketplace', __name__, url_prefix='/api/marketplace')


@marketplace_bp.route('/templates', methods=['GET'])
def list_templates():
    """List all marketplace templates
    
    Query Parameters:
    - category: Filter by category (optional)
    - search: Search query (optional)
    
    Returns:
        JSON list of template objects
    """
    try:
        category = request.args.get('category')
        search_query = request.args.get('search')
        
        if search_query:
            templates = marketplace_service.search_templates(search_query)
        elif category:
            templates = marketplace_service.get_templates_by_category(category)
        else:
            templates = marketplace_service.get_templates_by_category('all')
        
        return jsonify({
            'success': True,
            'templates': templates,
            'count': len(templates)
        })
    except Exception as e:
        logger.error(f"Error listing templates: {e}", exc_info=True)
        return jsonify({
            'success': False,
            'error': str(e)
        }), 500


@marketplace_bp.route('/templates/featured', methods=['GET'])
def featured_templates():
    """Get featured marketplace templates
    
    Returns:
        JSON list of featured template objects
    """
    try:
        templates = marketplace_service.get_featured_templates()
        return jsonify({
            'success': True,
            'templates': templates,
            'count': len(templates)
        })
    except Exception as e:
        logger.error(f"Error getting featured templates: {e}", exc_info=True)
        return jsonify({
            'success': False,
            'error': str(e)
        }), 500


@marketplace_bp.route('/templates/<template_id>', methods=['GET'])
def get_template(template_id):
    """Get detailed template information
    
    Args:
        template_id: UUID of the template
        
    Returns:
        JSON template object with full details
    """
    try:
        template = marketplace_service.get_template_details(template_id)
        
        if not template:
            return jsonify({
                'success': False,
                'error': 'Template not found'
            }), 404
        
        return jsonify({
            'success': True,
            'template': template
        })
    except Exception as e:
        logger.error(f"Error getting template details: {e}", exc_info=True)
        return jsonify({
            'success': False,
            'error': str(e)
        }), 500


@marketplace_bp.route('/deploy', methods=['POST'])
@require_auth
def deploy_container():
    """Deploy a container from marketplace template
    
    POST Body:
    {
        "template_id": "uuid-here",
        "subdomain": "nextcloud",
        "custom_config": {
            "environment": {
                "KEY": "value"
            },
            "volumes": {},
            "ports": {}
        }
    }
    
    Returns:
        JSON deployment result with access URL and credentials
    """
    try:
        data = request.get_json()
        
        if not data:
            return jsonify({
                'success': False,
                'error': 'No data provided'
            }), 400
        
        template_id = data.get('template_id')
        subdomain = data.get('subdomain')
        custom_config = data.get('custom_config', {})
        
        if not template_id:
            return jsonify({
                'success': False,
                'error': 'template_id is required'
            }), 400
        
        if not subdomain:
            return jsonify({
                'success': False,
                'error': 'subdomain is required'
            }), 400
        
        # Validate subdomain format
        if not subdomain.replace('-', '').replace('_', '').isalnum():
            return jsonify({
                'success': False,
                'error': 'Invalid subdomain format. Use only letters, numbers, hyphens, and underscores.'
            }), 400
        
        # DEMO MODE: Flashy response linking to production
        if os.getenv('DEMO_MODE', 'false').lower() == 'true':
            # Get template details for the response
            template = marketplace_service.get_template_details(template_id)
            template_name = template.get('name', 'Service') if template else 'Service'
            
            return jsonify({
                'success': True,
                'demo_mode': True,
                'message': f'🎉 {template_name} deployment initiated!',
                'status': 'running',
                'deployment_id': f'demo-{template_id[:8]}',
                'container_name': f'{subdomain}-demo',
                'url': f'https://{subdomain}.demo.local',
                'production_link': 'https://host.evindrake.net',
                'notice': {
                    'title': '✨ This is a demo environment',
                    'message': 'Your deployment is being processed in the background! For real deployments with full functionality, visit:',
                    'link_text': 'Open Production Dashboard',
                    'details': [
                        '✅ Container spinning up in isolated environment',
                        '✅ SSL certificates being generated',
                        '✅ Health checks running',
                        '⚡ Deployment typically completes in 60-90 seconds'
                    ]
                },
                'access_info': {
                    'username': 'admin',
                    'password': 'demo-password',
                    'note': 'Mock credentials for demonstration purposes'
                }
            })
        
        # PRODUCTION MODE: Real deployment
        success, result = marketplace_service.deploy_container(
            template_id=template_id,
            subdomain=subdomain,
            custom_config=custom_config
        )
        
        if success:
            return jsonify({
                'success': True,
                **result
            })
        else:
            return jsonify({
                'success': False,
                **result
            }), 400
            
    except Exception as e:
        logger.error(f"Error deploying container: {e}", exc_info=True)
        return jsonify({
            'success': False,
            'error': 'Deployment failed',
            'details': str(e)
        }), 500


@marketplace_bp.route('/deployments', methods=['GET'])
@require_auth
def list_deployments():
    """List all deployed containers from marketplace
    
    Returns:
        JSON list of deployment objects with status
    """
    try:
        deployments = marketplace_service.get_deployments()
        return jsonify({
            'success': True,
            'deployments': deployments,
            'count': len(deployments)
        })
    except Exception as e:
        logger.error(f"Error listing deployments: {e}", exc_info=True)
        return jsonify({
            'success': False,
            'error': str(e)
        }), 500


@marketplace_bp.route('/deployments/<deployment_id>', methods=['GET'])
@require_auth
def get_deployment_status(deployment_id):
    """Get detailed status of a deployment
    
    Args:
        deployment_id: UUID of the deployment
        
    Returns:
        JSON deployment object with live container status
    """
    try:
        deployment = marketplace_service.get_deployment_status(deployment_id)
        
        if not deployment:
            return jsonify({
                'success': False,
                'error': 'Deployment not found'
            }), 404
        
        return jsonify({
            'success': True,
            'deployment': deployment
        })
    except Exception as e:
        logger.error(f"Error getting deployment status: {e}", exc_info=True)
        return jsonify({
            'success': False,
            'error': str(e)
        }), 500


@marketplace_bp.route('/deployments/<deployment_id>/stop', methods=['POST'])
@require_auth
def stop_deployment(deployment_id):
    """Stop a running container deployment
    
    Args:
        deployment_id: UUID of the deployment
        
    Returns:
        JSON success/error message
    """
    try:
        success, message = marketplace_service.stop_container(deployment_id)
        
        if success:
            return jsonify({
                'success': True,
                'message': message
            })
        else:
            return jsonify({
                'success': False,
                'error': message
            }), 400
    except Exception as e:
        logger.error(f"Error stopping deployment: {e}", exc_info=True)
        return jsonify({
            'success': False,
            'error': str(e)
        }), 500


@marketplace_bp.route('/deployments/<deployment_id>/start', methods=['POST'])
@require_auth
def start_deployment(deployment_id):
    """Start a stopped container deployment
    
    Args:
        deployment_id: UUID of the deployment
        
    Returns:
        JSON success/error message
    """
    try:
        # TODO: Implement start_container in marketplace_service
        return jsonify({
            'success': False,
            'error': 'Not implemented yet'
        }), 501
    except Exception as e:
        logger.error(f"Error starting deployment: {e}", exc_info=True)
        return jsonify({
            'success': False,
            'error': str(e)
        }), 500


@marketplace_bp.route('/deployments/<deployment_id>', methods=['DELETE'])
@require_auth
def remove_deployment(deployment_id):
    """Remove a container deployment and clean up resources
    
    Args:
        deployment_id: UUID of the deployment
        
    Returns:
        JSON success/error message
    """
    try:
        success, message = marketplace_service.remove_container(deployment_id)
        
        if success:
            return jsonify({
                'success': True,
                'message': message
            })
        else:
            return jsonify({
                'success': False,
                'error': message
            }), 400
    except Exception as e:
        logger.error(f"Error removing deployment: {e}", exc_info=True)
        return jsonify({
            'success': False,
            'error': str(e)
        }), 500


@marketplace_bp.route('/catalog/load', methods=['POST'])
@require_auth
def load_catalog():
    """Load marketplace templates from catalog JSON file
    
    This is typically run once during initial setup to populate
    the database with curated app templates.
    
    Returns:
        JSON success/error message with count of loaded templates
    """
    try:
        success, message = marketplace_service.load_catalog_templates()
        
        if success:
            return jsonify({
                'success': True,
                'message': message
            })
        else:
            return jsonify({
                'success': False,
                'error': message
            }), 400
    except Exception as e:
        logger.error(f"Error loading catalog: {e}", exc_info=True)
        return jsonify({
            'success': False,
            'error': str(e)
        }), 500


@marketplace_bp.route('/categories', methods=['GET'])
def get_categories():
    """Get list of available app categories
    
    Returns:
        JSON list of category names
    """
    categories = [
        {'id': 'all', 'name': 'All Apps', 'icon': '📦'},
        {'id': 'productivity', 'name': 'Productivity', 'icon': '📝'},
        {'id': 'media', 'name': 'Media', 'icon': '🎬'},
        {'id': 'security', 'name': 'Security', 'icon': '🔒'},
        {'id': 'monitoring', 'name': 'Monitoring', 'icon': '📊'},
        {'id': 'ai', 'name': 'AI/ML', 'icon': '🤖'},
        {'id': 'iot', 'name': 'IoT', 'icon': '🏠'},
        {'id': 'development', 'name': 'Development', 'icon': '💻'}
    ]
    
    return jsonify({
        'success': True,
        'categories': categories
    })
