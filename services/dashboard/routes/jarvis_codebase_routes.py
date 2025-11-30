"""
Jarvis Codebase Access Routes
API endpoints for Jarvis to browse, read, and edit the HomeLabHub codebase
"""
from flask import Blueprint, jsonify, request
import logging

from utils.auth import require_auth

logger = logging.getLogger(__name__)

jarvis_codebase_bp = Blueprint('jarvis_codebase', __name__, url_prefix='/api/jarvis/codebase')


@jarvis_codebase_bp.route('/status', methods=['GET'])
@require_auth
def get_codebase_status():
    """Check if codebase access is available"""
    try:
        from services.jarvis_codebase_service import jarvis_codebase
        
        return jsonify({
            'success': True,
            'enabled': jarvis_codebase.enabled,
            'project_root': str(jarvis_codebase.project_root),
        })
    except Exception as e:
        logger.error(f"Codebase status error: {e}")
        return jsonify({'success': False, 'error': str(e)}), 500


@jarvis_codebase_bp.route('/summary', methods=['GET'])
@require_auth
def get_project_summary():
    """Get project summary for AI context"""
    try:
        from services.jarvis_codebase_service import jarvis_codebase
        
        summary = jarvis_codebase.get_project_summary()
        return jsonify({'success': True, 'summary': summary})
    except Exception as e:
        logger.error(f"Project summary error: {e}")
        return jsonify({'success': False, 'error': str(e)}), 500


@jarvis_codebase_bp.route('/structure', methods=['GET'])
@require_auth
def get_project_structure():
    """Get project directory structure"""
    try:
        from services.jarvis_codebase_service import jarvis_codebase
        
        path = request.args.get('path', '')
        max_depth = int(request.args.get('max_depth', 3))
        
        structure = jarvis_codebase.get_project_structure(max_depth=max_depth, path=path)
        return jsonify({'success': True, 'structure': structure})
    except Exception as e:
        logger.error(f"Project structure error: {e}")
        return jsonify({'success': False, 'error': str(e)}), 500


@jarvis_codebase_bp.route('/files', methods=['GET'])
@require_auth
def list_files():
    """List files in a directory"""
    try:
        from services.jarvis_codebase_service import jarvis_codebase
        
        path = request.args.get('path', '')
        pattern = request.args.get('pattern')
        
        files = jarvis_codebase.list_files(path=path, pattern=pattern)
        return jsonify({'success': True, 'files': files, 'count': len(files)})
    except Exception as e:
        logger.error(f"List files error: {e}")
        return jsonify({'success': False, 'error': str(e)}), 500


@jarvis_codebase_bp.route('/read', methods=['GET'])
@require_auth
def read_file():
    """Read a file from the codebase"""
    try:
        from services.jarvis_codebase_service import jarvis_codebase
        
        path = request.args.get('path')
        if not path:
            return jsonify({'success': False, 'error': 'Path is required'}), 400
        
        max_lines = request.args.get('max_lines')
        if max_lines:
            max_lines = int(max_lines)
        
        result = jarvis_codebase.read_file(path, max_lines=max_lines)
        status_code = 200 if result.get('success') else 404
        return jsonify(result), status_code
    except Exception as e:
        logger.error(f"Read file error: {e}")
        return jsonify({'success': False, 'error': str(e)}), 500


@jarvis_codebase_bp.route('/write', methods=['POST'])
@require_auth
def write_file():
    """Write content to a file"""
    try:
        from services.jarvis_codebase_service import jarvis_codebase
        
        data = request.get_json()
        if not data:
            return jsonify({'success': False, 'error': 'JSON body required'}), 400
        
        path = data.get('path')
        content = data.get('content')
        
        if not path or content is None:
            return jsonify({'success': False, 'error': 'Path and content are required'}), 400
        
        create_backup = data.get('create_backup', True)
        
        result = jarvis_codebase.write_file(path, content, create_backup=create_backup)
        status_code = 200 if result.get('success') else 400
        return jsonify(result), status_code
    except Exception as e:
        logger.error(f"Write file error: {e}")
        return jsonify({'success': False, 'error': str(e)}), 500


