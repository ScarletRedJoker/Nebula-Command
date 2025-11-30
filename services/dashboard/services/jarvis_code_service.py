"""
Jarvis Code Service
AI-powered code operations for code-server integration
"""

import os
import json
import logging
import subprocess
from typing import Dict, Any, Optional, List, Tuple
from pathlib import Path
from openai import OpenAI

logger = logging.getLogger(__name__)

CODE_SERVER_WORKSPACE = os.environ.get('CODE_SERVER_WORKSPACE', '/config/workspace')

PROJECT_TEMPLATES = {
    'python-flask': {
        'name': 'Python Flask API',
        'description': 'Flask REST API with SQLAlchemy',
        'files': {
            'app.py': '''from flask import Flask, jsonify
from flask_cors import CORS

app = Flask(__name__)
CORS(app)

@app.route('/health')
def health():
    return jsonify({'status': 'healthy'})

@app.route('/api')
def api():
    return jsonify({'message': 'Hello from Flask!'})

if __name__ == '__main__':
    app.run(host='0.0.0.0', port=5000, debug=True)
''',
            'requirements.txt': '''flask
flask-cors
gunicorn
''',
            'Dockerfile': '''FROM python:3.11-slim
WORKDIR /app
COPY requirements.txt .
RUN pip install -r requirements.txt
COPY . .
EXPOSE 5000
CMD ["gunicorn", "--bind", "0.0.0.0:5000", "app:app"]
''',
            '.gitignore': '''__pycache__/
*.pyc
.env
venv/
'''
        }
    },
    'nodejs-express': {
        'name': 'Node.js Express API',
        'description': 'Express.js REST API with TypeScript',
        'files': {
            'package.json': '''{
  "name": "express-api",
  "version": "1.0.0",
  "main": "src/index.js",
  "scripts": {
    "start": "node src/index.js",
    "dev": "nodemon src/index.js"
  },
  "dependencies": {
    "express": "^4.18.2",
    "cors": "^2.8.5"
  },
  "devDependencies": {
    "nodemon": "^3.0.1"
  }
}
''',
            'src/index.js': '''const express = require('express');
const cors = require('cors');

const app = express();
app.use(cors());
app.use(express.json());

app.get('/health', (req, res) => {
    res.json({ status: 'healthy' });
});

app.get('/api', (req, res) => {
    res.json({ message: 'Hello from Express!' });
});

const PORT = process.env.PORT || 3000;
app.listen(PORT, () => {
    console.log(`Server running on port ${PORT}`);
});
''',
            'Dockerfile': '''FROM node:20-alpine
WORKDIR /app
COPY package*.json ./
RUN npm install
COPY . .
EXPOSE 3000
CMD ["npm", "start"]
''',
            '.gitignore': '''node_modules/
.env
dist/
'''
        }
    },
    'python-fastapi': {
        'name': 'Python FastAPI',
        'description': 'FastAPI with async support',
        'files': {
            'main.py': '''from fastapi import FastAPI
from fastapi.middleware.cors import CORSMiddleware

app = FastAPI(title="FastAPI Service")

app.add_middleware(
    CORSMiddleware,
    allow_origins=["*"],
    allow_credentials=True,
    allow_methods=["*"],
    allow_headers=["*"],
)

@app.get("/health")
async def health():
    return {"status": "healthy"}

@app.get("/api")
async def api():
    return {"message": "Hello from FastAPI!"}
''',
            'requirements.txt': '''fastapi
uvicorn[standard]
''',
            'Dockerfile': '''FROM python:3.11-slim
WORKDIR /app
COPY requirements.txt .
RUN pip install -r requirements.txt
COPY . .
EXPOSE 8000
CMD ["uvicorn", "main:app", "--host", "0.0.0.0", "--port", "8000"]
''',
            '.gitignore': '''__pycache__/
*.pyc
.env
venv/
'''
        }
    },
    'static-site': {
        'name': 'Static Website',
        'description': 'HTML/CSS/JS static site',
        'files': {
            'index.html': '''<!DOCTYPE html>
<html lang="en">
<head>
    <meta charset="UTF-8">
    <meta name="viewport" content="width=device-width, initial-scale=1.0">
    <title>My Website</title>
    <link rel="stylesheet" href="css/style.css">
</head>
<body>
    <header>
        <h1>Welcome</h1>
    </header>
    <main>
        <p>Your content here</p>
    </main>
    <script src="js/main.js"></script>
</body>
</html>
''',
            'css/style.css': '''* {
    margin: 0;
    padding: 0;
    box-sizing: border-box;
}

body {
    font-family: -apple-system, BlinkMacSystemFont, 'Segoe UI', Roboto, sans-serif;
    line-height: 1.6;
    color: #333;
    background: #f5f5f5;
}

header {
    background: linear-gradient(135deg, #667eea 0%, #764ba2 100%);
    color: white;
    padding: 2rem;
    text-align: center;
}

main {
    max-width: 1200px;
    margin: 2rem auto;
    padding: 0 1rem;
}
''',
            'js/main.js': '''document.addEventListener('DOMContentLoaded', () => {
    console.log('Site loaded');
});
''',
            '.gitignore': '''.DS_Store
'''
        }
    }
}


