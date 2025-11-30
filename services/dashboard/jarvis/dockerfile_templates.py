"""Dockerfile templates for different project types - Enhanced for infrastructure automation"""

from typing import Dict, Any, Optional, List
import re

TEMPLATES = {
    'static': '''FROM nginx:alpine
LABEL maintainer="Jarvis Infrastructure Automation"
WORKDIR /usr/share/nginx/html
COPY . .
EXPOSE 80
HEALTHCHECK --interval=30s --timeout=3s CMD wget -q -O /dev/null http://localhost/ || exit 1
CMD ["nginx", "-g", "daemon off;"]
''',
    
    'nodejs_express': '''FROM node:{node_version}-alpine
LABEL maintainer="Jarvis Infrastructure Automation"
WORKDIR /app
COPY package*.json ./
RUN npm ci --only=production
COPY . .
EXPOSE {port}
HEALTHCHECK --interval=30s --timeout=3s CMD wget -q -O /dev/null http://localhost:{port}/health || exit 1
USER node
CMD ["node", "{entrypoint}"]
''',
    
    'nodejs_react': '''FROM node:{node_version}-alpine AS build
WORKDIR /app
COPY package*.json ./
RUN npm ci
COPY . .
RUN npm run build

FROM nginx:alpine
LABEL maintainer="Jarvis Infrastructure Automation"
COPY --from=build /app/{build_dir} /usr/share/nginx/html
COPY nginx.conf /etc/nginx/conf.d/default.conf 2>/dev/null || true
EXPOSE 80
HEALTHCHECK --interval=30s --timeout=3s CMD wget -q -O /dev/null http://localhost/ || exit 1
CMD ["nginx", "-g", "daemon off;"]
''',
    
    'nodejs_vue': '''FROM node:{node_version}-alpine AS build
WORKDIR /app
COPY package*.json ./
RUN npm ci
COPY . .
RUN npm run build

FROM nginx:alpine
LABEL maintainer="Jarvis Infrastructure Automation"
COPY --from=build /app/dist /usr/share/nginx/html
EXPOSE 80
HEALTHCHECK --interval=30s --timeout=3s CMD wget -q -O /dev/null http://localhost/ || exit 1
CMD ["nginx", "-g", "daemon off;"]
''',

    'nodejs_angular': '''FROM node:{node_version}-alpine AS build
WORKDIR /app
COPY package*.json ./
RUN npm ci
COPY . .
RUN npm run build --configuration=production

FROM nginx:alpine
LABEL maintainer="Jarvis Infrastructure Automation"
COPY --from=build /app/dist/{project_name}/browser /usr/share/nginx/html
EXPOSE 80
HEALTHCHECK --interval=30s --timeout=3s CMD wget -q -O /dev/null http://localhost/ || exit 1
CMD ["nginx", "-g", "daemon off;"]
''',
    
    'python_flask': '''FROM python:{python_version}-slim
LABEL maintainer="Jarvis Infrastructure Automation"
WORKDIR /app

RUN apt-get update && apt-get install -y --no-install-recommends \\
    gcc libpq-dev && \\
    rm -rf /var/lib/apt/lists/*

COPY requirements.txt .
RUN pip install --no-cache-dir -r requirements.txt gunicorn

COPY . .

RUN useradd -m appuser && chown -R appuser:appuser /app
USER appuser

EXPOSE {port}
HEALTHCHECK --interval=30s --timeout=3s CMD python -c "import urllib.request; urllib.request.urlopen('http://localhost:{port}/health')" || exit 1
CMD ["gunicorn", "--bind", "0.0.0.0:{port}", "--reuse-port", "--workers", "{workers}", "{app}:app"]
''',
    
    'python_fastapi': '''FROM python:{python_version}-slim
LABEL maintainer="Jarvis Infrastructure Automation"
WORKDIR /app

RUN apt-get update && apt-get install -y --no-install-recommends \\
    gcc libpq-dev && \\
    rm -rf /var/lib/apt/lists/*

COPY requirements.txt .
RUN pip install --no-cache-dir -r requirements.txt uvicorn[standard]

COPY . .

RUN useradd -m appuser && chown -R appuser:appuser /app
USER appuser

EXPOSE {port}
HEALTHCHECK --interval=30s --timeout=3s CMD python -c "import urllib.request; urllib.request.urlopen('http://localhost:{port}/health')" || exit 1
CMD ["uvicorn", "{app}:app", "--host", "0.0.0.0", "--port", "{port}", "--workers", "{workers}"]
''',
    
    'python_django': '''FROM python:{python_version}-slim
LABEL maintainer="Jarvis Infrastructure Automation"
WORKDIR /app

RUN apt-get update && apt-get install -y --no-install-recommends \\
    gcc libpq-dev && \\
    rm -rf /var/lib/apt/lists/*

COPY requirements.txt .
RUN pip install --no-cache-dir -r requirements.txt gunicorn

COPY . .

RUN python manage.py collectstatic --no-input

RUN useradd -m appuser && chown -R appuser:appuser /app
USER appuser

EXPOSE {port}
HEALTHCHECK --interval=30s --timeout=3s CMD python -c "import urllib.request; urllib.request.urlopen('http://localhost:{port}/health')" || exit 1
CMD ["gunicorn", "--bind", "0.0.0.0:{port}", "--reuse-port", "--workers", "{workers}", "{project}.wsgi:application"]
''',
    
    'nodejs_nextjs': '''FROM node:{node_version}-alpine AS deps
WORKDIR /app
COPY package*.json ./
RUN npm ci

FROM node:{node_version}-alpine AS builder
WORKDIR /app
COPY --from=deps /app/node_modules ./node_modules
COPY . .
ENV NEXT_TELEMETRY_DISABLED 1
RUN npm run build

FROM node:{node_version}-alpine AS runner
LABEL maintainer="Jarvis Infrastructure Automation"
WORKDIR /app
ENV NODE_ENV production
ENV NEXT_TELEMETRY_DISABLED 1

RUN addgroup --system --gid 1001 nodejs && adduser --system --uid 1001 nextjs
COPY --from=builder /app/public ./public
COPY --from=builder --chown=nextjs:nodejs /app/.next/standalone ./
COPY --from=builder --chown=nextjs:nodejs /app/.next/static ./.next/static

USER nextjs
EXPOSE {port}
ENV PORT {port}
HEALTHCHECK --interval=30s --timeout=3s CMD wget -q -O /dev/null http://localhost:{port}/ || exit 1
CMD ["node", "server.js"]
''',
    
    'python_streamlit': '''FROM python:{python_version}-slim
LABEL maintainer="Jarvis Infrastructure Automation"
WORKDIR /app

RUN apt-get update && apt-get install -y --no-install-recommends \\
    gcc && \\
    rm -rf /var/lib/apt/lists/*

COPY requirements.txt .
RUN pip install --no-cache-dir -r requirements.txt streamlit

COPY . .

RUN useradd -m appuser && chown -R appuser:appuser /app
USER appuser

EXPOSE {port}
HEALTHCHECK --interval=30s --timeout=3s CMD wget -q -O /dev/null http://localhost:{port}/healthz || exit 1
CMD ["streamlit", "run", "{app}", "--server.port={port}", "--server.address=0.0.0.0", "--server.headless=true"]
''',

    'go': '''FROM golang:{go_version}-alpine AS builder
WORKDIR /app
COPY go.mod go.sum ./
RUN go mod download
COPY . .
RUN CGO_ENABLED=0 GOOS=linux go build -a -installsuffix cgo -o main .

FROM alpine:latest
LABEL maintainer="Jarvis Infrastructure Automation"
RUN apk --no-cache add ca-certificates
WORKDIR /root/
COPY --from=builder /app/main .
EXPOSE {port}
HEALTHCHECK --interval=30s --timeout=3s CMD wget -q -O /dev/null http://localhost:{port}/health || exit 1
CMD ["./main"]
''',

    'rust': '''FROM rust:{rust_version} AS builder
WORKDIR /app
COPY Cargo.toml Cargo.lock ./
RUN mkdir src && echo "fn main() {{}}" > src/main.rs
RUN cargo build --release && rm -rf src
COPY . .
RUN touch src/main.rs && cargo build --release

FROM debian:bookworm-slim
LABEL maintainer="Jarvis Infrastructure Automation"
RUN apt-get update && apt-get install -y ca-certificates && rm -rf /var/lib/apt/lists/*
COPY --from=builder /app/target/release/{binary_name} /usr/local/bin/app
EXPOSE {port}
HEALTHCHECK --interval=30s --timeout=3s CMD curl -f http://localhost:{port}/health || exit 1
CMD ["app"]
''',

    'java_spring': '''FROM eclipse-temurin:{java_version}-jdk AS builder
WORKDIR /app
COPY . .
RUN ./mvnw clean package -DskipTests

FROM eclipse-temurin:{java_version}-jre
LABEL maintainer="Jarvis Infrastructure Automation"
WORKDIR /app
COPY --from=builder /app/target/*.jar app.jar
EXPOSE {port}
HEALTHCHECK --interval=30s --timeout=3s CMD curl -f http://localhost:{port}/actuator/health || exit 1
ENTRYPOINT ["java", "-jar", "app.jar"]
''',

    'php_laravel': '''FROM php:{php_version}-fpm
LABEL maintainer="Jarvis Infrastructure Automation"

RUN apt-get update && apt-get install -y \\
    git curl zip unzip libpng-dev libonig-dev libxml2-dev libzip-dev \\
    && docker-php-ext-install pdo_mysql mbstring exif pcntl bcmath gd zip

COPY --from=composer:latest /usr/bin/composer /usr/bin/composer

WORKDIR /var/www
COPY . .

RUN composer install --no-dev --optimize-autoloader
RUN php artisan config:cache && php artisan route:cache

RUN chown -R www-data:www-data /var/www

EXPOSE 9000
CMD ["php-fpm"]
''',

    'ruby_rails': '''FROM ruby:{ruby_version}-slim
LABEL maintainer="Jarvis Infrastructure Automation"

RUN apt-get update -qq && apt-get install -y \\
    build-essential libpq-dev nodejs yarn \\
    && rm -rf /var/lib/apt/lists/*

WORKDIR /app
COPY Gemfile Gemfile.lock ./
RUN bundle config set --local deployment true && bundle install

COPY . .
RUN bundle exec rails assets:precompile

EXPOSE {port}
HEALTHCHECK --interval=30s --timeout=3s CMD curl -f http://localhost:{port}/health || exit 1
CMD ["bundle", "exec", "puma", "-C", "config/puma.rb"]
''',

    'dotnet': '''FROM mcr.microsoft.com/dotnet/sdk:{dotnet_version} AS build
WORKDIR /src
COPY . .
RUN dotnet restore && dotnet publish -c Release -o /app

FROM mcr.microsoft.com/dotnet/aspnet:{dotnet_version}
LABEL maintainer="Jarvis Infrastructure Automation"
WORKDIR /app
COPY --from=build /app .
EXPOSE {port}
HEALTHCHECK --interval=30s --timeout=3s CMD curl -f http://localhost:{port}/health || exit 1
ENTRYPOINT ["dotnet", "{assembly}.dll"]
''',

    'wordpress': '''FROM wordpress:latest
LABEL maintainer="Jarvis Infrastructure Automation"

RUN apt-get update && apt-get install -y \\
    libpng-dev libjpeg-dev libfreetype6-dev \\
    && docker-php-ext-configure gd --with-freetype --with-jpeg \\
    && docker-php-ext-install gd mysqli pdo pdo_mysql \\
    && rm -rf /var/lib/apt/lists/*

RUN echo "upload_max_filesize = 64M" >> /usr/local/etc/php/conf.d/uploads.ini \\
    && echo "post_max_size = 64M" >> /usr/local/etc/php/conf.d/uploads.ini

EXPOSE 80
HEALTHCHECK --interval=30s --timeout=3s CMD curl -f http://localhost/ || exit 1
''',

    'nginx_proxy': '''FROM nginx:alpine
LABEL maintainer="Jarvis Infrastructure Automation"

RUN rm /etc/nginx/conf.d/default.conf
COPY nginx.conf /etc/nginx/nginx.conf
COPY conf.d/ /etc/nginx/conf.d/

EXPOSE 80 443
HEALTHCHECK --interval=30s --timeout=3s CMD wget -q -O /dev/null http://localhost/health || exit 1
CMD ["nginx", "-g", "daemon off;"]
''',

    'python_celery_worker': '''FROM python:{python_version}-slim
LABEL maintainer="Jarvis Infrastructure Automation"
WORKDIR /app

RUN apt-get update && apt-get install -y --no-install-recommends \\
    gcc libpq-dev && \\
    rm -rf /var/lib/apt/lists/*

COPY requirements.txt .
RUN pip install --no-cache-dir -r requirements.txt celery

COPY . .

RUN useradd -m celeryuser && chown -R celeryuser:celeryuser /app
USER celeryuser

CMD ["celery", "-A", "{app}", "worker", "--loglevel=info", "--concurrency={concurrency}"]
''',

    'python_celery_beat': '''FROM python:{python_version}-slim
LABEL maintainer="Jarvis Infrastructure Automation"
WORKDIR /app

RUN apt-get update && apt-get install -y --no-install-recommends \\
    gcc libpq-dev && \\
    rm -rf /var/lib/apt/lists/*

COPY requirements.txt .
RUN pip install --no-cache-dir -r requirements.txt celery

COPY . .

RUN useradd -m celeryuser && chown -R celeryuser:celeryuser /app
USER celeryuser

CMD ["celery", "-A", "{app}", "beat", "--loglevel=info"]
''',
}

