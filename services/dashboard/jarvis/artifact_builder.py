"""Artifact Builder - Docker image generation and registry management"""
import os
import logging
import docker
from docker.errors import BuildError, APIError, DockerException
from datetime import datetime
from typing import Dict, Optional
from .dockerfile_templates import generate_dockerfile
from models.jarvis import ArtifactBuild, Project
from services.db_service import db_service

logger = logging.getLogger(__name__)


class ArtifactBuilder:
    """Builds Docker images from project templates"""
    
    def __init__(self, registry_url: str = "localhost:5000"):
        """Initialize artifact builder
        
        Args:
            registry_url: Docker registry URL for pushing images
        """
        try:
            self.client = docker.from_env()
            logger.info("Docker client initialized successfully")
        except DockerException as e:
            logger.error(f"Failed to initialize Docker client: {e}")
            self.client = None
        
        self.registry_url = registry_url
        
    def build_project(self, project: Project, workflow_id: Optional[str] = None) -> ArtifactBuild:
        """Build Docker image for a project
        
        Args:
            project: Project model instance to build
            workflow_id: Optional workflow ID to associate with build
            
        Returns:
            ArtifactBuild model instance with build results
            
        Raises:
            ValueError: If Docker client not available or project invalid
            BuildError: If Docker build fails
            APIError: If Docker API error occurs
        """
        if not self.client:
            raise ValueError("Docker client not available")
            
        if not db_service.is_available:
            raise ValueError("Database not available")
        
        # Initialize build record FIRST
        build = None
        dockerfile_path = None
        
        with db_service.get_session() as db_session:
            try:
                # Create artifact build record
                build = ArtifactBuild(
                    project_id=project.id,
                    workflow_id=workflow_id,
                    status='building',
                    image_tag='latest'
                )
                db_session.add(build)
                db_session.commit()
                db_session.refresh(build)
                
                logger.info(f"Starting build for project {project.name} (ID: {project.id})")
                
                # Generate Dockerfile
                dockerfile_content = generate_dockerfile(
                    project.project_type,
                    project.config or {}
                )
                build.dockerfile_content = dockerfile_content
                db_session.commit()
                
                # Build image
                image_name = f"{project.name}".lower().replace(' ', '-').replace('_', '-')
                image_ref = f"{self.registry_url}/{image_name}:latest"
                
                start_time = datetime.utcnow()
                
                # Write generated Dockerfile to project directory
                dockerfile_path = os.path.join(project.path, 'Dockerfile.jarvis')
                with open(dockerfile_path, 'w') as f:
                    f.write(dockerfile_content)
                
                logger.info(f"Building Docker image: {image_ref}")
                
                # Build image using Docker SDK
                try:
                    image, build_logs_generator = self.client.images.build(
                        path=project.path,
                        dockerfile='Dockerfile.jarvis',
                        tag=image_ref,
                        rm=True,
                        pull=True,
                        decode=True
                    )
                except BuildError as e:
                    # Docker SDK raised BuildError - logs are in e.build_log
                    raise
                
                # Collect build logs from generator
                build_logs_list = []
                for log in build_logs_generator:
                    if 'stream' in log:
                        build_logs_list.append(log['stream'])
                    # Don't raise here - let Docker SDK handle errors
                
                end_time = datetime.utcnow()
                build_duration = int((end_time - start_time).total_seconds() * 1000)
                
                # Update build record with success
                build.status = 'success'
                build.image_ref = image_ref
                build.build_duration_ms = build_duration
                build.image_size_bytes = image.attrs.get('Size', 0) if image else 0
                build.build_logs = ''.join(build_logs_list)
                build.completed_at = datetime.utcnow()
                build.build_metadata = {
                    'image_id': image.id if image else None,
                    'layers': len(image.attrs.get('RootFS', {}).get('Layers', [])) if image else 0,
                    'created': image.attrs.get('Created') if image else None
                }
                
                db_session.commit()
                
                logger.info(f"Build successful: {image_ref} (Duration: {build_duration}ms, Size: {build.image_size_bytes} bytes)")
                
                # Push to registry ONLY after successful build
                try:
                    self._push_to_registry(image_ref)
                except Exception as e:
                    logger.warning(f"Failed to push to registry: {e}")
                    # Don't fail the build if push fails
                
                return build
                
            except Exception as e:
                # Handle ALL build failures (BuildError, APIError, DockerException, filesystem errors, etc.)
                if build:
                    build.status = 'failed'
                    build.build_logs = str(e)
                    build.completed_at = datetime.utcnow()
                    db_session.commit()
                
                logger.error(f"Build failed for project {project.name}: {type(e).__name__}: {e}")
                raise
                
            finally:
                # ALWAYS clean up generated Dockerfile
                if dockerfile_path and os.path.exists(dockerfile_path):
                    try:
                        os.remove(dockerfile_path)
                        logger.info(f"Cleaned up {dockerfile_path}")
                    except Exception as e:
                        logger.warning(f"Failed to cleanup Dockerfile: {e}")
            
    def _push_to_registry(self, image_ref: str):
        """Push image to local registry
        
        Args:
            image_ref: Full image reference (registry/name:tag)
            
        Raises:
            APIError: If push fails
        """
        try:
            logger.info(f"Pushing image to registry: {image_ref}")
            for line in self.client.images.push(image_ref, stream=True, decode=True):
                if 'error' in line:
                    raise APIError(line['error'])
            logger.info(f"Successfully pushed {image_ref} to registry")
        except Exception as e:
            logger.error(f"Failed to push to registry: {e}")
            raise
            
    def get_build_status(self, build_id: str) -> Dict:
        """Get build status
        
        Args:
            build_id: UUID of the build
            
        Returns:
            Dictionary with build status information
        """
        if not db_service.is_available:
            return {'status': 'database_unavailable'}
        
        with db_service.get_session() as db_session:
            build = db_session.query(ArtifactBuild).filter_by(id=build_id).first()
            if not build:
                return {'status': 'not_found'}
                
            return {
                'status': build.status,
                'image_ref': build.image_ref,
                'build_duration_ms': build.build_duration_ms,
                'image_size_bytes': build.image_size_bytes,
                'logs': build.build_logs
            }
    
    def list_builds(self, project_id: Optional[str] = None, limit: int = 10) -> list:
        """List recent builds
        
        Args:
            project_id: Optional project ID to filter by
            limit: Maximum number of builds to return
            
        Returns:
            List of build dictionaries
        """
        if not db_service.is_available:
            return []
        
        with db_service.get_session() as db_session:
            query = db_session.query(ArtifactBuild)
            
            if project_id:
                query = query.filter_by(project_id=project_id)
            
            builds = query.order_by(ArtifactBuild.created_at.desc()).limit(limit).all()
            
            return [build.to_dict() for build in builds]
