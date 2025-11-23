"""
Migration Readiness Checker - Prevents race conditions during database migrations
Ensures celery workers wait for dashboard to complete migrations before starting
"""
import logging
import time
import os
from sqlalchemy import create_engine, text
from services.db_url_resolver import get_database_url

logger = logging.getLogger(__name__)

class MigrationWaiter:
    """Waits for database migrations to complete before proceeding"""
    
    def __init__(self, timeout_seconds=300, check_interval=2):
        """
        Args:
            timeout_seconds: Maximum time to wait for migrations (default 5 minutes)
            check_interval: Seconds between migration readiness checks (default 2 seconds)
        """
        self.timeout_seconds = timeout_seconds
        self.check_interval = check_interval
        
    def wait_for_migrations(self) -> bool:
        """
        Wait for database migrations to complete.
        
        Returns:
            bool: True if migrations are complete, False if timeout
        """
        # Check if we should skip waiting (for dashboard service)
        if os.getenv('SKIP_MIGRATION_WAIT', 'false').lower() == 'true':
            logger.info("⏭️  Skipping migration wait (SKIP_MIGRATION_WAIT=true)")
            return True
            
        logger.info("=" * 60)
        logger.info("MIGRATION READINESS CHECK")
        logger.info("=" * 60)
        logger.info("Waiting for database migrations to complete...")
        
        try:
            database_url = get_database_url()
        except ValueError as e:
            logger.error(f"❌ Database URL not found: {e}")
            return False
        
        engine = None
        start_time = time.time()
        
        try:
            engine = create_engine(database_url, pool_pre_ping=True)
            
            while True:
                elapsed = time.time() - start_time
                
                if elapsed > self.timeout_seconds:
                    logger.error(f"❌ Migration wait timeout after {self.timeout_seconds}s")
                    return False
                
                try:
                    with engine.connect() as conn:
                        # Check if alembic_version table exists (created after first migration)
                        result = conn.execute(text("""
                            SELECT EXISTS (
                                SELECT FROM information_schema.tables 
                                WHERE table_name = 'alembic_version'
                            )
                        """))
                        
                        alembic_exists = result.scalar()
                        
                        if not alembic_exists:
                            logger.info(f"⏳ Waiting for migrations... ({int(elapsed)}s elapsed)")
                            time.sleep(self.check_interval)
                            continue
                        
                        # Check if there's a current revision (migrations have run)
                        result = conn.execute(text("SELECT version_num FROM alembic_version"))
                        current_revision = result.scalar()
                        
                        if current_revision:
                            logger.info(f"✅ Migrations complete! Current revision: {current_revision}")
                            logger.info(f"   Wait time: {int(elapsed)}s")
                            logger.info("=" * 60)
                            return True
                        else:
                            logger.info(f"⏳ Migrations in progress... ({int(elapsed)}s elapsed)")
                            time.sleep(self.check_interval)
                            
                except Exception as e:
                    # Database might not be ready yet - log at INFO for visibility
                    logger.info(f"⏳ Database not ready yet: {e} ({int(elapsed)}s elapsed)")
                    time.sleep(self.check_interval)
                    
        except Exception as e:
            logger.error(f"❌ Error during migration wait: {e}")
            return False
        finally:
            if engine:
                engine.dispose()
    
    def check_migrations_current(self) -> bool:
        """
        Quick check if migrations are up to date.
        
        Returns:
            bool: True if migrations are current
        """
        engine = None
        try:
            database_url = get_database_url()
            engine = create_engine(database_url, pool_pre_ping=True)
            
            with engine.connect() as conn:
                # Check if alembic_version exists and has a revision
                result = conn.execute(text("""
                    SELECT version_num FROM alembic_version 
                    WHERE version_num IS NOT NULL
                """))
                
                current_revision = result.scalar()
                return current_revision is not None
                
        except Exception as e:
            logger.error(f"Error checking migration status: {e}")
            return False
        finally:
            if engine:
                engine.dispose()

__all__ = ['MigrationWaiter']
