"""
Jarvis Code API Routes
Endpoints for AI-powered code operations and deployment
"""
from flask import Blueprint, jsonify, request, render_template
from datetime import datetime
import logging

logger = logging.getLogger(__name__)

jarvis_code_bp = Blueprint('jarvis_code', __name__, url_prefix='/api/jarvis/code')


@jarvis_code_bp.route('/analyze', methods=['POST'])
def analyze_project():
    """
    POST /api/jarvis/code/analyze
    
    Analyze project structure, dependencies, and tech stack
    
    Request body:
    {
        "project_path": "my-project"
    }
    """
    try:
        from services.jarvis_code_service import jarvis_code_service
        
        data = request.get_json() or {}
        project_path = data.get('project_path')
        
        if not project_path:
            return jsonify({
                'success': False,
                'error': 'project_path is required'
            }), 400
        
        result = jarvis_code_service.analyze_project(project_path)
        
        status_code = 200 if result.get('success') else 400
        return jsonify(result), status_code
        
    except Exception as e:
        logger.error(f"Error analyzing project: {e}")
        return jsonify({
            'success': False,
            'error': str(e)
        }), 500


@jarvis_code_bp.route('/generate', methods=['POST'])
def generate_code():
    """
    POST /api/jarvis/code/generate
    
    Generate code using AI
    
    Request body:
    {
        "prompt": "Create a function that...",
        "context": "optional existing code context",
        "language": "python"
    }
    """
    try:
        from services.jarvis_code_service import jarvis_code_service
        
        data = request.get_json() or {}
        prompt = data.get('prompt')
        context = data.get('context')
        language = data.get('language', 'python')
        
        if not prompt:
            return jsonify({
                'success': False,
                'error': 'prompt is required'
            }), 400
        
        result = jarvis_code_service.generate_code(prompt, context, language)
        
        status_code = 200 if result.get('success') else 500
        return jsonify(result), status_code
        
    except Exception as e:
        logger.error(f"Error generating code: {e}")
        return jsonify({
            'success': False,
            'error': str(e)
        }), 500


@jarvis_code_bp.route('/edit', methods=['POST'])
def edit_file():
    """
    POST /api/jarvis/code/edit
    
    AI-edit a specific file
    
    Request body:
    {
        "filepath": "path/to/file.py",
        "instructions": "Add error handling to the main function"
    }
    """
    try:
        from services.jarvis_code_service import jarvis_code_service
        
        data = request.get_json() or {}
        filepath = data.get('filepath')
        instructions = data.get('instructions')
        
        if not filepath:
            return jsonify({
                'success': False,
                'error': 'filepath is required'
            }), 400
        
        if not instructions:
            return jsonify({
                'success': False,
                'error': 'instructions is required'
            }), 400
        
        result = jarvis_code_service.edit_file(filepath, instructions)
        
        status_code = 200 if result.get('success') else 400
        return jsonify(result), status_code
        
    except Exception as e:
        logger.error(f"Error editing file: {e}")
        return jsonify({
            'success': False,
            'error': str(e)
        }), 500


@jarvis_code_bp.route('/create', methods=['POST'])
def create_file():
    """
    POST /api/jarvis/code/create
    
    Create a new file from AI description
    
    Request body:
    {
        "filepath": "path/to/newfile.py",
        "description": "A utility module for handling database connections"
    }
    """
    try:
        from services.jarvis_code_service import jarvis_code_service
        
        data = request.get_json() or {}
        filepath = data.get('filepath')
        description = data.get('description')
        
        if not filepath:
            return jsonify({
                'success': False,
                'error': 'filepath is required'
            }), 400
        
        if not description:
            return jsonify({
                'success': False,
                'error': 'description is required'
            }), 400
        
        result = jarvis_code_service.create_file(filepath, description)
        
        status_code = 200 if result.get('success') else 400
        return jsonify(result), status_code
        
    except Exception as e:
        logger.error(f"Error creating file: {e}")
        return jsonify({
            'success': False,
            'error': str(e)
        }), 500


@jarvis_code_bp.route('/review', methods=['POST'])
def review_code():
    """
    POST /api/jarvis/code/review
    
    Get AI code review and suggestions
    
    Request body:
    {
        "filepath": "path/to/file.py"
    }
    """
    try:
        from services.jarvis_code_service import jarvis_code_service
        
        data = request.get_json() or {}
        filepath = data.get('filepath')
        
        if not filepath:
            return jsonify({
                'success': False,
                'error': 'filepath is required'
            }), 400
        
        result = jarvis_code_service.review_code(filepath)
        
        status_code = 200 if result.get('success') else 400
        return jsonify(result), status_code
        
    except Exception as e:
        logger.error(f"Error reviewing code: {e}")
        return jsonify({
            'success': False,
            'error': str(e)
        }), 500


@jarvis_code_bp.route('/tests', methods=['POST'])
def run_tests():
    """
    POST /api/jarvis/code/tests
    
    Run project tests
    
    Request body:
    {
        "project_path": "my-project",
        "test_command": "optional custom test command"
    }
    """
    try:
        from services.jarvis_code_service import jarvis_code_service
        
        data = request.get_json() or {}
        project_path = data.get('project_path')
        test_command = data.get('test_command')
        
        if not project_path:
            return jsonify({
                'success': False,
                'error': 'project_path is required'
            }), 400
        
        result = jarvis_code_service.run_tests(project_path, test_command)
        
        status_code = 200 if result.get('success') else 400
        return jsonify(result), status_code
        
    except Exception as e:
        logger.error(f"Error running tests: {e}")
        return jsonify({
            'success': False,
            'error': str(e)
        }), 500


