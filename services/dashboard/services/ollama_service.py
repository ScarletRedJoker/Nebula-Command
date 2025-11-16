"""
Real Ollama Service Integration
"""
import requests
from typing import List, Dict, Optional
import structlog

logger = structlog.get_logger()

class OllamaService:
    """Real Ollama service for local AI"""
    
    def __init__(self, base_url: str = "http://localhost:11434"):
        self.base_url = base_url
        self.session = requests.Session()
        self.timeout = 30
    
    def is_available(self) -> bool:
        """Check if Ollama is running"""
        try:
            resp = self.session.get(f"{self.base_url}/api/tags", timeout=self.timeout)
            return resp.status_code == 200
        except:
            return False
    
    def list_models(self) -> List[Dict]:
        """Get list of downloaded Ollama models"""
        try:
            resp = self.session.get(f"{self.base_url}/api/tags", timeout=self.timeout)
            if resp.ok:
                data = resp.json()
                models = []
                for model in data.get('models', []):
                    models.append({
                        'name': model.get('name'),
                        'size': self._format_size(model.get('size', 0)),
                        'status': 'downloaded',
                        'modified': model.get('modified_at')
                    })
                return models
            return []
        except Exception as e:
            logger.error(f"Failed to list models: {e}")
            return []
    
    def chat(self, model: str, message: str) -> str:
        """Chat with Ollama model"""
        try:
            resp = self.session.post(
                f"{self.base_url}/api/generate",
                json={
                    'model': model,
                    'prompt': message,
                    'stream': False
                },
                timeout=60
            )
            
            if resp.ok:
                data = resp.json()
                return data.get('response', 'No response from model')
            else:
                return f"Error: {resp.status_code} - {resp.text}"
                
        except Exception as e:
            logger.error(f"Chat failed: {e}")
            return f"Error communicating with model: {str(e)}"
    
    def _format_size(self, bytes_value: int) -> str:
        """Format bytes to human readable"""
        size = float(bytes_value)
        for unit in ['B', 'KB', 'MB', 'GB']:
            if size < 1024.0:
                return f"{size:.1f}{unit}"
            size /= 1024.0
        return f"{size:.1f}TB"
