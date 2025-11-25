#!/usr/bin/env python3
"""
Wait for Database Schema Utility
Ensures all required database tables exist before Flask app starts.
Prevents "relation does not exist" errors during startup.
"""

import os
import sys
import time
import logging
from sqlalchemy import create_engine, text, inspect

logging.basicConfig(
    level=logging.INFO,
    format='%(asctime)s [%(levelname)s] %(message)s',
    handlers=[logging.StreamHandler(sys.stdout)]
)
logger = logging.getLogger(__name__)

REQUIRED_TABLES = [
    'marketplace_apps',
    'deployments', 
    'conversation_messages',
    'conversation_history',
    'activity_logs',
    'storage_stats',
    'backup_jobs',
    'agents',
]

def get_env(key: str, default: str = "") -> str:
    """Get environment variable with default."""
    return os.environ.get(key, default)

def get_database_url():
    """Get database URL from environment."""
    url = get_env('JARVIS_DATABASE_URL') or get_env('DATABASE_URL')
    if not url:
        logger.error("No database URL configured (JARVIS_DATABASE_URL or DATABASE_URL)")
        return None
    return url


def wait_for_postgres(engine, timeout: int = 60) -> bool:
    """Wait for PostgreSQL to accept connections."""
    logger.info("Waiting for PostgreSQL to be ready...")
    start = time.time()
    
    while (time.time() - start) < timeout:
        try:
            with engine.connect() as conn:
                conn.execute(text("SELECT 1"))
            logger.info("✓ PostgreSQL is accepting connections")
            return True
        except Exception as e:
            logger.debug(f"PostgreSQL not ready: {e}")
            time.sleep(2)
    
    logger.error(f"PostgreSQL not ready after {timeout}s")
    return False


def run_migrations():
    """Run Alembic migrations."""
    logger.info("Running database migrations...")
    import subprocess
    
    try:
        result = subprocess.run(
            ['alembic', 'upgrade', 'head'],
            cwd=os.path.dirname(__file__),
            capture_output=True,
            text=True,
            timeout=120,
            env={**os.environ, 'PYTHONPATH': os.path.dirname(__file__)}
        )
        
        if result.returncode == 0:
            logger.info("✓ Migrations completed successfully")
            if result.stdout:
                for line in result.stdout.strip().split('\n')[-5:]:
                    logger.info(f"  {line}")
            return True
        else:
            logger.error(f"Migration failed: {result.stderr}")
            return False
            
    except subprocess.TimeoutExpired:
        logger.error("Migration timed out")
        return False
    except Exception as e:
        logger.error(f"Migration error: {e}")
        return False


def check_tables(engine) -> list:
    """Check which required tables exist."""
    try:
        inspector = inspect(engine)
        existing = set(inspector.get_table_names())
        missing = [t for t in REQUIRED_TABLES if t not in existing]
        return missing
    except Exception as e:
        logger.error(f"Error checking tables: {e}")
        return REQUIRED_TABLES


def wait_for_schema(timeout: int = 120) -> bool:
    """
    Main entry point: wait for database and schema to be ready.
    """
    db_url = get_database_url()
    if not db_url:
        return False

    logger.info("=" * 60)
    logger.info("DATABASE SCHEMA READINESS CHECK")
    logger.info("=" * 60)

    try:
        engine = create_engine(db_url, pool_pre_ping=True)
        
        if not wait_for_postgres(engine, timeout=60):
            return False

        if os.environ.get('RUN_MIGRATIONS', 'true').lower() == 'true':
            if not run_migrations():
                logger.warning("Migrations may have failed, checking tables anyway...")

        logger.info("Verifying schema...")
        start = time.time()
        
        while (time.time() - start) < timeout:
            missing = check_tables(engine)
            
            if not missing:
                logger.info("=" * 60)
                logger.info("✅ ALL REQUIRED TABLES EXIST")
                logger.info("=" * 60)
                engine.dispose()
                return True
            
            elapsed = int(time.time() - start)
            logger.info(f"Waiting for tables ({elapsed}s): {', '.join(missing[:3])}{'...' if len(missing) > 3 else ''}")
            time.sleep(3)

        logger.error(f"Schema not ready after {timeout}s")
        missing = check_tables(engine)
        logger.error(f"Missing tables: {missing}")
        engine.dispose()
        return False

    except Exception as e:
        logger.error(f"Schema check failed: {e}")
        return False


if __name__ == '__main__':
    timeout = int(os.environ.get('SCHEMA_WAIT_TIMEOUT', '120'))
    skip = os.environ.get('SKIP_MIGRATION_WAIT', 'false').lower() == 'true'
    
    if skip:
        logger.info("SKIP_MIGRATION_WAIT=true, skipping schema check")
        sys.exit(0)
    
    success = wait_for_schema(timeout=timeout)
    sys.exit(0 if success else 1)
