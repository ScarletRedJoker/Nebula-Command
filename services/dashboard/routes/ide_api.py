"""
IDE API Routes - AI-powered code assistance endpoints
Provides chat, code analysis, generation, diff preview, and multi-model collaboration
"""
from flask import Blueprint, request, jsonify, session
from flask_limiter import Limiter
from flask_limiter.util import get_remote_address
from services.ide_service import ide_service
from utils.auth import require_auth
import logging

logger = logging.getLogger(__name__)

ide_api_bp = Blueprint('ide_api', __name__, url_prefix='/api/ide')

# Rate limiter - 10 requests per minute per user
limiter = Limiter(
    key_func=lambda: session.get('username', get_remote_address()),
    default_limits=["10 per minute"]
)


@ide_api_bp.route('/chat', methods=['POST'])
@require_auth
@limiter.limit("10 per minute")
def ide_chat():
    """
    POST /api/ide/chat
    
    Chat with Jarvis AI assistant with optional code context
    
    Request:
        {
            "message": str,
            "context": {
                "file": str (optional),
                "selection": str (optional),
                "language": str (optional)
            } (optional),
            "conversation_history": [
                {"role": "user|assistant", "content": str}
            ] (optional),
            "model": str (optional, default: "gpt-5")
        }
    
    Response:
        {
            "success": bool,
            "response": str,
            "model": str,
            "tokens": int
        }
    """
    try:
        data = request.get_json()
        
        if not data or 'message' not in data:
            return jsonify({
                'success': False,
                'error': 'Missing required field: message'
            }), 400
        
        message = data['message']
        context = data.get('context')
        conversation_history = data.get('conversation_history')
        model = data.get('model', 'gpt-5')
        
        logger.info(f"IDE chat request from {session.get('username', 'unknown')}: {message[:50]}...")
        
        result = ide_service.chat(
            message=message,
            context=context,
            conversation_history=conversation_history,
            model=model
        )
        
        if result.get('success'):
            logger.info(f"IDE chat response generated using {result.get('model')}")
            return jsonify(result)
        else:
            logger.warning(f"IDE chat failed: {result.get('error')}")
            return jsonify(result), 500
    
    except Exception as e:
        logger.error(f"Error in /api/ide/chat: {e}", exc_info=True)
        return jsonify({
            'success': False,
            'error': 'Internal server error',
            'message': str(e)
        }), 500


@ide_api_bp.route('/context', methods=['POST'])
@require_auth
@limiter.limit("10 per minute")
def ide_context():
    """
    POST /api/ide/context
    
    Analyze code structure, patterns, and suggest improvements
    
    Request:
        {
            "code": str,
            "language": str,
            "action": "analyze" | "explain" | "optimize"
        }
    
    Response:
        {
            "success": bool,
            "analysis": str,
            "suggestions": [str]
        }
    """
    try:
        data = request.get_json()
        
        if not data or 'code' not in data or 'language' not in data:
            return jsonify({
                'success': False,
                'error': 'Missing required fields: code, language'
            }), 400
        
        code = data['code']
        language = data['language']
        action = data.get('action', 'analyze')
        
        if action not in ['analyze', 'explain', 'optimize']:
            return jsonify({
                'success': False,
                'error': 'Invalid action. Must be: analyze, explain, or optimize'
            }), 400
        
        logger.info(f"IDE context analysis request: {action} for {language} code")
        
        result = ide_service.analyze_code(
            code=code,
            language=language,
            action=action
        )
        
        if result.get('success'):
            logger.info(f"Code analysis completed: {action}")
            return jsonify(result)
        else:
            logger.warning(f"Code analysis failed: {result.get('error')}")
            return jsonify(result), 500
    
    except Exception as e:
        logger.error(f"Error in /api/ide/context: {e}", exc_info=True)
        return jsonify({
            'success': False,
            'error': 'Internal server error',
            'message': str(e)
        }), 500


