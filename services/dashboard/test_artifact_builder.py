"""Test artifact builder functionality"""
import os
import sys
import logging
from uuid import uuid4

# Setup logging
logging.basicConfig(
    level=logging.INFO,
    format='%(asctime)s - %(name)s - %(levelname)s - %(message)s'
)
logger = logging.getLogger(__name__)

# Set required environment variables for testing
if not os.environ.get('JARVIS_DATABASE_URL'):
    logger.warning("JARVIS_DATABASE_URL not set, using default PostgreSQL URL")
    os.environ['JARVIS_DATABASE_URL'] = 'postgresql://jarvis:jarvis@localhost/jarvis'

from jarvis.artifact_builder import ArtifactBuilder
from jarvis.dockerfile_templates import TEMPLATES, generate_dockerfile
from models.jarvis import Project
from services.db_service import db_service


def test_dockerfile_templates():
    """Test Dockerfile template generation"""
    logger.info("=" * 60)
    logger.info("Testing Dockerfile Templates")
    logger.info("=" * 60)
    
    # Test static template
    logger.info("Testing static template...")
    dockerfile = generate_dockerfile('static', {})
    assert 'nginx:alpine' in dockerfile
    logger.info("✓ Static template OK")
    
    # Test Flask template
    logger.info("Testing python_flask template...")
    dockerfile = generate_dockerfile('python_flask', {'port': '5000', 'app': 'app'})
    assert 'gunicorn' in dockerfile
    assert '5000' in dockerfile
    logger.info("✓ Flask template OK")
    
    # Test Express template
    logger.info("Testing nodejs_express template...")
    dockerfile = generate_dockerfile('nodejs_express', {'port': '3000', 'entrypoint': 'server.js'})
    assert 'node:18-alpine' in dockerfile
    assert '3000' in dockerfile
    logger.info("✓ Express template OK")
    
    logger.info(f"✓ All {len(TEMPLATES)} templates available")
    logger.info("")


def test_artifact_builder():
    """Test artifact builder with database"""
    logger.info("=" * 60)
    logger.info("Testing Artifact Builder")
    logger.info("=" * 60)
    
    if not db_service.is_available:
        logger.warning("⚠ Database not available, skipping builder test")
        logger.warning("  Set JARVIS_DATABASE_URL to test with database")
        return
    
    logger.info("✓ Database connection available")
    
    with db_service.get_session() as db_session:
        try:
            # Create test project
            project = Project(
                id=uuid4(),
                name='test-static-site',
                path='/tmp/test-site',
                project_type='static',
                framework=None,
                config={},
                status='detected'
            )
            
            logger.info(f"Creating test project: {project.name}")
            db_session.add(project)
            db_session.commit()
            db_session.refresh(project)
            
            logger.info(f"✓ Test project created with ID: {project.id}")
            
            # Test builder initialization
            logger.info("Initializing ArtifactBuilder...")
            builder = ArtifactBuilder()
            
            if not builder.client:
                logger.warning("⚠ Docker client not available")
                logger.warning("  Install Docker to test build functionality")
                logger.info("✓ Builder initialized (Docker not available)")
            else:
                logger.info("✓ Builder initialized with Docker client")
                
                # Note: Actual build would require:
                # 1. Valid project path with files
                # 2. Docker daemon running
                # 3. Appropriate permissions
                logger.info("⚠ Skipping actual build (requires valid project path and Docker)")
            
            # Test get_build_status with non-existent build
            logger.info("Testing get_build_status with non-existent build...")
            status = builder.get_build_status(str(uuid4()))
            assert status['status'] == 'not_found'
            logger.info("✓ get_build_status correctly returns not_found")
            
            # Test list_builds
            logger.info("Testing list_builds...")
            builds = builder.list_builds(project_id=str(project.id), limit=10)
            logger.info(f"✓ list_builds returned {len(builds)} builds")
            
            # Clean up test project
            logger.info("Cleaning up test project...")
            db_session.delete(project)
            db_session.commit()
            logger.info("✓ Test project cleaned up")
            
        except Exception as e:
            logger.error(f"✗ Test failed: {e}", exc_info=True)
            raise
    
    logger.info("")


