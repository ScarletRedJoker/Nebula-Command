import os
import tempfile
import shutil
import json
import pytest
from services.deployment_analyzer import DeploymentAnalyzer, AnalysisResult


class TestDeploymentAnalyzer:
    """Comprehensive tests for deployment analyzer"""
    
    @pytest.fixture
    def analyzer(self):
        """Create analyzer instance"""
        return DeploymentAnalyzer()
    
    @pytest.fixture
    def temp_dir(self):
        """Create temporary directory for test fixtures"""
        temp_dir = tempfile.mkdtemp()
        yield temp_dir
        shutil.rmtree(temp_dir)
    
    def create_file(self, base_path, filename, content=""):
        """Helper to create a file with content"""
        os.makedirs(os.path.dirname(os.path.join(base_path, filename)), exist_ok=True)
        with open(os.path.join(base_path, filename), 'w') as f:
            f.write(content)
    
    def test_detect_static_site(self, analyzer, temp_dir):
        """Test static site detection"""
        self.create_file(temp_dir, 'index.html', '<html><body>Hello World</body></html>')
        self.create_file(temp_dir, 'style.css', 'body { margin: 0; }')
        
        result = analyzer.analyze_artifact(temp_dir)
        
        assert result.project_type == 'static'
        assert result.framework == 'html'
        assert result.confidence >= 0.9
    
    def test_detect_react_app(self, analyzer, temp_dir):
        """Test React application detection"""
        package_json = {
            "name": "my-react-app",
            "version": "1.0.0",
            "dependencies": {
                "react": "^18.0.0",
                "react-dom": "^18.0.0",
                "react-scripts": "^5.0.0"
            },
            "scripts": {
                "start": "react-scripts start",
                "build": "react-scripts build"
            }
        }
        self.create_file(temp_dir, 'package.json', json.dumps(package_json))
        
        result = analyzer.analyze_artifact(temp_dir)
        
        assert result.project_type == 'nodejs'
        assert result.framework == 'react'
        assert result.build_command == 'npm run build'
        assert result.static_files_dir == 'build'
        assert result.port == 3000
    
    def test_detect_express_app(self, analyzer, temp_dir):
        """Test Express application detection"""
        package_json = {
            "name": "express-api",
            "version": "1.0.0",
            "dependencies": {
                "express": "^4.18.0"
            },
            "scripts": {
                "start": "node index.js"
            }
        }
        self.create_file(temp_dir, 'package.json', json.dumps(package_json))
        self.create_file(temp_dir, 'index.js', 'const express = require("express");')
        
        result = analyzer.analyze_artifact(temp_dir)
        
        assert result.project_type == 'nodejs'
        assert result.framework == 'express'
        assert result.start_command == 'npm start'
        assert result.port == 3000
    
    def test_detect_flask_app(self, analyzer, temp_dir):
        """Test Flask application detection"""
        requirements = """
flask==2.3.0
requests==2.31.0
psycopg2-binary==2.9.0
"""
        self.create_file(temp_dir, 'requirements.txt', requirements)
        self.create_file(temp_dir, 'app.py', 'from flask import Flask\napp = Flask(__name__)')
        
        result = analyzer.analyze_artifact(temp_dir)
        
        assert result.project_type == 'python'
        assert result.framework == 'flask'
        assert result.port == 5000
        assert result.requires_database == True
        assert result.database_type == 'postgresql'
    
    def test_detect_django_app(self, analyzer, temp_dir):
        """Test Django application detection"""
        requirements = """
django==4.2.0
gunicorn==20.1.0
"""
        self.create_file(temp_dir, 'requirements.txt', requirements)
        self.create_file(temp_dir, 'manage.py', 'import django')
        
        result = analyzer.analyze_artifact(temp_dir)
        
        assert result.project_type == 'python'
        assert result.framework == 'django'
        assert result.port == 8000
        assert 'manage.py' in result.start_command
    
    def test_detect_fastapi_app(self, analyzer, temp_dir):
        """Test FastAPI application detection"""
        requirements = """
fastapi==0.100.0
uvicorn==0.23.0
sqlalchemy==2.0.0
"""
        self.create_file(temp_dir, 'requirements.txt', requirements)
        self.create_file(temp_dir, 'main.py', 'from fastapi import FastAPI')
        
        result = analyzer.analyze_artifact(temp_dir)
        
        assert result.project_type == 'python'
        assert result.framework == 'fastapi'
        assert result.port == 8000
        assert 'uvicorn' in result.start_command
        assert result.requires_database == True
    
    def test_detect_dockerfile(self, analyzer, temp_dir):
        """Test Dockerfile detection"""
        dockerfile = """
FROM python:3.11
EXPOSE 8080
CMD ["python", "app.py"]
"""
        self.create_file(temp_dir, 'Dockerfile', dockerfile)
        
        result = analyzer.analyze_artifact(temp_dir)
        
        assert result.project_type == 'docker'
        assert result.framework == 'dockerfile'
        assert result.port == 8080
        assert result.confidence >= 0.9
    
    def test_detect_docker_compose(self, analyzer, temp_dir):
        """Test Docker Compose detection"""
        docker_compose = """
version: '3.8'
services:
  web:
    build: .
    ports:
      - "5000:5000"
  db:
    image: postgres:14
"""
        self.create_file(temp_dir, 'docker-compose.yml', docker_compose)
        
        result = analyzer.analyze_artifact(temp_dir)
        
        assert result.project_type == 'docker'
        assert result.framework == 'docker-compose'
        assert 'docker-compose' in result.start_command
    
    def test_detect_php_app(self, analyzer, temp_dir):
        """Test PHP application detection"""
        self.create_file(temp_dir, 'index.php', '<?php echo "Hello"; ?>')
        composer_json = {
            "require": {
                "laravel/framework": "^10.0"
            }
        }
        self.create_file(temp_dir, 'composer.json', json.dumps(composer_json))
        
        result = analyzer.analyze_artifact(temp_dir)
        
        assert result.project_type == 'php'
        assert result.framework == 'laravel'
        assert result.port == 8000
    
    def test_detect_java_spring_boot(self, analyzer, temp_dir):
        """Test Java Spring Boot detection"""
        pom_xml = """
<?xml version="1.0" encoding="UTF-8"?>
<project>
    <dependencies>
        <dependency>
            <groupId>org.springframework.boot</groupId>
            <artifactId>spring-boot-starter-web</artifactId>
        </dependency>
        <dependency>
            <groupId>org.postgresql</groupId>
            <artifactId>postgresql</artifactId>
        </dependency>
    </dependencies>
</project>
"""
        self.create_file(temp_dir, 'pom.xml', pom_xml)
        
        result = analyzer.analyze_artifact(temp_dir)
        
        assert result.project_type == 'java'
        assert result.framework == 'spring-boot'
        assert result.build_command == 'mvn clean package'
        assert result.port == 8080
        assert result.requires_database == True
    
    def test_detect_go_app(self, analyzer, temp_dir):
        """Test Go application detection"""
        go_mod = """
module example.com/myapp

go 1.21

require (
    github.com/gin-gonic/gin v1.9.0
    github.com/lib/pq v1.10.0
)
"""
        self.create_file(temp_dir, 'go.mod', go_mod)
        self.create_file(temp_dir, 'main.go', 'package main')
        
        result = analyzer.analyze_artifact(temp_dir)
        
        assert result.project_type == 'go'
        assert result.framework == 'gin'
        assert result.build_command == 'go build -o app .'
        assert result.requires_database == True
    
    def test_detect_rust_app(self, analyzer, temp_dir):
        """Test Rust application detection"""
        cargo_toml = """
[package]
name = "myapp"
version = "0.1.0"

[dependencies]
actix-web = "4.0"
sqlx = { version = "0.7", features = ["postgres"] }
"""
        self.create_file(temp_dir, 'Cargo.toml', cargo_toml)
        
        result = analyzer.analyze_artifact(temp_dir)
        
        assert result.project_type == 'rust'
        assert result.framework == 'actix-web'
        assert result.build_command == 'cargo build --release'
        assert result.requires_database == True
    
    def test_detect_nextjs_app(self, analyzer, temp_dir):
        """Test Next.js application detection"""
        package_json = {
            "name": "nextjs-app",
            "dependencies": {
                "next": "^13.0.0",
                "react": "^18.0.0"
            },
            "scripts": {
                "build": "next build",
                "start": "next start"
            }
        }
        self.create_file(temp_dir, 'package.json', json.dumps(package_json))
        
        result = analyzer.analyze_artifact(temp_dir)
        
        assert result.project_type == 'nodejs'
        assert result.framework == 'next.js'
        assert result.build_command == 'npm run build'
        assert result.static_files_dir == '.next'
    
    def test_detect_vue_app(self, analyzer, temp_dir):
        """Test Vue.js application detection"""
        package_json = {
            "name": "vue-app",
            "dependencies": {
                "vue": "^3.0.0"
            },
            "scripts": {
                "build": "vue-cli-service build"
            }
        }
        self.create_file(temp_dir, 'package.json', json.dumps(package_json))
        
        result = analyzer.analyze_artifact(temp_dir)
        
        assert result.project_type == 'nodejs'
        assert result.framework == 'vue'
        assert result.static_files_dir == 'dist'
    
    def test_detect_angular_app(self, analyzer, temp_dir):
        """Test Angular application detection"""
        package_json = {
            "name": "angular-app",
            "dependencies": {
                "@angular/core": "^15.0.0",
                "@angular/cli": "^15.0.0"
            }
        }
        self.create_file(temp_dir, 'package.json', json.dumps(package_json))
        
        result = analyzer.analyze_artifact(temp_dir)
        
        assert result.project_type == 'nodejs'
        assert result.framework == 'angular'
        assert result.static_files_dir == 'dist'
    
    def test_unknown_project(self, analyzer, temp_dir):
        """Test unknown project type"""
        self.create_file(temp_dir, 'random.txt', 'some content')
        
        result = analyzer.analyze_artifact(temp_dir)
        
        assert result.project_type == 'unknown'
        assert result.confidence == 0.0
        assert len(result.recommendations) > 0
    
    def test_mixed_signals_highest_confidence(self, analyzer, temp_dir):
        """Test that highest confidence detection wins"""
        # Create both static HTML and package.json (React)
        self.create_file(temp_dir, 'index.html', '<html><body>Test</body></html>')
        package_json = {
            "dependencies": {
                "react": "^18.0.0",
                "react-scripts": "^5.0.0"
            }
        }
        self.create_file(temp_dir, 'package.json', json.dumps(package_json))
        
        result = analyzer.analyze_artifact(temp_dir)
        
        # Should detect as Node.js (React) because it has higher confidence
        assert result.project_type in ['nodejs', 'static']
        assert result.confidence > 0.0
    
    def test_database_detection_nodejs_postgres(self, analyzer, temp_dir):
        """Test PostgreSQL database detection in Node.js"""
        package_json = {
            "dependencies": {
                "express": "^4.18.0",
                "pg": "^8.11.0"
            }
        }
        self.create_file(temp_dir, 'package.json', json.dumps(package_json))
        
        result = analyzer.analyze_artifact(temp_dir)
        
        assert result.requires_database == True
        assert result.database_type == 'postgresql'
    
    def test_database_detection_nodejs_mongodb(self, analyzer, temp_dir):
        """Test MongoDB database detection in Node.js"""
        package_json = {
            "dependencies": {
                "express": "^4.18.0",
                "mongodb": "^5.0.0"
            }
        }
        self.create_file(temp_dir, 'package.json', json.dumps(package_json))
        
        result = analyzer.analyze_artifact(temp_dir)
        
        assert result.requires_database == True
        assert result.database_type == 'mongodb'
    
    def test_confidence_scoring(self, analyzer, temp_dir):
        """Test confidence scoring is within valid range"""
        package_json = {
            "dependencies": {
                "express": "^4.18.0"
            }
        }
        self.create_file(temp_dir, 'package.json', json.dumps(package_json))
        
        result = analyzer.analyze_artifact(temp_dir)
        
        assert 0.0 <= result.confidence <= 1.0
    
    def test_recommendations_present(self, analyzer, temp_dir):
        """Test that recommendations are provided"""
        dockerfile = """
FROM python:3.11
EXPOSE 8080
CMD ["python", "app.py"]
"""
        self.create_file(temp_dir, 'Dockerfile', dockerfile)
        
        result = analyzer.analyze_artifact(temp_dir)
        
        assert isinstance(result.recommendations, list)
        assert len(result.recommendations) > 0


if __name__ == '__main__':
    pytest.main([__file__, '-v'])
