"""Dockerfile templates for different project types"""

TEMPLATES = {
    'static': '''FROM nginx:alpine
WORKDIR /usr/share/nginx/html
COPY . .
EXPOSE 80
CMD ["nginx", "-g", "daemon off;"]
''',
    
    'nodejs_express': '''FROM node:18-alpine
WORKDIR /app
COPY package*.json ./
RUN npm ci --only=production
COPY . .
EXPOSE {port}
CMD ["node", "{entrypoint}"]
''',
    
    'nodejs_react': '''FROM node:18-alpine AS build
WORKDIR /app
COPY package*.json ./
RUN npm ci
COPY . .
RUN npm run build

FROM nginx:alpine
COPY --from=build /app/{build_dir} /usr/share/nginx/html
EXPOSE 80
CMD ["nginx", "-g", "daemon off;"]
''',
    
    'python_flask': '''FROM python:3.11-slim
WORKDIR /app
COPY requirements.txt .
RUN pip install --no-cache-dir -r requirements.txt
COPY . .
EXPOSE {port}
CMD ["gunicorn", "--bind", "0.0.0.0:{port}", "--reuse-port", "{app}:app"]
''',
    
    'python_fastapi': '''FROM python:3.11-slim
WORKDIR /app
COPY requirements.txt .
RUN pip install --no-cache-dir -r requirements.txt
COPY . .
EXPOSE {port}
CMD ["uvicorn", "{app}:app", "--host", "0.0.0.0", "--port", "{port}"]
''',
    
    'python_django': '''FROM python:3.11-slim
WORKDIR /app
COPY requirements.txt .
RUN pip install --no-cache-dir -r requirements.txt
COPY . .
RUN python manage.py collectstatic --no-input
EXPOSE {port}
CMD ["gunicorn", "--bind", "0.0.0.0:{port}", "--reuse-port", "{project}.wsgi:application"]
''',
    
    'nodejs_nextjs': '''FROM node:18-alpine AS deps
WORKDIR /app
COPY package*.json ./
RUN npm ci

FROM node:18-alpine AS builder
WORKDIR /app
COPY --from=deps /app/node_modules ./node_modules
COPY . .
RUN npm run build

FROM node:18-alpine AS runner
WORKDIR /app
ENV NODE_ENV production
COPY --from=builder /app/public ./public
COPY --from=builder /app/.next/standalone ./
COPY --from=builder /app/.next/static ./.next/static
EXPOSE {port}
CMD ["node", "server.js"]
''',
    
    'python_streamlit': '''FROM python:3.11-slim
WORKDIR /app
COPY requirements.txt .
RUN pip install --no-cache-dir -r requirements.txt
COPY . .
EXPOSE {port}
CMD ["streamlit", "run", "{app}", "--server.port={port}", "--server.address=0.0.0.0"]
''',
}

def generate_dockerfile(project_type: str, config: dict) -> str:
    """Generate Dockerfile from template with substitutions
    
    Args:
        project_type: Type of project (static, nodejs_express, python_flask, etc.)
        config: Configuration dictionary with template variables
        
    Returns:
        Generated Dockerfile content as string
        
    Raises:
        ValueError: If project_type is not found in templates
    """
    template = TEMPLATES.get(project_type)
    if not template:
        raise ValueError(f"No template found for project type: {project_type}")
    
    # Use safe formatting - only substitute if keys exist in config
    try:
        return template.format(**config)
    except KeyError as e:
        raise ValueError(f"Missing required config key for {project_type}: {e}")
