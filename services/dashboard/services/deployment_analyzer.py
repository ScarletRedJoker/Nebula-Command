import os
import json
import re
import logging
from typing import Optional, Dict, List, Any
from dataclasses import dataclass, asdict
from pathlib import Path

logger = logging.getLogger(__name__)

@dataclass
class AnalysisResult:
    """Result of deployment analysis"""
    project_type: str
    framework: Optional[str] = None
    runtime_version: Optional[str] = None
    build_command: Optional[str] = None
    start_command: str = ""
    port: int = 8000
    environment_vars: Dict[str, str] = None
    dependencies_file: Optional[str] = None
    static_files_dir: Optional[str] = None
    requires_database: bool = False
    database_type: Optional[str] = None
    confidence: float = 0.0
    recommendations: List[str] = None
    
    def __post_init__(self):
        if self.environment_vars is None:
            self.environment_vars = {}
        if self.recommendations is None:
            self.recommendations = []
    
    def to_dict(self) -> Dict[str, Any]:
        return asdict(self)


class DeploymentAnalyzer:
    """Analyzes uploaded artifacts to detect project type and deployment requirements"""
    
    def __init__(self):
        self.logger = logger
    
    def _calculate_evidence_score(self, result: AnalysisResult, artifact_path: str) -> float:
        """
        Calculate evidence-based confidence score
        
        Args:
            result: Analysis result to score
            artifact_path: Path to artifact
            
        Returns:
            Adjusted confidence score (0.0 to 1.0)
        """
        evidence_points = 0
        max_points = 10
        
        if result.dependencies_file and self._find_file(artifact_path, result.dependencies_file):
            evidence_points += 3
        
        if result.framework:
            evidence_points += 2
        
        if result.build_command:
            evidence_points += 1
        
        if result.start_command:
            evidence_points += 2
        
        if result.runtime_version:
            evidence_points += 1
        
        if result.requires_database:
            evidence_points += 1
        
        evidence_score = evidence_points / max_points
        base_confidence = result.confidence
        
        final_confidence = (base_confidence * 0.7) + (evidence_score * 0.3)
        
        return min(final_confidence, 1.0)
    
    def _reconcile_results(self, results: List[AnalysisResult], artifact_path: str) -> AnalysisResult:
        """
        Reconcile conflicting detector results using evidence-based scoring
        
        Args:
            results: List of detection results
            artifact_path: Path to artifact
            
        Returns:
            Best result based on evidence and confidence
        """
        if not results:
            return AnalysisResult(
                project_type='unknown',
                confidence=0.0,
                recommendations=['Could not determine project type. Please check your project structure.']
            )
        
        if len(results) == 1:
            result = results[0]
            result.confidence = self._calculate_evidence_score(result, artifact_path)
            return result
        
        scored_results = []
        for result in results:
            adjusted_score = self._calculate_evidence_score(result, artifact_path)
            scored_results.append((adjusted_score, result))
        
        scored_results.sort(key=lambda x: x[0], reverse=True)
        best_score, best_result = scored_results[0]
        
        if len(scored_results) > 1:
            second_score, second_result = scored_results[1]
            
            if abs(best_score - second_score) < 0.1:
                if best_result.project_type == 'docker' or second_result.project_type == 'docker':
                    docker_result = best_result if best_result.project_type == 'docker' else second_result
                    docker_result.confidence = best_score
                    return docker_result
                
                if best_result.dependencies_file and not second_result.dependencies_file:
                    best_result.confidence = best_score
                    return best_result
                elif second_result.dependencies_file and not best_result.dependencies_file:
                    second_result.confidence = second_score
                    return second_result
        
        best_result.confidence = best_score
        return best_result
    
    def analyze_artifact(self, artifact_path: str) -> AnalysisResult:
        """
        Main entry point - orchestrates all detection methods with evidence-based scoring
        
        Args:
            artifact_path: Path to the extracted artifact directory
            
        Returns:
            AnalysisResult with detection results
        """
        self.logger.info(f"Starting analysis of artifact: {artifact_path}")
        
        if not os.path.exists(artifact_path):
            raise ValueError(f"Artifact path does not exist: {artifact_path}")
        
        if os.path.isfile(artifact_path):
            artifact_path = os.path.dirname(artifact_path)
        
        detectors = [
            self.detect_dockerfile,
            self.detect_nodejs,
            self.detect_python,
            self.detect_php,
            self.detect_java,
            self.detect_go,
            self.detect_rust,
            self.detect_static_site,
        ]
        
        results = []
        for detector in detectors:
            try:
                result = detector(artifact_path)
                if result:
                    results.append(result)
                    self.logger.info(f"Detector {detector.__name__} found: {result.project_type} (base confidence: {result.confidence})")
            except Exception as e:
                self.logger.error(f"Error in detector {detector.__name__}: {e}")
        
        final_result = self._reconcile_results(results, artifact_path)
        self.logger.info(f"Final result: {final_result.project_type} with confidence {final_result.confidence:.2f}")
        
        return final_result
    
    def detect_dockerfile(self, artifact_path: str) -> Optional[AnalysisResult]:
        """Check for Dockerfile and docker-compose.yml"""
        has_dockerfile = self._find_file(artifact_path, 'Dockerfile')
        has_compose = self._find_file(artifact_path, 'docker-compose.yml') or self._find_file(artifact_path, 'docker-compose.yaml')
        
        if not has_dockerfile and not has_compose:
            return None
        
        port = 8000
        recommendations = []
        
        if has_dockerfile:
            dockerfile_path = has_dockerfile
            exposed_ports = self._extract_exposed_ports(dockerfile_path)
            if exposed_ports:
                port = exposed_ports[0]
            recommendations.append('Use Docker build strategy')
        
        if has_compose:
            recommendations.append('Use Docker Compose for multi-container deployment')
        
        return AnalysisResult(
            project_type='docker',
            framework='docker-compose' if has_compose else 'dockerfile',
            start_command='docker-compose up -d' if has_compose else 'docker run',
            port=port,
            dependencies_file='docker-compose.yml' if has_compose else 'Dockerfile',
            confidence=0.95,
            recommendations=recommendations
        )
    
    def detect_nodejs(self, artifact_path: str) -> Optional[AnalysisResult]:
        """Check for package.json, detect framework (Express, React, Vue, Next.js, etc.)"""
        package_json_path = self._find_file(artifact_path, 'package.json')
        if not package_json_path:
            return None
        
        try:
            with open(package_json_path, 'r') as f:
                package_data = json.load(f)
        except Exception as e:
            self.logger.error(f"Failed to parse package.json: {e}")
            return None
        
        dependencies = {**package_data.get('dependencies', {}), **package_data.get('devDependencies', {})}
        scripts = package_data.get('scripts', {})
        
        framework = None
        build_command = None
        start_command = 'npm start'
        port = 3000
        static_files_dir = None
        requires_database = False
        database_type = None
        confidence = 0.85
        recommendations = []
        
        if 'next' in dependencies:
            framework = 'next.js'
            build_command = 'npm run build'
            start_command = 'npm start'
            static_files_dir = '.next'
            port = 3000
            recommendations.append('Next.js detected - configure static export if needed')
        elif 'react' in dependencies:
            framework = 'react'
            if 'react-scripts' in dependencies:
                build_command = 'npm run build'
                start_command = 'npx serve -s build'
                static_files_dir = 'build'
                recommendations.append('React SPA - build to static files')
            else:
                build_command = scripts.get('build', 'npm run build')
        elif 'vue' in dependencies:
            framework = 'vue'
            build_command = 'npm run build'
            static_files_dir = 'dist'
            recommendations.append('Vue.js SPA - build to static files')
        elif '@angular/core' in dependencies:
            framework = 'angular'
            build_command = 'npm run build'
            static_files_dir = 'dist'
            recommendations.append('Angular SPA - build to static files')
        elif 'express' in dependencies:
            framework = 'express'
            start_command = scripts.get('start', 'node index.js')
            recommendations.append('Express backend detected')
        elif 'fastify' in dependencies:
            framework = 'fastify'
            start_command = scripts.get('start', 'node index.js')
        elif 'koa' in dependencies:
            framework = 'koa'
            start_command = scripts.get('start', 'node index.js')
        
        if 'start' in scripts:
            start_command = 'npm start'
        
        db_indicators = {
            'pg': 'postgresql',
            'postgres': 'postgresql',
            'postgresql': 'postgresql',
            'mysql': 'mysql',
            'mysql2': 'mysql',
            'mongodb': 'mongodb',
            'mongoose': 'mongodb',
            'sequelize': 'sql',
            'typeorm': 'sql',
            'prisma': 'sql',
            'knex': 'sql',
            '@prisma/client': 'sql'
        }
        
        for dep, db_type in db_indicators.items():
            if dep in dependencies:
                requires_database = True
                if database_type is None:
                    database_type = db_type
                self.logger.debug(f"Database dependency detected: {dep} -> {db_type}")
        
        runtime_version = package_data.get('engines', {}).get('node', '20')
        if runtime_version:
            runtime_version = re.sub(r'[^0-9.]', '', runtime_version).split('.')[0]
        
        return AnalysisResult(
            project_type='nodejs',
            framework=framework,
            runtime_version=runtime_version or '20',
            build_command=build_command,
            start_command=start_command,
            port=port,
            dependencies_file='package.json',
            static_files_dir=static_files_dir,
            requires_database=requires_database,
            database_type=database_type,
            confidence=confidence,
            recommendations=recommendations
        )
    
    def detect_python(self, artifact_path: str) -> Optional[AnalysisResult]:
        """Check for requirements.txt, setup.py, Pipfile, detect framework (Flask, Django, FastAPI)"""
        requirements_txt = self._find_file(artifact_path, 'requirements.txt')
        setup_py = self._find_file(artifact_path, 'setup.py')
        pipfile = self._find_file(artifact_path, 'Pipfile')
        
        if not any([requirements_txt, setup_py, pipfile]):
            return None
        
        dependencies_file = requirements_txt or pipfile or setup_py
        dependencies = set()
        
        if requirements_txt:
            try:
                with open(requirements_txt, 'r') as f:
                    for line in f:
                        line = line.strip().lower()
                        if line and not line.startswith('#'):
                            pkg = re.split(r'[=<>!]', line)[0].strip()
                            dependencies.add(pkg)
            except Exception as e:
                self.logger.error(f"Failed to parse requirements.txt: {e}")
        
        framework = None
        start_command = 'python app.py'
        port = 8000
        build_command = None
        requires_database = False
        database_type = None
        runtime_version = '3.11'
        recommendations = []
        
        if 'flask' in dependencies:
            framework = 'flask'
            port = 5000
            start_command = 'python app.py'
            if self._find_file(artifact_path, 'wsgi.py'):
                start_command = 'gunicorn --bind 0.0.0.0:5000 wsgi:app'
                recommendations.append('Use Gunicorn for production')
            elif self._find_file(artifact_path, 'app.py'):
                start_command = 'python app.py'
        elif 'django' in dependencies:
            framework = 'django'
            port = 8000
            if self._find_file(artifact_path, 'manage.py'):
                start_command = 'python manage.py runserver 0.0.0.0:8000'
                recommendations.append('Use Gunicorn with Django for production')
        elif 'fastapi' in dependencies:
            framework = 'fastapi'
            port = 8000
            start_command = 'uvicorn main:app --host 0.0.0.0 --port 8000'
            recommendations.append('FastAPI detected - Uvicorn recommended')
        
        db_indicators = {
            'psycopg2': 'postgresql',
            'psycopg2-binary': 'postgresql',
            'asyncpg': 'postgresql',
            'pymysql': 'mysql',
            'mysqlclient': 'mysql',
            'pymongo': 'mongodb',
            'motor': 'mongodb',
            'sqlalchemy': 'sql',
            'django': 'sql',
            'flask-sqlalchemy': 'sql'
        }
        
        for dep, db_type in db_indicators.items():
            if dep in dependencies:
                requires_database = True
                if database_type is None:
                    database_type = db_type
                self.logger.debug(f"Database dependency detected: {dep} -> {db_type}")
        
        return AnalysisResult(
            project_type='python',
            framework=framework,
            runtime_version=runtime_version,
            build_command=build_command,
            start_command=start_command,
            port=port,
            dependencies_file=os.path.basename(dependencies_file),
            requires_database=requires_database,
            database_type=database_type,
            confidence=0.9,
            recommendations=recommendations
        )
    
    def detect_static_site(self, artifact_path: str) -> Optional[AnalysisResult]:
        """Check for index.html and absence of backend code"""
        index_html = self._find_file(artifact_path, 'index.html')
        if not index_html:
            return None
        
        has_backend = any([
            self._find_file(artifact_path, 'package.json'),
            self._find_file(artifact_path, 'requirements.txt'),
            self._find_file(artifact_path, 'composer.json'),
            self._find_file(artifact_path, 'pom.xml'),
            self._find_file(artifact_path, 'go.mod'),
            self._find_file(artifact_path, 'Cargo.toml')
        ])
        
        if has_backend:
            confidence = 0.3
        else:
            confidence = 0.95
        
        return AnalysisResult(
            project_type='static',
            framework='html',
            start_command='serve -s .',
            port=8080,
            static_files_dir='.',
            confidence=confidence,
            recommendations=['Static site detected - can be served with nginx or any HTTP server']
        )
    
    def detect_php(self, artifact_path: str) -> Optional[AnalysisResult]:
        """Check for index.php, composer.json"""
        index_php = self._find_file(artifact_path, 'index.php')
        composer_json = self._find_file(artifact_path, 'composer.json')
        
        if not index_php and not composer_json:
            return None
        
        framework = None
        requires_database = False
        database_type = None
        
        if composer_json:
            try:
                with open(composer_json, 'r') as f:
                    composer_data = json.load(f)
                    dependencies = composer_data.get('require', {})
                    
                    if 'laravel/framework' in dependencies:
                        framework = 'laravel'
                    elif 'symfony/symfony' in dependencies:
                        framework = 'symfony'
                    elif 'codeigniter4/framework' in dependencies:
                        framework = 'codeigniter'
                    
                    if any(db in str(dependencies) for db in ['pdo', 'mysqli', 'doctrine']):
                        requires_database = True
                        database_type = 'mysql'
            except Exception as e:
                self.logger.error(f"Failed to parse composer.json: {e}")
        
        return AnalysisResult(
            project_type='php',
            framework=framework,
            runtime_version='8.2',
            start_command='php -S 0.0.0.0:8000',
            port=8000,
            dependencies_file='composer.json' if composer_json else None,
            requires_database=requires_database,
            database_type=database_type,
            confidence=0.85,
            recommendations=['PHP detected - consider using Apache or Nginx with PHP-FPM']
        )
    
    def detect_java(self, artifact_path: str) -> Optional[AnalysisResult]:
        """Check for pom.xml, build.gradle, detect Spring Boot"""
        pom_xml = self._find_file(artifact_path, 'pom.xml')
        build_gradle = self._find_file(artifact_path, 'build.gradle')
        
        if not pom_xml and not build_gradle:
            return None
        
        framework = None
        build_command = None
        start_command = 'java -jar target/*.jar'
        port = 8080
        requires_database = False
        
        if pom_xml:
            build_command = 'mvn clean package'
            try:
                with open(pom_xml, 'r') as f:
                    content = f.read()
                    if 'spring-boot' in content.lower():
                        framework = 'spring-boot'
                        port = 8080
                    if 'postgresql' in content.lower() or 'mysql' in content.lower():
                        requires_database = True
            except Exception as e:
                self.logger.error(f"Failed to parse pom.xml: {e}")
        
        if build_gradle:
            build_command = './gradlew build'
            start_command = 'java -jar build/libs/*.jar'
            try:
                with open(build_gradle, 'r') as f:
                    content = f.read()
                    if 'spring-boot' in content.lower():
                        framework = 'spring-boot'
            except Exception as e:
                self.logger.error(f"Failed to parse build.gradle: {e}")
        
        return AnalysisResult(
            project_type='java',
            framework=framework,
            runtime_version='17',
            build_command=build_command,
            start_command=start_command,
            port=port,
            dependencies_file='pom.xml' if pom_xml else 'build.gradle',
            requires_database=requires_database,
            confidence=0.9,
            recommendations=['Java project detected - requires JDK 17+']
        )
    
    def detect_go(self, artifact_path: str) -> Optional[AnalysisResult]:
        """Check for go.mod, main.go"""
        go_mod = self._find_file(artifact_path, 'go.mod')
        main_go = self._find_file(artifact_path, 'main.go')
        
        if not go_mod and not main_go:
            return None
        
        framework = None
        requires_database = False
        
        if go_mod:
            try:
                with open(go_mod, 'r') as f:
                    content = f.read().lower()
                    if 'gin-gonic/gin' in content:
                        framework = 'gin'
                    elif 'gorilla/mux' in content:
                        framework = 'gorilla'
                    elif 'fiber' in content:
                        framework = 'fiber'
                    
                    if any(db in content for db in ['pq', 'mysql', 'mongodb']):
                        requires_database = True
            except Exception as e:
                self.logger.error(f"Failed to parse go.mod: {e}")
        
        return AnalysisResult(
            project_type='go',
            framework=framework,
            runtime_version='1.21',
            build_command='go build -o app .',
            start_command='./app',
            port=8080,
            dependencies_file='go.mod' if go_mod else None,
            requires_database=requires_database,
            confidence=0.9,
            recommendations=['Go project detected - will be compiled to binary']
        )
    
    def detect_rust(self, artifact_path: str) -> Optional[AnalysisResult]:
        """Check for Cargo.toml"""
        cargo_toml = self._find_file(artifact_path, 'Cargo.toml')
        if not cargo_toml:
            return None
        
        framework = None
        requires_database = False
        
        try:
            with open(cargo_toml, 'r') as f:
                content = f.read().lower()
                if 'actix-web' in content:
                    framework = 'actix-web'
                elif 'rocket' in content:
                    framework = 'rocket'
                elif 'axum' in content:
                    framework = 'axum'
                
                if any(db in content for db in ['sqlx', 'diesel', 'mongodb']):
                    requires_database = True
        except Exception as e:
            self.logger.error(f"Failed to parse Cargo.toml: {e}")
        
        return AnalysisResult(
            project_type='rust',
            framework=framework,
            runtime_version='1.75',
            build_command='cargo build --release',
            start_command='./target/release/app',
            port=8080,
            dependencies_file='Cargo.toml',
            requires_database=requires_database,
            confidence=0.9,
            recommendations=['Rust project detected - will be compiled to optimized binary']
        )
    
    def _find_file(self, base_path: str, filename: str) -> Optional[str]:
        """
        Find a file in the artifact directory tree
        
        Args:
            base_path: Base directory to search
            filename: Name of file to find
            
        Returns:
            Full path to file if found, None otherwise
        """
        for root, dirs, files in os.walk(base_path):
            if filename in files:
                return os.path.join(root, filename)
        return None
    
    def _extract_exposed_ports(self, dockerfile_path: str) -> List[int]:
        """
        Extract EXPOSE directives from Dockerfile
        
        Args:
            dockerfile_path: Path to Dockerfile
            
        Returns:
            List of exposed ports
        """
        ports = []
        try:
            with open(dockerfile_path, 'r') as f:
                for line in f:
                    line = line.strip()
                    if line.startswith('EXPOSE'):
                        port_str = line.split()[1]
                        try:
                            ports.append(int(port_str.split('/')[0]))
                        except (ValueError, IndexError):
                            pass
        except Exception as e:
            self.logger.error(f"Failed to parse Dockerfile: {e}")
        
        return ports


deployment_analyzer = DeploymentAnalyzer()
