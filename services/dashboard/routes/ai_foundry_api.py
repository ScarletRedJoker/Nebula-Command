from flask import Blueprint, jsonify, request
from utils.auth import require_auth
import os

ai_foundry_bp = Blueprint('ai_foundry', __name__)

DEMO_MODE = os.getenv('DEMO_MODE', 'true').lower() == 'true'

@ai_foundry_bp.route('/api/ai-foundry/models', methods=['GET'])
@require_auth
def get_models():
    """Get available Ollama models"""
    if DEMO_MODE:
        models = [
            {'name': 'llama2:7b', 'size': '3.8GB', 'status': 'downloaded'},
            {'name': 'mistral:latest', 'size': '4.1GB', 'status': 'downloading', 'progress': 65},
            {'name': 'codellama:latest', 'size': '3.5GB', 'status': 'available'}
        ]
    else:
        models = []
    
    return jsonify({'models': models})

@ai_foundry_bp.route('/api/ai-foundry/chat', methods=['POST'])
@require_auth
def chat():
    """Chat with local AI model"""
    data = request.get_json()
    message = data.get('message')
    model = data.get('model', 'llama2:7b')
    
    if DEMO_MODE:
        response = f"[Demo Mode] AI Response to: {message}"
    else:
        response = "Ollama integration coming soon"
    
    return jsonify({'response': response, 'model': model})
