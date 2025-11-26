"""
Enhanced AI Service
Multi-model routing, token tracking, offline fallbacks, and response caching
"""
import logging
import hashlib
import time
import json
import os
from datetime import datetime, timedelta
from typing import Dict, List, Optional, Any, Generator, Tuple

from openai import OpenAI
from services.db_service import db_service

logger = logging.getLogger(__name__)


MODEL_PRICING = {
    'gpt-4o': {'input': 0.005, 'output': 0.015},
    'gpt-4o-mini': {'input': 0.00015, 'output': 0.0006},
    'gpt-4': {'input': 0.03, 'output': 0.06},
    'gpt-4-turbo': {'input': 0.01, 'output': 0.03},
    'gpt-3.5-turbo': {'input': 0.0005, 'output': 0.0015},
    'ollama/llama2': {'input': 0.0, 'output': 0.0},
    'ollama/codellama': {'input': 0.0, 'output': 0.0},
    'ollama/mistral': {'input': 0.0, 'output': 0.0},
}

TASK_COMPLEXITY_ROUTING = {
    'simple': ['gpt-4o-mini', 'ollama/mistral', 'gpt-3.5-turbo'],
    'moderate': ['gpt-4o', 'gpt-4o-mini', 'ollama/llama2'],
    'complex': ['gpt-4o', 'gpt-4', 'gpt-4-turbo'],
    'code': ['gpt-4o', 'ollama/codellama', 'gpt-4'],
    'analysis': ['gpt-4o', 'gpt-4', 'gpt-4o-mini'],
}

OFFLINE_RESPONSES = {
    'greeting': "Hello! I'm Jarvis, your homelab assistant. How can I help you today?",
    'status': "I can check the status of your services. What service would you like me to look at?",
    'restart': "To restart a service, I'll need to know which one. Please specify the service name.",
    'help': """I can help you with:
- **Service Management**: Start, stop, restart containers
- **Log Analysis**: Check and analyze service logs
- **Health Monitoring**: Check service health and metrics
- **Troubleshooting**: Diagnose and fix common issues

What would you like to do?""",
    'error': "I'm currently unable to process complex requests. Please try again later or check basic service status manually.",
}