DEFAULT_CONFIGS: Dict[str, Dict[str, Any]] = {
    'python_flask': {
        'python_version': '3.11',
        'port': 5000,
        'workers': 4,
        'app': 'app'
    },
    'python_fastapi': {
        'python_version': '3.11',
        'port': 8000,
        'workers': 4,
        'app': 'main'
    },
    'python_django': {
        'python_version': '3.11',
        'port': 8000,
        'workers': 4,
        'project': 'myproject'
    },
    'python_streamlit': {
        'python_version': '3.11',
        'port': 8501,
        'app': 'app.py'
    },
    'python_celery_worker': {
        'python_version': '3.11',
        'app': 'celery_app',
        'concurrency': 4
    },
    'python_celery_beat': {
        'python_version': '3.11',
        'app': 'celery_app'
    },
    'nodejs_express': {
        'node_version': '20',
        'port': 3000,
        'entrypoint': 'index.js'
    },
    'nodejs_react': {
        'node_version': '20',
        'build_dir': 'build'
    },
    'nodejs_vue': {
        'node_version': '20'
    },
    'nodejs_angular': {
        'node_version': '20',
        'project_name': 'myapp'
    },
    'nodejs_nextjs': {
        'node_version': '20',
        'port': 3000
    },
    'go': {
        'go_version': '1.21',
        'port': 8080
    },
    'rust': {
        'rust_version': '1.74',
        'port': 8080,
        'binary_name': 'app'
    },
    'java_spring': {
        'java_version': '21',
        'port': 8080
    },
    'php_laravel': {
        'php_version': '8.2'
    },
    'ruby_rails': {
        'ruby_version': '3.2',
        'port': 3000
    },
    'dotnet': {
        'dotnet_version': '8.0',
        'port': 8080,
        'assembly': 'MyApp'
    }
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
        available = ', '.join(sorted(TEMPLATES.keys()))
        raise ValueError(f"No template found for project type: {project_type}. Available: {available}")
    
    merged_config = DEFAULT_CONFIGS.get(project_type, {}).copy()
    merged_config.update(config)
    
    try:
        return template.format(**merged_config)
    except KeyError as e:
        raise ValueError(f"Missing required config key for {project_type}: {e}")


def get_available_templates() -> List[Dict[str, Any]]:
    """Get list of available Dockerfile templates with their descriptions"""
    template_info = {
        'static': {'name': 'Static Website', 'description': 'Nginx-based static file serving', 'category': 'web'},
        'nodejs_express': {'name': 'Node.js Express', 'description': 'Express.js REST API or web server', 'category': 'web'},
        'nodejs_react': {'name': 'React', 'description': 'React SPA with Nginx serving', 'category': 'frontend'},
        'nodejs_vue': {'name': 'Vue.js', 'description': 'Vue.js SPA with Nginx serving', 'category': 'frontend'},
        'nodejs_angular': {'name': 'Angular', 'description': 'Angular SPA with Nginx serving', 'category': 'frontend'},
        'nodejs_nextjs': {'name': 'Next.js', 'description': 'Full-stack React framework', 'category': 'fullstack'},
        'python_flask': {'name': 'Flask', 'description': 'Python Flask web application', 'category': 'web'},
        'python_fastapi': {'name': 'FastAPI', 'description': 'Python FastAPI high-performance API', 'category': 'api'},
        'python_django': {'name': 'Django', 'description': 'Python Django full-stack framework', 'category': 'fullstack'},
        'python_streamlit': {'name': 'Streamlit', 'description': 'Python Streamlit data app', 'category': 'data'},
        'python_celery_worker': {'name': 'Celery Worker', 'description': 'Python Celery background worker', 'category': 'worker'},
        'python_celery_beat': {'name': 'Celery Beat', 'description': 'Python Celery scheduler', 'category': 'worker'},
        'go': {'name': 'Go', 'description': 'Go application with multi-stage build', 'category': 'api'},
        'rust': {'name': 'Rust', 'description': 'Rust application with multi-stage build', 'category': 'api'},
        'java_spring': {'name': 'Spring Boot', 'description': 'Java Spring Boot application', 'category': 'api'},
        'php_laravel': {'name': 'Laravel', 'description': 'PHP Laravel framework', 'category': 'web'},
        'ruby_rails': {'name': 'Ruby on Rails', 'description': 'Ruby on Rails full-stack framework', 'category': 'fullstack'},
        'dotnet': {'name': '.NET Core', 'description': 'Microsoft .NET Core application', 'category': 'api'},
        'wordpress': {'name': 'WordPress', 'description': 'WordPress CMS with optimizations', 'category': 'cms'},
        'nginx_proxy': {'name': 'Nginx Proxy', 'description': 'Nginx reverse proxy configuration', 'category': 'infrastructure'}
    }
    
    return [
        {
            'id': key,
            'name': template_info.get(key, {}).get('name', key),
            'description': template_info.get(key, {}).get('description', ''),
            'category': template_info.get(key, {}).get('category', 'other'),
            'default_config': DEFAULT_CONFIGS.get(key, {})
        }
        for key in sorted(TEMPLATES.keys())
    ]


def generate_dockerignore(project_type: str) -> str:
    """Generate .dockerignore file content based on project type
    
    Args:
        project_type: Type of project
        
    Returns:
        .dockerignore content
    """
    common = """
# Git
.git
.gitignore

# IDE
.idea
.vscode
*.swp
*.swo

# OS
.DS_Store
Thumbs.db

# Logs
*.log
logs/

# Documentation
README.md
docs/
"""
    
    specific = {
        'python': """
# Python
__pycache__/
*.py[cod]
*$py.class
*.so
.Python
venv/
.env
.venv/
.pytest_cache/
.mypy_cache/
.coverage
htmlcov/
""",
        'nodejs': """
# Node.js
node_modules/
npm-debug.log
yarn-error.log
.npm
.pnpm-store/

# Build
dist/
build/
.next/
""",
        'go': """
# Go
*.exe
*.exe~
*.dll
*.so
*.dylib
*.test
*.out
vendor/
""",
        'rust': """
# Rust
target/
Cargo.lock
""",
        'java': """
# Java
target/
*.class
*.jar
*.war
.mvn/
.gradle/
""",
        'php': """
# PHP
vendor/
.env
storage/
bootstrap/cache/
""",
        'ruby': """
# Ruby
.bundle/
vendor/bundle/
tmp/
log/
"""
    }
    
    type_mapping = {
        'python_flask': 'python',
        'python_fastapi': 'python',
        'python_django': 'python',
        'python_streamlit': 'python',
        'python_celery_worker': 'python',
        'python_celery_beat': 'python',
        'nodejs_express': 'nodejs',
        'nodejs_react': 'nodejs',
        'nodejs_vue': 'nodejs',
        'nodejs_angular': 'nodejs',
        'nodejs_nextjs': 'nodejs',
        'go': 'go',
        'rust': 'rust',
        'java_spring': 'java',
        'php_laravel': 'php',
        'ruby_rails': 'ruby',
    }
    
    lang = type_mapping.get(project_type)
    if lang and lang in specific:
        return common + specific[lang]
    return common
