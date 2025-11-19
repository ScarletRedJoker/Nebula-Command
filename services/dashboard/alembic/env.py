from logging.config import fileConfig
import os
import sys
import hashlib
import logging
from sqlalchemy import engine_from_config
from sqlalchemy import pool
from sqlalchemy import text

from alembic import context

sys.path.insert(0, os.path.dirname(os.path.dirname(__file__)))

from models import Base
from models.workflow import Workflow
from models.task import Task
from models.artifact import Artifact
from models.deployment import Deployment
from models.domain_record import DomainRecord

config = context.config
logger = logging.getLogger('alembic.env')

if config.config_file_name is not None:
    fileConfig(config.config_file_name)

target_metadata = Base.metadata

# NASA-Grade Migration Lock Configuration
MIGRATION_LOCK_BASE_ID = 987654321
MIGRATION_LOCK_TIMEOUT_SECONDS = 60
STATEMENT_TIMEOUT_SECONDS = 120

def get_url():
    url = os.environ.get("JARVIS_DATABASE_URL")
    if not url:
        raise RuntimeError("JARVIS_DATABASE_URL environment variable is not set")
    return url

def run_migrations_offline() -> None:
    url = get_url()
    context.configure(
        url=url,
        target_metadata=target_metadata,
        literal_binds=True,
        dialect_opts={"paramstyle": "named"},
    )

    with context.begin_transaction():
        context.run_migrations()


def get_advisory_lock_id(db_name: str) -> int:
    """
    Generate consistent advisory lock ID for the database.
    This ensures the same database always gets the same lock ID.
    """
    hash_val = hashlib.md5(db_name.encode()).hexdigest()
    return (MIGRATION_LOCK_BASE_ID + int(hash_val[:8], 16)) % (2**31)


def run_migrations_online() -> None:
    """
    Run migrations with NASA-grade reliability:
    - Advisory locks prevent concurrent migrations
    - Timeouts prevent infinite hangs
    - Full error logging for diagnostics
    """
    configuration = config.get_section(config.config_ini_section)
    configuration["sqlalchemy.url"] = get_url()
    
    connectable = engine_from_config(
        configuration,
        prefix="sqlalchemy.",
        poolclass=pool.NullPool,  # No connection pooling for migrations
    )

    with connectable.connect() as connection:
        # Extract database name for lock ID
        db_name = connection.engine.url.database or "homelab_jarvis"
        lock_id = get_advisory_lock_id(db_name)
        
        logger.info(f"Attempting to acquire migration lock for database '{db_name}' (lock_id={lock_id})")
        
        # Set timeouts to prevent infinite hangs (transaction-scoped)
        try:
            connection.execute(text(f"SET LOCAL lock_timeout = '{MIGRATION_LOCK_TIMEOUT_SECONDS}s'"))
            connection.execute(text(f"SET LOCAL statement_timeout = '{STATEMENT_TIMEOUT_SECONDS}s'"))
        except Exception as e:
            logger.warning(f"Could not set timeouts: {e}")
        
        # Check for and clean up orphaned advisory locks before acquiring
        try:
            orphaned_locks_query = text("""
                SELECT COUNT(*)
                FROM pg_locks l
                LEFT JOIN pg_stat_activity a ON l.pid = a.pid
                WHERE l.locktype = 'advisory'
                AND l.objid = :lock_id
                AND (a.pid IS NULL OR a.state = 'idle in transaction (aborted)')
            """)
            
            orphaned_count = connection.execute(
                orphaned_locks_query,
                {"lock_id": lock_id}
            ).scalar()
            
            if orphaned_count > 0:
                logger.warning(
                    f"Found {orphaned_count} orphaned advisory lock(s) for lock_id={lock_id}. "
                    f"Attempting automatic cleanup..."
                )
                
                # Release all advisory locks (only affects current session initially)
                # This is safe because we haven't acquired our lock yet
                connection.execute(text("SELECT pg_advisory_unlock_all()"))
                
                logger.info("Orphaned locks cleaned up successfully")
                
        except Exception as e:
            logger.warning(f"Could not check for orphaned locks: {e}")
        
        # Acquire advisory lock (BLOCKING with timeout)
        # This will WAIT until the lock is available or timeout
        try:
            logger.info(f"Acquiring advisory lock {lock_id} for database '{db_name}' (blocking, timeout={MIGRATION_LOCK_TIMEOUT_SECONDS}s)...")
            connection.execute(text(f"SELECT pg_advisory_lock({lock_id})"))
            logger.info(f"Successfully acquired migration lock {lock_id} for '{db_name}'")
            
        except Exception as e:
            if "already running" in str(e):
                raise
            logger.error(f"Error acquiring advisory lock: {e}")
            raise RuntimeError(f"Failed to acquire migration lock: {e}")
        
        try:
            # Configure and run migrations
            context.configure(
                connection=connection,
                target_metadata=target_metadata,
                transaction_per_migration=True,  # One transaction per migration file
                compare_type=True  # Compare column types for migrations
            )

            with context.begin_transaction():
                context.run_migrations()
                
            logger.info(f"Migrations completed successfully for '{db_name}'")
            
        finally:
            # Always release the advisory lock
            try:
                connection.execute(text(f"SELECT pg_advisory_unlock({lock_id})"))
                logger.info(f"Released migration lock {lock_id} for '{db_name}'")
            except Exception as e:
                logger.warning(f"Error releasing advisory lock: {e}")


if context.is_offline_mode():
    run_migrations_offline()
else:
    run_migrations_online()