class EnhancedAIService:
    """
    Enhanced AI Service with multi-model routing, token tracking, and offline fallbacks
    """
    
    def __init__(self):
        self.openai_client = None
        self.openai_enabled = False
        self.ollama_service = None
        self.ollama_enabled = False
        
        self._init_openai()
        self._init_ollama()
        
        self._response_cache = {}
        self._cache_max_size = 1000
        self._cache_default_ttl = 3600
    
    def _init_openai(self):
        """Initialize OpenAI client"""
        try:
            api_key = os.getenv('AI_INTEGRATIONS_OPENAI_API_KEY') or os.getenv('OPENAI_API_KEY')
            base_url = os.getenv('AI_INTEGRATIONS_OPENAI_BASE_URL') or os.getenv('OPENAI_BASE_URL', 'https://api.openai.com/v1')
            
            if api_key:
                self.openai_client = OpenAI(api_key=api_key, base_url=base_url)
                self.openai_enabled = True
                logger.info("Enhanced AI Service: OpenAI initialized")
        except Exception as e:
            logger.error(f"Failed to initialize OpenAI: {e}")
            self.openai_enabled = False
    
    def _init_ollama(self):
        """Initialize Ollama service"""
        try:
            from services.ollama_service import OllamaService
            self.ollama_service = OllamaService()
            self.ollama_enabled = self.ollama_service.enabled if self.ollama_service else False
            if self.ollama_enabled:
                logger.info("Enhanced AI Service: Ollama initialized")
        except Exception as e:
            logger.error(f"Failed to initialize Ollama: {e}")
            self.ollama_enabled = False
    
    def classify_task_complexity(self, message: str) -> str:
        """
        Classify the complexity of a task based on the message
        
        Returns:
            'simple', 'moderate', 'complex', 'code', or 'analysis'
        """
        message_lower = message.lower()
        
        code_indicators = ['code', 'script', 'function', 'class', 'debug', 'error in', 'fix the', 'write a']
        if any(indicator in message_lower for indicator in code_indicators):
            return 'code'
        
        analysis_indicators = ['analyze', 'explain', 'why', 'compare', 'evaluate', 'review', 'assess']
        if any(indicator in message_lower for indicator in analysis_indicators):
            return 'analysis'
        
        simple_indicators = ['hi', 'hello', 'status', 'list', 'show', 'what is', 'help']
        if any(indicator in message_lower for indicator in simple_indicators) or len(message) < 50:
            return 'simple'
        
        complex_indicators = ['architecture', 'design', 'optimize', 'refactor', 'implement', 'create system']
        if any(indicator in message_lower for indicator in complex_indicators) or len(message) > 500:
            return 'complex'
        
        return 'moderate'
    
    def select_model(self, task_complexity: str, preferred_model: str = None) -> Tuple[str, str]:
        """
        Select the best model for a task based on complexity and availability
        
        Args:
            task_complexity: The complexity classification
            preferred_model: Optional preferred model
            
        Returns:
            Tuple of (model_id, provider)
        """
        if preferred_model:
            if preferred_model.startswith('ollama/'):
                if self.ollama_enabled:
                    return (preferred_model, 'ollama')
            elif self.openai_enabled:
                return (preferred_model, 'openai')
        
        candidates = TASK_COMPLEXITY_ROUTING.get(task_complexity, ['gpt-4o'])
        
        for model in candidates:
            if model.startswith('ollama/'):
                if self.ollama_enabled:
                    return (model, 'ollama')
            else:
                if self.openai_enabled:
                    return (model, 'openai')
        
        if self.openai_enabled:
            return ('gpt-4o', 'openai')
        if self.ollama_enabled:
            return ('ollama/llama2', 'ollama')
        
        return (None, None)
    
    def get_cached_response(self, query: str) -> Optional[str]:
        """
        Check if there's a cached response for a query
        
        Args:
            query: The user query
            
        Returns:
            Cached response or None
        """
        query_hash = hashlib.sha256(query.lower().strip().encode()).hexdigest()
        
        if query_hash in self._response_cache:
            cached = self._response_cache[query_hash]
            if datetime.utcnow() < cached.get('expires_at', datetime.utcnow()):
                cached['hit_count'] = cached.get('hit_count', 0) + 1
                return cached.get('response')
            else:
                del self._response_cache[query_hash]
        
        try:
            from models.jarvis_ai import ResponseCache
            
            with db_service.get_session() as session:
                cache_entry = session.query(ResponseCache).filter(
                    ResponseCache.query_hash == query_hash
                ).first()
                
                if cache_entry:
                    if cache_entry.expires_at is None or cache_entry.expires_at > datetime.utcnow():
                        cache_entry.hit_count += 1
                        cache_entry.last_hit_at = datetime.utcnow()
                        
                        self._response_cache[query_hash] = {
                            'response': cache_entry.response,
                            'expires_at': cache_entry.expires_at or datetime.utcnow() + timedelta(hours=1),
                            'hit_count': cache_entry.hit_count
                        }
                        
                        return cache_entry.response
        except Exception as e:
            logger.debug(f"Cache lookup failed: {e}")
        
        return None
    
    def cache_response(
        self,
        query: str,
        response: str,
        model: str,
        category: str = None,
        ttl_hours: int = 24
    ):
        """
        Cache a response for future use
        
        Args:
            query: The user query
            response: The AI response
            model: Model used to generate the response
            category: Optional category for the query
            ttl_hours: Time to live in hours
        """
        query_hash = hashlib.sha256(query.lower().strip().encode()).hexdigest()
        expires_at = datetime.utcnow() + timedelta(hours=ttl_hours)
        
        self._response_cache[query_hash] = {
            'response': response,
            'expires_at': expires_at,
            'hit_count': 0
        }
        
        if len(self._response_cache) > self._cache_max_size:
            oldest_key = min(self._response_cache.keys(), 
                           key=lambda k: self._response_cache[k].get('hit_count', 0))
            del self._response_cache[oldest_key]
        
        try:
            from models.jarvis_ai import ResponseCache
            
            pattern = query[:100] if len(query) > 100 else query
            
            with db_service.get_session() as session:
                existing = session.query(ResponseCache).filter(
                    ResponseCache.query_hash == query_hash
                ).first()
                
                if existing:
                    existing.response = response
                    existing.response_model = model
                    existing.updated_at = datetime.utcnow()
                    existing.expires_at = expires_at
                else:
                    cache_entry = ResponseCache(
                        query_hash=query_hash,
                        query_pattern=pattern,
                        query_category=category,
                        original_query=query,
                        response=response,
                        response_model=model,
                        expires_at=expires_at
                    )
                    session.add(cache_entry)
        except Exception as e:
            logger.debug(f"Failed to persist cache: {e}")
    
    def get_offline_response(self, message: str) -> Optional[str]:
        """
        Get an offline fallback response for common queries
        
        Args:
            message: The user message
            
        Returns:
            Offline response or None
        """
        message_lower = message.lower()
        
        if any(g in message_lower for g in ['hello', 'hi', 'hey']):
            return OFFLINE_RESPONSES['greeting']
        if any(h in message_lower for h in ['help', 'what can you']):
            return OFFLINE_RESPONSES['help']
        if 'status' in message_lower:
            return OFFLINE_RESPONSES['status']
        if 'restart' in message_lower:
            return OFFLINE_RESPONSES['restart']
        
        return None
    
    def queue_request(
        self,
        query: str,
        request_type: str = 'chat',
        user_id: str = None,
        preferred_model: str = None,
        priority: int = 5
    ) -> Optional[int]:
        """
        Queue a request for later processing when AI is unavailable
        
        Args:
            query: The user query
            request_type: Type of request
            user_id: Optional user ID
            preferred_model: Optional preferred model
            priority: Priority (1-10, lower is higher priority)
            
        Returns:
            Queue ID or None
        """
        try:
            from models.jarvis_ai import RequestQueue
            
            with db_service.get_session() as session:
                request = RequestQueue(
                    request_type=request_type,
                    user_id=user_id,
                    query=query,
                    preferred_model=preferred_model,
                    priority=priority,
                    expires_at=datetime.utcnow() + timedelta(hours=24)
                )
                session.add(request)
                session.flush()
                return request.id
        except Exception as e:
            logger.error(f"Failed to queue request: {e}")
            return None
    
    def track_usage(
        self,
        model_id: str,
        provider: str,
        prompt_tokens: int = 0,
        completion_tokens: int = 0,
        response_time_ms: int = 0,
        request_type: str = 'chat',
        user_id: str = None,
        success: bool = True,
        error_message: str = None
    ):
        """
        Track token usage and costs for a model
        
        Args:
            model_id: Model identifier
            provider: Provider name
            prompt_tokens: Number of prompt tokens
            completion_tokens: Number of completion tokens
            response_time_ms: Response time in milliseconds
            request_type: Type of request
            user_id: Optional user ID
            success: Whether the request succeeded
            error_message: Optional error message
        """
        total_tokens = prompt_tokens + completion_tokens
        
        pricing = MODEL_PRICING.get(model_id, {'input': 0.01, 'output': 0.03})
        cost = (prompt_tokens / 1000 * pricing['input']) + (completion_tokens / 1000 * pricing['output'])
        
        try:
            from models.jarvis_ai import ModelUsage
            
            with db_service.get_session() as session:
                usage = ModelUsage(
                    model_id=model_id,
                    provider=provider,
                    request_type=request_type,
                    prompt_tokens=prompt_tokens,
                    completion_tokens=completion_tokens,
                    total_tokens=total_tokens,
                    estimated_cost_usd=cost,
                    response_time_ms=response_time_ms,
                    success=success,
                    error_message=error_message,
                    user_id=user_id
                )
                session.add(usage)
        except Exception as e:
            logger.debug(f"Failed to track usage: {e}")
    
    def get_usage_stats(
        self,
        days: int = 30,
        model_id: str = None,
        provider: str = None
    ) -> Dict:
        """
        Get usage statistics
        
        Args:
            days: Number of days to look back
            model_id: Optional filter by model
            provider: Optional filter by provider
            
        Returns:
            Usage statistics
        """
        try:
            from models.jarvis_ai import ModelUsage
            from sqlalchemy import func
            
            cutoff = datetime.utcnow() - timedelta(days=days)
            
            with db_service.get_session() as session:
                query = session.query(
                    ModelUsage.model_id,
                    ModelUsage.provider,
                    func.count(ModelUsage.id).label('request_count'),
                    func.sum(ModelUsage.total_tokens).label('total_tokens'),
                    func.sum(ModelUsage.estimated_cost_usd).label('total_cost'),
                    func.avg(ModelUsage.response_time_ms).label('avg_response_time')
                ).filter(ModelUsage.timestamp >= cutoff)
                
                if model_id:
                    query = query.filter(ModelUsage.model_id == model_id)
                if provider:
                    query = query.filter(ModelUsage.provider == provider)
                
                results = query.group_by(ModelUsage.model_id, ModelUsage.provider).all()
                
                stats = {
                    'period_days': days,
                    'models': [],
                    'totals': {
                        'requests': 0,
                        'tokens': 0,
                        'cost_usd': 0.0
                    }
                }
                
                for row in results:
                    model_stats = {
                        'model_id': row.model_id,
                        'provider': row.provider,
                        'request_count': row.request_count,
                        'total_tokens': row.total_tokens or 0,
                        'total_cost_usd': float(row.total_cost or 0),
                        'avg_response_time_ms': float(row.avg_response_time or 0)
                    }
                    stats['models'].append(model_stats)
                    stats['totals']['requests'] += row.request_count
                    stats['totals']['tokens'] += row.total_tokens or 0
                    stats['totals']['cost_usd'] += float(row.total_cost or 0)
                
                return stats
        except Exception as e:
            logger.error(f"Failed to get usage stats: {e}")
            return {'error': str(e)}
    
    def chat(
        self,
        message: str,
        conversation_history: List[Dict] = None,
        model: str = None,
        use_cache: bool = True,
        user_id: str = None,
        request_type: str = 'chat'
    ) -> Dict:
        """
        Enhanced chat with multi-model routing and fallbacks
        
        Args:
            message: User message
            conversation_history: Previous messages
            model: Optional preferred model
            use_cache: Whether to use response cache
            user_id: Optional user ID
            request_type: Type of request
            
        Returns:
            Dict with response, model used, and metadata
        """
        start_time = time.time()
        
        if use_cache:
            cached = self.get_cached_response(message)
            if cached:
                return {
                    'success': True,
                    'response': cached,
                    'model': 'cache',
                    'provider': 'cache',
                    'cached': True,
                    'response_time_ms': int((time.time() - start_time) * 1000)
                }
        
        complexity = self.classify_task_complexity(message)
        selected_model, provider = self.select_model(complexity, model)
        
        if not selected_model:
            offline = self.get_offline_response(message)
            if offline:
                return {
                    'success': True,
                    'response': offline,
                    'model': 'offline',
                    'provider': 'offline',
                    'offline': True,
                    'response_time_ms': int((time.time() - start_time) * 1000)
                }
            
            queue_id = self.queue_request(message, request_type, user_id, model)
            return {
                'success': False,
                'error': 'AI service unavailable',
                'queued': queue_id is not None,
                'queue_id': queue_id,
                'offline_response': OFFLINE_RESPONSES['error']
            }
        
        try:
            if provider == 'ollama':
                response = self._chat_ollama(message, conversation_history, selected_model)
            else:
                response = self._chat_openai(message, conversation_history, selected_model)
            
            response_time_ms = int((time.time() - start_time) * 1000)
            
            prompt_tokens = len(message.split()) * 1.3
            completion_tokens = len(response.split()) * 1.3
            
            self.track_usage(
                model_id=selected_model,
                provider=provider,
                prompt_tokens=int(prompt_tokens),
                completion_tokens=int(completion_tokens),
                response_time_ms=response_time_ms,
                request_type=request_type,
                user_id=user_id,
                success=True
            )
            
            if use_cache and len(response) > 50:
                self.cache_response(message, response, selected_model, complexity)
            
            return {
                'success': True,
                'response': response,
                'model': selected_model,
                'provider': provider,
                'complexity': complexity,
                'response_time_ms': response_time_ms
            }
            
        except Exception as e:
            logger.error(f"Chat error with {selected_model}: {e}")
            
            self.track_usage(
                model_id=selected_model,
                provider=provider,
                request_type=request_type,
                user_id=user_id,
                success=False,
                error_message=str(e)
            )
            
            offline = self.get_offline_response(message)
            if offline:
                return {
                    'success': True,
                    'response': offline,
                    'model': 'offline',
                    'provider': 'offline',
                    'offline': True,
                    'original_error': str(e),
                    'response_time_ms': int((time.time() - start_time) * 1000)
                }
            
            return {
                'success': False,
                'error': str(e),
                'model': selected_model,
                'provider': provider
            }
    
    def _chat_openai(
        self,
        message: str,
        conversation_history: List[Dict],
        model: str
    ) -> str:
        """Execute chat with OpenAI"""
        messages = [
            {"role": "system", "content": """You are Jarvis, an AI-first homelab copilot assistant. You help with:
- Docker container management and troubleshooting
- Server health monitoring and diagnostics
- Network configuration and debugging
- Log analysis and error resolution
- Service deployment and orchestration

Be concise, practical, and action-oriented. When diagnosing issues, suggest specific commands or checks the user can perform.

Format your responses using Markdown for better readability."""}
        ]
        
        if conversation_history:
            messages.extend(conversation_history)
        
        messages.append({"role": "user", "content": message})
        
        response = self.openai_client.chat.completions.create(
            model=model,
            messages=messages,
            max_tokens=2048
        )
        
        return response.choices[0].message.content or "No response generated"
    
    def _chat_ollama(
        self,
        message: str,
        conversation_history: List[Dict],
        model: str
    ) -> str:
        """Execute chat with Ollama"""
        model_name = model.replace("ollama/", "")
        
        messages = [
            {"role": "system", "content": """You are Jarvis, an AI-first homelab copilot assistant. You help with:
- Docker container management and troubleshooting
- Server health monitoring and diagnostics
- Network configuration and debugging
- Log analysis and error resolution
- Service deployment and orchestration

Be concise, practical, and action-oriented."""}
        ]
        
        if conversation_history:
            messages.extend(conversation_history)
        
        messages.append({"role": "user", "content": message})
        
        response_parts = list(self.ollama_service.chat(model_name, messages, stream=False))
        return ''.join(response_parts) if response_parts else "No response generated"
    
    def get_available_models(self) -> List[Dict]:
        """Get list of available models"""
        models = []
        
        if self.openai_enabled:
            models.extend([
                {
                    "id": "gpt-4o",
                    "name": "GPT-4o (OpenAI)",
                    "description": "Latest OpenAI model - Best for complex reasoning",
                    "provider": "openai",
                    "available": True
                },
                {
                    "id": "gpt-4o-mini",
                    "name": "GPT-4o Mini (OpenAI)",
                    "description": "Fast and cost-effective for simple tasks",
                    "provider": "openai",
                    "available": True
                }
            ])
        
        if self.ollama_enabled and self.ollama_service:
            try:
                ollama_models = self.ollama_service.list_models()
                for model in ollama_models:
                    models.append({
                        "id": f"ollama/{model['name']}",
                        "name": f"{model['name']} (Local)",
                        "description": "Local Ollama model - No API costs",
                        "provider": "ollama",
                        "available": True
                    })
            except Exception:
                pass
        
        return models


enhanced_ai_service = EnhancedAIService()

__all__ = ['EnhancedAIService', 'enhanced_ai_service', 'MODEL_PRICING', 'TASK_COMPLEXITY_ROUTING']
