from flask import Blueprint, jsonify, request
from services.demo_registry import get_ollama_service
from utils.auth import require_auth

ai_foundry_bp = Blueprint('ai_foundry', __name__)

@ai_foundry_bp.route('/api/ai-foundry/models', methods=['GET'])
@require_auth
def get_models():
    """Get available Ollama models"""
    ollama = get_ollama_service()
    models = ollama.list_models()
    
    return jsonify({
        'models': models,
        'available': ollama.is_available()
    })

@ai_foundry_bp.route('/api/ai-foundry/chat', methods=['POST'])
@require_auth
def chat():
    """Chat with local AI model"""
    data = request.get_json()
    message = data.get('message')
    model = data.get('model', 'llama2:7b')
    
    ollama = get_ollama_service()
    response = ollama.chat(model, message)
    
    return jsonify({
        'response': response,
        'model': model,
        'available': ollama.is_available()
    })