@jarvis_codebase_bp.route('/edit', methods=['POST'])
@require_auth
def edit_file():
    """Edit a file by replacing text"""
    try:
        from services.jarvis_codebase_service import jarvis_codebase
        
        data = request.get_json()
        if not data:
            return jsonify({'success': False, 'error': 'JSON body required'}), 400
        
        path = data.get('path')
        old_text = data.get('old_text')
        new_text = data.get('new_text')
        
        if not path or old_text is None or new_text is None:
            return jsonify({'success': False, 'error': 'Path, old_text, and new_text are required'}), 400
        
        result = jarvis_codebase.edit_file(path, old_text, new_text)
        status_code = 200 if result.get('success') else 400
        return jsonify(result), status_code
    except Exception as e:
        logger.error(f"Edit file error: {e}")
        return jsonify({'success': False, 'error': str(e)}), 500


@jarvis_codebase_bp.route('/create', methods=['POST'])
@require_auth
def create_file():
    """Create a new file"""
    try:
        from services.jarvis_codebase_service import jarvis_codebase
        
        data = request.get_json()
        if not data:
            return jsonify({'success': False, 'error': 'JSON body required'}), 400
        
        path = data.get('path')
        content = data.get('content', '')
        
        if not path:
            return jsonify({'success': False, 'error': 'Path is required'}), 400
        
        result = jarvis_codebase.create_file(path, content)
        status_code = 201 if result.get('success') else 400
        return jsonify(result), status_code
    except Exception as e:
        logger.error(f"Create file error: {e}")
        return jsonify({'success': False, 'error': str(e)}), 500


@jarvis_codebase_bp.route('/delete', methods=['DELETE'])
@require_auth
def delete_file():
    """Delete a file (moves to trash)"""
    try:
        from services.jarvis_codebase_service import jarvis_codebase
        
        path = request.args.get('path')
        if not path:
            return jsonify({'success': False, 'error': 'Path is required'}), 400
        
        result = jarvis_codebase.delete_file(path)
        status_code = 200 if result.get('success') else 400
        return jsonify(result), status_code
    except Exception as e:
        logger.error(f"Delete file error: {e}")
        return jsonify({'success': False, 'error': str(e)}), 500


@jarvis_codebase_bp.route('/search', methods=['GET'])
@require_auth
def search_code():
    """Search for patterns in the codebase"""
    try:
        from services.jarvis_codebase_service import jarvis_codebase
        
        pattern = request.args.get('pattern')
        if not pattern:
            return jsonify({'success': False, 'error': 'Pattern is required'}), 400
        
        path = request.args.get('path', '')
        file_pattern = request.args.get('file_pattern')
        max_results = int(request.args.get('max_results', 50))
        
        results = jarvis_codebase.search_code(
            pattern=pattern,
            path=path,
            file_pattern=file_pattern,
            max_results=max_results
        )
        
        if results and 'error' in results[0]:
            return jsonify({'success': False, 'error': results[0]['error']}), 400
        
        return jsonify({
            'success': True,
            'results': results,
            'count': len(results),
            'pattern': pattern
        })
    except Exception as e:
        logger.error(f"Search code error: {e}")
        return jsonify({'success': False, 'error': str(e)}), 500


@jarvis_codebase_bp.route('/context', methods=['GET'])
@require_auth
def get_file_context():
    """Get context around a specific line"""
    try:
        from services.jarvis_codebase_service import jarvis_codebase
        
        path = request.args.get('path')
        line = request.args.get('line')
        
        if not path or not line:
            return jsonify({'success': False, 'error': 'Path and line are required'}), 400
        
        context_lines = int(request.args.get('context', 5))
        
        result = jarvis_codebase.get_file_context(path, int(line), context_lines)
        status_code = 200 if result.get('success') else 404
        return jsonify(result), status_code
    except Exception as e:
        logger.error(f"Get context error: {e}")
        return jsonify({'success': False, 'error': str(e)}), 500


@jarvis_codebase_bp.route('/git/status', methods=['GET'])
@require_auth
def get_git_status():
    """Get git status of the project"""
    try:
        from services.jarvis_codebase_service import jarvis_codebase
        
        result = jarvis_codebase.get_git_status()
        return jsonify(result)
    except Exception as e:
        logger.error(f"Git status error: {e}")
        return jsonify({'success': False, 'error': str(e)}), 500