@ide_api_bp.route('/generate', methods=['POST'])
@require_auth
@limiter.limit("10 per minute")
def ide_generate():
    """
    POST /api/ide/generate
    
    Generate code from natural language description
    
    Request:
        {
            "description": str,
            "language": str,
            "context": str (optional)
        }
    
    Response:
        {
            "success": bool,
            "code": str,
            "explanation": str
        }
    """
    try:
        data = request.get_json()
        
        if not data or 'description' not in data or 'language' not in data:
            return jsonify({
                'success': False,
                'error': 'Missing required fields: description, language'
            }), 400
        
        description = data['description']
        language = data['language']
        context = data.get('context')
        
        logger.info(f"IDE code generation request: {language} - {description[:50]}...")
        
        result = ide_service.generate_code(
            description=description,
            language=language,
            context=context
        )
        
        if result.get('success'):
            logger.info(f"Code generated for {language}")
            return jsonify(result)
        else:
            logger.warning(f"Code generation failed: {result.get('error')}")
            return jsonify(result), 500
    
    except Exception as e:
        logger.error(f"Error in /api/ide/generate: {e}", exc_info=True)
        return jsonify({
            'success': False,
            'error': 'Internal server error',
            'message': str(e)
        }), 500


@ide_api_bp.route('/apply', methods=['POST'])
@require_auth
@limiter.limit("10 per minute")
def ide_apply():
    """
    POST /api/ide/apply
    
    Generate diff preview between original and generated code
    
    Request:
        {
            "original": str,
            "generated": str,
            "file": str
        }
    
    Response:
        {
            "success": bool,
            "diff": str,
            "preview": str,
            "canApply": bool,
            "changes": {
                "additions": int,
                "deletions": int
            }
        }
    """
    try:
        data = request.get_json()
        
        if not data or 'original' not in data or 'generated' not in data or 'file' not in data:
            return jsonify({
                'success': False,
                'error': 'Missing required fields: original, generated, file'
            }), 400
        
        original = data['original']
        generated = data['generated']
        file = data['file']
        
        logger.info(f"IDE diff generation request for {file}")
        
        result = ide_service.generate_diff(
            original=original,
            generated=generated,
            file=file
        )
        
        if result.get('success'):
            logger.info(f"Diff generated for {file}: +{result.get('changes', {}).get('additions', 0)} -{result.get('changes', {}).get('deletions', 0)}")
            return jsonify(result)
        else:
            logger.warning(f"Diff generation failed: {result.get('error')}")
            return jsonify(result), 500
    
    except Exception as e:
        logger.error(f"Error in /api/ide/apply: {e}", exc_info=True)
        return jsonify({
            'success': False,
            'error': 'Internal server error',
            'message': str(e)
        }), 500


@ide_api_bp.route('/collaborate', methods=['POST'])
@require_auth
@limiter.limit("10 per minute")
def ide_collaborate():
    """
    POST /api/ide/collaborate
    
    Orchestrate multiple AI models to discuss and analyze code
    
    Request:
        {
            "question": str,
            "code": str,
            "models": [str] (optional, default: ["gpt-5", "gpt-4"])
        }
    
    Response:
        {
            "success": bool,
            "conversation": [
                {
                    "model": str,
                    "response": str,
                    "error": bool (optional)
                }
            ],
            "consensus": str
        }
    """
    try:
        data = request.get_json()
        
        if not data or 'question' not in data or 'code' not in data:
            return jsonify({
                'success': False,
                'error': 'Missing required fields: question, code'
            }), 400
        
        question = data['question']
        code = data['code']
        models = data.get('models', ['gpt-5', 'gpt-4'])
        
        if not isinstance(models, list) or len(models) == 0:
            return jsonify({
                'success': False,
                'error': 'models must be a non-empty array'
            }), 400
        
        logger.info(f"IDE collaboration request with models: {', '.join(models)}")
        
        result = ide_service.collaborate(
            question=question,
            code=code,
            models=models
        )
        
        if result.get('success'):
            logger.info(f"Multi-model collaboration completed with {len(result.get('conversation', []))} responses")
            return jsonify(result)
        else:
            logger.warning(f"Multi-model collaboration failed: {result.get('error')}")
            return jsonify(result), 500
    
    except Exception as e:
        logger.error(f"Error in /api/ide/collaborate: {e}", exc_info=True)
        return jsonify({
            'success': False,
            'error': 'Internal server error',
            'message': str(e)
        }), 500


@ide_api_bp.route('/health', methods=['GET'])
def ide_health():
    """
    GET /api/ide/health
    
    Check IDE service health and configuration
    
    Response:
        {
            "success": bool,
            "enabled": bool,
            "message": str
        }
    """
    return jsonify({
        'success': True,
        'enabled': ide_service.enabled,
        'message': 'IDE service is enabled and ready' if ide_service.enabled else 'IDE service is not configured'
    })