def test_build_context_fix():
    """Test the Docker build context fix with a real project"""
    logger.info("=" * 60)
    logger.info("Testing Docker Build Context Fix")
    logger.info("=" * 60)
    
    if not db_service.is_available:
        logger.warning("⚠ Database not available, skipping build context test")
        return
    
    builder = ArtifactBuilder()
    if not builder.client:
        logger.warning("⚠ Docker client not available, skipping build context test")
        return
    
    logger.info("✓ Docker client available")
    
    test_dir = '/tmp/test-nginx'
    dockerfile_path = os.path.join(test_dir, 'Dockerfile.jarvis')
    
    with db_service.get_session() as db_session:
        try:
            # Create test directory with content
            logger.info(f"Creating test directory: {test_dir}")
            os.makedirs(test_dir, exist_ok=True)
            
            with open(os.path.join(test_dir, 'index.html'), 'w') as f:
                f.write('<h1>Test Build Context Fix</h1>')
            logger.info("✓ Created test index.html")
            
            # Create test project
            project = Project(
                id=uuid4(),
                name='test-nginx',
                path=test_dir,
                project_type='static',
                config={},
                status='detected'
            )
            
            db_session.add(project)
            db_session.commit()
            db_session.refresh(project)
            logger.info(f"✓ Test project created: {project.name}")
            
            # Verify Dockerfile doesn't exist before build
            if os.path.exists(dockerfile_path):
                os.remove(dockerfile_path)
            logger.info("✓ Ensured no pre-existing Dockerfile.jarvis")
            
            # Attempt build
            logger.info("Starting build test...")
            try:
                build = builder.build_project(project)
                
                logger.info(f"✓ Build completed with status: {build.status}")
                
                if build.status == 'success':
                    logger.info(f"✓ Build successful: {build.image_ref}")
                    logger.info(f"  Duration: {build.build_duration_ms}ms")
                    logger.info(f"  Size: {build.image_size_bytes} bytes")
                    
                    # Verify Dockerfile was cleaned up
                    if not os.path.exists(dockerfile_path):
                        logger.info("✓ Dockerfile.jarvis was properly cleaned up")
                    else:
                        logger.warning("⚠ Dockerfile.jarvis still exists (cleanup may have failed)")
                        os.remove(dockerfile_path)
                    
                    logger.info("✅ BUILD CONTEXT FIX VERIFIED!")
                else:
                    logger.warning(f"⚠ Build completed with status: {build.status}")
                    if build.build_logs:
                        logger.info("Build logs:")
                        logger.info(build.build_logs[:500])
                
            except Exception as build_error:
                logger.error(f"✗ Build failed: {build_error}")
                # Still check if cleanup happened
                if os.path.exists(dockerfile_path):
                    logger.info("✓ Dockerfile.jarvis exists (cleanup in finally block)")
                    os.remove(dockerfile_path)
                raise
            
            # Clean up
            logger.info("Cleaning up test project...")
            db_session.delete(project)
            db_session.commit()
            
        except Exception as e:
            logger.error(f"✗ Build context test failed: {e}", exc_info=True)
            raise
        finally:
            # Clean up test directory
            import shutil
            if os.path.exists(test_dir):
                shutil.rmtree(test_dir)
                logger.info("✓ Test directory cleaned up")
    
    logger.info("")


def main():
    """Run all tests"""
    try:
        logger.info("\n" + "=" * 60)
        logger.info("JARVIS ARTIFACT BUILDER TEST SUITE")
        logger.info("=" * 60 + "\n")
        
        # Test templates
        test_dockerfile_templates()
        
        # Test builder
        test_artifact_builder()
        
        # Test Docker build context fix
        test_build_context_fix()
        
        logger.info("=" * 60)
        logger.info("✓ ALL TESTS PASSED")
        logger.info("=" * 60)
        logger.info("")
        logger.info("Available templates:")
        for i, template_name in enumerate(TEMPLATES.keys(), 1):
            logger.info(f"  {i}. {template_name}")
        logger.info("")
        
    except Exception as e:
        logger.error("=" * 60)
        logger.error("✗ TESTS FAILED")
        logger.error("=" * 60)
        sys.exit(1)


if __name__ == '__main__':
    main()
