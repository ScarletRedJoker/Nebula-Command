from flask import Blueprint, jsonify, request, Response
from services.ollama_service import OllamaService
from utils.auth import require_web_auth
import json
import logging

logger = logging.getLogger(__name__)

ollama_bp = Blueprint('ollama_api', __name__, url_prefix='/api/ollama')

ollama_service = OllamaService()

@ollama_bp.route('/models', methods=['GET'])
@require_web_auth
def list_models():
    """List all installed Ollama models"""
    models = ollama_service.list_models()
    return jsonify({"success": True, "models": models})

@ollama_bp.route('/models/pull', methods=['POST'])
@require_web_auth
def pull_model():
    """Pull a model with streaming progress"""
    data = request.json
    model_name = data.get('model')
    
    if not model_name:
        return jsonify({"success": False, "message": "Model name required"}), 400
    
    def generate():
        for progress in ollama_service.pull_model(model_name):
            yield f"data: {json.dumps(progress)}\n\n"
        yield "data: [DONE]\n\n"
    
    return Response(generate(), mimetype='text/event-stream')

@ollama_bp.route('/models/<path:model_name>', methods=['DELETE'])
@require_web_auth
def delete_model(model_name):
    """Delete a model"""
    success = ollama_service.delete_model(model_name)
    return jsonify({"success": success})

@ollama_bp.route('/status', methods=['GET'])
@require_web_auth
def status():
    """Get Ollama service status"""
    return jsonify({
        "success": True,
        "enabled": ollama_service.enabled,
        "models_count": len(ollama_service.list_models())
    })