class JarvisCodeService:
    """AI-powered code operations for Jarvis"""
    
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
            env_type = "Replit" if os.getenv('REPL_ID') else "Production"
            logger.info(f"Jarvis Code Service initialized with {env_type} OpenAI credentials")
        except ValueError as e:
            self.client = None
            self.enabled = False
            logger.warning(f"Jarvis Code Service not initialized: {e}")
        except Exception as e:
            self.client = None
            self.enabled = False
            logger.error(f"Failed to initialize Jarvis Code Service: {e}")
        
        self.workspace = CODE_SERVER_WORKSPACE
    
    def analyze_project(self, project_path: str) -> Dict[str, Any]:
        """
        Analyze project structure, dependencies, and tech stack
        
        Args:
            project_path: Relative path from workspace root
            
        Returns:
            Analysis results including structure, dependencies, tech stack
        """
        full_path = os.path.join(self.workspace, project_path)
        
        if not os.path.exists(full_path):
            return {
                'success': False,
                'error': f'Project path does not exist: {project_path}'
            }
        
        try:
            analysis = {
                'success': True,
                'project_path': project_path,
                'files': [],
                'directories': [],
                'tech_stack': [],
                'dependencies': {},
                'structure': {},
                'has_git': False,
                'has_docker': False,
                'entry_points': []
            }
            
            for root, dirs, files in os.walk(full_path):
                dirs[:] = [d for d in dirs if d not in ['.git', 'node_modules', '__pycache__', 'venv', '.venv', 'dist', 'build']]
                
                rel_root = os.path.relpath(root, full_path)
                if rel_root == '.':
                    rel_root = ''
                
                for d in dirs:
                    dir_path = os.path.join(rel_root, d) if rel_root else d
                    analysis['directories'].append(dir_path)
                
                for f in files:
                    file_path = os.path.join(rel_root, f) if rel_root else f
                    analysis['files'].append(file_path)
            
            if '.git' in os.listdir(full_path):
                analysis['has_git'] = True
            
            if 'Dockerfile' in os.listdir(full_path) or 'docker-compose.yml' in os.listdir(full_path):
                analysis['has_docker'] = True
            
            if 'package.json' in analysis['files']:
                analysis['tech_stack'].append('Node.js')
                pkg_path = os.path.join(full_path, 'package.json')
                try:
                    with open(pkg_path, 'r') as f:
                        pkg_data = json.load(f)
                        analysis['dependencies']['npm'] = list(pkg_data.get('dependencies', {}).keys())
                        if 'express' in analysis['dependencies']['npm']:
                            analysis['tech_stack'].append('Express.js')
                        if 'react' in analysis['dependencies']['npm']:
                            analysis['tech_stack'].append('React')
                        if 'vue' in analysis['dependencies']['npm']:
                            analysis['tech_stack'].append('Vue.js')
                        if 'next' in analysis['dependencies']['npm']:
                            analysis['tech_stack'].append('Next.js')
                        analysis['entry_points'].extend(
                            list(pkg_data.get('scripts', {}).keys())
                        )
                except Exception:
                    pass
            
            if 'requirements.txt' in analysis['files']:
                analysis['tech_stack'].append('Python')
                req_path = os.path.join(full_path, 'requirements.txt')
                try:
                    with open(req_path, 'r') as f:
                        deps = [line.strip().split('==')[0].split('>=')[0] for line in f if line.strip() and not line.startswith('#')]
                        analysis['dependencies']['pip'] = deps
                        if 'flask' in deps or 'Flask' in deps:
                            analysis['tech_stack'].append('Flask')
                        if 'fastapi' in deps or 'FastAPI' in deps:
                            analysis['tech_stack'].append('FastAPI')
                        if 'django' in deps or 'Django' in deps:
                            analysis['tech_stack'].append('Django')
                except Exception:
                    pass
            
            if 'Cargo.toml' in analysis['files']:
                analysis['tech_stack'].append('Rust')
            
            if 'go.mod' in analysis['files']:
                analysis['tech_stack'].append('Go')
            
            for f in ['app.py', 'main.py', 'index.js', 'server.js', 'main.go', 'main.rs']:
                if f in analysis['files']:
                    analysis['entry_points'].append(f)
            
            if self.enabled and self.client:
                try:
                    file_list = '\n'.join(analysis['files'][:50])
                    tech_list = ', '.join(analysis['tech_stack'])
                    
                    prompt = f"""Analyze this project structure and provide insights:

Files:
{file_list}

Detected Tech Stack: {tech_list}

Provide a brief analysis including:
1. Project type (web app, API, CLI, library, etc.)
2. Architecture observations
3. Recommendations for improvement
4. Any potential issues or missing best practices

Be concise and actionable."""

                    response = self.client.chat.completions.create(
                        model="gpt-4o",
                        messages=[
                            {"role": "system", "content": "You are Jarvis, an expert code analyst for the Nebula Command homelab."},
                            {"role": "user", "content": prompt}
                        ],
                        max_tokens=1024
                    )
                    
                    analysis['ai_analysis'] = response.choices[0].message.content
                except Exception as e:
                    logger.error(f"AI analysis failed: {e}")
                    analysis['ai_analysis'] = None
            
            return analysis
            
        except Exception as e:
            logger.error(f"Error analyzing project: {e}")
            return {
                'success': False,
                'error': str(e)
            }
    
    def generate_code(self, prompt: str, context: Optional[str] = None, language: str = "python") -> Dict[str, Any]:
        """
        Generate code using OpenAI GPT-4o
        
        Args:
            prompt: Description of the code to generate
            context: Optional existing code context
            language: Programming language
            
        Returns:
            Generated code and explanation
        """
        if not self.enabled or not self.client:
            return {
                'success': False,
                'error': 'AI service not available'
            }
        
        try:
            system_prompt = f"""You are Jarvis, an expert code generator for the Nebula Command homelab.
Generate high-quality, production-ready {language} code.

Guidelines:
- Write clean, well-documented code
- Follow best practices for {language}
- Include error handling
- Add type hints where applicable
- Keep security in mind

Return ONLY the code without markdown code blocks unless specifically requested.
If you need to explain something, use comments in the code."""

            user_prompt = prompt
            if context:
                user_prompt = f"Context:\n{context}\n\nRequest: {prompt}"
            
            response = self.client.chat.completions.create(
                model="gpt-4o",
                messages=[
                    {"role": "system", "content": system_prompt},
                    {"role": "user", "content": user_prompt}
                ],
                max_tokens=4096
            )
            
            generated_code = response.choices[0].message.content
            
            return {
                'success': True,
                'code': generated_code,
                'language': language,
                'tokens_used': response.usage.total_tokens if response.usage else 0
            }
            
        except Exception as e:
            logger.error(f"Error generating code: {e}")
            return {
                'success': False,
                'error': str(e)
            }
    
    def edit_file(self, filepath: str, instructions: str) -> Dict[str, Any]:
        """
        AI-edit a specific file based on instructions
        
        Args:
            filepath: Relative path from workspace root
            instructions: Edit instructions
            
        Returns:
            Updated file content and diff
        """
        if not self.enabled or not self.client:
            return {
                'success': False,
                'error': 'AI service not available'
            }
        
        full_path = os.path.join(self.workspace, filepath)
        
        if not os.path.exists(full_path):
            return {
                'success': False,
                'error': f'File does not exist: {filepath}'
            }
        
        try:
            with open(full_path, 'r') as f:
                original_content = f.read()
            
            file_extension = os.path.splitext(filepath)[1]
            language_map = {
                '.py': 'Python',
                '.js': 'JavaScript',
                '.ts': 'TypeScript',
                '.jsx': 'React JSX',
                '.tsx': 'React TSX',
                '.go': 'Go',
                '.rs': 'Rust',
                '.java': 'Java',
                '.html': 'HTML',
                '.css': 'CSS',
                '.json': 'JSON',
                '.yaml': 'YAML',
                '.yml': 'YAML'
            }
            language = language_map.get(file_extension, 'code')
            
            prompt = f"""Edit the following {language} file according to these instructions:

Instructions: {instructions}

Original file ({filepath}):
```
{original_content}
```

Return ONLY the complete updated file content without any markdown code blocks or explanations.
Preserve the original formatting and style where possible."""

            response = self.client.chat.completions.create(
                model="gpt-4o",
                messages=[
                    {"role": "system", "content": "You are Jarvis, an expert code editor. Make precise, minimal changes to achieve the requested edits."},
                    {"role": "user", "content": prompt}
                ],
                max_tokens=8192
            )
            
            new_content = response.choices[0].message.content
            
            if new_content.startswith('```'):
                lines = new_content.split('\n')
                new_content = '\n'.join(lines[1:-1] if lines[-1].strip() == '```' else lines[1:])
            
            with open(full_path, 'w') as f:
                f.write(new_content)
            
            original_lines = original_content.splitlines()
            new_lines = new_content.splitlines()
            
            return {
                'success': True,
                'filepath': filepath,
                'original_content': original_content,
                'new_content': new_content,
                'lines_changed': abs(len(new_lines) - len(original_lines)),
                'tokens_used': response.usage.total_tokens if response.usage else 0
            }
            
        except Exception as e:
            logger.error(f"Error editing file: {e}")
            return {
                'success': False,
                'error': str(e)
            }
    
    def create_file(self, filepath: str, description: str) -> Dict[str, Any]:
        """
        Create a new file from description using AI
        
        Args:
            filepath: Relative path from workspace root
            description: Description of what the file should contain
            
        Returns:
            Created file content
        """
        if not self.enabled or not self.client:
            return {
                'success': False,
                'error': 'AI service not available'
            }
        
        full_path = os.path.join(self.workspace, filepath)
        
        if os.path.exists(full_path):
            return {
                'success': False,
                'error': f'File already exists: {filepath}'
            }
        
        try:
            dir_path = os.path.dirname(full_path)
            if dir_path and not os.path.exists(dir_path):
                os.makedirs(dir_path, exist_ok=True)
            
            file_extension = os.path.splitext(filepath)[1]
            language_map = {
                '.py': 'Python',
                '.js': 'JavaScript',
                '.ts': 'TypeScript',
                '.jsx': 'React JSX',
                '.tsx': 'React TSX',
                '.go': 'Go',
                '.rs': 'Rust',
                '.java': 'Java',
                '.html': 'HTML',
                '.css': 'CSS',
                '.json': 'JSON',
                '.yaml': 'YAML',
                '.yml': 'YAML',
                '.md': 'Markdown',
                '.sh': 'Bash'
            }
            language = language_map.get(file_extension, 'text')
            
            prompt = f"""Create a new {language} file with the following requirements:

Filename: {filepath}
Description: {description}

Return ONLY the complete file content without any markdown code blocks or explanations.
Make it production-ready with proper formatting, documentation, and error handling."""

            response = self.client.chat.completions.create(
                model="gpt-4o",
                messages=[
                    {"role": "system", "content": "You are Jarvis, an expert code creator. Generate clean, production-ready code."},
                    {"role": "user", "content": prompt}
                ],
                max_tokens=4096
            )
            
            content = response.choices[0].message.content
            
            if content.startswith('```'):
                lines = content.split('\n')
                content = '\n'.join(lines[1:-1] if lines[-1].strip() == '```' else lines[1:])
            
            with open(full_path, 'w') as f:
                f.write(content)
            
            return {
                'success': True,
                'filepath': filepath,
                'content': content,
                'tokens_used': response.usage.total_tokens if response.usage else 0
            }
            
        except Exception as e:
            logger.error(f"Error creating file: {e}")
            return {
                'success': False,
                'error': str(e)
            }
    
    def review_code(self, filepath: str) -> Dict[str, Any]:
        """
        Get AI code review and suggestions for a file
        
        Args:
            filepath: Relative path from workspace root
            
        Returns:
            Code review with suggestions and issues
        """
        if not self.enabled or not self.client:
            return {
                'success': False,
                'error': 'AI service not available'
            }
        
        full_path = os.path.join(self.workspace, filepath)
        
        if not os.path.exists(full_path):
            return {
                'success': False,
                'error': f'File does not exist: {filepath}'
            }
        
        try:
            with open(full_path, 'r') as f:
                content = f.read()
            
            file_extension = os.path.splitext(filepath)[1]
            
            prompt = f"""Review the following code and provide detailed feedback:

File: {filepath}
```
{content}
```

Provide a structured review including:
1. **Summary**: Brief overview of what the code does
2. **Security Issues**: Any security vulnerabilities or concerns
3. **Performance**: Performance issues or optimization opportunities
4. **Code Quality**: Style, readability, maintainability issues
5. **Best Practices**: Suggestions for following best practices
6. **Bugs**: Potential bugs or edge cases
7. **Recommendations**: Top 3 prioritized recommendations

Be specific and actionable. Reference line numbers where applicable."""

            response = self.client.chat.completions.create(
                model="gpt-4o",
                messages=[
                    {"role": "system", "content": "You are Jarvis, an expert code reviewer. Provide thorough, constructive feedback focused on security, performance, and best practices."},
                    {"role": "user", "content": prompt}
                ],
                max_tokens=2048
            )
            
            review = response.choices[0].message.content
            
            return {
                'success': True,
                'filepath': filepath,
                'review': review,
                'lines_of_code': len(content.splitlines()),
                'tokens_used': response.usage.total_tokens if response.usage else 0
            }
            
        except Exception as e:
            logger.error(f"Error reviewing code: {e}")
            return {
                'success': False,
                'error': str(e)
            }
    
    def run_tests(self, project_path: str, test_command: Optional[str] = None) -> Dict[str, Any]:
        """
        Execute project tests
        
        Args:
            project_path: Relative path from workspace root
            test_command: Optional custom test command
            
        Returns:
            Test results and output
        """
        full_path = os.path.join(self.workspace, project_path)
        
        if not os.path.exists(full_path):
            return {
                'success': False,
                'error': f'Project path does not exist: {project_path}'
            }
        
        try:
            if not test_command:
                if os.path.exists(os.path.join(full_path, 'package.json')):
                    test_command = 'npm test'
                elif os.path.exists(os.path.join(full_path, 'pytest.ini')) or os.path.exists(os.path.join(full_path, 'tests')):
                    test_command = 'pytest'
                elif os.path.exists(os.path.join(full_path, 'Cargo.toml')):
                    test_command = 'cargo test'
                elif os.path.exists(os.path.join(full_path, 'go.mod')):
                    test_command = 'go test ./...'
                else:
                    return {
                        'success': False,
                        'error': 'Could not detect test framework. Please specify a test command.'
                    }
            
            result = subprocess.run(
                test_command,
                shell=True,
                cwd=full_path,
                capture_output=True,
                text=True,
                timeout=300
            )
            
            return {
                'success': result.returncode == 0,
                'project_path': project_path,
                'command': test_command,
                'stdout': result.stdout,
                'stderr': result.stderr,
                'return_code': result.returncode
            }
            
        except subprocess.TimeoutExpired:
            return {
                'success': False,
                'error': 'Test execution timed out (5 minutes)'
            }
        except Exception as e:
            logger.error(f"Error running tests: {e}")
            return {
                'success': False,
                'error': str(e)
            }
    
    def deploy_project(self, project_path: str, target_host: str, deploy_method: str = 'git') -> Dict[str, Any]:
        """
        Deploy project to remote host via git push or rsync
        
        Args:
            project_path: Relative path from workspace root
            target_host: SSH target (user@host or alias)
            deploy_method: 'git' or 'rsync'
            
        Returns:
            Deployment status and output
        """
        full_path = os.path.join(self.workspace, project_path)
        
        if not os.path.exists(full_path):
            return {
                'success': False,
                'error': f'Project path does not exist: {project_path}'
            }
        
        try:
            steps = []
            
            if deploy_method == 'git':
                result = subprocess.run(
                    'git status --porcelain',
                    shell=True,
                    cwd=full_path,
                    capture_output=True,
                    text=True
                )
                
                if result.stdout.strip():
                    subprocess.run(
                        'git add -A',
                        shell=True,
                        cwd=full_path,
                        capture_output=True
                    )
                    subprocess.run(
                        'git commit -m "Deploy via Jarvis"',
                        shell=True,
                        cwd=full_path,
                        capture_output=True
                    )
                    steps.append('Committed changes')
                
                result = subprocess.run(
                    f'git push {target_host} main 2>&1',
                    shell=True,
                    cwd=full_path,
                    capture_output=True,
                    text=True,
                    timeout=120
                )
                
                if result.returncode != 0:
                    result = subprocess.run(
                        f'git push {target_host} master 2>&1',
                        shell=True,
                        cwd=full_path,
                        capture_output=True,
                        text=True,
                        timeout=120
                    )
                
                steps.append('Pushed to remote')
                
                return {
                    'success': result.returncode == 0,
                    'project_path': project_path,
                    'target_host': target_host,
                    'method': 'git',
                    'steps': steps,
                    'output': result.stdout + result.stderr
                }
            
            elif deploy_method == 'rsync':
                result = subprocess.run(
                    f'rsync -avz --exclude=".git" --exclude="node_modules" --exclude="__pycache__" --exclude="venv" {full_path}/ {target_host}:{project_path}/',
                    shell=True,
                    capture_output=True,
                    text=True,
                    timeout=300
                )
                
                steps.append('Synced files via rsync')
                
                return {
                    'success': result.returncode == 0,
                    'project_path': project_path,
                    'target_host': target_host,
                    'method': 'rsync',
                    'steps': steps,
                    'output': result.stdout + result.stderr
                }
            
            else:
                return {
                    'success': False,
                    'error': f'Unknown deploy method: {deploy_method}'
                }
            
        except subprocess.TimeoutExpired:
            return {
                'success': False,
                'error': 'Deployment timed out'
            }
        except Exception as e:
            logger.error(f"Error deploying project: {e}")
            return {
                'success': False,
                'error': str(e)
            }
    
    def create_project(self, name: str, description: str, tech_stack: str) -> Dict[str, Any]:
        """
        Scaffold a new project from templates
        
        Args:
            name: Project name (used as directory name)
            description: Project description
            tech_stack: Template ID (python-flask, nodejs-express, etc.)
            
        Returns:
            Created project info
        """
        project_path = os.path.join(self.workspace, name)
        
        if os.path.exists(project_path):
            return {
                'success': False,
                'error': f'Project directory already exists: {name}'
            }
        
        try:
            template = PROJECT_TEMPLATES.get(tech_stack)
            
            if not template:
                return {
                    'success': False,
                    'error': f'Unknown tech stack: {tech_stack}. Available: {list(PROJECT_TEMPLATES.keys())}'
                }
            
            os.makedirs(project_path, exist_ok=True)
            
            created_files = []
            for filepath, content in template['files'].items():
                full_filepath = os.path.join(project_path, filepath)
                dir_path = os.path.dirname(full_filepath)
                if dir_path:
                    os.makedirs(dir_path, exist_ok=True)
                
                with open(full_filepath, 'w') as f:
                    f.write(content)
                created_files.append(filepath)
            
            subprocess.run(
                'git init',
                shell=True,
                cwd=project_path,
                capture_output=True
            )
            created_files.append('.git')
            
            readme_content = f"""# {name}

{description}

## Tech Stack

{template['name']} - {template['description']}

## Getting Started

```bash
# Navigate to project
cd {name}

# Install dependencies
# (depends on tech stack)
```

## Created by Jarvis AI

This project was scaffolded by Jarvis Code Integration.
"""
            with open(os.path.join(project_path, 'README.md'), 'w') as f:
                f.write(readme_content)
            created_files.append('README.md')
            
            return {
                'success': True,
                'name': name,
                'path': name,
                'tech_stack': tech_stack,
                'template': template['name'],
                'created_files': created_files
            }
            
        except Exception as e:
            logger.error(f"Error creating project: {e}")
            if os.path.exists(project_path):
                import shutil
                shutil.rmtree(project_path, ignore_errors=True)
            return {
                'success': False,
                'error': str(e)
            }
    
    def list_projects(self) -> Dict[str, Any]:
        """
        List all projects in the workspace
        
        Returns:
            List of projects with metadata
        """
        try:
            projects = []
            
            if not os.path.exists(self.workspace):
                return {
                    'success': True,
                    'projects': [],
                    'workspace': self.workspace
                }
            
            for entry in os.scandir(self.workspace):
                if entry.is_dir() and not entry.name.startswith('.'):
                    project = {
                        'name': entry.name,
                        'path': entry.name,
                        'type': 'unknown',
                        'has_git': False,
                        'has_docker': False
                    }
                    
                    project_files = os.listdir(entry.path)
                    
                    if '.git' in project_files:
                        project['has_git'] = True
                    
                    if 'Dockerfile' in project_files or 'docker-compose.yml' in project_files:
                        project['has_docker'] = True
                    
                    if 'package.json' in project_files:
                        project['type'] = 'nodejs'
                    elif 'requirements.txt' in project_files:
                        project['type'] = 'python'
                    elif 'Cargo.toml' in project_files:
                        project['type'] = 'rust'
                    elif 'go.mod' in project_files:
                        project['type'] = 'go'
                    elif 'index.html' in project_files:
                        project['type'] = 'static'
                    
                    projects.append(project)
            
            projects.sort(key=lambda x: x['name'])
            
            return {
                'success': True,
                'projects': projects,
                'count': len(projects),
                'workspace': self.workspace
            }
            
        except Exception as e:
            logger.error(f"Error listing projects: {e}")
            return {
                'success': False,
                'error': str(e)
            }
    
    def execute_command(self, command: str, project_path: Optional[str] = None, timeout: int = 60) -> Dict[str, Any]:
        """
        Execute a shell command in sandbox (project directory)
        
        Args:
            command: Shell command to execute
            project_path: Optional project path (uses workspace root if not specified)
            timeout: Command timeout in seconds
            
        Returns:
            Command output and status
        """
        if project_path:
            cwd = os.path.join(self.workspace, project_path)
        else:
            cwd = self.workspace
        
        if not os.path.exists(cwd):
            return {
                'success': False,
                'error': f'Path does not exist: {cwd}'
            }
        
        dangerous_patterns = ['rm -rf /', 'dd if=', ':(){:|:&};:', 'mkfs', '> /dev/sd']
        for pattern in dangerous_patterns:
            if pattern in command:
                return {
                    'success': False,
                    'error': f'Dangerous command pattern detected: {pattern}'
                }
        
        try:
            result = subprocess.run(
                command,
                shell=True,
                cwd=cwd,
                capture_output=True,
                text=True,
                timeout=timeout
            )
            
            return {
                'success': result.returncode == 0,
                'command': command,
                'cwd': cwd,
                'stdout': result.stdout,
                'stderr': result.stderr,
                'return_code': result.returncode
            }
            
        except subprocess.TimeoutExpired:
            return {
                'success': False,
                'error': f'Command timed out after {timeout} seconds'
            }
        except Exception as e:
            logger.error(f"Error executing command: {e}")
            return {
                'success': False,
                'error': str(e)
            }
    
    def read_file(self, filepath: str) -> Dict[str, Any]:
        """
        Read file contents
        
        Args:
            filepath: Relative path from workspace root
            
        Returns:
            File content
        """
        full_path = os.path.join(self.workspace, filepath)
        
        if not os.path.exists(full_path):
            return {
                'success': False,
                'error': f'File does not exist: {filepath}'
            }
        
        try:
            with open(full_path, 'r') as f:
                content = f.read()
            
            return {
                'success': True,
                'filepath': filepath,
                'content': content,
                'lines': len(content.splitlines()),
                'size': len(content)
            }
            
        except Exception as e:
            logger.error(f"Error reading file: {e}")
            return {
                'success': False,
                'error': str(e)
            }
    
    def get_available_templates(self) -> Dict[str, Any]:
        """
        Get list of available project templates
        
        Returns:
            Available templates with descriptions
        """
        templates = []
        for template_id, template_data in PROJECT_TEMPLATES.items():
            templates.append({
                'id': template_id,
                'name': template_data['name'],
                'description': template_data['description'],
                'files': list(template_data['files'].keys())
            })
        
        return {
            'success': True,
            'templates': templates,
            'count': len(templates)
        }


jarvis_code_service = JarvisCodeService()


__all__ = ['JarvisCodeService', 'jarvis_code_service']
