"""
IDE Service - Multi-Model Orchestration and Code Analysis
Provides advanced AI-powered code assistance for IDE integration
"""
import os
import logging
import difflib
from typing import List, Dict, Optional, Any
from openai import OpenAI, AuthenticationError, RateLimitError, APIError, APIConnectionError

logger = logging.getLogger(__name__)


class IDEService:
    """
    Advanced IDE service providing multi-model orchestration,
    code analysis, generation, and diff utilities
    """
    
    def __init__(self):
        self.client: Optional[OpenAI] = None
        self.enabled: bool = False
        
        ai_api_key = os.environ.get('AI_INTEGRATIONS_OPENAI_API_KEY')
        ai_base_url = os.environ.get('AI_INTEGRATIONS_OPENAI_BASE_URL')
        
        if ai_api_key and ai_base_url:
            self.client = OpenAI(
                api_key=ai_api_key,
                base_url=ai_base_url
            )
            self.enabled = True
            logger.info("IDE Service initialized with AI integration")
        else:
            logger.warning("IDE Service not initialized - missing AI credentials")
    
    def chat(self, message: str, context: Optional[Dict[str, str]] = None, 
             conversation_history: Optional[List[Dict[str, str]]] = None,
             model: str = "gpt-5") -> Dict[str, Any]:
        """
        Chat with AI assistant with optional code context
        
        Args:
            message: User's message
            context: Optional context with file, selection, language
            conversation_history: Previous messages in conversation
            model: AI model to use (default: gpt-5)
        
        Returns:
            Dict with response, model, and token count
        """
        if not self.enabled or self.client is None:
            return {
                'success': False,
                'error': 'AI service not configured',
                'message': 'Please configure AI credentials'
            }
        
        try:
            messages: List[Dict[str, str]] = [
                {
                    "role": "system",
                    "content": """You are Jarvis, an expert AI coding assistant integrated into the IDE.
You help developers with:
- Code review and analysis
- Bug detection and fixes
- Code generation and refactoring
- Best practices and optimization
- Architecture recommendations

Be concise, practical, and provide code examples when helpful."""
                }
            ]
            
            # Add conversation history
            if conversation_history:
                messages.extend(conversation_history)
            
            # Build user message with context
            user_message = message
            if context:
                context_parts = []
                if context.get('file'):
                    context_parts.append(f"File: {context['file']}")
                if context.get('language'):
                    context_parts.append(f"Language: {context['language']}")
                if context.get('selection'):
                    context_parts.append(f"Selected code:\n```{context.get('language', '')}\n{context['selection']}\n```")
                
                if context_parts:
                    user_message = "\n".join(context_parts) + "\n\n" + message
            
            messages.append({"role": "user", "content": user_message})
            
            response = self.client.chat.completions.create(
                model=model,
                messages=messages,  # type: ignore
                max_completion_tokens=2048
            )
            
            return {
                'success': True,
                'response': response.choices[0].message.content or "No response generated",
                'model': model,
                'tokens': response.usage.total_tokens if response.usage else 0
            }
        
        except AuthenticationError as e:
            logger.error(f"Authentication error in IDE chat: {e}")
            return {
                'success': False,
                'error': 'Authentication failed',
                'message': 'Invalid API credentials'
            }
        except RateLimitError as e:
            logger.error(f"Rate limit error in IDE chat: {e}")
            return {
                'success': False,
                'error': 'Rate limit exceeded',
                'message': 'Too many requests, please try again later'
            }
        except Exception as e:
            logger.error(f"Error in IDE chat: {e}", exc_info=True)
            return {
                'success': False,
                'error': 'Unexpected error',
                'message': str(e)
            }
    
    def analyze_code(self, code: str, language: str, action: str = 'analyze') -> Dict[str, Any]:
        """
        Analyze code structure, patterns, and suggest improvements
        
        Args:
            code: Code to analyze
            language: Programming language
            action: Type of analysis (analyze, explain, optimize)
        
        Returns:
            Dict with analysis and suggestions
        """
        if not self.enabled or self.client is None:
            return {
                'success': False,
                'error': 'AI service not configured'
            }
        
        try:
            action_prompts = {
                'analyze': """Analyze this code and provide:
1. Code structure overview
2. Potential bugs or issues
3. Security concerns
4. Performance considerations
5. Specific improvement suggestions""",
                
                'explain': """Explain this code in detail:
1. What does this code do?
2. How does it work?
3. Key concepts used
4. Any patterns or best practices""",
                
                'optimize': """Review this code for optimization:
1. Performance bottlenecks
2. Memory efficiency improvements
3. Algorithm optimizations
4. Best practice recommendations
5. Refactoring suggestions"""
            }
            
            prompt = f"""{action_prompts.get(action, action_prompts['analyze'])}

Language: {language}

```{language}
{code}
```

Provide actionable suggestions in a structured format."""
            
            response = self.client.chat.completions.create(
                model="gpt-5",
                messages=[
                    {
                        "role": "system",
                        "content": "You are an expert code reviewer and software architect. Provide detailed, actionable feedback."
                    },
                    {
                        "role": "user",
                        "content": prompt
                    }
                ],
                max_completion_tokens=2048
            )
            
            analysis_text = response.choices[0].message.content or "No analysis generated"
            
            # Extract suggestions from analysis (simple line-based extraction)
            suggestions = []
            for line in analysis_text.split('\n'):
                line = line.strip()
                if line and (line.startswith('-') or line.startswith('•') or 
                           line.startswith('*') or line[0].isdigit()):
                    suggestions.append(line.lstrip('-•*0123456789. '))
            
            return {
                'success': True,
                'analysis': analysis_text,
                'suggestions': suggestions[:10]  # Limit to top 10
            }
        
        except Exception as e:
            logger.error(f"Error in code analysis: {e}", exc_info=True)
            return {
                'success': False,
                'error': 'Analysis failed',
                'message': str(e)
            }
    
    def generate_code(self, description: str, language: str, 
                     context: Optional[str] = None) -> Dict[str, Any]:
        """
        Generate code from natural language description
        
        Args:
            description: Natural language description of desired code
            language: Target programming language
            context: Optional surrounding code context
        
        Returns:
            Dict with generated code and explanation
        """
        if not self.enabled or self.client is None:
            return {
                'success': False,
                'error': 'AI service not configured'
            }
        
        try:
            prompt = f"""Generate {language} code for the following requirement:

{description}"""
            
            if context:
                prompt += f"\n\nExisting context:\n```{language}\n{context}\n```"
            
            prompt += f"\n\nProvide:\n1. Clean, working {language} code\n2. Brief explanation of the implementation\n3. Any important notes or considerations"
            
            response = self.client.chat.completions.create(
                model="gpt-5",
                messages=[
                    {
                        "role": "system",
                        "content": f"You are an expert {language} developer. Generate clean, efficient, well-documented code."
                    },
                    {
                        "role": "user",
                        "content": prompt
                    }
                ],
                max_completion_tokens=2048
            )
            
            result = response.choices[0].message.content or ""
            
            # Extract code blocks
            code_blocks = []
            explanation_parts = []
            in_code = False
            current_block = []
            
            for line in result.split('\n'):
                if line.strip().startswith('```'):
                    if in_code:
                        code_blocks.append('\n'.join(current_block))
                        current_block = []
                    in_code = not in_code
                    continue
                
                if in_code:
                    current_block.append(line)
                else:
                    explanation_parts.append(line)
            
            generated_code = code_blocks[0] if code_blocks else result
            explanation = '\n'.join(explanation_parts).strip() or "Code generated successfully"
            
            return {
                'success': True,
                'code': generated_code,
                'explanation': explanation
            }
        
        except Exception as e:
            logger.error(f"Error generating code: {e}", exc_info=True)
            return {
                'success': False,
                'error': 'Code generation failed',
                'message': str(e)
            }
    
    def generate_diff(self, original: str, generated: str, file: str) -> Dict[str, Any]:
        """
        Generate diff preview between original and generated code
        
        Args:
            original: Original code
            generated: Generated/modified code
            file: File path (for context)
        
        Returns:
            Dict with diff, preview, and applicability status
        """
        try:
            original_lines = original.splitlines(keepends=True)
            generated_lines = generated.splitlines(keepends=True)
            
            # Generate unified diff
            diff = list(difflib.unified_diff(
                original_lines,
                generated_lines,
                fromfile=f"a/{file}",
                tofile=f"b/{file}",
                lineterm=''
            ))
            
            diff_text = ''.join(diff)
            
            # Create preview (show changes with context)
            preview_lines = []
            for line in diff:
                if line.startswith('---') or line.startswith('+++'):
                    preview_lines.append(line)
                elif line.startswith('@@'):
                    preview_lines.append('\n' + line)
                elif line.startswith('+'):
                    preview_lines.append(f"  {line}")
                elif line.startswith('-'):
                    preview_lines.append(f"  {line}")
                else:
                    preview_lines.append(f"  {line}")
            
            preview = '\n'.join(preview_lines[:100])  # Limit preview size
            
            # Check if diff can be applied
            can_apply = len(diff) > 0 and original != generated
            
            return {
                'success': True,
                'diff': diff_text,
                'preview': preview,
                'canApply': can_apply,
                'changes': {
                    'additions': sum(1 for line in diff if line.startswith('+')),
                    'deletions': sum(1 for line in diff if line.startswith('-'))
                }
            }
        
        except Exception as e:
            logger.error(f"Error generating diff: {e}", exc_info=True)
            return {
                'success': False,
                'error': 'Diff generation failed',
                'message': str(e),
                'canApply': False
            }
    
    def collaborate(self, question: str, code: str, 
                   models: Optional[List[str]] = None) -> Dict[str, Any]:
        """
        Orchestrate multiple AI models to discuss and analyze code
        
        Args:
            question: Question to ask about the code
            code: Code to analyze
            models: List of models to use (default: ['gpt-5', 'gpt-4'])
        
        Returns:
            Dict with conversation and consensus
        """
        if not self.enabled or self.client is None:
            return {
                'success': False,
                'error': 'AI service not configured'
            }
        
        if models is None:
            models = ['gpt-5', 'gpt-4']
        
        try:
            conversation = []
            responses = []
            
            # Get response from each model
            for model in models:
                try:
                    prompt = f"""Analyze this code and answer the question:

Question: {question}

Code:
```
{code}
```

Provide your expert opinion."""
                    
                    response = self.client.chat.completions.create(
                        model=model,
                        messages=[
                            {
                                "role": "system",
                                "content": f"You are an expert code reviewer using {model}. Provide insightful analysis."
                            },
                            {
                                "role": "user",
                                "content": prompt
                            }
                        ],
                        max_completion_tokens=1024
                    )
                    
                    response_text = response.choices[0].message.content or "No response"
                    responses.append(response_text)
                    
                    conversation.append({
                        'model': model,
                        'response': response_text
                    })
                
                except Exception as e:
                    logger.warning(f"Model {model} failed: {e}")
                    conversation.append({
                        'model': model,
                        'response': f"Error: {str(e)}",
                        'error': True
                    })
            
            # Generate consensus from all responses
            if len(responses) > 1:
                consensus_prompt = f"""Based on these expert opinions, provide a consensus summary:

Question: {question}

Opinions:
{chr(10).join([f'{i+1}. {r}' for i, r in enumerate(responses)])}

Synthesize the key points and provide a balanced conclusion."""
                
                consensus_response = self.client.chat.completions.create(
                    model="gpt-5",
                    messages=[
                        {
                            "role": "system",
                            "content": "You are synthesizing expert opinions into a clear consensus."
                        },
                        {
                            "role": "user",
                            "content": consensus_prompt
                        }
                    ],
                    max_completion_tokens=1024
                )
                
                consensus = consensus_response.choices[0].message.content or "No consensus reached"
            else:
                consensus = responses[0] if responses else "No responses available"
            
            return {
                'success': True,
                'conversation': conversation,
                'consensus': consensus
            }
        
        except Exception as e:
            logger.error(f"Error in model collaboration: {e}", exc_info=True)
            return {
                'success': False,
                'error': 'Collaboration failed',
                'message': str(e)
            }


# Singleton instance
ide_service = IDEService()
