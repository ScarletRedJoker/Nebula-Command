"""
Studio AI Service - AI Code Copilot for Nebula Studio
Provides code generation, explanation, refactoring, debugging with streaming support
"""

import os
import json
import logging
from typing import Dict, Any, Optional, List, Generator
from openai import OpenAI

logger = logging.getLogger(__name__)


class StudioAIService:
    """AI-powered code assistance for Nebula Studio"""
    
    LANGUAGE_PROMPTS = {
        'python': {
            'name': 'Python',
            'style': 'PEP 8 compliant, with type hints, docstrings, and proper exception handling',
            'frameworks': ['Flask', 'FastAPI', 'Django', 'SQLAlchemy', 'Pydantic'],
        },
        'javascript': {
            'name': 'JavaScript',
            'style': 'Modern ES6+, with JSDoc comments, async/await patterns',
            'frameworks': ['Express', 'React', 'Vue', 'Node.js'],
        },
        'typescript': {
            'name': 'TypeScript',
            'style': 'Strict TypeScript with proper interfaces, generics, and type guards',
            'frameworks': ['Express', 'React', 'Next.js', 'NestJS'],
        },
        'rust': {
            'name': 'Rust',
            'style': 'Idiomatic Rust with proper error handling using Result types, lifetime annotations',
            'frameworks': ['Actix', 'Rocket', 'Tokio'],
        },
        'go': {
            'name': 'Go',
            'style': 'Idiomatic Go with proper error handling, goroutines for concurrency',
            'frameworks': ['Gin', 'Echo', 'Chi'],
        },
        'cpp': {
            'name': 'C++',
            'style': 'Modern C++17/20 with RAII, smart pointers, const correctness',
            'frameworks': ['Boost', 'Qt', 'STL'],
        },
        'csharp': {
            'name': 'C#',
            'style': 'Modern C# with async/await, LINQ, nullable reference types',
            'frameworks': ['.NET', 'ASP.NET Core', 'Entity Framework'],
        },
    }
    
    def __init__(self):
        try:
            api_key = os.getenv('AI_INTEGRATIONS_OPENAI_API_KEY') or os.getenv('OPENAI_API_KEY')
            base_url = os.getenv('AI_INTEGRATIONS_OPENAI_BASE_URL') or os.getenv('OPENAI_BASE_URL', 'https://api.openai.com/v1')
            
            if not api_key:
                raise ValueError("No OpenAI API key found in environment")
            
            self.client = OpenAI(
                api_key=api_key,
                base_url=base_url
            )
            self.enabled = True
            logger.info("Studio AI Service initialized")
        except ValueError as e:
            self.client = None
            self.enabled = False
            logger.warning(f"Studio AI Service not initialized: {e}")
        except Exception as e:
            self.client = None
            self.enabled = False
            logger.error(f"Failed to initialize Studio AI Service: {e}")
    
    def _get_language_context(self, language: str) -> str:
        """Get language-specific context for prompts"""
        lang_info = self.LANGUAGE_PROMPTS.get(language, {
            'name': language.title(),
            'style': 'Clean, well-documented code with proper error handling',
            'frameworks': [],
        })
        return f"""Language: {lang_info['name']}
Style: {lang_info['style']}
Common Frameworks: {', '.join(lang_info['frameworks']) if lang_info['frameworks'] else 'None specified'}"""
    
    def _build_project_context(self, project_files: Optional[List[Dict[str, str]]] = None) -> str:
        """Build context from project files"""
        if not project_files:
            return ""
        
        context_parts = ["\n## Project Context\nThe following files are part of the project:\n"]
        for file_info in project_files[:5]:  # Limit to 5 files for context
            file_path = file_info.get('path', 'unknown')
            content = file_info.get('content', '')
            # Truncate long files
            if len(content) > 2000:
                content = content[:2000] + "\n... (truncated)"
            context_parts.append(f"\n### {file_path}\n```\n{content}\n```")
        
        return '\n'.join(context_parts)
    
    def generate_code(self, description: str, language: str = 'python',
                      project_files: Optional[List[Dict[str, str]]] = None,
                      stream: bool = True) -> Generator[str, None, None]:
        """
        Generate code from a description with streaming support
        
        Args:
            description: What code to generate
            language: Programming language
            project_files: Optional list of project files for context
            stream: Whether to stream the response
            
        Yields:
            SSE-formatted chunks of generated code
        """
        if not self.enabled or not self.client:
            yield f"data: {json.dumps({'error': 'AI service not available'})}\n\n"
            yield "data: [DONE]\n\n"
            return
        
        try:
            lang_context = self._get_language_context(language)
            project_context = self._build_project_context(project_files)
            
            system_prompt = f"""You are an expert code generator for Nebula Studio.

{lang_context}

Guidelines:
- Generate clean, production-ready code
- Include proper error handling
- Add helpful comments for complex logic
- Follow the language's best practices and conventions
- If generating a class or function, include usage examples in comments
{project_context}

Output Format:
- Return ONLY the code
- Use proper formatting and indentation
- If multiple files are needed, clearly separate them with file path comments"""

            messages = [
                {"role": "system", "content": system_prompt},
                {"role": "user", "content": f"Generate {language} code for: {description}"}
            ]
            
            if stream:
                response = self.client.chat.completions.create(
                    model="gpt-4o",
                    messages=messages,
                    max_tokens=4096,
                    stream=True
                )
                
                for chunk in response:
                    if chunk.choices[0].delta.content:
                        content = chunk.choices[0].delta.content
                        yield f"data: {json.dumps({'content': content, 'type': 'code'})}\n\n"
                
                yield "data: [DONE]\n\n"
            else:
                response = self.client.chat.completions.create(
                    model="gpt-4o",
                    messages=messages,
                    max_tokens=4096
                )
                code = response.choices[0].message.content or ""
                yield f"data: {json.dumps({'content': code, 'type': 'code', 'complete': True})}\n\n"
                yield "data: [DONE]\n\n"
                
        except Exception as e:
            logger.error(f"Error generating code: {e}")
            yield f"data: {json.dumps({'error': str(e)})}\n\n"
            yield "data: [DONE]\n\n"
    
    def explain_code(self, code: str, language: str = 'python',
                     stream: bool = True) -> Generator[str, None, None]:
        """
        Explain what a code snippet does
        
        Args:
            code: The code to explain
            language: Programming language
            stream: Whether to stream the response
            
        Yields:
            SSE-formatted chunks of explanation
        """
        if not self.enabled or not self.client:
            yield f"data: {json.dumps({'error': 'AI service not available'})}\n\n"
            yield "data: [DONE]\n\n"
            return
        
        try:
            system_prompt = """You are a code explanation expert for Nebula Studio.

Your task is to explain code clearly and concisely.

Output Format:
1. **Overview**: What does this code do? (1-2 sentences)
2. **Key Components**: List the main parts (functions, classes, etc.)
3. **How It Works**: Step-by-step explanation of the logic
4. **Usage Example**: How to use this code (if applicable)
5. **Potential Issues**: Any gotchas or things to watch out for

Use Markdown formatting for readability."""

            messages = [
                {"role": "system", "content": system_prompt},
                {"role": "user", "content": f"Explain this {language} code:\n\n```{language}\n{code}\n```"}
            ]
            
            if stream:
                response = self.client.chat.completions.create(
                    model="gpt-4o",
                    messages=messages,
                    max_tokens=2048,
                    stream=True
                )
                
                for chunk in response:
                    if chunk.choices[0].delta.content:
                        content = chunk.choices[0].delta.content
                        yield f"data: {json.dumps({'content': content, 'type': 'explanation'})}\n\n"
                
                yield "data: [DONE]\n\n"
            else:
                response = self.client.chat.completions.create(
                    model="gpt-4o",
                    messages=messages,
                    max_tokens=2048
                )
                explanation = response.choices[0].message.content or ""
                yield f"data: {json.dumps({'content': explanation, 'type': 'explanation', 'complete': True})}\n\n"
                yield "data: [DONE]\n\n"
                
        except Exception as e:
            logger.error(f"Error explaining code: {e}")
            yield f"data: {json.dumps({'error': str(e)})}\n\n"
            yield "data: [DONE]\n\n"
    
    def refactor_code(self, code: str, language: str = 'python',
                      instructions: str = "",
                      stream: bool = True) -> Generator[str, None, None]:
        """
        Refactor/improve code
        
        Args:
            code: The code to refactor
            language: Programming language
            instructions: Specific refactoring instructions
            stream: Whether to stream the response
            
        Yields:
            SSE-formatted chunks of refactored code
        """
        if not self.enabled or not self.client:
            yield f"data: {json.dumps({'error': 'AI service not available'})}\n\n"
            yield "data: [DONE]\n\n"
            return
        
        try:
            lang_context = self._get_language_context(language)
            
            refactor_goals = instructions if instructions else """
- Improve code readability and maintainability
- Optimize performance where possible
- Add proper error handling
- Follow best practices and conventions
- Add type hints/annotations where applicable
- Improve naming for clarity"""
            
            system_prompt = f"""You are a code refactoring expert for Nebula Studio.

{lang_context}

Refactoring Goals:
{refactor_goals}

Output Format:
First, provide the refactored code.
Then, add a comment block at the end explaining what changes were made and why.

Guidelines:
- Preserve the original functionality
- Make minimal but impactful changes
- Focus on clarity and maintainability
- Add helpful comments for complex changes"""

            messages = [
                {"role": "system", "content": system_prompt},
                {"role": "user", "content": f"Refactor this {language} code:\n\n```{language}\n{code}\n```"}
            ]
            
            if stream:
                response = self.client.chat.completions.create(
                    model="gpt-4o",
                    messages=messages,
                    max_tokens=4096,
                    stream=True
                )
                
                for chunk in response:
                    if chunk.choices[0].delta.content:
                        content = chunk.choices[0].delta.content
                        yield f"data: {json.dumps({'content': content, 'type': 'refactored_code'})}\n\n"
                
                yield "data: [DONE]\n\n"
            else:
                response = self.client.chat.completions.create(
                    model="gpt-4o",
                    messages=messages,
                    max_tokens=4096
                )
                refactored = response.choices[0].message.content or ""
                yield f"data: {json.dumps({'content': refactored, 'type': 'refactored_code', 'complete': True})}\n\n"
                yield "data: [DONE]\n\n"
                
        except Exception as e:
            logger.error(f"Error refactoring code: {e}")
            yield f"data: {json.dumps({'error': str(e)})}\n\n"
            yield "data: [DONE]\n\n"
    
    def debug_code(self, code: str, error_message: str = "",
                   language: str = 'python',
                   stream: bool = True) -> Generator[str, None, None]:
        """
        Debug code and suggest fixes
        
        Args:
            code: The code with issues
            error_message: Optional error message to help diagnose
            language: Programming language
            stream: Whether to stream the response
            
        Yields:
            SSE-formatted chunks of debug analysis and fixed code
        """
        if not self.enabled or not self.client:
            yield f"data: {json.dumps({'error': 'AI service not available'})}\n\n"
            yield "data: [DONE]\n\n"
            return
        
        try:
            error_context = f"\n\nError message:\n```\n{error_message}\n```" if error_message else ""
            
            system_prompt = """You are a debugging expert for Nebula Studio.

Your task is to:
1. Identify bugs and issues in the code
2. Explain what's wrong and why
3. Provide the fixed code
4. Suggest how to prevent similar issues

Output Format:
## Issue Analysis
[Explain what's wrong]

## Root Cause
[Explain why the error occurs]

## Fixed Code
```
[The corrected code]
```

## Prevention Tips
[How to avoid this in the future]"""

            user_message = f"Debug this {language} code:{error_context}\n\n```{language}\n{code}\n```"
            
            messages = [
                {"role": "system", "content": system_prompt},
                {"role": "user", "content": user_message}
            ]
            
            if stream:
                response = self.client.chat.completions.create(
                    model="gpt-4o",
                    messages=messages,
                    max_tokens=4096,
                    stream=True
                )
                
                for chunk in response:
                    if chunk.choices[0].delta.content:
                        content = chunk.choices[0].delta.content
                        yield f"data: {json.dumps({'content': content, 'type': 'debug_analysis'})}\n\n"
                
                yield "data: [DONE]\n\n"
            else:
                response = self.client.chat.completions.create(
                    model="gpt-4o",
                    messages=messages,
                    max_tokens=4096
                )
                analysis = response.choices[0].message.content or ""
                yield f"data: {json.dumps({'content': analysis, 'type': 'debug_analysis', 'complete': True})}\n\n"
                yield "data: [DONE]\n\n"
                
        except Exception as e:
            logger.error(f"Error debugging code: {e}")
            yield f"data: {json.dumps({'error': str(e)})}\n\n"
            yield "data: [DONE]\n\n"
    
    def generate_tests(self, code: str, language: str = 'python',
                       stream: bool = True) -> Generator[str, None, None]:
        """
        Generate unit tests for code
        
        Args:
            code: The code to generate tests for
            language: Programming language
            stream: Whether to stream the response
            
        Yields:
            SSE-formatted chunks of generated tests
        """
        if not self.enabled or not self.client:
            yield f"data: {json.dumps({'error': 'AI service not available'})}\n\n"
            yield "data: [DONE]\n\n"
            return
        
        try:
            test_frameworks = {
                'python': 'pytest',
                'javascript': 'Jest',
                'typescript': 'Jest with TypeScript',
                'rust': 'built-in test framework',
                'go': 'built-in testing package',
                'cpp': 'Google Test',
                'csharp': 'xUnit',
            }
            
            framework = test_frameworks.get(language, 'appropriate testing framework')
            
            system_prompt = f"""You are a testing expert for Nebula Studio.

Generate comprehensive unit tests using {framework}.

Guidelines:
- Test all public functions/methods
- Include edge cases and error scenarios
- Use descriptive test names
- Add comments explaining what each test verifies
- Include setup/teardown if needed
- Mock external dependencies appropriately

Output Format:
Return ONLY the test code that can be directly saved to a test file."""

            messages = [
                {"role": "system", "content": system_prompt},
                {"role": "user", "content": f"Generate tests for this {language} code:\n\n```{language}\n{code}\n```"}
            ]
            
            if stream:
                response = self.client.chat.completions.create(
                    model="gpt-4o",
                    messages=messages,
                    max_tokens=4096,
                    stream=True
                )
                
                for chunk in response:
                    if chunk.choices[0].delta.content:
                        content = chunk.choices[0].delta.content
                        yield f"data: {json.dumps({'content': content, 'type': 'tests'})}\n\n"
                
                yield "data: [DONE]\n\n"
            else:
                response = self.client.chat.completions.create(
                    model="gpt-4o",
                    messages=messages,
                    max_tokens=4096
                )
                tests = response.choices[0].message.content or ""
                yield f"data: {json.dumps({'content': tests, 'type': 'tests', 'complete': True})}\n\n"
                yield "data: [DONE]\n\n"
                
        except Exception as e:
            logger.error(f"Error generating tests: {e}")
            yield f"data: {json.dumps({'error': str(e)})}\n\n"
            yield "data: [DONE]\n\n"
    
    def chat(self, message: str, conversation_history: Optional[List[Dict[str, str]]] = None,
             project_files: Optional[List[Dict[str, str]]] = None,
             stream: bool = True) -> Generator[str, None, None]:
        """
        General chat with project context
        
        Args:
            message: User's message
            conversation_history: Previous messages in the conversation
            project_files: Optional list of project files for context
            stream: Whether to stream the response
            
        Yields:
            SSE-formatted chunks of response
        """
        if not self.enabled or not self.client:
            yield f"data: {json.dumps({'error': 'AI service not available'})}\n\n"
            yield "data: [DONE]\n\n"
            return
        
        try:
            project_context = self._build_project_context(project_files)
            
            system_prompt = f"""You are an AI coding assistant for Nebula Studio, a cloud-based IDE.

You help developers with:
- Writing and generating code
- Explaining concepts and code
- Debugging and troubleshooting
- Code review and suggestions
- Architecture and design decisions
- Best practices and conventions

{project_context}

Guidelines:
- Be concise but thorough
- Use code blocks with language tags
- Provide practical, actionable advice
- Ask clarifying questions if needed
- Reference project files when relevant

Format responses with Markdown for readability."""

            messages = [{"role": "system", "content": system_prompt}]
            
            if conversation_history:
                messages.extend(conversation_history)
            
            messages.append({"role": "user", "content": message})
            
            if stream:
                response = self.client.chat.completions.create(
                    model="gpt-4o",
                    messages=messages,
                    max_tokens=2048,
                    stream=True
                )
                
                for chunk in response:
                    if chunk.choices[0].delta.content:
                        content = chunk.choices[0].delta.content
                        yield f"data: {json.dumps({'content': content, 'type': 'chat'})}\n\n"
                
                yield "data: [DONE]\n\n"
            else:
                response = self.client.chat.completions.create(
                    model="gpt-4o",
                    messages=messages,
                    max_tokens=2048
                )
                reply = response.choices[0].message.content or ""
                yield f"data: {json.dumps({'content': reply, 'type': 'chat', 'complete': True})}\n\n"
                yield "data: [DONE]\n\n"
                
        except Exception as e:
            logger.error(f"Error in chat: {e}")
            yield f"data: {json.dumps({'error': str(e)})}\n\n"
            yield "data: [DONE]\n\n"
    
    def get_status(self) -> Dict[str, Any]:
        """Get service status"""
        return {
            'enabled': self.enabled,
            'supported_languages': list(self.LANGUAGE_PROMPTS.keys()),
            'capabilities': [
                'generate_code',
                'explain_code',
                'refactor_code',
                'debug_code',
                'generate_tests',
                'chat'
            ]
        }


# Singleton instance
studio_ai_service = StudioAIService()
