#!/usr/bin/env python3
"""
Example usage of the Deployment Analyzer Service

This script demonstrates how to use the deployment analyzer to detect
project types and get deployment recommendations.
"""

import sys
import os
import json
from pathlib import Path

# Add parent directory to path
sys.path.insert(0, os.path.join(os.path.dirname(__file__), '..'))

from services.deployment_analyzer import deployment_analyzer


def analyze_example_project(project_path: str):
    """Analyze a project and print results"""
    print(f"\n{'='*80}")
    print(f"Analyzing: {project_path}")
    print(f"{'='*80}\n")
    
    if not os.path.exists(project_path):
        print(f"❌ Error: Path does not exist: {project_path}")
        return
    
    try:
        result = deployment_analyzer.analyze_artifact(project_path)
        
        print(f"✅ Analysis Complete!")
        print(f"\n📋 Detection Results:")
        print(f"  Project Type: {result.project_type.upper()}")
        print(f"  Framework: {result.framework or 'N/A'}")
        print(f"  Runtime Version: {result.runtime_version or 'N/A'}")
        print(f"  Confidence: {result.confidence * 100:.1f}%")
        
        print(f"\n🔧 Deployment Configuration:")
        print(f"  Port: {result.port}")
        print(f"  Build Command: {result.build_command or 'None required'}")
        print(f"  Start Command: {result.start_command}")
        print(f"  Dependencies File: {result.dependencies_file or 'N/A'}")
        print(f"  Static Files Dir: {result.static_files_dir or 'N/A'}")
        
        if result.requires_database:
            print(f"\n🗄️  Database Requirements:")
            print(f"  Requires Database: YES")
            print(f"  Database Type: {result.database_type or 'Unknown'}")
        else:
            print(f"\n🗄️  Database Requirements: NO")
        
        if result.recommendations:
            print(f"\n💡 Recommendations:")
            for i, rec in enumerate(result.recommendations, 1):
                print(f"  {i}. {rec}")
        
        print(f"\n📄 Full JSON Result:")
        print(json.dumps(result.to_dict(), indent=2))
        
    except Exception as e:
        print(f"❌ Error during analysis: {e}")
        import traceback
        traceback.print_exc()


def main():
    """Main example function"""
    print("=" * 80)
    print("Deployment Analyzer - Example Usage")
    print("=" * 80)
    
    # Check if a path was provided
    if len(sys.argv) > 1:
        project_path = sys.argv[1]
        analyze_example_project(project_path)
    else:
        print("\nUsage: python analysis_example.py <project_path>")
        print("\nExample projects to try:")
        print("  - Any React app directory")
        print("  - Any Flask/Django app directory")
        print("  - Any directory with a Dockerfile")
        print("  - Any static website directory\n")
        
        # Example: Analyze current directory
        current_dir = os.getcwd()
        print(f"\nAnalyzing current directory: {current_dir}")
        analyze_example_project(current_dir)


def example_react_analysis():
    """Example: Analyze a React project"""
    import tempfile
    import shutil
    
    temp_dir = tempfile.mkdtemp()
    
    try:
        # Create mock React project structure
        package_json = {
            "name": "example-react-app",
            "version": "1.0.0",
            "dependencies": {
                "react": "^18.0.0",
                "react-dom": "^18.0.0",
                "react-scripts": "^5.0.0"
            },
            "scripts": {
                "start": "react-scripts start",
                "build": "react-scripts build",
                "test": "react-scripts test"
            }
        }
        
        os.makedirs(os.path.join(temp_dir, 'src'), exist_ok=True)
        os.makedirs(os.path.join(temp_dir, 'public'), exist_ok=True)
        
        with open(os.path.join(temp_dir, 'package.json'), 'w') as f:
            json.dump(package_json, f, indent=2)
        
        with open(os.path.join(temp_dir, 'src', 'App.js'), 'w') as f:
            f.write('import React from "react";\n\nfunction App() {\n  return <div>Hello World</div>;\n}\n')
        
        analyze_example_project(temp_dir)
        
    finally:
        shutil.rmtree(temp_dir)


def example_flask_analysis():
    """Example: Analyze a Flask project"""
    import tempfile
    import shutil
    
    temp_dir = tempfile.mkdtemp()
    
    try:
        # Create mock Flask project structure
        requirements = """
flask==2.3.0
gunicorn==20.1.0
psycopg2-binary==2.9.0
python-dotenv==1.0.0
"""
        
        with open(os.path.join(temp_dir, 'requirements.txt'), 'w') as f:
            f.write(requirements)
        
        app_py = """
from flask import Flask, jsonify

app = Flask(__name__)

@app.route('/')
def index():
    return jsonify({'message': 'Hello World'})

if __name__ == '__main__':
    app.run(host='0.0.0.0', port=5000)
"""
        
        with open(os.path.join(temp_dir, 'app.py'), 'w') as f:
            f.write(app_py)
        
        analyze_example_project(temp_dir)
        
    finally:
        shutil.rmtree(temp_dir)


def example_docker_analysis():
    """Example: Analyze a Docker project"""
    import tempfile
    import shutil
    
    temp_dir = tempfile.mkdtemp()
    
    try:
        # Create mock Docker project
        dockerfile = """
FROM python:3.11-slim

WORKDIR /app

COPY requirements.txt .
RUN pip install --no-cache-dir -r requirements.txt

COPY . .

EXPOSE 8000

CMD ["uvicorn", "main:app", "--host", "0.0.0.0", "--port", "8000"]
"""
        
        docker_compose = """
version: '3.8'

services:
  web:
    build: .
    ports:
      - "8000:8000"
    environment:
      - DATABASE_URL=postgresql://user:pass@db:5432/mydb
    depends_on:
      - db
  
  db:
    image: postgres:14
    environment:
      - POSTGRES_USER=user
      - POSTGRES_PASSWORD=pass
      - POSTGRES_DB=mydb
"""
        
        with open(os.path.join(temp_dir, 'Dockerfile'), 'w') as f:
            f.write(dockerfile)
        
        with open(os.path.join(temp_dir, 'docker-compose.yml'), 'w') as f:
            f.write(docker_compose)
        
        analyze_example_project(temp_dir)
        
    finally:
        shutil.rmtree(temp_dir)


def run_all_examples():
    """Run all example analyses"""
    print("\n" + "="*80)
    print("Running All Example Analyses")
    print("="*80)
    
    print("\n\n📦 Example 1: React Application")
    example_react_analysis()
    
    print("\n\n🐍 Example 2: Flask Application")
    example_flask_analysis()
    
    print("\n\n🐳 Example 3: Docker Application")
    example_docker_analysis()
    
    print("\n\n✅ All examples completed!")


if __name__ == '__main__':
    if len(sys.argv) > 1 and sys.argv[1] == '--examples':
        run_all_examples()
    else:
        main()