@jarvis_code_bp.route('/deploy', methods=['POST'])
def deploy_project():
    """
    POST /api/jarvis/code/deploy
    
    Deploy project to remote host
    
    Request body:
    {
        "project_path": "my-project",
        "target_host": "user@host.example.com",
        "deploy_method": "git" or "rsync"
    }
    """
    try:
        from services.jarvis_code_service import jarvis_code_service
        
        data = request.get_json() or {}
        project_path = data.get('project_path')
        target_host = data.get('target_host')
        deploy_method = data.get('deploy_method', 'git')
        
        if not project_path:
            return jsonify({
                'success': False,
                'error': 'project_path is required'
            }), 400
        
        if not target_host:
            return jsonify({
                'success': False,
                'error': 'target_host is required'
            }), 400
        
        result = jarvis_code_service.deploy_project(project_path, target_host, deploy_method)
        
        status_code = 200 if result.get('success') else 400
        return jsonify(result), status_code
        
    except Exception as e:
        logger.error(f"Error deploying project: {e}")
        return jsonify({
            'success': False,
            'error': str(e)
        }), 500


@jarvis_code_bp.route('/scaffold', methods=['POST'])
def scaffold_project():
    """
    POST /api/jarvis/code/scaffold
    
    Scaffold a new project from template
    
    Request body:
    {
        "name": "my-new-project",
        "description": "A REST API for managing tasks",
        "tech_stack": "python-flask"
    }
    """
    try:
        from services.jarvis_code_service import jarvis_code_service
        
        data = request.get_json() or {}
        name = data.get('name')
        description = data.get('description', '')
        tech_stack = data.get('tech_stack')
        
        if not name:
            return jsonify({
                'success': False,
                'error': 'name is required'
            }), 400
        
        if not tech_stack:
            return jsonify({
                'success': False,
                'error': 'tech_stack is required'
            }), 400
        
        result = jarvis_code_service.create_project(name, description, tech_stack)
        
        status_code = 200 if result.get('success') else 400
        return jsonify(result), status_code
        
    except Exception as e:
        logger.error(f"Error scaffolding project: {e}")
        return jsonify({
            'success': False,
            'error': str(e)
        }), 500


@jarvis_code_bp.route('/projects', methods=['GET'])
def list_projects():
    """
    GET /api/jarvis/code/projects
    
    List all projects in the workspace
    """
    try:
        from services.jarvis_code_service import jarvis_code_service
        
        result = jarvis_code_service.list_projects()
        
        status_code = 200 if result.get('success') else 500
        return jsonify(result), status_code
        
    except Exception as e:
        logger.error(f"Error listing projects: {e}")
        return jsonify({
            'success': False,
            'error': str(e)
        }), 500


@jarvis_code_bp.route('/templates', methods=['GET'])
def get_templates():
    """
    GET /api/jarvis/code/templates
    
    Get available project templates
    """
    try:
        from services.jarvis_code_service import jarvis_code_service
        
        result = jarvis_code_service.get_available_templates()
        
        return jsonify(result)
        
    except Exception as e:
        logger.error(f"Error getting templates: {e}")
        return jsonify({
            'success': False,
            'error': str(e)
        }), 500


@jarvis_code_bp.route('/execute', methods=['POST'])
def execute_command():
    """
    POST /api/jarvis/code/execute
    
    Execute a shell command in project sandbox
    
    Request body:
    {
        "command": "npm install",
        "project_path": "my-project",
        "timeout": 60
    }
    """
    try:
        from services.jarvis_code_service import jarvis_code_service
        
        data = request.get_json() or {}
        command = data.get('command')
        project_path = data.get('project_path')
        timeout = data.get('timeout', 60)
        
        if not command:
            return jsonify({
                'success': False,
                'error': 'command is required'
            }), 400
        
        result = jarvis_code_service.execute_command(command, project_path, timeout)
        
        status_code = 200 if result.get('success') else 400
        return jsonify(result), status_code
        
    except Exception as e:
        logger.error(f"Error executing command: {e}")
        return jsonify({
            'success': False,
            'error': str(e)
        }), 500


@jarvis_code_bp.route('/file', methods=['GET'])
def read_file():
    """
    GET /api/jarvis/code/file?path=path/to/file.py
    
    Read file contents
    """
    try:
        from services.jarvis_code_service import jarvis_code_service
        
        filepath = request.args.get('path')
        
        if not filepath:
            return jsonify({
                'success': False,
                'error': 'path query parameter is required'
            }), 400
        
        result = jarvis_code_service.read_file(filepath)
        
        status_code = 200 if result.get('success') else 404
        return jsonify(result), status_code
        
    except Exception as e:
        logger.error(f"Error reading file: {e}")
        return jsonify({
            'success': False,
            'error': str(e)
        }), 500


@jarvis_code_bp.route('/status', methods=['GET'])
def get_status():
    """
    GET /api/jarvis/code/status
    
    Get Jarvis Code service status
    """
    try:
        from services.jarvis_code_service import jarvis_code_service
        
        return jsonify({
            'success': True,
            'enabled': jarvis_code_service.enabled,
            'workspace': jarvis_code_service.workspace,
            'timestamp': datetime.utcnow().isoformat()
        })
        
    except Exception as e:
        logger.error(f"Error getting status: {e}")
        return jsonify({
            'success': False,
            'error': str(e)
        }), 500


__all__ = ['jarvis_code_bp']
